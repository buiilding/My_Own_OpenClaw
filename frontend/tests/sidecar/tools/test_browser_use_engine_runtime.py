"""Tests for Browser Use engine runtime defaults."""

from __future__ import annotations

from types import SimpleNamespace
from unittest import mock

import pytest

from tools.browser.browser_use_engine import (
    BrowserActionError,
    BrowserUseEngineRuntime,
    RUNTIME_SOURCE,
)
from windie_shared.browser_contract import BrowserControlArgs

EXPLANATION = "Advance the active user task."


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
