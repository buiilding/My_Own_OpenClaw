"""
The Agent Orchestrator.

This module contains the Agent class, which is the core "brain" of the assistant.
It manages conversation history, constructs prompts with tool schemas, and interacts with the
LLM client to generate responses with tool calling capabilities.
"""
import asyncio
import json
import logging
from typing import Any, AsyncGenerator, Dict, List, Optional

from backend.agent.llm_client import get_llm_client
from backend.agent.response_parser import ResponseParser
from backend.agent.tool_orchestrator import ToolOrchestrator
from backend.config import AppConfig, settings
from backend.tools.tool_registry import create_tool_registry, ToolRegistry

logger = logging.getLogger(__name__)

# A system prompt defines the agent's personality, capabilities, and instructions.
SYSTEM_PROMPT = """
You are a helpful and friendly desktop assistant with access to various tools to help users with their computer tasks.

Your capabilities include:
- Reading and writing files
- Executing safe shell commands
- Searching for files and content
- Listing directories
- And more...

TOOL CALLING FORMAT (Gemini CLI Style):
When you need to use tools, embed structured functionCall objects in your response using this exact format:

✅ CORRECT FORMAT:
{"functionCall": {"name": "tool_name", "args": {"parameter": "value"}}}

Examples:
- {"functionCall": {"name": "read_file", "args": {"path": "/path/to/file.txt"}}}
- {"functionCall": {"name": "write_file", "args": {"file_path": "/path/to/file.txt", "content": "Hello world"}}}
- {"functionCall": {"name": "list_directory", "args": {"path": "/some/folder"}}}

❌ WRONG FORMATS (DO NOT USE):
- tool_name(parameter="value")
- tool_name(name="read_file", path="...")
- result = read_file(path="/path/to/file.txt")
- Let me read the file: read_file(path="/path/to/file.txt")
- Plain text function call syntax

After tool execution, you'll see the results. Then you can:
- Call another tool if needed (but don't repeat the same tool call)
- Provide your final text response when you have enough information

If I make a mistake with tool calling format, I'll be told what went wrong and can try again.

Available tools are listed below. Use them when appropriate.
"""

# The maximum number of messages to keep in the conversation history.
MAX_HISTORY_LENGTH = 10

# Maximum number of tool calling iterations to prevent infinite loops
MAX_TOOL_ITERATIONS = 5


