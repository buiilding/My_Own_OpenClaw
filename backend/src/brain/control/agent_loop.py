import asyncio
import logging
from typing import Any, AsyncGenerator, Dict, List, Optional

from backend.src.brain.processing.parser import ParsedResponse, ResponseParser
from backend.src.brain.control.orchestrator import ToolOrchestrator
from backend.src.brain.control.plugin_manager import PluginManager
from backend.src.brain.control.plugins.computer import ComputerUsePlugin
from backend.src.brain.llm.llm_client import LLMClient, RateLimitError
from backend.src.brain.llm.prompt_constructor import PromptConstructor
from backend.src.brain.prompts import format_screenshot_message
from backend.src.brain.state.exceptions import ToolExecutionError
from backend.src.tools.base import ToolResult

logger = logging.getLogger(__name__)


class AgentExecutor:
    """
    Executes the agent loop: Prompt -> LLM -> Parse -> Tools -> Repeat.
    Refactored for better readability and scalability.
    """

    def __init__(
        self,
        session: Any,  # AgentSession forward reference
        llm_client: LLMClient,
        tool_orchestrator: ToolOrchestrator,
        prompt_constructor: PromptConstructor,
        response_parser: ResponseParser,
    ):
        self.session = session
        self.llm_client = llm_client
        self.tool_orchestrator = tool_orchestrator
        self.prompt_builder = prompt_constructor
        self.response_parser = response_parser

        # Initialize Plugin Manager
        self.plugin_manager = PluginManager()
        self.plugin_manager.register(
            ComputerUsePlugin(
                tool_registry=self.session.tool_registry,
                screenshot_delay=self.session.cfg.screenshot_delay_after_action,
            )
        )

    async def process_query(self, query: str) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Processes a user query and yields status updates and response chunks.
        """
        # 1. Context Preparation
        memories = self.session.memory_manager.retrieve_memories(query)
        memory_context = self.session.memory_manager.format_context(memories)
        
        # Add user query to history
        self.session.history.add_message("user", query)

        # 2. Main Execution Loop
        iteration = 0
        max_iterations = 10 # Guard rail against infinite loops
        
        final_response = ""
        
        while iteration < max_iterations:
            iteration += 1
            
            # A. Build Prompt
            prompt = self.prompt_builder.build_prompt(
                self.session.history.get_history(),
                include_tools=(iteration == 1),
                memory_context=memory_context,
            )

            # B. Get LLM Response (Streamed)
            llm_response_text = ""
            try:
                async for event in self._stream_llm_response(prompt):
                    if event["type"] == "full_response":
                        llm_response_text = event["content"]
                    else:
                        yield event
            except RateLimitError:
                yield {"type": "error", "content": "Rate limit exceeded. Please wait."}
                return
            except Exception as e:
                logger.error(f"LLM error: {e}", exc_info=True)
                yield {"type": "error", "content": f"LLM error: {str(e)}"}
                return

            # C. Parse Response
            parsed_response = self.response_parser.parse_response(llm_response_text)
            
            # D. Decision Logic
            if not parsed_response.has_tool_calls:
                # No tools called -> Final answer
                final_response = parsed_response.text_content
                self.session.history.add_message("assistant", final_response)
                yield {"type": "streaming-complete"}
                break

            # E. Tool Execution
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

        # 3. Finalization (Events)
        if final_response:
            await self._publish_completion_event(query, final_response)


    async def _stream_llm_response(self, prompt: List[Dict[str, str]]) -> AsyncGenerator[Dict[str, Any], None]:
        """Streams the LLM response and aggregates the full text."""
        full_text = ""
        async for event in self.llm_client.get_completion_stream(
            model=self.session.cfg.llm_model, messages=prompt
        ):
            if event["type"] == "chunk":
                full_text += event["content"]
                yield event
            elif event["type"] == "thinking_chunk":
                yield {"type": "thinking", "content": event["content"]}
            else:
                yield event
        
        yield {"type": "full_response", "content": full_text}


    async def _execute_tools(self, parsed_response: ParsedResponse) -> AsyncGenerator[Dict[str, Any], None]:
        """Executes tools and updates history/memory."""
        
        yield {"type": "thinking", "content": f"Executing {len(parsed_response.tool_calls)} tool(s)..."}

        orchestration_result = await self.tool_orchestrator.execute_tools_from_response(parsed_response)
        
        # Process Results
        tool_screenshots = {}
        
        for result in orchestration_result.tool_results:
            # 1. Plugin Hooks (e.g. Computer Use)
            plugin_result = await self.plugin_manager.on_tool_end(
                result.tool_call.tool_name, result.result
            )
            
            screenshot_data = None
            if plugin_result and plugin_result.artifacts and "screenshot" in plugin_result.artifacts:
                 screenshot_data = plugin_result.artifacts["screenshot"]
            elif result.result.artifacts and "screenshot" in result.result.artifacts:
                 screenshot_data = result.result.artifacts["screenshot"]
                 
            if screenshot_data:
                tool_screenshots[result.tool_call.tool_name] = screenshot_data

            # 2. Yield Output Event
            yield {
                "type": "tool_output",
                "tool_name": result.tool_call.tool_name,
                "success": result.success,
                "execution_time": result.execution_time,
                "output": result.result.return_display or str(result.result.data),
                "error": result.result.error,
                "screenshot": screenshot_data,
            }

            # 3. Store Semantic Memories
            await self._process_tool_memories(result.result, result.tool_call.tool_name)

        # 4. Update Conversation History
        for result in orchestration_result.tool_results:
            self._update_history_with_tool_result(result, tool_screenshots.get(result.tool_call.tool_name))

    def _update_history_with_tool_result(self, result, screenshot_data: Optional[str]):
        """Updates the conversation history with the tool result."""
        if result.success:
            tool_message = f"TOOL EXECUTED SUCCESSFULLY: {result.tool_call.tool_name}\n\n Tool Output:\n{result.result.llm_content}"
            if screenshot_data:
                tool_message += format_screenshot_message(result.tool_call.tool_name, screenshot_data)
        else:
            tool_message = f"TOOL FAILED: {result.tool_call.tool_name}\n\n Tool Error: {result.result.error}"
            
        self.session.history.add_message("user", tool_message)


    async def _process_tool_memories(self, tool_result: ToolResult, tool_name: str):
        """Extracts and stores memories from tool results."""
        if tool_result.episodic_memories:
            for memory in tool_result.episodic_memories:
                memory_content = f"[Tool: {tool_name}] {memory.get('description', str(memory))}"
                if memory.get("context"):
                    memory_content += f" | Context: {memory['context']}"
                self.session.memory_manager.store_episodic_memory(
                    f"Tool execution: {tool_name}", memory_content
                )
        
        if tool_result.semantic_facts:
            for fact in tool_result.semantic_facts:
                self.session.memory_manager.memory_store.add(
                    text=fact.strip(),
                    user_id=self.session.memory_manager.user_id,
                    metadata={"type": "semantic", "source": f"tool_execution_{tool_name}", "tool_name": tool_name},
                )

    async def _publish_completion_event(self, query: str, response: str):
        """Publishes the InteractionCompleted event."""
        from backend.src.core.bus import message_bus
        from backend.src.core.events import InteractionCompleted
        
        event = InteractionCompleted(
            session_id=self.session.session_id,
            user_id=self.session.user_id,
            user_message=query,
            assistant_response=response
        )
        await message_bus.publish(event)
