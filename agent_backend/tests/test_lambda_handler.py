import base64

from lambda_code_executor.lambda_function import lambda_handler


def test_handler_runs_python_with_csv() -> None:
    result = lambda_handler(
        {
            "code": "import csv\nwith open('transactions.csv') as handle:\n    print(sum(int(row['amount']) for row in csv.DictReader(handle)))",
            "files": {
                "transactions.csv": base64.b64encode(b"amount\n10\n20\n").decode()
            },
        },
        None,
    )

    assert result["status"] == "success"
    assert result["stdout"] == "30\n"


def test_handler_rejects_non_csv_attachment() -> None:
    result = lambda_handler(
        {"code": "print(1)", "files": {"secret.txt": "dGVzdA=="}},
        None,
    )

    assert result == {"status": "error", "error": "input must be one CSV filename"}
