import asyncio
from threading import Event

from finfine_agent.streaming import stream_agent


def test_stream_agent_exposes_status_but_not_reasoning_code_or_results() -> None:
    class Result:
        def __init__(self) -> None:
            self.stop_reason = "end_turn"
            self.message = {"content": [{"text": "Final answer"}]}

    class FakeAgent:
        async def stream_async(self, _question, **_kwargs):
            yield {"reasoningText": "private chain of thought"}
            yield {
                "current_tool_use": {
                    "name": "run_financial_python",
                    "toolUseId": "tool-1",
                    "input": '{"code":"print(secret)"}',
                }
            }
            yield {"tool_result": {"content": "private result"}}
            yield {"data": "Final "}
            yield {"data": "answer"}
            yield {"result": Result()}

    async def collect():
        return [
            event
            async for event in stream_agent(
                FakeAgent(),
                "question",
                request_id="request-1",
                timeout_seconds=1,
                cancel_signal=Event(),
            )
        ]

    events = asyncio.run(collect())
    assert events == [
        {"type": "step", "step": {"id": "tool-1", "kind": "code", "title": "Running a financial calculation", "status": "running"}},
        {"type": "step", "step": {"id": "tool-1", "kind": "code", "title": "Running a financial calculation", "status": "complete"}},
        {"type": "text_delta", "delta": "Final "},
        {"type": "text_delta", "delta": "answer"},
        {"type": "answer", "answer": "Final answer"},
    ]
    serialized = repr(events)
    assert "private chain of thought" not in serialized
    assert "print(secret)" not in serialized
    assert "private result" not in serialized
