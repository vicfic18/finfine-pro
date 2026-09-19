import os
import uuid
from decimal import Decimal
import boto3
from dotenv import load_dotenv

load_dotenv('.env')

region = os.getenv('AWS_REGION', 'ap-south-1')
tenant_id = os.getenv('FINFINE_TENANT_ID', 'msme-001')
dynamodb = boto3.resource('dynamodb', region_name=region)

obligation_table_name = os.getenv('OBLIGATION_TABLE_NAME')
transaction_table_name = os.getenv('TRANSACTION_TABLE_NAME')

print(f"Connecting to DynamoDB in {region} for tenant {tenant_id}...")
tbl_obligations = dynamodb.Table(obligation_table_name)
tbl_transactions = dynamodb.Table(transaction_table_name)

# 1. Seed Obligations
obligations_data = [
    # Statutory Lockbox obligations
    {
        "id": "ob-gst-oct26",
        "title": "GST GSTR-3B Monthly Return & Tax",
        "counterpartyName": "Goods & Services Tax Network (GSTN)",
        "statutoryId": "27AABCS1429B1Z5",
        "amount": Decimal("42000"),
        "dueDate": "2026-10-20",
        "type": "PAYABLE",
        "category": "GST_PAYMENT",
        "priorityWeight": Decimal("0.95"),
        "penaltyRatePerDay": Decimal("0.05"), # 18% p.a. interest + late fee
        "isStatutory": True,
        "status": "SCHEDULED",
    },
    {
        "id": "ob-tds-sep26",
        "title": "TDS Section 194C/194J Challan 281",
        "counterpartyName": "Income Tax Department",
        "statutoryId": "AABCS1429B",
        "amount": Decimal("14500"),
        "dueDate": "2026-10-07",
        "type": "PAYABLE",
        "category": "TDS_PAYMENT",
        "priorityWeight": Decimal("0.90"),
        "penaltyRatePerDay": Decimal("0.05"),
        "isStatutory": True,
        "status": "SCHEDULED",
    },
    {
        "id": "ob-pf-sep26",
        "title": "EPFO & ESIC Monthly Contribution",
        "counterpartyName": "Employees' Provident Fund Organisation",
        "statutoryId": "BGBNG0012345",
        "amount": Decimal("18200"),
        "dueDate": "2026-10-15",
        "type": "PAYABLE",
        "category": "GST_PAYMENT",
        "priorityWeight": Decimal("0.85"),
        "penaltyRatePerDay": Decimal("0.03"),
        "isStatutory": True,
        "status": "SCHEDULED",
    },
    # Fixed Operational Overheads
    {
        "id": "ob-rent-oct26",
        "title": "Shop & Godown Monthly Rent",
        "counterpartyName": "Prestige Estates / Landlord K. Raman",
        "statutoryId": "",
        "amount": Decimal("28000"),
        "dueDate": "2026-10-10",
        "type": "PAYABLE",
        "category": "OPERATING_EXPENSE",
        "priorityWeight": Decimal("0.90"),
        "penaltyRatePerDay": Decimal("0.01"),
        "isStatutory": False,
        "status": "SCHEDULED",
    },
    {
        "id": "ob-salaries-oct26",
        "title": "Store Staff & Counter Sales Salaries (5 staff)",
        "counterpartyName": "Store Staff Payroll",
        "statutoryId": "",
        "amount": Decimal("65000"),
        "dueDate": "2026-10-10",
        "type": "PAYABLE",
        "category": "SALARY",
        "priorityWeight": Decimal("0.98"),
        "penaltyRatePerDay": Decimal("0.0"),
        "isStatutory": False,
        "status": "SCHEDULED",
    },
    {
        "id": "ob-loan-emi-oct26",
        "title": "HDFC Business Equipment Loan EMI",
        "counterpartyName": "HDFC Bank MSME Lending",
        "statutoryId": "",
        "amount": Decimal("16400"),
        "dueDate": "2026-10-12",
        "type": "PAYABLE",
        "category": "LOAN_EMI",
        "priorityWeight": Decimal("0.92"),
        "penaltyRatePerDay": Decimal("0.08"),
        "isStatutory": False,
        "status": "SCHEDULED",
    },
    {
        "id": "ob-bescom-oct26",
        "title": "BESCOM Commercial Electricity Bill",
        "counterpartyName": "BESCOM Bengaluru",
        "statutoryId": "",
        "amount": Decimal("8900"),
        "dueDate": "2026-10-18",
        "type": "PAYABLE",
        "category": "UTILITY_BILL",
        "priorityWeight": Decimal("0.70"),
        "penaltyRatePerDay": Decimal("0.02"),
        "isStatutory": False,
        "status": "SCHEDULED",
    },
    # Flexible Trade Payables (Suppliers)
    {
        "id": "ob-sharma-textiles",
        "title": "Sharma Textiles & Fabrics - Autumn Stock Bill #8821",
        "counterpartyName": "Sharma Textiles",
        "statutoryId": "27AABCS9921D1Z2",
        "amount": Decimal("35000"),
        "dueDate": "2026-10-16",
        "type": "PAYABLE",
        "category": "VENDOR_BILL",
        "priorityWeight": Decimal("0.40"), # Flexible!
        "penaltyRatePerDay": Decimal("0.0"),
        "isStatutory": False,
        "status": "SCHEDULED",
    },
    {
        "id": "ob-aggarwal-wholesale",
        "title": "Aggarwal Wholesale - Raw Cotton & Spun Yarn",
        "counterpartyName": "Aggarwal Wholesale",
        "statutoryId": "27AABCS3321A1Z9",
        "amount": Decimal("48000"),
        "dueDate": "2026-10-22",
        "type": "PAYABLE",
        "category": "VENDOR_BILL",
        "priorityWeight": Decimal("0.55"),
        "penaltyRatePerDay": Decimal("0.02"),
        "isStatutory": False,
        "status": "SCHEDULED",
    },
    {
        "id": "ob-national-packaging",
        "title": "National Packaging Corp - Boxes & Tapes",
        "counterpartyName": "National Packaging Corp",
        "statutoryId": "27AABCS5543K1Z1",
        "amount": Decimal("12500"),
        "dueDate": "2026-10-28",
        "type": "PAYABLE",
        "category": "VENDOR_BILL",
        "priorityWeight": Decimal("0.45"),
        "penaltyRatePerDay": Decimal("0.0"),
        "isStatutory": False,
        "status": "SCHEDULED",
    },
    # Expected Receivables (Customer Invoices)
    {
        "id": "ob-apex-retail",
        "title": "Apex Retail Mart - Wholesale Garment Consignment #412",
        "counterpartyName": "Apex Retail Mart",
        "statutoryId": "29AABCA8912E1Z4",
        "amount": Decimal("40000"),
        "dueDate": "2026-10-14",
        "type": "RECEIVABLE",
        "category": "CUSTOMER_INVOICE",
        "priorityWeight": Decimal("0.80"),
        "penaltyRatePerDay": Decimal("0.0"),
        "isStatutory": False,
        "status": "SCHEDULED",
    },
    {
        "id": "ob-city-fashion",
        "title": "City Fashion Hub - Diwali Festive Order Dispatch",
        "counterpartyName": "City Fashion Hub",
        "statutoryId": "29AABCD1122F1Z7",
        "amount": Decimal("55000"),
        "dueDate": "2026-10-19",
        "type": "RECEIVABLE",
        "category": "CUSTOMER_INVOICE",
        "priorityWeight": Decimal("0.65"),
        "penaltyRatePerDay": Decimal("0.0"),
        "isStatutory": False,
        "status": "SCHEDULED",
    },
    {
        "id": "ob-balaji-supermarket",
        "title": "Balaji Supermarket - Billing Counter Apparel",
        "counterpartyName": "Balaji Supermarket",
        "statutoryId": "29AABCB3344G1Z8",
        "amount": Decimal("28000"),
        "dueDate": "2026-10-25",
        "type": "RECEIVABLE",
        "category": "CUSTOMER_INVOICE",
        "priorityWeight": Decimal("0.85"),
        "penaltyRatePerDay": Decimal("0.0"),
        "isStatutory": False,
        "status": "SCHEDULED",
    },
    {
        "id": "ob-royal-traders-overdue",
        "title": "Royal Traders - Pending Monsoon Inventory (Overdue)",
        "counterpartyName": "Royal Traders",
        "statutoryId": "29AABCX7788H1Z1",
        "amount": Decimal("22000"),
        "dueDate": "2026-09-28",
        "type": "RECEIVABLE",
        "category": "CUSTOMER_INVOICE",
        "priorityWeight": Decimal("0.50"),
        "penaltyRatePerDay": Decimal("0.0"),
        "isStatutory": False,
        "status": "OVERDUE",
    }
]

