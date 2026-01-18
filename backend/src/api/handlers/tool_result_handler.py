"""
Tool Result Handler for Frontend Tool Execution Results.

Handles tool-result messages from the frontend by delegating to AgentSession.
The handler is a pure coordinator - all tool result processing logic lives in the session.
"""
import logging
from typing import TYPE_CHECKING, Any, Dict

from fastapi import WebSocket, WebSocketDisconnect

from backend.src.api.handlers.base import MessageHandler
from backend.src.api.handlers.transport import WebSocketTransportSender
from backend.src.api.schema import ToolResultMessage
from backend.src.core.validation import ValidationError, validate_message

if TYPE_CHECKING:
    from backend.src.agent.core.session_manager import SessionManager

logger = logging.getLogger(__name__)


class ToolResultHandler(MessageHandler):
    """
    Handler for tool-result messages from frontend.
    
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
    
    def validate_message(self, data: Dict[str, Any]) -> bool:
        """Validate tool-result message structure."""
        try:
            validate_message(data, "tool-result", ToolResultMessage)
            return True
        except ValidationError:
            return False
    
    def _validate_metadata(self, metadata: Any) -> Dict[str, Any]:
        """
        Validate and sanitize metadata dict.
        
        Only allows known metadata keys to prevent injection of unexpected data
        into domain layer.
        
        Args:
            metadata: Metadata value to validate
            
        Returns:
            Validated metadata dictionary with only allowed keys
        """
        if not isinstance(metadata, dict):
            return {}
        
        # Only allow known metadata keys
        allowed_keys = {"is_preformatted", "is_bundled", "bundle_request_id"}
        validated = {k: v for k, v in metadata.items() if k in allowed_keys}
        
        # Warn on unknown keys
        unknown_keys = set(metadata.keys()) - allowed_keys
        if unknown_keys:
            logger.warning(f"Unknown metadata keys ignored: {unknown_keys}")
        
        return validated
    
    async def _send_error(self, websocket: WebSocket, msg_id: str | None, message: str) -> None:
        """
        Send error response to client.
        
        Handles connection errors gracefully - if connection is closed, logs and returns silently.
        
        Args:
            websocket: WebSocket connection
            msg_id: Message ID (optional)
            message: Error message
        """
        try:
            transport = WebSocketTransportSender(websocket)
            await transport.send({
                "type": "error",
                "id": msg_id,
                "payload": {"message": message}
            })
        except (WebSocketDisconnect, RuntimeError, ConnectionError) as e:
            # Connection closed - this is expected in some cases, log at debug level
            logger.debug(f"Failed to send error message to closed connection: {e}")
    
    async def handle(
        self,
        data: Dict[str, Any],
        websocket: WebSocket,
        user_id: str
    ) -> None:
        """
        Handle tool-result message from frontend.
        
        Implements error policy:
        - Protocol violations (missing request_id, invalid structure) → send error
        - Benign late/invalid messages (no session, terminated session) → log and drop
        
        Delegates all processing to session.process_frontend_tool_result().
        Handler is done - session handles everything internally.
        
        Args:
            data: Message data with payload containing tool result
            websocket: WebSocket connection
            user_id: User ID from connection context
        """
        # Validate message structure first (protocol violation check)
        try:
            validated = validate_message(data, "tool-result", ToolResultMessage)
        except ValidationError as e:
            # Protocol violation - send error to client
            await self._send_error(
                websocket, 
                data.get("id"), 
                f"Invalid tool-result message: {e.message}"
            )
            return
        
        payload = validated.payload
        request_id = payload.request_id
        
        # Get session
        session = self.session_manager.get_session(user_id)
        if not session:
            # Benign - stale/terminated session, log and drop silently
            logger.debug(
                f"Tool result for non-existent session "
                f"(user_id={user_id}, request_id={request_id[:15] if request_id else 'none'})"
            )
            return
        
        # Validate and sanitize metadata before passing to domain layer
        # Metadata is not in ToolResultPayload schema, so extract from original data
        raw_payload = data.get("payload", {})
        metadata = self._validate_metadata(raw_payload.get("metadata", {}))
        
        # Delegate to session (handler no longer knows about internals)
        await session.process_frontend_tool_result(
            request_id=request_id,
            success=payload.success,
            result_data=payload.data,
            error=payload.error,
            metadata=metadata
        )
        
        # Handler is done - session handles everything internally
