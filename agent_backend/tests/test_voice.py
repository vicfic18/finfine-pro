import base64
import io
import json
import subprocess
import wave

import pytest

import finfine_agent.voice as voice_module
from finfine_agent.config import VoiceSettings
from finfine_agent.speech_modes import VoiceMode, transcribe_language_config
from finfine_agent.voice import VoiceConfigurationError, VoiceError


def settings(*, max_duration: int = 30, max_bytes: int = 1_048_576) -> VoiceSettings:
    return VoiceSettings(
        aws_region="ap-south-1",
        polly_voice_id="Kajal",
        polly_engine="neural",
        polly_output_format="mp3",
        max_duration_seconds=max_duration,
        max_audio_bytes=max_bytes,
        transcriber_mode="lambda",
        transcriber_function_name="voice-transcriber",
        transcriber_region="ap-south-1",
    )


def wav_bytes(*, duration: float = 0.1, sample_rate: int = 16_000, channels: int = 1, sample_width: int = 2) -> bytes:
    buffer = io.BytesIO()
    frame_count = int(duration * sample_rate)
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(channels)
        wav_file.setsampwidth(sample_width)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(bytes(frame_count * channels * sample_width))
    return buffer.getvalue()


class FakeLambda:
    def __init__(self, result: dict[str, object]) -> None:
        self.result = result
        self.request: dict[str, object] | None = None

    def invoke(self, **request: object) -> dict[str, object]:
        self.request = request
        return {"Payload": io.BytesIO(json.dumps(self.result).encode())}


class FakePolly:
    def __init__(self, *, languages: list[str] | None = None) -> None:
        self.languages = ["hi-IN"] if languages is None else languages
        self.synthesis_requests: list[dict[str, object]] = []

    def describe_voices(self, **request: object) -> dict[str, object]:
        assert request["Engine"] == "neural"
        assert request["IncludeAdditionalLanguageCodes"] is True
        return {
            "Voices": [{
                "Id": "Kajal",
                "LanguageCode": "en-IN",
                "AdditionalLanguageCodes": self.languages,
                "SupportedEngines": ["neural"],
            }],
        }

    def synthesize_speech(self, **request: object) -> dict[str, object]:
        self.synthesis_requests.append(request)
        return {"AudioStream": io.BytesIO(b"fake-mp3")}


def test_wav_validation_rejects_bad_format_size_and_duration() -> None:
    with pytest.raises(VoiceError, match="valid mono"):
        voice_module._read_pcm_wav(b"not-wave", settings())
    with pytest.raises(VoiceError) as oversized:
        voice_module._read_pcm_wav(wav_bytes(), settings(max_bytes=50))
    assert oversized.value.status_code == 413
    with pytest.raises(VoiceError) as too_long:
        voice_module._read_pcm_wav(wav_bytes(duration=2), settings(max_duration=1))
    assert too_long.value.code == "AUDIO_TOO_LONG"
    with pytest.raises(VoiceError) as wrong_rate:
        voice_module._read_pcm_wav(wav_bytes(sample_rate=8_000), settings())
    assert wrong_rate.value.code == "INVALID_AUDIO"


@pytest.mark.parametrize(
    ("mode", "expected"),
    [
        (VoiceMode.ENGLISH, {"LanguageCode": "en-IN"}),
        (VoiceMode.HINDI, {"LanguageCode": "hi-IN"}),
        (
            VoiceMode.HINGLISH,
            {"IdentifyMultipleLanguages": True, "LanguageOptions": "en-IN,hi-IN"},
        ),
    ],
)
def test_mode_maps_to_supported_transcribe_configuration(mode, expected) -> None:
    assert transcribe_language_config(mode) == expected


def test_transcription_invokes_private_streaming_lambda_without_logging_or_storing_audio(monkeypatch) -> None:
    fake = FakeLambda({"status": "success", "transcript": "मेरा GST भुगतान कब है?", "detectedLanguages": ["hi-IN", "en-IN"]})
    monkeypatch.setattr(voice_module, "_lambda_client", lambda _region, _profile: fake)

    pcm, _duration = voice_module._read_pcm_wav(wav_bytes(), settings())
    transcript, languages = voice_module._invoke_transcriber(
        pcm=pcm,
        mode=VoiceMode.HINGLISH,
        settings=settings(),
    )

    assert transcript == "मेरा GST भुगतान कब है?"
    assert languages == ["hi-IN", "en-IN"]
    assert fake.request is not None
    assert fake.request["FunctionName"] == "voice-transcriber"
    payload = json.loads(fake.request["Payload"])
    assert payload["mode"] == "hinglish"
    assert base64.b64decode(payload["audioBase64"]) == bytes(int(0.1 * 16_000) * 2)


