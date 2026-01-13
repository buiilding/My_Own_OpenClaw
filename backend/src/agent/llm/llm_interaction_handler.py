"""
LLM Interaction Handler.

Handles LLM streaming, text aggregation, and token counting.
"""
import logging
from typing import TYPE_CHECKING, AsyncGenerator, List, NamedTuple, Optional

from backend.src.core.events import (
    AgentStreamingEvent,
    ChunkEvent,
    ErrorEvent,
    FullResponseEvent,
    StreamingEvent,
    ThinkingEvent,
    TokenCountEvent,
)
from backend.src.core.exceptions import LLMRateLimitError
from backend.src.core.types import LLMMessage
from backend.src.services.token_service import get_token_service

if TYPE_CHECKING:
    from backend.src.agent.core.core import AgentSession
    from backend.src.agent.core.state import ConversationHistory
    from backend.src.llm.llm_client import LLMClient

logger = logging.getLogger(__name__)


class TokenCounts(NamedTuple):
    """Token count information."""
    input_tokens: int
    output_tokens: int
    total_tokens: int
    conversation_tokens: int


class LLMInteractionHandler:
    """
    Handles LLM streaming and token counting.
    
    Responsibility: LLM streaming, text aggregation, and token counting.
    Yields streaming events directly for real-time updates.
    """

    def __init__(
        self,
        llm_client: "LLMClient",
        session: "AgentSession",
    ):
        """
        Initialize the LLM interaction handler.
        
        Args:
            llm_client: Client for LLM API calls
            session: Agent session for configuration and history access
        """
        self.llm_client = llm_client
        self.session = session

    async def get_response(
        self, prompt: List[LLMMessage]
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        """
        Streams LLM response, aggregates text, and counts tokens.
        
        Yields streaming events (ChunkEvent, ThinkingEvent, ErrorEvent) as they arrive.
        After streaming completes, yields FullResponseEvent and TokenCountEvent.
        
        Args:
            prompt: List of LLM messages to send to the LLM
            
        Yields:
            Streaming events: ChunkEvent, ThinkingEvent, ErrorEvent, FullResponseEvent, TokenCountEvent
        """
        full_text = ""
        model_id = self.session.cfg.selected_model_id
        
        try:
            async for event in self.llm_client.get_completion_stream(
                model=model_id, messages=prompt
            ):
                # LLM client returns StreamingEvent objects directly
                if isinstance(event, ChunkEvent):
                    full_text += event.content
                    yield event
                elif isinstance(event, ThinkingEvent):
                    yield event
                elif isinstance(event, ErrorEvent):
                    yield event
                else:
                    # Fallback for any unexpected event types
                    logger.warning(f"Unexpected event type from LLM client: {type(event)}")
                    # Try to extract content if it's a known event type
                    if isinstance(event, StreamingEvent) and hasattr(event, 'content'):
                        chunk = ChunkEvent(content=str(event.content))
                        full_text += chunk.content
                        yield chunk
                    else:
                        chunk = ChunkEvent(content=str(event))
                        full_text += chunk.content
                        yield chunk
            
            # Streaming complete - yield full response
            yield FullResponseEvent(content=full_text)
            
            # Count tokens for the conversation
            token_counts = self._count_tokens(prompt, full_text)
            yield TokenCountEvent(
                input_tokens=token_counts.input_tokens,
                output_tokens=token_counts.output_tokens,
                total_tokens=token_counts.total_tokens,
                conversation_tokens=token_counts.conversation_tokens,
            )
            
        except LLMRateLimitError:
            yield ErrorEvent(content="Rate limit exceeded. Please wait.")
            raise
        except Exception as e:
            logger.error(f"LLM error: {e}", exc_info=True)
            yield ErrorEvent(content=f"LLM error: {str(e)}")
            raise

    def _count_tokens(
        self, prompt: List[LLMMessage], full_text: str
    ) -> TokenCounts:
        """
        Counts tokens for input, output, and total conversation.
        
        Args:
            prompt: Input messages sent to LLM
            full_text: Full response text from LLM
            
        Returns:
            TokenCounts named tuple with all token counts
        """
        model_id = self.session.cfg.selected_model_id
        token_service = get_token_service()

        # Count tokens in the input messages (prompt)
        input_tokens = token_service.count_tokens(prompt, model_id)

        # Estimate output tokens (rough approximation based on character count)
        # This could be improved if the LLM provider returns actual output tokens
        output_tokens = len(full_text) // 4  # Rough approximation

        # Count total conversation tokens
        conversation_tokens = token_service.count_tokens(
            self.session.history.get_history(), model_id
        )

        return TokenCounts(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=input_tokens + output_tokens,
            conversation_tokens=conversation_tokens,
        )