print(f"\nWriting {len(obligations_data)} obligation records to DynamoDB...")
if tbl_obligations:
    with tbl_obligations.batch_writer() as batch:
        for ob in obligations_data:
            item = {
                "__typename": "Obligation",
                "tenantId": tenant_id,
                "createdAt": "2026-10-01T00:00:00.000Z",
                "updatedAt": "2026-10-07T10:00:00.000Z",
                **ob
            }
            batch.put_item(Item=item)
    print(f"Successfully seeded {len(obligations_data)} obligations into {tbl_obligations.name}!")

# Dynamic helper to locate and seed new canonical tables
client = dynamodb.meta.client
tables_list = []
try:
    paginator = client.get_paginator('list_tables')
    for page in paginator.paginate():
        tables_list.extend(page.get('TableNames', []))
except Exception as e:
    print(f"Note: Could not list DynamoDB tables: {e}")

def get_table(prefix: str, env_var: str | None = None):
    explicit = os.getenv(env_var) if env_var else None
    if explicit:
        return dynamodb.Table(explicit)
    match = next((t for t in tables_list if t.lower().startswith(prefix.lower())), None)
    return dynamodb.Table(match) if match else None

# 2. Seed Products
tbl_product = get_table("Product", "PRODUCT_TABLE_NAME")
if tbl_product:
    products_data = [
        {
            "id": "prod-sunflower-oil-1l",
            "name": "Fortune Sunlite Refined Sunflower Oil 1L",
            "sku": "SKU-OIL-001",
            "category": "Edible Oil",
            "unitOfMeasure": "litre",
            "isActive": True,
            "aliases": ["Sunflower Oil 1L", "SF Oil 1L", "Fortune 1L"],
        },
        {
            "id": "prod-basmati-rice-5kg",
            "name": "India Gate Basmati Rice Feast Rozzana 5kg",
            "sku": "SKU-RICE-005",
            "category": "Grains",
            "unitOfMeasure": "pack",
            "isActive": True,
            "aliases": ["Basmati Rice 5kg", "India Gate 5kg"],
        },
        {
            "id": "prod-chakki-atta-10kg",
            "name": "Aashirvaad Superior MP Shudh Chakki Atta 10kg",
            "sku": "SKU-ATTA-010",
            "category": "Flour",
            "unitOfMeasure": "pack",
            "isActive": True,
            "aliases": ["Aashirvaad Atta 10kg", "Chakki Atta 10kg"],
        },
        {
            "id": "prod-toor-dal-1kg",
            "name": "Tata Sampann Unpolished Toor Dal 1kg",
            "sku": "SKU-DAL-001",
            "category": "Pulses",
            "unitOfMeasure": "kg",
            "isActive": True,
            "aliases": ["Toor Dal 1kg", "Tata Toor Dal 1kg"],
        },
    ]
    print(f"\nWriting {len(products_data)} Product records to {tbl_product.name}...")
    with tbl_product.batch_writer() as batch:
        for p in products_data:
            batch.put_item(Item={"__typename": "Product", "tenantId": tenant_id, "createdAt": "2026-10-01T00:00:00.000Z", "updatedAt": "2026-10-07T10:00:00.000Z", **p})
    print(f"Successfully seeded {len(products_data)} Products!")

