from decimal import Decimal

import pytest

from finfine_agent.tools.financial_data import FinancialDataService


class FakeStore:
    def __init__(self) -> None:
        self.documents = [
            {
                "id": "doc-old",
                "documentType": "BANK_STATEMENT",
                "processedAt": "2026-09-18T09:00:00Z",
                "rawMetadata": '{"closingBalance": 75000, "statementPeriod": {"endDate": "2026-10-01"}}',
            },
            {
                "id": "doc-latest",
                "documentType": "BANK_STATEMENT",
                "processedAt": "2026-09-18T10:00:00Z",
                "rawMetadata": '{"closingBalance": 82350, "statementPeriod": {"endDate": "2026-10-07"}}',
            },
        ]
        self.transactions = [
            {
                "id": "tx-1",
                "date": "2026-10-07",
                "amount": Decimal("5550"),
                "type": "INFLOW",
                "referenceNumber": "407813028833",
                "counterpartyName": "Sharma Distributors",
                "updatedAt": "2026-09-18T09:00:00Z",
            },
            {
                "id": "tx-1-duplicate",
                "date": "2026-10-07",
                "amount": Decimal("5550"),
                "type": "INFLOW",
                "referenceNumber": "407813028833",
                "counterpartyName": "Sharma Distributors",
                "updatedAt": "2026-09-18T10:00:00Z",
            },
            {
                "id": "tx-2",
                "date": "2026-10-06",
                "amount": Decimal("15000"),
                "type": "OUTFLOW",
                "referenceNumber": "407813020202",
                "category": "STATUTORY_TAX",
            },
        ]
        self.obligations = [
            {
                "id": "obl-gst",
                "title": "GST payment",
                "amount": Decimal("45000"),
                "dueDate": "2026-10-10",
                "type": "PAYABLE",
                "isStatutory": True,
                "status": "SCHEDULED",
            },
            {
                "id": "obl-customer",
                "title": "Customer invoice",
                "amount": Decimal("40000"),
                "dueDate": "2026-10-11",
                "type": "RECEIVABLE",
                "status": "SCHEDULED",
            },
            {
                "id": "obl-paid",
                "title": "Already paid",
                "amount": Decimal("5000"),
                "dueDate": "2026-10-09",
                "type": "PAYABLE",
                "status": "PAID",
            },
        ]

    def list_documents(self):
        return self.documents

    def list_transactions(self, start_date=None, end_date=None):
        return self.transactions

    def list_obligations(self, start_date, end_date):
        return [
            item
            for item in self.obligations
            if start_date <= item["dueDate"] <= end_date
        ]


@pytest.fixture
def service() -> FinancialDataService:
    return FinancialDataService(FakeStore())


def test_latest_balance_uses_latest_statement(service: FinancialDataService) -> None:
    result = service.latest_balance()

    assert result["found"] is True
    assert result["balance"] == 82350
    assert result["balanceDate"] == "2026-10-07"
    assert result["documentId"] == "doc-latest"


def test_transactions_ignore_repeated_imports(service: FinancialDataService) -> None:
    result = service.transactions("2026-10-01", "2026-10-07")

    assert result["count"] == 2
    assert result["duplicatesIgnored"] == 1
    assert result["totalInflow"] == 5550
    assert result["totalOutflow"] == 15000


def test_upcoming_obligations_excludes_paid_items(service: FinancialDataService) -> None:
    result = service.upcoming_obligations(
        days_ahead=7,
        obligation_type="ALL",
        as_of_date="2026-10-07",
    )

    assert result["count"] == 2
    assert result["totalPayable"] == 45000
    assert result["totalReceivable"] == 40000


def test_invalid_date_is_rejected(service: FinancialDataService) -> None:
    with pytest.raises(ValueError, match="YYYY-MM-DD"):
        service.transactions(start_date="07/10/2026")