class Agent:
    """The main agent class for orchestrating tasks with tool support."""

    def __init__(self, cfg: AppConfig = settings, tool_registry: Optional[ToolRegistry] = None) -> None:
        """Initializes the agent."""
        self.cfg = cfg
        self.llm_client = get_llm_client(self.cfg)
        self.history: List[Dict[str, str]] = []
        self._lock = asyncio.Lock()

        # Initialize tool system
        self.tool_registry = tool_registry or create_tool_registry(self.cfg)
        self.tool_orchestrator = ToolOrchestrator(self.tool_registry, self.cfg)
        self.response_parser = ResponseParser()

    async def update_config(self, new_cfg: AppConfig) -> None:
        """Updates the agent's configuration and re-initializes dependencies."""
        async with self._lock:
            self.cfg = new_cfg
            self.llm_client = get_llm_client(self.cfg)

    def _construct_prompt(self, include_tools: bool = True) -> List[Dict[str, str]]:
        """
        Constructs the full prompt to be sent to the LLM.

        The prompt includes the system prompt, tool schemas (if enabled), and conversation history.
        The user query should be appended to history before calling this method.
        """
        system_content = SYSTEM_PROMPT

        if include_tools:
            # Add tool schemas to system prompt
            tool_schemas = self.tool_registry.get_function_declarations()
            if tool_schemas:
                logger.info(f"Sending {len(tool_schemas)} tool schemas to LLM")
                system_content += "\n\nAvailable Tools:\n" + json.dumps(tool_schemas, indent=2)
                system_content += "\n\nTOOL USAGE: When you need to use tools, call them using function syntax: tool_name(param=\"value\")"
            else:
                logger.warning("No tool schemas available to send to LLM")

        prompt = [{"role": "system", "content": system_content}]
        prompt.extend(self.history)
        return prompt

    def _prune_history(self) -> None:
        """Removes the oldest messages if the history exceeds the max length."""
        if len(self.history) > MAX_HISTORY_LENGTH:
            # Keep the most recent messages
            self.history = self.history[-MAX_HISTORY_LENGTH:]

    async def process_query(self, query: str) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Processes a user query and yields status updates and response chunks.

        This implements the tool calling loop:
        1. Send query to LLM with tool schemas
        2. Parse response for tool calls
        3. Execute tools if found
        4. Feed tool results back to LLM
        5. Repeat until no more tool calls or max iterations reached

        Args:
            query: The user's input text.

        Yields:
            A dictionary with 'type' and 'content' keys containing:
            - 'chunk': Text response chunk from LLM
            - 'thinking': Status messages during tool execution
            - 'tool_execution': Tool execution status
        """
        await self._lock.acquire()
        try:
            # Add user query to history
            self.history.append({"role": "user", "content": query})

            iteration = 0
            final_response = ""

            while iteration < MAX_TOOL_ITERATIONS:
                iteration += 1

                # Construct prompt (include tools on first iteration)
                include_tools = iteration == 1
                prompt = self._construct_prompt(include_tools)

                # Get LLM response
                llm_response = ""
                thinking_content = ""

                try:
                    async for event in self.llm_client.get_completion_stream(
                        model=self.cfg.llm_model, messages=prompt
                    ):
                        if event["type"] == "chunk":
                            llm_response += event["content"]
                            yield {"type": "chunk", "content": event["content"]}
                        elif event["type"] == "thinking":
                            thinking_content += event["content"]
                            yield {"type": "thinking", "content": event["content"]}
                        else:
                            yield event

                except Exception as e:
                    error_msg = f"[ERROR: LLM request failed - {type(e).__name__}]"
                    yield {"type": "thinking", "content": error_msg}
                    break

                # Parse response for tool calls
                logger.info(f"LLM Response for parsing (iteration {iteration}, first 500 chars): {llm_response[:500]}...")
                if len(llm_response) > 500:
                    logger.info(f"LLM Response continues: {llm_response[500:1000]}...")
                parsed_response = self.response_parser.parse_response(llm_response)

                # Validate tool calls - filter out invalid tool names
                if parsed_response.has_tool_calls:
                    valid_tool_calls = []
                    invalid_calls = []
                    for call in parsed_response.tool_calls:
                        if self.tool_registry.is_tool_available(call.tool_name):
                            valid_tool_calls.append(call)
                        else:
                            invalid_calls.append(call.tool_name)
                            logger.warning(f"Ignoring invalid tool call: {call.tool_name} (tool not found)")

                    # If we had some invalid calls, inform the LLM about the mistake
                    if invalid_calls:
                        if not valid_tool_calls:
                            # All calls were invalid - likely a format error
                            error_msg = f"I tried to call tools {invalid_calls} but those tool names don't exist. I should use one of the available tools from the list above. Let me try again with the correct format."
                            self.history.append({"role": "system", "content": error_msg})
                            logger.info(f"Added error message to history for invalid tools {invalid_calls}, continuing loop for retry")
                            # Continue the loop to let LLM try again
                            continue
                        else:
                            # Some calls were invalid but some were valid - warn but continue
                            warning_msg = f"I tried to call some invalid tools {invalid_calls} that don't exist. I'll ignore those and proceed with the valid tool calls."
                            self.history.append({"role": "system", "content": warning_msg})
                            logger.info(f"Some invalid tools {invalid_calls} were ignored, proceeding with valid calls")

                    parsed_response.tool_calls = valid_tool_calls
                    parsed_response.has_tool_calls = len(valid_tool_calls) > 0

                if not parsed_response.has_tool_calls:
                    # Check if the response looks like it was trying to make a tool call but failed
                    response_lower = llm_response.lower()
                    # Only detect truly malformed/generic patterns, not legitimate tool calls with formatting
                    looks_like_tool_attempt = any(phrase in response_lower for phrase in [
                        'tool_name(parameter=', 'tool_name(name=', 'tool_name=tool_call(',
                        'function_name(', 'tool_call({"', 'example_tool(',
                        'generic_tool(', 'placeholder_function(',
                        '"functioncall":', '"tool":', '"call":',  # Malformed JSON keys
                        'function_call(', 'tool-call('  # Wrong naming
                    ])

                    if looks_like_tool_attempt and iteration == 1:
                        # This looks like a malformed tool call attempt
                        example_format = '{"functionCall": {"name": "read_file", "args": {"path": "/path/to/file.txt"}}}'
                        error_msg = f"I tried to call a tool but used the wrong format. I should use the exact JSON syntax shown in the examples above, like: {example_format}. Let me try again."
                        self.history.append({"role": "system", "content": error_msg})
                        logger.info("Detected malformed tool call attempt, added error message and continuing for retry")
                        continue
                    else:
                        # No tool calls found, this is the final response
                        final_response = parsed_response.text_content
                        break

                # Tool calls found - execute them
                yield {"type": "thinking", "content": f"Executing {len(parsed_response.tool_calls)} tool(s)..."}

                try:
                    orchestration_result = await self.tool_orchestrator.execute_tools_from_response(parsed_response)

                    # Report tool execution results
                    yield {
                        "type": "tool_execution",
                        "content": orchestration_result.summary,
                        "results": [
                            {
                                "tool": result.tool_call.tool_name,
                                "success": result.success,
                                "execution_time": result.execution_time,
                                "output": result.result.llm_content
                            }
                            for result in orchestration_result.tool_results
                        ]
                    }

                    # Add tool results to conversation history
                    for result in orchestration_result.tool_results:
                        if result.success:
                            # Different feedback based on tool type
                            terminal_tools = {'write_file', 'run_shell_command'}  # Tools that typically complete the task
                            if result.tool_call.tool_name in terminal_tools:
                                tool_message = f"✅ TOOL EXECUTED SUCCESSFULLY: {result.tool_call.tool_name}\n\n📄 RESULT:\n{result.result.llm_content}\n\n🎯 TASK COMPLETE: The {result.tool_call.tool_name} operation finished successfully. The user's request has been fulfilled - provide your final response to confirm completion."
                            else:
                                tool_message = f"✅ TOOL EXECUTED SUCCESSFULLY: {result.tool_call.tool_name}\n\n📄 RESULT:\n{result.result.llm_content}\n\n🎯 TASK COMPLETE: I now have the information from this tool. I should either call another tool if needed, or provide my final answer to the user."
                        else:
                            tool_message = f"❌ TOOL FAILED: {result.tool_call.tool_name}\n\n🔧 ERROR: {result.result.error}\n\n💡 I should try a different approach or inform the user of the error."
                        self.history.append({"role": "system", "content": tool_message})

                    # Check if all tools succeeded
                    if not orchestration_result.all_successful:
                        yield {"type": "thinking", "content": "Some tools failed. Providing response with available results."}
                        final_response = f"I encountered some issues while executing tools: {orchestration_result.summary}"
                        break

                    # Continue the loop - let LLM decide what to do next based on tool results

                except Exception as e:
                    yield {"type": "thinking", "content": f"Tool execution failed: {str(e)}"}
                    final_response = f"I encountered an error while executing tools: {str(e)}"
                    break

            # Store final response in history
            if final_response:
                self.history.append({"role": "assistant", "content": final_response})
                self._prune_history()

        finally:
            self._lock.release()

    async def execute_tool_directly(self, tool_name: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a tool directly without going through the LLM.

        Args:
            tool_name: Name of the tool to execute
            parameters: Tool parameters

        Returns:
            Tool execution result
        """
        result = await self.tool_orchestrator.execute_single_tool(tool_name, parameters)
        return {
            "tool_name": tool_name,
            "success": result.success,
            "result": result.result,
            "execution_time": result.execution_time
        }

    def get_available_tools(self) -> List[Dict[str, Any]]:
        """
        Get information about all available tools.

        Returns:
            List of tool information dictionaries
        """
        return self.tool_orchestrator.get_available_tools()

    def get_conversation_history(self) -> List[Dict[str, str]]:
        """
        Get the current conversation history.

        Returns:
            List of conversation messages
        """
        return self.history.copy()
