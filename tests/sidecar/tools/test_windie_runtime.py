"""Tests for the active Browser Use engine action registry and defaults."""

from __future__ import annotations

from types import SimpleNamespace
from unittest import mock

import pytest

from tools.browser.browser_action_contract import BROWSER_CANONICAL_ACTIONS
from tools.browser.browser_use_engine import (
    BROWSER_USE_ENGINE_ACTIONS,
    BrowserActionError,
    BrowserUseEngineRuntime,
    RUNTIME_SOURCE,
)
from tools.browser.schemas import BrowserControlArgs

EXPLANATION = "Advance the active user task."


def test_runtime_supported_actions_match_canonical_contract() -> None:
    assert BrowserUseEngineRuntime.supported_actions() == frozenset(BROWSER_CANONICAL_ACTIONS)
    assert BROWSER_USE_ENGINE_ACTIONS == frozenset(BROWSER_CANONICAL_ACTIONS)


@pytest.mark.asyncio
async def test_runtime_execute_adds_default_action_and_native_source() -> None:
    runtime = BrowserUseEngineRuntime()

    with mock.patch.object(
        runtime,
        "_handle_status",
        new=mock.AsyncMock(return_value={"success": True}),
    ):
        result = await runtime.execute(
            BrowserControlArgs.model_validate(
                {"action": "status", "explanation": EXPLANATION}
            )
        )

    assert result == {
        "success": True,
        "action": "status",
        "native_source": RUNTIME_SOURCE,
    }


@pytest.mark.asyncio
async def test_runtime_execute_rejects_unsupported_action() -> None:
    runtime = BrowserUseEngineRuntime()

    with pytest.raises(BrowserActionError, match="Unsupported browser action"):
        await runtime.execute(SimpleNamespace(action="unsupported"))
