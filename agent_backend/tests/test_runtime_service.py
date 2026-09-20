import asyncio
from uuid import UUID, uuid4

import pytest

from finfine_agent.agent import AgentCancelledError, ask_async
from finfine_agent.api import RuntimeService, RuntimeInvocation
from finfine_agent.auth import AuthenticatedPrincipal
from finfine_agent.config import RuntimeSettings
from finfine_agent.sessions import SessionUnavailableError
from tests.test_sessions import FakeS3
from finfine_agent.sessions import S3SessionRegistry
from finfine_agent.speech_modes import VoiceMode


def settings() -> RuntimeSettings:
    return RuntimeSettings(
        cognito_issuer="https://cognito-idp.example.test/pool",
        cognito_client_id="client",
        session_bucket="bucket",
    )


def test_foreign_owner_cannot_resolve_existing_public_session() -> None:
    registry = S3SessionRegistry(settings(), s3_client=FakeS3())
    record = registry.resolve(subject="owner-a", public_id=None)
    public_id = UUID(record.public_id)
    with pytest.raises(SessionUnavailableError):
        registry.resolve(subject="owner-b", public_id=public_id)


def test_expired_and_incompatible_metadata_are_unavailable() -> None:
    s3 = FakeS3()
    registry = S3SessionRegistry(settings(), s3_client=s3)
    record = registry.resolve(subject="owner-a", public_id=None)
    public_id = UUID(record.public_id)
    metadata = s3.objects[registry.metadata_key(record.storage_id)]["metadata"]
    metadata["expiry"] = "2000-01-01T00:00:00+00:00"
    with pytest.raises(SessionUnavailableError):
        registry.resolve(subject="owner-a", public_id=public_id)
    metadata["expiry"] = "2999-01-01T00:00:00+00:00"
    metadata["version"] = "old-version"
    with pytest.raises(SessionUnavailableError):
        registry.resolve(subject="owner-a", public_id=public_id)


def test_per_session_lock_serializes_same_session_requests() -> None:
    async def run() -> list[str]:
        registry = S3SessionRegistry(settings(), s3_client=FakeS3())
        service = RuntimeService(settings(), registry=registry)
        principal = AuthenticatedPrincipal("owner-a", {})
        session_id = UUID(registry.resolve(subject="owner-a", public_id=None).public_id)
        calls: list[str] = []

        async def answerer(question: str, **_kwargs: object) -> str:
            calls.append(f"start:{question}")
            await asyncio.sleep(0.01)
            calls.append(f"end:{question}")
            return question

        requests = [
            RuntimeInvocation(prompt="one", requestId=uuid4(), sessionId=session_id),
            RuntimeInvocation(prompt="two", requestId=uuid4(), sessionId=session_id),
        ]
        await asyncio.gather(*(service.invoke(item, principal, answerer) for item in requests))
        assert calls in (["start:one", "end:one", "start:two", "end:two"], ["start:two", "end:two", "start:one", "end:one"])
        return calls

    asyncio.run(run())


def test_speech_mode_is_forwarded_as_model_guidance_without_changing_visible_prompt() -> None:
    async def run() -> None:
        registry = S3SessionRegistry(settings(), s3_client=FakeS3())
        service = RuntimeService(settings(), registry=registry)
        principal = AuthenticatedPrincipal("owner-a", {})
        modes: list[VoiceMode | None] = []

        async def answerer(question: str, *, speech_mode: VoiceMode | None) -> str:
            assert question == "What is my balance?"
            modes.append(speech_mode)
            return "आपका बैलेंस ..."

        request = RuntimeInvocation(
            prompt="What is my balance?",
            requestId=UUID("315b4a4e-d5f8-4b21-911c-37bb629e869d"),
            speechMode="hindi",
        )
        answer = await service.invoke(request, principal, answerer)
        conversation = await service.get_conversation(principal, answer.session_id)

        assert modes == [VoiceMode.HINDI]
        assert conversation.messages[0].content == "What is my balance?"
        assert conversation.messages[1].content == "आपका बैलेंस ..."

    asyncio.run(run())


def test_ask_async_cancels_agent_on_timeout() -> None:
    class FakeAgent:
        def __init__(self) -> None:
            self.cancelled = False

        async def invoke_async(self, _prompt: str, *, cancel_signal, **_kwargs: object) -> str:
            while not cancel_signal.is_set():
                await asyncio.sleep(0.001)
            self.cancelled = True
            return "cancelled"

        def cancel(self) -> None:
            self.cancelled = True

    agent = FakeAgent()
    with pytest.raises(TimeoutError):
        asyncio.run(ask_async(agent, "question", timeout_seconds=0.01))
    assert agent.cancelled


def test_cancelled_result_is_not_a_completed_answer() -> None:
    class CancelledAgent:
        async def invoke_async(self, _prompt: str, **_kwargs: object) -> dict[str, str]:
            return {"stop_reason": "cancelled"}

    with pytest.raises(AgentCancelledError):
        asyncio.run(ask_async(CancelledAgent(), "question"))
