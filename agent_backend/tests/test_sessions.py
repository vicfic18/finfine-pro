import json
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from botocore.exceptions import ClientError

from finfine_agent.config import RuntimeSettings
from finfine_agent.sessions import (
    CompletedResult,
    RequestConflictError,
    S3SessionRegistry,
    SessionUnavailableError,
)


class Body:
    def __init__(self, value: bytes) -> None:
        self.value = value
        self.closed = False

    def read(self) -> bytes:
        return self.value

    def close(self) -> None:
        self.closed = True


class FakeS3:
    def __init__(self) -> None:
        self.objects: dict[str, dict] = {}

    def head_object(self, *, Bucket: str, Key: str) -> dict:
        del Bucket
        if Key not in self.objects:
            raise ClientError({"Error": {"Code": "404"}}, "HeadObject")
        return {"Metadata": self.objects[Key]["metadata"]}

    def put_object(self, *, Bucket: str, Key: str, Body: bytes, Metadata: dict | None = None, IfNoneMatch: str | None = None, **_kwargs: object) -> None:
        del Bucket
        if IfNoneMatch == "*" and Key in self.objects:
            raise ClientError({"Error": {"Code": "PreconditionFailed"}}, "PutObject")
        self.objects[Key] = {"metadata": Metadata or {}, "body": Body}

    def get_object(self, *, Bucket: str, Key: str) -> dict:
        del Bucket
        if Key not in self.objects:
            raise ClientError({"Error": {"Code": "NoSuchKey"}}, "GetObject")
        return {"Body": Body(self.objects[Key]["body"])}

    def delete_object(self, *, Bucket: str, Key: str) -> None:
        del Bucket
        self.objects.pop(Key, None)

    def get_paginator(self, operation: str):
        assert operation == "list_objects_v2"
        client = self

        class Paginator:
            def paginate(self, *, Bucket: str, Prefix: str):
                del Bucket
                return [{"Contents": [{"Key": key} for key in sorted(client.objects) if key.startswith(Prefix)]}]

        return Paginator()


def settings() -> RuntimeSettings:
    return RuntimeSettings(
        cognito_issuer="https://cognito-idp.example.test/pool",
        cognito_client_id="client",
        session_bucket="bucket",
    )


def test_new_session_is_opaque_and_metadata_scoped() -> None:
    s3 = FakeS3()
    registry = S3SessionRegistry(settings(), s3_client=s3)
    record = registry.resolve(subject="subject-a", public_id=None)
    public_id = UUID(record.public_id)

    assert record.public_id == str(public_id)
    assert record.storage_id != str(public_id)
    assert len(record.storage_id) == 64
    metadata = s3.objects[registry.metadata_key(record.storage_id)]["metadata"]
    assert metadata["owner"] == registry.owner_digest("subject-a")
    assert metadata["version"] == "v1"
    assert datetime.fromisoformat(metadata["expiry"]) > datetime.now(UTC)


def test_unknown_supplied_session_is_unavailable() -> None:
    registry = S3SessionRegistry(settings(), s3_client=FakeS3())
    with pytest.raises(SessionUnavailableError):
        registry.resolve(subject="subject-a", public_id=uuid4())


def test_completed_result_is_idempotent_and_conflicts_on_prompt() -> None:
    s3 = FakeS3()
    registry = S3SessionRegistry(settings(), s3_client=s3)
    session = registry.resolve(subject="subject-a", public_id=None)
    request_id = str(uuid4())
    result = CompletedResult(request_id, session.public_id, "hash-a", "answer")
    assert registry.put_completed(result, subject="subject-a") == result
    assert registry.get_completed(request_id=request_id, subject="subject-a", session_id=session.public_id, prompt_hash="hash-a") == result
    with pytest.raises(RequestConflictError):
        registry.get_completed(request_id=request_id, subject="subject-a", session_id=session.public_id, prompt_hash="hash-b")


