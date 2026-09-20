"""Read-only financial tools for the FinFine Pro agent."""

from __future__ import annotations

import csv
import json
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from io import StringIO
from typing import Any, Protocol

from strands import tool

from finfine_agent.artifacts import LocalArtifactStore
from finfine_agent.config import Settings
from finfine_agent.dynamodb import DynamoFinancialStore


class FinancialStore(Protocol):
    """Data operations required by the financial tools."""

    def list_documents(self) -> list[dict[str, Any]]: ...

    def list_transactions(
        self,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> list[dict[str, Any]]: ...

    def list_obligations(
        self,
        start_date: str,
        end_date: str,
    ) -> list[dict[str, Any]]: ...


def _parse_date(value: str, field_name: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"{field_name} must use YYYY-MM-DD format") from exc


def _plain_number(value: Any) -> Any:
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, list):
        return [_plain_number(item) for item in value]
    if isinstance(value, dict):
        return {key: _plain_number(item) for key, item in value.items()}
    return value


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
        if start_date:
            _parse_date(start_date, "start_date")
        if end_date:
            _parse_date(end_date, "end_date")
        if start_date and end_date and start_date > end_date:
            raise ValueError("start_date cannot be after end_date")
        if not 1 <= limit <= 200:
            raise ValueError("limit must be between 1 and 200")

        raw_items = self._store.list_transactions(start_date, end_date)
        unique: dict[tuple[Any, ...], dict[str, Any]] = {}
        for item in raw_items:
            key = _transaction_key(item)
            current = unique.get(key)
            if current is None or (item.get("updatedAt") or "") > (
                current.get("updatedAt") or ""
            ):
                unique[key] = item

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
        if start_date:
            _parse_date(start_date, "start_date")
        if end_date:
            _parse_date(end_date, "end_date")
        if start_date and end_date and start_date > end_date:
            raise ValueError("start_date cannot be after end_date")
        if not 1 <= limit <= 2_000:
            raise ValueError("limit must be between 1 and 2000")

        raw_items = self._store.list_transactions(start_date, end_date)
        unique: dict[tuple[Any, ...], dict[str, Any]] = {}
        for item in raw_items:
            key = _transaction_key(item)
            current = unique.get(key)
            if current is None or (item.get("updatedAt") or "") > (
                current.get("updatedAt") or ""
            ):
                unique[key] = item

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


def create_financial_data_tools(tenant_id: str, artifacts: LocalArtifactStore | None = None) -> list[Any]:
    """Build financial tools bound to the authenticated request subject."""
    if not tenant_id or not tenant_id.strip():
        raise ValueError("tenant_id is required")
    settings = Settings.from_environment()
    service = FinancialDataService(DynamoFinancialStore(settings, tenant_id=tenant_id))

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

    return [
        scoped_latest_balance,
        scoped_transactions,
        scoped_upcoming_obligations,
        create_transactions_csv_tool(artifacts or LocalArtifactStore(), service=service),
    ]


def create_transactions_csv_tool(artifacts: LocalArtifactStore, service: FinancialDataService) -> Any:
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
        columns, rows = service.transactions_csv(start_date, end_date, limit)
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
