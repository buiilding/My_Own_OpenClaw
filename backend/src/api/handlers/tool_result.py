"""
Tool Result Handler for SDK/local-runtime Tool Execution Results.

Handles tool-result messages from the SDK/local runtime by delegating to AgentSession.
The handler is a pure coordinator - all tool result processing logic lives in the session.
"""

import logging
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from backend.src.api.infrastructure.handler import MessageHandler
from backend.src.api.transport.protocol import WebSocketSender
from backend.src.api.schemas import (
    BaseMessage,
    ToolResultMessage,
    ToolBundleResultMessage,
)

if TYPE_CHECKING:
    from backend.src.agent.session.manager import SessionManager

logger = logging.getLogger(__name__)


def _tool_call_id_from_resolved_call(resolved_call: Any) -> Optional[str]:
    metadata = getattr(resolved_call, "metadata", None)
    if isinstance(metadata, dict):
        value = metadata.get("tool_call_id") or metadata.get("llm_tool_call_id")
        if isinstance(value, str) and value:
            return value
        model_facing = metadata.get("model_facing_tool_call")
        if isinstance(model_facing, dict):
            model_id = model_facing.get("id")
            if isinstance(model_id, str) and model_id:
                return model_id
    return None


def _canonical_payload_from_result(
    *,
    request_id: str,
    success: bool,
    result: Any,
    error: Optional[str],
    resolved_call: Any,
) -> Dict[str, Any]:
    data = result.data if isinstance(getattr(result, "data", None), dict) else {}
    tool_name = getattr(resolved_call, "tool_name", None)
    if not isinstance(tool_name, str) or not tool_name:
        tool_name = "tool"
    model_content = data.get("model_llm_content") or getattr(
        result, "llm_content", None
    )
    display_content = data.get("display_content") or getattr(
        result, "return_display", None
    )
    if not isinstance(model_content, str):
        model_content = str(model_content or "")
    if not isinstance(display_content, str):
        display_content = model_content
    payload: Dict[str, Any] = {
        "request_id": request_id,
        "tool_call_id": _tool_call_id_from_resolved_call(resolved_call),
        "tool_name": tool_name,
        "success": success,
        "output": display_content,
        "display_content": display_content,
        "model_llm_content": model_content,
        "llm_content_original_tokens": data.get("llm_content_original_tokens"),
        "llm_content_token_limit": data.get("llm_content_token_limit"),
        "llm_content_truncated": bool(data.get("llm_content_truncated")),
        "llm_content_token_source": data.get("llm_content_token_source"),
        "error": error,
        "metadata": {
            "canonical_model_output": True,
            "source": "backend",
        },
    }
    return {key: value for key, value in payload.items() if value is not None}


