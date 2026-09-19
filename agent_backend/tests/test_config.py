import pytest

import finfine_agent.config as config_module
from finfine_agent.config import AgentSettings


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
    monkeypatch.setenv("CODE_EXECUTOR_FUNCTION_NAME", "test-executor")

    with pytest.raises(RuntimeError, match="OPENROUTER_API_KEY"):
        AgentSettings.from_environment()
