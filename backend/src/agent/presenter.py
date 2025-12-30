"""
Response Presenter for Agent Streaming Events.

This module handles the presentation layer, enriching domain events with UI-specific
metadata and formatting. Separates presentation concerns from core agent logic.
"""
import logging
from typing import Any, AsyncGenerator, Dict, Optional

from backend.src.core.events import (
    AgentStreamingEvent,
    AssistantMessageFullEvent,
    SystemPromptEvent,
    ToolOutputEvent,
    ToolSchemasEvent,
    UserMessageFullEvent,
)
from backend.src.llm.prompt_metadata import PromptMetadata

logger = logging.getLogger(__name__)


class ResponsePresenter:
    """
    Presents agent domain events with UI-specific formatting and metadata.
    
    Separates presentation logic from core agent logic, allowing UI changes
    without modifying the interaction loop.
    """

    def __init__(self):
        """Initialize the response presenter."""
        pass

    async def present_system_prompt(
        self, prompt_metadata: PromptMetadata, iteration: int
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        """
        Present system prompt event (tool schemas are now in user message, not system prompt).
        
        Args:
            prompt_metadata: Prompt metadata containing system prompt
            iteration: Current iteration number (only present on first iteration)
        """
        if iteration == 1:
            # System prompt no longer includes tool schemas - they're in the user message now
            yield SystemPromptEvent(
                content=prompt_metadata.system_prompt,
                tool_schemas=None,  # Tool schemas are in user message, not system prompt
            )

    async def present_user_message(
        self, prompt_metadata: PromptMetadata
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        """
        Present user message event with injected context metadata.

        Tool schemas are now passed as a separate parameter to the LLM, not embedded in message content.

        Args:
            prompt_metadata: Prompt metadata containing user message metadata
        """
        if prompt_metadata.user_message_metadata:
            user_meta = prompt_metadata.user_message_metadata
            metadata = {
                "original_query": user_meta.original_query,
                "context_type": user_meta.context_type,
                "injected_context": user_meta.injected_context,
                "active_window": user_meta.active_window,
            }
            # Tool schemas are now passed as a separate parameter, not embedded in metadata

            yield UserMessageFullEvent(
                content=user_meta.full_content,
                metadata=metadata,
            )

    async def present_tool_schemas(
        self, tool_schemas: Optional[Dict[str, Any]]
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        """
        Present tool schemas event for transparency.

        Tool schemas are now passed as a separate parameter to the LLM API.

        Args:
            tool_schemas: Tool schemas dictionary or None
        """
        if tool_schemas is not None:
            yield ToolSchemasEvent(tool_schemas=tool_schemas)

    async def present_tool_output(
        self,
        tool_name: str,
        success: bool,
        execution_time: float,
        output: str,
        error: str,
        screenshot: str,
        active_window: str,
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        """
        Present tool output event with enhanced metadata.
        
        Args:
            tool_name: Name of the tool that was executed
            success: Whether execution succeeded
            execution_time: Execution time in seconds
            output: Tool output message
            error: Error message if failed
            screenshot: Screenshot data if available
            active_window: Active window title at execution time
        """
        yield ToolOutputEvent(
            tool_name=tool_name,
            success=success,
            execution_time=execution_time,
            output=output,
            error=error,
            screenshot=screenshot,
            metadata={
                "active_window": active_window,
                "execution_time": execution_time,
                "success": success,
            },
        )

