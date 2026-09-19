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

print(f"Successfully seeded {len(obligations_data)} obligations into {obligation_table_name}!")

# Verify
resp = tbl_obligations.scan()
print(f"Current total obligations in table: {len(resp.get('Items', []))}")
