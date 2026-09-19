"""Cognito access-token validation for the runtime API."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import jwt
from jwt import InvalidTokenError, PyJWKClient
from jwt.exceptions import PyJWKClientError


class AuthenticationError(Exception):
    """A token was missing or failed the access-token contract."""


@dataclass(frozen=True)
class AuthenticatedPrincipal:
    """Minimal identity needed for tenant-scoped session handling."""

    subject: str
    claims: dict[str, Any]


class CognitoAccessTokenValidator:
    """Validate Cognito access JWTs using PyJWT's cached JWKS client."""

    def __init__(self, *, issuer: str, client_id: str) -> None:
        if not issuer or not client_id:
            raise ValueError("Cognito issuer and client ID are required")
        self.issuer = issuer.rstrip("/")
        self.client_id = client_id
        self.jwks = PyJWKClient(
            f"{self.issuer}/.well-known/jwks.json",
            cache_jwk_set=True,
            lifespan=300,
            max_cached_keys=16,
        )

    def validate(self, token: str) -> AuthenticatedPrincipal:
        if not token:
            raise AuthenticationError("authentication is required")
        try:
            signing_key = self.jwks.get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                issuer=self.issuer,
                options={
                    "require": ["exp", "iat", "iss", "sub", "token_use"],
                    "verify_aud": False,
                },
            )
        except (InvalidTokenError, PyJWKClientError, ValueError, TypeError) as exc:
            raise AuthenticationError("invalid authentication token") from exc

        if claims.get("token_use") != "access":
            raise AuthenticationError("invalid authentication token")
        if claims.get("client_id") != self.client_id:
            raise AuthenticationError("invalid authentication token")
        subject = claims.get("sub")
        if not isinstance(subject, str) or not subject:
            raise AuthenticationError("invalid authentication token")
        return AuthenticatedPrincipal(subject=subject, claims=claims)
