"""
LLM Interaction Handler.

Handles LLM streaming, text aggregation, and token counting.
"""
import logging
import time
from typing import TYPE_CHECKING, AsyncGenerator, List, NamedTuple

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
    from backend.src.llm.client import LLMClient

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
        llm_start_time = time.perf_counter()
        first_token_time = None
        full_text = ""
        model_id = self.session.cfg.selected_model_id
        
        logger.info(f"[Timing] LLM request started (model={model_id})")
        
        try:
            async for event in self.llm_client.get_completion_stream(
                model=model_id, messages=prompt
            ):
                if first_token_time is None:
                    first_token_time = time.perf_counter()
                    first_token_latency = first_token_time - llm_start_time
                    logger.info(f"[Timing] LLM first token received in {first_token_latency:.3f}s")
                # LLM client returns StreamingEvent objects directly
                if isinstance(event, ChunkEvent):
                    full_text += event.content
                    yield event
                elif isinstance(event, ThinkingEvent):
                    yield event
                elif isinstance(event, ErrorEvent):
                    yield event
                elif isinstance(event, FullResponseEvent):
                    # LLM client may yield FullResponseEvent (e.g., mock client)
                    # Extract content but don't yield it yet - we'll yield our own at the end
                    # This prevents duplication
                    full_text = event.content  # Use the full response from the event
                    # Don't yield the event - we'll yield our own FullResponseEvent below
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
            
            llm_total_time = time.perf_counter() - llm_start_time
            logger.info(f"[Timing] LLM response completed in {llm_total_time:.3f}s (model={model_id}, tokens={token_counts.total_tokens})")
            
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
        
        ACCURACY FIX: Uses token_service.count_tokens() for output instead of
        hardcoded heuristic. The previous `len(full_text) // 4` heuristic was
        inaccurate for:
        - Code (different token density due to whitespace/symbols)
        - Non-English languages (CJK characters map 1 char to 1-2 tokens, causing
          400-800% underestimation)
        
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

        # ACCURACY FIX: Use token_service for output tokens instead of heuristic
        # This ensures accurate counting for code, non-English languages, and
        # special characters. The previous `len(full_text) // 4` was inaccurate
        # for CJK characters (400-800% underestimation) and code (variable density).
        # Convert full_text to LLM message format for token counting
        output_message: LLMMessage = {
            "role": "assistant",
            "content": full_text
        }
        output_tokens = token_service.count_tokens([output_message], model_id)

        # Count total conversation tokens (uses cached count to avoid O(N^2) re-encoding)
        conversation_tokens = self.session.history.get_token_count(model_id)

        return TokenCounts(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=input_tokens + output_tokens,
            conversation_tokens=conversation_tokens,
        )
