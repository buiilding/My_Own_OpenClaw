"""Browser tool entrypoint for the WindieOS sidecar."""

from __future__ import annotations

import logging
from typing import Any, Dict

from pydantic import ValidationError

from tools.browser.schemas import BrowserControlArgs
from tools.browser.browser_use_engine import BrowserActionError, BrowserUseEngineRuntime
from tools.result import ToolResult

logger = logging.getLogger(__name__)


async def execute_browser(raw_args: Dict[str, Any]) -> ToolResult:
    """Execute a canonical browser action through the Browser Use engine adapter."""

    if not isinstance(raw_args, dict):
        return ToolResult(
            success=False,
            error="Arguments must be an object",
            data={"error_code": "INVALID_ARGUMENT"},
        )

    try:
        args = BrowserControlArgs.model_validate(raw_args)
    except ValidationError as exc:
        return ToolResult(
            success=False,
            error=str(exc),
            data={"error_code": "INVALID_ARGUMENT"},
        )
    except Exception as exc:
        return ToolResult(
            success=False,
            error=str(exc),
            data={"error_code": "INVALID_ARGUMENT"},
        )

    runtime = BrowserUseEngineRuntime()
    try:
        result = await runtime.execute(args)
        return ToolResult.success_result(result)
    except BrowserActionError as exc:
        return ToolResult(
            success=False,
            error=exc.message,
            data={"error_code": exc.code, "action": args.action},
        )
    except Exception as exc:
        logger.exception("Browser action '%s' failed", args.action)
        return ToolResult(
            success=False,
            error=f"Action failed: {str(exc)}",
            data={"error_code": "BROWSER_RUNTIME_ERROR", "action": args.action},
        )
