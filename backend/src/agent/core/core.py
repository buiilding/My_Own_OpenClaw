"""
The Agent Session.

This module contains the Agent class, which is the core "brain" of the assistant.
It manages conversation history and orchestrates the execution using AgentExecutor.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from typing import TYPE_CHECKING, Any, AsyncGenerator, Dict, Optional

from backend.src.agent.core.executor import AgentExecutor
from backend.src.agent.core.state import ConversationHistory
from backend.src.core.bus import EventBus
from backend.src.core.config import AppConfig
from backend.src.core.events import InteractionCompleted
from backend.src.core.plugins.registry import PluginRegistry
from backend.src.llm.llm_client import LLMClient, get_llm_client
from backend.src.llm.parser import ResponseParser
from backend.src.llm.prompt_constructor import PromptConstructor
from backend.src.tools.registry import ToolRegistry

if TYPE_CHECKING:
    from backend.src.tools.orchestrator import ToolOrchestrator

logger = logging.getLogger(__name__)


class AgentSession:
    """
    The main agent class for orchestrating tasks with tool support.

    AgentSession manages conversation state and coordinates between the LLM,
    tool execution, and memory systems. It processes user queries through
    a complete pipeline: query processing → LLM interaction → tool execution → response streaming.

    Key responsibilities:
    - Maintain conversation history and context
    - Coordinate LLM interactions with tool calls
    - Stream responses back to clients
    - Persist conversation memory
    - Handle session lifecycle events

    Attributes:
        cfg: Application configuration
        user_id: Unique identifier for the user
        session_id: Unique identifier for this session
        tool_registry: Registry of available tools
        llm_client: Client for LLM provider interactions
        history: Conversation history for this session
    """

    def __init__(
        self,
        cfg: AppConfig,
        tool_registry: ToolRegistry,
        plugin_registry: PluginRegistry,
        llm_client: Optional[LLMClient] = None,
        tool_orchestrator: Optional[ToolOrchestrator] = None,
        event_bus: Optional[EventBus] = None,
        user_id: str = "default_user",
        session_id: Optional[str] = None,
    ) -> None:
        """
        Initialize the agent session.

        Args:
            cfg: Application configuration object
            tool_registry: Registry containing all available tools
            plugin_registry: Registry for plugin management
            llm_client: LLM client instance (auto-created if None)
            tool_orchestrator: Tool orchestration instance (auto-created if None)
            event_bus: EventBus instance for event communication (required)
            user_id: User identifier for session ownership
            session_id: Session identifier (auto-generated if None)
        """
        self.cfg = cfg
        self.llm_client: LLMClient = llm_client or get_llm_client(self.cfg)
        self._lock = asyncio.Lock()

        # Initialize tool system
        self.tool_registry = tool_registry
        if tool_orchestrator is None:
            from backend.src.tools.orchestrator import ToolOrchestrator

            self.tool_orchestrator = ToolOrchestrator(self.tool_registry, self.cfg)
        else:
            self.tool_orchestrator = tool_orchestrator
        self.response_parser = ResponseParser()

        # Initialize state management
        self.prompt_builder = PromptConstructor(self.tool_registry)
        self.history = ConversationHistory(
            max_length=None,  # Disable pruning
            system_prompt=self.prompt_builder.system_prompt
        )

        # Initialize context info
        self.user_id = user_id
        self.session_id = session_id or str(uuid.uuid4())

        # Store event bus
        if event_bus is None:
            raise ValueError("event_bus is required for AgentSession")
        self.event_bus = event_bus

        # Initialize Executor
        self.executor = AgentExecutor(
            session=self,
            llm_client=self.llm_client,
            tool_orchestrator=self.tool_orchestrator,
            prompt_constructor=self.prompt_builder,
            response_parser=self.response_parser,
            plugin_registry=plugin_registry,
            event_bus=self.event_bus,
        )

        # Subscribe to events
        self.event_bus.subscribe(InteractionCompleted, self._on_interaction_completed)

        # Session-scoped state for computer use
        self.latest_screenshot: Optional[str] = None
        self.latest_ocr_results: Optional[list[dict]] = None
        self.screenshot_waiter: Optional[asyncio.Future] = None
        self.hidden_screenshot_request_id: Optional[str] = None
        self._tool_result_futures: Dict[str, asyncio.Future] = {}
        # Tool result storage (initialized here to avoid lazy initialization)
        self._pending_tool_results: Dict[str, Any] = {}
        self._bundled_results: Dict[str, Any] = {}
        # Initialize event as set (no OCR in progress initially)
        # When OCR starts, event is cleared; when OCR completes, event is set
        self.ocr_completion_event = asyncio.Event()
        self.ocr_completion_event.set()  # Set initially (no OCR running)

    async def _on_interaction_completed(self, event: InteractionCompleted) -> None:
        """Handle interaction completed event."""
        # Only handle events for this session
        if event.session_id != self.session_id:
            return

        logger.debug(f"Interaction completion for session {self.session_id}")
        # Memory storage is now handled by the frontend

    async def update_config(self, new_cfg: AppConfig) -> None:
        """Updates the agent's configuration and re-initializes dependencies."""
        async with self._lock:
            self.cfg = new_cfg
            # Re-initialize LLM client with new config
            self.llm_client = get_llm_client(self.cfg)
            self.executor.llm_client = self.llm_client

    async def process_query(
        self, 
        query: str, 
        image_data: Optional[str] = None,
        message_content: Optional[str] = None,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Processes a user query and yields status updates and response chunks.
        
        Args:
            query: The user's query text (for reference)
            image_data: Optional base64-encoded image data for multimodal queries
            message_content: Complete message content from frontend (system state + memories + query)
        """
        async with self._lock:
            if not self.cfg.selected_model_id:
                yield {
                    "type": "thinking",
                    "content": "No model selected. Please select a model in settings.",
                }
                return

            async for event in self.executor.process_query(
                query, 
                image_data=image_data, 
                message_content=message_content,
            ):
                yield event
    
    async def process_frontend_tool_result(
        self,
        request_id: str,
        success: bool,
        result_data: Optional[Dict[str, Any]],
        error: Optional[str],
        metadata: Dict[str, Any]
    ) -> None:
        """
        Process a tool result from the frontend.
        
        Public entry point that delegates to internal methods.
        This method should be small and delegate to:
        - _handle_bundled_results() for bundles
        - _handle_individual_result() for single results
        - _handle_screenshot_waiter() for hidden screenshots
        - _maybe_trigger_ocr() for OCR policy
        
        This method encapsulates all session state mutation that was
        previously done by ToolResultHandler. Handlers should call this
        method instead of mutating session internals directly.
        
        Args:
            request_id: Request ID for the tool result
            success: Whether tool execution succeeded
            result_data: Tool result data (may contain bundled flag)
            error: Error message if execution failed
            metadata: Additional metadata
        """
        # Route to appropriate handler based on result type
        if isinstance(result_data, dict) and result_data.get("bundled"):
            await self._handle_bundled_results(result_data, request_id)
            return
        
        # Handle hidden screenshot requests
        if self._is_screenshot_waiter_request(request_id):
            await self._handle_screenshot_waiter(request_id, result_data)
            return
        
        # Handle individual tool result
        await self._handle_individual_result(request_id, success, result_data, error, metadata)
    
    def _is_screenshot_waiter_request(self, request_id: str) -> bool:
        """
        Check if request_id matches active screenshot waiter.
        
        Args:
            request_id: Request ID to check
            
        Returns:
            True if this is a hidden screenshot request
        """
        return (
            self.screenshot_waiter is not None and
            not self.screenshot_waiter.done() and
            self.hidden_screenshot_request_id == request_id
        )
    
    async def _handle_screenshot_waiter(
        self,
        request_id: str,
        result_data: Optional[Dict[str, Any]]
    ) -> None:
        """
        Handle hidden screenshot request - resolves waiter and returns early.
        
        Args:
            request_id: Request ID for the screenshot
            result_data: Result data (may contain screenshot)
        """
        screenshot_data = None
        if isinstance(result_data, dict) and "screenshot" in result_data:
            screenshot_data = result_data["screenshot"]
        
        if screenshot_data:
            self.screenshot_waiter.set_result(screenshot_data)
            logger.info(f"Resolved hidden screenshot waiter for request {request_id[:15]}")
        else:
            self.screenshot_waiter.set_exception(ValueError("No screenshot data in result"))
            logger.warning(f"Hidden screenshot request {request_id[:15]} returned no data")
        
        # Reset waiter state
        self.screenshot_waiter = None
        self.hidden_screenshot_request_id = None
    
    async def _handle_individual_result(
        self,
        request_id: str,
        success: bool,
        result_data: Optional[Dict[str, Any]],
        error: Optional[str],
        metadata: Dict[str, Any]
    ) -> None:
        """
        Handle individual tool result - stores result and resolves futures.
        
        Args:
            request_id: Request ID for the tool result
            success: Whether tool execution succeeded
            result_data: Tool result data
            error: Error message if execution failed
            metadata: Additional metadata
        """
        from backend.src.core.interfaces.tool import ToolResult
        
        # Convert frontend result to ToolResult format
        # Frontend pre-formats messages with system context XML and sets is_preformatted flag
        if isinstance(result_data, dict) and result_data.get("is_preformatted"):
            metadata["is_preformatted"] = True
        
        tool_result = ToolResult.from_dict({
            "success": success,
            "data": result_data,
            "error": error,
            "metadata": metadata,
        })
        
        # Extract screenshot data for logging and OCR
        screenshot_data = None
        if isinstance(tool_result.data, dict) and "screenshot" in tool_result.data:
            screenshot_data = tool_result.data["screenshot"]
            logger.debug("Tool result includes screenshot data")
        
        # Update screenshot and trigger OCR if present
        if screenshot_data:
            self.latest_screenshot = screenshot_data
            await self._maybe_trigger_ocr(screenshot_data, request_id)
        
        # Store the tool result in session for tool execution to pick up
        self._pending_tool_results[request_id] = tool_result
        
        # Resolve any waiting futures for this request_id
        if request_id in self._tool_result_futures:
            future = self._tool_result_futures.get(request_id)
            if future and not future.done():
                future.set_result(tool_result)
                logger.info(f"Resolved tool result future for request_id {request_id[:15]}")
    
    async def _handle_bundled_results(
        self,
        bundle_data: Dict[str, Any],
        bundle_request_id: str
    ) -> None:
        """
        Handle bundled tool results - stores individual results and creates combined result.
        
        Each tool result is pre-formatted with system context XML by the frontend.
        Individual results are stored for orchestrator matching, but a combined result
        is also created for single-message history storage.
        
        Args:
            bundle_data: The data dict from the bundle result (contains 'tools' array, 'combined_llm_content', and 'screenshot')
            bundle_request_id: The request_id of the bundle (for logging)
        """
        from backend.src.core.interfaces.tool import ToolResult
        
        tools = bundle_data.get("tools", [])
        bundle_screenshot = bundle_data.get("screenshot")
        combined_llm_content = bundle_data.get("combined_llm_content")
        
        logger.info(f"Processing bundle result: {len(tools)} tools, has_screenshot={bundle_screenshot is not None}, has_combined_content={combined_llm_content is not None}")
        
        # Process screenshot if present (update session and trigger OCR)
        if bundle_screenshot:
            self.latest_screenshot = bundle_screenshot
            logger.debug("Bundle result includes screenshot data")
            await self._maybe_trigger_ocr(bundle_screenshot, bundle_request_id)
        
        # Store individual tool results for orchestrator matching (still needed for request_id resolution)
        for tool_result_data in tools:
            tool_request_id = tool_result_data.get("request_id")
            if not tool_request_id:
                logger.warning(f"Tool result in bundle missing request_id: {tool_result_data}")
                continue
            
            tool_name = tool_result_data.get("tool_name", "unknown")
            tool_success = tool_result_data.get("success", False)
            tool_data = tool_result_data.get("data")
            tool_error = tool_result_data.get("error")
            
            # Create ToolResult for this individual tool (for orchestrator matching)
            tool_metadata = {}
            if isinstance(tool_data, dict) and tool_data.get("is_preformatted"):
                tool_metadata["is_preformatted"] = True
            
            # Include screenshot in tool result data if present
            if bundle_screenshot and isinstance(tool_data, dict):
                tool_data = tool_data.copy()
                tool_data["screenshot"] = bundle_screenshot
            
            tool_result = ToolResult.from_dict({
                "success": tool_success,
                "data": tool_data,
                "error": tool_error,
                "metadata": tool_metadata,
            })
            
            logger.debug(
                f"Storing bundled tool result for orchestrator: request_id={tool_request_id[:15]}, "
                f"tool={tool_name}, success={tool_success}"
            )
            
            # Store in pending results (for orchestrator to match by request_id)
            self._pending_tool_results[tool_request_id] = tool_result
            
            # Resolve waiting future for this tool's request_id
            if tool_request_id in self._tool_result_futures:
                future = self._tool_result_futures.get(tool_request_id)
                if future and not future.done():
                    future.set_result(tool_result)
                    logger.info(f"Resolved bundled tool result future for request_id {tool_request_id[:15]} (tool: {tool_name})")
                else:
                    logger.debug(f"Future for {tool_request_id[:15]} already done or missing")
            else:
                logger.debug(f"No waiting future for bundled tool request_id {tool_request_id[:15]}")
        
        # Create combined bundled result for history (single message instead of multiple)
        if combined_llm_content:
            # Create a combined ToolResult for the entire bundle
            combined_data = {
                "bundled": True,
                "tool_count": len(tools),
                "screenshot": bundle_screenshot,
            }
            
            combined_result = ToolResult.from_dict({
                "success": all(t.get("success", False) for t in tools),
                "data": combined_data,
                "error": None,
                "metadata": {
                    "is_preformatted": True,
                    "is_bundled": True,
                    "bundle_request_id": bundle_request_id,
                },
                "llm_content": combined_llm_content,
            })
            
            # Store combined result for history processing
            # Use bundle_request_id (from frontend) as the key
            # Note: This bundle_request_id is the frontend's correlationId, which is different
            # from the bundle_id generated in ToolPreparer. We'll match by checking if
            # we have multiple tool results and finding the bundled result.
            self._bundled_results[bundle_request_id] = combined_result
            logger.info(f"Stored combined bundled result for history (bundle_id={bundle_request_id[:15]})")
        else:
            logger.warning(f"Bundle result missing combined_llm_content, cannot create combined history message")
        
        logger.info(f"Finished processing bundle result {bundle_request_id[:15]}")
    
    async def _maybe_trigger_ocr(
        self,
        screenshot_data: str,
        request_id: str
    ) -> None:
        """
        Trigger proactive OCR if screenshot is present.
        
        NOTE: OCR triggering policy may evolve. If OCR rules change frequently,
        consider injecting an OcrPolicyService to decide when to trigger.
        For now, this remains a domain invariant (screenshot → trigger OCR).
        
        This is a non-blocking operation that runs OCR in the background.
        Tools that need OCR results will wait for ocr_completion_event.
        
        Args:
            screenshot_data: Base64-encoded screenshot data
            request_id: Request ID for logging purposes
        """
        async def run_ocr_task():
            try:
                # Clear OCR completion event before starting new OCR
                self.ocr_completion_event.clear()
                
                # Get OCR plugin from session registry
                ocr_plugin = None
                if self.executor and self.executor.plugin_manager:
                    ocr_plugin = self.executor.plugin_manager.plugin_registry.get_plugin("ocr_analysis")
                
                if ocr_plugin and ocr_plugin.enabled:
                    # perform_ocr is now properly async and handles GPU cache management internally in a thread
                    results = await ocr_plugin.perform_ocr(screenshot_data)
                    if results:
                        self.latest_ocr_results = results
                        logger.info(f"Proactive OCR completed for request {request_id[:15]}")
            except Exception as e:
                logger.error(f"Proactive OCR failed: {e}")
            finally:
                # Always set the event, even if OCR failed, to unblock waiting tools
                self.ocr_completion_event.set()
        
        asyncio.create_task(run_ocr_task())
