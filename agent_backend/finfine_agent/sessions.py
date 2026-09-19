"""Private S3-backed session metadata and completed-result idempotency."""

from __future__ import annotations

import hashlib
import json
import logging
from collections import OrderedDict
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from threading import Lock
from typing import Any
from uuid import UUID, uuid4

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from finfine_agent.config import RuntimeSettings

logger = logging.getLogger(__name__)


class SessionUnavailableError(Exception):
    """The requested session is unknown, foreign, expired, or incompatible."""


class RequestConflictError(Exception):
    """A request ID was already completed for different request context."""


@dataclass(frozen=True)
class SessionRecord:
    public_id: str
    storage_id: str
    owner_digest: str
    expires_at: datetime


@dataclass(frozen=True)
class CompletedResult:
    request_id: str
    session_id: str
    prompt_hash: str
    answer: str


def _is_not_found(exc: ClientError) -> bool:
    return exc.response.get("Error", {}).get("Code") in {
        "404",
        "NoSuchKey",
        "NotFound",
    }


def _is_precondition_failed(exc: ClientError) -> bool:
    return exc.response.get("Error", {}).get("Code") in {
        "PreconditionFailed",
        "412",
    }


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _iso(value: datetime) -> str:
    return value.astimezone(UTC).isoformat()


