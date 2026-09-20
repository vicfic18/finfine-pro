"""Environment configuration for the local agent tools."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


def _load_local_environment() -> None:
    """Load an ignored local file without replacing exported values."""
    load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)


@dataclass(frozen=True)
class Settings:
    """Names and AWS settings required to read FinFine data."""

    aws_region: str
    document_table_name: str
    transaction_table_name: str
    obligation_table_name: str
    merchant_settings_table_name: str | None = None
    cash_position_table_name: str | None = None
    product_table_name: str | None = None
    sale_table_name: str | None = None
    sale_line_item_table_name: str | None = None
    inventory_snapshot_table_name: str | None = None
    inventory_item_table_name: str | None = None
    purchase_table_name: str | None = None
    purchase_line_item_table_name: str | None = None
    supplier_profile_table_name: str | None = None
    supplier_product_terms_table_name: str | None = None
    purchase_order_table_name: str | None = None
    purchase_order_line_item_table_name: str | None = None
    recurring_expense_table_name: str | None = None
    expected_receivable_table_name: str | None = None
    aws_profile: str | None = None

    @classmethod
    def from_environment(cls) -> Settings:
        """Load settings and report all missing required values together."""
        _load_local_environment()
        required = {
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
            document_table_name=required["DOCUMENT_RECORD_TABLE_NAME"] or "",
            transaction_table_name=required["TRANSACTION_TABLE_NAME"] or "",
            obligation_table_name=required["OBLIGATION_TABLE_NAME"] or "",
            merchant_settings_table_name=os.getenv("MERCHANT_SETTINGS_TABLE_NAME"),
            cash_position_table_name=os.getenv("CASH_POSITION_TABLE_NAME"),
            product_table_name=os.getenv("PRODUCT_TABLE_NAME"),
            sale_table_name=os.getenv("SALE_TABLE_NAME"),
            sale_line_item_table_name=os.getenv("SALE_LINE_ITEM_TABLE_NAME"),
            inventory_snapshot_table_name=os.getenv("INVENTORY_SNAPSHOT_TABLE_NAME"),
            inventory_item_table_name=os.getenv("INVENTORY_ITEM_TABLE_NAME"),
            purchase_table_name=os.getenv("PURCHASE_TABLE_NAME"),
            purchase_line_item_table_name=os.getenv("PURCHASE_LINE_ITEM_TABLE_NAME"),
            supplier_profile_table_name=os.getenv("SUPPLIER_PROFILE_TABLE_NAME"),
            supplier_product_terms_table_name=os.getenv("SUPPLIER_PRODUCT_TERMS_TABLE_NAME"),
            purchase_order_table_name=os.getenv("PURCHASE_ORDER_TABLE_NAME"),
            purchase_order_line_item_table_name=os.getenv("PURCHASE_ORDER_LINE_ITEM_TABLE_NAME"),
            recurring_expense_table_name=os.getenv("RECURRING_EXPENSE_TABLE_NAME"),
            expected_receivable_table_name=os.getenv("EXPECTED_RECEIVABLE_TABLE_NAME"),
            aws_profile=os.getenv("AWS_PROFILE") or None,
        )


@dataclass(frozen=True)
class AgentSettings:
    """Model and Lambda executor settings for the local agent loop."""

    model_base_url: str
    model_id: str
    model_api_key: str
    model_max_tokens: int
    model_temperature: float
    code_executor_region: str
    code_executor_function_name: str
    aws_profile: str | None = None

    @classmethod
    def from_environment(cls) -> AgentSettings:
        _load_local_environment()
        required = {
            "CODE_EXECUTOR_FUNCTION_NAME": os.getenv("CODE_EXECUTOR_FUNCTION_NAME"),
        }
        missing = [name for name, value in required.items() if not value]
        model_api_key = (
            os.getenv("OPENROUTER_API_KEY")
            or os.getenv("GROQ_API_KEY")
            or os.getenv("MODEL_API_KEY")
        )
        if not model_api_key:
            missing.append("OPENROUTER_API_KEY")
        if missing:
            names = ", ".join(sorted(missing))
            raise RuntimeError(f"Missing required environment variables: {names}")

        max_tokens = int(os.getenv("MODEL_MAX_TOKENS", "2048"))
        temperature = float(os.getenv("MODEL_TEMPERATURE", "0"))
        if not 256 <= max_tokens <= 8192:
            raise ValueError("MODEL_MAX_TOKENS must be between 256 and 8192")
        if not 0 <= temperature <= 2:
            raise ValueError("MODEL_TEMPERATURE must be between 0 and 2")
        raw_base_url = os.getenv(
            "MODEL_BASE_URL", "https://openrouter.ai/api/v1"
        ).strip()
        normalized_base_url = (
            raw_base_url[:-17] if raw_base_url.endswith("/chat/completions")
            else raw_base_url[:-18] if raw_base_url.endswith("/chat/completions/")
            else raw_base_url
        )
        return cls(
            model_base_url=normalized_base_url,
            model_id=os.getenv("MODEL_ID", "nex-agi/nex-n2.5-pro:free"),
            model_api_key=model_api_key or "",
            model_max_tokens=max_tokens,
            model_temperature=temperature,
            code_executor_region=os.getenv(
                "CODE_EXECUTOR_REGION",
                os.getenv("AWS_REGION", "ap-south-1"),
            ),
            code_executor_function_name=(
                required["CODE_EXECUTOR_FUNCTION_NAME"] or ""
            ),
            aws_profile=os.getenv("AWS_PROFILE") or None,
        )


@dataclass(frozen=True)
class RuntimeSettings:
    """HTTP authentication, session, and invocation settings.

    These values are deliberately separate from ``AgentSettings`` so that a
    model configuration cannot accidentally become a tenant or authorization
    setting.  The tenant remains server-side configuration only.
    """

    cognito_issuer: str
    cognito_client_id: str
    session_bucket: str
    session_prefix: str = "agent-sessions/"
    agent_version: str = "v1"
    session_retention_days: int = 30
    request_timeout_seconds: float = 90.0
    aws_region: str = "ap-south-1"
    session_region: str = "ap-south-1"
    aws_profile: str | None = None

    @classmethod
    def from_environment(cls) -> "RuntimeSettings":
        _load_local_environment()
        region = os.getenv("AWS_REGION", "ap-south-1")
        issuer = os.getenv("COGNITO_ISSUER", "").strip()
        pool_id = os.getenv("COGNITO_USER_POOL_ID", "").strip()
        if not issuer and pool_id:
            pool_region = pool_id.partition("_")[0] or region
            issuer = f"https://cognito-idp.{pool_region}.amazonaws.com/{pool_id}"
        client_id = (
            os.getenv("COGNITO_CLIENT_ID")
            or os.getenv("COGNITO_USER_POOL_CLIENT_ID")
            or ""
        ).strip()
        bucket = (
            os.getenv("AGENT_SESSION_BUCKET_NAME")
            or os.getenv("S3_BUCKET_NAME")
            or ""
        ).strip()
        required = {
            "COGNITO_ISSUER (or COGNITO_USER_POOL_ID)": issuer,
            "COGNITO_CLIENT_ID": client_id,
            "AGENT_SESSION_BUCKET_NAME": bucket,
        }
        missing = [name for name, value in required.items() if not value]
        if missing:
            raise RuntimeError(
                "Missing required environment variables: " + ", ".join(sorted(missing))
            )

        prefix = os.getenv("AGENT_SESSION_PREFIX", "agent-sessions/").strip()
        if not prefix:
            raise ValueError("AGENT_SESSION_PREFIX cannot be empty")
        if not prefix.endswith("/"):
            prefix += "/"
        retention_days = int(os.getenv("AGENT_SESSION_RETENTION_DAYS", "30"))
        timeout = float(os.getenv("AGENT_REQUEST_TIMEOUT_SECONDS", "90"))
        if retention_days < 1:
            raise ValueError("AGENT_SESSION_RETENTION_DAYS must be positive")
        if timeout <= 0:
            raise ValueError("AGENT_REQUEST_TIMEOUT_SECONDS must be positive")
        return cls(
            cognito_issuer=issuer,
            cognito_client_id=client_id,
            session_bucket=bucket,
            session_prefix=prefix,
            agent_version=os.getenv("AGENT_VERSION", "v1").strip() or "v1",
            session_retention_days=retention_days,
            request_timeout_seconds=timeout,
            aws_region=region,
            session_region=os.getenv("AGENT_SESSION_REGION", region).strip() or region,
            aws_profile=os.getenv("AWS_PROFILE") or None,
        )
