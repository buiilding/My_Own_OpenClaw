#!/usr/bin/env python3
"""Python sidecar daemon HTTP/WebSocket runtime."""

from __future__ import annotations

import argparse
import asyncio
import contextvars
import json
import logging
import os
import re
import secrets
import shutil
import sqlite3
import sys
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from aiohttp import web

from local_backend import LocalBackend
from tools.result import ToolResult

logger = logging.getLogger(__name__)

DEFAULT_HOST = "127.0.0.1"
DEFAULT_DISCOVERY_FILE = (
    Path(tempfile.gettempdir()) / "desktop-agent" / "sidecar-daemon.json"
)
MCP_PROTOCOL_VERSION = "2024-11-05"
MCP_DISCOVERY_DIAGNOSTICS_PATH = "mcp.discovery"
MCP_EXECUTION_DIAGNOSTICS_PATH = "mcp.execution"
MCP_REGISTRATION_DIAGNOSTICS_PATH = "mcp.registration"
MAX_DIAGNOSTIC_TEXT_LENGTH = 240
MCP_STDIO_STREAM_LIMIT_BYTES = 64 * 1024 * 1024
PASSIVE_BROWSER_SESSION_ACTIONS = {"get_tabs", "status"}
CURRENT_MCP_EXECUTION_CONTEXT: contextvars.ContextVar[dict[str, Any]] = (
    contextvars.ContextVar("CURRENT_MCP_EXECUTION_CONTEXT", default={})
)
CUA_DRIVER_MACOS_COMMAND_CANDIDATES = (
    Path("/Applications/CuaDriver.app/Contents/MacOS/cua-driver"),
    Path.home() / ".local" / "bin" / "cua-driver",
)
LAUNCH_CONTEXT_ENV_KEYS = (
    "WINDIE_BACKEND_HTTP_URL",
    "WINDIE_BACKEND_AUTH_STATE_PATH",
    "WINDIE_ENABLE_SEMANTIC_SUMMARIZER",
    "WINDIE_PACKAGED_APP",
    "WINDIE_ENABLE_BROWSER_FEATURE_PACK_AUTOINSTALL",
    "WINDIE_SIDECAR_SOURCE_PATH",
    "WINDIE_SIDECAR_SOURCE_STAMP",
)

ALLOWED_DIAGNOSTIC_DATA_KEYS = {
    "serverId",
    "command",
    "args",
    "phase",
    "replace",
    "requestedServerCount",
    "registeredServerCount",
    "registeredToolCount",
    "statusCount",
    "errorCount",
    "mcpServerCount",
    "mcpToolCount",
    "timeoutMs",
    "elapsedMs",
    "stderrTail",
    "toolCount",
    "exposedToolName",
    "mcpToolName",
    "toolCallId",
    "correlationId",
    "bundleId",
    "turnRef",
    "exitCode",
    "signal",
    "shortError",
    "errorCode",
}


