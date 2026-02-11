from __future__ import annotations

from pathlib import Path

import pytest

from backend.src.core.config.models import AppConfig, SecurityLimits
from backend.src.core.infrastructure.exceptions import ParseValidationError
from backend.src.llm.parser_validation import ToolCallValidator
from backend.src.tools.tool_selection import load_tool_selection


class DummyMetrics:
    def __init__(self):
        self.calls = []

    def record_validation_violation(self, **kwargs):
        self.calls.append(kwargs)


class DummyRegistry:
    def __init__(self, tool_names):
        self._tool_names = tool_names

    def get_tool_names(self):
        return self._tool_names

    def get_tool(self, _name):
        return None


def test_load_tool_selection_returns_none_when_disabled(tmp_path: Path):
    p = tmp_path / "tool_selection.toml"
    p.write_text('enabled = false\nmode = "denylist"\ntools = ["read_file"]\n', encoding="utf-8")
    assert load_tool_selection(p) is None


def test_load_tool_selection_allowlist_filters(tmp_path: Path):
    p = tmp_path / "tool_selection.toml"
    p.write_text('enabled = true\nmode = "allowlist"\ntools = ["read_file"]\n', encoding="utf-8")
    selection = load_tool_selection(p)
    assert selection is not None
    assert selection.filter_tool_names(["read_file", "write_file"]) == ["read_file"]


def test_tool_call_validator_applies_dev_denylist(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    p = tmp_path / "tool_selection.toml"
    p.write_text('enabled = true\nmode = "denylist"\ntools = ["write_file"]\n', encoding="utf-8")
    monkeypatch.setenv("WINDIEOS_DEV_TOOL_SELECTION_PATH", str(p))

    config = AppConfig(interaction_mode="agent", security_limits=SecurityLimits())
    metrics = DummyMetrics()
    validator = ToolCallValidator(
        config=config,
        tool_registry=DummyRegistry(["read_file", "write_file"]),
        metrics=metrics,
        limits=config.security_limits,
    )

    validator.validate_tool_call("read_file", {})
    with pytest.raises(ParseValidationError, match="not in whitelist"):
        validator.validate_tool_call("write_file", {})

