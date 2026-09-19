"""Invoke the isolated AWS Lambda Python executor."""

from __future__ import annotations

import base64
import json
from typing import Any
from uuid import uuid4

import boto3
from botocore.config import Config

from finfine_agent.artifacts import LocalArtifactStore


class LambdaPythonExecutor:
    """Run bounded Python requests through one no-secret Lambda function."""

    def __init__(
        self,
        *,
        function_name: str,
        region: str,
        artifacts: LocalArtifactStore,
        aws_profile: str | None = None,
        client: Any | None = None,
    ) -> None:
        self._function_name = function_name
        self._artifacts = artifacts
        if client is not None:
            self._client = client
            return

        session = boto3.Session(profile_name=aws_profile, region_name=region)
        self._client = session.client(
            "lambda",
            config=Config(
                retries={"total_max_attempts": 3, "mode": "adaptive"},
                connect_timeout=5,
                read_timeout=50,
            ),
        )

    def execute(
        self,
        *,
        code: str,
        purpose: str,
        artifact_id: str | None = None,
    ) -> dict[str, Any]:
        """Execute code, optionally attaching one previously exported file."""
        files: dict[str, str] = {}
        if artifact_id:
            artifact, data = self._artifacts.read(artifact_id)
            files[artifact.filename] = base64.b64encode(data).decode("ascii")

        payload = {
            "execution_id": uuid4().hex,
            "purpose": purpose,
            "code": code,
            "files": files,
        }
        response = self._client.invoke(
            FunctionName=self._function_name,
            InvocationType="RequestResponse",
            Payload=json.dumps(payload).encode("utf-8"),
        )
        with response["Payload"] as body:
            raw_result = body.read()

        if response.get("FunctionError"):
            raise RuntimeError("Lambda code executor failed before returning a result")

        result = json.loads(raw_result)
        if result.get("status") != "success":
            message = result.get("stderr") or result.get("error") or result.get("status")
            raise RuntimeError(f"Code execution failed: {message}")
        return result
