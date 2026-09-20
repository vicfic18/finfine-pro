"""Read-only financial tools for the FinFine Pro agent."""

from __future__ import annotations

import csv
import json
import os
from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from functools import lru_cache
from io import StringIO
from typing import Any, Literal, Protocol

from strands import tool

from finfine_agent.artifacts import LocalArtifactStore
from finfine_agent.config import Settings
from finfine_agent.dynamodb import DynamoFinancialStore

DatasetName = Literal[
    "documents",
    "transactions",
    "obligations",
    "merchant_settings",
    "cash_positions",
    "products",
    "sales",
    "sale_line_items",
    "inventory_snapshots",
    "inventory_items",
    "purchases",
    "purchase_line_items",
    "suppliers",
    "supplier_product_terms",
    "purchase_orders",
    "purchase_order_line_items",
    "recurring_expenses",
]

DATASET_NAMES: tuple[str, ...] = (
    "documents",
    "transactions",
    "obligations",
    "merchant_settings",
    "cash_positions",
    "products",
    "sales",
    "sale_line_items",
    "inventory_snapshots",
    "inventory_items",
    "purchases",
    "purchase_line_items",
    "suppliers",
    "supplier_product_terms",
    "purchase_orders",
    "purchase_order_line_items",
    "recurring_expenses",
)

DATASET_SPECS: dict[str, dict[str, Any]] = {
    "documents": {
        "allowed_filters": {"start_date", "end_date", "status"},
        "description": "Uploaded and normalized business documents",
    },
    "transactions": {
        "allowed_filters": {"start_date", "end_date"},
        "description": "Bank and cash transactions",
    },
    "obligations": {
        "allowed_filters": {"start_date", "end_date", "status"},
        "description": "Scheduled payables and receivables",
    },
    "merchant_settings": {
        "allowed_filters": set(),
        "description": "Merchant financial settings and cash-buffer rules",
    },
    "cash_positions": {
        "allowed_filters": {"start_date", "end_date"},
        "description": "Historical liquid-cash snapshots",
    },
    "products": {
        "allowed_filters": {"active_only"},
        "description": "Product names, SKUs and units",
    },
    "sales": {
        "allowed_filters": {"start_date", "end_date"},
        "description": "Sales headers and totals",
    },
    "sale_line_items": {
        "allowed_filters": {"product_id", "parent_id"},
        "description": "Product-level sales quantities and prices",
    },
    "inventory_snapshots": {
        "allowed_filters": {"start_date", "end_date"},
        "description": "Dated inventory observations",
    },
    "inventory_items": {
        "allowed_filters": {"product_id", "parent_id"},
        "description": "Product quantities within inventory snapshots",
    },
    "purchases": {
        "allowed_filters": {"start_date", "end_date", "supplier_id"},
        "description": "Purchase headers and totals",
    },
    "purchase_line_items": {
        "allowed_filters": {"product_id", "parent_id"},
        "description": "Product-level purchase quantities and costs",
    },
    "suppliers": {
        "allowed_filters": set(),
        "description": "Supplier profiles and operating terms",
    },
    "supplier_product_terms": {
        "allowed_filters": {"product_id", "supplier_id"},
        "description": "Supplier quotes and product-specific terms",
    },
    "purchase_orders": {
        "allowed_filters": {"start_date", "end_date", "supplier_id", "status"},
        "description": "Purchase orders and delivery status",
    },
    "purchase_order_line_items": {
        "allowed_filters": {"product_id", "parent_id"},
        "description": "Product lines within purchase orders",
    },
    "recurring_expenses": {
        "allowed_filters": {"active_only"},
        "description": "Recurring operating expenses",
    },
}

