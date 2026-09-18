"""Environment configuration for the local agent tools."""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    """Names and AWS settings required to read FinFine data."""

    aws_region: str
    tenant_id: str
    document_table_name: str
    transaction_table_name: str
    obligation_table_name: str
    aws_profile: str | None = None

    @classmethod
    def from_environment(cls) -> "Settings":
        """Load settings and report all missing required values together."""
        required = {
            "FINFINE_TENANT_ID": os.getenv("FINFINE_TENANT_ID"),
            "DOCUMENT_RECORD_TABLE_NAME": os.getenv("DOCUMENT_RECORD_TABLE_NAME"),
            "TRANSACTION_TABLE_NAME": os.getenv("TRANSACTION_TABLE_NAME"),
            "OBLIGATION_TABLE_NAME": os.getenv("OBLIGATION_TABLE_NAME"),
        }
        missing = [name for name, value in required.items() if not value]
        if missing:
            names = ", ".join(sorted(missing))
            raise RuntimeError(f"Missing required environment variables: {names}")

        return cls(
            aws_region=os.getenv("AWS_REGION", "ap-south-1"),
            tenant_id=required["FINFINE_TENANT_ID"] or "",
            document_table_name=required["DOCUMENT_RECORD_TABLE_NAME"] or "",
            transaction_table_name=required["TRANSACTION_TABLE_NAME"] or "",
            obligation_table_name=required["OBLIGATION_TABLE_NAME"] or "",
            aws_profile=os.getenv("AWS_PROFILE") or None,
        )
