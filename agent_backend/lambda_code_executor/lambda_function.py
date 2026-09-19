"""No-secret Lambda handler for bounded financial Python execution."""

from __future__ import annotations

import base64
import os
import resource
import signal
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

MAX_CODE_BYTES = 20_000
MAX_FILE_BYTES = 4_000_000
MAX_OUTPUT_BYTES = 200_000
EXECUTION_TIMEOUT_SECONDS = 20


def _child_limits() -> None:
    resource.setrlimit(resource.RLIMIT_CPU, (18, 18))
    resource.setrlimit(resource.RLIMIT_FSIZE, (10_000_000, 10_000_000))
    resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
    resource.setrlimit(resource.RLIMIT_NPROC, (64, 64))


def _bounded(value: str) -> str:
    return value[-MAX_OUTPUT_BYTES:]


def _run(script: Path, workdir: Path) -> dict[str, Any]:
    child_env = {
        "HOME": str(workdir),
        "LANG": "C.UTF-8",
        "LC_ALL": "C.UTF-8",
        "PATH": "/var/lang/bin:/usr/bin:/bin",
        "PYTHONPATH": "/opt/python",
        "TMPDIR": str(workdir),
        "OPENBLAS_NUM_THREADS": "1",
        "OMP_NUM_THREADS": "1",
    }
    process = subprocess.Popen(
        [sys.executable, "-s", str(script)],
        cwd=workdir,
        env=child_env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        start_new_session=True,
        preexec_fn=_child_limits,  # noqa: PLW1509 - no handler threads are started
    )
    try:
        stdout, stderr = process.communicate(timeout=EXECUTION_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        stdout, stderr = process.communicate()
        return {
            "status": "timeout",
            "stdout": _bounded(stdout),
            "stderr": _bounded(stderr),
        }

    return {
        "status": "success" if process.returncode == 0 else "error",
        "return_code": process.returncode,
        "stdout": _bounded(stdout),
        "stderr": _bounded(stderr),
    }


def lambda_handler(event: dict[str, Any], _context: Any) -> dict[str, Any]:
    """Decode attached files and execute one Python program."""
    code = event.get("code", "")
    if not isinstance(code, str) or not code.strip():
        return {"status": "error", "error": "code must be a non-empty string"}
    if len(code.encode("utf-8")) > MAX_CODE_BYTES:
        return {"status": "error", "error": "code is larger than 20 KB"}

    files = event.get("files", {})
    if not isinstance(files, dict) or len(files) > 1:
        return {"status": "error", "error": "at most one input file is allowed"}

    with tempfile.TemporaryDirectory(prefix="finfine-") as directory:
        workdir = Path(directory)
        for filename, encoded in files.items():
            safe_name = Path(filename).name
            if not safe_name or safe_name != filename or not safe_name.endswith(".csv"):
                return {"status": "error", "error": "input must be one CSV filename"}
            try:
                content = base64.b64decode(encoded, validate=True)
            except (TypeError, ValueError):
                return {"status": "error", "error": "input file is not valid base64"}
            if len(content) > MAX_FILE_BYTES:
                return {"status": "error", "error": "input file is larger than 4 MB"}
            (workdir / safe_name).write_bytes(content)

        script = workdir / "analysis.py"
        script.write_text(code, encoding="utf-8")
        return _run(script, workdir)
