"""Unit tests for the SageMaker Cash Flow Prediction tool and Indian Calendar."""

from datetime import date
from unittest.mock import MagicMock

from finfine_agent.indian_calendar import get_date_context
from finfine_agent.tools.sagemaker_forecast import predict_cash_flow_sagemaker


def test_indian_calendar_diwali_and_tax_dates() -> None:
    # Test Diwali date
    ctx_diwali = get_date_context("2026-10-31")
    assert ctx_diwali["is_festival"] is True
    assert any("Diwali" in f for f in ctx_diwali["active_festivals"])
    assert ctx_diwali["inflow_multiplier"] >= 2.0

    # Test GSTR-3B Tax date (20th)
    ctx_gst = get_date_context("2026-10-20")
    assert ctx_gst["is_statutory_drain"] is True
    assert "GSTR-3B" in ctx_gst["statutory_name"]

    # Test TDS Tax date (7th)
    ctx_tds = get_date_context("2026-07-07")
    assert ctx_tds["is_statutory_drain"] is True
    assert "TDS" in ctx_tds["statutory_name"]


def test_predict_cash_flow_sagemaker_tool_execution(monkeypatch) -> None:
    # Mock DynamoFinancialStore
    mock_store = MagicMock()
    mock_store.get_latest_cash_position.return_value = {
        "asOf": "2026-09-01",
        "totalLiquidCash": 150000.0,
        "bankBalance": 150000.0,
    }
    mock_store.list_transactions.return_value = [
        {"type": "INFLOW", "amount": 12000.0, "date": "2026-08-28"},
        {"type": "INFLOW", "amount": 18500.0, "date": "2026-08-29"},
        {"type": "OUTFLOW", "amount": 5000.0, "date": "2026-08-30"},
    ]
    mock_store.list_obligations.return_value = [
        {"title": "Commercial Rent", "dueDate": "2026-09-01", "amount": 35000.0, "type": "PAYABLE"},
        {"title": "Staff Salaries", "dueDate": "2026-09-10", "amount": 82000.0, "type": "PAYABLE"},
    ]

    monkeypatch.setattr(
        "finfine_agent.tools.sagemaker_forecast.DynamoFinancialStore",
        lambda settings: mock_store,
    )

    result = predict_cash_flow_sagemaker(
        horizon_days=60,
        simulate_festive_drop_percent=0.0,
        simulate_extra_expense_inr=0.0,
    )

    assert result["model"] == "Amazon-Chronos-Bolt-Quantile-Ensemble"
    assert result["horizon_days"] == 60
    assert result["starting_balance_inr"] == 150000
    assert "solvency_verdict" in result
    assert result["total_festive_uplift_inr"] >= 0
    assert len(result["trajectory_milestones"]) > 0
