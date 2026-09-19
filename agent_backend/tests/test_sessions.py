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

    def put_object(self, *, Bucket: str, Key: str, Body: bytes, Metadata: dict, IfNoneMatch: str | None = None, **_kwargs: object) -> None:
        del Bucket
        if IfNoneMatch == "*" and Key in self.objects:
            raise ClientError({"Error": {"Code": "PreconditionFailed"}}, "PutObject")
        self.objects[Key] = {"metadata": Metadata, "body": Body}

    def get_object(self, *, Bucket: str, Key: str) -> dict:
        del Bucket
        if Key not in self.objects:
            raise ClientError({"Error": {"Code": "NoSuchKey"}}, "GetObject")
        return {"Body": Body(self.objects[Key]["body"])}


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
