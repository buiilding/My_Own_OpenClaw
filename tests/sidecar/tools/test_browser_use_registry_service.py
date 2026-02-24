"""Regression tests for vendored browser_use registry special-parameter handling."""

from __future__ import annotations

import pytest

from tools.browser.browser_tool import _ensure_vendored_browser_use_on_path


def _registry_cls():
    _ensure_vendored_browser_use_on_path()
    from browser_use.tools.registry.service import Registry

    return Registry


@pytest.mark.asyncio
async def test_execute_action_surfaces_consistent_required_browser_session_error() -> None:
    registry = _registry_cls()()

    @registry.action("requires browser session")
    async def requires_session(browser_session):
        return browser_session

    with pytest.raises(
        RuntimeError,
        match=r"Action requires_session requires browser_session but none provided\.",
    ):
        await registry.execute_action("requires_session", params={})


@pytest.mark.asyncio
async def test_normalized_wrapper_uses_same_missing_special_parameter_error_for_omitted_kwarg() -> None:
    registry = _registry_cls()()

    @registry.action("requires browser session")
    async def requires_session(browser_session):
        return browser_session

    action = registry.registry.actions["requires_session"]
    with pytest.raises(
        ValueError,
        match=r"Action requires_session requires browser_session but none provided\.",
    ):
        await action.function(params=action.param_model())
