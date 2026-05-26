"""
Transport-only Python client for the hosted Windie SDK surface.
"""

from __future__ import annotations

import asyncio
import json
import os
import platform
import tempfile
import time
from pathlib import Path
from typing import Any, AsyncIterator, Optional
from urllib.parse import quote, urlencode, urlparse, urlunparse
from uuid import uuid4

import aiohttp

from windie._auth import get_authenticated_user_id
from windie._remote_api_client_base import RemoteApiClientBase
from windie._unicode_sanitizer import sanitize_surrogates

DEFAULT_SIDECAR_DISCOVERY_FILE = (
    Path(tempfile.gettempdir()) / "windieos" / "sidecar-daemon.json"
)
DEFAULT_SIDECAR_START_TIMEOUT_SECONDS = 10.0
DEFAULT_SIDECAR_POLL_INTERVAL_SECONDS = 0.1


def _build_error_message(status: int, body_text: str) -> str:
    message = (body_text or "").strip()
    if not message:
        return f"SDK API returned {status}"
    return f"SDK API returned {status}: {message}"


def _build_query_string(params: dict[str, Any]) -> str:
    filtered = {
        key: value
        for key, value in params.items()
        if isinstance(value, str) and value.strip()
    }
    if not filtered:
        return ""
    return f"?{urlencode(filtered)}"


def _derive_ws_url(http_url: str) -> str:
    parsed = urlparse(http_url.rstrip("/"))
    scheme = "wss" if parsed.scheme == "https" else "ws"
    return urlunparse(
        (
            scheme,
            parsed.netloc,
            f"{parsed.path.rstrip('/')}/ws",
            "",
            "",
            "",
        )
    )


def _detect_operating_system() -> str:
    system = platform.system().strip()
    if system == "Darwin":
        return "macOS"
    return system or "unknown"


def _clean_string(value: Optional[str]) -> Optional[str]:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


_BACKEND_UPDATE_SETTINGS_KEYS = {
    "model_mode",
    "model_provider",
    "selected_model_id",
    "interaction_mode",
    "speech_mode_enabled",
    "wakeword_enabled",
    "wakeword_stt_enabled",
    "agent_full_sudo_enabled",
    "browser_automation_enabled",
    "include_query_screenshot",
    "provider_api_keys",
    "provider_oauth",
}

_PROVIDER_API_KEY_KEYS = {
    "openai",
    "anthropic",
    "google",
    "openrouter",
    "mistral",
    "kimi_coding",
}

_PROVIDER_API_KEY_ENTRY_KEYS = {"enabled", "api_key"}
_PROVIDER_OAUTH_KEYS = {"openai_codex"}
_PROVIDER_OAUTH_ENTRY_KEYS = {
    "connected",
    "access_token",
    "refresh_token",
    "expires_at",
    "profile_id",
}

_CAPTURE_META_REQUIRED_NUMBER_KEYS = {
    "source_w",
    "source_h",
    "crop_x",
    "crop_y",
    "crop_w",
    "crop_h",
    "timestamp",
}

_CAPTURE_META_KEYS = _CAPTURE_META_REQUIRED_NUMBER_KEYS | {
    "desktop_virtual_bounds",
    "monitor_id",
    "capture_backend",
}

_CAPTURE_BOUNDS_KEYS = {"x", "y", "width", "height"}


