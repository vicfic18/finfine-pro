"""Read-only access to the existing FinFine DynamoDB tables."""

from __future__ import annotations

from typing import Any

import boto3
from boto3.dynamodb.conditions import Attr
from botocore.config import Config

from finfine_agent.config import Settings


class ReadResult(list[dict[str, Any]]):
    """List-compatible reader result with an optional environment warning."""

    def __init__(
        self,
        items: list[dict[str, Any]] | None = None,
        *,
        warning: str | None = None,
    ) -> None:
        super().__init__(items or [])
        self.warning = warning


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
        self._table_resolution_warnings: dict[str, str | None] = {}

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
                        self._table_resolution_warnings[prefix] = None
                        return name
        except Exception:  # noqa: BLE001 - table discovery must fail closed
            self._table_resolution_warnings[prefix] = (
                f"The {prefix} dataset could not be resolved in this environment."
            )
            self._table_cache[prefix] = None
            return None
        self._table_cache[prefix] = None
        self._table_resolution_warnings[prefix] = None
        return None

    def list_documents(
        self,
        start_date: str | None = None,
        end_date: str | None = None,
        status: str | None = "EXTRACTED",
    ) -> ReadResult:
        condition = Attr("tenantId").eq(self._settings.tenant_id)
        if status:
            condition &= Attr("status").eq(status)
        condition = self._add_date_range(
            condition,
            "processedAt",
            start_date,
            end_date,
            timestamp=True,
        )
        return self._scan(
            self._settings.document_table_name,
            condition,
            dataset="documents",
        )

    def list_transactions(
        self,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> ReadResult:
        condition = Attr("tenantId").eq(self._settings.tenant_id)
        if start_date and end_date:
            condition &= Attr("date").between(start_date, end_date)
        elif start_date:
            condition &= Attr("date").gte(start_date)
        elif end_date:
            condition &= Attr("date").lte(end_date)
        return self._scan(
            self._settings.transaction_table_name,
            condition,
            dataset="transactions",
        )

    def list_obligations(
        self,
        start_date: str | None = None,
        end_date: str | None = None,
        status: str | None = None,
    ) -> ReadResult:
        condition = Attr("tenantId").eq(self._settings.tenant_id)
        if status:
            condition &= Attr("status").eq(status)
        condition = self._add_date_range(
            condition,
            "dueDate",
            start_date,
            end_date,
        )
        return self._scan(
            self._settings.obligation_table_name,
            condition,
            dataset="obligations",
        )

    # --- New Canonical Business Entity Query Methods ---

    def list_merchant_financial_settings(self) -> ReadResult:
        table_name = self._resolve_table(self._settings.merchant_settings_table_name, "MerchantFinancialSettings")
        if not table_name:
            return self._empty_optional("merchant_settings", "MerchantFinancialSettings")
        condition = Attr("tenantId").eq(self._settings.tenant_id)
        return self._scan(
            table_name,
            condition,
            dataset="merchant_settings",
            resolution_key="MerchantFinancialSettings",
        )

    def get_merchant_financial_settings(self) -> dict[str, Any] | None:
        items = self.list_merchant_financial_settings()
        return items[0] if items else None

    def list_cash_positions(
        self,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> ReadResult:
        table_name = self._resolve_table(self._settings.cash_position_table_name, "CashPositionSnapshot")
        if not table_name:
            return self._empty_optional("cash_positions", "CashPositionSnapshot")
        condition = Attr("tenantId").eq(self._settings.tenant_id)
        condition = self._add_date_range(condition, "asOf", start_date, end_date)
        return self._scan(
            table_name,
            condition,
            dataset="cash_positions",
            resolution_key="CashPositionSnapshot",
        )

    def get_latest_cash_position(self) -> dict[str, Any] | None:
        items = self.list_cash_positions()
        if not items:
            return None
        return max(items, key=lambda x: x.get("asOf", ""))

    def list_products(self, is_active_only: bool = True) -> list[dict[str, Any]]:
        table_name = self._resolve_table(self._settings.product_table_name, "Product")
        if not table_name:
            return self._empty_optional("products", "Product")
        condition = Attr("tenantId").eq(self._settings.tenant_id)
        if is_active_only:
            condition &= Attr("isActive").eq(True)
        return self._scan(
            table_name,
            condition,
            dataset="products",
            resolution_key="Product",
        )

    def list_sales(
        self,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> ReadResult:
        table_name = self._resolve_table(self._settings.sale_table_name, "Sale")
        if not table_name:
            return self._empty_optional("sales", "Sale")
        condition = Attr("tenantId").eq(self._settings.tenant_id)
        if start_date and end_date:
            condition &= Attr("saleDate").between(start_date, end_date)
        elif start_date:
            condition &= Attr("saleDate").gte(start_date)
        elif end_date:
            condition &= Attr("saleDate").lte(end_date)
        return self._scan(table_name, condition, dataset="sales", resolution_key="Sale")

    def list_sale_line_items(
        self,
        sale_id: str | None = None,
        product_id: str | None = None,
    ) -> ReadResult:
        table_name = self._resolve_table(self._settings.sale_line_item_table_name, "SaleLineItem")
        if not table_name:
            return self._empty_optional("sale_line_items", "SaleLineItem")
        condition = Attr("tenantId").eq(self._settings.tenant_id)
        if sale_id:
            condition &= Attr("saleId").eq(sale_id)
        if product_id:
            condition &= Attr("productId").eq(product_id)
        return self._scan(
            table_name,
            condition,
            dataset="sale_line_items",
            resolution_key="SaleLineItem",
        )

    def list_inventory_snapshots(
        self,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> ReadResult:
        table_name = self._resolve_table(self._settings.inventory_snapshot_table_name, "InventorySnapshot")
        if not table_name:
            return self._empty_optional("inventory_snapshots", "InventorySnapshot")
        condition = Attr("tenantId").eq(self._settings.tenant_id)
        condition = self._add_date_range(condition, "snapshotDate", start_date, end_date)
        return self._scan(
            table_name,
            condition,
            dataset="inventory_snapshots",
            resolution_key="InventorySnapshot",
        )

    def list_inventory_items(
        self,
        snapshot_id: str | None = None,
        product_id: str | None = None,
    ) -> ReadResult:
        table_name = self._resolve_table(self._settings.inventory_item_table_name, "InventoryItem")
        if not table_name:
            return self._empty_optional("inventory_items", "InventoryItem")
        condition = Attr("tenantId").eq(self._settings.tenant_id)
        if snapshot_id:
            condition &= Attr("inventorySnapshotId").eq(snapshot_id)
        if product_id:
            condition &= Attr("productId").eq(product_id)
        return self._scan(
            table_name,
            condition,
            dataset="inventory_items",
            resolution_key="InventoryItem",
        )

    def list_purchases(
        self,
        start_date: str | None = None,
        end_date: str | None = None,
        supplier_id: str | None = None,
    ) -> ReadResult:
        table_name = self._resolve_table(self._settings.purchase_table_name, "Purchase")
        if not table_name:
            return self._empty_optional("purchases", "Purchase")
        condition = Attr("tenantId").eq(self._settings.tenant_id)
        if start_date and end_date:
            condition &= Attr("purchaseDate").between(start_date, end_date)
        elif start_date:
            condition &= Attr("purchaseDate").gte(start_date)
        elif end_date:
            condition &= Attr("purchaseDate").lte(end_date)
        if supplier_id:
            condition &= Attr("supplierId").eq(supplier_id)
        return self._scan(
            table_name,
            condition,
            dataset="purchases",
            resolution_key="Purchase",
        )

    def list_purchase_line_items(
        self,
        purchase_id: str | None = None,
        product_id: str | None = None,
    ) -> ReadResult:
        table_name = self._resolve_table(self._settings.purchase_line_item_table_name, "PurchaseLineItem")
        if not table_name:
            return self._empty_optional("purchase_line_items", "PurchaseLineItem")
        condition = Attr("tenantId").eq(self._settings.tenant_id)
        if purchase_id:
            condition &= Attr("purchaseId").eq(purchase_id)
        if product_id:
            condition &= Attr("productId").eq(product_id)
        return self._scan(
            table_name,
            condition,
            dataset="purchase_line_items",
            resolution_key="PurchaseLineItem",
        )

    def list_suppliers(self) -> ReadResult:
        table_name = self._resolve_table(self._settings.supplier_profile_table_name, "SupplierProfile")
        if not table_name:
            return self._empty_optional("suppliers", "SupplierProfile")
        condition = Attr("tenantId").eq(self._settings.tenant_id)
        return self._scan(
            table_name,
            condition,
            dataset="suppliers",
            resolution_key="SupplierProfile",
        )

    def list_supplier_product_terms(
        self,
        supplier_id: str | None = None,
        product_id: str | None = None,
    ) -> ReadResult:
        table_name = self._resolve_table(self._settings.supplier_product_terms_table_name, "SupplierProductTerms")
        if not table_name:
            return self._empty_optional("supplier_product_terms", "SupplierProductTerms")
        condition = Attr("tenantId").eq(self._settings.tenant_id)
        if supplier_id:
            condition &= Attr("supplierId").eq(supplier_id)
        if product_id:
            condition &= Attr("productId").eq(product_id)
        return self._scan(
            table_name,
            condition,
            dataset="supplier_product_terms",
            resolution_key="SupplierProductTerms",
        )

    def list_purchase_orders(
        self,
        status: str | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
        supplier_id: str | None = None,
    ) -> ReadResult:
        table_name = self._resolve_table(self._settings.purchase_order_table_name, "PurchaseOrder")
        if not table_name:
            return self._empty_optional("purchase_orders", "PurchaseOrder")
        condition = Attr("tenantId").eq(self._settings.tenant_id)
        if status:
            condition &= Attr("status").eq(status)
        condition = self._add_date_range(condition, "orderDate", start_date, end_date)
        if supplier_id:
            condition &= Attr("supplierId").eq(supplier_id)
        return self._scan(
            table_name,
            condition,
            dataset="purchase_orders",
            resolution_key="PurchaseOrder",
        )

    def list_purchase_order_line_items(
        self,
        purchase_order_id: str | None = None,
        product_id: str | None = None,
    ) -> ReadResult:
        table_name = self._resolve_table(self._settings.purchase_order_line_item_table_name, "PurchaseOrderLineItem")
        if not table_name:
            return self._empty_optional(
                "purchase_order_line_items",
                "PurchaseOrderLineItem",
            )
        condition = Attr("tenantId").eq(self._settings.tenant_id)
        if purchase_order_id:
            condition &= Attr("purchaseOrderId").eq(purchase_order_id)
        if product_id:
            condition &= Attr("productId").eq(product_id)
        return self._scan(
            table_name,
            condition,
            dataset="purchase_order_line_items",
            resolution_key="PurchaseOrderLineItem",
        )

    def list_recurring_expenses(self, is_active: bool = True) -> ReadResult:
        table_name = self._resolve_table(self._settings.recurring_expense_table_name, "RecurringExpense")
        if not table_name:
            return self._empty_optional("recurring_expenses", "RecurringExpense")
        condition = Attr("tenantId").eq(self._settings.tenant_id)
        if is_active:
            condition &= Attr("isActive").eq(True)
        return self._scan(
            table_name,
            condition,
            dataset="recurring_expenses",
            resolution_key="RecurringExpense",
        )

    @staticmethod
    def _add_date_range(
        condition: Any,
        field_name: str,
        start_date: str | None,
        end_date: str | None,
        *,
        timestamp: bool = False,
    ) -> Any:
        if timestamp:
            start_value = f"{start_date}T00:00:00" if start_date else None
            end_value = f"{end_date}T23:59:59.999999Z" if end_date else None
        else:
            start_value = start_date
            end_value = end_date
        if start_value and end_value:
            return condition & Attr(field_name).between(start_value, end_value)
        if start_value:
            return condition & Attr(field_name).gte(start_value)
        if end_value:
            return condition & Attr(field_name).lte(end_value)
        return condition

    def _empty_optional(self, dataset: str, resolution_key: str) -> ReadResult:
        warning = self._table_resolution_warnings.get(resolution_key)
        if warning is None:
            warning = f"The {dataset} dataset is not configured for this environment."
        return ReadResult(warning=warning)

    def _scan(
        self,
        table_name: str | None,
        condition: Any,
        *,
        dataset: str,
        resolution_key: str | None = None,
    ) -> ReadResult:
        if not table_name:
            warning = self._table_resolution_warnings.get(resolution_key)
            if warning is None:
                warning = f"The {dataset} dataset is not configured for this environment."
            return ReadResult(warning=warning)
        paginator = self._client.get_paginator("scan")
        pages = paginator.paginate(
            TableName=table_name,
            FilterExpression=condition,
        )
        return ReadResult([item for page in pages for item in page.get("Items", [])])