def test_transcription_returns_retryable_safe_errors(monkeypatch) -> None:
    throttled = FakeLambda({"status": "error", "code": "TRANSCRIBE_THROTTLED"})
    monkeypatch.setattr(voice_module, "_lambda_client", lambda _region, _profile: throttled)
    with pytest.raises(VoiceError) as error:
        voice_module._invoke_transcriber(
            pcm=voice_module._read_pcm_wav(wav_bytes(), settings())[0],
            mode=VoiceMode.ENGLISH,
            settings=settings(),
        )
    assert error.value.code == "TRANSCRIPTION_BUSY"
    assert error.value.status_code == 429

    empty = FakeLambda({"status": "error", "code": "EMPTY_TRANSCRIPT"})
    monkeypatch.setattr(voice_module, "_lambda_client", lambda _region, _profile: empty)
    with pytest.raises(VoiceError) as error:
        voice_module._invoke_transcriber(
            pcm=voice_module._read_pcm_wav(wav_bytes(), settings())[0],
            mode=VoiceMode.HINDI,
            settings=settings(),
        )
    assert error.value.code == "EMPTY_TRANSCRIPT"
    assert error.value.status_code == 422


def test_local_transcription_runs_node_helper_without_lambda(monkeypatch) -> None:
    local_settings = VoiceSettings(
        **{**settings().__dict__, "transcriber_mode": "local", "transcriber_function_name": ""}
    )
    captured: dict[str, object] = {}

    def run(command, **kwargs):
        captured["command"] = command
        captured["event"] = json.loads(kwargs["input"])
        return subprocess.CompletedProcess(
            command,
            0,
            stdout=json.dumps({
                "status": "success",
                "transcript": "मेरा balance क्या है?",
                "detectedLanguages": ["hi-IN", "en-IN"],
            }),
            stderr="",
        )

    monkeypatch.setattr(voice_module.subprocess, "run", run)
    transcript, languages = voice_module._invoke_transcriber(
        pcm=b"\0\0" * 100,
        mode=VoiceMode.HINGLISH,
        settings=local_settings,
    )

    assert captured["command"][:3] == ["node", "--import", "tsx"]
    assert captured["event"]["mode"] == "hinglish"
    assert transcript == "मेरा balance क्या है?"
    assert languages == ["hi-IN", "en-IN"]


def test_transcription_rejects_text_above_chat_limit(monkeypatch) -> None:
    fake = FakeLambda({"status": "success", "transcript": "x" * 4_001, "detectedLanguages": ["en-IN"]})
    monkeypatch.setattr(voice_module, "_lambda_client", lambda _region, _profile: fake)
    with pytest.raises(VoiceError) as error:
        voice_module._invoke_transcriber(
            pcm=voice_module._read_pcm_wav(wav_bytes(), settings())[0],
            mode=VoiceMode.ENGLISH,
            settings=settings(),
        )
    assert error.value.code == "TRANSCRIPT_TOO_LONG"
    assert error.value.status_code == 413


@pytest.mark.parametrize(
    ("mode", "expected_language"),
    [(VoiceMode.ENGLISH, "en-IN"), (VoiceMode.HINDI, "hi-IN"), (VoiceMode.HINGLISH, None)],
)
def test_polly_uses_configured_bilingual_voice_and_mode_language(mode, expected_language) -> None:
    client = FakePolly()

    audio = voice_module._synthesize(text="Balance is stable.", mode=mode, settings=settings(), client=client)

    assert audio == b"fake-mp3"
    request = client.synthesis_requests[0]
    assert request["VoiceId"] == "Kajal"
    assert request["Engine"] == "neural"
    assert request["OutputFormat"] == "mp3"
    assert request.get("LanguageCode") == expected_language


def test_polly_rejects_voice_that_does_not_support_both_languages() -> None:
    client = FakePolly(languages=[])
    with pytest.raises(VoiceConfigurationError, match="both en-IN and hi-IN"):
        voice_module._synthesize(text="Balance", mode=VoiceMode.ENGLISH, settings=settings(), client=client)


def test_polly_failures_keep_a_safe_retryable_error() -> None:
    class BrokenPolly(FakePolly):
        def synthesize_speech(self, **_request: object) -> dict[str, object]:
            raise RuntimeError("provider payload must not be surfaced")

    with pytest.raises(VoiceError) as error:
        voice_module._synthesize(
            text="Balance",
            mode=VoiceMode.HINGLISH,
            settings=settings(),
            client=BrokenPolly(),
        )
    assert error.value.code == "SYNTHESIS_UNAVAILABLE"
    assert "provider payload" not in error.value.message


def test_polly_splits_long_answers_at_word_boundaries() -> None:
    client = FakePolly()
    text = "word " * 700

    voice_module._synthesize(text=text, mode=VoiceMode.HINGLISH, settings=settings(), client=client)

    assert len(client.synthesis_requests) > 1
    assert all(len(str(request["Text"])) <= 2_900 for request in client.synthesis_requests)
