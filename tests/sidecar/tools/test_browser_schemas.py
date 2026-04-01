"""Tests for canonical Windie browser schemas."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from tools.browser.browser_action_contract import BROWSER_CANONICAL_ACTIONS
from tools.browser.schemas import (
    BrowserControlArgs,
    get_browser_schema,
    validate_browser_args,
)


def test_schema_registry_covers_all_canonical_actions():
    for action in BROWSER_CANONICAL_ACTIONS:
        assert get_browser_schema(action) is BrowserControlArgs


def test_removed_alias_is_rejected_with_migration_guidance():
    with pytest.raises(
        ValidationError,
        match="Legacy browser action 'open' has been removed. Use navigate.",
    ):
        BrowserControlArgs(action="open", url="https://example.com")


def test_unknown_extra_field_is_rejected():
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        BrowserControlArgs(action="snapshot", snapshotFormat="legacy")  # type: ignore[arg-type]


def test_click_requires_target():
    with pytest.raises(
        ValidationError,
        match="click requires either 'ref'/'index' or both 'coordinate_x' and 'coordinate_y'",
    ):
        BrowserControlArgs(action="click")


def test_click_allows_coordinates():
    args = BrowserControlArgs(action="click", coordinate_x=120, coordinate_y=240)
    assert args.coordinate_x == 120
    assert args.coordinate_y == 240


def test_evaluate_requires_script_or_code():
    with pytest.raises(
        ValidationError, match="evaluate requires either 'script' or 'code'"
    ):
        BrowserControlArgs(action="evaluate")


def test_write_file_requires_path_and_content():
    args = BrowserControlArgs(
        action="write_file",
        path="notes/example.txt",
        content="hello",
        append=True,
    )
    assert args.path == "notes/example.txt"
    assert args.content == "hello"
    assert args.append is True


def test_validate_browser_args_returns_error_message():
    is_valid, error = validate_browser_args("search", {})
    assert is_valid is False
    assert error is not None
    assert "search requires non-empty 'query'" in error
