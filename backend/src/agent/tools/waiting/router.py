"""
Tool result router.

Routes tool results to appropriate handlers.
"""
import logging
from typing import Any, Dict, List, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession
    from backend.src.agent.tools.preparation.screenshot.processor import ScreenshotProcessor
    from backend.src.agent.tools.waiting.receiver import ToolResultReceiver
    from backend.src.agent.tools.waiting.storage.result_storage import ToolResultStorage
    from backend.src.core.interfaces.tool import ToolResult

logger = logging.getLogger(__name__)


class ToolResultRouter:
    """
    Routes tool results to appropriate handlers.
    
    Responsibility: Routing results only.
    Routes to screenshot processor, storage, and future resolution.
    """

    def __init__(
        self,
        receiver: "ToolResultReceiver",
        screenshot_processor: "ScreenshotProcessor",
        result_storage: "ToolResultStorage",
        session: "AgentSession",
    ):
        """
        Initialize the tool result router.
        
        Args:
            receiver: Receiver for converting frontend results
            screenshot_processor: Processor for screenshot processing
            result_storage: Storage for results and futures
            session: Agent session for context
        """
        self.receiver = receiver
        self.screenshot_processor = screenshot_processor
        self.result_storage = result_storage
        self.session = session

    async def route_individual_result(
        self,
        request_id: str,
        tool_result: "ToolResult",
    ) -> None:
        """
        Route individual tool result: process screenshot, store, resolve future.
        
        Args:
            request_id: Request ID for the tool result
            tool_result: Tool result to route
        """
        # Extract screenshot data for processing
        screenshot_data = None
        if isinstance(tool_result.data, dict) and "screenshot" in tool_result.data:
            screenshot_data = tool_result.data["screenshot"]
            logger.debug("Tool result includes screenshot data")
        
        # Process screenshot if present
        if screenshot_data:
            await self.screenshot_processor.process_from_result(
                self.session, screenshot_data, request_id
            )
        
        # Store the tool result using centralized storage
        self.result_storage.store_pending_result(request_id, tool_result)
        
        # Resolve any waiting futures for this request_id
        self.result_storage.resolve_result_future(request_id, tool_result)

    async def route_bundle_result(
        self,
        bundle_id: str,
        tool_result: "ToolResult",
    ) -> None:
        """
        Route atomic bundle result: process screenshot, store, resolve future.
        
        Args:
            bundle_id: Bundle ID for the bundle result
            tool_result: Bundle result to route
        """
        logger.info(f"Routing atomic bundle result: bundle_id={bundle_id[:15]}, status={'success' if tool_result.success else 'failure'}")
        
        # Extract screenshot from bundle result
        screenshot = None
        if isinstance(tool_result.data, dict):
            screenshot = tool_result.data.get("screenshot")
        
        # Process screenshot if present
        if screenshot:
            logger.debug("Bundle result includes screenshot data")
            await self.screenshot_processor.process_from_result(
                self.session, screenshot, bundle_id
            )
        
        # Store bundle result for orchestrator
        self.result_storage.store_bundled_result(bundle_id, tool_result)
        
        # Resolve bundle future
        resolved = self.result_storage.resolve_bundle_future(bundle_id, tool_result)
        if resolved:
            logger.info(f"Resolved bundle future for bundle_id {bundle_id[:15]}")
        else:
            logger.warning(f"No waiting bundle future for bundle_id {bundle_id[:15]}")

    async def route_bundled_results(
        self,
        bundle_request_id: str,
        individual_results: List[tuple[str, "ToolResult"]],
        combined_result: Optional["ToolResult"],
        bundle_screenshot: Optional[str],
    ) -> None:
        """
        Route bundled tool results: process screenshot, store individual and combined results.
        
        Args:
            bundle_request_id: Request ID of the bundle
            individual_results: List of (request_id, tool_result) tuples
            combined_result: Combined result if available
            bundle_screenshot: Screenshot from bundle if present
        """
        # Process screenshot if present
        if bundle_screenshot:
            logger.debug("Bundle result includes screenshot data")
            await self.screenshot_processor.process_from_result(
                self.session, bundle_screenshot, bundle_request_id
            )
        
        # Store individual tool results for orchestrator matching
        for tool_request_id, tool_result in individual_results:
            metadata = tool_result.metadata or {}
            logger.debug(
                f"Storing bundled tool result for orchestrator: request_id={tool_request_id[:15]}, "
                f"tool={metadata.get('tool_name', 'unknown')}, success={tool_result.success}"
            )
            
            # Store in pending results using centralized storage
            self.result_storage.store_pending_result(tool_request_id, tool_result)
            
            # Resolve waiting future for this tool's request_id
            resolved = self.result_storage.resolve_result_future(tool_request_id, tool_result)
            if resolved:
                logger.info(f"Resolved bundled tool result future for request_id {tool_request_id[:15]}")
            else:
                logger.debug(f"No waiting future for bundled tool request_id {tool_request_id[:15]}")
        
        # Store combined result if available
        if combined_result:
            self.result_storage.store_bundled_result(bundle_request_id, combined_result)
            logger.info(f"Stored combined bundled result for history (bundle_id={bundle_request_id[:15]})")
        else:
            logger.warning("Bundle result missing combined_llm_content, cannot create combined history message")
