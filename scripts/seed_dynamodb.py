#!/usr/bin/env python3
"""
FinFine Pro - Data Ingestion Architecture Notice

DIRECT DATABASE SEEDING IS STRICTLY PROHIBITED.
All financial metrics, transactions, obligations, and party nodes MUST originate
strictly from real PDF documents processed through the canonical serverless pipeline:
  [PDF File] -> [Amazon S3] -> [Document Extractor (unpdf / LLM)] -> [Ingestion Normalizer] -> [DynamoDB]

This architectural rule ensures that:
1. No synthetic or mock records pollute the financial ledgers.
2. Customer-side testing behaves identically to live production.
3. Every figure on the dashboard traces back to an extracted document proof.

To run customer-side testing:
1. Visit http://localhost:3000/dashboard/ingestion
2. Download any of the 14 realistic MSME sample PDFs from the download center.
3. Upload them via the dropzone or click "Ingest Complete MSME Suite (14 PDFs)".
4. Or trigger via API:
   curl -X POST http://localhost:3000/api/ingestion/upload \
        -H "Content-Type: application/json" \
        -d '{"useSample": true, "sampleType": "COMPLETE"}'
"""

import sys

def main():
    print("=" * 70)
    print("FinFine Pro: DIRECT DATABASE SEEDING IS STRICTLY DISABLED")
    print("=" * 70)
    print("\nArchitectural Constraint:")
    print("  Ingestion sample data must originate ONLY from real PDF documents.")
    print("  Direct database writes (bypassing document extraction) are forbidden.")
    print("\nHow to test:")
    print("  1. Open http://localhost:3000/dashboard/ingestion")
    print("  2. Download sample PDFs to test local drag-and-drop file upload.")
    print("  3. Or click 'Ingest Complete MSME Suite (14 PDFs)' to run the full")
    print("     S3 -> Document Extractor -> Ingestion Normalizer pipeline.")
    print("=" * 70)
    sys.exit(0)

if __name__ == "__main__":
    main()
