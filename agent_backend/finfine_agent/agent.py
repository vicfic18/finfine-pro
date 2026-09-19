"""Local Strands agent loop for FinFine Pro."""

from __future__ import annotations

import argparse
import sys
from collections.abc import Callable
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
    create_transactions_csv_tool,
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
            # OpenRouter reasoning metadata cannot be replayed by Strands in a
            # later Chat Completions tool-call turn. The model may still reason;
            # this keeps provider-specific reasoning details out of the reply.
            "extra_body": {
                "reasoning": {"enabled": False, "exclude": True}
            },
        },
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
) -> Any:
    """Build the local agent with financial reads and managed code execution."""
    resolved = settings or AgentSettings.from_environment()
    resolved_model = model or create_model(resolved)
    artifacts = artifact_store or LocalArtifactStore()
    executor = code_executor or create_code_executor(resolved, artifacts)
    csv_tool = create_transactions_csv_tool(artifacts)
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
    return agent_factory(
        model=resolved_model,
        system_prompt=build_system_instructions(),
        tools=[
            skill_tool,
            get_latest_balance,
            get_transactions,
            get_upcoming_obligations,
            csv_tool,
            code_tool,
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

    try:
        settings = AgentSettings.from_environment()
        agent = create_agent(settings, trace=not args.quiet)
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
