import asyncio
import io
import wave
from datetime import UTC, datetime
from uuid import UUID

import httpx

import finfine_agent.api as api_module
from finfine_agent.api import (
    app,
    get_current_principal,
    get_runtime_settings,
    get_voice_settings,
)
from finfine_agent.auth import AuthenticatedPrincipal, AuthenticationError
from finfine_agent.config import RuntimeSettings, VoiceSettings
from finfine_agent.sessions import (
    Conversation,
    ConversationSummary,
    SessionUnavailableError,
    VisibleMessage,
)
from finfine_agent.speech_modes import VoiceMode
from finfine_agent.voice import VoiceError

SESSION_ID = UUID("557dbe23-8e61-41f4-8e42-3925b0eb945e")
REQUEST_ID = "315b4a4e-d5f8-4b21-911c-37bb629e869d"
PRINCIPAL = AuthenticatedPrincipal("owner-a", {})
RUNTIME_SETTINGS = RuntimeSettings(
    cognito_issuer="https://cognito-idp.example.test/pool",
    cognito_client_id="client",
    session_bucket="bucket",
)
VOICE_SETTINGS = VoiceSettings(
    aws_region="ap-south-1",
    polly_voice_id="Kajal",
    polly_engine="neural",
    polly_output_format="mp3",
    max_duration_seconds=30,
    max_audio_bytes=1_048_576,
    transcriber_mode="lambda",
    transcriber_function_name="voice-transcriber",
    transcriber_region="ap-south-1",
)


def send(method: str, path: str, **kwargs):
    files = kwargs.pop("files", None)
    form_values = kwargs.pop("data", None)
    if files is not None or form_values is not None:
        boundary = "finfine-test-boundary"
        pieces: list[bytes] = []
        for name, value in (form_values or {}).items():
            pieces.append(
                f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode()
            )
        for name, file_value in (files or {}).items():
            filename, content, content_type = file_value
            if isinstance(content, str):
                content = content.encode()
            pieces.append(
                f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; filename=\"{filename}\"\r\nContent-Type: {content_type}\r\n\r\n".encode()
                + content
                + b"\r\n"
            )
        pieces.append(f"--{boundary}--\r\n".encode())
        headers = dict(kwargs.pop("headers", {}))
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
        kwargs["headers"] = headers
        kwargs["content"] = b"".join(pieces)

    async def run() -> httpx.Response:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            return await client.request(method, path, **kwargs)

    return asyncio.run(run())


def valid_wav() -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(16_000)
        wav_file.writeframes(bytes(3_200))
    return buffer.getvalue()


def wav_bytes_for_duration(seconds: int) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(16_000)
        wav_file.writeframes(bytes(seconds * 16_000 * 2))
    return buffer.getvalue()


def set_voice_overrides(*, principal: bool = True) -> None:
    async def runtime_settings():
        return RUNTIME_SETTINGS

    async def voice_settings():
        return VOICE_SETTINGS

    app.dependency_overrides[get_runtime_settings] = runtime_settings
    app.dependency_overrides[get_voice_settings] = voice_settings
    if principal:
        async def current_principal():
            return PRINCIPAL

        app.dependency_overrides[get_current_principal] = current_principal
    else:
        async def unauthenticated_principal():
            raise AuthenticationError("missing token")

        app.dependency_overrides[get_current_principal] = unauthenticated_principal