def normalize_object(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def normalize_string(value: Any) -> str:
    return value.strip() if isinstance(value, str) and value.strip() else ""


def reject_removed_keys(payload: dict[str, Any], keys: set[str], label: str) -> None:
    removed = sorted(key for key in keys if key in payload)
    if removed:
        raise ValueError(f"{label} does not support removed field(s): {', '.join(removed)}")


def sanitize_diagnostic_text(
    value: Any, *, max_length: int = MAX_DIAGNOSTIC_TEXT_LENGTH
) -> str:
    if value is None:
        return ""
    text = str(value)
    text = re.sub(r"[A-Za-z]:\\[^\s'\"]+", "[path]", text)
    text = re.sub(
        r"/(?:Users|private|var|tmp|Volumes|Applications)/[^\s'\"]+", "[path]", text
    )
    text = re.sub(
        r"(bearer|token|api[_-]?key|secret|password)=?[^\s'\",)]+",
        r"\1=[redacted]",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > max_length:
        return f"{text[: max_length - 3]}..."
    return text


def emit_sidecar_layer_log(prefix: str, message: str) -> None:
    print(
        f"{prefix} {sanitize_diagnostic_text(message)}",
        file=sys.stderr,
        flush=True,
    )


def build_tool_execution_layer_log(
    tool_name: Any, args: Any, result: dict[str, Any]
) -> tuple[str, str]:
    normalized_tool_name = normalize_string(tool_name)
    normalized_args = normalize_object(args)
    action = normalize_string(normalized_args.get("action"))
    success = result.get("success")

    if normalized_tool_name == "browser" and action:
        if action in PASSIVE_BROWSER_SESSION_ACTIONS:
            return (
                "[BrowserSession]",
                f"sync action={action} success={success}",
            )
        return (
            "[Tool]",
            f"executed name=browser action={action} success={success}",
        )

    return "[Tool]", f"executed name={normalized_tool_name} success={success}"


def command_for_diagnostics(command: str) -> str:
    normalized = normalize_string(command)
    if not normalized:
        return ""
    return sanitize_diagnostic_text(Path(normalized).name)


def resolve_mcp_command_for_spawn(command: str) -> str:
    normalized = normalize_string(command)
    if not normalized:
        return normalized
    if Path(normalized).parts and ("/" in normalized or "\\" in normalized):
        return normalized
    resolved = shutil.which(normalized)
    if resolved:
        return resolved
    if normalized == "cua-driver":
        for candidate in CUA_DRIVER_MACOS_COMMAND_CANDIDATES:
            if candidate.exists() and os.access(candidate, os.X_OK):
                return str(candidate)
    return normalized


def serialize_diagnostic_args(args: list[str]) -> str:
    sanitized = [
        sanitize_diagnostic_text(arg) for arg in args if sanitize_diagnostic_text(arg)
    ]
    return sanitize_diagnostic_text(json.dumps(sanitized, separators=(",", ":")))


def app_user_data_root() -> Path:
    override = normalize_string(os.getenv("WINDIE_USER_DATA_DIR"))
    if override:
        return Path(override)
    if sys_platform := os.getenv("WINDIE_TEST_PLATFORM"):
        platform_name = sys_platform
    else:
        import sys

        platform_name = sys.platform
    if platform_name == "win32":
        return (
            Path(os.getenv("APPDATA") or (Path.home() / "AppData" / "Roaming"))
            / "windieos"
        )
    if platform_name == "darwin":
        return Path.home() / "Library" / "Application Support" / "windieos"
    return Path(os.getenv("XDG_CONFIG_HOME") or (Path.home() / ".config")) / "windieos"


def diagnostics_database_path() -> Path:
    override = normalize_string(os.getenv("WINDIE_APP_DIAGNOSTICS_DB"))
    if override:
        return Path(override)
    return app_user_data_root() / "diagnostics" / "diagnostics.db"


def classify_error_code(message: Any) -> str:
    text = str(message or "").lower()
    if (
        "enoent" in text
        or "no such file" in text
        or "command not found" in text
        or "file not found" in text
    ):
        return "ENOENT"
    if "timed out" in text or "timeout" in text:
        return "timeout"
    if "permission" in text or "accessibility" in text or "tcc" in text:
        return "permission"
    return "runtime_error"


def sanitize_diagnostic_data(data: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(data, dict):
        return {}
    sanitized: dict[str, Any] = {}
    for key, value in data.items():
        if key not in ALLOWED_DIAGNOSTIC_DATA_KEYS:
            continue
        if (
            isinstance(value, bool)
            or isinstance(value, int)
            or isinstance(value, float)
            or value is None
        ):
            sanitized[key] = value
        elif isinstance(value, str):
            sanitized[key] = sanitize_diagnostic_text(value)
    return sanitized


def append_mcp_diagnostic_event(
    *,
    trace_id: str,
    path: str = MCP_DISCOVERY_DIAGNOSTICS_PATH,
    stage: str,
    status: str,
    duration_ms: int | None = None,
    request_id: str | None = None,
    conversation_ref: str | None = None,
    data: dict[str, Any] | None = None,
    error: Any = None,
) -> None:
    try:
        db_path = diagnostics_database_path()
        db_path.parent.mkdir(parents=True, exist_ok=True)
        sanitized_error = None
        sanitized_data = sanitize_diagnostic_data(data)
        if error is not None:
            message = sanitize_diagnostic_text(
                getattr(error, "strerror", None) or error
            )
            sanitized_error = {
                "code": getattr(error, "code", None) or classify_error_code(message),
                "message": message,
            }
            sanitized_data["shortError"] = message
            sanitized_data["errorCode"] = str(sanitized_error["code"])
        with sqlite3.connect(db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS diagnostic_events (
                  id TEXT PRIMARY KEY,
                  trace_id TEXT NOT NULL,
                  span_id TEXT NOT NULL,
                  parent_span_id TEXT,
                  path TEXT NOT NULL,
                  stage TEXT NOT NULL,
                  status TEXT NOT NULL,
                  runtime TEXT NOT NULL,
                  timestamp TEXT NOT NULL,
                  duration_ms INTEGER,
                  request_id TEXT,
                  session_id TEXT,
                  conversation_ref TEXT,
                  data TEXT,
                  error TEXT
                )
                """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_diagnostic_events_path_time
                ON diagnostic_events(path, timestamp)
                """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_diagnostic_events_trace
                ON diagnostic_events(trace_id, timestamp)
                """)
            conn.execute(
                """
                INSERT INTO diagnostic_events (
                  id, trace_id, span_id, parent_span_id, path, stage, status,
                  runtime, timestamp, duration_ms, request_id, session_id,
                  conversation_ref, data, error
                ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
                """,
                (
                    f"evt_{secrets.token_hex(16)}",
                    trace_id,
                    f"span_{secrets.token_hex(16)}",
                    path,
                    stage,
                    status,
                    "sidecar",
                    time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    int(duration_ms) if duration_ms is not None else None,
                    normalize_string(request_id),
                    normalize_string(conversation_ref),
                    json.dumps(sanitized_data, separators=(",", ":")),
                    (
                        json.dumps(sanitized_error, separators=(",", ":"))
                        if sanitized_error
                        else None
                    ),
                ),
            )
    except Exception:
        logger.debug("Unable to append MCP diagnostic event", exc_info=True)


def build_mcp_execution_context(payload: dict[str, Any]) -> dict[str, Any]:
    reject_removed_keys(
        payload,
        {
            "requestId",
            "toolCallId",
            "correlationId",
            "bundleId",
            "turnRef",
            "conversationRef",
        },
        "MCP execution metadata",
    )
    request_id = (
        normalize_string(payload.get("request_id"))
        or normalize_string(payload.get("correlation_id"))
    )
    tool_call_id = normalize_string(payload.get("tool_call_id"))
    correlation_id = normalize_string(payload.get("correlation_id"))
    bundle_id = normalize_string(payload.get("bundle_id"))
    turn_ref = normalize_string(payload.get("turn_ref"))
    conversation_ref = normalize_string(payload.get("conversation_ref"))
    data: dict[str, Any] = {}
    if tool_call_id:
        data["toolCallId"] = tool_call_id
    if correlation_id:
        data["correlationId"] = correlation_id
    if bundle_id:
        data["bundleId"] = bundle_id
    if turn_ref:
        data["turnRef"] = turn_ref
    return {
        "trace_id": f"mcp-execution-{int(time.time() * 1000)}-{secrets.token_hex(6)}",
        "request_id": request_id,
        "conversation_ref": conversation_ref,
        "data": data,
    }


def build_launch_context() -> dict[str, str]:
    return {key: os.getenv(key, "").strip() for key in LAUNCH_CONTEXT_ENV_KEYS}


def create_mcp_tool_name(
    server_id: str, tool_name: str, prefix: str | None = None
) -> str:
    def _segment(value: str) -> str:
        cleaned = "".join(
            char if char.isalnum() or char in {"_", "-"} else "_" for char in value
        )
        cleaned = cleaned.strip("_")
        return cleaned or "tool"

    return f"{_segment(prefix or f'mcp_{server_id}')}__{_segment(tool_name)}"


def mcp_server_launch_key(server: "McpServerSpec") -> str:
    return json.dumps(
        {
            "command": server.command,
            "args": server.args,
            "cwd": server.cwd,
            "env": sorted(server.env.items()),
        },
        sort_keys=True,
        separators=(",", ":"),
    )


MCP_IMAGE_DATA_OUTPUT_PLACEHOLDER = (
    "[image data omitted; promoted to native screenshot field]"
)


def strip_mcp_image_data_for_output(value: Any) -> Any:
    if isinstance(value, list):
        return [strip_mcp_image_data_for_output(item) for item in value]
    if not isinstance(value, dict):
        return value
    output_value: dict[str, Any] = {}
    for key, child_value in value.items():
        if (
            key == "data"
            and value.get("type") == "image"
            and normalize_string(child_value)
        ):
            output_value[key] = MCP_IMAGE_DATA_OUTPUT_PLACEHOLDER
            continue
        output_value[key] = strip_mcp_image_data_for_output(child_value)
    return output_value


def serialize_mcp_result_for_output(result: dict[str, Any] | None) -> str:
    return json.dumps(
        strip_mcp_image_data_for_output(result or {}),
        separators=(",", ":"),
    )


def extract_mcp_image_content(content: Any) -> dict[str, str] | None:
    if not isinstance(content, list):
        return None
    for item in content:
        if not isinstance(item, dict) or item.get("type") != "image":
            continue
        screenshot = normalize_string(item.get("data"))
        if not screenshot:
            continue
        content_type = (
            normalize_string(
                item.get("mimeType")
                or item.get("mime_type")
                or item.get("contentType")
                or item.get("content_type")
            )
            or "image/png"
        )
        return {
            "screenshot": screenshot,
            "screenshot_content_type": content_type,
        }
    return None


def build_mcp_tool_data(result: dict[str, Any]) -> dict[str, Any]:
    image_content = extract_mcp_image_content(result.get("content"))
    data: dict[str, Any] = {
        "output": serialize_mcp_result_for_output(result),
        "mcp_result": result,
    }
    if image_content:
        data.update(image_content)
    return data


@dataclass(slots=True)
class McpServerSpec:
    id: str
    command: str
    args: list[str] = field(default_factory=list)
    cwd: str | None = None
    env: dict[str, str] = field(default_factory=dict)
    name: str | None = None
    description: str | None = None
    timeout_ms: int = 15000
    tool_prefix: str | None = None
    tools: list[dict[str, Any]] = field(default_factory=list)
    mcp_id: str | None = None
    extension_id: str | None = None

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "McpServerSpec":
        reject_removed_keys(
            payload,
            {"timeoutMs", "toolPrefix", "mcpId", "extensionId"},
            "MCP server spec",
        )
        server_id = normalize_string(payload.get("id"))
        command = normalize_string(payload.get("command"))
        if not server_id:
            raise ValueError("MCP server id is required")
        if not command:
            raise ValueError("MCP server command is required")
        raw_args = payload.get("args")
        raw_env = normalize_object(payload.get("env"))
        return cls(
            id=server_id,
            name=normalize_string(payload.get("name")) or server_id,
            description=normalize_string(payload.get("description")) or None,
            command=command,
            args=(
                [arg for arg in raw_args if isinstance(arg, str)]
                if isinstance(raw_args, list)
                else []
            ),
            cwd=normalize_string(payload.get("cwd")) or None,
            env={key: str(value) for key, value in raw_env.items()},
            timeout_ms=int(payload.get("timeout_ms") or 15000),
            tool_prefix=normalize_string(payload.get("tool_prefix")) or None,
            mcp_id=normalize_string(payload.get("mcp_id")) or None,
            extension_id=normalize_string(payload.get("extension_id")) or None,
            tools=(
                [tool for tool in payload.get("tools", []) if isinstance(tool, dict)]
                if isinstance(payload.get("tools"), list)
                else []
            ),
        )

    def public_id(self) -> str:
        return self.mcp_id or self.extension_id or self.id

    def diagnostic_data(self, extra: dict[str, Any] | None = None) -> dict[str, Any]:
        return {
            "serverId": self.id,
            "command": command_for_diagnostics(self.command),
            "args": serialize_diagnostic_args(self.args),
            "timeoutMs": self.timeout_ms,
            **(extra or {}),
        }


class McpStdioClient:
    def __init__(self, server: McpServerSpec, *, trace_id: str | None = None):
        self.server = server
        self.proc: asyncio.subprocess.Process | None = None
        self.pending: dict[int, asyncio.Future[Any]] = {}
        self.next_request_id = 1
        self.initialized = False
        self.trace_id = (
            trace_id
            or f"mcp-discovery-{int(time.time() * 1000)}-{secrets.token_hex(6)}"
        )
        self.stderr_tail: list[str] = []

    def diagnostic_data(self, extra: dict[str, Any] | None = None) -> dict[str, Any]:
        stderr_tail = sanitize_diagnostic_text("\n".join(self.stderr_tail[-20:]))
        data = self.server.diagnostic_data({"stderrTail": stderr_tail})
        data.update(extra or {})
        return data

    def emit_diagnostic(
        self,
        *,
        stage: str,
        status: str,
        duration_ms: int | None = None,
        data: dict[str, Any] | None = None,
        error: Any = None,
    ) -> None:
        append_mcp_diagnostic_event(
            trace_id=self.trace_id,
            stage=stage,
            status=status,
            duration_ms=duration_ms,
            data=self.diagnostic_data(data),
            error=error,
        )

    async def ensure_started(self) -> None:
        if self.proc is not None:
            return
        started_at = time.monotonic()
        self.emit_diagnostic(
            stage="process_spawn",
            status="started",
            data={"phase": "spawn"},
        )
        try:
            command = resolve_mcp_command_for_spawn(self.server.command)
            self.proc = await asyncio.create_subprocess_exec(
                command,
                *self.server.args,
                cwd=self.server.cwd or os.getcwd(),
                env={**os.environ, **self.server.env},
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                limit=MCP_STDIO_STREAM_LIMIT_BYTES,
            )
        except Exception as exc:
            self.emit_diagnostic(
                stage="process_error",
                status="failed",
                duration_ms=int((time.monotonic() - started_at) * 1000),
                data={"phase": "spawn"},
                error=exc,
            )
            raise
        self.emit_diagnostic(
            stage="process_spawn",
            status="succeeded",
            duration_ms=int((time.monotonic() - started_at) * 1000),
            data={"phase": "spawn"},
        )
        asyncio.create_task(self._read_stdout())
        asyncio.create_task(self._read_stderr())

    def _fail_pending(self, error: Exception) -> None:
        for request_id, future in list(self.pending.items()):
            self.pending.pop(request_id, None)
            if not future.done():
                future.set_exception(error)

    async def _read_stdout(self) -> None:
        assert self.proc is not None
        assert self.proc.stdout is not None
        try:
            while True:
                line = await self.proc.stdout.readline()
                if not line:
                    break
                try:
                    message = json.loads(line.decode("utf-8"))
                except json.JSONDecodeError:
                    continue
                request_id = message.get("id") if isinstance(message, dict) else None
                if request_id not in self.pending:
                    continue
                future = self.pending.pop(request_id)
                if message.get("error"):
                    future.set_exception(
                        RuntimeError(
                            message["error"].get("message")
                            or json.dumps(message["error"])
                        )
                    )
                else:
                    future.set_result(message.get("result"))
        except Exception as exc:
            error = RuntimeError(f"MCP stdout reader failed for {self.server.id}: {exc}")
            self.emit_diagnostic(
                stage="stdout_reader_failed",
                status="failed",
                data={"phase": "stdio_read"},
                error=error,
            )
            self._fail_pending(error)

    async def _read_stderr(self) -> None:
        assert self.proc is not None
        assert self.proc.stderr is not None
        while True:
            line = await self.proc.stderr.readline()
            if not line:
                break
            text = sanitize_diagnostic_text(line.decode("utf-8", errors="replace"))
            if text:
                self.stderr_tail.append(text)
                self.stderr_tail = self.stderr_tail[-20:]

    async def request(self, method: str, params: dict[str, Any] | None = None) -> Any:
        await self.ensure_started()
        assert self.proc is not None
        assert self.proc.stdin is not None
        phase = (
            "initialize"
            if method == "initialize"
            else (
                "tools_list"
                if method == "tools/list"
                else ("tools_call" if method == "tools/call" else "request")
            )
        )
        emit_request_diagnostic = method != "tools/call"
        started_at = time.monotonic()
        if emit_request_diagnostic:
            self.emit_diagnostic(
                stage="request_start",
                status="started",
                data={"phase": phase},
            )
        request_id = self.next_request_id
        self.next_request_id += 1
        message = {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
            "params": params or {},
        }
        future: asyncio.Future[Any] = asyncio.get_running_loop().create_future()
        self.pending[request_id] = future
        try:
            self.proc.stdin.write((json.dumps(message) + "\n").encode("utf-8"))
            await self.proc.stdin.drain()
            result = await asyncio.wait_for(
                future, timeout=max(self.server.timeout_ms / 1000, 1)
            )
            if emit_request_diagnostic:
                self.emit_diagnostic(
                    stage="request_succeeded",
                    status="succeeded",
                    duration_ms=int((time.monotonic() - started_at) * 1000),
                    data={"phase": phase},
                )
            return result
        except asyncio.TimeoutError as exc:
            self.pending.pop(request_id, None)
            if emit_request_diagnostic:
                self.emit_diagnostic(
                    stage="request_timeout",
                    status="failed",
                    duration_ms=int((time.monotonic() - started_at) * 1000),
                    data={"phase": phase},
                    error=f"MCP {phase} timed out for {self.server.id}",
                )
            raise
        except Exception as exc:
            self.pending.pop(request_id, None)
            if emit_request_diagnostic:
                self.emit_diagnostic(
                    stage="request_failed",
                    status="failed",
                    duration_ms=int((time.monotonic() - started_at) * 1000),
                    data={"phase": phase},
                    error=exc,
                )
            raise

    async def notify(self, method: str, params: dict[str, Any] | None = None) -> None:
        await self.ensure_started()
        assert self.proc is not None
        assert self.proc.stdin is not None
        self.proc.stdin.write(
            (
                json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "method": method,
                        "params": params or {},
                    }
                )
                + "\n"
            ).encode("utf-8")
        )
        await self.proc.stdin.drain()

    async def initialize(self) -> None:
        if self.initialized:
            return
        await self.request(
            "initialize",
            {
                "protocolVersion": MCP_PROTOCOL_VERSION,
                "capabilities": {"roots": {"listChanged": False}, "sampling": {}},
                "clientInfo": {"name": "Desktop Agent sidecar", "version": "1"},
            },
        )
        await self.notify("notifications/initialized")
        self.initialized = True

    async def list_tools(self) -> list[dict[str, Any]]:
        await self.initialize()
        tools: list[dict[str, Any]] = []
        cursor: str | None = None
        while True:
            result = await self.request(
                "tools/list", {"cursor": cursor} if cursor else {}
            )
            tools.extend(
                tool for tool in result.get("tools", []) if isinstance(tool, dict)
            )
            cursor = normalize_string(result.get("nextCursor"))
            if not cursor:
                return tools

    async def call_tool(self, name: str, args: dict[str, Any]) -> dict[str, Any]:
        await self.initialize()
        result = await self.request(
            "tools/call",
            {"name": name, "arguments": normalize_object(args)},
        )
        return normalize_object(result)

    async def close(self) -> None:
        for future in self.pending.values():
            if not future.done():
                future.set_exception(RuntimeError("MCP server closed"))
        self.pending.clear()
        if self.proc and self.proc.returncode is None:
            self.emit_diagnostic(
                stage="process_shutdown",
                status="started",
                data={"phase": "shutdown"},
            )
            self.proc.terminate()
            try:
                await asyncio.wait_for(self.proc.wait(), timeout=2)
            except asyncio.TimeoutError:
                self.proc.kill()
            self.emit_diagnostic(
                stage="process_shutdown",
                status="succeeded",
                data={
                    "phase": "shutdown",
                    "exitCode": self.proc.returncode,
                },
            )
        self.proc = None
        self.initialized = False


class SidecarDaemon:
    def __init__(
        self, *, backend: LocalBackend | None = None, token: str | None = None
    ):
        self.backend = backend or LocalBackend()
        self.token = token or secrets.token_urlsafe(32)
        self.created_at = time.time()
        self.events: set[web.WebSocketResponse] = set()
        self.mcp_clients: dict[str, McpStdioClient] = {}
        self.mcp_specs: dict[str, McpServerSpec] = {}
        self.mcp_status_by_server_id: dict[str, dict[str, Any]] = {}
        self.shutdown_event: asyncio.Event | None = None
        if hasattr(self.backend, "set_event_sink"):
            self.backend.set_event_sink(self.emit_event)

    def bind_shutdown_event(self, shutdown_event: asyncio.Event) -> None:
        self.shutdown_event = shutdown_event

    def create_app(self) -> web.Application:
        app = web.Application(middlewares=[self._auth_middleware])
        app.add_routes(
            [
                web.get("/health", self.handle_health),
                web.get("/status", self.handle_status),
                web.post("/shutdown", self.handle_shutdown),
                web.get("/tools", self.handle_tools),
                web.post("/tools/register-module", self.handle_register_module),
                web.post("/plugins/register", self.handle_register_plugin),
                web.post("/mcps/register", self.handle_register_mcp),
                web.get("/permissions", self.handle_permissions),
                web.post("/permissions/request", self.handle_permissions_request),
                web.post("/execute-tool", self.handle_execute_tool),
                web.post("/rpc", self.handle_rpc),
                web.get("/events", self.handle_events),
            ]
        )
        return app

    @web.middleware
    async def _auth_middleware(
        self, request: web.Request, handler: Any
    ) -> web.StreamResponse:
        supplied = request.headers.get("x-windie-sidecar-token", "")
        auth_header = request.headers.get("authorization", "")
        if auth_header.lower().startswith("bearer "):
            supplied = auth_header[7:].strip()
        if supplied != self.token:
            return web.json_response({"error": "unauthorized"}, status=401)
        return await handler(request)

    async def emit_event(self, event: dict[str, Any]) -> None:
        dead: list[web.WebSocketResponse] = []
        for ws in self.events:
            try:
                await ws.send_json(event)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.events.discard(ws)

    async def build_status_payload(self) -> dict[str, Any]:
        status = await self.backend._handle_get_status()
        status.update(
            {
                "daemon": {
                    "status": "ok",
                    "pid": os.getpid(),
                    "created_at": self.created_at,
                    "mcp_servers": sorted(self.mcp_clients),
                }
            }
        )
        return status

    async def handle_health(self, request: web.Request) -> web.Response:
        return web.json_response(
            {
                "status": "ok",
                "service": "sidecar_daemon",
                "pid": os.getpid(),
                "created_at": self.created_at,
            }
        )

    async def handle_status(self, request: web.Request) -> web.Response:
        emit_sidecar_layer_log("[LocalRuntime]", "status requested")
        return web.json_response(await self.build_status_payload())

    async def handle_shutdown(self, request: web.Request) -> web.Response:
        await self.emit_event({"type": "shutdown-requested"})
        asyncio.create_task(self.shutdown_later())
        return web.json_response({"success": True})

    async def shutdown_later(self) -> None:
        await asyncio.sleep(0.05)
        if self.shutdown_event is not None:
            self.shutdown_event.set()

    async def handle_tools(self, request: web.Request) -> web.Response:
        return web.json_response(self.backend.tool_registry.get_tool_manifest())

    async def handle_register_module(self, request: web.Request) -> web.Response:
        payload = await request.json()
        tool = self.backend.tool_registry.register_module_tool(
            name=payload.get("name"),
            module=payload.get("module"),
            schema=payload.get("schema"),
            description=payload.get("description"),
            workspace_path=payload.get("workspace_path")
            or payload.get("workspacePath"),
        )
        await self.emit_event({"type": "tool-registered", "payload": tool})
        return web.json_response({"success": True, "tool": tool})

    async def handle_register_plugin(self, request: web.Request) -> web.Response:
        payload = await request.json()
        plugin_path = normalize_string(
            payload.get("path")
            or payload.get("plugin_path")
            or payload.get("pluginPath")
        )
        if not plugin_path:
            return web.json_response(
                {"success": False, "error": "plugin path is required"}, status=400
            )
        result = self.backend.tool_registry.register_plugin_tools(
            plugin_path=plugin_path
        )
        await self.emit_event({"type": "plugin-registered", "payload": result})
        return web.json_response({"success": True, **result})

    async def handle_register_mcp(self, request: web.Request) -> web.Response:
        payload = await request.json()
        servers = (
            payload.get("servers")
            if isinstance(payload.get("servers"), list)
            else [payload]
        )
        replace = payload.get("replace") is True or payload.get("reconcile") is True
        registration_trace_id = (
            f"mcp-registration-{int(time.time() * 1000)}-{secrets.token_hex(6)}"
        )
        registration_started_at = time.monotonic()
        registered_tools: list[dict[str, Any]] = []
        errors: list[dict[str, str]] = []
        statuses: list[dict[str, Any]] = []
        requested_server_ids: set[str] = set()
        append_mcp_diagnostic_event(
            trace_id=registration_trace_id,
            path=MCP_REGISTRATION_DIAGNOSTICS_PATH,
            stage="registration_requested",
            status="started",
            data={
                "phase": "registration",
                "replace": replace,
                "requestedServerCount": len(
                    [server for server in servers if isinstance(server, dict)]
                ),
            },
        )
        if replace:
            for raw_server in servers:
                if isinstance(raw_server, dict):
                    server_id = normalize_string(raw_server.get("id"))
                    if server_id:
                        requested_server_ids.add(server_id)
            append_mcp_diagnostic_event(
                trace_id=registration_trace_id,
                path=MCP_REGISTRATION_DIAGNOSTICS_PATH,
                stage="reconcile_start",
                status="started",
                data={
                    "phase": "reconcile",
                    "replace": replace,
                    "requestedServerCount": len(requested_server_ids),
                    "mcpServerCount": len(self.mcp_status_by_server_id),
                },
            )
            await self.reconcile_mcp_servers(requested_server_ids)
            append_mcp_diagnostic_event(
                trace_id=registration_trace_id,
                path=MCP_REGISTRATION_DIAGNOSTICS_PATH,
                stage="reconcile_succeeded",
                status="succeeded",
                data={
                    "phase": "reconcile",
                    "replace": replace,
                    "requestedServerCount": len(requested_server_ids),
                    "mcpServerCount": len(self.mcp_status_by_server_id),
                },
            )
        for raw_server in servers:
            if not isinstance(raw_server, dict):
                continue
            server_id = normalize_string(raw_server.get("id")) or "unknown"
            trace_id = f"mcp-discovery-{int(time.time() * 1000)}-{secrets.token_hex(6)}"
            started_at = time.monotonic()
            try:
                server = McpServerSpec.from_payload(raw_server)
                append_mcp_diagnostic_event(
                    trace_id=trace_id,
                    stage="server_discovery_start",
                    status="started",
                    data=server.diagnostic_data({"phase": "discovery"}),
                )
                server_tools = await self.register_mcp_server(
                    server,
                    trace_id=trace_id,
                )
                registered_tools.extend(server_tools)
                status = {
                    "server_id": server.id,
                    "state": "ready",
                    "tool_count": len(server_tools),
                }
                self.mcp_status_by_server_id[server.id] = status
                statuses.append(status)
                append_mcp_diagnostic_event(
                    trace_id=trace_id,
                    stage="server_discovery_succeeded",
                    status="succeeded",
                    duration_ms=int((time.monotonic() - started_at) * 1000),
                    data=server.diagnostic_data(
                        {
                            "phase": "discovery",
                            "elapsedMs": int((time.monotonic() - started_at) * 1000),
                            "toolCount": len(server_tools),
                        }
                    ),
                )
            except Exception as exc:
                error_reason = self.format_mcp_error_reason(server_id, exc)
                errors.append(
                    {
                        "server_id": server_id,
                        "reason": error_reason,
                    }
                )
                status = {
                    "server_id": server_id,
                    "state": "error",
                    "reason": error_reason,
                }
                self.mcp_status_by_server_id[server_id] = status
                statuses.append(status)
                append_mcp_diagnostic_event(
                    trace_id=trace_id,
                    stage="server_discovery_failed",
                    status="failed",
                    duration_ms=int((time.monotonic() - started_at) * 1000),
                    data={
                        "serverId": server_id,
                        "phase": "discovery",
                        "elapsedMs": int((time.monotonic() - started_at) * 1000),
                    },
                    error=error_reason,
                )
        result = {
            "registered_tools": registered_tools,
            "errors": errors,
            "statuses": statuses,
        }
        await self.emit_event({"type": "mcp-registered", "payload": result})
        append_mcp_diagnostic_event(
            trace_id=registration_trace_id,
            path=MCP_REGISTRATION_DIAGNOSTICS_PATH,
            stage="registration_completed",
            status="failed" if errors else "succeeded",
            duration_ms=int((time.monotonic() - registration_started_at) * 1000),
            data={
                "phase": "registration",
                "replace": replace,
                "requestedServerCount": len(
                    [server for server in servers if isinstance(server, dict)]
                ),
                "registeredServerCount": len(
                    {
                        normalize_string(status.get("server_id"))
                        for status in statuses
                        if normalize_string(status.get("server_id"))
                    }
                ),
                "registeredToolCount": len(registered_tools),
                "statusCount": len(statuses),
                "errorCount": len(errors),
                "mcpServerCount": len(self.mcp_status_by_server_id),
                "mcpToolCount": len(
                    [
                        tool
                        for tool in self.backend.tool_registry.get_tool_manifest().get(
                            "tools", []
                        )
                        if normalize_string(tool.get("mcp_server_id"))
                    ]
                ),
                "elapsedMs": int((time.monotonic() - registration_started_at) * 1000),
            },
            error=errors[0]["reason"] if errors else None,
        )
        return web.json_response(
            {"success": len(errors) == 0, **result}, status=207 if errors else 200
        )

    async def reconcile_mcp_servers(self, enabled_server_ids: set[str]) -> None:
        for server_id in list(self.mcp_status_by_server_id):
            if server_id not in enabled_server_ids:
                self.mcp_status_by_server_id.pop(server_id, None)
                self.mcp_specs.pop(server_id, None)
        for server_id in list(self.mcp_clients):
            if server_id in enabled_server_ids:
                continue
            client = self.mcp_clients.pop(server_id)
            await client.close()
            self.mcp_specs.pop(server_id, None)
            self.mcp_status_by_server_id.pop(server_id, None)
            self.backend.tool_registry.unregister_dynamic_tools_by_source(
                kind="mcp",
                server_id=server_id,
            )

    def format_mcp_error_reason(self, server_id: str, exc: Exception) -> str:
        message = str(exc)
        if isinstance(exc, asyncio.TimeoutError):
            message = f"MCP initialize timed out for {server_id}"
        return sanitize_diagnostic_text(message, max_length=500)

    async def register_mcp_server(
        self,
        server: McpServerSpec,
        *,
        trace_id: str | None = None,
    ) -> list[dict[str, Any]]:
        client = self.mcp_clients.get(server.id)
        existing_spec = self.mcp_specs.get(server.id)
        if (
            client is not None
            and existing_spec is not None
            and mcp_server_launch_key(existing_spec) != mcp_server_launch_key(server)
        ):
            await client.close()
            self.mcp_clients.pop(server.id, None)
            client = None
        if client is None:
            client = McpStdioClient(server, trace_id=trace_id)
            self.mcp_clients[server.id] = client
        else:
            client.server = server
            if trace_id:
                client.trace_id = trace_id
        self.mcp_specs[server.id] = server
        self.backend.tool_registry.unregister_dynamic_tools_by_source(
            kind="mcp",
            server_id=server.id,
        )
        discovered_tools = server.tools or await client.list_tools()
        registered: list[dict[str, Any]] = []
        for discovered_tool in discovered_tools:
            original_name = normalize_string(discovered_tool.get("name"))
            if not original_name:
                continue
            exposed_name = create_mcp_tool_name(
                server.id, original_name, server.tool_prefix
            )
            schema = normalize_object(
                discovered_tool.get("inputSchema")
                or discovered_tool.get("input_schema")
                or discovered_tool.get("schema")
            )
            if schema.get("type") != "object":
                schema = {
                    "type": "object",
                    "properties": {},
                    "additionalProperties": True,
                }

            async def _handler(
                args: dict[str, Any],
                *,
                tool_name: str = original_name,
                exposed_tool_name: str = exposed_name,
                mcp_server: McpServerSpec = server,
                mcp_client: McpStdioClient = client,
            ) -> dict[str, Any]:
                execution_context = CURRENT_MCP_EXECUTION_CONTEXT.get() or {
                    "trace_id": (
                        f"mcp-execution-{int(time.time() * 1000)}-"
                        f"{secrets.token_hex(6)}"
                    ),
                    "request_id": "",
                    "conversation_ref": "",
                    "data": {},
                }
                trace_id = normalize_string(execution_context.get("trace_id")) or (
                    f"mcp-execution-{int(time.time() * 1000)}-{secrets.token_hex(6)}"
                )
                request_id = normalize_string(execution_context.get("request_id"))
                conversation_ref = normalize_string(
                    execution_context.get("conversation_ref")
                )
                context_data = normalize_object(execution_context.get("data"))

                def diagnostic_data(
                    extra: dict[str, Any] | None = None,
                ) -> dict[str, Any]:
                    stderr_tail = ""
                    if hasattr(mcp_client, "stderr_tail"):
                        stderr_tail = sanitize_diagnostic_text(
                            "\n".join(getattr(mcp_client, "stderr_tail", [])[-20:])
                        )
                    data = {
                        "serverId": mcp_server.id,
                        "phase": "tools_call",
                        "exposedToolName": exposed_tool_name,
                        "mcpToolName": tool_name,
                        **context_data,
                    }
                    if stderr_tail:
                        data["stderrTail"] = stderr_tail
                    data.update(extra or {})
                    return data

                started_at = time.monotonic()
                emit_sidecar_layer_log(
                    "[MCP]",
                    f"tool_call_start server={mcp_server.id} tool={tool_name} exposed={exposed_tool_name}",
                )
                append_mcp_diagnostic_event(
                    trace_id=trace_id,
                    path=MCP_EXECUTION_DIAGNOSTICS_PATH,
                    stage="tool_call_start",
                    status="started",
                    request_id=request_id,
                    conversation_ref=conversation_ref,
                    data=diagnostic_data(),
                )
                try:
                    result = await mcp_client.call_tool(tool_name, args)
                except Exception as exc:
                    elapsed_ms = int((time.monotonic() - started_at) * 1000)
                    emit_sidecar_layer_log(
                        "[MCP]",
                        f"tool_call_failed server={mcp_server.id} tool={tool_name} elapsed_ms={elapsed_ms}",
                    )
                    append_mcp_diagnostic_event(
                        trace_id=trace_id,
                        path=MCP_EXECUTION_DIAGNOSTICS_PATH,
                        stage="tool_call_failed",
                        status="failed",
                        duration_ms=elapsed_ms,
                        request_id=request_id,
                        conversation_ref=conversation_ref,
                        data=diagnostic_data({"elapsedMs": elapsed_ms}),
                        error=exc,
                    )
                    raise
                elapsed_ms = int((time.monotonic() - started_at) * 1000)
                output = serialize_mcp_result_for_output(result)
                if result.get("isError"):
                    emit_sidecar_layer_log(
                        "[MCP]",
                        f"tool_call_failed server={mcp_server.id} tool={tool_name} elapsed_ms={elapsed_ms}",
                    )
                    append_mcp_diagnostic_event(
                        trace_id=trace_id,
                        path=MCP_EXECUTION_DIAGNOSTICS_PATH,
                        stage="tool_call_failed",
                        status="failed",
                        duration_ms=elapsed_ms,
                        request_id=request_id,
                        conversation_ref=conversation_ref,
                        data=diagnostic_data({"elapsedMs": elapsed_ms}),
                        error=f"MCP tool {tool_name} returned error",
                    )
                    return ToolResult.error_result(
                        output or f"MCP tool {tool_name} failed"
                    )
                append_mcp_diagnostic_event(
                    trace_id=trace_id,
                    path=MCP_EXECUTION_DIAGNOSTICS_PATH,
                    stage="tool_call_succeeded",
                    status="succeeded",
                    duration_ms=elapsed_ms,
                    request_id=request_id,
                    conversation_ref=conversation_ref,
                    data=diagnostic_data({"elapsedMs": elapsed_ms}),
                )
                emit_sidecar_layer_log(
                    "[MCP]",
                    f"tool_call_succeeded server={mcp_server.id} tool={tool_name} elapsed_ms={elapsed_ms}",
                )
                return ToolResult.success_result(build_mcp_tool_data(result))

            registered.append(
                self.backend.tool_registry.register_runtime_tool(
                    name=exposed_name,
                    handler=_handler,
                    schema=schema,
                    description=normalize_string(discovered_tool.get("description"))
                    or f"Tool {original_name} exposed by MCP server {server.name or server.id}.",
                    source={
                        "kind": "mcp",
                        "server_id": server.id,
                        "tool_name": original_name,
                        "extension_id": server.extension_id or f"mcp:{server.id}",
                    },
                )
            )
        return registered

    async def handle_permissions(self, request: web.Request) -> web.Response:
        return web.json_response({"permissions": [], "status": "delegate-to-electron"})

    async def handle_permissions_request(self, request: web.Request) -> web.Response:
        payload = await request.json()
        return web.json_response(
            {
                "success": False,
                "status": "requires_host_prompt",
                "permission": payload.get("permission"),
            },
            status=202,
        )

    async def handle_execute_tool(self, request: web.Request) -> web.Response:
        payload = await request.json()
        tool_name = normalize_string(payload.get("tool_name"))
        if not tool_name:
            return web.json_response(
                {"success": False, "error": "tool_name is required"}, status=400
            )
        args = normalize_object(payload.get("args"))
        try:
            execution_context = build_mcp_execution_context(normalize_object(payload))
        except ValueError as exc:
            return web.json_response(
                {"success": False, "error": str(exc)}, status=400
            )
        context_token = CURRENT_MCP_EXECUTION_CONTEXT.set(execution_context)
        try:
            result = await self.backend._handle_execute_tool(
                tool_name=tool_name,
                args=args,
            )
        finally:
            CURRENT_MCP_EXECUTION_CONTEXT.reset(context_token)
        log_prefix, log_message = build_tool_execution_layer_log(tool_name, args, result)
        emit_sidecar_layer_log(log_prefix, log_message)
        await self.emit_event(
            {
                "type": "tool-executed",
                "payload": {
                    "tool_name": tool_name,
                    "success": result.get("success"),
                },
            }
        )
        return web.json_response(result)

    async def handle_rpc(self, request: web.Request) -> web.Response:
        payload = await request.json()
        response = await self.backend.protocol.handle_request(payload)
        if response is None:
            return web.json_response({"success": True})
        return web.json_response(response)

    async def handle_events(self, request: web.Request) -> web.WebSocketResponse:
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        self.events.add(ws)
        await ws.send_json({"type": "ready", "payload": {"pid": os.getpid()}})
        async for message in ws:
            if message.type == web.WSMsgType.TEXT:
                await self.handle_event_control_message(ws, message.data)
            elif message.type == web.WSMsgType.ERROR:
                break
        self.events.discard(ws)
        return ws

    async def handle_event_control_message(self, ws: Any, raw_message: str) -> None:
        try:
            message = json.loads(raw_message)
        except json.JSONDecodeError:
            await ws.send_json({"type": "error", "error": "invalid_json"})
            return
        if not isinstance(message, dict):
            await ws.send_json({"type": "error", "error": "invalid_message"})
            return

        message_id = message.get("id")
        command = normalize_string(message.get("type") or message.get("command"))
        response: dict[str, Any]
        if command in {"ping", "control/ping"}:
            response = {"type": "pong", "payload": {"pid": os.getpid()}}
        elif command in {"status", "control/status"}:
            response = {"type": "status", "payload": await self.build_status_payload()}
        elif command in {"tools/list", "list-tools", "control/tools"}:
            response = {
                "type": "tools",
                "payload": self.backend.tool_registry.get_tool_manifest(),
            }
        else:
            response = {"type": "error", "error": "unknown_command", "command": command}
        if message_id is not None:
            response["id"] = message_id
        await ws.send_json(response)

    async def close(self) -> None:
        await self.close_local_runtime_resources()
        for client in self.mcp_clients.values():
            await client.close()
        await self.backend.shutdown()

    async def close_local_runtime_resources(self) -> None:
        try:
            from tools.browser.browser_use_engine import shutdown_browser_runtime

            result = await shutdown_browser_runtime()
        except Exception as exc:
            logger.warning("Failed to shut down browser runtime: %s", exc)
            return

        errors = result.get("errors") if isinstance(result, dict) else None
        if errors:
            logger.warning("Browser runtime shutdown completed with errors: %s", errors)


async def write_discovery_file(path: Path, *, host: str, port: int, token: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "pid": os.getpid(),
                "host": host,
                "port": port,
                "base_url": f"http://{host}:{port}",
                "token": token,
                "created_at": time.time(),
                "launch": build_launch_context(),
            },
            indent=2,
        ),
        encoding="utf-8",
    )


async def run_daemon(
    *,
    host: str = DEFAULT_HOST,
    port: int = 0,
    token: str | None = None,
    discovery_file: Path = DEFAULT_DISCOVERY_FILE,
) -> None:
    daemon = SidecarDaemon(token=token)
    await daemon.backend.initialize()
    shutdown_event = asyncio.Event()
    daemon.bind_shutdown_event(shutdown_event)
    app = daemon.create_app()
    app.on_cleanup.append(lambda _app: daemon.close())
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host, port)
    await site.start()
    sockets = list(site._server.sockets or []) if site._server else []
    actual_port = sockets[0].getsockname()[1] if sockets else port
    await write_discovery_file(
        discovery_file, host=host, port=actual_port, token=daemon.token
    )
    print(
        f"[SidecarDaemon] listening base_url=http://{host}:{actual_port} pid={os.getpid()}",
        file=sys.stderr,
        flush=True,
    )
    try:
        await shutdown_event.wait()
    finally:
        print(
            f"[SidecarDaemon] stopping pid={os.getpid()}",
            file=sys.stderr,
            flush=True,
        )
        await runner.cleanup()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the Python sidecar daemon.")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--token", default=None)
    parser.add_argument("--discovery-file", default=str(DEFAULT_DISCOVERY_FILE))
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    asyncio.run(
        run_daemon(
            host=args.host,
            port=args.port,
            token=args.token,
            discovery_file=Path(args.discovery_file).expanduser().resolve(),
        )
    )


if __name__ == "__main__":
    main()
