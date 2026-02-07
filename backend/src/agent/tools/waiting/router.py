"""
Tool result router.

Routes tool results to appropriate handlers.
"""
import logging
from typing import Any, Dict, List, Optional, TYPE_CHECKING

from backend.src.services.artifacts import ArtifactStore

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
    
    async def _process_screenshot(self, screenshot: Optional[str], request_id: str, context: str) -> None:
        if not screenshot:
            return
        logger.debug(f"{context} includes screenshot data")
        await self.screenshot_processor.process_from_result(
            self.session, screenshot, request_id
        )

    def _resolve_screenshot_ref(self, screenshot_ref: Optional[str]) -> Optional[str]:
        if not screenshot_ref:
            return None
        try:
            store = ArtifactStore.from_config(self.session.cfg)
            return store.load_base64(screenshot_ref)
        except Exception as exc:
            logger.warning(f"Failed to load screenshot artifact {screenshot_ref}: {exc}")
            return None

    def _looks_like_artifact_id(self, value: Optional[str]) -> bool:
        if not value or not isinstance(value, str):
            return False
        if "/" in value or "\\" in value:
            return False
        lowered = value.lower()
        return lowered.endswith((".png", ".jpg", ".jpeg")) and len(value) < 80

    def _inject_screenshot_artifact(self, tool_result: "ToolResult", screenshot_data: str) -> None:
        if tool_result.artifacts is None:
            tool_result.artifacts = {}
        tool_result.artifacts["screenshot"] = screenshot_data

    def _extract_screenshot_from_result_data(
        self,
        result_data: Any,
        tool_result: "ToolResult",
    ) -> Optional[str]:
        """Extract screenshot payload from result data, resolving artifact refs when needed."""
        if not isinstance(result_data, dict):
            return None

        screenshot_data = result_data.get("screenshot")
        if screenshot_data:
            logger.debug("Tool result includes screenshot data")
            return screenshot_data

        screenshot_ref = result_data.get("screenshot_ref")
        if self._looks_like_artifact_id(screenshot_ref):
            resolved = self._resolve_screenshot_ref(screenshot_ref)
            if resolved:
                self._inject_screenshot_artifact(tool_result, resolved)
            return resolved
        return None

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
        screenshot_data = self._extract_screenshot_from_result_data(
            tool_result.data,
            tool_result,
        )
        
        await self._process_screenshot(screenshot_data, request_id, "Tool result")
        
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
        
        screenshot = self._extract_screenshot_from_result_data(
            tool_result.data,
            tool_result,
        )
        
        await self._process_screenshot(screenshot, bundle_id, "Bundle result")
        
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
        resolved_bundle_screenshot = bundle_screenshot
        if self._looks_like_artifact_id(bundle_screenshot):
            resolved_bundle_screenshot = self._resolve_screenshot_ref(bundle_screenshot)
        if resolved_bundle_screenshot and combined_result:
            self._inject_screenshot_artifact(combined_result, resolved_bundle_screenshot)
        await self._process_screenshot(resolved_bundle_screenshot, bundle_request_id, "Bundle result")
        
        # Store individual tool results for orchestrator matching
        for tool_request_id, tool_result in individual_results:
            metadata = tool_result.metadata or {}
            logger.debug(
                f"Storing bundled tool result for orchestrator: request_id={tool_request_id[:15]}, "
                f"tool={metadata.get('tool_name', 'unknown')}, success={tool_result.success}"
            )
            
            if resolved_bundle_screenshot:
                self._inject_screenshot_artifact(tool_result, resolved_bundle_screenshot)

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
