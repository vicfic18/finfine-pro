"""Authenticated HTTP interface for the FinFine agent."""

from __future__ import annotations

import asyncio
import hashlib
import inspect
import json
import logging
import os
from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from threading import Event
from typing import Annotated, Any, Literal
from uuid import UUID, uuid4

import boto3
import uvicorn
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from strands.session import SnapshotSessionManager
from strands.storage import S3Storage

from finfine_agent.agent import AgentCancelledError, ask_async, create_agent
from finfine_agent.auth import (
    AuthenticatedPrincipal,
    AuthenticationError,
    CognitoAccessTokenValidator,
)
from finfine_agent.config import AgentSettings, RuntimeSettings, VoiceSettings
from finfine_agent.sessions import (
    CompletedResult,
    Conversation,
    ConversationNotFoundError,
    ConversationSummary,
    RequestConflictError,
    S3SessionRegistry,
    SessionLockPool,
    SessionRecord,
    SessionUnavailableError,
    VisibleMessage,
)
from finfine_agent.speech_modes import VoiceMode
from finfine_agent.streaming import stream_agent
from finfine_agent.voice import (
    VoiceConfigurationError,
    VoiceError,
    synthesize_speech,
    transcribe_audio,
    validate_polly_configuration,
)

LOG_LEVEL_NAME = os.getenv("LOG_LEVEL", "INFO").upper()
LOG_LEVEL = getattr(logging, LOG_LEVEL_NAME, logging.INFO)
logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)
logger.setLevel(LOG_LEVEL)
if LOG_LEVEL == logging.DEBUG:
    logging.getLogger("botocore").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
Question = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4_000)]
Answerer = Callable[..., str | Awaitable[str]]
EventStreamer = Callable[..., AsyncIterator[dict[str, Any]]]