def _parse_expiry(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    return parsed.astimezone(UTC) if parsed.tzinfo else parsed.replace(tzinfo=UTC)


class S3SessionRegistry:
    """Own session metadata separately from Strands' snapshot objects."""

    def __init__(
        self,
        settings: RuntimeSettings,
        *,
        s3_client: Any | None = None,
        boto_session: Any | None = None,
    ) -> None:
        self.settings = settings
        if s3_client is not None:
            self.s3 = s3_client
        else:
            session = boto_session or boto3.Session(
                profile_name=settings.aws_profile,
                region_name=settings.session_region,
            )
            self.s3 = session.client(
                "s3",
                config=Config(
                    retries={"total_max_attempts": 3, "mode": "adaptive"},
                    connect_timeout=5,
                    read_timeout=15,
                    max_pool_connections=50,
                ),
            )

    @property
    def prefix(self) -> str:
        return self.settings.session_prefix

    def metadata_key(self, storage_id: str) -> str:
        return f"{self.prefix}metadata/{storage_id}.json"

    def idempotency_key(self, request_id: str) -> str:
        return f"{self.prefix}idempotency/{request_id}.json"

    def storage_id(self, subject: str, public_id: str) -> str:
        value = f"{subject}\x00{public_id}\x00{self.settings.agent_version}".encode()
        return hashlib.sha256(value).hexdigest()

    @staticmethod
    def owner_digest(subject: str) -> str:
        return hashlib.sha256(subject.encode()).hexdigest()

    def _head_metadata(self, key: str) -> dict[str, str] | None:
        try:
            response = self.s3.head_object(Bucket=self.settings.session_bucket, Key=key)
        except ClientError as exc:
            if _is_not_found(exc):
                return None
            raise
        return {str(k).lower(): str(v) for k, v in response.get("Metadata", {}).items()}

    def _validate_metadata(
        self,
        metadata: dict[str, str] | None,
        *,
        owner_digest: str,
    ) -> datetime:
        expiry = _parse_expiry(metadata.get("expiry") if metadata else None)
        if (
            not metadata
            or metadata.get("owner") != owner_digest
            or metadata.get("version") != self.settings.agent_version
            or expiry is None
            or expiry <= _utc_now()
        ):
            raise SessionUnavailableError("session unavailable")
        return expiry

    def resolve(self, *, subject: str, public_id: UUID | None) -> SessionRecord:
        """Resolve a public UUID without exposing the opaque storage key."""
        requested = public_id is not None
        public = str(public_id or uuid4())
        owner = self.owner_digest(subject)
        opaque = self.storage_id(subject, public)
        key = self.metadata_key(opaque)
        metadata = self._head_metadata(key)
        if metadata is None:
            if requested:
                raise SessionUnavailableError("session unavailable")
            expiry = _utc_now() + timedelta(days=self.settings.session_retention_days)
            metadata = {"owner": owner, "version": self.settings.agent_version, "expiry": _iso(expiry)}
            try:
                self.s3.put_object(
                    Bucket=self.settings.session_bucket,
                    Key=key,
                    Body=b"{}",
                    ContentType="application/json",
                    Metadata=metadata,
                    IfNoneMatch="*",
                )
            except ClientError as exc:
                if not _is_precondition_failed(exc):
                    raise
                metadata = self._head_metadata(key)
            expiry = self._validate_metadata(metadata, owner_digest=owner)
        else:
            expiry = self._validate_metadata(metadata, owner_digest=owner)
        return SessionRecord(public, opaque, owner, expiry)

    def touch(self, record: SessionRecord) -> None:
        expiry = _utc_now() + timedelta(days=self.settings.session_retention_days)
        metadata = {
            "owner": record.owner_digest,
            "version": self.settings.agent_version,
            "expiry": _iso(expiry),
        }
        self.s3.put_object(
            Bucket=self.settings.session_bucket,
            Key=self.metadata_key(record.storage_id),
            Body=b"{}",
            ContentType="application/json",
            Metadata=metadata,
        )

    def get_completed(
        self,
        *,
        request_id: str,
        subject: str,
        session_id: str,
        prompt_hash: str,
    ) -> CompletedResult | None:
        key = self.idempotency_key(request_id)
        try:
            response = self.s3.get_object(Bucket=self.settings.session_bucket, Key=key)
        except ClientError as exc:
            if _is_not_found(exc):
                return None
            raise
        body = response["Body"]
        try:
            payload = json.loads(body.read())
        finally:
            body.close()
        matches = (
            payload.get("owner") == self.owner_digest(subject)
            and payload.get("session_id") == session_id
            and payload.get("prompt_hash") == prompt_hash
            and payload.get("version") == self.settings.agent_version
        )
        if not matches:
            raise RequestConflictError("request ID already used")
        answer = payload.get("answer")
        if not isinstance(answer, str):
            raise RequestConflictError("request ID already used")
        return CompletedResult(request_id, session_id, prompt_hash, answer)

    def put_completed(self, result: CompletedResult, *, subject: str) -> CompletedResult:
        payload = {
            "request_id": result.request_id,
            "session_id": result.session_id,
            "prompt_hash": result.prompt_hash,
            "answer": result.answer,
            "owner": self.owner_digest(subject),
            "version": self.settings.agent_version,
            "completed_at": _iso(_utc_now()),
        }
        try:
            self.s3.put_object(
                Bucket=self.settings.session_bucket,
                Key=self.idempotency_key(result.request_id),
                Body=json.dumps(payload, separators=(",", ":")).encode(),
                ContentType="application/json",
                Metadata={
                    "owner": self.owner_digest(subject),
                    "version": self.settings.agent_version,
                },
                IfNoneMatch="*",
            )
            return result
        except ClientError as exc:
            if not _is_precondition_failed(exc):
                raise
            existing = self.get_completed(
                request_id=result.request_id,
                subject=subject,
                session_id=result.session_id,
                prompt_hash=result.prompt_hash,
            )
            if existing is None:
                raise RuntimeError("completed result disappeared") from exc
            return existing


class SessionLockPool:
    """Bounded per-session locks for one API process."""

    def __init__(self, max_entries: int = 1024) -> None:
        self.max_entries = max_entries
        self._locks: OrderedDict[str, Any] = OrderedDict()
        self._guard = Lock()

    def get(self, key: str) -> Any:
        import asyncio

        with self._guard:
            lock = self._locks.get(key)
            if lock is None:
                lock = asyncio.Lock()
                self._locks[key] = lock
            self._locks.move_to_end(key)
            while len(self._locks) > self.max_entries:
                old_key, old_lock = next(iter(self._locks.items()))
                if old_lock.locked():
                    self._locks.move_to_end(old_key)
                    break
                self._locks.pop(old_key)
            return lock
