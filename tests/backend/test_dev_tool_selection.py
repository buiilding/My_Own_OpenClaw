from __future__ import annotations

import os
from pathlib import Path

import pytest

from backend.src.core.config.models import AppConfig, SecurityLimits
from backend.src.core.infrastructure.exceptions import ParseValidationError
from backend.src.llm.parser_validation import ToolCallValidator
from backend.src.tools.tool_selection import (
    load_tool_selection,
    should_initialize_ocr,
    should_initialize_vision,
)


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


def test_load_tool_selection_mouse_coordinate_methods(tmp_path: Path):
    p = tmp_path / "tool_selection.toml"
    p.write_text(
        (
            'enabled = true\n'
            'mode = "allowlist"\n'
            'tools = ["mouse_control"]\n'
            "[tool_options.mouse_control]\n"
            'enabled_coordinate_methods = ["manual", "ocr"]\n'
        ),
        encoding="utf-8",
    )
    selection = load_tool_selection(p)
    assert selection is not None
    assert selection.get_allowed_mouse_coordinate_methods() == {"manual", "ocr"}
    assert selection.filter_tool_names(["mouse_control", "read_file"]) == ["mouse_control"]


def test_load_tool_selection_mouse_disabled_when_no_methods(tmp_path: Path):
    p = tmp_path / "tool_selection.toml"
    p.write_text(
        (
            'enabled = true\n'
            'mode = "allowlist"\n'
            'tools = ["mouse_control"]\n'
            "[tool_options.mouse_control]\n"
            "enabled_coordinate_methods = []\n"
        ),
        encoding="utf-8",
    )
    selection = load_tool_selection(p)
    assert selection is not None
    assert selection.get_allowed_mouse_coordinate_methods() == set()
    assert selection.filter_tool_names(["mouse_control", "read_file"]) == []


def test_initialize_helpers_follow_mouse_methods(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    p = tmp_path / "tool_selection.toml"
    p.write_text(
        (
            'enabled = true\n'
            'mode = "allowlist"\n'
            'tools = ["mouse_control"]\n'
            "[tool_options.mouse_control]\n"
            'enabled_coordinate_methods = ["manual"]\n'
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("WINDIEOS_DEV_TOOL_SELECTION_PATH", str(p))

    assert should_initialize_ocr() is False
    assert should_initialize_vision() is False


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


def test_load_tool_selection_refreshes_cache_when_file_rewritten_with_same_mtime(tmp_path: Path):
    p = tmp_path / "tool_selection.toml"
    fixed_mtime = 1_700_000_000

    p.write_text(
        'enabled = true\nmode = "allowlist"\ntools = ["read_file"]\n',
        encoding="utf-8",
    )
    os.utime(p, (fixed_mtime, fixed_mtime))
    first = load_tool_selection(p)
    assert first is not None
    assert first.tools == {"read_file"}

    # Rewrite to same byte length and pin mtime back to the same value.
    p.write_text(
        'enabled = true\nmode = "allowlist"\ntools = ["edit_file"]\n',
        encoding="utf-8",
    )
    os.utime(p, (fixed_mtime, fixed_mtime))
    second = load_tool_selection(p)
    assert second is not None
    assert second.tools == {"edit_file"}
