from datetime import UTC, datetime

from finfine_agent.instructions import build_system_instructions


def test_system_instructions_include_current_local_clock() -> None:
    now = datetime(2026, 9, 19, 12, 34, 56, tzinfo=UTC)

    prompt = build_system_instructions(now)

    assert "Current local date and time: 2026-09-19T12:34:56+00:00" in prompt
    assert "ask instead of guessing" in prompt
    assert "You are FinFine Pro" in prompt
