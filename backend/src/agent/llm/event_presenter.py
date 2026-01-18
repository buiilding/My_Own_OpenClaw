"""
Event Presenter.

Formats and emits all frontend/UI events for the agent interaction loop.
"""
import logging
from typing import AsyncGenerator, Optional

from backend.src.core.events import (
    AgentStreamingEvent,
    AssistantMessageFullEvent,
    ErrorEvent,
    StreamingCompleteEvent,
    SystemPromptEvent,
    ToolSchemasEvent,
    UserMessageFullEvent,
)
from backend.src.llm.prompt_metadata import PromptMetadata


logger = logging.getLogger(__name__)


class EventPresenter:
    """
    Presents all frontend/UI events.
    
    Responsibility: Event formatting and emission only.
    Does NOT make business decisions or control flow.
    """

    def __init__(self):
        """Initialize the event presenter."""
        pass

    async def present_prompt_metadata(
        self, metadata: Optional[PromptMetadata]
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        """
        Presents prompt metadata events (system prompt, user message, tool schemas).
        
        Only called on first iteration when metadata is available.
        
        Args:
            metadata: Prompt metadata from first iteration
            
        Yields:
            SystemPromptEvent, UserMessageFullEvent, ToolSchemasEvent
        """
        if not metadata:
            return

        # Present system prompt event
        yield SystemPromptEvent(
            content=metadata.system_prompt,
            tool_schemas=None,  # Tool schemas are in user message, not system prompt
        )

        # Present user message event
        if metadata.user_message_metadata:
            user_meta = metadata.user_message_metadata
            user_metadata = {
                "original_query": user_meta.original_query,
                "context_type": user_meta.context_type,
                "injected_context": user_meta.injected_context,
                "active_window": user_meta.active_window,
            }
            yield UserMessageFullEvent(
                content=user_meta.full_content,
                metadata=user_metadata,
            )

        # Present tool schemas as separate transparency event
        if metadata.tool_schemas is not None:
            yield ToolSchemasEvent(tool_schemas=metadata.tool_schemas)

    async def present_assistant_message(
        self, content: str
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        """
        Presents assistant message event.
        
        Args:
            content: Full assistant message content
            
        Yields:
            AssistantMessageFullEvent
        """
        yield AssistantMessageFullEvent(content=content)

    async def present_completion(
        self,
        final_response: str,
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        """
        Presents completion event.
        
        Note: TokenCountEvent is already emitted by LLMInteractionHandler,
        so it doesn't need to be emitted here.
        
        Args:
            final_response: Final assistant response text
            
        Yields:
            StreamingCompleteEvent
        """
        yield StreamingCompleteEvent(final_response=final_response)

    async def present_error(
        self, error_message: str
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        """
        Presents error event.
        
        Args:
            error_message: Error message to present
            
        Yields:
            ErrorEvent
        """
        yield ErrorEvent(content=error_message)
