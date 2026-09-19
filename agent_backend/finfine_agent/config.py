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
    tenant_id: str
    document_table_name: str
    transaction_table_name: str
    obligation_table_name: str
    aws_profile: str | None = None

    @classmethod
    def from_environment(cls) -> "Settings":
        """Load settings and report all missing required values together."""
        _load_local_environment()
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


@dataclass(frozen=True)
class AgentSettings:
    """Model and Code Interpreter settings for the local agent loop."""

    model_base_url: str
    model_id: str
    model_api_key: str
    model_max_tokens: int
    model_temperature: float
    code_interpreter_region: str
    code_interpreter_session_timeout_seconds: int

    @classmethod
    def from_environment(cls) -> "AgentSettings":
        _load_local_environment()
        required = {
            "MODEL_BASE_URL": os.getenv("MODEL_BASE_URL"),
            "MODEL_ID": os.getenv("MODEL_ID"),
        }
        missing = [name for name, value in required.items() if not value]
        model_api_key = os.getenv("GROQ_API_KEY") or os.getenv("MODEL_API_KEY")
        if not model_api_key:
            missing.append("GROQ_API_KEY")
        if missing:
            names = ", ".join(sorted(missing))
            raise RuntimeError(f"Missing required environment variables: {names}")

        max_tokens = int(os.getenv("MODEL_MAX_TOKENS", "2048"))
        temperature = float(os.getenv("MODEL_TEMPERATURE", "0"))
        session_timeout = int(
            os.getenv("CODE_INTERPRETER_SESSION_TIMEOUT_SECONDS", "900")
        )
        if not 256 <= max_tokens <= 8192:
            raise ValueError("MODEL_MAX_TOKENS must be between 256 and 8192")
        if not 0 <= temperature <= 2:
            raise ValueError("MODEL_TEMPERATURE must be between 0 and 2")
        if not 60 <= session_timeout <= 28800:
            raise ValueError(
                "CODE_INTERPRETER_SESSION_TIMEOUT_SECONDS must be between 60 and 28800"
            )

        return cls(
            model_base_url=required["MODEL_BASE_URL"] or "",
            model_id=required["MODEL_ID"] or "",
            model_api_key=model_api_key or "",
            model_max_tokens=max_tokens,
            model_temperature=temperature,
            code_interpreter_region=os.getenv(
                "CODE_INTERPRETER_REGION",
                os.getenv("AWS_REGION", "ap-south-1"),
            ),
            code_interpreter_session_timeout_seconds=session_timeout,
        )
