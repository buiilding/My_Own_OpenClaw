"""
Tool result router.

Routes tool results to appropriate handlers.
"""
import logging
from typing import Any, Literal, Optional, TYPE_CHECKING

from backend.src.services.artifacts import ArtifactStore

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession
    from backend.src.agent.tools.preparation.screenshot.processor import ScreenshotProcessor
    from backend.src.agent.tools.waiting.receiver import ToolResultReceiver
    from backend.src.agent.tools.waiting.storage.result_storage import ToolResultStorage
    from backend.src.core.interfaces.tool import ToolResult

logger = logging.getLogger(__name__)


RouteMode = Literal["individual", "bundle"]


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

    def _store_and_resolve_individual_result(
        self,
        request_id: str,
        tool_result: "ToolResult",
        *,
        log_on_miss: bool = False,
        log_context: str = "tool",
    ) -> None:
        """Store and resolve one individual tool result."""
        self.result_storage.store_pending_result(request_id, tool_result)
        resolved = self.result_storage.resolve_result_future(request_id, tool_result)
        if resolved:
            logger.info("Resolved %s result future for request_id %s", log_context, request_id[:15])
        elif log_on_miss:
            logger.debug("No waiting future for %s request_id %s", log_context, request_id[:15])

    def _store_and_resolve_bundle_result(
        self,
        bundle_id: str,
        tool_result: "ToolResult",
    ) -> None:
        """Store and resolve one bundled tool result."""
        self.result_storage.store_bundled_result(bundle_id, tool_result)
        resolved = self.result_storage.resolve_bundle_future(bundle_id, tool_result)
        if resolved:
            logger.info("Resolved bundle future for bundle_id %s", bundle_id[:15])
        else:
            logger.warning("No waiting bundle future for bundle_id %s", bundle_id[:15])

    def _set_current_system_state_if_available(self, tool_result: "ToolResult") -> None:
        """Best-effort session state update from tool result payload."""
        if not isinstance(tool_result.data, dict):
            return
        # Some tests/mocks provide lightweight session doubles without this API.
        set_current_system_state = getattr(self.session, "set_current_system_state", None)
        if callable(set_current_system_state):
            set_current_system_state(tool_result.data.get("system_state"))

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
        await self.route_result(
            request_id,
            tool_result,
            route_mode="individual",
        )

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
        await self.route_result(
            bundle_id,
            tool_result,
            route_mode="bundle",
        )

    async def route_result(
        self,
        correlation_id: str,
        tool_result: "ToolResult",
        *,
        route_mode: RouteMode,
    ) -> None:
        """
        Route one tool result through the shared single/bundle pipeline.

        Args:
            correlation_id: request_id for individual results, bundle_id for bundled results
            tool_result: Tool result to route
            route_mode: Routing mode ("individual" or "bundle")
        """
        is_bundle = route_mode == "bundle"
        context = "Bundle result" if is_bundle else "Tool result"

        # Keep system_state in session fresh for both single-tool and bundle paths.
        self._set_current_system_state_if_available(tool_result)

        if is_bundle:
            logger.info(
                "Routing atomic bundle result: bundle_id=%s, status=%s",
                correlation_id[:15],
                "success" if tool_result.success else "failure",
            )

        screenshot_data = self._extract_screenshot_from_result_data(
            tool_result.data,
            tool_result,
        )
        await self._process_screenshot(screenshot_data, correlation_id, context)

        if is_bundle:
            self._store_and_resolve_bundle_result(correlation_id, tool_result)
            return
        self._store_and_resolve_individual_result(correlation_id, tool_result)
