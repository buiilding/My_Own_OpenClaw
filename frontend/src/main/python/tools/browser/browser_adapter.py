"""Browser Use compatibility adapter for WindieOS browser tool."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable
from typing import Any, Literal
from typing import Mapping
from weakref import WeakKeyDictionary

from tools.browser.chrome_launcher import DEFAULT_WINDIE_CDP_URL
from tools.browser.browser_runtime import ControllerRuntimeLike
from tools.browser.browser_runtime import BrowserRuntimeProvider
from tools.browser.browser_runtime import get_browser_runtime_provider

MigrationDecision = Literal["port", "compat", "deprecate"]


@dataclass(slots=True)
class AdapterActionResult:
    """Normalized adapter action result consumed by browser_tool."""

    success: bool
    action: str
    decision: MigrationDecision
    data: dict[str, Any] = field(default_factory=dict)
    error: str | None = None
    error_code: str | None = None
    warnings: list[str] = field(default_factory=list)
    deprecation: str | None = None

MAX_SNAPSHOT_CAPTURE_CHARS = 120_000
BROWSER_USE_DIRECT_ACTIONS = frozenset(
    {
        "done",
        "search",
        "go_back",
        "search_page",
        "find_elements",
        "find_text",
        "input",
        "send_keys",
        "switch",
        "close_tab",
        "dropdown_options",
        "select_dropdown",
        "upload_file",
        "write_file",
        "replace_file",
        "read_file",
        "read_long_content",
    }
)
BROWSER_USE_PASSTHROUGH_ACTIONS = frozenset(
    {
        "navigate",
        "snapshot",
        "extract",
        "click",
        "scroll",
        "screenshot",
        "wait",
        "evaluate",
    }
).union(BROWSER_USE_DIRECT_ACTIONS)
ADAPTER_ACTIONS_WITH_ARGS = {
    "connect": "connect",
    "open": "open",
    "type": "type_text",
    "press": "press",
    "switch_tab": "switch_tab",
    "act": "act",
}
ADAPTER_ACTIONS_NO_ARGS = {
    "status": "status",
    "profiles": "profiles",
    "get_tabs": "get_tabs",
}
BROWSER_USE_ACTIONS_REQUIRING_CONNECTION = frozenset(
    {
        "snapshot",
        "navigate",
        "click",
        "extract",
        "scroll",
        "screenshot",
        "evaluate",
        "close",
        "go_back",
        "search_page",
        "find_elements",
        "find_text",
        "input",
        "send_keys",
        "switch",
        "close_tab",
        "dropdown_options",
        "select_dropdown",
        "upload_file",
        "read_long_content",
        "get_tabs",
    }
)
ACT_EXECUTE_FORWARD_ACTIONS = frozenset({"navigate", "extract", "scroll", "screenshot"})
_ADAPTER_CACHE_BY_CONTROLLER: "WeakKeyDictionary[Any, BrowserUseCompatibilityAdapter]" = (
    WeakKeyDictionary()
)


BrowserControllerLike = ControllerRuntimeLike


class BrowserUseCompatibilityAdapter:
    """Compatibility adapter for Phase 2 routing.

    This adapter intentionally keeps existing payload contracts stable while
    moving browser action execution behind an adapter seam.
    """

    def __init__(
        self,
        controller: BrowserControllerLike,
        runtime_provider: BrowserRuntimeProvider | None = None,
    ):
        self._runtime = runtime_provider or get_browser_runtime_provider(controller)

    async def execute(
        self,
        action: str,
        args: Mapping[str, Any],
    ) -> AdapterActionResult:
        handler_with_args = ADAPTER_ACTIONS_WITH_ARGS.get(action)
        if handler_with_args:
            return await getattr(self, handler_with_args)(args)

        handler_no_args = ADAPTER_ACTIONS_NO_ARGS.get(action)
        if handler_no_args:
            return await getattr(self, handler_no_args)()

        if action in BROWSER_USE_PASSTHROUGH_ACTIONS:
            return await self.execute_browser_use_action(action, args)
        if action == "close":
            if self._extract_tab_id(args):
                return await self.execute_browser_use_action("close", args)
            return await self.close()

        return AdapterActionResult(
            success=False,
            action=action,
            decision="compat",
            error=f"Unhandled action: {action}",
            error_code="ACTION_UNSUPPORTED",
        )

    async def connect(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if self._runtime.is_connected:
            await self._runtime.close()

        requested_mode = self._value_as_str(args.get("mode"))
        warnings: list[str] = []
        if requested_mode and requested_mode.lower() not in {
            "user_chrome",
            "windie",
            "windie_chrome",
        }:
            warnings.append(
                f"Connect mode '{requested_mode}' is ignored; using WindieOS dedicated browser instance."
            )

        try:
            result = await self._runtime.connect_user_chrome(
                cdp_url=DEFAULT_WINDIE_CDP_URL,
                auto_launch=True,
            )
            if result.get("auto_launched"):
                message = (
                    "WindieOS browser connected "
                    "(dedicated instance was auto-launched)"
                )
            else:
                message = (
                    "WindieOS browser connected "
                    "(attached to existing WindieOS browser instance)"
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
                "scope": "windieos_dedicated",
            },
            warnings=warnings,
        )

    async def status(self) -> AdapterActionResult:
        return await self.execute_browser_use_action("status", {"action": "status"})

    async def profiles(self) -> AdapterActionResult:
        return AdapterActionResult(
            success=True,
            action="profiles",
            decision="compat",
            data={
                "action": "profiles",
                "profiles": [
                    {"name": "windie_chrome", "driver": "cdp", "scope": "windieos_dedicated"},
                ],
                "default_profile": "windie_chrome",
            },
        )




    async def open(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._runtime.is_connected:
            return self._not_connected("open")

        url = self._extract_url(args) or "about:blank"
        open_result = await self.execute_browser_use_action(
            "navigate",
            {
                **dict(args),
                "action": "navigate",
                "url": url,
                "new_tab": True,
            },
        )
        open_result = self._retag_action(open_result, "open")
        if not open_result.success:
            return open_result
        payload = dict(open_result.data)
        payload["action"] = "open"
        payload["url"] = url
        payload["browser_use_action"] = "navigate"
        payload["new_tab"] = True
        return AdapterActionResult(
            success=True,
            action="open",
            decision=open_result.decision,
            data=payload,
            warnings=list(open_result.warnings),
        )


    async def type_text(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._runtime.is_connected:
            return self._not_connected("type")

        ref = self._value_as_str(args.get("ref"))
        text = args.get("text")
        if not ref:
            return self._invalid_argument("type", "Missing required 'ref' parameter")
        if not isinstance(text, str):
            return self._invalid_argument(
                "type",
                "Missing required 'text' parameter",
            )

        type_result = await self.execute_browser_use_action(
            "input",
            {
                **dict(args),
                "action": "input",
                "ref": ref,
                "text": text,
            },
        )
        type_result = self._retag_action(type_result, "type")
        if not type_result.success:
            return type_result

        submit = bool(args.get("submit", False))
        if submit:
            submit_result = await self.execute_browser_use_action(
                "send_keys",
                {
                    "action": "send_keys",
                    "keys": "Enter",
                },
            )
            if not submit_result.success:
                return self._retag_action(submit_result, "type")

        payload = dict(type_result.data)
        payload["action"] = "type"
        payload["ref"] = ref
        payload["text"] = text
        payload["submit"] = submit

        return AdapterActionResult(
            success=True,
            action="type",
            decision=type_result.decision,
            data=payload,
            warnings=list(type_result.warnings),
        )

    async def press(self, args: Mapping[str, Any]) -> AdapterActionResult:
        if not self._runtime.is_connected:
            return self._not_connected("press")

        key = self._value_as_str(args.get("key"))
        if not key:
            return self._invalid_argument("press", "Missing required 'key' parameter")

        press_result = await self.execute_browser_use_action(
            "send_keys",
            {
                "action": "send_keys",
                "keys": key,
            },
        )
        press_result = self._retag_action(press_result, "press")
        if not press_result.success:
            return press_result
        payload = dict(press_result.data)
        payload["action"] = "press"
        payload["key"] = key
        return AdapterActionResult(
            success=True,
            action="press",
            decision=press_result.decision,
            data=payload,
            warnings=list(press_result.warnings),
        )




    async def get_tabs(self) -> AdapterActionResult:
        return await self.execute_browser_use_action(
            "get_tabs",
            {"action": "get_tabs"},
        )

    async def switch_tab(self, args: Mapping[str, Any]) -> AdapterActionResult:
        switch_result = await self.execute_browser_use_action(
            "switch",
            {
                **dict(args),
                "action": "switch",
            },
        )
        switch_result = self._retag_action(switch_result, "switch_tab")
        if not switch_result.success:
            return switch_result
        payload = dict(switch_result.data)
        payload["action"] = "switch_tab"
        payload["target_id"] = self._extract_target_id(args)
        payload["browser_use_action"] = "switch"
        return AdapterActionResult(
            success=True,
            action="switch_tab",
            decision=switch_result.decision,
            data=payload,
            warnings=list(switch_result.warnings),
        )


    async def execute_browser_use_action(
        self,
        action: str,
        args: Mapping[str, Any],
    ) -> AdapterActionResult:
        normalized = action.strip().lower()
        if normalized in BROWSER_USE_ACTIONS_REQUIRING_CONNECTION:
            if not self._runtime.is_connected:
                return self._not_connected(action)

        params_or_error = self._build_browser_use_action_params(normalized, args)
        if isinstance(params_or_error, AdapterActionResult):
            return params_or_error
        params = params_or_error
        runtime_action = "close" if normalized == "close_tab" else normalized

        runtime_execute = getattr(self._runtime, "execute_browser_use_action", None)
        if not callable(runtime_execute):
            return AdapterActionResult(
                success=False,
                action=action,
                decision="port",
                error=(
                    f"Browser Use runtime does not expose execute_browser_use_action for '{runtime_action}'"
                ),
                error_code="ACTION_UNSUPPORTED",
            )

        try:
            result = await runtime_execute(
                action=runtime_action,
                params=params,
            )
        except Exception as exc:
            error_text = str(exc)
            error_code = (
                "INVALID_ARGUMENT"
                if "invalid parameters" in error_text.lower()
                else "BROWSER_RUNTIME_ERROR"
            )
            return AdapterActionResult(
                success=False,
                action=action,
                decision="port",
                error=error_text,
                error_code=error_code,
            )

        if not isinstance(result, dict):
            return AdapterActionResult(
                success=False,
                action=action,
                decision="port",
                error=f"Browser Use action '{runtime_action}' returned invalid response",
                error_code="BROWSER_RUNTIME_ERROR",
            )

        if not result.get("success", False):
            return AdapterActionResult(
                success=False,
                action=action,
                decision="port",
                error=result.get("error", f"Browser Use action '{runtime_action}' failed"),
                error_code="BROWSER_RUNTIME_ERROR",
            )

        payload: dict[str, Any] = dict(result)
        payload["action"] = action
        payload["browser_use_action"] = runtime_action
        return AdapterActionResult(
            success=True,
            action=action,
            decision="port",
            data=payload,
        )

    def _build_browser_use_action_params(
        self,
        action: str,
        args: Mapping[str, Any],
    ) -> dict[str, Any] | AdapterActionResult:
        if action == "done":
            text = self._value_as_str(args.get("text"))
            if not text:
                return self._invalid_argument("done", "done requires non-empty 'text'")
            params: dict[str, Any] = {"text": text}
            if isinstance(args.get("success"), bool):
                params["success"] = bool(args.get("success"))
            files_to_display = args.get("files_to_display")
            if isinstance(files_to_display, list):
                params["files_to_display"] = [
                    str(path).strip()
                    for path in files_to_display
                    if isinstance(path, str) and path.strip()
                ]
            return params

        if action == "status":
            return {}

        if action == "get_tabs":
            return {}

        if action == "navigate":
            url = self._extract_url(args)
            if not url:
                return self._invalid_argument(
                    "navigate",
                    "navigate requires non-empty 'url'",
                )
            params = {"url": url}
            if isinstance(args.get("new_tab"), bool):
                params["new_tab"] = bool(args.get("new_tab"))
            return params

        if action == "snapshot":
            compatibility_fields = (
                "format",
                "snapshotFormat",
                "wait_until",
                "state",
                "mode",
                "max_chars",
                "refs",
                "interactive",
                "compact",
                "depth",
                "selector",
                "frame",
            )
            for field in compatibility_fields:
                if field in args:
                    return self._invalid_argument(
                        "snapshot",
                        (
                            f"snapshot no longer supports compatibility '{field}'; "
                            "use Browser Use snapshot semantics"
                        ),
                    )

            offset = args.get("offset")
            if offset is None:
                resolved_offset = 0
            elif isinstance(offset, int) and offset >= 0:
                resolved_offset = offset
            else:
                return self._invalid_argument(
                    "snapshot",
                    "snapshot offset must be a non-negative integer",
                )

            limit = args.get("limit")
            if limit is None:
                resolved_limit = 4000
            elif isinstance(limit, int) and limit > 0:
                resolved_limit = limit
            else:
                return self._invalid_argument(
                    "snapshot",
                    "snapshot limit must be a positive integer",
                )

            if resolved_offset + resolved_limit > MAX_SNAPSHOT_CAPTURE_CHARS:
                return self._invalid_argument(
                    "snapshot",
                    "offset + limit exceeds maximum snapshot window (120000)",
                )

            include_screenshot = bool(args.get("include_screenshot", False))
            return {
                "offset": resolved_offset,
                "limit": resolved_limit,
                "include_screenshot": include_screenshot,
            }

        if action == "search":
            query = self._value_as_str(args.get("query"))
            if not query:
                return self._invalid_argument("search", "search requires non-empty 'query'")
            params: dict[str, Any] = {"query": query}
            engine = self._value_as_str(args.get("engine"))
            if engine:
                params["engine"] = engine
            return params

        if action == "go_back":
            description = self._value_as_str(args.get("description"))
            return {"description": description} if description else {}

        if action == "search_page":
            pattern = self._value_as_str(args.get("pattern")) or self._value_as_str(
                args.get("query")
            )
            if not pattern:
                return self._invalid_argument(
                    "search_page",
                    "search_page requires non-empty 'pattern'",
                )
            params = {"pattern": pattern}
            if isinstance(args.get("regex"), bool):
                params["regex"] = bool(args.get("regex"))
            if isinstance(args.get("case_sensitive"), bool):
                params["case_sensitive"] = bool(args.get("case_sensitive"))
            context_chars = args.get("context_chars")
            if isinstance(context_chars, int) and context_chars >= 0:
                params["context_chars"] = context_chars
            css_scope = self._value_as_str(args.get("css_scope"))
            if css_scope:
                params["css_scope"] = css_scope
            max_results = args.get("max_results")
            if isinstance(max_results, int) and max_results > 0:
                params["max_results"] = max_results
            return params

        if action == "find_elements":
            selector = self._value_as_str(args.get("selector"))
            if not selector:
                return self._invalid_argument(
                    "find_elements",
                    "find_elements requires non-empty 'selector'",
                )
            params = {"selector": selector}
            attributes = args.get("attributes")
            if isinstance(attributes, list):
                params["attributes"] = [
                    str(attribute).strip()
                    for attribute in attributes
                    if isinstance(attribute, str) and attribute.strip()
                ]
            max_results = args.get("max_results")
            if isinstance(max_results, int) and max_results > 0:
                params["max_results"] = max_results
            if isinstance(args.get("include_text"), bool):
                params["include_text"] = bool(args.get("include_text"))
            return params

        if action == "find_text":
            text = self._value_as_str(args.get("text")) or self._value_as_str(
                args.get("pattern")
            )
            if not text:
                return self._invalid_argument(
                    "find_text",
                    "find_text requires non-empty 'text'",
                )
            return {"text": text}

        if action == "extract":
            if "mode" in args:
                return self._invalid_argument(
                    "extract",
                    "extract no longer supports compatibility 'mode'; use Browser Use extract semantics",
                )
            if "selector" in args:
                return self._invalid_argument(
                    "extract",
                    "extract no longer supports compatibility 'selector'; use Browser Use extract semantics",
                )
            if "frame" in args:
                return self._invalid_argument(
                    "extract",
                    "extract no longer supports compatibility 'frame'; use Browser Use extract semantics",
                )
            query = self._value_as_str(args.get("query"))
            if not query:
                return self._invalid_argument(
                    "extract",
                    "extract requires non-empty 'query'",
                )
            params = {"query": query}
            if isinstance(args.get("extract_links"), bool):
                params["extract_links"] = bool(args.get("extract_links"))
            start_from_char = args.get("start_from_char")
            if isinstance(start_from_char, int) and start_from_char >= 0:
                params["start_from_char"] = start_from_char
            output_schema = args.get("output_schema")
            if isinstance(output_schema, dict):
                params["output_schema"] = output_schema
            return params

        if action == "click":
            index = self._extract_index(args)
            if index is None:
                coordinate_x = self._extract_coordinate(args.get("coordinate_x"))
                coordinate_y = self._extract_coordinate(args.get("coordinate_y"))
                has_coordinate_x = coordinate_x is not None
                has_coordinate_y = coordinate_y is not None
                if has_coordinate_x != has_coordinate_y:
                    return self._invalid_argument(
                        "click",
                        "click requires both 'coordinate_x' and 'coordinate_y' when using coordinate click",
                    )
                if has_coordinate_x and has_coordinate_y:
                    return {
                        "coordinate_x": coordinate_x,
                        "coordinate_y": coordinate_y,
                    }
                return self._invalid_argument(
                    "click",
                    "click requires integer 'index', numeric 'ref', or coordinate pair 'coordinate_x'/'coordinate_y'",
                )
            return {"index": index}

        if action == "input":
            index = self._extract_index(args)
            if index is None:
                return self._invalid_argument(
                    "input",
                    "input requires integer 'index' or numeric 'ref'",
                )
            text = args.get("text")
            if not isinstance(text, str):
                return self._invalid_argument("input", "input requires string 'text'")
            params = {
                "index": index,
                "text": text,
            }
            if isinstance(args.get("clear"), bool):
                params["clear"] = bool(args.get("clear"))
            elif isinstance(args.get("clear_first"), bool):
                params["clear"] = bool(args.get("clear_first"))
            return params

        if action == "send_keys":
            keys = self._value_as_str(args.get("keys")) or self._value_as_str(
                args.get("key")
            )
            if not keys:
                return self._invalid_argument(
                    "send_keys",
                    "send_keys requires non-empty 'keys'",
                )
            return {"keys": keys}

        if action == "wait":
            if "state" in args:
                return self._invalid_argument(
                    "wait",
                    "wait no longer supports compatibility 'state'; provide Browser Use 'seconds'",
                )
            seconds = args.get("seconds")
            if isinstance(seconds, (int, float)):
                return {"seconds": max(0, int(round(float(seconds))))}
            return {}

        if action == "scroll":
            params: dict[str, Any] = {}
            index = self._extract_index(args)
            if index is not None:
                params["index"] = index
            pages = args.get("pages")
            if (
                isinstance(pages, (int, float))
                and not isinstance(pages, bool)
                and float(pages) > 0
            ):
                params["pages"] = float(pages)
            amount = args.get("amount")
            if (
                "pages" not in params
                and isinstance(amount, (int, float))
                and not isinstance(amount, bool)
            ):
                params["pages"] = max(0.1, abs(float(amount)) / 500.0)
            direction = self._value_as_str(args.get("direction"))
            if direction:
                params["down"] = direction.lower() not in {"up", "left"}
            elif isinstance(args.get("down"), bool):
                params["down"] = bool(args.get("down"))
            return params

        if action == "screenshot":
            if "full_page" in args:
                return self._invalid_argument(
                    "screenshot",
                    "screenshot no longer supports compatibility 'full_page'; only Browser Use screenshot parameters are supported",
                )
            if "ref" in args:
                return self._invalid_argument(
                    "screenshot",
                    "screenshot no longer supports compatibility 'ref'; only Browser Use screenshot parameters are supported",
                )
            if "element" in args:
                return self._invalid_argument(
                    "screenshot",
                    "screenshot no longer supports compatibility 'element'; only Browser Use screenshot parameters are supported",
                )
            if "type" in args:
                return self._invalid_argument(
                    "screenshot",
                    "screenshot no longer supports compatibility 'type'; only Browser Use screenshot parameters are supported",
                )
            if "quality" in args:
                return self._invalid_argument(
                    "screenshot",
                    "screenshot no longer supports compatibility 'quality'; only Browser Use screenshot parameters are supported",
                )
            file_name = self._value_as_str(args.get("file_name"))
            return {"file_name": file_name} if file_name else {}

        if action == "evaluate":
            code = self._value_as_str(args.get("code")) or self._value_as_str(
                args.get("script")
            )
            if not code:
                return self._invalid_argument(
                    "evaluate",
                    "evaluate requires non-empty 'code' or 'script'",
                )
            return {"code": code}

        if action == "switch":
            tab_id = self._extract_tab_id(args)
            if not tab_id:
                return self._invalid_argument(
                    "switch",
                    "switch requires non-empty 'tab_id' or 'target_id'",
                )
            return {"tab_id": tab_id}

        if action == "close":
            tab_id = self._extract_tab_id(args)
            if not tab_id:
                return self._invalid_argument(
                    "close",
                    "close requires non-empty 'tab_id' or 'target_id'",
                )
            return {"tab_id": tab_id}

        if action == "close_tab":
            tab_id = self._extract_tab_id(args)
            if not tab_id:
                return self._invalid_argument(
                    "close_tab",
                    "close_tab requires non-empty 'tab_id' or 'target_id'",
                )
            return {"tab_id": tab_id}

        if action == "dropdown_options":
            index = self._extract_index(args)
            if index is None:
                return self._invalid_argument(
                    "dropdown_options",
                    "dropdown_options requires integer 'index' or numeric 'ref'",
                )
            return {"index": index}

        if action == "select_dropdown":
            index = self._extract_index(args)
            if index is None:
                return self._invalid_argument(
                    "select_dropdown",
                    "select_dropdown requires integer 'index' or numeric 'ref'",
                )
            text = self._value_as_str(args.get("text"))
            if not text:
                return self._invalid_argument(
                    "select_dropdown",
                    "select_dropdown requires non-empty 'text'",
                )
            return {"index": index, "text": text}

        if action == "upload_file":
            index = self._extract_index(args)
            if index is None:
                return self._invalid_argument(
                    "upload_file",
                    "upload_file requires integer 'index' or numeric 'ref'",
                )
            path = self._value_as_str(args.get("path"))
            if not path:
                paths = args.get("paths")
                if isinstance(paths, list) and paths:
                    first = paths[0]
                    if isinstance(first, str) and first.strip():
                        path = first.strip()
            if not path:
                return self._invalid_argument(
                    "upload_file",
                    "upload_file requires non-empty 'path' (or first entry in 'paths')",
                )
            return {"index": index, "path": path}

        if action == "write_file":
            file_name = self._value_as_str(args.get("file_name"))
            content = args.get("content")
            if not file_name:
                return self._invalid_argument(
                    "write_file",
                    "write_file requires non-empty 'file_name'",
                )
            if not isinstance(content, str):
                return self._invalid_argument(
                    "write_file",
                    "write_file requires string 'content'",
                )
            params = {"file_name": file_name, "content": content}
            for key in ("append", "trailing_newline", "leading_newline"):
                value = args.get(key)
                if isinstance(value, bool):
                    params[key] = value
            return params

        if action == "replace_file":
            file_name = self._value_as_str(args.get("file_name"))
            old_str = args.get("old_str")
            new_str = args.get("new_str")
            if not file_name:
                return self._invalid_argument(
                    "replace_file",
                    "replace_file requires non-empty 'file_name'",
                )
            if not isinstance(old_str, str) or not isinstance(new_str, str):
                return self._invalid_argument(
                    "replace_file",
                    "replace_file requires string 'old_str' and 'new_str'",
                )
            return {"file_name": file_name, "old_str": old_str, "new_str": new_str}

        if action == "read_file":
            file_name = self._value_as_str(args.get("file_name"))
            if not file_name:
                return self._invalid_argument(
                    "read_file",
                    "read_file requires non-empty 'file_name'",
                )
            return {"file_name": file_name}

        if action == "read_long_content":
            goal = self._value_as_str(args.get("goal")) or self._value_as_str(
                args.get("query")
            )
            if not goal:
                return self._invalid_argument(
                    "read_long_content",
                    "read_long_content requires non-empty 'goal'",
                )
            params = {"goal": goal}
            source = self._value_as_str(args.get("source"))
            if source:
                params["source"] = source
            context = self._value_as_str(args.get("context"))
            if context:
                params["context"] = context
            return params

        return self._invalid_argument(
            action,
            f"Unsupported Browser Use action '{action}'",
        )


    async def act(self, args: Mapping[str, Any]) -> AdapterActionResult:
        request = args.get("request")
        if not isinstance(request, dict):
            return self._invalid_argument("act", "act requires a 'request' object")

        kind_value = request.get("kind")
        if not isinstance(kind_value, str) or not kind_value.strip():
            return self._invalid_argument("act", "act.request.kind is required")

        kind = kind_value.strip().lower()
        merged: dict[str, Any] = dict(args)
        merged.update(request)

        if kind == "click":
            click_result = await self.execute("click", {"action": "click", **merged})
            return self._retag_action(click_result, "click")

        if kind == "type":
            type_args = {"action": "type", **merged}
            type_result = await self.type_text(type_args)
            return self._retag_action(type_result, "type")

        if kind == "press":
            press_args = {"action": "press", "key": merged.get("key"), **merged}
            press_result = await self.press(press_args)
            return self._retag_action(press_result, "press")

        if kind in ACT_EXECUTE_FORWARD_ACTIONS:
            forward_result = await self.execute(kind, {"action": kind, **merged})
            return self._retag_action(forward_result, kind)

        if kind == "wait":
            time_ms = merged.get("timeMs")
            wait_args = {"action": "wait", **merged}
            if isinstance(time_ms, (int, float)):
                wait_args["seconds"] = max(0.0, float(time_ms) / 1000.0)
            wait_result = await self.execute("wait", wait_args)
            return self._retag_action(wait_result, "wait")

        if kind == "evaluate":
            fn = merged.get("fn")
            evaluate_args = {"action": "evaluate", **merged}
            if isinstance(fn, str) and fn:
                evaluate_args["script"] = fn
            evaluate_result = await self.execute("evaluate", evaluate_args)
            return self._retag_action(evaluate_result, "evaluate")

        if kind in BROWSER_USE_DIRECT_ACTIONS:
            browser_use_result = await self.execute_browser_use_action(kind, merged)
            return self._retag_action(browser_use_result, kind)

        if kind == "close":
            if self._extract_tab_id(merged):
                close_tab_result = await self.execute_browser_use_action("close", merged)
                return self._retag_action(close_tab_result, "close")
            close_result = await self.close()
            return self._retag_action(close_result, "close")

        return AdapterActionResult(
            success=False,
            action="act",
            decision="compat",
            error=f"Unsupported act kind: {kind}",
            error_code="ACTION_UNSUPPORTED",
        )

    async def close(self) -> AdapterActionResult:
        await self._runtime.close()
        return AdapterActionResult(
            success=True,
            action="close",
            decision="port",
            data={
                "action": "close",
                "status": "closed",
            },
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
    def _extract_tab_id(args: Mapping[str, Any]) -> str | None:
        raw_tab_id = args.get("tab_id")
        if isinstance(raw_tab_id, str) and raw_tab_id.strip():
            tab_id = raw_tab_id.strip()
            return tab_id[-4:] if len(tab_id) > 4 else tab_id
        target_id = BrowserUseCompatibilityAdapter._extract_target_id(args)
        if target_id:
            return target_id[-4:] if len(target_id) > 4 else target_id
        return None

    @staticmethod
    def _extract_index(args: Mapping[str, Any]) -> int | None:
        index = args.get("index")
        if isinstance(index, int) and index >= 0:
            return index
        if isinstance(index, float) and index.is_integer() and index >= 0:
            return int(index)
        ref = args.get("ref")
        if isinstance(ref, str) and ref.strip().isdigit():
            return int(ref.strip())
        return None

    @staticmethod
    def _extract_coordinate(value: Any) -> int | None:
        if isinstance(value, bool):
            return None
        if isinstance(value, int):
            return value
        if isinstance(value, float):
            return int(round(value))
        return None

    @staticmethod
    def _value_as_str(value: Any) -> str | None:
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return None

    @staticmethod
    def _retag_action(
        result: AdapterActionResult,
        action: str,
    ) -> AdapterActionResult:
        if result.action == action:
            return result
        data = dict(result.data)
        if result.success:
            data["action"] = action
        return AdapterActionResult(
            success=result.success,
            action=action,
            decision=result.decision,
            data=data,
            error=result.error,
            error_code=result.error_code,
            warnings=list(result.warnings),
            deprecation=result.deprecation,
        )

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


def get_browser_use_adapter(
    controller: BrowserControllerLike,
    runtime_provider: BrowserRuntimeProvider | None = None,
    runtime_provider_factory: Callable[[BrowserControllerLike], BrowserRuntimeProvider] = get_browser_runtime_provider,
) -> BrowserUseCompatibilityAdapter:
    """Factory seam for adapter injection in tests and runtime caching."""
    if runtime_provider is not None:
        return BrowserUseCompatibilityAdapter(
            controller,
            runtime_provider=runtime_provider,
        )

    try:
        cached = _ADAPTER_CACHE_BY_CONTROLLER.get(controller)
        if cached is not None:
            return cached
    except TypeError:
        # Some test doubles (for example SimpleNamespace) are not weak-referenceable.
        # Skip caching for those objects.
        return BrowserUseCompatibilityAdapter(
            controller,
            runtime_provider=runtime_provider_factory(controller),
        )

    adapter = BrowserUseCompatibilityAdapter(
        controller,
        runtime_provider=runtime_provider_factory(controller),
    )
    try:
        _ADAPTER_CACHE_BY_CONTROLLER[controller] = adapter
    except TypeError:
        return adapter
    return adapter
