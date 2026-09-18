import pytest

from finfine_agent.tools.code_execution import (
    _validate_financial_code,
    create_financial_python_tool,
)


class FakeInterpreter:
    def __init__(self) -> None:
        self.action = None

    def execute_code(self, action):
        self.action = action
        return {"status": "success", "content": [{"text": "42"}]}


def test_allows_math_and_machine_learning_imports() -> None:
    _validate_financial_code(
        "from sklearn.linear_model import LinearRegression\n"
        "import pandas as pd\n"
        "print(sum([1, 2, 3]))"
    )


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


def test_tool_runs_python_through_interpreter() -> None:
    interpreter = FakeInterpreter()
    code_tool = create_financial_python_tool(interpreter)

    result = code_tool._tool_func(code="print(6 * 7)", purpose="Check arithmetic")

    assert result["status"] == "success"
    assert interpreter.action.language.value == "python"
    assert "Check arithmetic" in interpreter.action.code
