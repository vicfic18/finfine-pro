"""Ephemeral WAV transcription and authenticated-answer speech synthesis."""

from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
import subprocess
import time
import wave
from functools import lru_cache
from pathlib import Path
from typing import Any

import boto3

from finfine_agent.config import VoiceSettings
from finfine_agent.speech_modes import VoiceMode

logger = logging.getLogger(__name__)
_SUPPORTED_LANGUAGES = {"en-IN", "hi-IN"}
_MAX_CHAT_PROMPT_CHARACTERS = 4_000


class VoiceError(Exception):
    """A safe, user-facing voice-operation failure."""

    def __init__(self, code: str, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


class VoiceConfigurationError(VoiceError):
    """The deployment's Polly voice configuration is incompatible."""

    def __init__(self, message: str) -> None:
        super().__init__("VOICE_CONFIGURATION_ERROR", message, 503)


def _voice_metric(event: str, **fields: str | float) -> None:
    logger.info("voice_metric %s", json.dumps({"event": event, **fields}, separators=(",", ":")))


@lru_cache(maxsize=8)
def _lambda_client(region: str, profile: str | None) -> Any:
    return boto3.Session(profile_name=profile, region_name=region).client("lambda", region_name=region)


@lru_cache(maxsize=8)
def _polly_client(region: str, profile: str | None) -> Any:
    return boto3.Session(profile_name=profile, region_name=region).client("polly", region_name=region)


def _read_pcm_wav(content: bytes, settings: VoiceSettings) -> tuple[bytes, float]:
    if len(content) > settings.max_audio_bytes:
        raise VoiceError("AUDIO_TOO_LARGE", "The recording is larger than the 1 MB limit.", 413)
    try:
        with wave.open(io.BytesIO(content), "rb") as wav_file:
            if wav_file.getcomptype() != "NONE":
                raise ValueError("compressed audio")
            channels = wav_file.getnchannels()
            sample_width = wav_file.getsampwidth()
            sample_rate = wav_file.getframerate()
            frame_count = wav_file.getnframes()
            if channels != 1 or sample_width != 2 or sample_rate != 16_000:
                raise ValueError("unsupported WAV format")
            if frame_count <= 0:
                raise VoiceError("EMPTY_AUDIO", "No speech was detected. Please try recording again.", 422)
            duration = frame_count / sample_rate
            if duration > settings.max_duration_seconds:
                raise VoiceError(
                    "AUDIO_TOO_LONG",
                    f"The recording must be {settings.max_duration_seconds} seconds or shorter.",
                    413,
                )
            pcm = wav_file.readframes(frame_count)
            if len(pcm) != frame_count * channels * sample_width:
                raise ValueError("incomplete WAV data")
    except VoiceError:
        raise
    except (wave.Error, EOFError, ValueError) as exc:
        raise VoiceError("INVALID_AUDIO", "The recording must be a valid mono, 16 kHz WAV file.", 400) from exc
    if not pcm:
        raise VoiceError("EMPTY_AUDIO", "No speech was detected. Please try recording again.", 422)
    return pcm, duration


def _invoke_transcriber(
    *,
    pcm: bytes,
    mode: VoiceMode,
    settings: VoiceSettings,
    client: Any | None = None,
) -> tuple[str, list[str]]:
    if settings.transcriber_mode == "local":
        return _invoke_local_transcriber(pcm=pcm, mode=mode, settings=settings)

    selected_client = client or _lambda_client(settings.transcriber_region, settings.aws_profile)
    payload = json.dumps({"audioBase64": base64.b64encode(pcm).decode("ascii"), "mode": mode.value}).encode("utf-8")
    try:
        response = selected_client.invoke(
            FunctionName=settings.transcriber_function_name,
            InvocationType="RequestResponse",
            Payload=payload,
        )
        payload_stream = response["Payload"]
        try:
            raw_result = payload_stream.read()
        finally:
            close = getattr(payload_stream, "close", None)
            if close is not None:
                close()
        result = json.loads(raw_result or b"{}")
    except Exception as exc:
        logger.warning("voice_transcribe_invoke_failed mode=%s error_type=%s", mode.value, type(exc).__name__)
        raise VoiceError("TRANSCRIPTION_UNAVAILABLE", "Could not transcribe the recording. Please try again.", 503) from exc

    if response.get("FunctionError") or not isinstance(result, dict):
        logger.warning("voice_transcriber_function_failed mode=%s", mode.value)
        raise VoiceError("TRANSCRIPTION_UNAVAILABLE", "Could not transcribe the recording. Please try again.", 503)
    if result.get("status") == "error":
        code = result.get("code")
        if code == "EMPTY_TRANSCRIPT":
            raise VoiceError("EMPTY_TRANSCRIPT", "No clear speech was detected. Please try again.", 422)
        if code == "INVALID_AUDIO":
            raise VoiceError("INVALID_AUDIO", "The recording could not be processed. Please try again.", 400)
        if code == "TRANSCRIBE_THROTTLED":
            raise VoiceError("TRANSCRIPTION_BUSY", "Transcription is busy. Please try again shortly.", 429)
        if code == "TRANSCRIBE_TIMEOUT":
            raise VoiceError("TRANSCRIPTION_TIMEOUT", "Transcription took too long. Please try again.", 504)
        safe_code = code if isinstance(code, str) and code.isascii() and len(code) <= 64 and code.replace("_", "").isalnum() else "unknown"
        logger.warning("voice_transcription_failed mode=%s code=%s", mode.value, safe_code)
        raise VoiceError("TRANSCRIPTION_UNAVAILABLE", "Could not transcribe the recording. Please try again.", 503)

    transcript = result.get("transcript")
    raw_languages = result.get("detectedLanguages", [])
    if not isinstance(transcript, str) or not isinstance(raw_languages, list):
        raise VoiceError("INVALID_TRANSCRIBER_RESPONSE", "The voice service returned an invalid transcription.", 502)
    transcript = transcript.strip()
    if not transcript:
        raise VoiceError("EMPTY_TRANSCRIPT", "No clear speech was detected. Please try again.", 422)
    if len(transcript) > _MAX_CHAT_PROMPT_CHARACTERS:
        raise VoiceError(
            "TRANSCRIPT_TOO_LONG",
            "The transcript is longer than the chat limit. Please record a shorter question.",
            413,
        )
    languages = list(
        dict.fromkeys(
            language
            for language in raw_languages
            if isinstance(language, str) and language in _SUPPORTED_LANGUAGES
        )
    )
    return transcript, languages


def _invoke_local_transcriber(
    *,
    pcm: bytes,
    mode: VoiceMode,
    settings: VoiceSettings,
) -> tuple[str, list[str]]:
    project_root = Path(__file__).resolve().parents[2]
    event = json.dumps(
        {"audioBase64": base64.b64encode(pcm).decode("ascii"), "mode": mode.value}
    )
    try:
        completed = subprocess.run(
            [
                "node",
                "--import",
                "tsx",
                "amplify/functions/voice-transcriber/local.ts",
            ],
            cwd=project_root,
            input=event,
            capture_output=True,
            text=True,
            timeout=settings.max_duration_seconds + 30,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        logger.warning("voice_local_transcriber_failed mode=%s error_type=%s", mode.value, type(exc).__name__)
        raise VoiceError(
            "TRANSCRIPTION_UNAVAILABLE",
            "Could not run the local transcription helper. Check Node.js and AWS credentials.",
            503,
        ) from exc
    if completed.returncode != 0:
        logger.warning("voice_local_transcriber_failed mode=%s exit_code=%s", mode.value, completed.returncode)
        raise VoiceError(
            "TRANSCRIPTION_UNAVAILABLE",
            "Could not run the local transcription helper. Check AWS credentials and Transcribe access.",
            503,
        )
    try:
        result = json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise VoiceError(
            "INVALID_TRANSCRIBER_RESPONSE",
            "The local transcription helper returned an invalid response.",
            502,
        ) from exc

    class LocalResultClient:
        def invoke(self, **_request: object) -> dict[str, object]:
            return {"Payload": io.BytesIO(json.dumps(result).encode())}

    lambda_settings = VoiceSettings(
        **{**settings.__dict__, "transcriber_mode": "lambda", "transcriber_function_name": "local"}
    )
    return _invoke_transcriber(
        pcm=pcm,
        mode=mode,
        settings=lambda_settings,
        client=LocalResultClient(),
    )


async def transcribe_audio(content: bytes, mode: VoiceMode, settings: VoiceSettings) -> tuple[str, list[str]]:
    pcm, duration = _read_pcm_wav(content, settings)
    started = time.perf_counter()
    transcript, languages = await asyncio.to_thread(
        _invoke_transcriber,
        pcm=pcm,
        mode=mode,
        settings=settings,
    )
    _voice_metric(
        "transcription_completed",
        mode=mode.value,
        duration_seconds=round(duration, 2),
        audio_bytes=len(content),
        latency_ms=round((time.perf_counter() - started) * 1000),
        detected_language_count=len(languages),
    )
    return transcript, languages


def _validate_polly_voice(settings: VoiceSettings, client: Any) -> None:
    try:
        voices: list[dict[str, Any]] = []
        next_token: str | None = None
        while True:
            parameters: dict[str, Any] = {
                "Engine": settings.polly_engine,
                "IncludeAdditionalLanguageCodes": True,
            }
            if next_token:
                parameters["NextToken"] = next_token
            response = client.describe_voices(**parameters)
            voices.extend(response.get("Voices", []))
            next_token = response.get("NextToken")
            if not next_token:
                break
    except Exception as exc:
        logger.error(
            "polly_voice_validation_failed region=%s voice_id=%s engine=%s error_type=%s",
            settings.aws_region,
            settings.polly_voice_id,
            settings.polly_engine,
            type(exc).__name__,
        )
        raise VoiceConfigurationError("Could not validate POLLY_VOICE_ID and POLLY_ENGINE in VOICE_AWS_REGION.") from exc

    selected = next((voice for voice in voices if voice.get("Id") == settings.polly_voice_id), None)
    if selected is None:
        raise VoiceConfigurationError(
            f"POLLY_VOICE_ID={settings.polly_voice_id} is not available with POLLY_ENGINE={settings.polly_engine} in {settings.aws_region}."
        )
    supported_engines = selected.get("SupportedEngines") or []
    if settings.polly_engine not in supported_engines:
        raise VoiceConfigurationError(
            f"POLLY_VOICE_ID={settings.polly_voice_id} does not support POLLY_ENGINE={settings.polly_engine}."
        )
    additional_languages = selected.get("AdditionalLanguageCodes") or []
    languages = {selected.get("LanguageCode"), *additional_languages}
    if not _SUPPORTED_LANGUAGES.issubset(languages):
        raise VoiceConfigurationError(
            f"POLLY_VOICE_ID={settings.polly_voice_id} must support both en-IN and hi-IN; use Kajal for bilingual playback."
        )


@lru_cache(maxsize=16)
def _validate_configured_polly_voice(
    region: str,
    voice_id: str,
    engine: str,
    profile: str | None,
) -> None:
    settings = VoiceSettings(
        aws_region=region,
        polly_voice_id=voice_id,
        polly_engine=engine,
        polly_output_format="mp3",
        max_duration_seconds=30,
        max_audio_bytes=1_048_576,
        transcriber_mode="lambda",
        transcriber_function_name="validation-only",
        transcriber_region=region,
        aws_profile=profile,
    )
    _validate_polly_voice(settings, _polly_client(region, profile))


def validate_polly_configuration(settings: VoiceSettings) -> None:
    """Check the configured voice and engine against Polly before voice APIs run."""
    _validate_configured_polly_voice(
        settings.aws_region,
        settings.polly_voice_id,
        settings.polly_engine,
        settings.aws_profile,
    )


def _split_text(text: str, max_characters: int = 2_900) -> list[str]:
    remaining = text.strip()
    chunks: list[str] = []
    while remaining:
        if len(remaining) <= max_characters:
            chunks.append(remaining)
            break
        split_at = remaining.rfind(" ", 0, max_characters + 1)
        if split_at < max_characters // 2:
            split_at = max_characters
        chunk = remaining[:split_at].strip()
        if not chunk:
            raise VoiceError("SPEECH_TOO_LONG", "The answer could not be prepared for speech.", 413)
        chunks.append(chunk)
        remaining = remaining[split_at:].strip()
    return chunks


def _synthesize(
    *,
    text: str,
    mode: VoiceMode,
    settings: VoiceSettings,
    client: Any | None = None,
) -> bytes:
    selected_client = client or _polly_client(settings.aws_region, settings.aws_profile)
    if client is None:
        validate_polly_configuration(settings)
    else:
        _validate_polly_voice(settings, selected_client)
    language_code = "en-IN" if mode is VoiceMode.ENGLISH else "hi-IN" if mode is VoiceMode.HINDI else None
    parts: list[bytes] = []
    try:
        for chunk in _split_text(text):
            parameters: dict[str, Any] = {
                "Text": chunk,
                "VoiceId": settings.polly_voice_id,
                "Engine": settings.polly_engine,
                "OutputFormat": settings.polly_output_format,
            }
            if language_code:
                parameters["LanguageCode"] = language_code
            response = selected_client.synthesize_speech(**parameters)
            stream = response.get("AudioStream")
            if stream is None:
                raise RuntimeError("Polly response did not include an audio stream")
            try:
                audio_part = stream.read()
            finally:
                close = getattr(stream, "close", None)
                if close is not None:
                    close()
            if not audio_part:
                raise RuntimeError("Polly returned an empty audio stream")
            parts.append(audio_part)
    except VoiceError:
        raise
    except Exception as exc:
        logger.warning("polly_synthesis_failed mode=%s error_type=%s", mode.value, type(exc).__name__)
        raise VoiceError("SYNTHESIS_UNAVAILABLE", "Could not generate speech. You can retry playback.", 503) from exc
    return b"".join(parts)


async def synthesize_speech(text: str, mode: VoiceMode, settings: VoiceSettings) -> bytes:
    if not text.strip():
        raise VoiceError("EMPTY_ANSWER", "There is no completed answer to speak.", 422)
    started = time.perf_counter()
    audio = await asyncio.to_thread(_synthesize, text=text, mode=mode, settings=settings)
    _voice_metric(
        "synthesis_completed",
        mode=mode.value,
        answer_characters=len(text),
        audio_bytes=len(audio),
        latency_ms=round((time.perf_counter() - started) * 1000),
    )
    return audio
