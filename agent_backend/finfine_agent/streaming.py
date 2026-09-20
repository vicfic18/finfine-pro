"""Safe public streaming events for the FinFine chat UI."""

from __future__ import annotations

from collections.abc import AsyncIterator
from threading import Event
from typing import Any

from finfine_agent.agent import AgentCancelledError, _result_text

TOOL_TITLES = {
    "load_analysis_skill": "Preparing an analysis approach",
    "get_latest_balance": "Checking the latest balance",
    "get_transactions": "Reviewing transactions",
    "get_upcoming_obligations": "Checking upcoming obligations",
    "get_business_data": "Reviewing business records",
    "export_transactions_csv": "Preparing transaction data",
    "export_business_data_csv": "Preparing business data",
    "run_financial_python": "Running a financial calculation",
}


def public_tool_title(name: str) -> str:
    """Return a stable description without exposing tool inputs or outputs."""
    return TOOL_TITLES.get(name, "Using a financial tool")


async def stream_agent(
    agent: Any,
    question: str,
    *,
    request_id: str,
    timeout_seconds: float,
    cancel_signal: Event,
) -> AsyncIterator[dict[str, Any]]:
    """Translate Strands events into a deliberately small public event set."""
    active_tools: dict[str, tuple[str, str]] = {}
    result: Any | None = None
    try:
        import asyncio

        async with asyncio.timeout(timeout_seconds):
            async for event in agent.stream_async(
                question,
                idempotency_token=request_id,
                cancel_signal=cancel_signal,
            ):
                if "result" in event:
                    result = event["result"]
                    continue

                # Never forward reasoningText, model deltas, tool input, or tool output.
                tool = event.get("current_tool_use")
                if isinstance(tool, dict):
                    name = tool.get("name")
                    tool_use_id = tool.get("toolUseId")
                    if isinstance(name, str) and isinstance(tool_use_id, str) and tool_use_id not in active_tools:
                        kind = "code" if name == "run_financial_python" else "tool"
                        active_tools[tool_use_id] = (name, kind)
                        yield {
                            "type": "step",
                            "step": {
                                "id": tool_use_id,
                                "kind": kind,
                                "title": public_tool_title(name),
                                "status": "running",
                            },
                        }

                data = event.get("data")
                if isinstance(data, str) and data:
                    for tool_use_id, (name, kind) in list(active_tools.items()):
                        yield {
                            "type": "step",
                            "step": {
                                "id": tool_use_id,
                                "kind": kind,
                                "title": public_tool_title(name),
                                "status": "complete",
                            },
                        }
                        del active_tools[tool_use_id]
                    yield {"type": "text_delta", "delta": data}
    except TimeoutError:
        cancel_signal.set()
        cancel = getattr(agent, "cancel", None)
        if cancel is not None:
            cancel()
        raise TimeoutError("agent invocation timed out")

    for tool_use_id, (name, kind) in active_tools.items():
        yield {
            "type": "step",
            "step": {
                "id": tool_use_id,
                "kind": kind,
                "title": public_tool_title(name),
                "status": "complete" if result is not None else "error",
            },
        }

    if getattr(result, "stop_reason", None) == "cancelled" or (
        isinstance(result, dict) and result.get("stop_reason") == "cancelled"
    ):
        raise AgentCancelledError("agent invocation was cancelled")
    if result is None:
        raise RuntimeError("agent stream completed without a result")
    yield {"type": "answer", "answer": _result_text(result)}
