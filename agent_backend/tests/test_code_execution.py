import pytest

from finfine_agent.tools.code_execution import (
    _validate_financial_code,
    create_financial_python_tool,
)


class FakeExecutor:
    def __init__(self) -> None:
        self.request = None

    def execute(self, **request):
        self.request = request
        return {"status": "success", "stdout": "42\n"}


def test_allows_math_and_machine_learning_imports() -> None:
    _validate_financial_code(
        "from sklearn.linear_model import LinearRegression\n"
        "import pandas as pd\n"
        "print(sum([1, 2, 3]))"
    )


def test_rejects_pasted_transaction_lists() -> None:
    with pytest.raises(ValueError, match="export_transactions_csv"):
        _validate_financial_code("transactions = [{'amount': 10}]")


@pytest.mark.parametrize(
    "code",
    [
        "import boto3",
        "import requests",
        "from os import environ",
        "open('/tmp/result.txt', 'w')",
        "exec('print(1)')",
    ],
)
def test_blocks_aws_network_system_and_file_access(code: str) -> None:
    with pytest.raises(ValueError, match="blocked"):
        _validate_financial_code(code)


def test_tool_runs_python_through_lambda_executor() -> None:
    executor = FakeExecutor()
    code_tool = create_financial_python_tool(executor)

    result = code_tool._tool_func(
        code="print(6 * 7)",
        purpose="Check arithmetic",
        artifact_id="artifact-1",
    )

    assert result["status"] == "success"
    assert executor.request["artifact_id"] == "artifact-1"
    assert "Check arithmetic" in executor.request["code"]
