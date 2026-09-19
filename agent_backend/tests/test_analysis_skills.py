from pathlib import Path

import pytest

from finfine_agent.tools.analysis_skills import create_analysis_skill_tool


def test_load_analysis_skill_returns_requested_guide(tmp_path: Path) -> None:
    skill_file = tmp_path / "analytics-orchestrator" / "SKILL.md"
    skill_file.parent.mkdir()
    skill_file.write_text("# Analytics Orchestrator\n", encoding="utf-8")
    tool = create_analysis_skill_tool(tmp_path)

    result = tool(skill_name="analytics-orchestrator")

    assert result == {
        "skillName": "analytics-orchestrator",
        "instructions": "# Analytics Orchestrator\n",
    }


def test_load_analysis_skill_rejects_unknown_name(tmp_path: Path) -> None:
    tool = create_analysis_skill_tool(tmp_path)

    with pytest.raises(ValueError, match="Unknown analysis skill"):
        tool(skill_name="../../secret")
