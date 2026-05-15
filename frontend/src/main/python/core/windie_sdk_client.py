"""
Transport-only Python client for the hosted Windie SDK surface.
"""

from __future__ import annotations

import asyncio
import json
import platform
from typing import Any, Optional
from urllib.parse import quote, urlencode, urlparse, urlunparse
from uuid import uuid4

import aiohttp

from core.install_auth_state import get_authenticated_user_id
from core.remote_api_client_base import RemoteApiClientBase
from core.unicode_sanitizer import sanitize_surrogates


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


class WindieSdkAgentSession:
    """Minimal websocket session wrapper for the backend `/ws` channel."""

    def __init__(
        self,
        *,
        websocket: Any,
        user_id: str,
        operating_system: Optional[str] = None,
        agent_definition: Optional[dict[str, Any]] = None,
    ) -> None:
        self._websocket = websocket
        self.user_id = user_id
        self.operating_system = operating_system
        self.agent_definition = agent_definition

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
            payload["attachment_context"] = attachment_context
        if attachment_filenames:
            payload["attachment_filenames"] = [
                value
                for value in attachment_filenames
                if isinstance(value, str) and value.strip()
            ]
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
                "payload": sanitize_surrogates(config),
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
            return json.loads(data)
        if isinstance(data, dict):
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


class WindieSdkClient(RemoteApiClientBase):
    """Python transport wrapper over `/api/artifacts/*`, `/api/sdk/*`, and `/ws`."""

    _aiohttp = aiohttp

    def __init__(
        self,
        backend_url: Optional[str] = None,
        *,
        timeout_seconds: int = 60,
        default_user_id: Optional[str] = None,
    ) -> None:
        super().__init__(backend_url=backend_url, timeout_seconds=timeout_seconds)
        self.default_user_id = default_user_id

    async def request_json(
        self,
        *,
        method: str,
        path: str,
        payload: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        if not self._session:
            await self.initialize()

        sanitized_payload = (
            sanitize_surrogates(payload) if isinstance(payload, dict) else None
        )
        last_network_error: Optional[Exception] = None
        method_name = method.lower().strip()
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

    async def connect_agent(
        self,
        *,
        user_id: Optional[str] = None,
        operating_system: Optional[str] = None,
        agent_definition: Optional[dict[str, Any]] = None,
    ) -> WindieSdkAgentSession:
        if not self._session:
            await self.initialize()

        effective_user_id = user_id or self.default_user_id
        if not isinstance(effective_user_id, str) or not effective_user_id.strip():
            effective_user_id = get_authenticated_user_id()
        if not isinstance(effective_user_id, str) or not effective_user_id.strip():
            raise Exception(
                "WindieSdkClient.connect_agent requires a user_id or default_user_id"
            )

        last_network_error: Optional[Exception] = None
        for backend_url in self.backend_urls:
            try:
                websocket = await self._session.ws_connect(
                    _derive_ws_url(backend_url),
                    headers=self._build_auth_headers(),
                    timeout=self.timeout_seconds,
                )
                session = WindieSdkAgentSession(
                    websocket=websocket,
                    user_id=effective_user_id.strip(),
                    operating_system=(
                        operating_system.strip()
                        if isinstance(operating_system, str)
                        and operating_system.strip()
                        else _detect_operating_system()
                    ),
                    agent_definition=agent_definition,
                )
                await session.initialize()
                self.backend_url = backend_url
                return session
            except self._aiohttp.ClientError as err:
                last_network_error = err
                continue

        raise Exception(f"Failed to connect to agent websocket: {last_network_error}")

    async def trace_query(
        self,
        *,
        query: dict[str, Any],
        user_id: Optional[str] = None,
        operating_system: Optional[str] = None,
        timeout_seconds: Optional[float] = None,
    ) -> dict[str, Any]:
        session = await self.connect_agent(
            user_id=user_id,
            operating_system=operating_system,
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