STATUS_VALUES: dict[str, set[str]] = {
    "documents": {"PENDING", "PROCESSING", "EXTRACTED", "FAILED"},
    "obligations": {"SCHEDULED", "PAID", "OVERDUE", "DISPUTED"},
    "purchase_orders": {"OPEN", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"},
}


class FinancialStore(Protocol):
    """Data operations required by the financial tools."""

    def list_documents(
        self,
        start_date: str | None = None,
        end_date: str | None = None,
        status: str | None = "EXTRACTED",
    ) -> list[dict[str, Any]]: ...

    def list_transactions(
        self,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> list[dict[str, Any]]: ...

    def list_obligations(
        self,
        start_date: str | None = None,
        end_date: str | None = None,
        status: str | None = None,
    ) -> list[dict[str, Any]]: ...

    def list_merchant_financial_settings(self) -> list[dict[str, Any]]: ...

    def list_cash_positions(
        self,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> list[dict[str, Any]]: ...

    def list_products(self, is_active_only: bool = True) -> list[dict[str, Any]]: ...

    def list_sales(
        self,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> list[dict[str, Any]]: ...

    def list_sale_line_items(
        self,
        sale_id: str | None = None,
        product_id: str | None = None,
    ) -> list[dict[str, Any]]: ...

    def list_inventory_snapshots(
        self,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> list[dict[str, Any]]: ...

    def list_inventory_items(
        self,
        snapshot_id: str | None = None,
        product_id: str | None = None,
    ) -> list[dict[str, Any]]: ...

    def list_purchases(
        self,
        start_date: str | None = None,
        end_date: str | None = None,
        supplier_id: str | None = None,
    ) -> list[dict[str, Any]]: ...

    def list_purchase_line_items(
        self,
        purchase_id: str | None = None,
        product_id: str | None = None,
    ) -> list[dict[str, Any]]: ...

    def list_suppliers(self) -> list[dict[str, Any]]: ...

    def list_supplier_product_terms(
        self,
        supplier_id: str | None = None,
        product_id: str | None = None,
    ) -> list[dict[str, Any]]: ...

    def list_purchase_orders(
        self,
        status: str | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
        supplier_id: str | None = None,
    ) -> list[dict[str, Any]]: ...

    def list_purchase_order_line_items(
        self,
        purchase_order_id: str | None = None,
        product_id: str | None = None,
    ) -> list[dict[str, Any]]: ...

    def list_recurring_expenses(self, is_active: bool = True) -> list[dict[str, Any]]: ...


def _parse_date(value: str, field_name: str) -> date:
    if not isinstance(value, str) or len(value) != 10:
        raise ValueError(f"{field_name} must use YYYY-MM-DD format")
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"{field_name} must use YYYY-MM-DD format") from exc
    if parsed.isoformat() != value:
        raise ValueError(f"{field_name} must use YYYY-MM-DD format")
    return parsed


def _plain_number(value: Any) -> Any:
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, list):
        return [_plain_number(item) for item in value]
    if isinstance(value, dict):
        return {key: _plain_number(item) for key, item in value.items()}
    return value


def _csv_value(value: Any) -> Any:
    """Keep nested canonical fields in one safe, deterministic CSV cell."""
    value = _plain_number(value)
    if isinstance(value, (dict, list)):
        return json.dumps(value, sort_keys=True, separators=(",", ":"))
    return "" if value is None else value


def _metadata(document: dict[str, Any]) -> dict[str, Any]:
    raw = document.get("rawMetadata")
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _transaction_key(transaction: dict[str, Any]) -> tuple[Any, ...]:
    reference = transaction.get("referenceNumber")
    if reference:
        return ("reference", reference, transaction.get("type"))
    return (
        "details",
        transaction.get("date"),
        transaction.get("amount"),
        transaction.get("type"),
        transaction.get("counterpartyIdentifier"),
        transaction.get("description"),
    )


class FinancialDataService:
    """Prepare small, reliable results for the agent."""

    def __init__(self, store: FinancialStore) -> None:
        self._store = store

    @staticmethod
    def _validate_date_range(
        start_date: str | None,
        end_date: str | None,
    ) -> tuple[str | None, str | None]:
        start = _parse_date(start_date, "start_date") if start_date else None
        end = _parse_date(end_date, "end_date") if end_date else None
        if start and end and start > end:
            raise ValueError("start_date cannot be after end_date")
        return (
            start.isoformat() if start else None,
            end.isoformat() if end else None,
        )

    @staticmethod
    def _validate_limit(limit: int, *, maximum: int = 200) -> None:
        if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= maximum:
            raise ValueError(f"limit must be between 1 and {maximum}")

    @staticmethod
    def _deduplicate_transactions(
        raw_items: list[dict[str, Any]],
    ) -> dict[tuple[Any, ...], dict[str, Any]]:
        unique: dict[tuple[Any, ...], dict[str, Any]] = {}
        for item in raw_items:
            key = _transaction_key(item)
            current = unique.get(key)
            if current is None or (item.get("updatedAt") or "") > (
                current.get("updatedAt") or ""
            ):
                unique[key] = item
        return unique

    def latest_balance(self) -> dict[str, Any]:
        if hasattr(self._store, "get_latest_cash_position"):
            cash_pos = self._store.get_latest_cash_position()
            if cash_pos:
                return {
                    "found": True,
                    "balance": _plain_number(cash_pos.get("totalLiquidCash", cash_pos.get("bankBalance", 0))),
                    "balanceDate": cash_pos.get("asOf"),
                    "bankBalance": _plain_number(cash_pos.get("bankBalance", 0)),
                    "cashOnHand": _plain_number(cash_pos.get("cashOnHand", 0)),
                    "source": "CASH_POSITION_SNAPSHOT",
                }

        candidates: list[dict[str, Any]] = []
        for document in self._store.list_documents():
            metadata = _metadata(document)
            balance = metadata.get("closingBalance")
            if balance is None:
                continue
            statement_period = metadata.get("statementPeriod") or {}
            candidates.append(
                {
                    "balance": balance,
                    "balanceDate": statement_period.get("endDate"),
                    "documentId": document.get("id"),
                    "processedAt": document.get("processedAt"),
                    "source": document.get("documentType") or "DOCUMENT",
                }
            )

        if candidates:
            latest = max(
                candidates,
                key=lambda item: (
                    item.get("balanceDate") or "",
                    item.get("processedAt") or "",
                ),
            )
            return {"found": True, **_plain_number(latest)}

        transactions = self._store.list_transactions()
        with_balance = [
            item for item in transactions if item.get("balanceAfterTransaction") is not None
        ]
        if not with_balance:
            return {
                "found": False,
                "warning": "No closing balance was found in the available records.",
            }

        latest_transaction = max(
            with_balance,
            key=lambda item: (item.get("date") or "", item.get("updatedAt") or ""),
        )
        return {
            "found": True,
            "balance": _plain_number(latest_transaction["balanceAfterTransaction"]),
            "balanceDate": latest_transaction.get("date"),
            "documentId": latest_transaction.get("documentId"),
            "source": "TRANSACTION",
        }

    def transactions(
        self,
        start_date: str | None = None,
        end_date: str | None = None,
        limit: int = 100,
    ) -> dict[str, Any]:
        start_date, end_date = self._validate_date_range(start_date, end_date)
        self._validate_limit(limit)

        raw_items = self._store.list_transactions(start_date, end_date)
        unique = self._deduplicate_transactions(raw_items)

        ordered = sorted(
            unique.values(),
            key=lambda item: (item.get("date") or "", item.get("createdAt") or ""),
            reverse=True,
        )
        selected = ordered[:limit]
        total_inflow = sum(
            Decimal(str(item.get("amount", 0)))
            for item in selected
            if item.get("type") == "INFLOW"
        )
        total_outflow = sum(
            Decimal(str(item.get("amount", 0)))
            for item in selected
            if item.get("type") == "OUTFLOW"
        )

        fields = (
            "id",
            "date",
            "amount",
            "type",
            "paymentMode",
            "counterpartyName",
            "counterpartyIdentifier",
            "category",
            "balanceAfterTransaction",
            "referenceNumber",
            "description",
            "status",
            "documentId",
        )
        items = [
            {field: _plain_number(item.get(field)) for field in fields if field in item}
            for item in selected
        ]
        return {
            "count": len(items),
            "availableCount": len(ordered),
            "duplicatesIgnored": len(raw_items) - len(unique),
            "totalInflow": _plain_number(total_inflow),
            "totalOutflow": _plain_number(total_outflow),
            "transactions": items,
        }

    def transactions_csv(
        self,
        start_date: str | None = None,
        end_date: str | None = None,
        limit: int = 2_000,
    ) -> tuple[list[str], list[dict[str, Any]]]:
        """Return deduplicated transaction rows suitable for CSV analysis."""
        start_date, end_date = self._validate_date_range(start_date, end_date)
        self._validate_limit(limit, maximum=2_000)

        raw_items = self._store.list_transactions(start_date, end_date)
        unique = self._deduplicate_transactions(raw_items)

        columns = [
            "date",
            "amount",
            "type",
            "paymentMode",
            "counterpartyName",
            "counterpartyIdentifier",
            "category",
            "balanceAfterTransaction",
            "referenceNumber",
            "description",
            "status",
            "documentId",
        ]
        ordered = sorted(
            unique.values(),
            key=lambda item: (item.get("date") or "", item.get("createdAt") or ""),
        )[:limit]
        rows = [
            {column: _plain_number(item.get(column)) for column in columns}
            for item in ordered
        ]
        return columns, rows

    def upcoming_obligations(
        self,
        days_ahead: int = 30,
        obligation_type: str = "ALL",
        as_of_date: str | None = None,
    ) -> dict[str, Any]:
        if not 1 <= days_ahead <= 365:
            raise ValueError("days_ahead must be between 1 and 365")

        normalized_type = obligation_type.upper()
        if normalized_type not in {"ALL", "PAYABLE", "RECEIVABLE"}:
            raise ValueError("obligation_type must be ALL, PAYABLE, or RECEIVABLE")

        start = (
            _parse_date(as_of_date, "as_of_date")
            if as_of_date
            else datetime.now(UTC).date()
        )
        end = start + timedelta(days=days_ahead)
        raw_items = self._store.list_obligations(start.isoformat(), end.isoformat())
        active_items = [
            item
            for item in raw_items
            if item.get("status") in {None, "SCHEDULED", "OVERDUE"}
            and (normalized_type == "ALL" or item.get("type") == normalized_type)
        ]
        ordered = sorted(active_items, key=lambda item: item.get("dueDate") or "")

        fields = (
            "id",
            "title",
            "counterpartyName",
            "amount",
            "dueDate",
            "type",
            "category",
            "priorityWeight",
            "penaltyRatePerDay",
            "isStatutory",
            "status",
            "documentId",
        )
        items = [
            {field: _plain_number(item.get(field)) for field in fields if field in item}
            for item in ordered
        ]
        payable_total = sum(
            Decimal(str(item.get("amount", 0)))
            for item in ordered
            if item.get("type") == "PAYABLE"
        )
        receivable_total = sum(
            Decimal(str(item.get("amount", 0)))
            for item in ordered
            if item.get("type") == "RECEIVABLE"
        )
        return {
            "fromDate": start.isoformat(),
            "toDate": end.isoformat(),
            "count": len(items),
            "totalPayable": _plain_number(payable_total),
            "totalReceivable": _plain_number(receivable_total),
            "obligations": items,
            "warning": None if items else "No upcoming obligations were found.",
        }

    def business_data(
        self,
        dataset: DatasetName,
        start_date: str | None = None,
        end_date: str | None = None,
        product_id: str | None = None,
        supplier_id: str | None = None,
        parent_id: str | None = None,
        status: str | None = None,
        active_only: bool | None = None,
        limit: int = 100,
    ) -> dict[str, Any]:
        """Read one canonical dataset through a fixed, validated dispatcher."""
        records, available_count, warning = self._business_records(
            dataset=dataset,
            start_date=start_date,
            end_date=end_date,
            product_id=product_id,
            supplier_id=supplier_id,
            parent_id=parent_id,
            status=status,
            active_only=active_only,
            limit=limit,
        )
        return {
            "dataset": dataset,
            "count": len(records),
            "availableCount": available_count,
            "truncated": available_count > len(records),
            "records": records,
            "warning": warning,
        }

    def business_data_csv(
        self,
        dataset: DatasetName,
        start_date: str | None = None,
        end_date: str | None = None,
        product_id: str | None = None,
        supplier_id: str | None = None,
        parent_id: str | None = None,
        status: str | None = None,
        active_only: bool | None = None,
        limit: int = 200,
    ) -> dict[str, Any]:
        """Prepare the same validated records as ``business_data`` for CSV."""
        result = self.business_data(
            dataset=dataset,
            start_date=start_date,
            end_date=end_date,
            product_id=product_id,
            supplier_id=supplier_id,
            parent_id=parent_id,
            status=status,
            active_only=active_only,
            limit=limit,
        )
        columns: list[str] = []
        for record in result["records"]:
            for key in record:
                if key not in columns:
                    columns.append(key)
        if not columns:
            columns = ["id"]
        rows = [
            {column: _csv_value(record.get(column)) for column in columns}
            for record in result["records"]
        ]
        return {**result, "columns": columns, "rows": rows}

    def _business_records(
        self,
        *,
        dataset: DatasetName,
        start_date: str | None,
        end_date: str | None,
        product_id: str | None,
        supplier_id: str | None,
        parent_id: str | None,
        status: str | None,
        active_only: bool | None,
        limit: int,
    ) -> tuple[list[dict[str, Any]], int, str | None]:
        if dataset not in DATASET_SPECS:
            raise ValueError(
                "dataset must be one of: " + ", ".join(DATASET_NAMES)
            )

        spec = DATASET_SPECS[dataset]
        values = {
            "start_date": start_date,
            "end_date": end_date,
            "product_id": product_id,
            "supplier_id": supplier_id,
            "parent_id": parent_id,
            "status": status,
            "active_only": active_only,
        }
        unknown_filters = sorted(
            name
            for name, value in values.items()
            if value is not None and name not in spec["allowed_filters"]
        )
        if unknown_filters:
            raise ValueError(
                f"{', '.join(unknown_filters)} filter(s) do not apply to {dataset}"
            )

        normalized_start, normalized_end = self._validate_date_range(
            start_date,
            end_date,
        )
        normalized_status = self._normalize_status(dataset, status)
        if active_only is not None and not isinstance(active_only, bool):
            raise ValueError("active_only must be true or false")
        if dataset != "merchant_settings":
            self._validate_limit(limit)

        # This map is deliberately closed over static method references. The
        # model supplies a dataset key, never a DynamoDB table or method name.
        readers: dict[str, Callable[..., Any] | None] = {
            "documents": getattr(self._store, "list_documents", None),
            "transactions": getattr(self._store, "list_transactions", None),
            "obligations": getattr(self._store, "list_obligations", None),
            "merchant_settings": getattr(
                self._store,
                "list_merchant_financial_settings",
                None,
            ),
            "cash_positions": getattr(self._store, "list_cash_positions", None),
            "products": getattr(self._store, "list_products", None),
            "sales": getattr(self._store, "list_sales", None),
            "sale_line_items": getattr(self._store, "list_sale_line_items", None),
            "inventory_snapshots": getattr(
                self._store,
                "list_inventory_snapshots",
                None,
            ),
            "inventory_items": getattr(self._store, "list_inventory_items", None),
            "purchases": getattr(self._store, "list_purchases", None),
            "purchase_line_items": getattr(
                self._store,
                "list_purchase_line_items",
                None,
            ),
            "suppliers": getattr(self._store, "list_suppliers", None),
            "supplier_product_terms": getattr(
                self._store,
                "list_supplier_product_terms",
                None,
            ),
            "purchase_orders": getattr(self._store, "list_purchase_orders", None),
            "purchase_order_line_items": getattr(
                self._store,
                "list_purchase_order_line_items",
                None,
            ),
            "recurring_expenses": getattr(
                self._store,
                "list_recurring_expenses",
                None,
            ),
        }
        reader = readers[dataset]
        if reader is None:
            return [], 0, f"The {dataset} dataset is not configured for this environment."

        reader_args: dict[str, Any] = {}
        if "start_date" in spec["allowed_filters"] and normalized_start:
            reader_args["start_date"] = normalized_start
        if "end_date" in spec["allowed_filters"] and normalized_end:
            reader_args["end_date"] = normalized_end
        if "status" in spec["allowed_filters"] and normalized_status:
            reader_args["status"] = normalized_status
        elif dataset == "documents":
            # The specialized balance path defaults to EXTRACTED, while the
            # general reader must expose every document unless filtered.
            reader_args["status"] = None
        if "product_id" in spec["allowed_filters"] and product_id:
            reader_args["product_id"] = product_id
        if "supplier_id" in spec["allowed_filters"] and supplier_id:
            reader_args["supplier_id"] = supplier_id
        if "parent_id" in spec["allowed_filters"] and parent_id:
            parent_arguments = {
                "sale_line_items": "sale_id",
                "inventory_items": "snapshot_id",
                "purchase_line_items": "purchase_id",
                "purchase_order_line_items": "purchase_order_id",
            }
            reader_args[parent_arguments[dataset]] = parent_id
        if dataset == "products":
            reader_args["is_active_only"] = active_only is not False
        elif dataset == "recurring_expenses":
            reader_args["is_active"] = active_only is not False

        try:
            raw_items = reader(**reader_args)
        except Exception:  # noqa: BLE001 - convert backend read failures to safe warnings
            return [], 0, f"The {dataset} dataset could not be read in this environment."

        warning = getattr(raw_items, "warning", None)
        records = list(raw_items)
        if dataset == "transactions":
            records = list(self._deduplicate_transactions(records).values())
        if dataset == "merchant_settings":
            records = records[:1]
        available_count = len(records)
        selected = records if dataset == "merchant_settings" else records[:limit]
        return [_plain_number(record) for record in selected], available_count, warning

    @staticmethod
    def _normalize_status(dataset: str, status: str | None) -> str | None:
        if status is None:
            return None
        if not isinstance(status, str) or not status.strip():
            raise ValueError("status must be a non-empty string")
        normalized = status.strip().upper()
        allowed = STATUS_VALUES.get(dataset)
        if allowed is not None and normalized not in allowed:
            raise ValueError(
                f"status for {dataset} must be one of: {', '.join(sorted(allowed))}"
            )
        return normalized


@lru_cache(maxsize=1)
def _service() -> FinancialDataService:
    settings = Settings.from_environment()
    tenant_id = os.getenv("FINFINE_TENANT_ID", "").strip()
    if not tenant_id:
        raise RuntimeError("FINFINE_TENANT_ID is required for unscoped local tools")
    return FinancialDataService(DynamoFinancialStore(settings, tenant_id=tenant_id))


def create_financial_data_tools(
    tenant_id: str,
    artifacts: LocalArtifactStore | None = None,
) -> list[Any]:
    """Build every financial tool bound to the authenticated request tenant."""
    if not tenant_id or not tenant_id.strip():
        raise ValueError("tenant_id is required")
    settings = Settings.from_environment()
    service = FinancialDataService(
        DynamoFinancialStore(settings, tenant_id=tenant_id),
    )
    artifact_store = artifacts or LocalArtifactStore()

    @tool(name="get_latest_balance")
    def scoped_latest_balance() -> dict[str, Any]:
        return service.latest_balance()

    @tool(name="get_transactions")
    def scoped_transactions(
        start_date: str | None = None,
        end_date: str | None = None,
        limit: int = 100,
    ) -> dict[str, Any]:
        return service.transactions(start_date, end_date, limit)

    @tool(name="get_upcoming_obligations")
    def scoped_upcoming_obligations(
        days_ahead: int = 30,
        obligation_type: str = "ALL",
        as_of_date: str | None = None,
    ) -> dict[str, Any]:
        return service.upcoming_obligations(days_ahead, obligation_type, as_of_date)

    @tool(name="get_business_data")
    def scoped_business_data(
        dataset: DatasetName,
        start_date: str | None = None,
        end_date: str | None = None,
        product_id: str | None = None,
        supplier_id: str | None = None,
        parent_id: str | None = None,
        status: str | None = None,
        active_only: bool | None = None,
        limit: int = 100,
    ) -> dict[str, Any]:
        return service.business_data(
            dataset=dataset,
            start_date=start_date,
            end_date=end_date,
            product_id=product_id,
            supplier_id=supplier_id,
            parent_id=parent_id,
            status=status,
            active_only=active_only,
            limit=limit,
        )

    return [
        scoped_latest_balance,
        scoped_transactions,
        scoped_upcoming_obligations,
        scoped_business_data,
        create_transactions_csv_tool(artifact_store, service=service),
        create_business_data_csv_tool(artifact_store, service=service),
    ]


@tool
def get_business_data(
    dataset: DatasetName,
    start_date: str | None = None,
    end_date: str | None = None,
    product_id: str | None = None,
    supplier_id: str | None = None,
    parent_id: str | None = None,
    status: str | None = None,
    active_only: bool | None = None,
    limit: int = 100,
) -> dict[str, Any]:
    """Read one tenant-scoped canonical business dataset.

    Choose only a dataset from the enum; physical DynamoDB table names are not
    accepted. Use explicit filters supported by that dataset. The returned
    envelope includes count, availableCount, truncation, records, and warning.
    Related records use these IDs: SaleLineItem.saleId -> Sale.id;
    SaleLineItem.productId -> Product.id; InventoryItem.inventorySnapshotId ->
    InventorySnapshot.id; InventoryItem.productId -> Product.id;
    PurchaseLineItem.purchaseId -> Purchase.id; Purchase.supplierId ->
    SupplierProfile.id; SupplierProductTerms.supplierId/productId -> supplier
    and product; PurchaseOrderLineItem.purchaseOrderId -> PurchaseOrder.id.
    Transactions may reference products, suppliers, sales, purchases, or
    obligations. Calls are read-only and always use the server-configured
    tenant.

    Args:
        dataset: One of the 17 canonical dataset names.
        start_date: Inclusive YYYY-MM-DD lower date bound where supported.
        end_date: Inclusive YYYY-MM-DD upper date bound where supported.
        product_id: Product filter for line items and supplier terms.
        supplier_id: Supplier filter for purchases, supplier terms, and orders.
        parent_id: Parent ID for sale, inventory, purchase, or order line items.
        status: Dataset-specific status for documents, obligations, or orders.
        active_only: Whether to return only active products or recurring expenses.
        limit: Maximum records, from 1 to 200. Singleton settings ignore it.
    """
    return _service().business_data(
        dataset=dataset,
        start_date=start_date,
        end_date=end_date,
        product_id=product_id,
        supplier_id=supplier_id,
        parent_id=parent_id,
        status=status,
        active_only=active_only,
        limit=limit,
    )


@tool
def get_latest_balance() -> dict[str, Any]:
    """Return the latest available closing balance and its source date."""
    return _service().latest_balance()


@tool
def get_transactions(
    start_date: str | None = None,
    end_date: str | None = None,
    limit: int = 100,
) -> dict[str, Any]:
    """Read transactions and ready-to-use inflow/outflow totals for a date range.

    The result already contains totalInflow and totalOutflow. Use those values
    directly when the user asks for a transaction summary; Python is not needed
    to recalculate or verify them.

    Args:
        start_date: Earliest transaction date to include.
        end_date: Latest transaction date to include.
        limit: Maximum number of transactions to return, from 1 to 200.
    """
    return _service().transactions(start_date, end_date, limit)


@tool
def get_upcoming_obligations(
    days_ahead: int = 30,
    obligation_type: str = "ALL",
    as_of_date: str | None = None,
) -> dict[str, Any]:
    """Read upcoming payables and receivables.

    Args:
        days_ahead: Number of days to include, from 1 to 365.
        obligation_type: ALL, PAYABLE, or RECEIVABLE.
        as_of_date: Optional starting date in YYYY-MM-DD format; defaults to today.
    """
    return _service().upcoming_obligations(
        days_ahead=days_ahead,
        obligation_type=obligation_type,
        as_of_date=as_of_date,
    )


def create_transactions_csv_tool(
    artifacts: LocalArtifactStore,
    service: FinancialDataService | None = None,
) -> Any:
    """Create the transaction CSV export tool for one agent process."""

    @tool(name="export_transactions_csv")
    def export_transactions_csv(
        start_date: str | None = None,
        end_date: str | None = None,
        limit: int = 2_000,
    ) -> dict[str, Any]:
        """Required before Python computes over transaction records.

        Call this instead of copying transaction objects into Python code. Pass
        the returned artifactId to run_financial_python, where the file is named
        transactions.csv. Exporting only prepares the data; it does not perform
        the requested calculation or model. After this succeeds, call
        run_financial_python before answering the computation request.

        Args:
            start_date: Earliest transaction date in YYYY-MM-DD format.
            end_date: Latest transaction date in YYYY-MM-DD format.
            limit: Maximum rows to export, from 1 to 2000.
        """
        active_service = service or _service()
        columns, rows = active_service.transactions_csv(start_date, end_date, limit)
        output = StringIO(newline="")
        writer = csv.DictWriter(output, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
        artifact = artifacts.put(
            filename="transactions.csv",
            content_type="text/csv",
            data=output.getvalue().encode("utf-8"),
        )
        return {
            "artifactId": artifact.artifact_id,
            "filename": artifact.filename,
            "rowCount": len(rows),
            "columns": columns,
            "sizeBytes": artifact.size_bytes,
            "warning": None if rows else "The exported transaction file has no rows.",
        }

    return export_transactions_csv


def create_business_data_csv_tool(
    artifacts: LocalArtifactStore,
    service: FinancialDataService | None = None,
) -> Any:
    """Create a CSV export tool for one validated canonical dataset."""

    @tool(name="export_business_data_csv")
    def export_business_data_csv(
        dataset: DatasetName,
        start_date: str | None = None,
        end_date: str | None = None,
        product_id: str | None = None,
        supplier_id: str | None = None,
        parent_id: str | None = None,
        status: str | None = None,
        active_only: bool | None = None,
        limit: int = 200,
    ) -> dict[str, Any]:
        """Export one tenant-scoped canonical dataset for Python analysis.

        Use the returned artifactId with run_financial_python. The file name is
        the selected dataset name with a .csv suffix. This tool exports only
        one dataset per call; call it again for another dataset.

        Args:
            dataset: One of the 17 canonical dataset names.
            start_date: Inclusive YYYY-MM-DD lower date bound where supported.
            end_date: Inclusive YYYY-MM-DD upper date bound where supported.
            product_id: Product filter for line items and supplier terms.
            supplier_id: Supplier filter for purchases, supplier terms, and orders.
            parent_id: Parent ID for sale, inventory, purchase, or order line items.
            status: Dataset-specific status for documents, obligations, or orders.
            active_only: Whether to return only active products or recurring expenses.
            limit: Maximum rows to export, from 1 to 200. Singleton settings ignore it.
        """
        active_service = service or _service()
        result = active_service.business_data_csv(
            dataset=dataset,
            start_date=start_date,
            end_date=end_date,
            product_id=product_id,
            supplier_id=supplier_id,
            parent_id=parent_id,
            status=status,
            active_only=active_only,
            limit=limit,
        )
        output = StringIO(newline="")
        writer = csv.DictWriter(output, fieldnames=result["columns"])
        writer.writeheader()
        writer.writerows(result["rows"])
        artifact = artifacts.put(
            filename=f"{dataset}.csv",
            content_type="text/csv",
            data=output.getvalue().encode("utf-8"),
        )
        return {
            "artifactId": artifact.artifact_id,
            "dataset": dataset,
            "filename": artifact.filename,
            "rowCount": len(result["rows"]),
            "columns": result["columns"],
            "warning": result["warning"]
            or (
                f"The exported {dataset} file has no rows."
                if not result["rows"]
                else None
            ),
        }

    return export_business_data_csv
