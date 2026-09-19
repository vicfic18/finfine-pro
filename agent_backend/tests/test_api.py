import asyncio
from datetime import UTC, datetime
from uuid import UUID

import httpx

import finfine_agent.api as api_module
from finfine_agent.api import app, get_current_principal, get_runtime_settings
from finfine_agent.auth import AuthenticatedPrincipal
from finfine_agent.config import RuntimeSettings
from finfine_agent.sessions import Conversation, ConversationSummary, VisibleMessage


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


def test_conversation_history_requires_authentication() -> None:
    try:
        app.dependency_overrides[get_runtime_settings] = lambda: RuntimeSettings(
            cognito_issuer="https://cognito-idp.example.test/pool",
            cognito_client_id="client",
            session_bucket="bucket",
        )
        response = request("GET", "/invocations/conversations")
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


def test_conversation_routes_return_only_visible_messages(monkeypatch) -> None:
    session_id = UUID("557dbe23-8e61-41f4-8e42-3925b0eb945e")
    request_id = "315b4a4e-d5f8-4b21-911c-37bb629e869d"
    now = datetime.now(UTC)
    summary = ConversationSummary(str(session_id), "Balance question", now, now)

    class Service:
        async def list_conversations(self, _principal):
            return [summary]

        async def get_conversation(self, _principal, requested_id):
            assert requested_id == session_id
            return Conversation(summary, (VisibleMessage(f"user:{request_id}", "user", "Balance?", now, request_id),))

        async def delete_conversation(self, _principal, requested_id):
            assert requested_id == session_id

    monkeypatch.setattr(api_module, "get_runtime_service", lambda _settings: Service())
    app.dependency_overrides[get_runtime_settings] = lambda: RuntimeSettings(
        cognito_issuer="https://cognito-idp.example.test/pool",
        cognito_client_id="client",
        session_bucket="bucket",
    )
    app.dependency_overrides[get_current_principal] = lambda: AuthenticatedPrincipal("subject", {})
    try:
        listed = request("GET", "/invocations/conversations")
        loaded = request("GET", f"/invocations/conversations/{session_id}")
        deleted = request("DELETE", f"/invocations/conversations/{session_id}")
    finally:
        app.dependency_overrides.clear()

    assert listed.status_code == 200
    assert listed.json()["conversations"][0]["sessionId"] == str(session_id)
    assert loaded.status_code == 200
    assert loaded.json()["conversation"]["messages"] == [{
        "id": f"user:{request_id}",
        "role": "user",
        "content": "Balance?",
        "status": "complete",
        "createdAt": now.isoformat().replace("+00:00", "Z"),
        "requestId": request_id,
    }]
    assert deleted.status_code == 200
    assert deleted.json() == {"status": "success"}
