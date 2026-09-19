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
        self._table_cache: dict[str, str | None] = {}

    def _resolve_table(self, configured_name: str | None, prefix: str) -> str | None:
        if configured_name:
            return configured_name
        if prefix in self._table_cache:
            return self._table_cache[prefix]
        try:
            paginator = self._client.get_paginator("list_tables")
            for page in paginator.paginate():
                for name in page.get("TableNames", []):
                    if name.lower().startswith(prefix.lower()):
                        self._table_cache[prefix] = name
                        return name
        except Exception:
            pass
        self._table_cache[prefix] = None
        return None

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

    # --- New Canonical Business Entity Query Methods ---

    def get_merchant_financial_settings(self) -> dict[str, Any] | None:
        table_name = self._resolve_table(self._settings.merchant_settings_table_name, "MerchantFinancialSettings")
        if not table_name:
            return None
        condition = Attr("tenantId").eq(self._settings.tenant_id)
        items = self._scan(table_name, condition)
        return items[0] if items else None

    def get_latest_cash_position(self) -> dict[str, Any] | None:
        table_name = self._resolve_table(self._settings.cash_position_table_name, "CashPositionSnapshot")
        if not table_name:
            return None
        condition = Attr("tenantId").eq(self._settings.tenant_id)
        items = self._scan(table_name, condition)
        if not items:
            return None
        return sorted(items, key=lambda x: x.get("asOf", ""), reverse=True)[0]

    def list_products(self, is_active_only: bool = True) -> list[dict[str, Any]]:
        table_name = self._resolve_table(self._settings.product_table_name, "Product")
        if not table_name:
            return []
        condition = Attr("tenantId").eq(self._settings.tenant_id)
        if is_active_only:
            condition &= Attr("isActive").eq(True)
        return self._scan(table_name, condition)

    def list_sales(
        self,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> list[dict[str, Any]]:
        table_name = self._resolve_table(self._settings.sale_table_name, "Sale")
        if not table_name:
            return []
        condition = Attr("tenantId").eq(self._settings.tenant_id)
        if start_date and end_date:
            condition &= Attr("saleDate").between(start_date, end_date)
        elif start_date:
            condition &= Attr("saleDate").gte(start_date)
        elif end_date:
            condition &= Attr("saleDate").lte(end_date)
        return self._scan(table_name, condition)

    def list_sale_line_items(
        self,
        sale_id: str | None = None,
        product_id: str | None = None,
    ) -> list[dict[str, Any]]:
        table_name = self._resolve_table(self._settings.sale_line_item_table_name, "SaleLineItem")
        if not table_name:
            return []
        condition = Attr("tenantId").eq(self._settings.tenant_id)
        if sale_id:
            condition &= Attr("saleId").eq(sale_id)
        if product_id:
            condition &= Attr("productId").eq(product_id)
        return self._scan(table_name, condition)

    def list_inventory_snapshots(self) -> list[dict[str, Any]]:
        table_name = self._resolve_table(self._settings.inventory_snapshot_table_name, "InventorySnapshot")
        if not table_name:
            return []
        condition = Attr("tenantId").eq(self._settings.tenant_id)
        return self._scan(table_name, condition)

    def list_inventory_items(
        self,
        snapshot_id: str | None = None,
        product_id: str | None = None,
    ) -> list[dict[str, Any]]:
        table_name = self._resolve_table(self._settings.inventory_item_table_name, "InventoryItem")
        if not table_name:
            return []
        condition = Attr("tenantId").eq(self._settings.tenant_id)
        if snapshot_id:
            condition &= Attr("inventorySnapshotId").eq(snapshot_id)
        if product_id:
            condition &= Attr("productId").eq(product_id)
        return self._scan(table_name, condition)

    def list_purchases(
        self,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> list[dict[str, Any]]:
        table_name = self._resolve_table(self._settings.purchase_table_name, "Purchase")
        if not table_name:
            return []
        condition = Attr("tenantId").eq(self._settings.tenant_id)
        if start_date and end_date:
            condition &= Attr("purchaseDate").between(start_date, end_date)
        elif start_date:
            condition &= Attr("purchaseDate").gte(start_date)
        elif end_date:
            condition &= Attr("purchaseDate").lte(end_date)
        return self._scan(table_name, condition)

    def list_purchase_line_items(
        self,
        purchase_id: str | None = None,
        product_id: str | None = None,
    ) -> list[dict[str, Any]]:
        table_name = self._resolve_table(self._settings.purchase_line_item_table_name, "PurchaseLineItem")
        if not table_name:
            return []
        condition = Attr("tenantId").eq(self._settings.tenant_id)
        if purchase_id:
            condition &= Attr("purchaseId").eq(purchase_id)
        if product_id:
            condition &= Attr("productId").eq(product_id)
        return self._scan(table_name, condition)

    def list_suppliers(self) -> list[dict[str, Any]]:
        table_name = self._resolve_table(self._settings.supplier_profile_table_name, "SupplierProfile")
        if not table_name:
            return []
        condition = Attr("tenantId").eq(self._settings.tenant_id)
        return self._scan(table_name, condition)

    def list_supplier_product_terms(
        self,
        supplier_id: str | None = None,
        product_id: str | None = None,
    ) -> list[dict[str, Any]]:
        table_name = self._resolve_table(self._settings.supplier_product_terms_table_name, "SupplierProductTerms")
        if not table_name:
            return []
        condition = Attr("tenantId").eq(self._settings.tenant_id)
        if supplier_id:
            condition &= Attr("supplierId").eq(supplier_id)
        if product_id:
            condition &= Attr("productId").eq(product_id)
        return self._scan(table_name, condition)

    def list_purchase_orders(self, status: str | None = None) -> list[dict[str, Any]]:
        table_name = self._resolve_table(self._settings.purchase_order_table_name, "PurchaseOrder")
        if not table_name:
            return []
        condition = Attr("tenantId").eq(self._settings.tenant_id)
        if status:
            condition &= Attr("status").eq(status)
        return self._scan(table_name, condition)

    def list_purchase_order_line_items(
        self,
        purchase_order_id: str | None = None,
    ) -> list[dict[str, Any]]:
        table_name = self._resolve_table(self._settings.purchase_order_line_item_table_name, "PurchaseOrderLineItem")
        if not table_name:
            return []
        condition = Attr("tenantId").eq(self._settings.tenant_id)
        if purchase_order_id:
            condition &= Attr("purchaseOrderId").eq(purchase_order_id)
        return self._scan(table_name, condition)

    def list_recurring_expenses(self, is_active: bool = True) -> list[dict[str, Any]]:
        table_name = self._resolve_table(self._settings.recurring_expense_table_name, "RecurringExpense")
        if not table_name:
            return []
        condition = Attr("tenantId").eq(self._settings.tenant_id)
        if is_active:
            condition &= Attr("isActive").eq(True)
        return self._scan(table_name, condition)

    def _scan(self, table_name: str | None, condition: Any) -> list[dict[str, Any]]:
        if not table_name:
            return []
        paginator = self._client.get_paginator("scan")
        pages = paginator.paginate(
            TableName=table_name,
            FilterExpression=condition,
        )
        return [item for page in pages for item in page.get("Items", [])]
