from decimal import Decimal

import pytest

from finfine_agent.artifacts import LocalArtifactStore
from finfine_agent.dynamodb import ReadResult
from finfine_agent.tools.financial_data import (
    DATASET_NAMES,
    FinancialDataService,
    create_business_data_csv_tool,
    create_transactions_csv_tool,
    get_business_data,
)


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
                "amount": Decimal(5550),
                "type": "INFLOW",
                "referenceNumber": "407813028833",
                "counterpartyName": "Sharma Distributors",
                "updatedAt": "2026-09-18T09:00:00Z",
            },
            {
                "id": "tx-1-duplicate",
                "date": "2026-10-07",
                "amount": Decimal(5550),
                "type": "INFLOW",
                "referenceNumber": "407813028833",
                "counterpartyName": "Sharma Distributors",
                "updatedAt": "2026-09-18T10:00:00Z",
            },
            {
                "id": "tx-2",
                "date": "2026-10-06",
                "amount": Decimal(15000),
                "type": "OUTFLOW",
                "referenceNumber": "407813020202",
                "category": "STATUTORY_TAX",
            },
        ]
        self.obligations = [
            {
                "id": "obl-gst",
                "title": "GST payment",
                "amount": Decimal(45000),
                "dueDate": "2026-10-10",
                "type": "PAYABLE",
                "isStatutory": True,
                "status": "SCHEDULED",
            },
            {
                "id": "obl-customer",
                "title": "Customer invoice",
                "amount": Decimal(40000),
                "dueDate": "2026-10-11",
                "type": "RECEIVABLE",
                "status": "SCHEDULED",
            },
            {
                "id": "obl-paid",
                "title": "Already paid",
                "amount": Decimal(5000),
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


class CanonicalFakeStore:
    def __init__(self) -> None:
        self.calls = {}
        self.method_calls = []
        self.records = {
            dataset: [
                {
                    "id": f"{dataset}-1",
                    "tenantId": "tenant-a",
                    "amount": Decimal("12.50"),
                }
            ]
            for dataset in DATASET_NAMES
        }
        self.records["products"].append(
            {"id": "products-2", "tenantId": "tenant-a", "amount": Decimal(8)}
        )

    def _read(self, dataset, method_name, **kwargs):
        self.calls[dataset] = kwargs
        self.method_calls.append(method_name)
        return self.records[dataset]

    def list_documents(self, **kwargs):
        return self._read("documents", "list_documents", **kwargs)

    def list_transactions(self, **kwargs):
        return self._read("transactions", "list_transactions", **kwargs)

    def list_obligations(self, **kwargs):
        return self._read("obligations", "list_obligations", **kwargs)

    def list_merchant_financial_settings(self, **kwargs):
        return self._read("merchant_settings", "list_merchant_financial_settings", **kwargs)

    def list_cash_positions(self, **kwargs):
        return self._read("cash_positions", "list_cash_positions", **kwargs)

    def list_products(self, **kwargs):
        return self._read("products", "list_products", **kwargs)

    def list_sales(self, **kwargs):
        return self._read("sales", "list_sales", **kwargs)

    def list_sale_line_items(self, **kwargs):
        return self._read("sale_line_items", "list_sale_line_items", **kwargs)

    def list_inventory_snapshots(self, **kwargs):
        return self._read("inventory_snapshots", "list_inventory_snapshots", **kwargs)

    def list_inventory_items(self, **kwargs):
        return self._read("inventory_items", "list_inventory_items", **kwargs)

    def list_purchases(self, **kwargs):
        return self._read("purchases", "list_purchases", **kwargs)

    def list_purchase_line_items(self, **kwargs):
        return self._read("purchase_line_items", "list_purchase_line_items", **kwargs)

    def list_suppliers(self, **kwargs):
        return self._read("suppliers", "list_suppliers", **kwargs)

    def list_supplier_product_terms(self, **kwargs):
        return self._read("supplier_product_terms", "list_supplier_product_terms", **kwargs)

    def list_purchase_orders(self, **kwargs):
        return self._read("purchase_orders", "list_purchase_orders", **kwargs)

    def list_purchase_order_line_items(self, **kwargs):
        return self._read("purchase_order_line_items", "list_purchase_order_line_items", **kwargs)

    def list_recurring_expenses(self, **kwargs):
        return self._read("recurring_expenses", "list_recurring_expenses", **kwargs)


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


def test_transactions_csv_is_deduplicated_and_ordered(
    service: FinancialDataService,
) -> None:
    columns, rows = service.transactions_csv("2026-10-01", "2026-10-07")

    assert columns[:3] == ["date", "amount", "type"]
    assert [row["date"] for row in rows] == ["2026-10-06", "2026-10-07"]
    assert rows[1]["amount"] == 5550


def test_export_tool_stores_csv_artifact(
    service: FinancialDataService,
    tmp_path,
) -> None:
    artifacts = LocalArtifactStore(tmp_path)
    csv_tool = create_transactions_csv_tool(artifacts, service)

    result = csv_tool._tool_func(start_date="2026-10-01", end_date="2026-10-07")
    artifact, data = artifacts.read(result["artifactId"])

    assert result["rowCount"] == 2
    assert artifact.filename == "transactions.csv"
    assert data.decode().splitlines()[0].startswith("date,amount,type")


@pytest.mark.parametrize(
    ("dataset", "method_name"),
    [
        ("documents", "list_documents"),
        ("transactions", "list_transactions"),
        ("obligations", "list_obligations"),
        ("merchant_settings", "list_merchant_financial_settings"),
        ("cash_positions", "list_cash_positions"),
        ("products", "list_products"),
        ("sales", "list_sales"),
        ("sale_line_items", "list_sale_line_items"),
        ("inventory_snapshots", "list_inventory_snapshots"),
        ("inventory_items", "list_inventory_items"),
        ("purchases", "list_purchases"),
        ("purchase_line_items", "list_purchase_line_items"),
        ("suppliers", "list_suppliers"),
        ("supplier_product_terms", "list_supplier_product_terms"),
        ("purchase_orders", "list_purchase_orders"),
        ("purchase_order_line_items", "list_purchase_order_line_items"),
        ("recurring_expenses", "list_recurring_expenses"),
    ],
)
def test_business_data_dispatches_every_canonical_dataset(dataset, method_name) -> None:
    store = CanonicalFakeStore()
    result = FinancialDataService(store).business_data(dataset)

    assert dataset in store.calls
    assert store.method_calls[-1] == method_name
    assert result["dataset"] == dataset
    assert result["records"][0]["amount"] == 12.5


def test_business_data_applies_filters_and_reports_truncation() -> None:
    store = CanonicalFakeStore()
    result = FinancialDataService(store).business_data(
        "purchase_orders",
        start_date="2026-10-01",
        end_date="2026-10-07",
        supplier_id="supplier-1",
        status="open",
        limit=1,
    )

    assert store.calls["purchase_orders"] == {
        "start_date": "2026-10-01",
        "end_date": "2026-10-07",
        "status": "OPEN",
        "supplier_id": "supplier-1",
    }
    assert result["count"] == 1
    assert result["availableCount"] == 1
    assert result["truncated"] is False

    products = FinancialDataService(store).business_data("products", limit=1)
    assert products["availableCount"] == 2
    assert products["truncated"] is True
    assert store.calls["products"] == {"is_active_only": True}


def test_business_data_routes_product_supplier_and_parent_filters() -> None:
    store = CanonicalFakeStore()
    service = FinancialDataService(store)

    service.business_data(
        "purchase_line_items",
        product_id="product-1",
        parent_id="purchase-1",
    )
    assert store.calls["purchase_line_items"] == {
        "product_id": "product-1",
        "purchase_id": "purchase-1",
    }

    service.business_data(
        "supplier_product_terms",
        product_id="product-1",
        supplier_id="supplier-1",
    )
    assert store.calls["supplier_product_terms"] == {
        "product_id": "product-1",
        "supplier_id": "supplier-1",
    }


@pytest.mark.parametrize(
    "kwargs",
    [
        {"dataset": "merchant_settings", "status": "OPEN"},
        {"dataset": "products", "start_date": "2026-10-01"},
        {"dataset": "documents", "start_date": "07/10/2026"},
        {"dataset": "transactions", "start_date": "2026-10-08", "end_date": "2026-10-07"},
        {"dataset": "sales", "limit": 0},
        {"dataset": "purchase_orders", "status": "unknown"},
    ],
)
def test_business_data_rejects_invalid_filters(kwargs) -> None:
    with pytest.raises(ValueError):
        FinancialDataService(CanonicalFakeStore()).business_data(**kwargs)


def test_business_data_returns_same_filtered_records_for_csv(monkeypatch, tmp_path) -> None:
    service = FinancialDataService(CanonicalFakeStore())
    artifacts = LocalArtifactStore(tmp_path)
    monkeypatch.setattr(
        "finfine_agent.tools.financial_data._service",
        lambda: service,
    )
    csv_tool = create_business_data_csv_tool(artifacts)

    result = csv_tool._tool_func(dataset="products", active_only=False)
    artifact, data = artifacts.read(result["artifactId"])

    assert artifact.filename == "products.csv"
    assert result["dataset"] == "products"
    assert result["rowCount"] == 2
    assert "tenantId" in result["columns"]
    assert "products-1" in data.decode()


def test_business_data_distinguishes_missing_empty_and_failed_reads() -> None:
    class MissingStore(CanonicalFakeStore):
        def list_products(self, **kwargs):
            self.calls["products"] = kwargs
            return ReadResult(warning="The products dataset is not configured for this environment.")

    class FailedStore(CanonicalFakeStore):
        def list_products(self, **_kwargs):
            raise RuntimeError("query failed")

    class EmptyStore(CanonicalFakeStore):
        def list_suppliers(self, **kwargs):
            self.calls["suppliers"] = kwargs
            return ReadResult()

    missing = FinancialDataService(MissingStore()).business_data("products")
    empty = FinancialDataService(EmptyStore()).business_data("suppliers")
    failed = FinancialDataService(FailedStore()).business_data("products")

    assert missing["count"] == 0
    assert "not configured" in missing["warning"]
    assert empty["warning"] is None
    assert "could not be read" in failed["warning"]


def test_business_data_tool_schema_restricts_dataset_names() -> None:
    assert get_business_data.tool_spec["inputSchema"]["json"]["properties"]["dataset"]["enum"] == list(DATASET_NAMES)
