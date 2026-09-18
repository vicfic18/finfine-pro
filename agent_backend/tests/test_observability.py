from finfine_agent.observability import TerminalModelTrace, _display


def test_display_redacts_nested_secrets() -> None:
    rendered = _display(
        {
            "MODEL_API_KEY": "private-value",
            "nested": {"authorization": "Bearer private-value"},
            "amount": 1000,
        }
    )

    assert "private-value" not in rendered
    assert rendered.count("[REDACTED]") == 2
    assert "1000" in rendered


def test_model_trace_prints_lifecycle(capsys) -> None:
    trace = TerminalModelTrace()

    trace(init_event_loop=True)
    trace(data="Checking records")
    trace(result={"ok": True})

    output = capsys.readouterr().out
    assert "[agent] Working..." in output
    assert "[model] Checking records" in output
    assert "[agent] Completed." in output
