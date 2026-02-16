"""Phase 2 browser adapter routing through the current browser controller seam.

This module defines the Browser Use adapter boundary and a compatibility
implementation that preserves existing browser_control payload contracts while
we migrate internals incrementally.
"""

from __future__ import annotations

import asyncio
from typing import Any, Mapping, Protocol

from tools.browser_use_adapter.types import AdapterActionResult


class BrowserControllerLike(Protocol):
    is_connected: bool

    async def close(self) -> None: ...
    async def auto_connect_to_chrome(self, *, cdp_url: str, auto_launch: bool) -> dict[str, Any]: ...
    async def launch_managed_browser(
        self,
        *,
        headless: bool,
        executable_path: str | None,
    ) -> dict[str, Any]: ...
    async def get_status(self) -> dict[str, Any]: ...
    async def switch_tab(self, target_id: str) -> bool: ...
    async def navigate(self, url: str, wait_until: str) -> dict[str, Any]: ...
    async def open_tab(self, *, url: str) -> dict[str, Any]: ...
    async def press_key(self, key: str) -> dict[str, Any]: ...
    async def scroll(self, direction: str, amount: int) -> dict[str, Any]: ...
    async def wait_for_load(self, state: str) -> dict[str, Any]: ...
    async def get_tabs(self) -> list[Any]: ...
    async def evaluate(self, script: str) -> dict[str, Any]: ...