def _filter_keys(payload: Any, allowed_keys: set[str]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {}
    return {
        key: payload[key]
        for key in allowed_keys
        if key in payload and payload[key] is not None
    }


def _filter_nested_map(
    payload: Any,
    allowed_map_keys: set[str],
    allowed_entry_keys: set[str],
) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {}
    filtered: dict[str, Any] = {}
    for key in allowed_map_keys:
        entry = _filter_keys(payload.get(key), allowed_entry_keys)
        if entry:
            filtered[key] = entry
    return filtered


def _normalize_backend_settings_payload(config: dict[str, Any]) -> dict[str, Any]:
    payload = _filter_keys(config, _BACKEND_UPDATE_SETTINGS_KEYS)
    provider_api_keys = _filter_nested_map(
        payload.get("provider_api_keys"),
        _PROVIDER_API_KEY_KEYS,
        _PROVIDER_API_KEY_ENTRY_KEYS,
    )
    if provider_api_keys:
        payload["provider_api_keys"] = provider_api_keys
    else:
        payload.pop("provider_api_keys", None)
    provider_oauth = _filter_nested_map(
        payload.get("provider_oauth"),
        _PROVIDER_OAUTH_KEYS,
        _PROVIDER_OAUTH_ENTRY_KEYS,
    )
    if provider_oauth:
        payload["provider_oauth"] = provider_oauth
    else:
        payload.pop("provider_oauth", None)
    return payload


def _normalize_capture_bounds(value: Any) -> Optional[dict[str, Any]]:
    bounds = _filter_keys(value, _CAPTURE_BOUNDS_KEYS)
    if not all(
        isinstance(bounds.get(key), (int, float)) for key in _CAPTURE_BOUNDS_KEYS
    ):
        return None
    return bounds


def _normalize_capture_meta(value: Any) -> Optional[dict[str, Any]]:
    capture_meta = _filter_keys(value, _CAPTURE_META_KEYS)
    if not all(
        isinstance(capture_meta.get(key), (int, float))
        for key in _CAPTURE_META_REQUIRED_NUMBER_KEYS
    ):
        return None
    if "desktop_virtual_bounds" in capture_meta:
        bounds = _normalize_capture_bounds(capture_meta["desktop_virtual_bounds"])
        if bounds:
            capture_meta["desktop_virtual_bounds"] = bounds
        else:
            capture_meta.pop("desktop_virtual_bounds", None)
    return capture_meta


def _normalize_backend_tool_result_data(data: dict[str, Any]) -> dict[str, Any]:
    payload = dict(data)
    if "capture_meta" in payload:
        capture_meta = _normalize_capture_meta(payload["capture_meta"])
        if capture_meta:
            payload["capture_meta"] = capture_meta
        else:
            payload.pop("capture_meta", None)
    return payload


def _filter_image_source(value: Any) -> dict[str, Any]:
    return _filter_keys(value, {"artifact_id", "image_base64"})


def _filter_bounding_box(value: Any) -> dict[str, Any]:
    return _filter_keys(value, {"x", "y", "width", "height"})


def _filter_overlay_point(value: Any) -> dict[str, Any]:
    return _filter_keys(value, {"x", "y", "label", "color"})


def _filter_overlay_region(value: Any) -> dict[str, Any]:
    return _filter_keys(value, {"x", "y", "width", "height", "label", "color"})


def _filter_prompt_contribution(value: Any) -> dict[str, Any]:
    return _filter_keys(value, {"id", "type", "priority", "content", "source_path"})


def _filter_prompt_contributions(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [_filter_prompt_contribution(item) for item in value]


def _filter_agent_definition(value: Any) -> Optional[dict[str, Any]]:
    if not isinstance(value, dict):
        return None
    filtered = _filter_keys(
        value,
        {
            "version",
            "id",
            "name",
            "mode",
            "system_prompt",
            "tools",
            "prompt_layers",
            "skills",
            "agents_md",
            "plugins",
            "runtime",
            "metadata",
        },
    )
    if "system_prompt" in filtered:
        filtered["system_prompt"] = _filter_keys(
            filtered["system_prompt"], {"mode", "content"}
        )
    if "tools" in filtered:
        filtered["tools"] = _filter_keys(
            filtered["tools"],
            {
                "mode",
                "client_manifest",
                "available_tools",
                "enabled_remote_tools",
                "disabled_tools",
                "disabled_capabilities",
            },
        )
    if "runtime" in filtered:
        filtered["runtime"] = _filter_keys(
            filtered["runtime"],
            {"operating_system", "workspace_path", "coordinate_methods"},
        )
    for key in ("prompt_layers", "skills", "agents_md"):
        if key in filtered:
            filtered[key] = _filter_prompt_contributions(filtered[key])
    if isinstance(filtered.get("plugins"), list):
        plugins: list[dict[str, Any]] = []
        for plugin in filtered["plugins"]:
            next_plugin = _filter_keys(
                plugin, {"id", "name", "version", "prompt_layers", "metadata"}
            )
            if "prompt_layers" in next_plugin:
                next_plugin["prompt_layers"] = _filter_prompt_contributions(
                    next_plugin["prompt_layers"]
                )
            plugins.append(next_plugin)
        filtered["plugins"] = plugins
    return filtered


def _filter_prompt_debug_payload(
    payload: Any, *, include_conversation_ref: bool
) -> dict[str, Any]:
    allowed_keys = {
        "user_id",
        "model_id",
        "model_provider",
        "interaction_mode",
        "include_tools",
        "workspace_path",
        "agent_definition",
        "user_query_raw",
        "messages",
    }
    if include_conversation_ref:
        allowed_keys.add("conversation_ref")
    filtered = _filter_keys(payload, allowed_keys)
    if "agent_definition" in filtered:
        agent_definition = _filter_agent_definition(filtered["agent_definition"])
        if agent_definition is not None:
            filtered["agent_definition"] = agent_definition
        else:
            filtered.pop("agent_definition", None)
    return filtered


def _filter_sdk_http_payload(path: str, payload: Any) -> Any:
    def with_image(allowed_keys: set[str]) -> dict[str, Any]:
        filtered = _filter_keys(payload, allowed_keys)
        if "image" in filtered:
            filtered["image"] = _filter_image_source(filtered["image"])
        return filtered

    if path.startswith("/api/sdk/ocr/"):
        if path == "/api/sdk/ocr/run":
            return with_image({"image"})
        if path == "/api/sdk/ocr/resolve-candidate":
            return with_image({"image", "candidate_id"})
        if path == "/api/sdk/ocr/overlay":
            return with_image(
                {
                    "image",
                    "text",
                    "candidate_id",
                    "threshold",
                    "max_results",
                    "show_labels",
                }
            )
        if path == "/api/sdk/ocr/inspect":
            return with_image(
                {
                    "image",
                    "text",
                    "threshold",
                    "max_results",
                    "include_overlay",
                    "show_labels",
                }
            )
        return with_image({"image", "text", "threshold", "max_results"})
    if path == "/api/sdk/vision/locate":
        return with_image({"image", "description"})
    if path == "/api/sdk/vision/locate-all":
        return with_image({"image", "description", "max_results"})
    if path == "/api/sdk/vision/describe":
        filtered = with_image({"image", "region"})
        if "region" in filtered:
            filtered["region"] = _filter_bounding_box(filtered["region"])
        return filtered
    if path == "/api/sdk/vision/overlay":
        filtered = with_image({"image", "result", "show_labels"})
        result = _filter_keys(filtered.get("result"), {"image", "points", "regions"})
        if "image" in result:
            result["image"] = _filter_keys(
                result["image"],
                {"source_id", "artifact_id", "content_type", "width", "height"},
            )
        if isinstance(result.get("points"), list):
            result["points"] = [
                _filter_overlay_point(item) for item in result["points"]
            ]
        if isinstance(result.get("regions"), list):
            result["regions"] = [
                _filter_overlay_region(item) for item in result["regions"]
            ]
        filtered["result"] = result
        return filtered
    if path == "/api/sdk/prompt-preview":
        return _filter_prompt_debug_payload(payload, include_conversation_ref=False)
    if path == "/api/sdk/query-plan":
        return _filter_prompt_debug_payload(payload, include_conversation_ref=True)
    if path == "/api/semantic/title":
        return _filter_keys(
            payload,
            {
                "user_id",
                "user_message",
                "assistant_message",
                "model_id",
                "model_provider",
            },
        )
    return payload


def _build_manifest_tool(tool: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": tool.get("name"),
        "description": tool.get("description"),
        "execution_target": tool.get("execution_target") or "sidecar",
        "argument_resolution": tool.get("argument_resolution") or "passthrough",
        "schema": tool.get("schema")
        or {
            "type": "object",
            "properties": {},
            "additionalProperties": True,
        },
    }


def _build_python_wake_up_agent_definition(
    *,
    agent_id: Optional[str] = None,
    name: Optional[str] = None,
    system_prompt: Optional[str] = None,
    workspace_path: Optional[str] = None,
    skills: Optional[list[dict[str, Any]]] = None,
    agents_md: Optional[list[dict[str, Any]]] = None,
    tools: Optional[list[dict[str, Any]]] = None,
    mcps: Optional[list[dict[str, Any]]] = None,
    plugins: Optional[list[dict[str, Any]]] = None,
) -> dict[str, Any]:
    definition: dict[str, Any] = {
        "version": 1,
        "id": _clean_string(agent_id) or f"windie-python-agent-{uuid4().hex}",
        "name": _clean_string(name) or "Windie Python Agent",
    }
    prompt = _clean_string(system_prompt)
    if prompt:
        definition["system_prompt"] = {"mode": "replace", "content": prompt}
    if skills:
        definition["skills"] = skills
    if agents_md:
        definition["agents_md"] = agents_md
    if tools:
        definition["tools"] = {
            "mode": "default_plus_client",
            "client_manifest": {
                "version": 1,
                "tools": tools,
            },
        }
    if mcps:
        definition["mcps"] = mcps
    if plugins:
        definition["plugins"] = plugins
    runtime: dict[str, Any] = {"operating_system": _detect_operating_system()}
    workspace = _clean_string(workspace_path)
    if workspace:
        runtime["workspace_path"] = workspace
    definition["runtime"] = runtime
    return definition


def _normalize_tool_result_data(data: Any) -> dict[str, Any]:
    if isinstance(data, dict):
        normalized_data = _normalize_backend_tool_result_data(data)
        if isinstance(data.get("llm_content"), str) and data["llm_content"].strip():
            return normalized_data
        fallback_content = (
            data.get("output")
            if isinstance(data.get("output"), str)
            else json.dumps(data, separators=(",", ":"))
        )
        return {**normalized_data, "llm_content": fallback_content}
    if isinstance(data, str):
        return {"output": data, "llm_content": data}
    if data is None:
        return {}
    return {"output": data}


def _build_tool_result_payload(
    request_id: str, result: dict[str, Any]
) -> dict[str, Any]:
    success = result.get("success") is not False
    error = result.get("error") or "Tool execution failed"
    return {
        "request_id": request_id,
        "success": success,
        "data": (
            _normalize_tool_result_data(result.get("data"))
            if success
            else _normalize_tool_result_data(result.get("data") or {"output": error})
        ),
        "error": None if success else error,
    }


class SidecarDaemonHttpClient:
    def __init__(
        self,
        *,
        base_url: str,
        token: str,
        timeout_seconds: int = 60,
        aiohttp_module: Any = aiohttp,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout_seconds = timeout_seconds
        self._aiohttp = aiohttp_module
        self._session: Any = None

    async def initialize(self) -> None:
        if self._session is None:
            self._session = self._aiohttp.ClientSession()

    async def close(self) -> None:
        if self._session is not None:
            await self._session.close()
            self._session = None

    def _headers(self) -> dict[str, str]:
        return {"x-windie-sidecar-token": self.token}

    async def _request_json(
        self,
        *,
        method: str,
        path: str,
        payload: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        await self.initialize()
        request_timeout = self._aiohttp.ClientTimeout(total=self.timeout_seconds)
        request_url = f"{self.base_url}{path}"
        if method == "get":
            request_context = self._session.get(
                request_url,
                headers=self._headers(),
                timeout=request_timeout,
            )
        elif method == "post":
            request_context = self._session.post(
                request_url,
                json=sanitize_surrogates(payload or {}),
                headers=self._headers(),
                timeout=request_timeout,
            )
        else:
            raise ValueError(f"Unsupported sidecar method: {method}")
        async with request_context as response:
            if response.status < 200 or response.status >= 300:
                error_text = await response.text()
                raise Exception(
                    f"Sidecar daemon returned {response.status}: {error_text}"
                )
            data = await response.json()
            if not isinstance(data, dict):
                raise Exception("Sidecar daemon returned a non-object JSON payload")
            return data

    async def status(self) -> dict[str, Any]:
        return await self._request_json(method="get", path="/status")

    async def list_tools(self) -> dict[str, Any]:
        return await self._request_json(method="get", path="/tools")

    async def register_module_tool(
        self,
        tool: dict[str, Any],
        *,
        workspace_path: Optional[str] = None,
    ) -> dict[str, Any]:
        payload = {**tool}
        if workspace_path:
            payload["workspace_path"] = workspace_path
        return await self._request_json(
            method="post",
            path="/tools/register-module",
            payload=payload,
        )

    async def register_plugin(self, plugin: dict[str, Any]) -> dict[str, Any]:
        return await self._request_json(
            method="post",
            path="/plugins/register",
            payload=plugin,
        )

    async def register_mcp(self, mcp: dict[str, Any]) -> dict[str, Any]:
        return await self._request_json(
            method="post", path="/mcps/register", payload=mcp
        )

    async def execute_tool(
        self,
        *,
        tool_name: str,
        args: dict[str, Any],
        request_id: Optional[str] = None,
        tool_call_id: Optional[str] = None,
        correlation_id: Optional[str] = None,
        bundle_id: Optional[str] = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"tool_name": tool_name, "args": args}
        if request_id:
            payload["request_id"] = request_id
        if tool_call_id:
            payload["tool_call_id"] = tool_call_id
        if correlation_id:
            payload["correlation_id"] = correlation_id
        if bundle_id:
            payload["bundle_id"] = bundle_id
        return await self._request_json(
            method="post",
            path="/execute-tool",
            payload=payload,
        )

    async def shutdown(self) -> None:
        await self._request_json(method="post", path="/shutdown", payload={})


def _normalize_discovery(raw: Any) -> Optional[dict[str, str]]:
    if not isinstance(raw, dict):
        return None
    base_url = _clean_string(raw.get("base_url")) or _clean_string(raw.get("baseUrl"))
    token = _clean_string(raw.get("token"))
    if not base_url or not token:
        return None
    return {"base_url": base_url, "token": token}


def _read_daemon_discovery(path: Path) -> Optional[dict[str, str]]:
    try:
        if not path.exists():
            return None
        return _normalize_discovery(json.loads(path.read_text(encoding="utf-8")))
    except Exception:
        return None


def _resolve_daemon_script(explicit: Optional[str] = None) -> Path:
    if _clean_string(explicit):
        return Path(str(explicit)).expanduser().resolve()
    env_value = _clean_string(os.environ.get("WINDIE_SIDECAR_DAEMON_SCRIPT"))
    if env_value:
        return Path(env_value).expanduser().resolve()
    return Path(__file__).resolve().parents[1] / "sidecar_daemon.py"


class WindieSdkAgentSession:
    """Minimal websocket session wrapper for the backend `/ws` channel."""

    def __init__(
        self,
        *,
        websocket: Any,
        user_id: str,
        operating_system: Optional[str] = None,
        agent_definition: Optional[dict[str, Any]] = None,
        local_runtime: Any = None,
    ) -> None:
        self._websocket = websocket
        self.user_id = user_id
        self.operating_system = operating_system
        self.agent_definition = agent_definition
        self.local_runtime = local_runtime
        agent_id = (
            agent_definition.get("id") if isinstance(agent_definition, dict) else None
        )
        self.default_conversation_ref = (
            f"conv-{agent_id}"
            if isinstance(agent_id, str) and agent_id
            else "conv-windie-python-agent"
        )

    async def initialize(self) -> None:
        payload = {
            "type": "handshake",
            "user_id": self.user_id,
            "operating_system": self.operating_system,
        }
        if isinstance(self.agent_definition, dict) and self.agent_definition:
            payload["agent_definition"] = sanitize_surrogates(self.agent_definition)
        await self._send_json(payload)

    async def query(
        self,
        *,
        text: str,
        conversation_ref: str,
        content: Optional[str] = None,
        screenshot: Optional[str] = None,
        screenshot_ref: Optional[str] = None,
        screenshot_refs: Optional[list[str]] = None,
        attachment_context: Optional[str] = None,
        attachment_filenames: Optional[list[str]] = None,
        system_state_internal: Optional[dict[str, Any]] = None,
        workspace_path: Optional[str] = None,
        agent_definition: Optional[dict[str, Any]] = None,
    ) -> str:
        message_id = f"msg_{uuid4().hex}"
        payload: dict[str, Any] = {
            "text": text,
            "conversation_ref": conversation_ref,
        }
        if isinstance(content, str) and content.strip():
            payload["content"] = content
        if isinstance(screenshot, str) and screenshot.strip():
            payload["screenshot"] = screenshot
        if isinstance(screenshot_ref, str) and screenshot_ref.strip():
            payload["screenshot_ref"] = screenshot_ref
        if screenshot_refs:
            payload["screenshot_refs"] = [
                value
                for value in screenshot_refs
                if isinstance(value, str) and value.strip()
            ]
        if isinstance(attachment_context, str) and attachment_context.strip():
            payload["query_context"] = {
                "memory_retrieval_enabled": True,
                "attachment_context": attachment_context.strip(),
            }
        if isinstance(system_state_internal, dict) and system_state_internal:
            payload["system_state_internal"] = system_state_internal
        if isinstance(workspace_path, str) and workspace_path.strip():
            payload["workspace_path"] = workspace_path
        if isinstance(agent_definition, dict) and agent_definition:
            payload["agent_definition"] = sanitize_surrogates(agent_definition)

        await self._send_json(
            {
                "id": message_id,
                "type": "query",
                "payload": payload,
            }
        )
        return message_id

    async def run(
        self,
        text: str,
        *,
        conversation_ref: Optional[str] = None,
        content: Optional[str] = None,
        screenshot: Optional[str] = None,
        screenshot_ref: Optional[str] = None,
        screenshot_refs: Optional[list[str]] = None,
        attachment_context: Optional[str] = None,
        attachment_filenames: Optional[list[str]] = None,
        system_state_internal: Optional[dict[str, Any]] = None,
        workspace_path: Optional[str] = None,
        agent_definition: Optional[dict[str, Any]] = None,
    ) -> str:
        final_response = ""
        async for event in self.stream(
            text,
            conversation_ref=conversation_ref,
            content=content,
            screenshot=screenshot,
            screenshot_ref=screenshot_ref,
            screenshot_refs=screenshot_refs,
            attachment_context=attachment_context,
            attachment_filenames=attachment_filenames,
            system_state_internal=system_state_internal,
            workspace_path=workspace_path,
            agent_definition=agent_definition,
        ):
            if event["type"] == "complete":
                final_response = str(event.get("final_response") or "")
            elif event["type"] == "error":
                raise Exception(str(event.get("message") or "Windie SDK stream failed"))
        return final_response

    async def stream(
        self,
        text: str,
        *,
        conversation_ref: Optional[str] = None,
        content: Optional[str] = None,
        screenshot: Optional[str] = None,
        screenshot_ref: Optional[str] = None,
        screenshot_refs: Optional[list[str]] = None,
        attachment_context: Optional[str] = None,
        attachment_filenames: Optional[list[str]] = None,
        system_state_internal: Optional[dict[str, Any]] = None,
        workspace_path: Optional[str] = None,
        agent_definition: Optional[dict[str, Any]] = None,
    ) -> AsyncIterator[dict[str, Any]]:
        effective_conversation_ref = (
            conversation_ref
            if isinstance(conversation_ref, str) and conversation_ref.strip()
            else self.default_conversation_ref
        )
        query_message_id = await self.query(
            text=text,
            conversation_ref=effective_conversation_ref,
            content=content,
            screenshot=screenshot,
            screenshot_ref=screenshot_ref,
            screenshot_refs=screenshot_refs,
            attachment_context=attachment_context,
            attachment_filenames=attachment_filenames,
            system_state_internal=system_state_internal,
            workspace_path=workspace_path,
            agent_definition=agent_definition,
        )
        yield {
            "type": "start",
            "query_message_id": query_message_id,
            "conversation_ref": effective_conversation_ref,
        }
        while True:
            raw_event = await self.receive_json()
            event_type = raw_event.get("type")
            payload = (
                raw_event.get("payload")
                if isinstance(raw_event.get("payload"), dict)
                else {}
            )
            if event_type == "streaming-response":
                yield {
                    "type": "text",
                    "text": str(payload.get("text") or ""),
                    "event": raw_event,
                }
                continue
            if event_type == "tool-call":
                yield {
                    "type": "tool_call",
                    "tool_name": payload.get("tool_name") or payload.get("toolName"),
                    "event": raw_event,
                }
                continue
            if event_type == "tool-output":
                yield {
                    "type": "tool_output",
                    "tool_name": payload.get("tool_name") or payload.get("toolName"),
                    "event": raw_event,
                }
                continue
            if event_type == "streaming-complete":
                yield {
                    "type": "complete",
                    "final_response": payload.get("final_response"),
                    "event": raw_event,
                }
                return
            if event_type == "error":
                yield {
                    "type": "error",
                    "message": payload.get("message") or payload.get("content"),
                    "event": raw_event,
                }
                return
            yield {
                "type": "event",
                "event": raw_event,
            }

    async def stop_query(self, conversation_ref: Optional[str] = None) -> str:
        message_id = f"msg_{uuid4().hex}"
        await self._send_json(
            {
                "id": message_id,
                "type": "stop-query",
                "payload": {
                    "conversation_ref": conversation_ref,
                },
            }
        )
        return message_id

    async def update_settings(self, config: dict[str, Any]) -> str:
        message_id = f"msg_{uuid4().hex}"
        await self._send_json(
            {
                "id": message_id,
                "type": "update-settings",
                "payload": sanitize_surrogates(
                    _normalize_backend_settings_payload(config)
                ),
            }
        )
        return message_id

    async def list_models(self) -> str:
        message_id = f"msg_{uuid4().hex}"
        await self._send_json(
            {
                "id": message_id,
                "type": "list-models",
                "payload": {},
            }
        )
        return message_id

    async def receive_json(self) -> dict[str, Any]:
        message = await self._websocket.receive()
        data = getattr(message, "data", message)
        if isinstance(data, bytes):
            data = data.decode("utf-8")
        if isinstance(data, str):
            parsed = json.loads(data)
            if isinstance(parsed, dict):
                await self._maybe_execute_local_tool(parsed)
            return parsed
        if isinstance(data, dict):
            await self._maybe_execute_local_tool(data)
            return data
        raise Exception("Unexpected websocket message payload")

    async def close(self) -> None:
        await self._websocket.close()

    async def _send_json(self, payload: dict[str, Any]) -> None:
        sanitized = sanitize_surrogates(payload)
        send_json = getattr(self._websocket, "send_json", None)
        if callable(send_json):
            await send_json(sanitized)
            return
        send_str = getattr(self._websocket, "send_str", None)
        if callable(send_str):
            await send_str(json.dumps(sanitized))
            return
        raise Exception("Websocket implementation does not support JSON sending")

    async def _maybe_execute_local_tool(self, event: dict[str, Any]) -> None:
        if self.local_runtime is None:
            return
        event_type = event.get("type")
        if event_type == "tool-call":
            await self._execute_local_tool_call(event)
        elif event_type == "tool-bundle":
            await self._execute_local_tool_bundle(event)

    async def _execute_local_tool_call(self, event: dict[str, Any]) -> None:
        payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
        metadata = (
            payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
        )
        if metadata.get("skip_frontend_execution") is True:
            return
        tool_name = _clean_string(payload.get("tool_name")) or _clean_string(
            payload.get("toolName")
        )
        request_id = (
            _clean_string(payload.get("request_id"))
            or _clean_string(payload.get("requestId"))
            or _clean_string(payload.get("correlation_id"))
            or _clean_string(payload.get("correlationId"))
        )
        tool_call_id = _clean_string(payload.get("tool_call_id")) or _clean_string(
            payload.get("toolCallId")
        )
        correlation_id = _clean_string(payload.get("correlation_id")) or _clean_string(
            payload.get("correlationId")
        )
        if not tool_name or not request_id:
            return
        parameters = (
            payload.get("args")
            if isinstance(payload.get("args"), dict)
            else payload.get("parameters")
        )
        args = parameters if isinstance(parameters, dict) else {}
        try:
            result = await self.local_runtime.execute_tool(
                tool_name=tool_name,
                args=args,
                request_id=request_id,
                tool_call_id=tool_call_id,
                correlation_id=correlation_id,
            )
            result_payload = _build_tool_result_payload(request_id, result)
        except Exception as exc:
            error = str(exc)
            result_payload = {
                "request_id": request_id,
                "success": False,
                "data": _normalize_tool_result_data({"output": error}),
                "error": error,
            }
        await self._send_json(
            {
                "id": f"msg_{uuid4().hex}",
                "type": "tool-result",
                "payload": result_payload,
                "user_id": self.user_id,
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
        )

    async def _execute_local_tool_bundle(self, event: dict[str, Any]) -> None:
        payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
        metadata = (
            payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
        )
        if metadata.get("skip_frontend_execution") is True:
            return
        bundle_id = _clean_string(payload.get("bundle_id")) or _clean_string(
            payload.get("bundleId")
        )
        steps = payload.get("tools") if isinstance(payload.get("tools"), list) else []
        if not bundle_id or not steps:
            return
        step_results: list[dict[str, Any]] = []
        for step in steps:
            if not isinstance(step, dict):
                continue
            tool_name = _clean_string(step.get("name")) or _clean_string(
                step.get("toolName")
            )
            if not tool_name:
                continue
            args = step.get("args") if isinstance(step.get("args"), dict) else {}
            tool_call_id = _clean_string(step.get("tool_call_id")) or _clean_string(
                step.get("toolCallId")
            )
            try:
                result = await self.local_runtime.execute_tool(
                    tool_name=tool_name,
                    args=args,
                    bundle_id=bundle_id,
                    tool_call_id=tool_call_id,
                )
                success = result.get("success") is not False
                step_result = {
                    "tool": tool_name,
                    "status": "ok" if success else "error",
                    "output": (
                        _normalize_tool_result_data(result.get("data"))
                        if success
                        else {"error": result.get("error") or "Tool execution failed"}
                    ),
                }
                if tool_call_id:
                    step_result["toolCallId"] = tool_call_id
                step_results.append(step_result)
            except Exception as exc:
                step_results.append(
                    {
                        "tool": tool_name,
                        "status": "error",
                        "output": {"error": str(exc)},
                    }
                )
        if not step_results:
            return
        failures = [step for step in step_results if step["status"] != "ok"]
        status = (
            "success"
            if not failures
            else "failure" if len(failures) == len(step_results) else "partial_failure"
        )
        await self._send_json(
            {
                "id": f"msg_{uuid4().hex}",
                "type": "tool-bundle-result",
                "payload": {
                    "bundle_id": bundle_id,
                    "status": status,
                    "step_results": step_results,
                    "error": (
                        f"{len(failures)} bundled tool step(s) failed"
                        if failures
                        else None
                    ),
                },
                "user_id": self.user_id,
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
        )


class WindieSdkClient(RemoteApiClientBase):
    """Python transport wrapper over `/api/artifacts/*`, `/api/sdk/*`, and `/ws`."""

    _aiohttp = aiohttp

    def __init__(
        self,
        backend_url: Optional[str] = None,
        *,
        timeout_seconds: int = 60,
        default_user_id: Optional[str] = None,
        sidecar: Any = None,
        auto_start_local_runtime: bool = True,
        sidecar_discovery_file: Optional[str] = None,
        sidecar_daemon_script: Optional[str] = None,
        python_command: Optional[str] = None,
    ) -> None:
        super().__init__(backend_url=backend_url, timeout_seconds=timeout_seconds)
        self.default_user_id = default_user_id
        self.sidecar = sidecar
        self.auto_start_local_runtime = auto_start_local_runtime
        self.sidecar_discovery_file = (
            Path(sidecar_discovery_file).expanduser()
            if sidecar_discovery_file
            else DEFAULT_SIDECAR_DISCOVERY_FILE
        )
        self.sidecar_daemon_script = sidecar_daemon_script
        self.python_command = (
            python_command or os.environ.get("WINDIE_PYTHON") or "python3"
        )
        self._owned_sidecar_process: asyncio.subprocess.Process | None = None

    async def close(self) -> None:
        await super().close()
        if isinstance(self.sidecar, SidecarDaemonHttpClient):
            await self.sidecar.close()
        if (
            self._owned_sidecar_process
            and self._owned_sidecar_process.returncode is None
        ):
            self._owned_sidecar_process.terminate()
            try:
                await asyncio.wait_for(self._owned_sidecar_process.wait(), timeout=2)
            except asyncio.TimeoutError:
                self._owned_sidecar_process.kill()
        self._owned_sidecar_process = None

    async def request_json(
        self,
        *,
        method: str,
        path: str,
        payload: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        if not self._session:
            await self.initialize()

        last_network_error: Optional[Exception] = None
        method_name = method.lower().strip()
        normalized_payload = (
            _filter_sdk_http_payload(path, payload)
            if method_name == "post"
            else payload
        )
        sanitized_payload = (
            sanitize_surrogates(normalized_payload)
            if isinstance(normalized_payload, dict)
            else None
        )
        for index, backend_url in enumerate(self.backend_urls):
            try:
                request_url = f"{backend_url}{path}"
                request_timeout = self._aiohttp.ClientTimeout(
                    total=self.timeout_seconds
                )
                if method_name == "get":
                    request_context = self._session.get(
                        request_url,
                        headers=self._build_auth_headers(),
                        timeout=request_timeout,
                    )
                elif method_name == "post":
                    request_context = self._session.post(
                        request_url,
                        json=sanitized_payload,
                        headers=self._build_auth_headers(),
                        timeout=request_timeout,
                    )
                else:
                    raise ValueError(f"Unsupported method: {method}")
                async with request_context as response:
                    if response.status != 200:
                        error_text = await response.text()
                        if self._should_try_fallback_for_status(
                            response.status
                        ) and index + 1 < len(self.backend_urls):
                            continue
                        raise Exception(
                            _build_error_message(response.status, error_text)
                        )

                    data = await response.json()
                    if not isinstance(data, dict):
                        raise Exception("SDK API returned a non-object JSON payload")
                    self.backend_url = backend_url
                    return data
            except self._aiohttp.ClientError as err:
                last_network_error = err
                if index + 1 < len(self.backend_urls):
                    continue
                raise Exception(f"Failed to connect to sdk service: {err}") from err

        raise Exception(f"Failed to connect to sdk service: {last_network_error}")

    async def upload_artifact(
        self,
        *,
        filename: str,
        content: bytes,
        content_type: Optional[str] = None,
    ) -> dict[str, Any]:
        if not self._session:
            await self.initialize()

        last_network_error: Optional[Exception] = None
        for index, backend_url in enumerate(self.backend_urls):
            try:
                form = self._aiohttp.FormData()
                form.add_field(
                    "file",
                    content,
                    filename=filename,
                    content_type=content_type or "application/octet-stream",
                )
                async with self._session.post(
                    f"{backend_url}/api/artifacts/",
                    data=form,
                    headers=self._build_auth_headers(),
                    timeout=self._aiohttp.ClientTimeout(total=self.timeout_seconds),
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        if self._should_try_fallback_for_status(
                            response.status
                        ) and index + 1 < len(self.backend_urls):
                            continue
                        raise Exception(
                            f"Artifacts API returned {response.status}: {error_text}"
                        )
                    data = await response.json()
                    if not isinstance(data, dict):
                        raise Exception(
                            "Artifacts API returned a non-object JSON payload"
                        )
                    self.backend_url = backend_url
                    return data
            except self._aiohttp.ClientError as err:
                last_network_error = err
                if index + 1 < len(self.backend_urls):
                    continue
                raise Exception(
                    f"Failed to connect to artifacts service: {err}"
                ) from err

        raise Exception(f"Failed to connect to artifacts service: {last_network_error}")

    def artifact_url(self, artifact_id: str) -> str:
        return f"{self.backend_url.rstrip('/')}/api/artifacts/{quote(artifact_id)}"

    async def ocr_run(self, image: dict[str, Any]) -> dict[str, Any]:
        return await self.request_json(
            method="post", path="/api/sdk/ocr/run", payload={"image": image}
        )

    async def ocr_inspect(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self.request_json(
            method="post", path="/api/sdk/ocr/inspect", payload=payload
        )

    async def ocr_find_text(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self.request_json(
            method="post", path="/api/sdk/ocr/find-text", payload=payload
        )

    async def ocr_find_text_candidates(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self.request_json(
            method="post", path="/api/sdk/ocr/find-text-candidates", payload=payload
        )

    async def ocr_resolve_text(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self.request_json(
            method="post", path="/api/sdk/ocr/resolve-text", payload=payload
        )

    async def ocr_resolve_candidate(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self.request_json(
            method="post", path="/api/sdk/ocr/resolve-candidate", payload=payload
        )

    async def ocr_overlay(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self.request_json(
            method="post", path="/api/sdk/ocr/overlay", payload=payload
        )

    async def vision_locate(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self.request_json(
            method="post", path="/api/sdk/vision/locate", payload=payload
        )

    async def vision_locate_all(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self.request_json(
            method="post", path="/api/sdk/vision/locate-all", payload=payload
        )

    async def vision_describe(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self.request_json(
            method="post", path="/api/sdk/vision/describe", payload=payload
        )

    async def vision_overlay(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self.request_json(
            method="post", path="/api/sdk/vision/overlay", payload=payload
        )

    async def list_models(
        self,
        *,
        user_id: Optional[str] = None,
        model_id: Optional[str] = None,
        model_provider: Optional[str] = None,
        interaction_mode: Optional[str] = None,
    ) -> dict[str, Any]:
        return await self.request_json(
            method="get",
            path="/api/sdk/models"
            + _build_query_string(
                {
                    "user_id": user_id,
                    "model_id": model_id,
                    "model_provider": model_provider,
                    "interaction_mode": interaction_mode,
                }
            ),
        )

    async def get_tool_schemas(
        self,
        *,
        user_id: Optional[str] = None,
        model_id: Optional[str] = None,
        model_provider: Optional[str] = None,
        interaction_mode: Optional[str] = None,
    ) -> dict[str, Any]:
        return await self.request_json(
            method="get",
            path="/api/sdk/tool-schemas"
            + _build_query_string(
                {
                    "user_id": user_id,
                    "model_id": model_id,
                    "model_provider": model_provider,
                    "interaction_mode": interaction_mode,
                }
            ),
        )

    async def get_tool_capabilities(
        self,
        tool_name: str,
        *,
        user_id: Optional[str] = None,
        model_id: Optional[str] = None,
        model_provider: Optional[str] = None,
        interaction_mode: Optional[str] = None,
    ) -> dict[str, Any]:
        return await self.request_json(
            method="get",
            path=f"/api/sdk/tool-capabilities/{quote(tool_name)}"
            + _build_query_string(
                {
                    "user_id": user_id,
                    "model_id": model_id,
                    "model_provider": model_provider,
                    "interaction_mode": interaction_mode,
                }
            ),
        )

    async def get_system_prompt(
        self,
        *,
        user_id: Optional[str] = None,
        model_id: Optional[str] = None,
        model_provider: Optional[str] = None,
        interaction_mode: Optional[str] = None,
    ) -> dict[str, Any]:
        return await self.request_json(
            method="get",
            path="/api/sdk/system-prompt"
            + _build_query_string(
                {
                    "user_id": user_id,
                    "model_id": model_id,
                    "model_provider": model_provider,
                    "interaction_mode": interaction_mode,
                }
            ),
        )

    async def get_prompt_preview(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self.request_json(
            method="post", path="/api/sdk/prompt-preview", payload=payload
        )

    async def get_query_plan(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self.request_json(
            method="post", path="/api/sdk/query-plan", payload=payload
        )

    async def status(self) -> Optional[dict[str, Any]]:
        local_runtime = await self._resolve_known_local_runtime()
        if local_runtime is None:
            return None
        return await local_runtime.status()

    async def list_tools(self) -> Optional[dict[str, Any]]:
        local_runtime = await self._resolve_known_local_runtime()
        if local_runtime is None:
            return None
        return await local_runtime.list_tools()

    async def shutdown_local_runtime(self) -> None:
        local_runtime = await self._resolve_known_local_runtime()
        if local_runtime is None:
            return
        shutdown = getattr(local_runtime, "shutdown", None)
        if callable(shutdown):
            await shutdown()
        close = getattr(local_runtime, "close", None)
        if callable(close):
            await close()
        self.sidecar = None
        if (
            self._owned_sidecar_process
            and self._owned_sidecar_process.returncode is None
        ):
            self._owned_sidecar_process.terminate()
        self._owned_sidecar_process = None

    async def wake_up(
        self,
        *,
        backend_url: Optional[str] = None,
        user_id: Optional[str] = None,
        system_prompt: Optional[str] = None,
        workspace_path: Optional[str] = None,
        skills: Optional[list[dict[str, Any]]] = None,
        agents_md: Optional[list[dict[str, Any]]] = None,
        tools: Optional[list[dict[str, Any]]] = None,
        mcps: Optional[list[dict[str, Any]]] = None,
        plugins: Optional[list[dict[str, Any]]] = None,
        agent_id: Optional[str] = None,
        name: Optional[str] = None,
    ) -> WindieSdkAgentSession:
        local_runtime = await self._prepare_local_runtime(
            tools=tools or [],
            plugins=plugins or [],
            mcps=mcps or [],
            workspace_path=workspace_path,
        )
        manifest_tools = await self._build_wake_up_tool_manifest(
            local_runtime=local_runtime,
            tools=tools or [],
        )
        agent_definition = _build_python_wake_up_agent_definition(
            agent_id=agent_id,
            name=name,
            system_prompt=system_prompt,
            workspace_path=workspace_path,
            skills=skills,
            agents_md=agents_md,
            tools=manifest_tools,
            mcps=mcps,
            plugins=plugins,
        )
        return await self._connect_agent(
            backend_url=backend_url,
            user_id=user_id,
            agent_definition=agent_definition,
            local_runtime=local_runtime,
        )

    async def _connect_agent(
        self,
        *,
        backend_url: Optional[str] = None,
        user_id: Optional[str] = None,
        agent_definition: Optional[dict[str, Any]] = None,
        local_runtime: Any = None,
    ) -> WindieSdkAgentSession:
        if not self._session:
            await self.initialize()

        effective_user_id = user_id or self.default_user_id
        if not isinstance(effective_user_id, str) or not effective_user_id.strip():
            effective_user_id = get_authenticated_user_id()
        if not isinstance(effective_user_id, str) or not effective_user_id.strip():
            raise Exception(
                "WindieSdkClient.wake_up requires a user_id or default_user_id"
            )

        last_network_error: Optional[Exception] = None
        backend_urls = (
            [backend_url.rstrip("/")]
            if _clean_string(backend_url)
            else self.backend_urls
        )
        for candidate_backend_url in backend_urls:
            try:
                websocket = await self._session.ws_connect(
                    _derive_ws_url(candidate_backend_url),
                    headers=self._build_auth_headers(),
                    timeout=self.timeout_seconds,
                )
                session = WindieSdkAgentSession(
                    websocket=websocket,
                    user_id=effective_user_id.strip(),
                    operating_system=_detect_operating_system(),
                    agent_definition=agent_definition,
                    local_runtime=local_runtime,
                )
                await session.initialize()
                self.backend_url = candidate_backend_url
                return session
            except self._aiohttp.ClientError as err:
                last_network_error = err
                continue

        raise Exception(f"Failed to connect to agent websocket: {last_network_error}")

    def _needs_local_runtime(
        self,
        *,
        tools: list[dict[str, Any]],
        plugins: list[dict[str, Any]],
        mcps: list[dict[str, Any]],
    ) -> bool:
        return bool(tools or plugins or mcps)

    async def _prepare_local_runtime(
        self,
        *,
        tools: list[dict[str, Any]],
        plugins: list[dict[str, Any]],
        mcps: list[dict[str, Any]],
        workspace_path: Optional[str],
    ) -> Any:
        if not self._needs_local_runtime(tools=tools, plugins=plugins, mcps=mcps):
            return None
        local_runtime = await self._ensure_local_runtime()
        await local_runtime.status()
        for tool in tools:
            if not isinstance(tool, dict):
                continue
            if _clean_string(tool.get("module")):
                await local_runtime.register_module_tool(
                    tool,
                    workspace_path=workspace_path,
                )
        for plugin in plugins:
            if isinstance(plugin, dict):
                await local_runtime.register_plugin(plugin)
        for mcp in mcps:
            if isinstance(mcp, dict):
                await local_runtime.register_mcp(mcp)
        return local_runtime

    async def _build_wake_up_tool_manifest(
        self,
        *,
        local_runtime: Any,
        tools: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        manifest_tools: list[dict[str, Any]] = []
        if local_runtime is not None:
            manifest = await local_runtime.list_tools()
            raw_tools = manifest.get("tools") if isinstance(manifest, dict) else None
            if isinstance(raw_tools, list):
                manifest_tools.extend(
                    tool for tool in raw_tools if isinstance(tool, dict)
                )
        explicit_tools = [
            _build_manifest_tool(tool)
            for tool in tools
            if isinstance(tool, dict) and not _clean_string(tool.get("module"))
        ]
        manifest_tools.extend(explicit_tools)
        return manifest_tools

    async def _ensure_local_runtime(self) -> Any:
        if self.sidecar is not None:
            return self.sidecar
        discovered = await self._probe_discovered_sidecar()
        if discovered is not None:
            self.sidecar = discovered
            return discovered
        if not self.auto_start_local_runtime:
            raise Exception(
                "WindieSdkClient local runtime is required but auto-start is disabled"
            )
        self.sidecar_discovery_file.parent.mkdir(parents=True, exist_ok=True)
        daemon_script = _resolve_daemon_script(self.sidecar_daemon_script)
        self._owned_sidecar_process = await asyncio.create_subprocess_exec(
            self.python_command,
            str(daemon_script),
            "--discovery-file",
            str(self.sidecar_discovery_file),
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        deadline = time.monotonic() + DEFAULT_SIDECAR_START_TIMEOUT_SECONDS
        while time.monotonic() < deadline:
            discovered = await self._probe_discovered_sidecar()
            if discovered is not None:
                self.sidecar = discovered
                return discovered
            await asyncio.sleep(DEFAULT_SIDECAR_POLL_INTERVAL_SECONDS)
        if self._owned_sidecar_process.returncode is None:
            self._owned_sidecar_process.terminate()
        raise Exception(
            f"Timed out waiting for Windie sidecar daemon discovery at {self.sidecar_discovery_file}"
        )

    async def _probe_discovered_sidecar(self) -> Optional[SidecarDaemonHttpClient]:
        discovery = _read_daemon_discovery(self.sidecar_discovery_file)
        if not discovery:
            return None
        client = SidecarDaemonHttpClient(
            base_url=discovery["base_url"],
            token=discovery["token"],
            timeout_seconds=self.timeout_seconds,
            aiohttp_module=self._aiohttp,
        )
        try:
            await client.status()
            return client
        except Exception:
            await client.close()
            return None

    async def _resolve_known_local_runtime(self) -> Any:
        if self.sidecar is not None:
            return self.sidecar
        discovered = await self._probe_discovered_sidecar()
        if discovered is not None:
            self.sidecar = discovered
            return discovered
        return None

    async def trace_query(
        self,
        *,
        query: dict[str, Any],
        user_id: Optional[str] = None,
        timeout_seconds: Optional[float] = None,
    ) -> dict[str, Any]:
        session = await self._connect_agent(
            user_id=user_id,
            agent_definition=query.get("agent_definition"),
        )
        events: list[dict[str, Any]] = []
        query_message_id = await session.query(
            text=str(query.get("text") or ""),
            conversation_ref=str(query.get("conversation_ref") or ""),
            content=query.get("content"),
            screenshot=query.get("screenshot"),
            screenshot_ref=query.get("screenshot_ref"),
            screenshot_refs=query.get("screenshot_refs"),
            attachment_context=query.get("attachment_context"),
            attachment_filenames=query.get("attachment_filenames"),
            system_state_internal=query.get("system_state_internal"),
            workspace_path=query.get("workspace_path"),
            agent_definition=query.get("agent_definition"),
        )
        try:
            while True:
                if isinstance(timeout_seconds, (int, float)) and timeout_seconds > 0:
                    event = await asyncio.wait_for(
                        session.receive_json(),
                        timeout=timeout_seconds,
                    )
                else:
                    event = await session.receive_json()
                if isinstance(event, dict) and isinstance(event.get("type"), str):
                    events.append(event)
                    if event["type"] == "streaming-complete":
                        payload = event.get("payload") or {}
                        return {
                            "query_message_id": query_message_id,
                            "events": events,
                            "final_response": payload.get("final_response"),
                        }
                    if event["type"] == "error":
                        payload = event.get("payload") or {}
                        return {
                            "query_message_id": query_message_id,
                            "events": events,
                            "error": {
                                "message": payload.get("message"),
                                "content": payload.get("content"),
                            },
                        }
        except asyncio.TimeoutError as err:
            raise Exception(
                f"Windie SDK trace query timed out after {timeout_seconds} seconds"
            ) from err
        finally:
            await session.close()
