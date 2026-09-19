"""On-demand access to the FinFine analytics skill guides."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from strands import tool

SKILL_NAMES = (
    "analytics-data-contract",
    "analytics-orchestrator",
    "cashflow-and-buffer",
    "code-interpreter-execution",
    "financial-explanation",
    "inventory-and-stockout",
    "margin-and-pricing",
    "merchant-intake",
    "opportunity-detector",
    "sales-demand-forecasting",
    "scenario-what-if-analysis",
    "supplier-and-payables-optimization",
    "validation-and-uncertainty",
)


def _default_skills_directory() -> Path:
    env_path = os.getenv("FINFINE_SKILLS_DIRECTORY")
    if env_path:
        return Path(env_path)
    candidates = [
        Path("/var/task/skills"),
        Path(__file__).resolve().parents[2] / "skills",
        Path(__file__).resolve().parents[3] / "skills",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[-1]


def create_analysis_skill_tool(skills_directory: Path | None = None) -> Any:
    """Create a tool that returns one reviewed analysis guide by name."""
    directory = skills_directory or _default_skills_directory()

    @tool(name="load_analysis_skill")
    def load_analysis_skill(skill_name: str) -> dict[str, str]:
        """Optionally load one guide for detailed financial analysis.

        Use this only when its guidance would help with forecasting, cash-flow
        planning, margin, inventory, supplier, scenario, or another detailed
        analysis. Do not load a guide for a simple balance, transaction, or
        obligation lookup. Load only relevant guides, not the entire catalog.

        Available guides: analytics-data-contract, analytics-orchestrator,
        cashflow-and-buffer, code-interpreter-execution,
        financial-explanation, inventory-and-stockout, margin-and-pricing,
        merchant-intake, opportunity-detector, sales-demand-forecasting,
        scenario-what-if-analysis, supplier-and-payables-optimization, and
        validation-and-uncertainty.

        Args:
            skill_name: Exact name of the guide to load.
        """
        if skill_name not in SKILL_NAMES:
            raise ValueError(
                f"Unknown analysis skill: {skill_name}. "
                f"Choose one of: {', '.join(SKILL_NAMES)}"
            )

        path = directory / skill_name / "SKILL.md"
        try:
            instructions = path.read_text(encoding="utf-8")
        except FileNotFoundError as exc:
            raise RuntimeError(f"Analysis skill file is missing: {path}") from exc

        return {"skillName": skill_name, "instructions": instructions}

    return load_analysis_skill
