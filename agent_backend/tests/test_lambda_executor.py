import io
import json

import pytest

from finfine_agent.artifacts import LocalArtifactStore
from finfine_agent.lambda_executor import LambdaPythonExecutor


class FakePayload(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *_args):
        self.close()


class FakeLambdaClient:
    def __init__(self, result):
        self.result = result
        self.request = None

    def invoke(self, **request):
        self.request = request
        return {"Payload": FakePayload(json.dumps(self.result).encode())}


def test_executor_attaches_csv_without_exposing_local_path(tmp_path) -> None:
    artifacts = LocalArtifactStore(tmp_path)
    artifact = artifacts.put(
        filename="transactions.csv",
        content_type="text/csv",
        data=b"amount\n10\n",
    )
    client = FakeLambdaClient({"status": "success", "stdout": "10\n"})
    executor = LambdaPythonExecutor(
        function_name="executor",
        region="ap-south-1",
        artifacts=artifacts,
        client=client,
    )

    result = executor.execute(
        code="print(10)",
        purpose="test",
        artifact_id=artifact.artifact_id,
    )
    payload = json.loads(client.request["Payload"])

    assert result["stdout"] == "10\n"
    assert payload["files"]["transactions.csv"] == "YW1vdW50CjEwCg=="
    assert str(tmp_path) not in json.dumps(payload)


def test_executor_raises_for_code_failure(tmp_path) -> None:
    client = FakeLambdaClient({"status": "error", "stderr": "bad code"})
    executor = LambdaPythonExecutor(
        function_name="executor",
        region="ap-south-1",
        artifacts=LocalArtifactStore(tmp_path),
        client=client,
    )

    with pytest.raises(RuntimeError, match="bad code"):
        executor.execute(code="bad", purpose="test")
