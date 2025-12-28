"""
Interaction Loop.

This module contains the main interaction loop for the agent, handling the
cycle of LLM generation, parsing, and tool execution.
"""
import logging
from typing import TYPE_CHECKING, AsyncGenerator, List

from backend.src.core.exceptions import LLMRateLimitError
from backend.src.core.types import LLMMessage, StreamingEvent
from backend.src.llm.parser import ParsedResponse

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

    async def run_loop(self) -> AsyncGenerator[StreamingEvent, None]:
        """
        Executes the agent loop: Prompt -> LLM -> Parse -> Tools -> Repeat.
        """
        iteration = 0
        max_iterations = self.session.cfg.max_agent_iterations
        
        final_response = ""
        
        while iteration < max_iterations:
            iteration += 1
            
            # A. Build Prompt
            prompt, prompt_metadata = self.prompt_builder.build_prompt(
                self.session.history.get_history(),
                include_tools=(iteration == 1),
            )

            # Emit system prompt transparency event (only on first iteration)
            if iteration == 1 and prompt_metadata.get("tool_schemas") is not None:
                yield {
                    "type": "system_prompt",
                    "content": prompt_metadata["system_prompt"],
                    "tool_schemas": prompt_metadata["tool_schemas"],
                }

            # Emit user message transparency event if metadata available
            if prompt_metadata.get("user_message_metadata"):
                metadata = prompt_metadata["user_message_metadata"]
                yield {
                    "type": "user_message_full",
                    "content": metadata["full_content"],
                    "metadata": {
                        "original_query": metadata["original_query"],
                        "context_type": metadata["context_type"],
                        "injected_context": metadata["injected_context"],
                        "active_window": metadata["active_window"],
                    },
                }

            # B. Get LLM Response (Streamed)
            llm_response_text = ""
            try:
                async for event in self._stream_llm_response(prompt):
                    if event["type"] == "full_response":
                        llm_response_text = event["content"]
                    else:
                        yield event
            except LLMRateLimitError:
                yield {"type": "error", "content": "Rate limit exceeded. Please wait."}
                return
            except Exception as e:
                logger.error(f"LLM error: {e}", exc_info=True)
                yield {"type": "error", "content": f"LLM error: {str(e)}"}
                return

            # C. Parse Response
            parsed_response = self.response_parser.parse_response(llm_response_text)
            
            # Emit assistant message transparency event
            yield {
                "type": "assistant_message_full",
                "content": llm_response_text,
            }
            
            # D. Decision Logic
            if not parsed_response.has_tool_calls:
                # No tools called -> Final answer
                final_response = parsed_response.text_content
                self.session.history.add_assistant_message(final_response)
                yield {"type": "streaming-complete"}
                break

            # E. Tool Execution
            # Add assistant message with tool calls to history (context is king!)
            self.session.history.add_assistant_message(llm_response_text)

            # Notify frontend of tool calls
            for tool_call in parsed_response.tool_calls:
                yield {
                    "type": "tool_call",
                    "tool_name": tool_call.tool_name,
                    "parameters": tool_call.parameters,
                    "raw_call": tool_call.raw_call,
                }

            # Execute tools
            try:
                async for event in self._execute_tools(parsed_response):
                    yield event
            except Exception as e:
                 logger.error(f"Critical tool execution error: {e}", exc_info=True)
                 yield {"type": "error", "content": f"Tool execution error: {str(e)}"}
                 break

        if iteration >= max_iterations:
            logger.warning("Max iterations reached in agent loop.")
            yield {"type": "error", "content": "I reached the maximum number of steps without finishing."}

        # Finalization (Events) - Handled by caller or separate method if needed,
        # but loop logic typically yields the final state.
        # The caller of this generator can handle the final response event if needed.
        if final_response:
            self.final_response = final_response # Store for access by caller

    async def _stream_llm_response(self, prompt: List[LLMMessage]) -> AsyncGenerator[StreamingEvent, None]:
        """Streams the LLM response and aggregates the full text."""
        full_text = ""
        model_id = self.session.cfg.selected_model_id
        async for event in self.llm_client.get_completion_stream(
            model=model_id, messages=prompt
        ):
            if event["type"] == "content":
                # Normalize 'content' to 'chunk' for frontend compatibility
                full_text += event["content"]
                yield {"type": "chunk", "content": event["content"]}
            elif event["type"] == "thinking":
                # Pass through thinking events
                yield event
            else:
                yield event
        
        yield {"type": "full_response", "content": full_text}

    async def _execute_tools(self, parsed_response: ParsedResponse) -> AsyncGenerator[StreamingEvent, None]:
        """Executes tools and delegates result processing."""
        
        yield {"type": "thinking", "content": f"Executing {len(parsed_response.tool_calls)} tool(s)..."}

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
            
            # Get active window at execution time
            from backend.src.tools.computer.window_utils import get_active_window_title
            active_window = get_active_window_title()
            
            # Yield Output Event with enhanced metadata
            yield {
                "type": "tool_output",
                "tool_name": result.tool_call.tool_name,
                "success": result.success,
                "execution_time": result.execution_time,
                "output": processed_output["tool_message"],
                "error": result.result.error,
                "screenshot": processed_output["screenshot_data"],
                "metadata": {
                    "active_window": active_window,
                    "execution_time": result.execution_time,
                    "success": result.success,
                },
            }

