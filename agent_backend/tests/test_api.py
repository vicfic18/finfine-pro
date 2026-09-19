import asyncio

import httpx

from finfine_agent.api import app, get_answerer


def request(method: str, path: str, **kwargs) -> httpx.Response:
    async def send() -> httpx.Response:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            return await client.request(method, path, **kwargs)

    return asyncio.run(send())


def test_agentcore_runtime_health() -> None:
    response = request("GET", "/ping")

    assert response.status_code == 200
    assert response.json() == {"status": "Healthy"}


def test_agentcore_runtime_invocation() -> None:
    async def answerer():
        return lambda question: f"answer:{question}"

    app.dependency_overrides[get_answerer] = answerer
    try:
        response = request("POST", "/invocations", json={"prompt": "  My balance?  "})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"status": "success", "answer": "answer:My balance?"}


def test_query_rejects_blank_question() -> None:
    response = request("POST", "/invocations", json={"prompt": "   "})

    assert response.status_code == 422


def test_query_returns_safe_service_error() -> None:
    def unavailable(_question: str) -> str:
        raise RuntimeError("secret internal failure")

    async def answerer():
        return unavailable

    app.dependency_overrides[get_answerer] = answerer
    try:
        response = request("POST", "/invocations", json={"prompt": "My balance?"})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 503
    assert response.json() == {
        "status": "error",
        "error": "The agent could not complete the request. Check the backend terminal for details.",
    }
