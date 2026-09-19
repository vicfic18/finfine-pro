"""HTTP interface for the local FinFine agent."""

from __future__ import annotations

import logging
import os
from collections.abc import Callable
from pathlib import Path
from typing import Annotated, Literal

import uvicorn
from dotenv import load_dotenv
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, StringConstraints

from finfine_agent.agent import ask, create_agent
from finfine_agent.config import AgentSettings

logger = logging.getLogger(__name__)
Question = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4_000)]
Answerer = Callable[[str], str]


class RuntimeInvocation(BaseModel):
    """Question accepted locally and by AgentCore Runtime."""

    prompt: Question


class AgentAnswer(BaseModel):
    """Successful agent response."""

    status: Literal["success"] = "success"
    answer: str


class AgentError(BaseModel):
    """Safe error response for API callers."""

    status: Literal["error"] = "error"
    error: str


class RuntimeHealthResponse(BaseModel):
    """AgentCore Runtime health response."""

    status: Literal["Healthy"] = "Healthy"


def run_agent_question(question: str) -> str:
    """Run one isolated agent request."""
    settings = AgentSettings.from_environment()
    agent = create_agent(settings, trace=True)
    return ask(agent, question)


async def get_answerer() -> Answerer:
    """Provide the agent runner; replaceable in API tests."""
    return run_agent_question


def _public_error(exc: Exception) -> str:
    """Return a useful message without exposing credentials or internals."""
    error_text = str(exc)
    if "ResourceNotFoundException" in error_text:
        return "The Lambda code executor is not deployed or its name is incorrect."
    if "CreateOAuth2Token" in error_text:
        return "AWS login has expired. Sign in to AWS again, then retry."
    if "Connection error" in error_text or "ConnectError" in error_text:
        return "The model service could not be reached. Check the backend network connection."
    return "The agent could not complete the request. Check the backend terminal for details."


load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)
allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "FINFINE_ALLOWED_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

app = FastAPI(
    title="FinFine Agent API",
    version="0.1.0",
    description="Local HTTP interface for asking the FinFine financial agent questions.",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/ping", response_model=RuntimeHealthResponse)
async def runtime_health() -> RuntimeHealthResponse:
    """Confirm readiness using the AgentCore Runtime HTTP contract."""
    return RuntimeHealthResponse()


def _answer_or_error(question: str, answerer: Answerer) -> AgentAnswer | JSONResponse:
    """Run a question and convert failures into a safe API response."""
    try:
        return AgentAnswer(answer=answerer(question))
    except Exception as exc:
        logger.exception("Agent API request failed")
        error = AgentError(error=_public_error(exc))
        return JSONResponse(status_code=503, content=error.model_dump())


@app.post(
    "/invocations",
    response_model=AgentAnswer,
    responses={503: {"model": AgentError}},
)
async def invoke_runtime(
    request: RuntimeInvocation,
    answerer: Annotated[Answerer, Depends(get_answerer)],
) -> AgentAnswer | JSONResponse:
    """Handle the shared local and AgentCore Runtime invocation contract."""
    return _answer_or_error(request.prompt, answerer)


def main() -> None:
    """Run the HTTP service with the AgentCore Runtime port contract."""
    uvicorn.run(app, host="0.0.0.0", port=8080)


if __name__ == "__main__":
    main()
