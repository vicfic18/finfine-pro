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
        code_interpreter_region="ap-south-1",
        code_interpreter_session_timeout_seconds=900,
    )


def test_create_agent_registers_financial_and_code_tools() -> None:
    captured = {}

    def fake_agent_factory(**kwargs):
        captured.update(kwargs)
        return kwargs

    class FakeInterpreter:
        def execute_code(self, action):
            return {"status": "success", "content": [{"text": "ok"}]}

    result = create_agent(
        settings(),
        model="fake-model",
        code_interpreter=FakeInterpreter(),
        agent_factory=fake_agent_factory,
    )

    assert result["model"] == "fake-model"
    assert [tool.tool_name for tool in captured["tools"][:3]] == [
        "get_latest_balance",
        "get_transactions",
        "get_upcoming_obligations",
    ]
    assert captured["tools"][3].tool_name == "run_financial_python"
    assert "Never invent" in captured["system_prompt"]
    assert captured["callback_handler"] is not None
    assert len(captured["plugins"]) == 1


def test_ask_passes_question_to_agent() -> None:
    assert ask(lambda prompt: f"answer:{prompt}", "  Can I spend 1000? ") == (
        "answer:Can I spend 1000?"
    )


def test_trace_can_be_disabled() -> None:
    captured = {}

    def fake_agent_factory(**kwargs):
        captured.update(kwargs)
        return kwargs

    class FakeInterpreter:
        def execute_code(self, action):
            return {"status": "success", "content": []}

    create_agent(
        settings(),
        model="fake-model",
        code_interpreter=FakeInterpreter(),
        agent_factory=fake_agent_factory,
        trace=False,
    )

    assert captured["callback_handler"] is None
    assert "plugins" not in captured


@pytest.mark.parametrize("agent_error", [None, RuntimeError("agent failed")])
def test_main_always_cleans_up_code_interpreter(monkeypatch, agent_error) -> None:
    class FakeInterpreter:
        def __init__(self) -> None:
            self.cleanup_calls = 0

        def cleanup_platform(self) -> None:
            self.cleanup_calls += 1

    interpreter = FakeInterpreter()

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
        "create_code_interpreter",
        lambda _settings: interpreter,
    )
    monkeypatch.setattr(
        agent_module,
        "create_agent",
        lambda *args, **kwargs: fake_agent,
    )

    assert agent_module.main() == (2 if agent_error else 0)
    assert interpreter.cleanup_calls == 1