# 3. Seed Merchant Financial Settings
tbl_settings = get_table("MerchantFinancialSettings", "MERCHANT_SETTINGS_TABLE_NAME")
if tbl_settings:
    settings_item = {
        "id": f"settings-{tenant_id}",
        "tenantId": tenant_id,
        "minimumCashBuffer": Decimal("250000"),
        "bufferRuleType": "ABSOLUTE_INR",
        "defaultForecastHorizonDays": 30,
        "defaultForecastHorizonWeeks": 4,
        "enableConservativeFallbacks": True,
        "__typename": "MerchantFinancialSettings",
        "createdAt": "2026-10-01T00:00:00.000Z",
        "updatedAt": "2026-10-07T10:00:00.000Z",
    }
    print(f"\nWriting MerchantFinancialSettings to {tbl_settings.name}...")
    tbl_settings.put_item(Item=settings_item)
    print("Successfully seeded MerchantFinancialSettings!")

# 4. Seed Cash Position Snapshot
tbl_cash = get_table("CashPositionSnapshot", "CASH_POSITION_TABLE_NAME")
if tbl_cash:
    cash_item = {
        "id": f"cash-snap-2026-10-07-{tenant_id}",
        "tenantId": tenant_id,
        "asOf": "2026-10-07",
        "bankBalance": Decimal("82350.00"),
        "cashOnHand": Decimal("14500.00"),
        "totalLiquidCash": Decimal("96850.00"),
        "sourceDocumentIds": ["test-stmt-1789722402612"],
        "__typename": "CashPositionSnapshot",
        "createdAt": "2026-10-07T09:06:58.619Z",
        "updatedAt": "2026-10-07T09:06:58.619Z",
    }
    print(f"\nWriting CashPositionSnapshot to {tbl_cash.name}...")
    tbl_cash.put_item(Item=cash_item)
    print("Successfully seeded CashPositionSnapshot!")