class RuntimeInvocation(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    prompt: Question
    request_id: UUID = Field(alias="requestId")
    session_id: UUID | None = Field(default=None, alias="sessionId")
    speech_mode: VoiceMode | None = Field(default=None, alias="speechMode")


class VoiceSynthesisRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")
    session_id: UUID = Field(alias="sessionId")
    request_id: UUID = Field(alias="requestId")
    mode: VoiceMode


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


class VisibleMessageResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    role: Literal["user", "assistant"]
    content: str
    status: Literal["complete"] = "complete"
    created_at: datetime = Field(alias="createdAt")
    request_id: UUID = Field(alias="requestId")


class ConversationSummaryResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    session_id: UUID = Field(alias="sessionId")
    title: str
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class ConversationDetailResponse(ConversationSummaryResponse):
    messages: list[VisibleMessageResponse]


class ConversationListResponse(BaseModel):
    status: Literal["success"] = "success"
    conversations: list[ConversationSummaryResponse]


class ConversationResponse(BaseModel):
    status: Literal["success"] = "success"
    conversation: ConversationDetailResponse


class ConversationDeleteResponse(BaseModel):
    status: Literal["success"] = "success"


class RuntimeService:
    """Coordinate auth-scoped sessions, idempotency, and agent execution."""

    def __init__(self, settings: RuntimeSettings, *, registry: S3SessionRegistry | None = None, lock_pool: SessionLockPool | None = None) -> None:
        self.settings = settings
        self.registry = registry or S3SessionRegistry(settings)
        self.lock_pool = lock_pool or SessionLockPool()

    async def invoke(self, request: RuntimeInvocation, principal: AuthenticatedPrincipal, answerer: Answerer, http_request: Request | None = None) -> AgentAnswer:
        record = self.registry.resolve(subject=principal.subject, public_id=request.session_id)
        hash_material = request.prompt.encode()
        if request.speech_mode is not None:
            hash_material += b"\0speechMode=" + request.speech_mode.value.encode()
        prompt_hash = hashlib.sha256(hash_material).hexdigest()
        request_id = str(request.request_id)
        existing = self.registry.get_completed(request_id=request_id, subject=principal.subject, session_id=record.public_id, prompt_hash=prompt_hash)
        if existing is not None:
            await self._record_turn(principal.subject, record, request_id, request.prompt, existing.answer)
            return AgentAnswer(requestId=request.request_id, sessionId=UUID(existing.session_id), answer=existing.answer)
        async with self.lock_pool.get(record.storage_id):
            existing = self.registry.get_completed(request_id=request_id, subject=principal.subject, session_id=record.public_id, prompt_hash=prompt_hash)
            if existing is not None:
                await self._record_turn(principal.subject, record, request_id, request.prompt, existing.answer)
                return AgentAnswer(requestId=request.request_id, sessionId=UUID(existing.session_id), answer=existing.answer)
            answer = await self._call_answerer(
                answerer,
                request.prompt,
                record=record,
                subject=principal.subject,
                request_id=request_id,
                http_request=http_request,
                speech_mode=request.speech_mode,
            )
            completed = self.registry.put_completed(CompletedResult(request_id, record.public_id, prompt_hash, answer), subject=principal.subject)
            self.registry.touch(record)
            await self._record_turn(principal.subject, record, request_id, request.prompt, completed.answer)
            return AgentAnswer(requestId=request.request_id, sessionId=UUID(completed.session_id), answer=completed.answer)

    async def invoke_stream(
        self,
        request: RuntimeInvocation,
        principal: AuthenticatedPrincipal,
        streamer: EventStreamer,
        http_request: Request | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Run one invocation and expose only the approved public event schema."""
        record = self.registry.resolve(subject=principal.subject, public_id=request.session_id)
        hash_material = request.prompt.encode()
        if request.speech_mode is not None:
            hash_material += b"\0speechMode=" + request.speech_mode.value.encode()
        prompt_hash = hashlib.sha256(hash_material).hexdigest()
        request_id = str(request.request_id)
        existing = self.registry.get_completed(
            request_id=request_id,
            subject=principal.subject,
            session_id=record.public_id,
            prompt_hash=prompt_hash,
        )
        yield {"type": "start", "requestId": request_id, "sessionId": record.public_id}
        if existing is not None:
            await self._record_turn(principal.subject, record, request_id, request.prompt, existing.answer)
            yield {"type": "done", "requestId": request_id, "sessionId": existing.session_id, "answer": existing.answer}
            return

        async with self.lock_pool.get(record.storage_id):
            existing = self.registry.get_completed(
                request_id=request_id,
                subject=principal.subject,
                session_id=record.public_id,
                prompt_hash=prompt_hash,
            )
            if existing is not None:
                await self._record_turn(principal.subject, record, request_id, request.prompt, existing.answer)
                yield {"type": "done", "requestId": request_id, "sessionId": existing.session_id, "answer": existing.answer}
                return

            answer: str | None = None
            async for event in self._call_streamer(
                streamer,
                request.prompt,
                record=record,
                subject=principal.subject,
                request_id=request_id,
                http_request=http_request,
                speech_mode=request.speech_mode,
            ):
                if event.get("type") == "answer":
                    answer = str(event.get("answer", ""))
                else:
                    yield event
            if answer is None:
                raise RuntimeError("agent stream completed without an answer")
            completed = self.registry.put_completed(
                CompletedResult(request_id, record.public_id, prompt_hash, answer),
                subject=principal.subject,
            )
            self.registry.touch(record)
            await self._record_turn(principal.subject, record, request_id, request.prompt, completed.answer)
            yield {"type": "done", "requestId": request_id, "sessionId": completed.session_id, "answer": completed.answer}

    async def list_conversations(self, principal: AuthenticatedPrincipal) -> list[ConversationSummary]:
        owner = self.registry.owner_digest(principal.subject)
        async with self.lock_pool.get(f"owner:{owner}"):
            return self.registry.list_conversations(subject=principal.subject)

    async def get_conversation(self, principal: AuthenticatedPrincipal, session_id: UUID) -> Conversation:
        owner = self.registry.owner_digest(principal.subject)
        async with self.lock_pool.get(f"owner:{owner}"):
            return self.registry.get_conversation(subject=principal.subject, session_id=session_id)

    async def delete_conversation(self, principal: AuthenticatedPrincipal, session_id: UUID) -> None:
        owner = self.registry.owner_digest(principal.subject)
        async with self.lock_pool.get(f"owner:{owner}"):
            self.registry.delete_conversation(subject=principal.subject, session_id=session_id)

    async def _record_turn(self, subject: str, record: SessionRecord, request_id: str, prompt: str, answer: str) -> None:
        owner = self.registry.owner_digest(subject)
        async with self.lock_pool.get(f"owner:{owner}"):
            self.registry.record_completed_turn(
                subject=subject,
                record=record,
                request_id=request_id,
                prompt=prompt,
                answer=answer,
            )

    async def _call_answerer(
        self,
        answerer: Answerer,
        question: str,
        *,
        record: SessionRecord,
        subject: str,
        request_id: str,
        http_request: Request | None,
        speech_mode: VoiceMode | None,
    ) -> str:
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
        if "tenant_id" in parameters:
            kwargs["tenant_id"] = subject
        if "http_request" in parameters:
            kwargs["http_request"] = http_request
        if "speech_mode" in parameters:
            kwargs["speech_mode"] = speech_mode
        result = answerer(question, **kwargs)
        if inspect.isawaitable(result):
            return str(await result)
        return str(result)

    async def _call_streamer(
        self,
        streamer: EventStreamer,
        question: str,
        *,
        record: SessionRecord,
        subject: str,
        request_id: str,
        http_request: Request | None,
        speech_mode: VoiceMode | None,
    ) -> AsyncIterator[dict[str, Any]]:
        kwargs: dict[str, Any] = {
            "session_record": record,
            "request_id": request_id,
            "runtime_settings": self.settings,
            "http_request": http_request,
        }
        try:
            parameters = inspect.signature(streamer).parameters
        except (TypeError, ValueError):
            parameters = {}
        if "tenant_id" in parameters:
            kwargs["tenant_id"] = subject
        if "speech_mode" in parameters:
            kwargs["speech_mode"] = speech_mode
        async for event in streamer(question, **kwargs):
            yield event


@lru_cache(maxsize=4)
def get_runtime_service(settings: RuntimeSettings) -> RuntimeService:
    """Reuse one S3 client and bounded lock pool per runtime configuration."""
    return RuntimeService(settings)


async def run_agent_question(
    question: str,
    *,
    session_record: SessionRecord,
    tenant_id: str,
    request_id: str,
    runtime_settings: RuntimeSettings,
    http_request: Request | None = None,
    speech_mode: VoiceMode | None = None,
) -> str:
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
    trace = os.getenv("AGENT_TRACE", "true").lower() in ("true", "1", "yes") and speech_mode is None
    agent = create_agent(
        agent_settings,
        session_manager=manager,
        trace=trace,
        tenant_id=tenant_id,
        speech_mode=speech_mode,
    )
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


async def stream_agent_question(
    question: str,
    *,
    session_record: SessionRecord,
    tenant_id: str,
    request_id: str,
    runtime_settings: RuntimeSettings,
    http_request: Request | None = None,
    speech_mode: VoiceMode | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """Build a fresh agent and publish its safe streaming projection."""
    agent_settings = AgentSettings.from_environment()
    boto_session = boto3.Session(profile_name=runtime_settings.aws_profile, region_name=runtime_settings.session_region)
    storage = S3Storage(
        runtime_settings.session_bucket,
        prefix=runtime_settings.session_prefix,
        boto_session=boto_session,
    )
    manager = SnapshotSessionManager(session_record.storage_id, storage=storage)
    trace = os.getenv("AGENT_TRACE", "true").lower() in ("true", "1", "yes") and speech_mode is None
    agent = create_agent(
        agent_settings,
        session_manager=manager,
        trace=trace,
        tenant_id=tenant_id,
        speech_mode=speech_mode,
    )
    cancel_signal = Event()
    disconnect_task: asyncio.Task[None] | None = None
    if http_request is not None:
        disconnect_task = asyncio.create_task(_watch_disconnect(http_request, cancel_signal, agent))
    try:
        async for event in stream_agent(
            agent,
            question,
            request_id=request_id,
            timeout_seconds=runtime_settings.request_timeout_seconds,
            cancel_signal=cancel_signal,
        ):
            yield event
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
    if isinstance(exc, VoiceError):
        return exc.code, exc.message, exc.status_code
    if isinstance(exc, AuthenticationError):
        return "AUTHENTICATION_REQUIRED", "Authentication is required.", 401
    if isinstance(exc, SessionUnavailableError):
        return "SESSION_UNAVAILABLE", "The requested session is unavailable.", 409
    if isinstance(exc, ConversationNotFoundError):
        return "CONVERSATION_NOT_FOUND", "The requested conversation was not found.", 404
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


def get_voice_settings() -> VoiceSettings:
    try:
        settings = VoiceSettings.from_environment()
        validate_polly_configuration(settings)
        return settings
    except (RuntimeError, ValueError) as exc:
        logger.error("voice_configuration_invalid error_type=%s", type(exc).__name__)
        raise VoiceConfigurationError("The voice service is not configured correctly. Contact support.") from exc


async def get_answerer() -> Answerer:
    return run_agent_question


@app.exception_handler(AuthenticationError)
async def authentication_error_handler(_request: Request, _exc: AuthenticationError) -> JSONResponse:
    return _error_response(code="AUTHENTICATION_REQUIRED", message="Authentication is required.", status_code=401)


@app.exception_handler(VoiceError)
async def voice_error_handler(_request: Request, exc: VoiceError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"status": "error", "code": exc.code, "message": exc.message},
        headers={"Cache-Control": "no-store"},
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_request: Request, _exc: RequestValidationError) -> JSONResponse:
    return _error_response(code="INVALID_REQUEST", message="The request is invalid.", status_code=422)


@app.get("/ping", response_model=RuntimeHealthResponse)
async def runtime_health() -> RuntimeHealthResponse:
    return RuntimeHealthResponse()


@app.post("/invocations/voice/transcribe")
async def transcribe_runtime(
    audio: Annotated[UploadFile, File()],
    mode: Annotated[VoiceMode, Form()],
    _principal: Annotated[AuthenticatedPrincipal, Depends(get_current_principal)],
    voice_settings: Annotated[VoiceSettings, Depends(get_voice_settings)],
) -> dict[str, Any]:
    content_type = (audio.content_type or "").split(";", 1)[0].strip().lower()
    if content_type not in {"audio/wav", "audio/x-wav", "audio/wave"}:
        await audio.close()
        raise VoiceError("UNSUPPORTED_MEDIA_TYPE", "The recording must be a WAV audio file.", 415)
    try:
        content = await audio.read(voice_settings.max_audio_bytes + 1)
    finally:
        await audio.close()
    if len(content) > voice_settings.max_audio_bytes:
        raise VoiceError("AUDIO_TOO_LARGE", "The recording is larger than the 1 MB limit.", 413)
    transcript, languages = await transcribe_audio(content, mode, voice_settings)
    return {"status": "success", "transcript": transcript, "detectedLanguages": languages}


@app.post("/invocations/voice/synthesize", response_model=None)
async def synthesize_runtime(
    request: VoiceSynthesisRequest,
    principal: Annotated[AuthenticatedPrincipal, Depends(get_current_principal)],
    runtime_settings: Annotated[RuntimeSettings, Depends(get_runtime_settings)],
    voice_settings: Annotated[VoiceSettings, Depends(get_voice_settings)],
) -> Response:
    try:
        conversation = await get_runtime_service(runtime_settings).get_conversation(principal, request.session_id)
        completed_answer = next(
            (
                message.content
                for message in reversed(conversation.messages)
                if message.role == "assistant" and message.request_id == str(request.request_id)
            ),
            None,
        )
        if completed_answer is None:
            raise VoiceError("ANSWER_NOT_FOUND", "The completed answer is not available for speech.", 404)
        audio_bytes = await synthesize_speech(completed_answer, request.mode, voice_settings)
        return Response(
            content=audio_bytes,
            media_type="audio/mpeg",
            headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
        )
    except VoiceError:
        raise
    except Exception as exc:
        code, message, status_code = _public_error(exc)
        return _error_response(code=code, message=message, status_code=status_code, request_id=request.request_id)


@app.post("/invocations", response_model=AgentAnswer)
async def invoke_runtime(request: RuntimeInvocation, principal: Annotated[AuthenticatedPrincipal, Depends(get_current_principal)], answerer: Annotated[Answerer, Depends(get_answerer)], runtime_settings: Annotated[RuntimeSettings, Depends(get_runtime_settings)], http_request: Request) -> AgentAnswer | JSONResponse:
    safe_prompt = "[speech-mode prompt withheld]" if request.speech_mode is not None else request.prompt
    logger.info("POST /invocations [requestId=%s sessionId=%s]: %s", request.request_id, request.session_id, safe_prompt)
    try:
        res = await get_runtime_service(runtime_settings).invoke(request, principal, answerer, http_request)
        logger.info("POST /invocations completed [requestId=%s]", request.request_id)
        return res
    except Exception as exc:
        code, message, status_code = _public_error(exc)
        logger.warning("POST /invocations failed [requestId=%s code=%s status=%s]: %s", request.request_id, code, status_code, message)
        return _error_response(code=code, message=message, status_code=status_code, request_id=request.request_id)


def _ndjson(event: dict[str, Any]) -> bytes:
    return (json.dumps(event, separators=(",", ":")) + "\n").encode()


@app.post("/invocations/stream")
async def stream_runtime(
    request: RuntimeInvocation,
    principal: Annotated[AuthenticatedPrincipal, Depends(get_current_principal)],
    runtime_settings: Annotated[RuntimeSettings, Depends(get_runtime_settings)],
    http_request: Request,
) -> StreamingResponse:
    safe_prompt = "[speech-mode prompt withheld]" if request.speech_mode is not None else request.prompt
    logger.info("POST /invocations/stream [requestId=%s sessionId=%s]: %s", request.request_id, request.session_id, safe_prompt)
    async def public_events() -> AsyncIterator[bytes]:
        try:
            async for event in get_runtime_service(runtime_settings).invoke_stream(
                request,
                principal,
                stream_agent_question,
                http_request,
            ):
                if event.get("type") == "step":
                    step = event.get("step", {})
                    logger.info("Agent step [%s]: %s (%s)", step.get("kind"), step.get("title"), step.get("status"))
                elif event.get("type") == "done":
                    logger.info("POST /invocations/stream completed [requestId=%s]", request.request_id)
                yield _ndjson(event)
        except Exception as exc:
            code, message, _status_code = _public_error(exc)
            logger.warning("POST /invocations/stream failed [requestId=%s code=%s]: %s", request.request_id, code, message)
            yield _ndjson({"type": "error", "requestId": str(request.request_id), "code": code, "message": message})

    return StreamingResponse(
        public_events(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


def _summary_response(summary: ConversationSummary) -> ConversationSummaryResponse:
    return ConversationSummaryResponse(
        sessionId=UUID(summary.session_id),
        title=summary.title,
        createdAt=summary.created_at,
        updatedAt=summary.updated_at,
    )


def _message_response(message: VisibleMessage) -> VisibleMessageResponse:
    return VisibleMessageResponse(
        id=message.id,
        role=message.role,
        content=message.content,
        createdAt=message.created_at,
        requestId=UUID(message.request_id),
    )


@app.get("/invocations/conversations", response_model=ConversationListResponse)
async def list_conversations(
    principal: Annotated[AuthenticatedPrincipal, Depends(get_current_principal)],
    runtime_settings: Annotated[RuntimeSettings, Depends(get_runtime_settings)],
) -> ConversationListResponse | JSONResponse:
    try:
        summaries = await get_runtime_service(runtime_settings).list_conversations(principal)
        return ConversationListResponse(conversations=[_summary_response(item) for item in summaries])
    except Exception as exc:
        code, message, status_code = _public_error(exc)
        return _error_response(code=code, message=message, status_code=status_code)


@app.get("/invocations/conversations/{session_id}", response_model=ConversationResponse)
async def get_conversation(
    session_id: UUID,
    principal: Annotated[AuthenticatedPrincipal, Depends(get_current_principal)],
    runtime_settings: Annotated[RuntimeSettings, Depends(get_runtime_settings)],
) -> ConversationResponse | JSONResponse:
    try:
        conversation = await get_runtime_service(runtime_settings).get_conversation(principal, session_id)
        summary = _summary_response(conversation.summary)
        return ConversationResponse(
            conversation=ConversationDetailResponse(
                **summary.model_dump(by_alias=True),
                messages=[_message_response(item) for item in conversation.messages],
            )
        )
    except Exception as exc:
        code, message, status_code = _public_error(exc)
        return _error_response(code=code, message=message, status_code=status_code)


@app.delete("/invocations/conversations/{session_id}", response_model=ConversationDeleteResponse)
async def delete_conversation(
    session_id: UUID,
    principal: Annotated[AuthenticatedPrincipal, Depends(get_current_principal)],
    runtime_settings: Annotated[RuntimeSettings, Depends(get_runtime_settings)],
) -> ConversationDeleteResponse | JSONResponse:
    try:
        await get_runtime_service(runtime_settings).delete_conversation(principal, session_id)
        return ConversationDeleteResponse()
    except Exception as exc:
        code, message, status_code = _public_error(exc)
        return _error_response(code=code, message=message, status_code=status_code)


def main() -> None:
    uvicorn.run(app, host="0.0.0.0", port=8080, log_level=os.getenv("LOG_LEVEL", "info").lower())


if __name__ == "__main__":
    main()
