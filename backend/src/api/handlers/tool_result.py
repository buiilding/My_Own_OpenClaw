"""
Tool Result Handler for Frontend Tool Execution Results.

Handles tool-result messages from the frontend by delegating to AgentSession.
The handler is a pure coordinator - all tool result processing logic lives in the session.
"""
import logging
from typing import TYPE_CHECKING, Any, Dict, Optional

from backend.src.api.infrastructure.handler import MessageHandler
from backend.src.api.transport.protocol import WebSocketSender
from backend.src.api.schema import BaseMessage, ToolResultMessage, ToolBundleResultMessage

if TYPE_CHECKING:
    from backend.src.agent.session.manager import SessionManager

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
    
    def validate_message(self, message: BaseMessage) -> bool:
        """Validate tool-result or tool-bundle-result message structure."""
        return isinstance(message, (ToolResultMessage, ToolBundleResultMessage))
    
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
        allowed_keys = {"is_preformatted"}
        validated = {k: v for k, v in metadata.items() if k in allowed_keys}
        
        # Warn on unknown keys
        unknown_keys = set(metadata.keys()) - allowed_keys
        if unknown_keys:
            logger.warning(f"Unknown metadata keys ignored: {unknown_keys}")
        
        return validated
    
    async def handle(
        self,
        message: BaseMessage,
        websocket: WebSocketSender,
        user_id: str
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
            session = self.session_manager.get_session(user_id)
            if not session:
                # Benign - stale/terminated session, log and drop silently
                logger.debug(
                    f"Tool result for non-existent session "
                    f"(user_id={user_id}, request_id={request_id[:15] if request_id else 'none'})"
                )
                return
            
            # Validate and sanitize metadata before passing to domain layer
            raw_metadata = (
                validated.payload.metadata.model_dump(exclude_none=True)
                if validated.payload.metadata is not None
                else {}
            )
            metadata = self._validate_metadata(raw_metadata)
            
            # Delegate to session (handler no longer knows about internals)
            await session.process_frontend_tool_result(
                request_id=request_id,
                success=payload.success,
                result_data=payload.data,
                error=payload.error,
                metadata=metadata
            )
    
    async def _handle_tool_bundle_result(
        self,
        message: ToolBundleResultMessage,
        websocket: WebSocketSender,
        user_id: str
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
        session = self.session_manager.get_session(user_id)
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
            step_results=payload.step_results,
            screenshot=payload.screenshot,
            screenshot_ref=payload.screenshot_ref,
            system_state=payload.system_state,
            error=payload.error
        )
