"""Short-lived local files shared between agent tools."""

from __future__ import annotations

import tempfile
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

MAX_ARTIFACT_BYTES = 4_000_000


@dataclass(frozen=True)
class Artifact:
    """Metadata for one file that can be passed to code execution."""

    artifact_id: str
    filename: str
    content_type: str
    size_bytes: int


class LocalArtifactStore:
    """Keep generated files outside the model context for one process lifetime."""

    def __init__(self, root: Path | None = None) -> None:
        self._temporary_directory = None
        if root is None:
            self._temporary_directory = tempfile.TemporaryDirectory(
                prefix="finfine-artifacts-"
            )
            root = Path(self._temporary_directory.name)
        self._root = root
        self._root.mkdir(parents=True, exist_ok=True)
        self._artifacts: dict[str, Artifact] = {}

    def put(self, *, filename: str, content_type: str, data: bytes) -> Artifact:
        """Store one bounded file and return an opaque reference."""
        safe_name = Path(filename).name
        if not safe_name or safe_name != filename:
            raise ValueError("filename must not contain a directory")
        if not data:
            raise ValueError("artifact cannot be empty")
        if len(data) > MAX_ARTIFACT_BYTES:
            raise ValueError("artifact is larger than 4 MB")

        artifact_id = uuid4().hex
        artifact = Artifact(
            artifact_id=artifact_id,
            filename=safe_name,
            content_type=content_type,
            size_bytes=len(data),
        )
        (self._root / artifact_id).write_bytes(data)
        self._artifacts[artifact_id] = artifact
        return artifact

    def read(self, artifact_id: str) -> tuple[Artifact, bytes]:
        """Return a known artifact without accepting an arbitrary file path."""
        artifact = self._artifacts.get(artifact_id)
        if artifact is None:
            raise ValueError("artifact_id is unknown or expired")
        return artifact, (self._root / artifact_id).read_bytes()
