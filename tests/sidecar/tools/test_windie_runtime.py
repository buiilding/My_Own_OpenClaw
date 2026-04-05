"""Tests for the Windie-owned browser runtime action registry and defaults."""

from __future__ import annotations

from types import SimpleNamespace
from unittest import mock

import pytest

from tools.browser.browser_action_contract import BROWSER_CANONICAL_ACTIONS
from tools.browser.schemas import BrowserControlArgs
from tools.browser.windie_runtime import (
    BROWSER_RUNTIME_ACTIONS,
    BrowserActionError,
    RUNTIME_SOURCE,
    WindieBrowserRuntime,
)

EXPLANATION = "Advance the active user task."


def test_runtime_supported_actions_match_canonical_contract():
    assert WindieBrowserRuntime.supported_actions() == frozenset(BROWSER_CANONICAL_ACTIONS)
    assert BROWSER_RUNTIME_ACTIONS == frozenset(BROWSER_CANONICAL_ACTIONS)


@pytest.mark.asyncio
async def test_runtime_execute_adds_default_action_and_native_source():
    runtime = WindieBrowserRuntime(controller=SimpleNamespace())
    runtime._handlers["status"] = mock.AsyncMock(return_value={"success": True})

    result = await runtime.execute(BrowserControlArgs.model_validate({"action": "status", "explanation": EXPLANATION}))

    assert result == {
        "success": True,
        "action": "status",
        "native_source": RUNTIME_SOURCE,
    }


@pytest.mark.asyncio
async def test_runtime_execute_rejects_unsupported_action():
    runtime = WindieBrowserRuntime(controller=SimpleNamespace())

    with pytest.raises(BrowserActionError, match="Unsupported browser action"):
        await runtime.execute(SimpleNamespace(action="unsupported"))
