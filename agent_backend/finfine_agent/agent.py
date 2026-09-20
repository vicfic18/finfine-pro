"""Local Strands agent loop for FinFine Pro."""

from __future__ import annotations

import argparse
import asyncio
import sys
from collections.abc import Callable
from threading import Event
from typing import Any

from strands import Agent
from strands.models.openai import OpenAIModel

from finfine_agent.artifacts import LocalArtifactStore
from finfine_agent.config import AgentSettings
from finfine_agent.instructions import build_system_instructions
from finfine_agent.lambda_executor import LambdaPythonExecutor
from finfine_agent.observability import TerminalModelTrace, TerminalToolTrace
from finfine_agent.tools import (
    create_analysis_skill_tool,
    create_financial_python_tool,
    create_financial_data_tools,
)


class AgentCancelledError(Exception):
    """The agent invocation was cancelled before producing a final answer."""


def create_model(settings: AgentSettings) -> OpenAIModel:
    """Create an OpenAI-compatible model for Strands."""
    params: dict[str, Any] = {
        "max_tokens": settings.model_max_tokens,
        "temperature": settings.model_temperature,
    }
    if "groq.com" not in settings.model_base_url.lower():
        params["extra_body"] = {
            "reasoning": {"enabled": False, "exclude": True}
        }

    return OpenAIModel(
        client_args={
            "api_key": settings.model_api_key,
            "base_url": settings.model_base_url,
        },
        model_id=settings.model_id,
        params=params,
    )


def create_code_executor(
    settings: AgentSettings,
    artifacts: LocalArtifactStore,
) -> LambdaPythonExecutor:
    """Create the isolated Lambda code executor."""
    return LambdaPythonExecutor(
        function_name=settings.code_executor_function_name,
        region=settings.code_executor_region,
        aws_profile=settings.aws_profile,
        artifacts=artifacts,
    )


def create_agent(
    settings: AgentSettings | None = None,
    *,
    model: Any | None = None,
    code_executor: Any | None = None,
    artifact_store: LocalArtifactStore | None = None,
    agent_factory: Callable[..., Any] = Agent,
    trace: bool = True,
    session_manager: Any | None = None,
    tenant_id: str,
) -> Any:
    """Build the local agent with financial reads and managed code execution."""
    resolved = settings or AgentSettings.from_environment()
    resolved_model = model or create_model(resolved)
    artifacts = artifact_store or LocalArtifactStore()
    executor = code_executor or create_code_executor(resolved, artifacts)
    if not tenant_id.strip():
        raise ValueError("tenant_id is required")
    balance_tool, transactions_tool, obligations_tool, csv_tool = create_financial_data_tools(tenant_id, artifacts)
    code_tool = create_financial_python_tool(executor)
    skill_tool = create_analysis_skill_tool()

    trace_options = (
        {
            "callback_handler": TerminalModelTrace(),
            "plugins": [TerminalToolTrace()],
        }
        if trace
        else {"callback_handler": None}
    )
    kwargs = dict(
        model=resolved_model,
        system_prompt=build_system_instructions(),
        tools=[
            skill_tool,
            balance_tool,
            transactions_tool,
            obligations_tool,
            csv_tool,
            code_tool,
        ],
        **trace_options,
    )
    if session_manager is not None:
        kwargs["session_manager"] = session_manager
    return agent_factory(**kwargs)


def ask(agent: Any, question: str) -> str:
    """Send one non-empty question to the agent."""
    cleaned = question.strip()
    if not cleaned:
        raise ValueError("question cannot be empty")
    return str(agent(cleaned))


def _result_text(result: Any) -> str:
    """Extract final text from a Strands result while supporting test fakes."""
    if isinstance(result, str):
        return result
    message = result.get("message") if isinstance(result, dict) else getattr(result, "message", None)
    if isinstance(message, dict):
        content = message.get("content", [])
        text_parts = [block.get("text", "") for block in content if isinstance(block, dict)]
        text = "".join(part for part in text_parts if part)
        if text:
            return text
    return str(result)


async def ask_async(
    agent: Any,
    question: str,
    *,
    request_id: str | None = None,
    timeout_seconds: float = 90.0,
    cancel_signal: Any | None = None,
) -> str:
    """Invoke one request asynchronously and return only final answer text."""
    cleaned = question.strip()
    if not cleaned:
        raise ValueError("question cannot be empty")
    invoke = getattr(agent, "invoke_async", None)
    if invoke is None:
        return await asyncio.to_thread(ask, agent, cleaned)
    if cancel_signal is None:
        cancel_signal = Event()
    kwargs: dict[str, Any] = {}
    if request_id is not None:
        kwargs["idempotency_token"] = request_id
    if cancel_signal is not None:
        kwargs["cancel_signal"] = cancel_signal
    task = asyncio.create_task(invoke(cleaned, **kwargs))
    try:
        result = await asyncio.wait_for(asyncio.shield(task), timeout=timeout_seconds)
    except asyncio.TimeoutError:
        if cancel_signal is not None:
            cancel_signal.set()
        cancel = getattr(agent, "cancel", None)
        if cancel is not None:
            cancel()
        try:
            await asyncio.wait_for(asyncio.shield(task), timeout=2)
        except (Exception, asyncio.CancelledError):
            pass
        raise TimeoutError("agent invocation timed out")
    if getattr(result, "stop_reason", None) == "cancelled" or (
        isinstance(result, dict) and result.get("stop_reason") == "cancelled"
    ):
        raise AgentCancelledError("agent invocation was cancelled")
    return _result_text(result)


def run_chat(agent: Any, *, trace: bool = True) -> None:
    """Run a local multi-turn command-line conversation."""
    print("FinFine Pro agent is ready. Type 'exit' to stop.")
    while True:
        try:
            question = input("\nYou: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nSession ended.")
            return
        if question.lower() in {"exit", "quit"}:
            print("Session ended.")
            return
        if not question:
            continue
        answer = ask(agent, question)
        if not trace:
            print(f"\nFinFine: {answer}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the local FinFine Pro agent")
    parser.add_argument("question", nargs="?", help="Ask one question and exit")
    parser.add_argument("--tenant-id", required=True, help="Authenticated merchant subject for local development")
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Hide model and tool traces",
    )
    args = parser.parse_args()

    try:
        settings = AgentSettings.from_environment()
        agent = create_agent(settings, trace=not args.quiet, tenant_id=args.tenant_id)
        if args.question:
            answer = ask(agent, args.question)
            if args.quiet:
                print(answer)
            else:
                print()
        else:
            run_chat(agent, trace=not args.quiet)
        return 0
    except (RuntimeError, ValueError) as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