class BrowserUseCompatibilityAdapter:
    """Compatibility adapter for Phase 2 routing.

    This adapter intentionally keeps existing payload contracts stable while
    moving browser action execution behind an adapter seam.
    """

    def __init__(self, controller: BrowserControllerLike):
        self._controller = controller

    async def execute(
        self,
        action: str,
        args: Mapping[str, Any],
    ) -> AdapterActionResult:
        if action == "connect":
            return await self.connect(args)
        if action == "status":
            return await self.status()
        if action == "navigate":
            return await self.navigate(args)
        if action == "open":
            return await self.open(args)
        if action == "press":
            return await self.press(args)
        if action == "scroll":
            return await self.scroll(args)
        if action == "wait":
            return await self.wait(args)
        if action == "get_tabs":
            return await self.get_tabs()
        if action == "switch_tab":
            return await self.switch_tab(args)
        if action == "evaluate":
            return await self.evaluate(args)
        if action == "close":
            return await self.close()

        return AdapterActionResult(
            success=False,
            action=action,
            decision="compat",
            error=f"Unhandled action: {action}",
            error_code="ACTION_UNSUPPORTED",
        )

    async def connect(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if self._controller.is_connected:
            await self._controller.close()

        mode = self._value_as_str(args.get("mode")) or "user_chrome"
        try:
            if mode == "user_chrome":
                result = await self._controller.auto_connect_to_chrome(
                    cdp_url=self._value_as_str(args.get("cdp_url"))
                    or "http://127.0.0.1:9222",
                    auto_launch=True,
                )
                if result.get("auto_launched"):
                    message = (
                        f"Browser {result['status']} in {result['mode']} mode "
                        "(Chrome was auto-launched)"
                    )
                else:
                    message = (
                        f"Browser {result['status']} in {result['mode']} mode "
                        "(connected to existing Chrome)"
                    )
            elif mode == "managed":
                result = await self._controller.launch_managed_browser(
                    headless=bool(args.get("headless", False)),
                    executable_path=self._value_as_str(args.get("executable_path")),
                )
                message = f"Browser {result['status']} in {result['mode']} mode"
            else:
                return AdapterActionResult(
                    success=False,
                    action="connect",
                    decision="compat",
                    error=f"Unknown browser mode: {mode}",
                    error_code="INVALID_ARGUMENT",
                )
        except ConnectionError as exc:
            return AdapterActionResult(
                success=False,
                action="connect",
                decision="compat",
                error=f"Failed to connect to Chrome. {str(exc)}",
                error_code="BROWSER_RUNTIME_ERROR",
            )
        except RuntimeError as exc:
            return AdapterActionResult(
                success=False,
                action="connect",
                decision="compat",
                error=str(exc),
                error_code="BROWSER_RUNTIME_ERROR",
            )

        return AdapterActionResult(
            success=True,
            action="connect",
            decision="compat",
            data={
                "status": result["status"],
                "mode": result["mode"],
                "url": result["url"],
                "title": result.get("title", ""),
                "auto_launched": result.get("auto_launched", False),
                "message": message,
            },
        )

    async def status(self) -> AdapterActionResult:
        status = await self._controller.get_status()
        return AdapterActionResult(
            success=True,
            action="status",
            decision="compat",
            data={
                "action": "status",
                "connected": status["connected"],
                "mode": status.get("mode"),
                "url": status.get("url", ""),
                "title": status.get("title", ""),
                "tab_count": status.get("tab_count", 0),
                "target_id": status.get("target_id"),
            },
        )

    async def navigate(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("navigate")

        focus_error = await self._focus_target_if_requested(args)
        if focus_error:
            return focus_error

        url = self._extract_url(args)
        if not url:
            return self._invalid_argument("navigate", "Missing required 'url' parameter")

        result = await self._controller.navigate(
            url,
            self._value_as_str(args.get("wait_until")) or "load",
        )
        if not result.get("success"):
            return AdapterActionResult(
                success=False,
                action="navigate",
                decision="port",
                error=result.get("error", "Navigation failed"),
                error_code="BROWSER_RUNTIME_ERROR",
            )

        return AdapterActionResult(
            success=True,
            action="navigate",
            decision="port",
            data={
                "action": "navigate",
                "url": result["url"],
                "title": result["title"],
                "status": result.get("status"),
            },
        )

    async def open(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("open")

        url = self._extract_url(args) or "about:blank"
        result = await self._controller.open_tab(url=url)
        if not result.get("success"):
            return AdapterActionResult(
                success=False,
                action="open",
                decision="port",
                error=result.get("error", "Open failed"),
                error_code="BROWSER_RUNTIME_ERROR",
            )

        return AdapterActionResult(
            success=True,
            action="open",
            decision="port",
            data={
                "action": "open",
                "target_id": result["target_id"],
                "url": result["url"],
                "title": result["title"],
                "status": result.get("status"),
            },
        )

    async def press(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("press")

        key = self._value_as_str(args.get("key"))
        if not key:
            return self._invalid_argument("press", "Missing required 'key' parameter")

        result = await self._controller.press_key(key)
        if not result.get("success"):
            return AdapterActionResult(
                success=False,
                action="press",
                decision="port",
                error=result.get("error", "Key press failed"),
                error_code="BROWSER_RUNTIME_ERROR",
            )

        return AdapterActionResult(
            success=True,
            action="press",
            decision="port",
            data={
                "action": "press",
                "key": key,
            },
        )

    async def scroll(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("scroll")

        direction = self._value_as_str(args.get("direction")) or "down"
        amount_raw = args.get("amount")
        amount = amount_raw if isinstance(amount_raw, int) else 500
        result = await self._controller.scroll(direction, amount)
        if not result.get("success"):
            return AdapterActionResult(
                success=False,
                action="scroll",
                decision="port",
                error=result.get("error", "Scroll failed"),
                error_code="BROWSER_RUNTIME_ERROR",
            )

        return AdapterActionResult(
            success=True,
            action="scroll",
            decision="port",
            data={
                "action": "scroll",
                "direction": direction,
                "amount": amount,
            },
        )

    async def wait(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("wait")

        seconds = args.get("seconds")
        if isinstance(seconds, (int, float)):
            await asyncio.sleep(float(seconds))
            return AdapterActionResult(
                success=True,
                action="wait",
                decision="compat",
                data={
                    "action": "wait",
                    "type": "time",
                    "seconds": float(seconds),
                },
            )

        state = self._value_as_str(args.get("state")) or "networkidle"
        result = await self._controller.wait_for_load(state)
        if not result.get("success"):
            return AdapterActionResult(
                success=False,
                action="wait",
                decision="compat",
                error=result.get("error", "Wait failed"),
                error_code="BROWSER_RUNTIME_ERROR",
            )
        return AdapterActionResult(
            success=True,
            action="wait",
            decision="compat",
            data={
                "action": "wait",
                "type": "load_state",
                "state": state,
            },
        )

    async def get_tabs(self) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("get_tabs")

        tabs = await self._controller.get_tabs()
        return AdapterActionResult(
            success=True,
            action="get_tabs",
            decision="port",
            data={
                "action": "get_tabs",
                "tab_count": len(tabs),
                "tabs": [
                    {
                        "target_id": tab.target_id,
                        "title": tab.title,
                        "url": tab.url,
                    }
                    for tab in tabs
                ],
            },
        )

    async def switch_tab(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("switch_tab")

        target_id = self._extract_target_id(args)
        if not target_id:
            return self._invalid_argument(
                "switch_tab",
                "Missing required 'target_id' parameter",
            )

        switched = await self._controller.switch_tab(target_id)
        if not switched:
            return AdapterActionResult(
                success=False,
                action="switch_tab",
                decision="port",
                error=f"Tab not found: {target_id}",
                error_code="TAB_NOT_FOUND",
            )

        status = await self._controller.get_status()
        return AdapterActionResult(
            success=True,
            action="switch_tab",
            decision="port",
            data={
                "action": "switch_tab",
                "target_id": target_id,
                "url": status.get("url", "") if isinstance(status, dict) else "",
                "title": status.get("title", "") if isinstance(status, dict) else "",
            },
        )

    async def evaluate(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._controller.is_connected:
            return self._not_connected("evaluate")

        focus_error = await self._focus_target_if_requested(args)
        if focus_error:
            return focus_error

        script = self._value_as_str(args.get("script"))
        if not script:
            return self._invalid_argument(
                "evaluate",
                "Missing required 'script' parameter",
            )

        result = await self._controller.evaluate(script)
        if not result.get("success"):
            return AdapterActionResult(
                success=False,
                action="evaluate",
                decision="port",
                error=result.get("error", "Evaluate failed"),
                error_code="BROWSER_RUNTIME_ERROR",
            )

        return AdapterActionResult(
            success=True,
            action="evaluate",
            decision="port",
            data={
                "action": "evaluate",
                "script": script,
                "result": result.get("result"),
            },
        )

    async def close(self) -> AdapterActionResult:
        await self._controller.close()
        return AdapterActionResult(
            success=True,
            action="close",
            decision="port",
            data={
                "action": "close",
                "status": "closed",
            },
        )

    async def _focus_target_if_requested(
        self,
        args: Mapping[str, Any],
    ) -> AdapterActionResult | None:
        target_id = self._extract_target_id(args)
        if not target_id:
            return None
        switched = await self._controller.switch_tab(target_id)
        if switched:
            return None
        return AdapterActionResult(
            success=False,
            action="switch_tab",
            decision="port",
            error=f"Tab not found: {target_id}",
            error_code="TAB_NOT_FOUND",
        )

    @staticmethod
    def _extract_url(args: Mapping[str, Any]) -> str | None:
        for key in ("url", "target_url", "targetUrl"):
            value = args.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    @staticmethod
    def _extract_target_id(args: Mapping[str, Any]) -> str | None:
        for key in ("target_id", "targetId"):
            value = args.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    @staticmethod
    def _value_as_str(value: Any) -> str | None:
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return None

    @staticmethod
    def _invalid_argument(action: str, message: str) -> AdapterActionResult:
        return AdapterActionResult(
            success=False,
            action=action,
            decision="compat",
            error=message,
            error_code="INVALID_ARGUMENT",
        )

    @staticmethod
    def _not_connected(action: str) -> AdapterActionResult:
        return AdapterActionResult(
            success=False,
            action=action,
            decision="compat",
            error="Browser not connected. Run 'connect' action first.",
            error_code="BROWSER_NOT_CONNECTED",
        )


def get_browser_use_adapter(controller: BrowserControllerLike) -> BrowserUseCompatibilityAdapter:
    """Factory seam for adapter injection in tests."""
    return BrowserUseCompatibilityAdapter(controller)

