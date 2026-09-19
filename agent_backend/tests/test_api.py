import asyncio

import httpx

from finfine_agent.api import app, get_current_principal, get_runtime_settings
from finfine_agent.auth import AuthenticatedPrincipal
from finfine_agent.config import RuntimeSettings


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


def test_agentcore_runtime_invocation_requires_authentication() -> None:
    try:
        app.dependency_overrides[get_runtime_settings] = lambda: RuntimeSettings(
            cognito_issuer="https://cognito-idp.example.test/pool",
            cognito_client_id="client",
            session_bucket="bucket",
        )
        response = request(
            "POST",
            "/invocations",
            json={"prompt": "My balance?", "requestId": "00000000-0000-4000-8000-000000000001"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 401
    assert set(response.json()) == {"status", "requestId", "code", "message"}


def test_query_rejects_blank_question() -> None:
    app.dependency_overrides[get_runtime_settings] = lambda: RuntimeSettings(
        cognito_issuer="https://cognito-idp.example.test/pool",
        cognito_client_id="client",
        session_bucket="bucket",
    )
    app.dependency_overrides[get_current_principal] = lambda: AuthenticatedPrincipal(
        "subject", {}
    )
    try:
        response = request(
            "POST",
            "/invocations",
            json={"prompt": "   ", "requestId": "00000000-0000-4000-8000-000000000001"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422
    assert response.json()["code"] == "INVALID_REQUEST"


def test_query_requires_request_id() -> None:
    app.dependency_overrides[get_runtime_settings] = lambda: RuntimeSettings(
        cognito_issuer="https://cognito-idp.example.test/pool",
        cognito_client_id="client",
        session_bucket="bucket",
    )
    app.dependency_overrides[get_current_principal] = lambda: AuthenticatedPrincipal(
        "subject", {}
    )
    try:
        response = request("POST", "/invocations", json={"prompt": "My balance?"})
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 422
    assert response.json()["code"] == "INVALID_REQUEST"
