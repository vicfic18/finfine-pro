"""Private S3-backed sessions, visible transcripts, and idempotency."""

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

CATALOG_VERSION = 1
MAX_TRANSCRIPT_MESSAGES = 100
MAX_MESSAGE_LENGTH = 12_000
MAX_TITLE_LENGTH = 64


class SessionUnavailableError(Exception):
    """The requested session is unknown, foreign, expired, or incompatible."""


class RequestConflictError(Exception):
    """A request ID was already completed for different request context."""


class ConversationNotFoundError(Exception):
    """The requested visible conversation does not exist for this owner."""


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


@dataclass(frozen=True)
class ConversationSummary:
    session_id: str
    title: str
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class VisibleMessage:
    id: str
    role: str
    content: str
    created_at: datetime
    request_id: str


@dataclass(frozen=True)
class Conversation:
    summary: ConversationSummary
    messages: tuple[VisibleMessage, ...]


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


def _conversation_title(prompt: str) -> str:
    title = " ".join(prompt.split())
    if len(title) <= MAX_TITLE_LENGTH:
        return title
    return f"{title[: MAX_TITLE_LENGTH - 1].rstrip()}…"


def _message_id(role: str, request_id: str) -> str:
    return f"{role}:{request_id}"


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

    def catalog_key(self, owner_digest: str) -> str:
        return f"{self.prefix}conversations/{owner_digest}/index.json"

    def transcript_key(self, owner_digest: str, session_id: str) -> str:
        return f"{self.prefix}conversations/{owner_digest}/{session_id}.json"

    def snapshot_prefix(self, storage_id: str) -> str:
        return f"{self.prefix}{storage_id}/"

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

    def _read_json(self, key: str) -> dict[str, Any] | None:
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
        if not isinstance(payload, dict):
            raise RuntimeError(f"S3 JSON object is not a mapping: {key}")
        return payload

    def _write_json(self, key: str, payload: dict[str, Any]) -> None:
        self.s3.put_object(
            Bucket=self.settings.session_bucket,
            Key=key,
            Body=json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode(),
            ContentType="application/json",
        )

    def _delete_key(self, key: str) -> None:
        self.s3.delete_object(Bucket=self.settings.session_bucket, Key=key)

    def _keys_with_prefix(self, prefix: str) -> list[str]:
        paginator = self.s3.get_paginator("list_objects_v2")
        pages = paginator.paginate(Bucket=self.settings.session_bucket, Prefix=prefix)
        return [item["Key"] for page in pages for item in page.get("Contents", [])]

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

    def list_conversations(self, *, subject: str) -> list[ConversationSummary]:
        owner = self.owner_digest(subject)
        payload = self._read_json(self.catalog_key(owner))
        if payload is None:
            return []
        if payload.get("version") != CATALOG_VERSION or payload.get("owner") != owner:
            raise RuntimeError("conversation catalog is incompatible")

        cutoff = _utc_now() - timedelta(days=self.settings.session_retention_days)
        summaries: list[ConversationSummary] = []
        for item in payload.get("conversations", []):
            if not isinstance(item, dict) or item.get("agent_version") != self.settings.agent_version:
                continue
            created_at = _parse_expiry(item.get("created_at"))
            updated_at = _parse_expiry(item.get("updated_at"))
            session_id = item.get("session_id")
            title = item.get("title")
            if (
                not isinstance(session_id, str)
                or not isinstance(title, str)
                or created_at is None
                or updated_at is None
                or updated_at <= cutoff
            ):
                continue
            try:
                UUID(session_id)
            except ValueError:
                continue
            summaries.append(ConversationSummary(session_id, title, created_at, updated_at))
        return sorted(summaries, key=lambda item: item.updated_at, reverse=True)

    def get_conversation(self, *, subject: str, session_id: UUID) -> Conversation:
        record = self.resolve(subject=subject, public_id=session_id)
        owner = self.owner_digest(subject)
        payload = self._read_json(self.transcript_key(owner, record.public_id))
        if payload is None:
            raise ConversationNotFoundError("conversation not found")
        return self._parse_conversation(payload, owner=owner, session_id=record.public_id)

    def record_completed_turn(
        self,
        *,
        subject: str,
        record: SessionRecord,
        request_id: str,
        prompt: str,
        answer: str,
    ) -> ConversationSummary:
        owner = self.owner_digest(subject)
        key = self.transcript_key(owner, record.public_id)
        payload = self._read_json(key)
        now = _utc_now()

        if payload is None:
            created_at = now
            updated_at = now
            title = _conversation_title(prompt)
            messages: list[dict[str, Any]] = []
            request_ids: list[str] = []
        else:
            conversation = self._parse_conversation(payload, owner=owner, session_id=record.public_id)
            created_at = conversation.summary.created_at
            updated_at = conversation.summary.updated_at
            title = conversation.summary.title
            messages = [self._message_payload(message) for message in conversation.messages]
            request_ids = [item for item in payload.get("request_ids", []) if isinstance(item, str)]
            if not request_ids:
                request_ids = list(dict.fromkeys(message.request_id for message in conversation.messages))

        if request_id not in request_ids:
            updated_at = now
            request_ids.append(request_id)
            messages.extend(
                [
                    {
                        "id": _message_id("user", request_id),
                        "role": "user",
                        "content": prompt[:MAX_MESSAGE_LENGTH],
                        "created_at": _iso(now),
                        "request_id": request_id,
                    },
                    {
                        "id": _message_id("assistant", request_id),
                        "role": "assistant",
                        "content": answer[:MAX_MESSAGE_LENGTH],
                        "created_at": _iso(now),
                        "request_id": request_id,
                    },
                ]
            )
        messages = messages[-MAX_TRANSCRIPT_MESSAGES:]
        transcript = {
            "version": CATALOG_VERSION,
            "owner": owner,
            "agent_version": self.settings.agent_version,
            "session_id": record.public_id,
            "title": title,
            "created_at": _iso(created_at),
            "updated_at": _iso(updated_at),
            "messages": messages,
            "request_ids": request_ids,
        }
        self._write_json(key, transcript)

        summary = ConversationSummary(record.public_id, title, created_at, updated_at)
        self._upsert_catalog(owner=owner, summary=summary)
        return summary

    def delete_conversation(self, *, subject: str, session_id: UUID) -> None:
        owner = self.owner_digest(subject)
        public_id = str(session_id)
        storage_id = self.storage_id(subject, public_id)
        transcript_key = self.transcript_key(owner, public_id)
        payload = self._read_json(transcript_key)

        request_ids: set[str] = set()
        if payload is not None:
            conversation = self._parse_conversation(payload, owner=owner, session_id=public_id)
            request_ids = {item for item in payload.get("request_ids", []) if isinstance(item, str)}
            request_ids.update(message.request_id for message in conversation.messages)

        keys = self._keys_with_prefix(self.snapshot_prefix(storage_id))
        keys.extend(
            [
                self.metadata_key(storage_id),
                transcript_key,
                *(self.idempotency_key(request_id) for request_id in request_ids),
            ]
        )
        for key in dict.fromkeys(keys):
            self._delete_key(key)
        self._remove_from_catalog(owner=owner, session_id=public_id)

    def _parse_conversation(self, payload: dict[str, Any], *, owner: str, session_id: str) -> Conversation:
        if (
            payload.get("version") != CATALOG_VERSION
            or payload.get("owner") != owner
            or payload.get("agent_version") != self.settings.agent_version
            or payload.get("session_id") != session_id
        ):
            raise ConversationNotFoundError("conversation not found")
        created_at = _parse_expiry(payload.get("created_at"))
        updated_at = _parse_expiry(payload.get("updated_at"))
        title = payload.get("title")
        if created_at is None or updated_at is None or not isinstance(title, str):
            raise RuntimeError("conversation transcript is invalid")

        messages: list[VisibleMessage] = []
        for item in payload.get("messages", []):
            if not isinstance(item, dict):
                continue
            role = item.get("role")
            message_id = item.get("id")
            content = item.get("content")
            request_id = item.get("request_id")
            message_created_at = _parse_expiry(item.get("created_at"))
            if (
                role not in {"user", "assistant"}
                or not isinstance(message_id, str)
                or not isinstance(content, str)
                or not isinstance(request_id, str)
                or message_created_at is None
            ):
                continue
            messages.append(VisibleMessage(message_id, role, content, message_created_at, request_id))
        summary = ConversationSummary(session_id, title, created_at, updated_at)
        return Conversation(summary, tuple(messages[-MAX_TRANSCRIPT_MESSAGES:]))

    @staticmethod
    def _message_payload(message: VisibleMessage) -> dict[str, Any]:
        return {
            "id": message.id,
            "role": message.role,
            "content": message.content,
            "created_at": _iso(message.created_at),
            "request_id": message.request_id,
        }

    def _upsert_catalog(self, *, owner: str, summary: ConversationSummary) -> None:
        current = [item for item in self._list_catalog_for_owner(owner) if item.session_id != summary.session_id]
        current.append(summary)
        self._write_catalog(owner=owner, summaries=current)

    def _remove_from_catalog(self, *, owner: str, session_id: str) -> None:
        current = [item for item in self._list_catalog_for_owner(owner) if item.session_id != session_id]
        if current:
            self._write_catalog(owner=owner, summaries=current)
        else:
            self._delete_key(self.catalog_key(owner))

    def _list_catalog_for_owner(self, owner: str) -> list[ConversationSummary]:
        payload = self._read_json(self.catalog_key(owner))
        if payload is None:
            return []
        if payload.get("version") != CATALOG_VERSION or payload.get("owner") != owner:
            raise RuntimeError("conversation catalog is incompatible")
        cutoff = _utc_now() - timedelta(days=self.settings.session_retention_days)
        summaries: list[ConversationSummary] = []
        for item in payload.get("conversations", []):
            if not isinstance(item, dict) or item.get("agent_version") != self.settings.agent_version:
                continue
            created_at = _parse_expiry(item.get("created_at"))
            updated_at = _parse_expiry(item.get("updated_at"))
            session_id = item.get("session_id")
            title = item.get("title")
            if (
                isinstance(session_id, str)
                and isinstance(title, str)
                and created_at is not None
                and updated_at is not None
                and updated_at > cutoff
            ):
                summaries.append(ConversationSummary(session_id, title, created_at, updated_at))
        return summaries

    def _write_catalog(self, *, owner: str, summaries: list[ConversationSummary]) -> None:
        ordered = sorted(summaries, key=lambda item: item.updated_at, reverse=True)
        self._write_json(
            self.catalog_key(owner),
            {
                "version": CATALOG_VERSION,
                "owner": owner,
                "conversations": [
                    {
                        "session_id": item.session_id,
                        "title": item.title,
                        "created_at": _iso(item.created_at),
                        "updated_at": _iso(item.updated_at),
                        "agent_version": self.settings.agent_version,
                    }
                    for item in ordered
                ],
            },
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
