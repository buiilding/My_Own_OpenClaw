"""
Tool Result Handler for SDK/local-runtime Tool Execution Results.

Handles tool-result messages from the SDK/local runtime by delegating to AgentSession.
The handler is a pure coordinator - all tool result processing logic lives in the session.
"""

import logging
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from backend.src.api.infrastructure.handler import MessageHandler
from backend.src.api.transport.protocol import WebSocketSender
from backend.src.api.schemas.common import BaseMessage
from backend.src.api.schemas.incoming import (
    ToolBundleResultMessage,
    ToolResultMessage,
)

if TYPE_CHECKING:
    from backend.src.agent.session.manager import SessionManager

logger = logging.getLogger(__name__)


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
        Handle tool-result or tool-bundle-result messages from the SDK/local runtime.

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

            # Delegate to session. Local tool output display is owned by the SDK
            # local-runtime path; backend consumes local results for model/history.
            await session.process_local_tool_result(
                request_id=request_id,
                success=payload.success,
                result_data=result_data,
                error=payload.error,
            )

    async def _handle_tool_bundle_result(
        self, message: ToolBundleResultMessage, websocket: WebSocketSender, user_id: str
    ) -> None:
        """
        Handle tool-bundle-result messages from the SDK/local runtime.

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
        await session.process_local_tool_bundle_result(
            bundle_id=bundle_id,
            status=payload.status,
            step_results=self._serialize_step_results(payload.step_results),
            screenshot=payload.screenshot,
            screenshot_ref=payload.screenshot_ref,
            capture_meta=payload.capture_meta,
            system_state=payload.system_state,
            error=payload.error,
        )
