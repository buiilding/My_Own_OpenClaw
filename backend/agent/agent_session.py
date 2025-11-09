"""
The Agent Session.

This module contains the Agent class, which is the core "brain" of the assistant.
It manages conversation history, constructs prompts with tool schemas, and interacts with the
LLM client to generate responses with tool calling capabilities.
"""
import asyncio
import logging
import re
import uuid
from typing import Any, AsyncGenerator, Dict, List, Optional

from backend.agent.execution.response_parser import ParsedResponse, ResponseParser
from backend.agent.execution.tool_orchestrator import ToolOrchestrator
from backend.agent.llm.llm_client import LLMClient, get_llm_client
from backend.agent.llm.prompt_constructor import PromptConstructor
from backend.agent.prompts import format_screenshot_message
from backend.agent.state.conversation_history import ConversationHistory
from backend.agent.state.exceptions import ToolExecutionError
from backend.config import AppConfig
from backend.memory.memory_manager import MemoryManager
from backend.tools.registry import ToolRegistry, create_tool_registry

logger = logging.getLogger(__name__)

# Maximum number of tool calling iterations to prevent infinite loops
MAX_TOOL_ITERATIONS = 5


class AgentSession:
    """The main agent class for orchestrating tasks with tool support."""

    def __init__(
        self,
        cfg: AppConfig,
        tool_registry: Optional[ToolRegistry] = None,
        user_id: str = "default_user",
    ) -> None:
        """Initializes the agent session."""
        self.cfg = cfg
        self.llm_client: LLMClient = get_llm_client(self.cfg)
        self._lock = asyncio.Lock()

        # Initialize tool system
        self.tool_registry = tool_registry or create_tool_registry(self.cfg)
        self.tool_orchestrator = ToolOrchestrator(self.tool_registry, self.cfg)
        self.response_parser = ResponseParser()

        # Initialize state management
        self.history = ConversationHistory()
        self.prompt_builder = PromptConstructor(self.tool_registry)

        # Initialize memory system
        self.user_id = user_id
        self.session_id = str(uuid.uuid4())
        self.memory_manager = MemoryManager(
            user_id=self.user_id, session_id=self.session_id, cfg=self.cfg
        )

    async def update_config(self, new_cfg: AppConfig) -> None:
        """Updates the agent's configuration and re-initializes dependencies."""
        async with self._lock:
            self.cfg = new_cfg
            self.llm_client = get_llm_client(self.cfg)

    async def _get_llm_response_stream(
        self, prompt: List[Dict[str, str]]
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Gets a streaming completion from the LLM, yielding events."""
        llm_response_content = ""
        try:
            async for event in self.llm_client.get_completion_stream(
                model=self.cfg.llm_model, messages=prompt
            ):
                if event["type"] == "chunk":
                    llm_response_content += event["content"]
                yield event
        except Exception as e:
            error_msg = f"[ERROR: LLM request failed - {type(e).__name__}]"
            yield {"type": "thinking", "content": error_msg}
            # Re-raise or handle appropriately if you need to stop execution
            raise

        yield {"type": "full_response", "content": llm_response_content}

    def _parse_and_validate_tool_calls(self, llm_response: str):
        """Parses the LLM response for tool calls and validates them."""
        parsed_response = self.response_parser.parse_response(llm_response)

        if not parsed_response.has_tool_calls:
            return parsed_response, None

        valid_tool_calls = []
        invalid_calls = []
        for call in parsed_response.tool_calls:
            if self.tool_registry.is_tool_available(call.tool_name):
                valid_tool_calls.append(call)
            else:
                invalid_calls.append(call.tool_name)
                logger.warning(
                    f"Ignoring invalid tool call: {call.tool_name} (tool not found)"
                )

        parsed_response.tool_calls = valid_tool_calls
        parsed_response.has_tool_calls = len(valid_tool_calls) > 0

        return parsed_response, invalid_calls

    async def _execute_tools(
        self, parsed_response: ParsedResponse
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Executes tool calls and yields results."""
        yield {
            "type": "thinking",
            "content": f"Executing {len(parsed_response.tool_calls)} tool(s)...",
        }

        orchestration_result = await self.tool_orchestrator.execute_tools_from_response(
            parsed_response
        )

        # Store screenshot data for computer tools to include in conversation history
        tool_screenshots = {}
        computer_tools = {"mouse_control", "keyboard_control", "scroll_control"}

        # Send individual tool output messages for each tool result
        for result in orchestration_result.tool_results:
            # For computer tools and screenshot tool, include screenshot data if available
            screenshot_data = None

            if result.tool_call.tool_name == "screenshot" and result.success:
                # Screenshot tool returns its own screenshot data
                if result.result.data and "screenshot" in result.result.data:
                    screenshot_data = result.result.data["screenshot"]
                    # Store for conversation history
                    tool_screenshots[result.tool_call.tool_name] = screenshot_data
                    logger.info(
                        f"Screenshot captured: {len(screenshot_data)} characters of base64 data"
                    )
                else:
                    logger.warning(
                        f"Screenshot tool succeeded but no screenshot data in result.data: {result.result.data}"
                    )
                    screenshot_data = None
            elif result.tool_call.tool_name in computer_tools and result.success:
                try:
                    # Try to get screenshot for display in UI and LLM analysis
                    screenshot_result = await self.tool_registry.execute_tool(
                        "screenshot"
                    )
                    if (
                        screenshot_result.success
                        and screenshot_result.data
                        and "screenshot" in screenshot_result.data
                    ):
                        screenshot_data = screenshot_result.data["screenshot"]
                        # Store for conversation history
                        tool_screenshots[result.tool_call.tool_name] = screenshot_data
                except Exception as e:
                    logger.debug(f"Could not capture screenshot for UI display: {e}")

            tool_output_event = {
                "type": "tool_output",
                "tool_name": result.tool_call.tool_name,
                "success": result.success,
                "execution_time": result.execution_time,
                "output": result.result.llm_content
                or result.result.return_display
                or str(result.result.data),
                "error": result.result.error,
                "screenshot": screenshot_data,  # Include screenshot for UI display
            }

            yield tool_output_event

        # Report tool execution summary (for backwards compatibility)
        yield {
            "type": "tool_execution",
            "content": orchestration_result.summary,
            "results": [
                {
                    "tool": result.tool_call.tool_name,
                    "success": result.success,
                    "execution_time": result.execution_time,
                    "output": result.result.llm_content,
                }
                for result in orchestration_result.tool_results
            ],
        }

        # Add tool results to conversation history
        for result in orchestration_result.tool_results:
            if result.success:
                # Build tool message (same format for all tools)
                tool_message = f"✅ TOOL EXECUTED SUCCESSFULLY: {result.tool_call.tool_name}\n\n📄 RESULT:\n{result.result.llm_content}"

                # For computer tools, include screenshot data for LLM analysis
                if result.tool_call.tool_name in tool_screenshots:
                    screenshot_data = tool_screenshots[result.tool_call.tool_name]
                    tool_message += format_screenshot_message(
                        result.tool_call.tool_name, screenshot_data
                    )
                    logger.info(
                        f"Added screenshot to conversation history for {result.tool_call.tool_name}: {len(screenshot_data)} chars"
                    )
                else:
                    if result.tool_call.tool_name == "screenshot":
                        logger.warning(
                            "Screenshot tool succeeded but screenshot not found in tool_screenshots dict"
                        )
            else:
                tool_message = f"❌ TOOL FAILED: {result.tool_call.tool_name}\n\n🔧 ERROR: {result.result.error}\n\n💡 I should try a different approach or inform the user of the error."
            self.history.add_message("user", tool_message)

        if not orchestration_result.all_successful:
            raise ToolExecutionError(
                f"Some tools failed: {orchestration_result.summary}"
            )

    def _handle_invalid_tool_calls(self, invalid_calls, has_valid_calls):
        """Handles invalid tool calls by adding a message to history."""
        if not invalid_calls:
            return

        if not has_valid_calls:
            # All calls were invalid
            error_msg = f"I tried to call tools {invalid_calls} but those tool names don't exist. I should use one of the available tools from the list above. Let me try again with the correct format."
            self.history.add_message("user", error_msg)
            logger.info(
                f"Added error message to history for invalid tools {invalid_calls}, continuing loop for retry"
            )
        else:
            # Some calls were invalid
            warning_msg = f"I tried to call some invalid tools {invalid_calls} that don't exist. I'll ignore those and proceed with the valid tool calls."
            self.history.add_message("system", warning_msg)
            logger.info(
                f"Some invalid tools {invalid_calls} were ignored, proceeding with valid calls"
            )

    def _is_malformed_tool_attempt(self, llm_response: str) -> bool:
        """Checks if a response looks like a malformed tool call attempt."""
        response_lower = llm_response.lower()
        # A more robust regex could be used here. For now, keeping it simple.
        malformed_patterns = [
            r"tool_name\s*\(\s*parameter=",
            r"tool_name\s*\(\s*name=",
            r"tool_name\s*=\s*tool_call\(",
            r"function_name\s*\(",
            r'tool_call\s*\(\s*{"',
            r"example_tool\s*\(",
            r"generic_tool\s*\(",
            r"placeholder_function\s*\(",
            r'"functioncall":',
            r'"tool":',
            r'"call":',
            r"function_call\s*\(",
            r"tool-call\s*\(",
        ]
        return any(re.search(pattern, response_lower) for pattern in malformed_patterns)

    async def process_query(self, query: str) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Processes a user query and yields status updates and response chunks.
        This implements the main tool calling loop.
        """
        await self._lock.acquire()
        try:
            if not self.cfg.selected_model_id:
                yield {
                    "type": "thinking",
                    "content": "No model selected. Please select a model in settings.",
                }
                return

            # Retrieve memories
            memories = self.memory_manager.retrieve_memories(query)
            memory_context = self.memory_manager.format_context(memories)

            # Prepend memory context to the user query
            enriched_query = f"{memory_context}\n\nUser: {query}"
            self.history.add_message("user", enriched_query)

            final_response = ""

            for iteration in range(1, MAX_TOOL_ITERATIONS + 1):
                prompt = self.prompt_builder.build_prompt(
                    self.history.get_history(), include_tools=(iteration == 1)
                )
                llm_response = ""

                try:
                    async for event in self._get_llm_response_stream(prompt):
                        if event["type"] == "full_response":
                            llm_response = event["content"]
                        else:
                            yield event
                except Exception:
                    break  # Error already yielded, exit loop

                logger.info(
                    f"LLM Response (iteration {iteration}, first 500 chars): {llm_response[:500]}..."
                )

                parsed_response, invalid_calls = self._parse_and_validate_tool_calls(
                    llm_response
                )

                self._handle_invalid_tool_calls(
                    invalid_calls, parsed_response.has_tool_calls
                )

                if invalid_calls and not parsed_response.has_tool_calls:
                    continue  # All calls were invalid, retry

                # Send tool call messages to frontend
                if parsed_response.has_tool_calls:
                    for tool_call in parsed_response.tool_calls:
                        yield {
                            "type": "tool_call",
                            "tool_name": tool_call.tool_name,
                            "parameters": tool_call.parameters,
                            "raw_call": tool_call.raw_call,
                        }

                if not parsed_response.has_tool_calls:
                    if iteration == 1 and self._is_malformed_tool_attempt(llm_response):
                        example_format = '{"functionCall": {"name": "read_file", "args": {"path": "/path/to/file.txt"}}}'
                        error_msg = f"I tried to call a tool but used the wrong format. I should use the exact JSON syntax shown in the examples, like: {example_format}. Let me try again."
                        self.history.add_message("user", error_msg)
                        logger.info(
                            "Detected malformed tool call attempt, continuing for retry"
                        )
                        continue
                    else:
                        # Final response, no more tool calls
                        final_response = parsed_response.text_content
                        self.history.add_message("assistant", final_response)
                        break

                # Execute tools
                try:
                    async for event in self._execute_tools(parsed_response):
                        yield event
                except ToolExecutionError as e:
                    yield {"type": "thinking", "content": str(e)}
                    # Let the LLM respond to the tool failure
                    continue
                except Exception as e:
                    yield {
                        "type": "thinking",
                        "content": f"An unexpected error occurred during tool execution: {str(e)}",
                    }
                    break  # Exit on unexpected error

            # Store the interaction in episodic memory
            if final_response:
                self.memory_manager.store_episodic_memory(query, final_response)

        finally:
            self._lock.release()
