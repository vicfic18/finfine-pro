"""Restricted Python execution for financial analysis."""

from __future__ import annotations

import ast
from typing import Any

from strands import tool

BLOCKED_IMPORTS = {
    "boto3",
    "botocore",
    "httpx",
    "os",
    "requests",
    "socket",
    "subprocess",
    "urllib",
}
BLOCKED_CALLS = {"__import__", "compile", "eval", "exec", "open"}


def _validate_financial_code(code: str) -> None:
    """Reject direct system, network, credential, and file access."""
    if not code.strip():
        raise ValueError("code cannot be empty")
    if len(code) > 20_000:
        raise ValueError("code is too long")
    if "transactions = [" in code or "transactions=[" in code:
        raise ValueError(
            "Do not paste transaction lists into Python. Do not retry this code. "
            "Use totals already returned by a data tool, or call "
            "export_transactions_csv or export_business_data_csv and pass its "
            "artifactId."
        )

    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        raise ValueError(f"invalid Python code: {exc.msg}") from exc

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imports = {alias.name.split(".", 1)[0] for alias in node.names}
            blocked = imports & BLOCKED_IMPORTS
            if blocked:
                raise ValueError(f"blocked import: {min(blocked)}")
        elif isinstance(node, ast.ImportFrom):
            root = (node.module or "").split(".", 1)[0]
            if root in BLOCKED_IMPORTS:
                raise ValueError(f"blocked import: {root}")
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            if node.func.id in BLOCKED_CALLS:
                raise ValueError(f"blocked function: {node.func.id}")


def create_financial_python_tool(executor: Any) -> Any:
    """Create a Strands tool backed by the isolated Lambda executor."""

    @tool(name="run_financial_python")
    def run_financial_python(
        code: str,
        purpose: str,
        artifact_id: str | None = None,
    ) -> dict[str, Any]:
        """Required for derived financial calculations and small data models.

        For several business records, first call export_transactions_csv or
        export_business_data_csv and provide its artifactId. Never paste a
        record list into code. Read the returned CSV filename with
        pandas.read_csv(...). Keep the code short and print the final values.
        For one or two scalar values, embedding them is okay.
        Call this whenever an answer needs new arithmetic, grouping, comparison,
        trends, percentages, projections, statistics, optimization, or prediction.
        Do not answer a requested computation until this returns successfully.

        Args:
            code: Focused Python code that prints its final result.
            purpose: A short explanation of the calculation or model.
            artifact_id: Optional ID returned by a CSV export tool. The file is
            available to Python under the filename returned by that tool.
        """
        _validate_financial_code(code)
        return executor.execute(
            code=f"# Purpose: {purpose}\n{code}",
            purpose=purpose,
            artifact_id=artifact_id,
        )

    return run_financial_python
