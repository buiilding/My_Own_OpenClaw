"""
Interaction Loop.

This module contains the main interaction loop for the agent, handling the
cycle of LLM generation, parsing, and tool execution.
"""
import logging
from typing import TYPE_CHECKING, Any, AsyncGenerator, Dict, List

from backend.src.agent.presenter import ResponsePresenter
from backend.src.core.events import (
    AgentStreamingEvent,
    AssistantMessageFullEvent,
    ChunkEvent,
    ErrorEvent,
    FullResponseEvent,
    StreamingCompleteEvent,
    StreamingEvent,
    ThinkingEvent,
    ToolCallEvent,
    ToolOutputEvent,
    TokenCountEvent,
)
from backend.src.core.exceptions import LLMRateLimitError
from backend.src.core.types import LLMMessage
from backend.src.llm.parser import ParsedResponse
from backend.src.services.token_service import get_token_service

if TYPE_CHECKING:
    from backend.src.agent.core import AgentSession
    from backend.src.agent.result_processor import ResultProcessor
    from backend.src.llm.llm_client import LLMClient
    from backend.src.llm.parser import ResponseParser
    from backend.src.llm.prompt_constructor import PromptConstructor
    from backend.src.tools.orchestrator import ToolOrchestrator

logger = logging.getLogger(__name__)


class InteractionLoop:
    """Executes the main agent interaction loop."""

    def __init__(
        self,
        session: "AgentSession",
        llm_client: "LLMClient",
        tool_orchestrator: "ToolOrchestrator",
        prompt_constructor: "PromptConstructor",
        response_parser: "ResponseParser",
        result_processor: "ResultProcessor",
    ):
        self.session = session
        self.llm_client = llm_client
        self.tool_orchestrator = tool_orchestrator
        self.prompt_builder = prompt_constructor
        self.response_parser = response_parser
        self.result_processor = result_processor
        self.presenter = ResponsePresenter()

    async def run_loop(self) -> AsyncGenerator[AgentStreamingEvent, None]:
        """
        Executes the agent loop: Prompt -> LLM -> Parse -> Tools -> Repeat.
        """
        iteration = 0
        max_iterations = self.session.cfg.max_agent_iterations
        
        final_response = ""
        
        while iteration < max_iterations:
            iteration += 1
            
            # A. Build Prompt
            # Get conversation history and tool schemas as separate parameters for LLM API
            prompt, tool_schemas, prompt_metadata = self.prompt_builder.build_prompt(
                history=[],  # Unused - history comes from stored_messages
                stored_messages=self.session.history,  # Pass history object for O(1) access
                include_tools=True,  # Always include tools since they're passed as separate API parameter
            )

            # Present system prompt and user message events via presenter
            async for event in self.presenter.present_system_prompt(prompt_metadata, iteration):
                yield event
            
            async for event in self.presenter.present_user_message(prompt_metadata):
                yield event

            # Present tool schemas as separate transparency event
            async for event in self.presenter.present_tool_schemas(tool_schemas):
                yield event

            # B. Get LLM Response (Streamed)
            llm_response_text = ""
            try:
                async for event in self._stream_llm_response(prompt):
                    if isinstance(event, FullResponseEvent):
                        llm_response_text = event.content
                    else:
                        yield event
            except LLMRateLimitError:
                yield ErrorEvent(content="Rate limit exceeded. Please wait.")
                return
            except Exception as e:
                logger.error(f"LLM error: {e}", exc_info=True)
                yield ErrorEvent(content=f"LLM error: {str(e)}")
                return

            # C. Parse Response
            parsed_response = self.response_parser.parse_response(llm_response_text)
            
            # Emit assistant message transparency event
            yield AssistantMessageFullEvent(content=llm_response_text)
            
            # D. Decision Logic
            if not parsed_response.has_tool_calls:
                # No tools called -> Final answer
                final_response = parsed_response.text_content
                self.session.history.add_assistant_message(final_response)
                yield StreamingCompleteEvent(final_response=final_response)
                return

            # E. Tool Execution
            # Add assistant message with tool calls to history (context is king!)
            self.session.history.add_assistant_message(llm_response_text)

            # Notify frontend of tool calls
            for tool_call in parsed_response.tool_calls:
                yield ToolCallEvent(
                    tool_name=tool_call.tool_name,
                    parameters=tool_call.parameters,
                    raw_call=tool_call.raw_call,
                )

            # Execute tools
            try:
                async for event in self._execute_tools(parsed_response):
                    yield event
            except Exception as e:
                 logger.error(f"Critical tool execution error: {e}", exc_info=True)
                 yield ErrorEvent(content=f"Tool execution error: {str(e)}")
                 break

        if iteration >= max_iterations:
            logger.warning("Max iterations reached in agent loop.")
            yield ErrorEvent(content="I reached the maximum number of steps without finishing.")
            return
        
        # If we have a final response (shouldn't happen here, but handle it)
        if final_response:
            yield StreamingCompleteEvent(final_response=final_response)

    async def _stream_llm_response(self, prompt: List[LLMMessage]) -> AsyncGenerator[AgentStreamingEvent, None]:
        """Streams the LLM response and aggregates the full text."""
        full_text = ""
        model_id = self.session.cfg.selected_model_id
        async for event in self.llm_client.get_completion_stream(
            model=model_id, messages=prompt
        ):
            # LLM client now returns StreamingEvent objects directly
            # Use isinstance() for type checking instead of string comparison
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
                    yield ChunkEvent(content=str(event.content))
                else:
                    yield ChunkEvent(content=str(event))
        
        yield FullResponseEvent(content=full_text)

        # Count tokens for the conversation
        model_id = self.session.cfg.selected_model_id
        token_service = get_token_service()

        # Count tokens in the input messages (prompt)
        input_tokens = token_service.count_tokens(prompt, model_id)

        # Estimate output tokens (rough approximation based on character count)
        # This could be improved if the LLM provider returns actual output tokens
        output_tokens = len(full_text) // 4  # Rough approximation

        # Count total conversation tokens
        conversation_tokens = token_service.count_tokens(self.session.history.get_history(), model_id)

        yield TokenCountEvent(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=input_tokens + output_tokens,
            conversation_tokens=conversation_tokens
        )

    async def _execute_tools(self, parsed_response: ParsedResponse) -> AsyncGenerator[AgentStreamingEvent, None]:
        """Executes tools and delegates result processing."""
        
        yield ThinkingEvent(content=f"Executing {len(parsed_response.tool_calls)} tool(s)...")

        # Execute tools with explicit session reference
        orchestration_result = await self.tool_orchestrator.execute_tools_from_response(
            parsed_response,
            user_id=self.session.user_id,
            session_id=self.session.session_id,
            session_ref=self.session,  # Pass session reference explicitly
        )
        
        # Process Results using ResultProcessor
        for result in orchestration_result.tool_results:
            processed_output = await self.result_processor.process_results(
                result.tool_call.tool_name,
                result.result
            )
            
            # Get active window from execution context (set during context creation in ContextFactory)
            active_window = None
            if result.context and result.context.session.metadata:
                active_window = result.context.session.metadata.get('active_window')
            
            # Present tool output event via presenter
            async for event in self.presenter.present_tool_output(
                tool_name=result.tool_call.tool_name,
                success=result.success,
                execution_time=result.execution_time,
                output=processed_output["tool_message"],
                error=result.result.error or "",
                screenshot=processed_output["screenshot_data"] or "",
                active_window=active_window or "",
            ):
                yield event

