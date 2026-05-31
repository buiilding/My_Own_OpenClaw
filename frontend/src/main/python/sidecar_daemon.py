#!/usr/bin/env python3
"""Local sidecar daemon HTTP/WebSocket runtime."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import secrets
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from aiohttp import web

from local_backend import LocalBackend

DEFAULT_HOST = "127.0.0.1"
DEFAULT_DISCOVERY_FILE = (
    Path(tempfile.gettempdir()) / "windieos" / "sidecar-daemon.json"
)
MCP_PROTOCOL_VERSION = "2024-11-05"


def normalize_object(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def normalize_string(value: Any) -> str:
    return value.strip() if isinstance(value, str) and value.strip() else ""


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


def format_mcp_content(content: Any) -> str:
    if not isinstance(content, list):
        return ""
    chunks: list[str] = []
    for item in content:
        if not isinstance(item, dict):
            continue
        if item.get("type") == "text" and isinstance(item.get("text"), str):
            chunks.append(item["text"])
        elif item.get("type") == "resource":
            chunks.append(json.dumps(item.get("resource"), separators=(",", ":")))
        else:
            chunks.append(json.dumps(item, separators=(",", ":")))
    return "\n\n".join(chunk for chunk in chunks if chunk)


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

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "McpServerSpec":
        server_id = normalize_string(payload.get("id") or payload.get("name"))
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
            timeout_ms=int(
                payload.get("timeout_ms") or payload.get("timeoutMs") or 15000
            ),
            tool_prefix=normalize_string(
                payload.get("tool_prefix") or payload.get("toolPrefix")
            )
            or None,
            tools=(
                [tool for tool in payload.get("tools", []) if isinstance(tool, dict)]
                if isinstance(payload.get("tools"), list)
                else []
            ),
        )


class McpStdioClient:
    def __init__(self, server: McpServerSpec):
        self.server = server
        self.proc: asyncio.subprocess.Process | None = None
        self.pending: dict[int, asyncio.Future[Any]] = {}
        self.next_request_id = 1
        self.initialized = False

    async def ensure_started(self) -> None:
        if self.proc is not None:
            return
        self.proc = await asyncio.create_subprocess_exec(
            self.server.command,
            *self.server.args,
            cwd=self.server.cwd or os.getcwd(),
            env={**os.environ, **self.server.env},
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        asyncio.create_task(self._read_stdout())

    async def _read_stdout(self) -> None:
        assert self.proc is not None
        assert self.proc.stdout is not None
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
                        message["error"].get("message") or json.dumps(message["error"])
                    )
                )
            else:
                future.set_result(message.get("result"))

    async def request(self, method: str, params: dict[str, Any] | None = None) -> Any:
        await self.ensure_started()
        assert self.proc is not None
        assert self.proc.stdin is not None
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
        self.proc.stdin.write((json.dumps(message) + "\n").encode("utf-8"))
        await self.proc.stdin.drain()
        return await asyncio.wait_for(
            future, timeout=max(self.server.timeout_ms / 1000, 1)
        )

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
                "clientInfo": {"name": "WindieOS sidecar", "version": "1"},
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
            self.proc.terminate()
            try:
                await asyncio.wait_for(self.proc.wait(), timeout=2)
            except asyncio.TimeoutError:
                self.proc.kill()
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
                "service": "windie_sidecar_daemon",
                "pid": os.getpid(),
                "created_at": self.created_at,
            }
        )

    async def handle_status(self, request: web.Request) -> web.Response:
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
        registered_tools: list[dict[str, Any]] = []
        errors: list[dict[str, str]] = []
        for raw_server in servers:
            if not isinstance(raw_server, dict):
                continue
            try:
                registered_tools.extend(
                    await self.register_mcp_server(
                        McpServerSpec.from_payload(raw_server)
                    )
                )
            except Exception as exc:
                errors.append(
                    {
                        "server_id": normalize_string(
                            raw_server.get("id") or raw_server.get("name")
                        )
                        or "unknown",
                        "reason": str(exc),
                    }
                )
        result = {"registered_tools": registered_tools, "errors": errors}
        await self.emit_event({"type": "mcp-registered", "payload": result})
        return web.json_response(
            {"success": len(errors) == 0, **result}, status=207 if errors else 200
        )

    async def register_mcp_server(self, server: McpServerSpec) -> list[dict[str, Any]]:
        client = self.mcp_clients.get(server.id)
        if client is None:
            client = McpStdioClient(server)
            self.mcp_clients[server.id] = client
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
                mcp_client: McpStdioClient = client,
            ) -> dict[str, Any]:
                result = await mcp_client.call_tool(tool_name, args)
                text = format_mcp_content(result.get("content"))
                if result.get("isError"):
                    return {
                        "success": False,
                        "error": text or f"MCP tool {tool_name} failed",
                    }
                return {
                    "success": True,
                    "data": {
                        "output": text
                        or json.dumps(result, separators=(",", ":")),
                        "mcp_result": result,
                    },
                }

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
        result = await self.backend._handle_execute_tool(
            tool_name=payload.get("tool_name") or payload.get("toolName"),
            args=normalize_object(payload.get("args")),
        )
        await self.emit_event(
            {
                "type": "tool-executed",
                "payload": {
                    "tool_name": payload.get("tool_name") or payload.get("toolName"),
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
        for client in self.mcp_clients.values():
            await client.close()
        await self.backend.shutdown()


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
    try:
        await shutdown_event.wait()
    finally:
        await runner.cleanup()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the WindieOS sidecar daemon.")
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
