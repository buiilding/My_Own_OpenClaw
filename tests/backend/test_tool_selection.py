"""Covers structural tool selection behavior in the backend test suite."""

from __future__ import annotations

from backend.src.tools.tool_selection import ToolSelection


def _selection(
    tools: list[str],
    *,
    methods: list[str] | None = None,
    mode: str = "allowlist",
) -> ToolSelection:
    return ToolSelection(
        enabled=True,
        mode=mode,
        tools=frozenset(tools),
        mouse_enabled_coordinate_methods=(
            frozenset(methods) if methods is not None else None
        ),
    )


def test_disabled_selection_keeps_tool_names():
    selection = ToolSelection(enabled=False, mode="denylist", tools=frozenset())

    assert selection.filter_tool_names(["read_file", "replace"]) == [
        "read_file",
        "replace",
    ]


def test_allowlist_filters_tool_names():
    selection = _selection(["read_file"])

    assert selection.filter_tool_names(["read_file", "replace"]) == ["read_file"]


def test_denylist_filters_tool_names():
    selection = _selection(["replace"], mode="denylist")

    assert selection.filter_tool_names(["read_file", "replace"]) == ["read_file"]


def test_mouse_coordinate_methods_filter_tool_names():
    selection = _selection(["mouse_control"], methods=["manual", "ocr"])

    assert selection.get_allowed_mouse_coordinate_methods() == frozenset(
        {"manual", "ocr"}
    )
    assert selection.filter_tool_names(["mouse_control", "read_file"]) == [
        "mouse_control"
    ]


def test_mouse_disabled_when_no_methods():
    selection = _selection(["mouse_control"], methods=[])

    assert selection.get_allowed_mouse_coordinate_methods() == frozenset()
    assert selection.filter_tool_names(["mouse_control", "read_file"]) == []
