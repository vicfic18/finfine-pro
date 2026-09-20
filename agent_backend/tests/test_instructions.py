from datetime import UTC, datetime

from finfine_agent.instructions import build_system_instructions
from finfine_agent.speech_modes import VoiceMode


def test_system_instructions_include_current_local_clock() -> None:
    now = datetime(2026, 9, 19, 12, 34, 56, tzinfo=UTC)

    prompt = build_system_instructions(now)

    assert "Current local date and time: 2026-09-19T12:34:56+00:00" in prompt
    assert "ask instead of guessing" in prompt
    assert "You are FinFine Pro" in prompt


def test_selected_speech_mode_is_private_system_guidance() -> None:
    assert "Indian English" in build_system_instructions(speech_mode=VoiceMode.ENGLISH)
    assert "Devanagari" in build_system_instructions(speech_mode=VoiceMode.HINDI)
    assert "conversational mix" in build_system_instructions(speech_mode=VoiceMode.HINGLISH)
