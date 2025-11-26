"""
Agent Executor - Core execution loop for the agent.

This module implements the main agent execution loop that processes user queries,
manages tool execution, handles LLM streaming, and coordinates memory operations.
"""
import logging
from typing import TYPE_CHECKING, Any, AsyncGenerator, List, Optional

from backend.src.llm.parser import ParsedResponse, ResponseParser
from backend.src.tools.orchestrator import ToolOrchestrator
from backend.src.agent.plugins.manager import PluginManager
from backend.src.llm.llm_client import LLMClient
from backend.src.llm.prompt_constructor import PromptConstructor
from backend.src.core.exceptions import LLMRateLimitError
from backend.src.core.interfaces.tool import ToolResult
from backend.src.core.types import StreamingEvent, LLMMessage

if TYPE_CHECKING:
    from backend.src.agent.core import AgentSession

logger = logging.getLogger(__name__)


class AgentExecutor:
    """
    Executes the agent loop: Prompt -> LLM -> Parse -> Tools -> Repeat.
    Refactored for better readability and scalability.
    """

    def __init__(
        self,
        session: "AgentSession",
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

        # Initialize Plugin Manager (uses global plugin registry)
        # Plugins are auto-discovered and registered at startup in main.py
        self.plugin_manager = PluginManager(use_registry=True)

    async def process_query(self, query: str) -> AsyncGenerator[StreamingEvent, None]:
        """
        Processes a user query and yields status updates and response chunks.
        """
        # 1. Retrieve memories for this user query and format with message
        user_message_with_memory = await self._retrieve_and_format_memories(query)
        
        # Add user query with memory to history (as user message)
        self.session.history.add_user_message(user_message_with_memory)

        # 2. Main Execution Loop
        iteration = 0
        max_iterations = self.session.cfg.max_agent_iterations
        
        final_response = ""
        
        while iteration < max_iterations:
            iteration += 1
            
            # A. Build Prompt
            prompt = self.prompt_builder.build_prompt(
                self.session.history.get_history(),
                include_tools=(iteration == 1),
            )

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
            
            # D. Decision Logic
            if not parsed_response.has_tool_calls:
                # No tools called -> Final answer
                final_response = parsed_response.text_content
                self.session.history.add_assistant_message(final_response)
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
        """Executes tools and updates history/memory."""
        
        yield {"type": "thinking", "content": f"Executing {len(parsed_response.tool_calls)} tool(s)..."}

        # Execute tools with explicit session reference
        orchestration_result = await self.tool_orchestrator.execute_tools_from_response(
            parsed_response,
            user_id=self.session.user_id,
            session_id=self.session.session_id,
            session_ref=self.session,  # Pass session reference explicitly
        )
        
        # Process Results
        for result in orchestration_result.tool_results:
            # 1. Plugin Hooks (e.g. Computer Use, OCR)
            plugin_result = await self.plugin_manager.on_tool_end(
                result.tool_call.tool_name, result.result
            )
            
            # Merge plugin artifacts into tool result
            if plugin_result and plugin_result.artifacts:
                if result.result.artifacts is None:
                    result.result.artifacts = {}
                result.result.artifacts.update(plugin_result.artifacts)
                
                # Store OCR results in session for ClickOCRTool access
                if "ocr_results" in plugin_result.artifacts:
                    # Initialize OCR cache if needed
                    if not hasattr(self.session, "_ocr_results_cache"):
                        self.session._ocr_results_cache = {}
                    # Store latest OCR results
                    self.session._ocr_results_cache["latest"] = plugin_result.artifacts["ocr_results"]
                    logger.debug(f"Stored {len(plugin_result.artifacts['ocr_results'])} OCR results in session cache")
            
            # Extract screenshot data (helper method to avoid nested checks)
            screenshot_data = self._extract_screenshot_data(result.result, plugin_result)

            # Construct the full tool message for both History and UI
            # This ensures the UI displays EXACTLY what the LLM sees in its history
            if result.success:
                # Use llm_content which may include OCR results from plugin
                content = result.result.llm_content or result.result.return_display or str(result.result.data or "No output")
                tool_message = f"TOOL EXECUTED SUCCESSFULLY: {result.tool_call.tool_name}\n\n Tool Output:\n{content}"
            else:
                tool_message = f"TOOL FAILED: {result.tool_call.tool_name}\n\n Tool Error: {result.result.error}"
            
            # Append screenshot text indicator if screenshot is present
            # This matches the system prompt format: "📸 State of the screen after..."
            if screenshot_data:
                tool_message += f"\n\n📸 State of the screen after {result.tool_call.tool_name} was executed:"

            # Update history with the exact message
            self.session.history.add_tool_output(tool_message, screenshot_data)

            # 2. Yield Output Event
            # Send the EXACT SAME message to the frontend
            # This ensures full transparency - user sees what AI sees
            
            yield {
                "type": "tool_output",
                "tool_name": result.tool_call.tool_name,
                "success": result.success,
                "execution_time": result.execution_time,
                "output": tool_message,  # Use the full formatted message
                "error": result.result.error,
                "screenshot": screenshot_data,
            }

            # 3. Store Semantic Memories
            await self._process_tool_memories(result.result, result.tool_call.tool_name)

    def _extract_screenshot_data(self, tool_result: ToolResult, plugin_result: Optional[Any]) -> Optional[str]:
        """
        Extract screenshot data from tool result or plugin artifacts.
        
        Args:
            tool_result: Tool execution result
            plugin_result: Optional plugin result with artifacts
            
        Returns:
            Base64 screenshot data or None
        """
        # Check plugin artifacts first (ComputerUsePlugin provides screenshots here)
        if plugin_result and plugin_result.artifacts and "screenshot" in plugin_result.artifacts:
            return plugin_result.artifacts["screenshot"]
        
        # Check tool result artifacts
        if tool_result.artifacts and "screenshot" in tool_result.artifacts:
            return tool_result.artifacts["screenshot"]
        
        # Check tool result data dict (SDK tools often return it here)
        if isinstance(tool_result.data, dict) and "screenshot" in tool_result.data:
            return tool_result.data["screenshot"]
        
        return None

    async def _process_tool_memories(self, tool_result: ToolResult, tool_name: str):
        """Extracts and stores memories from tool results."""
        if tool_result.episodic_memories:
            for memory in tool_result.episodic_memories:
                memory_content = f"[Tool: {tool_name}] {memory.get('description', str(memory))}"
                if memory.get("context"):
                    memory_content += f" | Context: {memory['context']}"
                await self.session.memory_manager.store_episodic_memory(
                    f"Tool execution: {tool_name}", memory_content
                )
        
        if tool_result.semantic_facts:
            for fact in tool_result.semantic_facts:
                await self.session.memory_manager.memory_store.add(
                    text=fact.strip(),
                    user_id=self.session.memory_manager.user_id,
                    metadata={"type": "semantic", "source": f"tool_execution_{tool_name}", "tool_name": tool_name},
                )

    async def _retrieve_and_format_memories(self, query: str) -> str:
        """
        Retrieve memories for a user query and format them with explicit sections.
        
        Args:
            query: User query text
            
        Returns:
            Formatted string with [MAIN MESSAGE], [EPISODIC CONTEXT], and [PROCEDURAL CONTEXT] sections
        """
        memories = await self.session.memory_manager.retrieve_memories(query)
        memory_context = self.session.memory_manager.format_context(memories)
        
        # Build formatted message with explicit sections
        sections = [
            "[MAIN MESSAGE — Assistant should respond ONLY to this section]",
            query
        ]
        
        if memory_context:
            sections.append(memory_context)
        
        return "\n\n".join(sections)

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