def test_transcribe_requires_authentication() -> None:
    set_voice_overrides(principal=False)
    try:
        response = send(
            "POST",
            "/invocations/voice/transcribe",
            files={"audio": ("utterance.wav", valid_wav(), "audio/wav")},
            data={"mode": "english"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 401


def test_voice_settings_validate_polly_configuration_before_use(monkeypatch) -> None:
    validated: list[VoiceSettings] = []
    monkeypatch.setattr(api_module.VoiceSettings, "from_environment", staticmethod(lambda: VOICE_SETTINGS))
    monkeypatch.setattr(api_module, "validate_polly_configuration", validated.append)

    assert api_module.get_voice_settings() == VOICE_SETTINGS
    assert validated == [VOICE_SETTINGS]


def test_transcribe_rejects_invalid_mode_mime_malformed_oversized_and_long_audio() -> None:
    set_voice_overrides()
    try:
        invalid_mode = send(
            "POST", "/invocations/voice/transcribe",
            files={"audio": ("utterance.wav", valid_wav(), "audio/wav")}, data={"mode": "en-IN"},
        )
        bad_mime = send(
            "POST", "/invocations/voice/transcribe",
            files={"audio": ("utterance.wav", valid_wav(), "audio/webm")}, data={"mode": "english"},
        )
        malformed = send(
            "POST", "/invocations/voice/transcribe",
            files={"audio": ("utterance.wav", b"not-wave", "audio/wav")}, data={"mode": "english"},
        )
        async def small_limit():
            return VoiceSettings(**{**VOICE_SETTINGS.__dict__, "max_audio_bytes": 40})

        app.dependency_overrides[get_voice_settings] = small_limit
        oversized = send(
            "POST", "/invocations/voice/transcribe",
            files={"audio": ("utterance.wav", valid_wav(), "audio/wav")}, data={"mode": "english"},
        )
        long_audio = send(
            "POST", "/invocations/voice/transcribe",
            files={"audio": ("utterance.wav", wav_bytes_for_duration(31), "audio/wav")}, data={"mode": "english"},
        )
    finally:
        app.dependency_overrides.clear()

    assert invalid_mode.status_code == 422
    assert bad_mime.status_code == 415
    assert malformed.status_code == 400
    assert oversized.status_code == 413
    assert long_audio.status_code == 413


def test_transcribe_returns_transcript_and_retryable_failure(monkeypatch) -> None:
    async def success(_content, mode, _settings):
        assert mode is VoiceMode.HINGLISH
        return "What is मेरा balance?", ["en-IN", "hi-IN"]

    monkeypatch.setattr(api_module, "transcribe_audio", success)
    set_voice_overrides()
    try:
        response = send(
            "POST", "/invocations/voice/transcribe",
            files={"audio": ("utterance.wav", valid_wav(), "audio/wav")}, data={"mode": "hinglish"},
        )
        assert response.status_code == 200
        assert response.json() == {
            "status": "success",
            "transcript": "What is मेरा balance?",
            "detectedLanguages": ["en-IN", "hi-IN"],
        }

        async def throttled(*_args):
            raise VoiceError("TRANSCRIPTION_BUSY", "Transcription is busy. Please try again shortly.", 429)

        monkeypatch.setattr(api_module, "transcribe_audio", throttled)
        failed = send(
            "POST", "/invocations/voice/transcribe",
            files={"audio": ("utterance.wav", valid_wav(), "audio/wav")}, data={"mode": "hinglish"},
        )
    finally:
        app.dependency_overrides.clear()
    assert failed.status_code == 429
    assert failed.json()["code"] == "TRANSCRIPTION_BUSY"


def test_synthesize_is_owner_scoped_and_uses_only_completed_assistant_text(monkeypatch) -> None:
    now = datetime.now(UTC)
    conversation = Conversation(
        ConversationSummary(str(SESSION_ID), "Balance", now, now),
        (
            VisibleMessage(f"user:{REQUEST_ID}", "user", "What is my balance?", now, REQUEST_ID),
            VisibleMessage(f"assistant:{REQUEST_ID}", "assistant", "Your balance is ...", now, REQUEST_ID),
        ),
    )

    class Service:
        async def get_conversation(self, principal, session_id):
            assert principal.subject == "owner-a"
            assert session_id == SESSION_ID
            return conversation

    calls: list[tuple[str, VoiceMode]] = []

    async def synthesize(text: str, mode: VoiceMode, _settings: VoiceSettings) -> bytes:
        calls.append((text, mode))
        return b"fake-mp3"

    monkeypatch.setattr(api_module, "get_runtime_service", lambda _settings: Service())
    monkeypatch.setattr(api_module, "synthesize_speech", synthesize)
    set_voice_overrides()
    try:
        response = send(
            "POST",
            "/invocations/voice/synthesize",
            json={"sessionId": str(SESSION_ID), "requestId": REQUEST_ID, "mode": "hindi"},
        )
        arbitrary = send(
            "POST",
            "/invocations/voice/synthesize",
            json={"sessionId": str(SESSION_ID), "requestId": REQUEST_ID, "mode": "hindi", "text": "attacker text"},
        )
        async def synthesis_failure(*_args):
            raise VoiceError("SYNTHESIS_UNAVAILABLE", "Could not generate speech. You can retry playback.", 503)

        monkeypatch.setattr(api_module, "synthesize_speech", synthesis_failure)
        failed = send(
            "POST",
            "/invocations/voice/synthesize",
            json={"sessionId": str(SESSION_ID), "requestId": REQUEST_ID, "mode": "hindi"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/mpeg"
    assert response.headers["cache-control"] == "private, no-store"
    assert response.content == b"fake-mp3"
    assert calls == [("Your balance is ...", VoiceMode.HINDI)]
    assert arbitrary.status_code == 422
    assert failed.status_code == 503
    assert failed.json()["code"] == "SYNTHESIS_UNAVAILABLE"


def test_synthesize_does_not_read_another_users_conversation(monkeypatch) -> None:
    class Service:
        async def get_conversation(self, _principal, _session_id):
            raise SessionUnavailableError("not owned")

    called = False

    async def synthesize(*_args):
        nonlocal called
        called = True
        return b"audio"

    monkeypatch.setattr(api_module, "get_runtime_service", lambda _settings: Service())
    monkeypatch.setattr(api_module, "synthesize_speech", synthesize)
    set_voice_overrides()
    try:
        response = send(
            "POST",
            "/invocations/voice/synthesize",
            json={"sessionId": str(SESSION_ID), "requestId": REQUEST_ID, "mode": "english"},
        )
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 409
    assert response.json()["code"] == "SESSION_UNAVAILABLE"
    assert not called
