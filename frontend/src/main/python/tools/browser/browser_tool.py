"""Browser tool entrypoint for WindieOS sidecar orchestration."""

from __future__ import annotations

from importlib import import_module
from importlib.util import find_spec
import logging
import os
from typing import Any, Dict

from tools.browser.browser_action_contract import BROWSER_ALL_ACTIONS
from tools.browser.browser_action_contract import REMOVED_BROWSER_ACTION_ALIASES
from tools.browser import browser_adapter as _adapter
from tools.browser import browser_runtime as _runtime
from tools.browser.controller import get_browser_controller
from tools.result import ToolResult

AdapterActionResult = _adapter.AdapterActionResult
BrowserRuntimeAdapter = _adapter.BrowserRuntimeAdapter
BrowserUseCompatibilityAdapter = _adapter.BrowserUseCompatibilityAdapter
ControllerBackedRuntimeProvider = _runtime.ControllerBackedRuntimeProvider
BrowserUseNativeRuntimeProvider = _runtime.BrowserUseNativeRuntimeProvider

logger = logging.getLogger(__name__)

BROWSER_ROUTED_ACTIONS = BROWSER_ALL_ACTIONS


def _log_legacy_action_warning(
    action: str,
    preferred: str | None,
    *,
    blocked: bool,
    gate: str | None = None,
) -> None:
    extra = {
        "legacy_action": action,
        "preferred_action": preferred,
        "legacy_action_blocked": blocked,
        "legacy_action_gate": gate,
    }
    if blocked and gate:
        if preferred:
            logger.warning(
                "Legacy browser action '%s' blocked by %s; prefer canonical action '%s'",
                action,
                gate,
                preferred,
                extra=extra,
            )
        else:
            logger.warning(
                "Legacy browser action '%s' blocked by %s",
                action,
                gate,
                extra=extra,
            )
        return
    logger.warning(
        "Legacy browser action '%s' invoked; prefer canonical action '%s'",
        action,
        preferred or "canonical action",
        extra=extra,
    )


def _ensure_vendored_browser_use_on_path():
    return _runtime._ensure_vendored_browser_use_on_path()


def create_browser_use_native_runtime_provider(controller):
    return _runtime.create_browser_use_native_runtime_provider(
        controller,
        find_spec_fn=find_spec,
        import_module_fn=import_module,
    )


def get_native_runtime_handlers(controller=None):
    return _runtime.get_native_runtime_handlers(
        controller=controller,
        import_module_fn=import_module,
    )


def get_browser_runtime_provider(controller):
    vendored_browser_use = _runtime._ensure_vendored_browser_use_on_path()
    _runtime._assert_vendored_browser_use_resolves(vendored_browser_use)

    raw_requested = os.getenv(_runtime.ENV_RUNTIME)
    if raw_requested is None:
        requested = "browser_use_native"
    else:
        requested = raw_requested.strip().lower()

    if requested not in _runtime._BROWSER_USE_RUNTIME_ALIASES:
        raise RuntimeError(
            f"Unknown browser runtime '{requested}'. "
            "Supported values: browser_use, browser_use_native."
        )

    if find_spec("browser_use") is None:
        raise RuntimeError("Vendored Browser Use runtime is unavailable.")

    try:
        native_provider = create_browser_use_native_runtime_provider(controller)
        if native_provider is None:
            raise RuntimeError("Browser Use native runtime provider is unavailable.")
        return native_provider
    except RuntimeError:
        raise
    except Exception as exc:
        raise RuntimeError(
            f"Requested browser runtime '{requested}' is unavailable "
            f"(native provider load failed: {exc})."
        ) from exc


def get_browser_adapter(
    controller,
    runtime_provider=None,
):
    return _adapter.get_browser_adapter(
        controller,
        runtime_provider=runtime_provider,
        runtime_provider_factory=get_browser_runtime_provider,
    )


def get_browser_use_adapter(
    controller,
    runtime_provider=None,
):
    return get_browser_adapter(controller, runtime_provider=runtime_provider)


def _adapter_result_to_tool_result(result: AdapterActionResult) -> ToolResult:
    if result.success:
        payload = dict(result.data)
        if result.warnings:
            payload["warnings"] = list(result.warnings)
        if result.deprecation:
            payload["deprecation"] = result.deprecation
        return ToolResult.success_result(payload)

    if result.error:
        return ToolResult.error_result(result.error)

    if result.deprecation:
        return ToolResult.error_result(result.deprecation)

    return ToolResult.error_result("Action failed")


async def _run_browser_action(args: Dict[str, Any]) -> ToolResult:
    action = args.get("action")
    if not isinstance(action, str) or not action:
        return ToolResult.error_result("Missing required 'action' parameter")

    if action not in BROWSER_ROUTED_ACTIONS:
        return ToolResult.error_result(f"Unhandled action: {action}")

    if action in REMOVED_BROWSER_ACTION_ALIASES:
        preferred = REMOVED_BROWSER_ACTION_ALIASES[action]
        _log_legacy_action_warning(
            action,
            preferred=preferred,
            blocked=True,
            gate="legacy_alias_removed",
        )
        return ToolResult.error_result(
            f"Legacy browser action '{action}' has been removed. "
            f"Use {preferred}."
        )

    controller = get_browser_controller()
    adapter = get_browser_adapter(controller)
    adapter_result = await adapter.execute(action, args)
    return _adapter_result_to_tool_result(adapter_result)


async def execute_browser(raw_args: Dict[str, Any]) -> ToolResult:
    """Execute browser actions through Browser Use-native adapter/runtime."""

    if not isinstance(raw_args, dict):
        return ToolResult.error_result("Arguments must be an object")

    action = raw_args.get("action")
    if not action:
        return ToolResult.error_result("Missing required 'action' parameter")

    try:
        if action not in BROWSER_ROUTED_ACTIONS:
            return ToolResult.error_result(f"Unhandled action: {action}")
        return await _run_browser_action(raw_args)
    except Exception as exc:
        logger.exception("Browser action '%s' failed", action)
        return ToolResult.error_result(f"Action failed: {str(exc)}")
