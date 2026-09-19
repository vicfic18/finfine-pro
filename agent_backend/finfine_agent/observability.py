"""Readable terminal tracing for local agent development."""

from __future__ import annotations

import json
from typing import Any

from strands.hooks import AfterToolCallEvent, BeforeToolCallEvent
from strands.plugins import Plugin, hook

SENSITIVE_PARTS = ("api_key", "authorization", "password", "secret", "token")


def _redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: "[REDACTED]"
            if any(part in key.lower() for part in SENSITIVE_PARTS)
            else _redact(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_redact(item) for item in value]
    return value


def _display(value: Any, limit: int = 6_000) -> str:
    rendered = json.dumps(_redact(value), indent=2, default=str, ensure_ascii=False)
    if len(rendered) <= limit:
        return rendered
    return f"{rendered[:limit]}\n... [output shortened]"


class TerminalToolTrace(Plugin):
    """Print tool calls and results without logging secrets."""

    name = "finfine-terminal-tool-trace"

    @hook
    def before_tool(self, event: BeforeToolCallEvent) -> None:
        name = event.tool_use.get("name", "unknown")
        print(f"\n[tool] {name}")
        print("[tool input]")
        print(_display(event.tool_use.get("input", {})))

    @hook
    def after_tool(self, event: AfterToolCallEvent) -> None:
        name = event.tool_use.get("name", "unknown")
        duration = f" in {event.duration:.2f}s" if event.duration is not None else ""
        if event.exception is not None:
            print(f"[tool error] {name}{duration}: {event.exception}")
            return
        print(f"[tool result] {name}{duration}")
        print(_display(event.result))


class TerminalModelTrace:
    """Print model text and major agent-loop events."""

    def __init__(self) -> None:
        self._writing = False

    def __call__(self, **event: Any) -> None:
        if event.get("init_event_loop"):
            print("\n[agent] Working...")
        if "data" in event:
            if not self._writing:
                print("[model] ", end="", flush=True)
                self._writing = True
            print(event["data"], end="", flush=True)
        if "result" in event:
            if self._writing:
                print()
                self._writing = False
            print("[agent] Completed.")
        if event.get("force_stop"):
            reason = event.get("force_stop_reason", "unknown reason")
            print(f"\n[agent] Stopped: {reason}")
