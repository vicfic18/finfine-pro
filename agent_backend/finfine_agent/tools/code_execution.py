"""Restricted Python execution for financial analysis."""

from __future__ import annotations

import ast
from typing import Any

from strands import tool
from strands_tools.code_interpreter.models import ExecuteCodeAction


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

    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        raise ValueError(f"invalid Python code: {exc.msg}") from exc

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imports = {alias.name.split(".", 1)[0] for alias in node.names}
            blocked = imports & BLOCKED_IMPORTS
            if blocked:
                raise ValueError(f"blocked import: {sorted(blocked)[0]}")
        elif isinstance(node, ast.ImportFrom):
            root = (node.module or "").split(".", 1)[0]
            if root in BLOCKED_IMPORTS:
                raise ValueError(f"blocked import: {root}")
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            if node.func.id in BLOCKED_CALLS:
                raise ValueError(f"blocked function: {node.func.id}")


def create_financial_python_tool(interpreter: Any) -> Any:
    """Create a Strands tool backed by one managed interpreter session."""

    @tool(name="run_financial_python")
    def run_financial_python(code: str, purpose: str) -> dict[str, Any]:
        """Run Python for financial calculations or small data models.

        Use this only after reading the required financial records with the data
        tools. Embed only the necessary returned values in the code.

        Args:
            code: Focused Python code that prints its final result.
            purpose: A short explanation of the calculation or model.
        """
        _validate_financial_code(code)
        result = interpreter.execute_code(
            ExecuteCodeAction(
                type="executeCode",
                language="python",
                clear_context=False,
                code=f"# Purpose: {purpose}\n{code}",
            )
        )
        if result.get("status") != "success":
            raise RuntimeError(f"Code Interpreter failed: {result.get('content')}")
        return result

    return run_financial_python
