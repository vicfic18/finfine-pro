"""Authenticated HTTP interface for the FinFine agent."""

from __future__ import annotations

import asyncio
import hashlib
import inspect
import logging
from functools import lru_cache
from pathlib import Path
from threading import Event
from typing import Annotated, Any, Awaitable, Callable, Literal
from uuid import UUID, uuid4

import boto3
import uvicorn
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from strands.session import SnapshotSessionManager
from strands.storage import S3Storage

from finfine_agent.agent import AgentCancelledError, ask_async, create_agent
from finfine_agent.auth import AuthenticatedPrincipal, AuthenticationError, CognitoAccessTokenValidator
from finfine_agent.config import AgentSettings, RuntimeSettings
from finfine_agent.sessions import CompletedResult, RequestConflictError, S3SessionRegistry, SessionLockPool, SessionRecord, SessionUnavailableError

logger = logging.getLogger(__name__)
Question = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4_000)]
Answerer = Callable[..., str | Awaitable[str]]


class RuntimeInvocation(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    prompt: Question
    request_id: UUID = Field(alias="requestId")
    session_id: UUID | None = Field(default=None, alias="sessionId")


class AgentAnswer(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    status: Literal["success"] = "success"
    request_id: UUID = Field(alias="requestId")
    session_id: UUID = Field(alias="sessionId")
    answer: str


class AgentError(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    status: Literal["error"] = "error"
    request_id: UUID = Field(alias="requestId")
    code: str
    message: str


class RuntimeHealthResponse(BaseModel):
    status: Literal["Healthy"] = "Healthy"


class RuntimeService:
    """Coordinate auth-scoped sessions, idempotency, and agent execution."""

    def __init__(self, settings: RuntimeSettings, *, registry: S3SessionRegistry | None = None, lock_pool: SessionLockPool | None = None) -> None:
        self.settings = settings
        self.registry = registry or S3SessionRegistry(settings)
        self.lock_pool = lock_pool or SessionLockPool()

    async def invoke(self, request: RuntimeInvocation, principal: AuthenticatedPrincipal, answerer: Answerer, http_request: Request | None = None) -> AgentAnswer:
        record = self.registry.resolve(subject=principal.subject, public_id=request.session_id)
        prompt_hash = hashlib.sha256(request.prompt.encode()).hexdigest()
        request_id = str(request.request_id)
        existing = self.registry.get_completed(request_id=request_id, subject=principal.subject, session_id=record.public_id, prompt_hash=prompt_hash)
        if existing is not None:
            return AgentAnswer(requestId=request.request_id, sessionId=UUID(existing.session_id), answer=existing.answer)
        async with self.lock_pool.get(record.storage_id):
            existing = self.registry.get_completed(request_id=request_id, subject=principal.subject, session_id=record.public_id, prompt_hash=prompt_hash)
            if existing is not None:
                return AgentAnswer(requestId=request.request_id, sessionId=UUID(existing.session_id), answer=existing.answer)
            answer = await self._call_answerer(answerer, request.prompt, record=record, request_id=request_id, http_request=http_request)
            completed = self.registry.put_completed(CompletedResult(request_id, record.public_id, prompt_hash, answer), subject=principal.subject)
            self.registry.touch(record)
            return AgentAnswer(requestId=request.request_id, sessionId=UUID(completed.session_id), answer=completed.answer)

    async def _call_answerer(self, answerer: Answerer, question: str, *, record: SessionRecord, request_id: str, http_request: Request | None) -> str:
        kwargs: dict[str, Any] = {}
        try:
            parameters = inspect.signature(answerer).parameters
        except (TypeError, ValueError):
            parameters = {}
        if "session_record" in parameters:
            kwargs["session_record"] = record
        if "request_id" in parameters:
            kwargs["request_id"] = request_id
        if "runtime_settings" in parameters:
            kwargs["runtime_settings"] = self.settings
        if "http_request" in parameters:
            kwargs["http_request"] = http_request
        result = answerer(question, **kwargs)
        if inspect.isawaitable(result):
            return str(await result)
        return str(result)


@lru_cache(maxsize=4)
def get_runtime_service(settings: RuntimeSettings) -> RuntimeService:
    """Reuse one S3 client and bounded lock pool per runtime configuration."""
    return RuntimeService(settings)


async def run_agent_question(question: str, *, session_record: SessionRecord, request_id: str, runtime_settings: RuntimeSettings, http_request: Request | None = None) -> str:
    """Build a fresh agent for this request and persist through Strands S3 storage."""
    agent_settings = AgentSettings.from_environment()
    boto_session = boto3.Session(profile_name=runtime_settings.aws_profile, region_name=runtime_settings.session_region)
    # The Strands S3Storage API accepts either a region override or a
    # pre-configured boto session, not both. The session carries both the
    # configured AWS profile and the session region, so use it as the single
    # source of connection configuration.
    storage = S3Storage(
        runtime_settings.session_bucket,
        prefix=runtime_settings.session_prefix,
        boto_session=boto_session,
    )
    manager = SnapshotSessionManager(session_record.storage_id, storage=storage)
    agent = create_agent(agent_settings, session_manager=manager, trace=False)
    cancel_signal = Event()
    disconnect_task: asyncio.Task[None] | None = None
    if http_request is not None:
        disconnect_task = asyncio.create_task(_watch_disconnect(http_request, cancel_signal, agent))
    try:
        return await ask_async(agent, question, request_id=request_id, timeout_seconds=runtime_settings.request_timeout_seconds, cancel_signal=cancel_signal)
    finally:
        if disconnect_task is not None:
            disconnect_task.cancel()
        cleanup = getattr(agent, "cleanup", None)
        if cleanup is not None:
            cleanup()


async def _watch_disconnect(request: Request, signal: Event, agent: Any) -> None:
    while not signal.is_set():
        if await request.is_disconnected():
            signal.set()
            cancel = getattr(agent, "cancel", None)
            if cancel is not None:
                cancel()
            return
        await asyncio.sleep(0.25)


def _error_response(*, code: str, message: str, status_code: int, request_id: UUID | None = None) -> JSONResponse:
    body = AgentError(requestId=request_id or uuid4(), code=code, message=message)
    return JSONResponse(status_code=status_code, content=body.model_dump(by_alias=True, mode="json"))


def _public_error(exc: Exception) -> tuple[str, str, int]:
    if isinstance(exc, AuthenticationError):
        return "AUTHENTICATION_REQUIRED", "Authentication is required.", 401
    if isinstance(exc, SessionUnavailableError):
        return "SESSION_UNAVAILABLE", "The requested session is unavailable.", 409
    if isinstance(exc, RequestConflictError):
        return "REQUEST_ID_CONFLICT", "The request ID was already used for a different request.", 409
    if isinstance(exc, TimeoutError):
        return "REQUEST_TIMEOUT", "The agent took too long to complete the request.", 504
    if isinstance(exc, AgentCancelledError):
        return "REQUEST_CANCELLED", "The request was cancelled before completion.", 499
    if "ResourceNotFoundException" in str(exc):
        return "AGENT_DEPENDENCY_UNAVAILABLE", "The agent dependency is unavailable.", 503
    logger.exception("Agent API request failed")
    return "AGENT_UNAVAILABLE", "The agent could not complete the request.", 503


load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)
app = FastAPI(title="FinFine Agent API", version="0.1.0", description="Authenticated HTTP interface for the FinFine financial agent.", docs_url=None, redoc_url=None, openapi_url=None)


def get_runtime_settings() -> RuntimeSettings:
    return RuntimeSettings.from_environment()


@lru_cache(maxsize=4)
def _cached_token_validator(
    issuer: str,
    client_id: str,
) -> CognitoAccessTokenValidator:
    """Reuse PyJWT's bounded JWKS cache across requests."""
    return CognitoAccessTokenValidator(issuer=issuer, client_id=client_id)


def get_token_validator(settings: Annotated[RuntimeSettings, Depends(get_runtime_settings)]) -> CognitoAccessTokenValidator:
    return _cached_token_validator(settings.cognito_issuer, settings.cognito_client_id)


async def get_current_principal(request: Request, validator: Annotated[CognitoAccessTokenValidator, Depends(get_token_validator)]) -> AuthenticatedPrincipal:
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise AuthenticationError("authentication is required")
    return validator.validate(token.strip())


async def get_answerer() -> Answerer:
    return run_agent_question


@app.exception_handler(AuthenticationError)
async def authentication_error_handler(_request: Request, _exc: AuthenticationError) -> JSONResponse:
    return _error_response(code="AUTHENTICATION_REQUIRED", message="Authentication is required.", status_code=401)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_request: Request, _exc: RequestValidationError) -> JSONResponse:
    return _error_response(code="INVALID_REQUEST", message="The request is invalid.", status_code=422)


@app.get("/ping", response_model=RuntimeHealthResponse)
async def runtime_health() -> RuntimeHealthResponse:
    return RuntimeHealthResponse()


@app.post("/invocations", response_model=AgentAnswer)
async def invoke_runtime(request: RuntimeInvocation, principal: Annotated[AuthenticatedPrincipal, Depends(get_current_principal)], answerer: Annotated[Answerer, Depends(get_answerer)], runtime_settings: Annotated[RuntimeSettings, Depends(get_runtime_settings)], http_request: Request) -> AgentAnswer | JSONResponse:
    try:
        return await get_runtime_service(runtime_settings).invoke(request, principal, answerer, http_request)
    except Exception as exc:
        code, message, status_code = _public_error(exc)
        return _error_response(code=code, message=message, status_code=status_code, request_id=request.request_id)


def main() -> None:
    uvicorn.run(app, host="0.0.0.0", port=8080)


if __name__ == "__main__":
    main()
