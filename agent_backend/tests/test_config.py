import pytest

import finfine_agent.config as config_module
from finfine_agent.config import AgentSettings, RuntimeSettings, VoiceSettings


def test_agent_settings_default_to_pinned_openrouter_model(monkeypatch) -> None:
    monkeypatch.setattr(config_module, "_load_local_environment", lambda: None)
    for name in (
        "MODEL_API_KEY",
        "MODEL_BASE_URL",
        "MODEL_ID",
        "MODEL_MAX_TOKENS",
        "MODEL_TEMPERATURE",
    ):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-openrouter-key")
    monkeypatch.setenv("CODE_EXECUTOR_FUNCTION_NAME", "test-executor")

    settings = AgentSettings.from_environment()

    assert settings.model_api_key == "test-openrouter-key"
    assert settings.model_base_url == "https://openrouter.ai/api/v1"
    assert settings.model_id == "nex-agi/nex-n2.5-pro:free"


def test_agent_settings_reports_missing_openrouter_key(monkeypatch) -> None:
    monkeypatch.setattr(config_module, "_load_local_environment", lambda: None)
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.delenv("MODEL_API_KEY", raising=False)
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.setenv("CODE_EXECUTOR_FUNCTION_NAME", "test-executor")

    with pytest.raises(RuntimeError, match="OPENROUTER_API_KEY"):
        AgentSettings.from_environment()


def test_runtime_settings_keep_cognito_and_session_regions_independent(
    monkeypatch,
) -> None:
    monkeypatch.setattr(config_module, "_load_local_environment", lambda: None)
    monkeypatch.delenv("COGNITO_ISSUER", raising=False)
    monkeypatch.setenv("AWS_REGION", "ap-south-1")
    monkeypatch.setenv("COGNITO_USER_POOL_ID", "us-east-1_example")
    monkeypatch.setenv("COGNITO_CLIENT_ID", "client")
    monkeypatch.setenv("AGENT_SESSION_BUCKET_NAME", "bucket")
    monkeypatch.setenv("AGENT_SESSION_REGION", "us-east-1")

    settings = RuntimeSettings.from_environment()

    assert settings.cognito_issuer == (
        "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_example"
    )
    assert settings.aws_region == "ap-south-1"
    assert settings.session_region == "us-east-1"


def test_voice_settings_default_to_customizable_bilingual_polly_configuration(monkeypatch) -> None:
    monkeypatch.setattr(config_module, "_load_local_environment", lambda: None)
    for name in (
        "VOICE_AWS_REGION",
        "VOICE_TRANSCRIBER_MODE",
        "VOICE_TRANSCRIBER_REGION",
        "POLLY_VOICE_ID",
        "POLLY_ENGINE",
        "POLLY_OUTPUT_FORMAT",
        "VOICE_MAX_DURATION_SECONDS",
        "VOICE_MAX_AUDIO_BYTES",
    ):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("VOICE_TRANSCRIBER_FUNCTION_NAME", "voice-transcriber")

    settings = VoiceSettings.from_environment()

    assert settings.aws_region == "ap-south-1"
    assert settings.polly_voice_id == "Kajal"
    assert settings.polly_engine == "neural"
    assert settings.polly_output_format == "mp3"
    assert settings.max_duration_seconds == 30
    assert settings.max_audio_bytes == 1_048_576
    assert settings.transcriber_mode == "lambda"


def test_local_voice_transcriber_does_not_require_a_lambda_name(monkeypatch) -> None:
    monkeypatch.setattr(config_module, "_load_local_environment", lambda: None)
    monkeypatch.setenv("VOICE_TRANSCRIBER_MODE", "local")
    monkeypatch.delenv("VOICE_TRANSCRIBER_FUNCTION_NAME", raising=False)

    settings = VoiceSettings.from_environment()

    assert settings.transcriber_mode == "local"
    assert settings.transcriber_function_name == ""


def test_voice_settings_reject_incompatible_output_format_and_limits(monkeypatch) -> None:
    monkeypatch.setattr(config_module, "_load_local_environment", lambda: None)
    monkeypatch.setenv("VOICE_TRANSCRIBER_FUNCTION_NAME", "voice-transcriber")
    monkeypatch.setenv("POLLY_OUTPUT_FORMAT", "pcm")
    with pytest.raises(ValueError, match="POLLY_OUTPUT_FORMAT"):
        VoiceSettings.from_environment()

    monkeypatch.setenv("POLLY_OUTPUT_FORMAT", "mp3")
    monkeypatch.setenv("VOICE_MAX_DURATION_SECONDS", "31")
    with pytest.raises(ValueError, match="VOICE_MAX_DURATION_SECONDS"):
        VoiceSettings.from_environment()