def test_completed_turn_creates_sorted_catalog_and_safe_transcript() -> None:
    s3 = FakeS3()
    registry = S3SessionRegistry(settings(), s3_client=s3)
    first = registry.resolve(subject="subject-a", public_id=None)
    second = registry.resolve(subject="subject-a", public_id=None)

    registry.record_completed_turn(
        subject="subject-a",
        record=first,
        request_id=str(uuid4()),
        prompt="  A first prompt with   extra whitespace  ",
        answer="first answer",
    )
    registry.record_completed_turn(
        subject="subject-a",
        record=second,
        request_id=str(uuid4()),
        prompt="Second prompt",
        answer="second answer",
    )

    summaries = registry.list_conversations(subject="subject-a")
    assert [item.session_id for item in summaries] == [second.public_id, first.public_id]
    assert summaries[1].title == "A first prompt with extra whitespace"

    conversation = registry.get_conversation(subject="subject-a", session_id=UUID(first.public_id))
    assert [(item.role, item.content) for item in conversation.messages] == [
        ("user", "  A first prompt with   extra whitespace  "),
        ("assistant", "first answer"),
    ]


def test_completed_turn_is_idempotent_and_title_is_truncated() -> None:
    registry = S3SessionRegistry(settings(), s3_client=FakeS3())
    session = registry.resolve(subject="subject-a", public_id=None)
    request_id = str(uuid4())
    prompt = "x" * 100

    for _ in range(2):
        registry.record_completed_turn(
            subject="subject-a",
            record=session,
            request_id=request_id,
            prompt=prompt,
            answer="answer",
        )

    conversation = registry.get_conversation(subject="subject-a", session_id=UUID(session.public_id))
    assert len(conversation.messages) == 2
    assert len(conversation.summary.title) == 64
    assert conversation.summary.title.endswith("…")


def test_catalog_hides_expired_incompatible_and_foreign_conversations() -> None:
    s3 = FakeS3()
    registry = S3SessionRegistry(settings(), s3_client=s3)
    current = registry.resolve(subject="subject-a", public_id=None)
    registry.record_completed_turn(
        subject="subject-a",
        record=current,
        request_id=str(uuid4()),
        prompt="Current",
        answer="answer",
    )
    owner = registry.owner_digest("subject-a")
    catalog_key = registry.catalog_key(owner)
    catalog = json.loads(s3.objects[catalog_key]["body"])
    catalog["conversations"].extend(
        [
            {
                "session_id": str(uuid4()),
                "title": "Expired",
                "created_at": "2000-01-01T00:00:00+00:00",
                "updated_at": "2000-01-01T00:00:00+00:00",
                "agent_version": "v1",
            },
            {
                "session_id": str(uuid4()),
                "title": "Old agent",
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
                "agent_version": "v0",
            },
        ]
    )
    s3.objects[catalog_key]["body"] = json.dumps(catalog).encode()

    assert [item.session_id for item in registry.list_conversations(subject="subject-a")] == [current.public_id]
    assert registry.list_conversations(subject="subject-b") == []


def test_delete_conversation_removes_catalog_transcript_snapshots_and_idempotency() -> None:
    s3 = FakeS3()
    registry = S3SessionRegistry(settings(), s3_client=s3)
    session = registry.resolve(subject="subject-a", public_id=None)
    request_id = str(uuid4())
    registry.put_completed(CompletedResult(request_id, session.public_id, "hash", "answer"), subject="subject-a")
    registry.record_completed_turn(
        subject="subject-a",
        record=session,
        request_id=request_id,
        prompt="Delete me",
        answer="answer",
    )
    snapshot_key = f"{registry.snapshot_prefix(session.storage_id)}scopes/agent/a/snapshots/snapshot_latest.json"
    s3.objects[snapshot_key] = {"metadata": {}, "body": b"{}"}

    registry.delete_conversation(subject="subject-a", session_id=UUID(session.public_id))
    registry.delete_conversation(subject="subject-a", session_id=UUID(session.public_id))

    assert registry.list_conversations(subject="subject-a") == []
    assert snapshot_key not in s3.objects
    assert registry.metadata_key(session.storage_id) not in s3.objects
    assert registry.idempotency_key(request_id) not in s3.objects
