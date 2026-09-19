"""Local Strands agent loop for FinFine Pro."""

from __future__ import annotations

import argparse
import atexit
import sys
from collections.abc import Callable
from typing import Any

from strands import Agent
from strands.models.openai import OpenAIModel
from strands_tools.code_interpreter import AgentCoreCodeInterpreter

from finfine_agent.config import AgentSettings
from finfine_agent.instructions import SYSTEM_INSTRUCTIONS
from finfine_agent.observability import TerminalModelTrace, TerminalToolTrace
from finfine_agent.tools import (
    create_financial_python_tool,
    get_latest_balance,
    get_transactions,
    get_upcoming_obligations,
)


def create_model(settings: AgentSettings) -> OpenAIModel:
    """Create an OpenAI-compatible model for Strands."""
    return OpenAIModel(
        client_args={
            "api_key": settings.model_api_key,
            "base_url": settings.model_base_url,
        },
        model_id=settings.model_id,
        params={
            "max_tokens": settings.model_max_tokens,
            "temperature": settings.model_temperature,
        },
    )


def create_code_interpreter(settings: AgentSettings) -> AgentCoreCodeInterpreter:
    """Create the managed AWS code execution tool."""
    interpreter = AgentCoreCodeInterpreter(
        region=settings.code_interpreter_region,
        session_name="finfine-local-agent",
        persist_sessions=False,
        session_timeout_seconds=settings.code_interpreter_session_timeout_seconds,
    )
    atexit.register(interpreter.cleanup_platform)
    return interpreter


def create_agent(
    settings: AgentSettings | None = None,
    *,
    model: Any | None = None,
    code_interpreter: Any | None = None,
    agent_factory: Callable[..., Any] = Agent,
    trace: bool = True,
) -> Any:
    """Build the local agent with financial reads and managed code execution."""
    resolved = settings or AgentSettings.from_environment()
    resolved_model = model or create_model(resolved)
    interpreter = code_interpreter or create_code_interpreter(resolved)
    code_interpreter_tool = create_financial_python_tool(interpreter)

    trace_options = (
        {
            "callback_handler": TerminalModelTrace(),
            "plugins": [TerminalToolTrace()],
        }
        if trace
        else {"callback_handler": None}
    )
    return agent_factory(
        model=resolved_model,
        system_prompt=SYSTEM_INSTRUCTIONS,
        tools=[
            get_latest_balance,
            get_transactions,
            get_upcoming_obligations,
            code_interpreter_tool,
        ],
        **trace_options,
    )


def ask(agent: Any, question: str) -> str:
    """Send one non-empty question to the agent."""
    cleaned = question.strip()
    if not cleaned:
        raise ValueError("question cannot be empty")
    return str(agent(cleaned))


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
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Hide model and tool traces",
    )
    args = parser.parse_args()

    interpreter: AgentCoreCodeInterpreter | None = None
    try:
        settings = AgentSettings.from_environment()
        interpreter = create_code_interpreter(settings)
        agent = create_agent(
            settings,
            code_interpreter=interpreter,
            trace=not args.quiet,
        )
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
    finally:
        if interpreter is not None:
            try:
                interpreter.cleanup_platform()
            finally:
                atexit.unregister(interpreter.cleanup_platform)


if __name__ == "__main__":
    raise SystemExit(main())