def _non_empty_string(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _canonical_context_from_session(
    *,
    session: Any,
    user_id: str,
) -> Dict[str, Optional[str]]:
    runtime = getattr(session, "runtime", None)
    return {
        "user_id": user_id,
        "session_id": _non_empty_string(getattr(session, "session_id", None)),
        "conversation_ref": _non_empty_string(
            getattr(runtime, "active_conversation_ref", None)
        ),
        "turn_ref": _non_empty_string(getattr(runtime, "active_turn_ref", None)),
    }


class ToolResultHandler(MessageHandler):
    """
    Handler for tool-result messages from the SDK/local runtime.

    Pure coordinator that delegates all tool result processing to AgentSession.
    The handler no longer knows about session internals - it just routes messages.
    """

    def __init__(self, session_manager: "SessionManager"):
        """
        Initialize the tool result handler.

        Args:
            session_manager: SessionManager instance for accessing sessions
        """
        self.session_manager = session_manager

    def validate_message(self, message: BaseMessage) -> bool:
        """Validate tool-result or tool-bundle-result message structure."""
        return isinstance(message, (ToolResultMessage, ToolBundleResultMessage))

    @staticmethod
    def _serialize_step_results(step_results: Any) -> List[Dict[str, Any]]:
        """Normalize bundle step results to plain dicts for domain-layer consumers."""
        if not isinstance(step_results, list):
            return []

        normalized: List[Dict[str, Any]] = []
        for step in step_results:
            if isinstance(step, dict):
                normalized.append(dict(step))
                continue
            model_dump = getattr(step, "model_dump", None)
            if callable(model_dump):
                dumped = model_dump()
                if isinstance(dumped, dict):
                    normalized.append(dumped)
                    continue
            normalized.append({})
        return normalized

    @staticmethod
    def _serialize_tool_result_data(data: Any) -> Optional[Dict[str, Any]]:
        """Normalize tool-result data payload to plain dict for domain-layer consumers."""
        if data is None:
            return None
        if isinstance(data, dict):
            return dict(data)

        model_dump = getattr(data, "model_dump", None)
        if callable(model_dump):
            dumped = model_dump(exclude_none=True)
            if isinstance(dumped, dict):
                return dumped

        logger.warning(f"Unexpected tool-result data type: {type(data)}")
        return None

    async def handle(
        self, message: BaseMessage, websocket: WebSocketSender, user_id: str
    ) -> None:
        """
        Handle tool-result or tool-bundle-result message from frontend.

        Routes to appropriate handler based on message type.

        Args:
            message: Validated ToolResultMessage or ToolBundleResultMessage Pydantic model
            websocket: WebSocket connection
            user_id: User ID from connection context
        """
        # Route based on message type
        if isinstance(message, ToolBundleResultMessage):
            await self._handle_tool_bundle_result(message, websocket, user_id)
        else:
            # Type assertion - message is already validated as ToolResultMessage
            validated: ToolResultMessage = message  # type: ignore

            payload = validated.payload
            request_id = payload.request_id

            # Get session
            session = self.session_manager.get_session_for_request_id(
                user_id,
                request_id,
            )
            if not session:
                # Benign - stale/terminated session, log and drop silently
                logger.debug(
                    f"Tool result for non-existent session "
                    f"(user_id={user_id}, request_id={request_id[:15] if request_id else 'none'})"
                )
                return

            result_data = self._serialize_tool_result_data(payload.data)

            get_resolved_tool_call = getattr(session, "get_resolved_tool_call", None)
            resolved_call = (
                get_resolved_tool_call(request_id)
                if callable(get_resolved_tool_call)
                else None
            )

            # Delegate to session (handler no longer knows about internals)
            canonical_result = await session.process_frontend_tool_result(
                request_id=request_id,
                success=payload.success,
                result_data=result_data,
                error=payload.error,
            )

            if canonical_result is not None:
                canonical_context = _canonical_context_from_session(
                    session=session,
                    user_id=user_id,
                )
                await websocket.send_json(
                    {
                        "id": f"{validated.id}_canonical",
                        "type": "tool-output",
                        "user_id": canonical_context["user_id"],
                        "session_id": canonical_context["session_id"],
                        "conversation_ref": canonical_context["conversation_ref"],
                        "turn_ref": canonical_context["turn_ref"],
                        "payload": _canonical_payload_from_result(
                            request_id=request_id,
                            success=payload.success,
                            result=canonical_result,
                            error=payload.error,
                            resolved_call=resolved_call,
                        ),
                    }
                )

    async def _handle_tool_bundle_result(
        self, message: ToolBundleResultMessage, websocket: WebSocketSender, user_id: str
    ) -> None:
        """
        Handle tool-bundle-result message from frontend.

        Args:
            message: Validated ToolBundleResultMessage Pydantic model
            websocket: WebSocket connection
            user_id: User ID from connection context
        """
        payload = message.payload
        bundle_id = payload.bundle_id

        # Get session
        session = self.session_manager.get_session_for_bundle_id(
            user_id,
            bundle_id,
        )
        if not session:
            logger.debug(
                f"Tool bundle result for non-existent session "
                f"(user_id={user_id}, bundle_id={bundle_id[:15] if bundle_id else 'none'})"
            )
            return

        # Delegate to session for processing atomic bundle result
        # step_results is already List[Dict[str, Any]] from schema
        await session.process_frontend_tool_bundle_result(
            bundle_id=bundle_id,
            status=payload.status,
            step_results=self._serialize_step_results(payload.step_results),
            screenshot=payload.screenshot,
            screenshot_ref=payload.screenshot_ref,
            capture_meta=payload.capture_meta,
            system_state=payload.system_state,
            error=payload.error,
        )
