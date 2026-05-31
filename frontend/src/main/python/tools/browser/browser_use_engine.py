"""Browser Use engine adapter for WindieOS browser tool execution."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
import json
import os
from pathlib import Path
import re
import sys
from typing import Any
from urllib.parse import quote_plus

from platformdirs import user_data_dir

from tools.browser.chrome_launcher import DEFAULT_WINDIE_CDP_PORT, ensure_chrome_with_cdp
from tools.browser.content_extraction import (
    DEFAULT_EXTRACT_CHARS,
    DEFAULT_LONG_CONTENT_CHARS,
    MAX_EXTRACT_CHARS,
    html_to_markdown,
)
from tools.browser.file_store import (
    read_text,
    replace_text,
    resolve_browser_path,
    write_text,
)
from windie_shared.browser_contract import BROWSER_CANONICAL_ACTIONS

DEFAULT_SESSION_NAME = "windieos"
DEFAULT_SNAPSHOT_PAGE_LIMIT = 4_000
MAX_SNAPSHOT_WINDOW_CHARS = 120_000
RUNTIME_SOURCE = "browser_use.cli"
BROWSER_USE_ENGINE_ACTIONS = frozenset(BROWSER_CANONICAL_ACTIONS)
HEADLESS_RECOVERY_TIMEOUT_SECONDS = 5.0
BROWSER_INTERNAL_URL_PREFIXES = (
    "about:",
    "chrome://",
    "chrome-extension://",
    "devtools://",
)


@dataclass(slots=True)
class BrowserActionError(Exception):
    code: str
    message: str

    def __str__(self) -> str:
        return self.message


def _browser_use_home() -> str:
    configured = os.getenv("WINDIE_BROWSER_USE_HOME")
    if configured:
        return str(Path(configured).expanduser())
    return str(Path(user_data_dir("desktop-assistant")) / "browser-use")


def _browser_use_session() -> str:
    return os.getenv("WINDIE_BROWSER_USE_SESSION", DEFAULT_SESSION_NAME).strip() or DEFAULT_SESSION_NAME


def _browser_use_timeout() -> float:
    raw = os.getenv("WINDIE_BROWSER_USE_COMMAND_TIMEOUT_SECONDS")
    if not raw:
        return 120.0
    try:
        return max(1.0, float(raw))
    except ValueError:
        return 120.0


def _base_command() -> list[str]:
    configured = os.getenv("WINDIE_BROWSER_USE_CLI")
    if configured:
        return [configured]
    return [sys.executable, "-m", "browser_use.skill_cli.main"]


def _feature_pack_pythonpath() -> str | None:
    try:
        from core.feature_pack_installer import ensure_feature_pack_site_packages_on_path

        return str(ensure_feature_pack_site_packages_on_path())
    except Exception:
        return None


def _extract_response_data(response: dict[str, Any]) -> dict[str, Any]:
    if not response.get("success", False):
        raise BrowserActionError(
            code="BROWSER_USE_ENGINE_ERROR",
            message=str(response.get("error") or "Browser Use command failed."),
        )
    data = response.get("data")
    if data is None:
        return {}
    if not isinstance(data, dict):
        return {"value": data}
    if data.get("error"):
        raise BrowserActionError(
            code="BROWSER_USE_ENGINE_ERROR",
            message=str(data["error"]),
        )
    return data


def _parse_cli_json(stdout: str) -> dict[str, Any]:
    stripped = stdout.strip()
    if not stripped:
        raise BrowserActionError(
            code="BROWSER_USE_ENGINE_ERROR",
            message="Browser Use command returned no JSON output.",
        )
    for line in reversed(stripped.splitlines()):
        candidate = line.strip()
        if not candidate:
            continue
        for fragment in _json_object_candidates(candidate):
            try:
                parsed = json.loads(fragment)
            except json.JSONDecodeError:
                continue
            if isinstance(parsed, dict):
                return parsed
    raise BrowserActionError(
        code="BROWSER_USE_ENGINE_ERROR",
        message=f"Browser Use command returned invalid JSON: {stripped[:500]}",
    )


def _json_object_candidates(line: str) -> list[str]:
    candidates = [line]
    start = line.find("{")
    while start >= 0:
        fragment = line[start:]
        if fragment not in candidates:
            candidates.append(fragment)
        start = line.find("{", start + 1)
    return candidates


def _is_browser_internal_url(url: str) -> bool:
    normalized = url.strip().lower()
    return normalized.startswith(BROWSER_INTERNAL_URL_PREFIXES)


def _is_pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except (OSError, ProcessLookupError):
        return False
    return True


def _normalize_index(args: Any, *, action: str) -> int:
    raw_ref = getattr(args, "ref", None)
    raw_index = getattr(args, "index", None)
    if isinstance(raw_index, int) and raw_index >= 0:
        return raw_index
    if isinstance(raw_ref, str) and raw_ref.strip().isdigit():
        return int(raw_ref.strip())
    raise BrowserActionError(
        code="INVALID_ARGUMENT",
        message=(
            f"{action} requires a Browser Use numeric element index. "
            "Role refs are Windie-specific and are not supported by the Browser Use engine."
        ),
    )


def _search_url(query: str, engine: str | None) -> str:
    normalized_engine = (engine or "google").strip().lower()
    encoded = quote_plus(query)
    if normalized_engine == "duckduckgo":
        return f"https://duckduckgo.com/?q={encoded}"
    if normalized_engine == "bing":
        return f"https://www.bing.com/search?q={encoded}"
    return f"https://www.google.com/search?q={encoded}"


def _bounded_limit(value: int | None, *, default: int, maximum: int) -> int:
    if not isinstance(value, int):
        return default
    return max(1, min(value, maximum))


def _focused_excerpt(content: str, *, query: str, max_chars: int) -> str:
    terms = []
    seen: set[str] = set()
    for term in re.findall(r"[a-zA-Z0-9]{3,}", query.lower()):
        if term not in seen:
            terms.append(term)
            seen.add(term)
    if not terms:
        return content[:max_chars]
    snippets: list[str] = []
    for line_index, line in enumerate(content.splitlines()):
        if not any(term in line.lower() for term in terms):
            continue
        lines = content.splitlines()
        start = max(0, line_index - 1)
        end = min(len(lines), line_index + 2)
        snippet = "\n".join(part for part in lines[start:end] if part.strip()).strip()
        if snippet:
            snippets.append(snippet)
        if sum(len(item) for item in snippets) >= max_chars:
            break
    return ("\n\n".join(snippets) or content)[:max_chars]


def _build_search_matches(
    content: str,
    *,
    pattern: str,
    regex: bool,
    case_sensitive: bool,
    context_chars: int,
    max_results: int,
) -> list[dict[str, Any]]:
    matches: list[dict[str, Any]] = []
    if regex:
        flags = 0 if case_sensitive else re.IGNORECASE
        matcher = re.compile(pattern, flags)
        for match in list(matcher.finditer(content))[:max_results]:
            start = match.start()
            end = match.end()
            matches.append(
                {
                    "match": match.group(0),
                    "start": start,
                    "end": end,
                    "snippet": content[max(0, start - context_chars) : min(len(content), end + context_chars)],
                }
            )
        return matches

    haystack = content if case_sensitive else content.lower()
    needle = pattern if case_sensitive else pattern.lower()
    start = 0
    while len(matches) < max_results:
        found = haystack.find(needle, start)
        if found < 0:
            break
        end = found + len(pattern)
        matches.append(
            {
                "match": content[found:end],
                "start": found,
                "end": end,
                "snippet": content[max(0, found - context_chars) : min(len(content), end + context_chars)],
            }
        )
        start = end
    return matches


def _clean_result_data(data: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in data.items() if key != "_raw_text"}


def _browser_output(data: dict[str, Any], fallback: str) -> str:
    output = data.get("output")
    if output not in (None, ""):
        return str(output)
    message = data.get("message")
    if message not in (None, ""):
        return str(message)
    return fallback


def _with_output(data: dict[str, Any], output: str) -> dict[str, Any]:
    result = _clean_result_data(data)
    result["output"] = output
    return result


def _format_matches_output(label: str, matches: list[dict[str, Any]]) -> str:
    if not matches:
        return f"No matches found for {label}."
    lines = [f"Found {len(matches)} match{'es' if len(matches) != 1 else ''} for {label}:"]
    for index, match in enumerate(matches, start=1):
        snippet = str(match.get("snippet") or match.get("match") or "").strip()
        snippet = re.sub(r"\s+", " ", snippet)
        if len(snippet) > 240:
            snippet = f"{snippet[:237]}..."
        lines.append(
            f"{index}. {match.get('match', '')} "
            f"(chars {match.get('start', '?')}-{match.get('end', '?')}): {snippet}"
        )
    return "\n".join(lines)


def _format_elements_output(selector: str, elements: list[dict[str, Any]]) -> str:
    if not elements:
        return f"No elements found for selector {selector!r}."
    lines = [
        f"Found {len(elements)} element{'s' if len(elements) != 1 else ''} for selector {selector!r}:"
    ]
    for element in elements:
        index = element.get("index")
        text = re.sub(r"\s+", " ", str(element.get("text") or "")).strip()
        attrs = element.get("attributes")
        attrs_text = f" attrs={attrs}" if isinstance(attrs, dict) and attrs else ""
        if len(text) > 180:
            text = f"{text[:177]}..."
        lines.append(f"- [{index}] {text}{attrs_text}".rstrip())
    return "\n".join(lines)


class BrowserUseEngineRuntime:
    """Execute WindieOS browser actions through the maintained Browser Use CLI daemon."""

    def __init__(self) -> None:
        self._session = _browser_use_session()
        self._home = _browser_use_home()
        self._timeout = _browser_use_timeout()
        self._windie_cdp_url = f"http://127.0.0.1:{DEFAULT_WINDIE_CDP_PORT}"

    @classmethod
    def supported_actions(cls) -> frozenset[str]:
        return BROWSER_USE_ENGINE_ACTIONS

    def _read_session_state(self) -> dict[str, Any]:
        state_path = Path(self._home) / f"{self._session}.state.json"
        if not state_path.exists():
            return {}
        try:
            state = json.loads(state_path.read_text())
        except Exception:
            return {}
        return state if isinstance(state, dict) else {}

    def _is_live_session_state(self, state: dict[str, Any]) -> bool:
        pid = state.get("pid")
        return (
            state.get("phase") in {"ready", "running", "starting"}
            and isinstance(pid, int)
            and _is_pid_alive(pid)
        )

    def _is_windie_cdp_session_state(self, state: dict[str, Any], *, cdp_url: str | None = None) -> bool:
        config = state.get("config") if isinstance(state.get("config"), dict) else {}
        return config.get("cdp_url") == (cdp_url or self._windie_cdp_url)

    def _is_live_incompatible_session_state(self, state: dict[str, Any], *, cdp_url: str) -> bool:
        return self._is_live_session_state(state) and not self._is_windie_cdp_session_state(
            state,
            cdp_url=cdp_url,
        )

    async def execute(self, args: Any) -> dict[str, Any]:
        handler = getattr(self, f"_handle_{args.action}", None)
        if handler is None:
            raise BrowserActionError(
                code="ACTION_UNSUPPORTED",
                message=f"Unsupported browser action: {args.action}",
            )
        payload = await handler(args)
        payload.setdefault("success", True)
        payload.setdefault("action", args.action)
        payload.setdefault("native_source", RUNTIME_SOURCE)
        return payload

    def _has_running_windie_cdp_session(self) -> bool:
        state = self._read_session_state()
        return self._is_live_session_state(state) and self._is_windie_cdp_session_state(state)

    async def _ensure_windie_cdp_target(self) -> str:
        cdp_url = await ensure_chrome_with_cdp(
            cdp_port=DEFAULT_WINDIE_CDP_PORT,
            auto_launch=True,
            headless=False,
        )
        self._windie_cdp_url = cdp_url
        await self._recover_incompatible_session_before_start(cdp_url)
        return cdp_url

    async def _recover_incompatible_session_before_start(self, cdp_url: str) -> None:
        if not self._is_live_incompatible_session_state(self._read_session_state(), cdp_url=cdp_url):
            return

        await self._run_cli("close", headed=False)
        deadline = asyncio.get_running_loop().time() + HEADLESS_RECOVERY_TIMEOUT_SECONDS
        while asyncio.get_running_loop().time() < deadline:
            if not self._is_live_incompatible_session_state(self._read_session_state(), cdp_url=cdp_url):
                return
            await asyncio.sleep(0.1)
        raise BrowserActionError(
            code="BROWSER_USE_ENGINE_ERROR",
            message=(
                f"Browser Use session '{self._session}' is still running with a non-WindieOS profile after close; "
                "stop the stale daemon before reconnecting the WindieOS dedicated browser."
            ),
        )

    async def _run_cli(self, *args: str, headed: bool | None = None, cdp_url: str | None = None) -> dict[str, Any]:
        if cdp_url is None and headed is None and not self._has_running_windie_cdp_session():
            cdp_url = await self._ensure_windie_cdp_target()

        command = [
            *_base_command(),
            "--session",
            self._session,
            "--json",
        ]
        should_request_headed = headed if headed is not None else not self._has_running_windie_cdp_session()
        if should_request_headed:
            command.append("--headed")
        if cdp_url:
            command.extend(["--cdp-url", cdp_url])
        command.extend(args)

        env = os.environ.copy()
        env["BROWSER_USE_HOME"] = self._home
        feature_pack_path = _feature_pack_pythonpath()
        if feature_pack_path:
            existing = env.get("PYTHONPATH")
            env["PYTHONPATH"] = (
                feature_pack_path
                if not existing
                else f"{feature_pack_path}{os.pathsep}{existing}"
            )

        try:
            process = await asyncio.create_subprocess_exec(
                *command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )
        except FileNotFoundError as exc:
            raise BrowserActionError(
                code="BROWSER_USE_ENGINE_UNAVAILABLE",
                message=(
                    "Browser Use CLI is unavailable. Install the sidecar browser "
                    "feature pack or add browser-use to the sidecar Python environment."
                ),
            ) from exc

        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                process.communicate(),
                timeout=self._timeout,
            )
        except TimeoutError as exc:
            process.kill()
            await process.communicate()
            raise BrowserActionError(
                code="BROWSER_USE_ENGINE_TIMEOUT",
                message=f"Browser Use command timed out after {self._timeout:.0f}s.",
            ) from exc

        stdout = stdout_bytes.decode("utf-8", errors="replace")
        stderr = stderr_bytes.decode("utf-8", errors="replace").strip()
        if process.returncode != 0:
            message = stderr or stdout.strip() or f"Browser Use command exited {process.returncode}."
            raise BrowserActionError(
                code="BROWSER_USE_ENGINE_ERROR",
                message=message,
            )
        return _extract_response_data(_parse_cli_json(stdout))

    async def _read_markdown(self, *, selector: str | None = None, extract_links: bool = False) -> str:
        command = ["get", "html"]
        if selector:
            command.extend(["--selector", selector])
        data = await self._run_cli(*command)
        return html_to_markdown(str(data.get("html", "") or ""), extract_links=extract_links)

    async def _handle_connect(self, _args: Any) -> dict[str, Any]:
        cdp_url = await self._ensure_windie_cdp_target()
        data = await self._run_cli("state", headed=True, cdp_url=cdp_url)
        return {
            "status": "connected",
            "connected": True,
            "mode": "browser_use",
            "scope": "windie_dedicated_browser",
            "cdp_url": cdp_url,
            "output": "Connected to the browser.",
        }

    async def _handle_status(self, _args: Any) -> dict[str, Any]:
        state = self._read_session_state()
        if not state:
            return {
                "connected": False,
                "mode": "browser_use",
                "scope": "windie_dedicated_browser",
                "output": "Browser is not connected.",
            }
        if state.get("phase") not in {"ready", "running"} or not self._is_windie_cdp_session_state(state):
            return {
                "connected": False,
                "mode": "browser_use",
                "phase": state.get("phase", "unknown"),
                "scope": "windie_dedicated_browser",
                "output": f"Browser is not connected; session phase is {state.get('phase', 'unknown')}.",
            }
        title = await self._run_cli("get", "title")
        url = await self._run_cli("eval", "window.location.href")
        url_text = str(url.get("result", "") or "")
        title_text = str(title.get("title", "") or "")
        return {
            "connected": True,
            "mode": "browser_use",
            "phase": state.get("phase"),
            "url": url_text,
            "title": title_text,
            "scope": "windie_dedicated_browser",
            "output": f"Browser is connected to {url_text or 'an unknown URL'}" + (f" ({title_text})." if title_text else "."),
        }

    async def _handle_profiles(self, _args: Any) -> dict[str, Any]:
        return {
            "profiles": [
                {
                    "name": self._session,
                    "driver": "browser-use",
                    "scope": "windie_dedicated_browser",
                }
            ],
            "default_profile": self._session,
            "output": f"Available browser profile: {self._session}.",
        }

    async def _handle_navigate(self, args: Any) -> dict[str, Any]:
        if _is_browser_internal_url(args.url) and not args.new_tab:
            data = await self._run_cli(
                "python",
                f"browser.goto({json.dumps(args.url)})",
            )
            return {
                "url": args.url,
                "browser_internal": True,
                **_with_output(data, _browser_output(data, f"Opened {args.url}.")),
            }
        data = (
            await self._run_cli("tab", "new", args.url)
            if args.new_tab
            else await self._run_cli("open", args.url)
        )
        return {"url": args.url, **_with_output(data, _browser_output(data, f"Opened {args.url}."))}

    async def _handle_snapshot(self, args: Any) -> dict[str, Any]:
        data = await self._run_cli("state")
        snapshot_text = str(data.get("_raw_text", "") or "")
        offset = args.offset or 0
        limit = _bounded_limit(args.limit, default=DEFAULT_SNAPSHOT_PAGE_LIMIT, maximum=MAX_SNAPSHOT_WINDOW_CHARS)
        if offset + limit > MAX_SNAPSHOT_WINDOW_CHARS:
            raise BrowserActionError(
                code="INVALID_ARGUMENT",
                message="snapshot offset + limit exceeds maximum window (120000).",
            )
        total_chars = len(snapshot_text)
        window_start = min(offset, total_chars)
        window_end = min(total_chars, window_start + limit)
        payload = {
            "format": "browser_use_state",
            "output": snapshot_text[window_start:window_end],
            "ref_count": len(re.findall(r"(^|\n)\s*\\[\\d+\\]", snapshot_text)),
            "offset": window_start,
            "limit": limit,
            "returned_chars": window_end - window_start,
            "total_chars": total_chars,
            "has_more": window_end < total_chars,
            "next_offset": window_end if window_end < total_chars else None,
        }
        if args.include_screenshot:
            screenshot = await self._handle_screenshot(args)
            payload["screenshot_path"] = screenshot["path"]
            payload["screenshot_content_type"] = "image/png"
        return payload

    async def _handle_extract(self, args: Any) -> dict[str, Any]:
        markdown = await self._read_markdown(extract_links=bool(args.extract_links))
        bounded_start = max(0, min(args.start_from_char, len(markdown)))
        working_content = markdown[bounded_start:]
        max_chars = _bounded_limit(DEFAULT_EXTRACT_CHARS, default=DEFAULT_EXTRACT_CHARS, maximum=MAX_EXTRACT_CHARS)
        extracted = _focused_excerpt(working_content, query=args.query, max_chars=max_chars)
        return {
            "output": extracted,
            "metadata": {
                "query": args.query,
                "extract_links": bool(args.extract_links),
                "start_from_char": bounded_start,
                "max_chars": max_chars,
                "schema_enforced": bool(args.output_schema),
                "output_schema": args.output_schema,
                "extraction_backend": RUNTIME_SOURCE,
            },
            "total_chars": len(markdown),
            "returned_chars": len(extracted),
            "has_more": False,
            "next_offset": None,
        }

    async def _handle_click(self, args: Any) -> dict[str, Any]:
        if args.coordinate_x is not None and args.coordinate_y is not None:
            data = await self._run_cli("click", str(args.coordinate_x), str(args.coordinate_y))
            return _with_output(
                data,
                _browser_output(data, f"Clicked coordinates ({args.coordinate_x}, {args.coordinate_y})."),
            )
        else:
            index = _normalize_index(args, action="click")
            command = "dblclick" if args.double_click else "rightclick" if args.button == "right" else "click"
            data = await self._run_cli(command, str(index))
            return _with_output(data, _browser_output(data, f"Clicked element index {index}."))

    async def _handle_input(self, args: Any) -> dict[str, Any]:
        index = _normalize_index(args, action="input")
        data = await self._run_cli("input", str(index), args.text)
        return {"action": "input", **_with_output(data, _browser_output(data, f"Entered text into element index {index}."))}

    async def _handle_send_keys(self, args: Any) -> dict[str, Any]:
        data = await self._run_cli("keys", args.keys)
        return {"keys": args.keys, **_with_output(data, _browser_output(data, f"Sent keys: {args.keys}."))}

    async def _handle_scroll(self, args: Any) -> dict[str, Any]:
        amount = args.amount
        if args.pages is not None:
            amount = max(100, int(round(float(args.pages) * 500)))
        direction = args.direction
        if getattr(args, "down", None) is not None:
            direction = "down" if args.down else "up"
        data = await self._run_cli("scroll", direction, "--amount", str(amount))
        return {
            "amount": amount,
            "direction": direction,
            **_with_output(data, _browser_output(data, f"Scrolled {direction} by {amount}."))
        }

    async def _handle_screenshot(self, args: Any) -> dict[str, Any]:
        requested_name = getattr(args, "file_name", None) or "browser-screenshot.png"
        output_path = resolve_browser_path(requested_name, ensure_parent=True)
        data = await self._run_cli("screenshot", str(output_path))
        return {
            "path": str(output_path),
            "file_name": output_path.name,
            "image_type": "png",
            "bytes": int(data.get("size", 0) or 0),
            "output": f"Saved browser screenshot to {output_path}.",
        }

    async def _handle_wait(self, args: Any) -> dict[str, Any]:
        seconds = float(args.seconds) if args.seconds is not None else 0.5
        await asyncio.sleep(max(0.0, seconds))
        return {"seconds": seconds, "output": f"Waited for {seconds} seconds."}

    async def _handle_get_tabs(self, _args: Any) -> dict[str, Any]:
        data = await self._run_cli("tab", "list")
        lines = str(data.get("_raw_text", "") or "").splitlines()[1:]
        tabs = []
        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue
            parts = stripped.split(maxsplit=1)
            tab_id = parts[0]
            tabs.append({"target_id": tab_id, "title": "", "url": parts[1] if len(parts) > 1 else ""})
        output = "Open browser tabs:\n" + "\n".join(
            f"- {tab['target_id']}: {tab['url']}" for tab in tabs
        ) if tabs else "No open browser tabs found."
        return {"tabs": tabs, "tab_count": len(tabs), "output": output}

    async def _handle_switch(self, args: Any) -> dict[str, Any]:
        if not str(args.tab_id).strip().isdigit():
            raise BrowserActionError(code="INVALID_ARGUMENT", message="switch requires a Browser Use numeric tab index.")
        data = await self._run_cli("tab", "switch", str(args.tab_id))
        return {
            "target_id": str(args.tab_id),
            "activated": bool(args.activate),
            **_with_output(data, _browser_output(data, f"Switched to tab {args.tab_id}."))
        }

    async def _handle_evaluate(self, args: Any) -> dict[str, Any]:
        data = await self._run_cli("eval", args.code)
        return _with_output(data, _browser_output(data, str(data.get("result", "") or "Evaluation completed.")))

    async def _handle_done(self, args: Any) -> dict[str, Any]:
        files = []
        if isinstance(args.files_to_display, list):
            files = [str(path).strip() for path in args.files_to_display if isinstance(path, str) and path.strip()]
        output = args.text or "Done."
        return {"output": output, "done_success": args.success, "files_to_display": files}

    async def _handle_search(self, args: Any) -> dict[str, Any]:
        url = _search_url(args.query, args.engine)
        data = await self._run_cli("open", url)
        engine = args.engine or "google"
        return {
            "query": args.query,
            "engine": engine,
            **_with_output(data, _browser_output(data, f"Searched {engine} for {args.query}."))
        }

    async def _handle_go_back(self, _args: Any) -> dict[str, Any]:
        data = await self._run_cli("back")
        return _with_output(data, _browser_output(data, "Went back one page."))

    async def _handle_search_page(self, args: Any) -> dict[str, Any]:
        markdown = await self._read_markdown(selector=args.css_scope)
        matches = _build_search_matches(
            markdown,
            pattern=args.pattern,
            regex=bool(args.regex),
            case_sensitive=bool(args.case_sensitive),
            context_chars=args.context_chars or 80,
            max_results=args.max_results or 20,
        )
        return {
            "pattern": args.pattern,
            "match_count": len(matches),
            "matches": matches,
            "output": _format_matches_output(repr(args.pattern), matches),
        }

    async def _handle_find_elements(self, args: Any) -> dict[str, Any]:
        script = (
            "(function(){"
            f"const els=Array.from(document.querySelectorAll({json.dumps(args.selector)}));"
            f"return els.slice(0,{int(args.max_results or 20)}).map((el,index)=>({{"
            "index,"
            "text: el.innerText || el.textContent || '',"
            "attributes: Object.fromEntries(Array.from(el.attributes || []).map(a=>[a.name,a.value]))"
            "}));})()"
        )
        data = await self._run_cli("eval", script)
        elements = data.get("result") if isinstance(data.get("result"), list) else []
        filtered = []
        for element in elements:
            entry = {"index": element.get("index", len(filtered))}
            if args.include_text:
                entry["text"] = element.get("text", "")
            if args.attributes:
                attrs = element.get("attributes", {}) or {}
                entry["attributes"] = {name: attrs.get(name) for name in args.attributes}
            filtered.append(entry)
        return {
            "selector": args.selector,
            "count": len(elements),
            "elements": filtered,
            "output": _format_elements_output(args.selector, filtered),
        }

    async def _handle_find_text(self, args: Any) -> dict[str, Any]:
        markdown = await self._read_markdown(selector=args.css_scope)
        matches = _build_search_matches(
            markdown,
            pattern=args.text,
            regex=False,
            case_sensitive=False,
            context_chars=80,
            max_results=args.max_results or 20,
        )
        return {
            "text": args.text,
            "match_count": len(matches),
            "matches": matches,
            "output": _format_matches_output(repr(args.text), matches),
        }

    async def _handle_close_tab(self, args: Any) -> dict[str, Any]:
        if not str(args.tab_id).strip().isdigit():
            raise BrowserActionError(code="INVALID_ARGUMENT", message="close_tab requires a Browser Use numeric tab index.")
        data = await self._run_cli("tab", "close", str(args.tab_id))
        return {
            "closed_target_id": str(args.tab_id),
            **_with_output(data, _browser_output(data, f"Closed tab {args.tab_id}."))
        }

    async def _handle_dropdown_options(self, args: Any) -> dict[str, Any]:
        index = _normalize_index(args, action="dropdown_options")
        raise BrowserActionError(
            code="ACTION_UNSUPPORTED",
            message=f"Browser Use CLI does not expose dropdown option enumeration for index {index}; use select_dropdown with the desired option text.",
        )

    async def _handle_select_dropdown(self, args: Any) -> dict[str, Any]:
        index = _normalize_index(args, action="select_dropdown")
        data = await self._run_cli("select", str(index), args.text)
        return {
            "selected": args.text,
            "element": index,
            **_with_output(data, _browser_output(data, f"Selected {args.text} in dropdown index {index}."))
        }

    async def _handle_upload_file(self, args: Any) -> dict[str, Any]:
        index = _normalize_index(args, action="upload_file")
        if not args.path:
            raise BrowserActionError(code="INVALID_ARGUMENT", message="upload_file requires non-empty 'path'.")
        data = await self._run_cli("upload", str(index), str(args.path))
        return _with_output(data, _browser_output(data, f"Uploaded {args.path} to element index {index}."))

    async def _handle_write_file(self, args: Any) -> dict[str, Any]:
        resolved, written_chars = write_text(
            args.file_name,
            args.content,
            append=bool(args.append),
            leading_newline=bool(args.leading_newline),
            trailing_newline=bool(args.trailing_newline),
        )
        return {"path": str(resolved), "written_chars": written_chars, "output": f"Wrote {written_chars} characters to {resolved}."}

    async def _handle_replace_file(self, args: Any) -> dict[str, Any]:
        resolved, replacements = replace_text(args.file_name, args.old_str, args.new_str)
        return {"path": str(resolved), "replacements": replacements, "output": f"Replaced {replacements} occurrence(s) in {resolved}."}

    async def _handle_read_file(self, args: Any) -> dict[str, Any]:
        resolved, content = read_text(args.file_name)
        return {"path": str(resolved), "output": content, "chars": len(content)}

    async def _handle_read_long_content(self, args: Any) -> dict[str, Any]:
        markdown = await self._read_markdown(extract_links=True)
        query = " ".join(part for part in (args.goal, args.source, args.context) if isinstance(part, str) and part.strip())
        extracted = _focused_excerpt(markdown, query=query, max_chars=DEFAULT_LONG_CONTENT_CHARS)
        return {
            "output": extracted,
            "metadata": {
                "goal": args.goal,
                "source": args.source,
                "context": args.context,
                "extraction_backend": RUNTIME_SOURCE,
            },
            "total_chars": len(markdown),
            "returned_chars": len(extracted),
            "has_more": len(extracted) < len(markdown),
            "next_offset": len(extracted) if len(extracted) < len(markdown) else None,
        }

    async def _handle_close(self, _args: Any) -> dict[str, Any]:
        data = await self._run_cli("close", headed=False)
        return _with_output(data, _browser_output(data, "Closed the browser session."))
