"""Read-only access to the existing FinFine DynamoDB tables."""

from __future__ import annotations

from typing import Any

import boto3
from boto3.dynamodb.conditions import Attr
from botocore.config import Config

from finfine_agent.config import Settings


class DynamoFinancialStore:
    """Read financial records for one configured tenant."""

    def __init__(self, settings: Settings) -> None:
        session = boto3.Session(
            profile_name=settings.aws_profile,
            region_name=settings.aws_region,
        )
        self._resource = session.resource(
            "dynamodb",
            config=Config(
                retries={"total_max_attempts": 4, "mode": "adaptive"},
                connect_timeout=5,
                read_timeout=15,
            ),
        )
        self._client = self._resource.meta.client
        self._settings = settings

    def list_documents(self) -> list[dict[str, Any]]:
        condition = (
            Attr("tenantId").eq(self._settings.tenant_id)
            & Attr("status").eq("EXTRACTED")
        )
        return self._scan(self._settings.document_table_name, condition)

    def list_transactions(
        self,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> list[dict[str, Any]]:
        condition = Attr("tenantId").eq(self._settings.tenant_id)
        if start_date and end_date:
            condition &= Attr("date").between(start_date, end_date)
        elif start_date:
            condition &= Attr("date").gte(start_date)
        elif end_date:
            condition &= Attr("date").lte(end_date)
        return self._scan(self._settings.transaction_table_name, condition)

    def list_obligations(
        self,
        start_date: str,
        end_date: str,
    ) -> list[dict[str, Any]]:
        condition = (
            Attr("tenantId").eq(self._settings.tenant_id)
            & Attr("dueDate").between(start_date, end_date)
        )
        return self._scan(self._settings.obligation_table_name, condition)

    def _scan(self, table_name: str, condition: Any) -> list[dict[str, Any]]:
        paginator = self._client.get_paginator("scan")
        pages = paginator.paginate(
            TableName=table_name,
            FilterExpression=condition,
        )
        return [item for page in pages for item in page.get("Items", [])]