# 5. Seed Supplier Profiles & Product Terms
tbl_supplier = get_table("SupplierProfile", "SUPPLIER_PROFILE_TABLE_NAME")
if tbl_supplier:
    suppliers_data = [
        {
            "id": "supp-adani-wilmar",
            "supplierName": "Adani Wilmar Ltd (Fortune FMCG)",
            "leadTimeDays": 3,
            "creditPeriodDays": 15,
            "minimumOrderQuantity": Decimal("50"),
            "deliveryCost": Decimal("350.00"),
            "paymentTermsText": "Net 15 Days; 2% cash discount if settled in 3 days",
            "reliabilityScore": Decimal("0.95"),
            "notes": "Primary edible oil supplier. Consistent stock delivery.",
        },
        {
            "id": "supp-metro-wholesale",
            "supplierName": "Metro Cash & Carry India",
            "leadTimeDays": 1,
            "creditPeriodDays": 7,
            "minimumOrderQuantity": Decimal("20"),
            "deliveryCost": Decimal("0.00"),
            "paymentTermsText": "Net 7 Days, UPI or NEFT upon delivery",
            "reliabilityScore": Decimal("0.92"),
            "notes": "Bulk staples & flour. Quick local dispatch.",
        },
    ]
    print(f"\nWriting {len(suppliers_data)} SupplierProfile records to {tbl_supplier.name}...")
    with tbl_supplier.batch_writer() as batch:
        for s in suppliers_data:
            batch.put_item(Item={"__typename": "SupplierProfile", "tenantId": tenant_id, "createdAt": "2026-10-01T00:00:00.000Z", "updatedAt": "2026-10-07T10:00:00.000Z", **s})
    print(f"Successfully seeded {len(suppliers_data)} Suppliers!")

# 6. Seed Recurring Expenses
tbl_recurring = get_table("RecurringExpense", "RECURRING_EXPENSE_TABLE_NAME")
if tbl_recurring:
    recurring_data = [
        {
            "id": "rec-rent",
            "expenseType": "RENT",
            "amount": Decimal("28000"),
            "frequency": "MONTHLY",
            "dueDayOfMonth": 10,
            "startDate": "2026-01-01",
            "isActive": True,
            "notes": "Commercial godown and storefront rent",
        },
        {
            "id": "rec-electricity",
            "expenseType": "ELECTRICITY",
            "amount": Decimal("6200"),
            "frequency": "MONTHLY",
            "dueDayOfMonth": 15,
            "startDate": "2026-01-01",
            "isActive": True,
            "notes": "BESCOM commercial power connection",
        },
        {
            "id": "rec-staff-payroll",
            "expenseType": "PAYROLL",
            "amount": Decimal("65000"),
            "frequency": "MONTHLY",
            "dueDayOfMonth": 10,
            "startDate": "2026-01-01",
            "isActive": True,
            "notes": "5 store staff and counter clerks salaries",
        },
    ]
    print(f"\nWriting {len(recurring_data)} RecurringExpense records to {tbl_recurring.name}...")
    with tbl_recurring.batch_writer() as batch:
        for r in recurring_data:
            batch.put_item(Item={"__typename": "RecurringExpense", "tenantId": tenant_id, "createdAt": "2026-10-01T00:00:00.000Z", "updatedAt": "2026-10-07T10:00:00.000Z", **r})
    print(f"Successfully seeded {len(recurring_data)} Recurring Expenses!")

print("\n--- Canonical Data Seeding Complete ---")
