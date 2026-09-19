import pytest

from finfine_agent.artifacts import LocalArtifactStore


def test_store_returns_only_registered_artifacts(tmp_path) -> None:
    store = LocalArtifactStore(tmp_path)
    artifact = store.put(
        filename="transactions.csv",
        content_type="text/csv",
        data=b"amount\n10\n",
    )

    metadata, data = store.read(artifact.artifact_id)

    assert metadata.filename == "transactions.csv"
    assert data == b"amount\n10\n"
    with pytest.raises(ValueError, match="unknown or expired"):
        store.read("../unrelated-file")
