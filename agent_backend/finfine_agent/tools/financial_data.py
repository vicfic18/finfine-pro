"""Read-only financial tools for the FinFine Pro agent."""

from __future__ import annotations

import json
from datetime import date, timedelta
from decimal import Decimal
from functools import lru_cache
from typing import Any, Protocol

from strands import tool

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

        start = _parse_date(as_of_date, "as_of_date") if as_of_date else date.today()
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


@lru_cache(maxsize=1)
def _service() -> FinancialDataService:
    settings = Settings.from_environment()
    return FinancialDataService(DynamoFinancialStore(settings))


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
    """Read transactions for an optional YYYY-MM-DD date range.

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
