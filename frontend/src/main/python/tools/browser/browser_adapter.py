"""Browser Use compatibility adapter for WindieOS browser tool."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable
from typing import Any, Literal
from typing import Mapping
from weakref import WeakKeyDictionary

from tools.browser.chrome_launcher import DEFAULT_WINDIE_CDP_URL
from tools.browser.browser_action_contract import BROWSER_CANONICAL_ACTIONS
from tools.browser.browser_action_contract import REMOVED_BROWSER_ACTION_ALIASES
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
SNAPSHOT_COMPATIBILITY_FIELDS = (
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
EXTRACT_COMPATIBILITY_FIELDS = ("mode", "selector", "frame")
SCREENSHOT_COMPATIBILITY_FIELDS = ("full_page", "ref", "element", "type", "quality")
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
        if action == "connect":
            result = await self.connect(args)
            return self._annotate_legacy_action(action, result)

        if action == "profiles":
            result = await self.profiles()
            return self._annotate_legacy_action(action, result)

        if action in REMOVED_BROWSER_ACTION_ALIASES:
            preferred = REMOVED_BROWSER_ACTION_ALIASES[action]
            result = self._invalid_argument(
                action,
                f"Legacy browser action '{action}' has been removed. Use {preferred}.",
            )
            return self._annotate_legacy_action(action, result)

        if action in BROWSER_CANONICAL_ACTIONS:
            if action == "close" and not self._extract_tab_id(args):
                result = await self.close()
            else:
                result = await self.execute_browser_use_action(action, args)
            return self._annotate_legacy_action(action, result)

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
        builders: dict[
            str,
            Callable[[Mapping[str, Any]], dict[str, Any] | AdapterActionResult],
        ] = {
            "done": self._build_params_done,
            "status": self._build_params_empty,
            "get_tabs": self._build_params_empty,
            "navigate": self._build_params_navigate,
            "snapshot": self._build_params_snapshot,
            "search": self._build_params_search,
            "go_back": self._build_params_go_back,
            "search_page": self._build_params_search_page,
            "find_elements": self._build_params_find_elements,
            "find_text": self._build_params_find_text,
            "extract": self._build_params_extract,
            "click": self._build_params_click,
            "input": self._build_params_input,
            "send_keys": self._build_params_send_keys,
            "wait": self._build_params_wait,
            "scroll": self._build_params_scroll,
            "screenshot": self._build_params_screenshot,
            "evaluate": self._build_params_evaluate,
            "switch": lambda action_args: self._require_tab_id("switch", action_args),
            "close": lambda action_args: self._require_tab_id("close", action_args),
            "close_tab": lambda action_args: self._require_tab_id(
                "close_tab",
                action_args,
            ),
            "dropdown_options": self._build_params_dropdown_options,
            "select_dropdown": self._build_params_select_dropdown,
            "upload_file": self._build_params_upload_file,
            "write_file": self._build_params_write_file,
            "replace_file": self._build_params_replace_file,
            "read_file": self._build_params_read_file,
            "read_long_content": self._build_params_read_long_content,
        }
        builder = builders.get(action)
        if builder is None:
            return self._invalid_argument(
                action,
                f"Unsupported Browser Use action '{action}'",
            )
        return builder(args)

    def _build_params_done(
        self,
        args: Mapping[str, Any],
    ) -> dict[str, Any] | AdapterActionResult:
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

    @staticmethod
    def _build_params_empty(
        _args: Mapping[str, Any],
    ) -> dict[str, Any]:
        return {}

    def _build_params_navigate(
        self,
        args: Mapping[str, Any],
    ) -> dict[str, Any] | AdapterActionResult:
        url = self._extract_url(args)
        if not url:
            return self._invalid_argument(
                "navigate",
                "navigate requires non-empty 'url'",
            )
        params: dict[str, Any] = {"url": url}
        if isinstance(args.get("new_tab"), bool):
            params["new_tab"] = bool(args.get("new_tab"))
        return params

    def _build_params_snapshot(
        self,
        args: Mapping[str, Any],
    ) -> dict[str, Any] | AdapterActionResult:
        unsupported = self._reject_compatibility_fields(
            action="snapshot",
            args=args,
            fields=SNAPSHOT_COMPATIBILITY_FIELDS,
            message_suffix="use Browser Use snapshot semantics",
        )
        if unsupported is not None:
            return unsupported

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

    def _build_params_search(
        self,
        args: Mapping[str, Any],
    ) -> dict[str, Any] | AdapterActionResult:
        query = self._value_as_str(args.get("query"))
        if not query:
            return self._invalid_argument("search", "search requires non-empty 'query'")
        params: dict[str, Any] = {"query": query}
        engine = self._value_as_str(args.get("engine"))
        if engine:
            params["engine"] = engine
        return params

    def _build_params_go_back(
        self,
        args: Mapping[str, Any],
    ) -> dict[str, Any]:
        description = self._value_as_str(args.get("description"))
        return {"description": description} if description else {}

    def _build_params_search_page(
        self,
        args: Mapping[str, Any],
    ) -> dict[str, Any] | AdapterActionResult:
        pattern = self._first_nonempty_str(args, "pattern", "query")
        if not pattern:
            return self._invalid_argument(
                "search_page",
                "search_page requires non-empty 'pattern'",
            )
        params: dict[str, Any] = {"pattern": pattern}
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

    def _build_params_find_elements(
        self,
        args: Mapping[str, Any],
    ) -> dict[str, Any] | AdapterActionResult:
        selector = self._value_as_str(args.get("selector"))
        if not selector:
            return self._invalid_argument(
                "find_elements",
                "find_elements requires non-empty 'selector'",
            )
        params: dict[str, Any] = {"selector": selector}
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

    def _build_params_find_text(
        self,
        args: Mapping[str, Any],
    ) -> dict[str, Any] | AdapterActionResult:
        text = self._first_nonempty_str(args, "text", "pattern")
        if not text:
            return self._invalid_argument(
                "find_text",
                "find_text requires non-empty 'text'",
            )
        return {"text": text}

    def _build_params_extract(
        self,
        args: Mapping[str, Any],
    ) -> dict[str, Any] | AdapterActionResult:
        unsupported = self._reject_compatibility_fields(
            action="extract",
            args=args,
            fields=EXTRACT_COMPATIBILITY_FIELDS,
            message_suffix="use Browser Use extract semantics",
        )
        if unsupported is not None:
            return unsupported
        query = self._value_as_str(args.get("query"))
        if not query:
            return self._invalid_argument(
                "extract",
                "extract requires non-empty 'query'",
            )
        params: dict[str, Any] = {"query": query}
        if isinstance(args.get("extract_links"), bool):
            params["extract_links"] = bool(args.get("extract_links"))
        start_from_char = args.get("start_from_char")
        if isinstance(start_from_char, int) and start_from_char >= 0:
            params["start_from_char"] = start_from_char
        output_schema = args.get("output_schema")
        if isinstance(output_schema, dict):
            params["output_schema"] = output_schema
        return params

    def _build_params_click(
        self,
        args: Mapping[str, Any],
    ) -> dict[str, Any] | AdapterActionResult:
        index = self._extract_index(args)
        if index is not None:
            return {"index": index}

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

    def _build_params_input(
        self,
        args: Mapping[str, Any],
    ) -> dict[str, Any] | AdapterActionResult:
        index_or_error = self._require_index(
            action="input",
            args=args,
            error_message="input requires integer 'index' or numeric 'ref'",
        )
        if isinstance(index_or_error, AdapterActionResult):
            return index_or_error
        text = args.get("text")
        if not isinstance(text, str):
            return self._invalid_argument("input", "input requires string 'text'")
        params: dict[str, Any] = {
            "index": index_or_error,
            "text": text,
        }
        if isinstance(args.get("clear"), bool):
            params["clear"] = bool(args.get("clear"))
        elif isinstance(args.get("clear_first"), bool):
            params["clear"] = bool(args.get("clear_first"))
        return params

    def _build_params_send_keys(
        self,
        args: Mapping[str, Any],
    ) -> dict[str, Any] | AdapterActionResult:
        keys = self._first_nonempty_str(args, "keys", "key")
        if not keys:
            return self._invalid_argument(
                "send_keys",
                "send_keys requires non-empty 'keys'",
            )
        return {"keys": keys}

    def _build_params_wait(
        self,
        args: Mapping[str, Any],
    ) -> dict[str, Any] | AdapterActionResult:
        unsupported = self._reject_compatibility_fields(
            action="wait",
            args=args,
            fields=("state",),
            message_suffix="provide Browser Use 'seconds'",
        )
        if unsupported is not None:
            return unsupported
        seconds = args.get("seconds")
        if isinstance(seconds, (int, float)):
            return {"seconds": max(0, int(round(float(seconds))))}
        return {}

    def _build_params_scroll(
        self,
        args: Mapping[str, Any],
    ) -> dict[str, Any]:
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

    def _build_params_screenshot(
        self,
        args: Mapping[str, Any],
    ) -> dict[str, Any] | AdapterActionResult:
        unsupported = self._reject_compatibility_fields(
            action="screenshot",
            args=args,
            fields=SCREENSHOT_COMPATIBILITY_FIELDS,
            message_suffix="only Browser Use screenshot parameters are supported",
        )
        if unsupported is not None:
            return unsupported
        file_name = self._value_as_str(args.get("file_name"))
        return {"file_name": file_name} if file_name else {}

    def _build_params_evaluate(
        self,
        args: Mapping[str, Any],
    ) -> dict[str, Any] | AdapterActionResult:
        code = self._first_nonempty_str(args, "code", "script")
        if not code:
            return self._invalid_argument(
                "evaluate",
                "evaluate requires non-empty 'code' or 'script'",
            )
        return {"code": code}

    def _build_params_dropdown_options(
        self,
        args: Mapping[str, Any],
    ) -> dict[str, Any] | AdapterActionResult:
        index_or_error = self._require_index(
            action="dropdown_options",
            args=args,
            error_message="dropdown_options requires integer 'index' or numeric 'ref'",
        )
        if isinstance(index_or_error, AdapterActionResult):
            return index_or_error
        return {"index": index_or_error}

    def _build_params_select_dropdown(
        self,
        args: Mapping[str, Any],
    ) -> dict[str, Any] | AdapterActionResult:
        index_or_error = self._require_index(
            action="select_dropdown",
            args=args,
            error_message="select_dropdown requires integer 'index' or numeric 'ref'",
        )
        if isinstance(index_or_error, AdapterActionResult):
            return index_or_error
        text = self._value_as_str(args.get("text"))
        if not text:
            return self._invalid_argument(
                "select_dropdown",
                "select_dropdown requires non-empty 'text'",
            )
        return {"index": index_or_error, "text": text}

    def _build_params_upload_file(
        self,
        args: Mapping[str, Any],
    ) -> dict[str, Any] | AdapterActionResult:
        index_or_error = self._require_index(
            action="upload_file",
            args=args,
            error_message="upload_file requires integer 'index' or numeric 'ref'",
        )
        if isinstance(index_or_error, AdapterActionResult):
            return index_or_error
        path = self._extract_upload_path(args)
        if not path:
            return self._invalid_argument(
                "upload_file",
                "upload_file requires non-empty 'path' (or first entry in 'paths')",
            )
        return {"index": index_or_error, "path": path}

    def _build_params_write_file(
        self,
        args: Mapping[str, Any],
    ) -> dict[str, Any] | AdapterActionResult:
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
        params: dict[str, Any] = {"file_name": file_name, "content": content}
        for key in ("append", "trailing_newline", "leading_newline"):
            value = args.get(key)
            if isinstance(value, bool):
                params[key] = value
        return params

    def _build_params_replace_file(
        self,
        args: Mapping[str, Any],
    ) -> dict[str, Any] | AdapterActionResult:
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

    def _build_params_read_file(
        self,
        args: Mapping[str, Any],
    ) -> dict[str, Any] | AdapterActionResult:
        file_name = self._value_as_str(args.get("file_name"))
        if not file_name:
            return self._invalid_argument(
                "read_file",
                "read_file requires non-empty 'file_name'",
            )
        return {"file_name": file_name}

    def _build_params_read_long_content(
        self,
        args: Mapping[str, Any],
    ) -> dict[str, Any] | AdapterActionResult:
        goal = self._first_nonempty_str(args, "goal", "query")
        if not goal:
            return self._invalid_argument(
                "read_long_content",
                "read_long_content requires non-empty 'goal'",
            )
        params: dict[str, Any] = {"goal": goal}
        source = self._value_as_str(args.get("source"))
        if source:
            params["source"] = source
        context = self._value_as_str(args.get("context"))
        if context:
            params["context"] = context
        return params

    def _reject_compatibility_fields(
        self,
        *,
        action: str,
        args: Mapping[str, Any],
        fields: tuple[str, ...],
        message_suffix: str,
    ) -> AdapterActionResult | None:
        for field in fields:
            if field in args:
                return self._invalid_argument(
                    action,
                    (
                        f"{action} no longer supports compatibility '{field}'; "
                        f"{message_suffix}"
                    ),
                )
        return None

    def _require_tab_id(
        self,
        action: str,
        args: Mapping[str, Any],
    ) -> dict[str, Any] | AdapterActionResult:
        tab_id = self._extract_tab_id(args)
        if not tab_id:
            return self._invalid_argument(
                action,
                f"{action} requires non-empty 'tab_id' or 'target_id'",
            )
        return {"tab_id": tab_id}

    def _require_index(
        self,
        *,
        action: str,
        args: Mapping[str, Any],
        error_message: str,
    ) -> int | AdapterActionResult:
        index = self._extract_index(args)
        if index is None:
            return self._invalid_argument(action, error_message)
        return index

    def _first_nonempty_str(
        self,
        args: Mapping[str, Any],
        *keys: str,
    ) -> str | None:
        for key in keys:
            value = self._value_as_str(args.get(key))
            if value:
                return value
        return None

    def _extract_upload_path(self, args: Mapping[str, Any]) -> str | None:
        direct_path = self._value_as_str(args.get("path"))
        if direct_path:
            return direct_path
        paths = args.get("paths")
        if isinstance(paths, list) and paths:
            first = paths[0]
            if isinstance(first, str) and first.strip():
                return first.strip()
        return None
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
    def _annotate_legacy_action(
        action: str,
        result: AdapterActionResult,
    ) -> AdapterActionResult:
        preferred_action = REMOVED_BROWSER_ACTION_ALIASES.get(action)
        if preferred_action is None:
            return result

        deprecation_message = (
            f"'{action}' is a legacy compatibility alias; prefer '{preferred_action}'"
        )
        warnings = list(result.warnings)
        if deprecation_message not in warnings:
            warnings.append(deprecation_message)
        data = dict(result.data)
        data["legacy_action"] = action
        data["preferred_action"] = preferred_action
        return AdapterActionResult(
            success=result.success,
            action=result.action,
            decision=result.decision,
            data=data,
            error=result.error,
            error_code=result.error_code,
            warnings=warnings,
            deprecation=result.deprecation or deprecation_message,
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
