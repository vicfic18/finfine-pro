import asyncio
from uuid import uuid4

import httpx

from finfine_agent.api import (
    _cached_token_validator,
    app,
    get_current_principal,
    get_runtime_settings,
)
from finfine_agent.auth import AuthenticatedPrincipal
from finfine_agent.config import RuntimeSettings


def request(method: str, path: str, **kwargs: object) -> httpx.Response:
    async def send() -> httpx.Response:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            return await client.request(method, path, **kwargs)

    return asyncio.run(send())


def settings() -> RuntimeSettings:
    return RuntimeSettings(
        cognito_issuer="https://cognito-idp.example.test/pool",
        cognito_client_id="client",
        session_bucket="bucket",
    )


def test_missing_bearer_token_has_strict_safe_error_shape() -> None:
    app.dependency_overrides[get_runtime_settings] = settings
    try:
        response = request(
            "POST",
            "/invocations",
            json={"prompt": "What is my balance?", "requestId": str(uuid4())},
        )
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 401
    assert set(response.json()) == {"status", "requestId", "code", "message"}
    assert response.json()["status"] == "error"


def test_missing_request_id_is_rejected_without_internal_details() -> None:
    app.dependency_overrides[get_runtime_settings] = settings
    app.dependency_overrides[get_current_principal] = lambda: AuthenticatedPrincipal("subject", {})
    try:
        response = request("POST", "/invocations", json={"prompt": "What is my balance?"})
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 422
    assert set(response.json()) == {"status", "requestId", "code", "message"}
    assert "validation" not in response.json()["message"].lower()


def test_token_validator_reuses_its_jwks_cache() -> None:
    _cached_token_validator.cache_clear()

    first = _cached_token_validator("https://cognito-idp.example.test/pool", "client")
    second = _cached_token_validator("https://cognito-idp.example.test/pool", "client")

    assert first is second
