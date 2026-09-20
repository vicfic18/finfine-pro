from types import SimpleNamespace

from finfine_agent.dynamodb import DynamoFinancialStore


class Paginator:
    def __init__(self) -> None:
        self.request = None

    def paginate(self, **request):
        self.request = request
        return [{"Items": [{"id": "item-1", "tenantId": "tenant-a"}]}]


class Client:
    def __init__(self, paginator: Paginator) -> None:
        self.paginator = paginator

    def get_paginator(self, name: str):
        assert name == "scan"
        return self.paginator


def test_store_adds_tenant_and_requested_filters_to_every_scan() -> None:
    paginator = Paginator()
    store = object.__new__(DynamoFinancialStore)
    store._client = Client(paginator)
    store._settings = SimpleNamespace(
        tenant_id="tenant-a",
        product_table_name="Product-table",
    )
    store._table_cache = {}
    store._table_resolution_warnings = {}

    result = store.list_products(is_active_only=True)

    assert result == [{"id": "item-1", "tenantId": "tenant-a"}]
    expression = paginator.request["FilterExpression"].get_expression()
    tenant_condition, active_condition = expression["values"]
    assert tenant_condition.get_expression()["values"][1] == "tenant-a"
    assert active_condition.get_expression()["values"][1] is True
    assert paginator.request["TableName"] == "Product-table"
