"""Speech language modes shared by voice services and chat guidance."""

from enum import Enum


class VoiceMode(str, Enum):
    ENGLISH = "english"
    HINDI = "hindi"
    HINGLISH = "hinglish"


def response_language_instruction(mode: VoiceMode | None) -> str | None:
    if mode is VoiceMode.ENGLISH:
        return "For this reply, use clear, natural Indian English."
    if mode is VoiceMode.HINDI:
        return "For this reply, use natural Hindi written in Devanagari script."
    if mode is VoiceMode.HINGLISH:
        return (
            "For this reply, use a conversational mix of English and Hindi. "
            "Write Hindi portions in Devanagari script and English portions in Latin script."
        )
    return None


def transcribe_language_config(mode: VoiceMode) -> dict[str, object]:
    if mode is VoiceMode.ENGLISH:
        return {"LanguageCode": "en-IN"}
    if mode is VoiceMode.HINDI:
        return {"LanguageCode": "hi-IN"}
    return {
        "IdentifyMultipleLanguages": True,
        "LanguageOptions": "en-IN,hi-IN",
    }
