import pytest

import finfine_agent.auth as auth
from finfine_agent.auth import AuthenticationError, CognitoAccessTokenValidator


class SigningKey:
    key = "test-key"


class Jwks:
    def get_signing_key_from_jwt(self, token: str) -> SigningKey:
        if token == "missing-key":
            raise auth.PyJWKClientError("no key")
        return SigningKey()


def validator(monkeypatch: pytest.MonkeyPatch, claims: dict) -> CognitoAccessTokenValidator:
    instance = CognitoAccessTokenValidator(
        issuer="https://cognito-idp.example.test/pool",
        client_id="client-id",
    )
    instance.jwks = Jwks()
    monkeypatch.setattr(auth.jwt, "decode", lambda *_args, **_kwargs: claims)
    return instance


def test_valid_access_token_returns_subject(monkeypatch: pytest.MonkeyPatch) -> None:
    result = validator(
        monkeypatch,
        {"iss": "issuer", "sub": "subject", "token_use": "access", "client_id": "client-id"},
    ).validate("token")
    assert result.subject == "subject"


def test_validator_requires_cognito_signature_issuer_and_expiry_claims(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict = {}

    def decode(*_args, **kwargs):
        captured.update(kwargs)
        return {
            "iss": "https://cognito-idp.example.test/pool",
            "sub": "subject",
            "token_use": "access",
            "client_id": "client-id",
        }

    instance = CognitoAccessTokenValidator(
        issuer="https://cognito-idp.example.test/pool",
        client_id="client-id",
    )
    instance.jwks = Jwks()
    monkeypatch.setattr(auth.jwt, "decode", decode)

    instance.validate("token")

    assert captured["algorithms"] == ["RS256"]
    assert captured["issuer"] == "https://cognito-idp.example.test/pool"
    assert set(captured["options"]["require"]) == {
        "exp",
        "iat",
        "iss",
        "sub",
        "token_use",
    }


def test_expired_token_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    instance = CognitoAccessTokenValidator(
        issuer="https://cognito-idp.example.test/pool",
        client_id="client-id",
    )
    instance.jwks = Jwks()

    def expired(*_args, **_kwargs):
        raise auth.jwt.ExpiredSignatureError("expired")

    monkeypatch.setattr(auth.jwt, "decode", expired)
    with pytest.raises(AuthenticationError):
        instance.validate("token")


@pytest.mark.parametrize(
    "claims",
    [
        {"iss": "issuer", "sub": "subject", "token_use": "id", "client_id": "client-id"},
        {"iss": "issuer", "sub": "subject", "token_use": "access", "client_id": "other"},
        {"iss": "issuer", "sub": "", "token_use": "access", "client_id": "client-id"},
    ],
)
def test_invalid_access_claims_are_rejected(monkeypatch: pytest.MonkeyPatch, claims: dict) -> None:
    with pytest.raises(AuthenticationError):
        validator(monkeypatch, claims).validate("token")


def test_missing_or_bad_jwks_token_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    instance = validator(monkeypatch, {})
    with pytest.raises(AuthenticationError):
        instance.validate("")
    with pytest.raises(AuthenticationError):
        instance.validate("missing-key")
