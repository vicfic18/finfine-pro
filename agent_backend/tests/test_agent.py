import sys

import pytest

import finfine_agent.agent as agent_module
from finfine_agent.agent import ask, create_agent
from finfine_agent.config import AgentSettings


def settings() -> AgentSettings:
    return AgentSettings(
        model_base_url="https://example.invalid/v1",
        model_id="test-model",
        model_api_key="test-key",
        model_max_tokens=1024,
        model_temperature=0,
        code_executor_region="ap-south-1",
        code_executor_function_name="test-executor",
    )


def test_create_agent_registers_financial_and_code_tools() -> None:
    captured = {}

    def fake_agent_factory(**kwargs):
        captured.update(kwargs)
        return kwargs

    class FakeExecutor:
        def execute(self, **_request):
            return {"status": "success", "stdout": "ok"}

    result = create_agent(
        settings(),
        model="fake-model",
        code_executor=FakeExecutor(),
        agent_factory=fake_agent_factory,
    )

    assert result["model"] == "fake-model"
    assert "Current local date and time:" in captured["system_prompt"]
    assert [tool.tool_name for tool in captured["tools"]] == [
        "load_analysis_skill",
        "get_latest_balance",
        "get_transactions",
        "get_upcoming_obligations",
        "get_business_data",
        "export_transactions_csv",
        "export_business_data_csv",
        "run_financial_python",
        "predict_cash_flow_sagemaker",
    ]
    assert "Never invent" in captured["system_prompt"]
    assert "verify a total returned by a data tool" in captured["system_prompt"]
    assert "Use get_business_data" in captured["system_prompt"]
    assert "Skill loading is optional" in captured["system_prompt"]
    assert "The user does not need to ask for Python" in captured["system_prompt"]
    assert "do not answer until you have called" in captured["system_prompt"]
    assert captured["callback_handler"] is not None
    assert len(captured["plugins"]) == 1


def test_create_model_excludes_openrouter_reasoning_metadata(monkeypatch) -> None:
    captured = {}

    def fake_model(**kwargs):
        captured.update(kwargs)
        return kwargs

    monkeypatch.setattr(agent_module, "OpenAIModel", fake_model)

    openrouter_settings = settings()
    openrouter_settings = AgentSettings(
        **{
            **openrouter_settings.__dict__,
            "model_base_url": "https://openrouter.ai/api/v1",
        }
    )
    agent_module.create_model(openrouter_settings)

    assert captured["params"]["extra_body"] == {
        "reasoning": {"enabled": False, "exclude": True}
    }


def test_create_model_uses_native_gemini_provider_for_google(monkeypatch) -> None:
    captured = {}

    def fake_model(**kwargs):
        captured.update(kwargs)
        return kwargs

    monkeypatch.setattr(agent_module, "GeminiModel", fake_model)
    google_settings = settings()
    google_settings = AgentSettings(
        **{
            **google_settings.__dict__,
            "model_base_url": (
                "https://generativelanguage.googleapis.com/v1beta/openai/"
            ),
            "model_id": "gemma-4-31b-it",
        }
    )

    agent_module.create_model(google_settings)

    assert captured == {
        "client_args": {"api_key": "test-key"},
        "model_id": "gemma-4-31b-it",
        "params": {"max_output_tokens": 1024, "temperature": 0},
    }


def test_create_model_disables_minimax_thinking_output(monkeypatch) -> None:
    captured = {}

    def fake_model(**kwargs):
        captured.update(kwargs)
        return kwargs

    monkeypatch.setattr(agent_module, "OpenAIModel", fake_model)
    minimax_settings = settings()
    minimax_settings = AgentSettings(
        **{
            **minimax_settings.__dict__,
            "model_base_url": "https://api.minimax.io/v1",
            "model_id": "MiniMax-M3",
        }
    )

    agent_module.create_model(minimax_settings)

    assert captured["model_id"] == "MiniMax-M3"
    assert captured["client_args"]["base_url"] == "https://api.minimax.io/v1"
    assert captured["params"]["extra_body"] == {
        "thinking": {"type": "disabled"},
    }


def test_ask_passes_question_to_agent() -> None:
    assert ask(lambda prompt: f"answer:{prompt}", "  Can I spend 1000? ") == (
        "answer:Can I spend 1000?"
    )


def test_trace_can_be_disabled() -> None:
    captured = {}

    def fake_agent_factory(**kwargs):
        captured.update(kwargs)
        return kwargs

    class FakeExecutor:
        def execute(self, **_request):
            return {"status": "success", "stdout": ""}

    create_agent(
        settings(),
        model="fake-model",
        code_executor=FakeExecutor(),
        agent_factory=fake_agent_factory,
        trace=False,
    )

    assert captured["callback_handler"] is None
    assert "plugins" not in captured


@pytest.mark.parametrize("agent_error", [None, RuntimeError("agent failed")])
def test_main_reports_agent_result(monkeypatch, agent_error) -> None:
    def fake_agent(_question: str) -> str:
        if agent_error is not None:
            raise agent_error
        return "answer"

    monkeypatch.setattr(sys, "argv", ["finfine-agent", "question", "--quiet"])
    monkeypatch.setattr(
        agent_module.AgentSettings,
        "from_environment",
        classmethod(lambda cls: settings()),
    )
    monkeypatch.setattr(
        agent_module,
        "create_agent",
        lambda *args, **kwargs: fake_agent,
    )

    assert agent_module.main() == (2 if agent_error else 0)
