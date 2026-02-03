"""
Result Transformer.

Pure transformation of tool execution results.
No side effects, no state mutation, no history access.

INVARIANT: This class must remain side-effect free.
- No session access
- No history mutation
- No IO operations
- No event emission
- No global state changes

All methods must be pure functions: same input → same output, no side effects.
Future contributors: if you need state mutation, use HistoryCommitter instead.
"""
import logging
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional

from backend.src.core.interfaces.tool import ToolResult

logger = logging.getLogger(__name__)


@dataclass
class ProcessedToolResult:
    """Processed tool result ready for history commit."""
    tool_name: str
    formatted_message: str
    screenshot_data: Optional[str] = None
    success: bool = True
    error: str = ""
    artifacts: Optional[Dict[str, Any]] = None


class ResultTransformer:
    """
    Transforms raw tool results into processed, enriched data.
    
    Responsibility: Pure data transformation only.
    
    INVARIANT (MUST BE MAINTAINED):
    ===============================
    This class must remain side-effect free:
    - ❌ No session access
    - ❌ No history mutation  
    - ❌ No IO operations
    - ❌ No event emission
    - ❌ No global state changes
    
    All methods are pure functions: same input → same output, no side effects.
    
    If you need state mutation, use HistoryCommitter instead.
    If you need event emission, use EventPresenter instead.
    
    Note: This transformer intentionally avoids plugin hooks. OCR and other
    capabilities are wired directly via services.
    """

    def __init__(self) -> None:
        """Initialize the result transformer."""
        pass

    async def transform(
        self,
        tool_name: str,
        tool_result: ToolResult,
    ) -> ProcessedToolResult:
        """
        Transform raw tool result into processed result.
        
        Pure function: no side effects, deterministic output.
        
        Args:
            tool_name: Name of the tool that produced this result
            tool_result: Raw tool execution result
            
        Returns:
            ProcessedToolResult with enriched and normalized data
            
        Side Effects: None (pure function contract)
        """
        transform_start = time.perf_counter()
        if tool_result.artifacts is None:
            tool_result.artifacts = {}

        # Extract screenshot data (helper method to avoid nested checks)
        screenshot_data = self._extract_screenshot_data(tool_result)

        # 2. Get pre-formatted message for history
        # Frontend should pre-format messages with system context XML embedded in llm_content.
        # format_for_history() accepts whatever the frontend sends - no validation is performed.
        # The frontend is responsible for formatting correctly.
        formatted_message = tool_result.format_for_history(tool_name=tool_name)

        transform_time = time.perf_counter() - transform_start
        logger.info(f"[Timing] Result transformation took {transform_time:.3f}s (tool={tool_name})")
        return ProcessedToolResult(
            tool_name=tool_name,
            formatted_message=formatted_message,
            screenshot_data=screenshot_data,
            success=tool_result.success,
            error=tool_result.error or "",
            artifacts=tool_result.artifacts,
        )

    def _extract_screenshot_data(
        self, tool_result: ToolResult
    ) -> Optional[str]:
        """
        Extract screenshot data from tool result.
        
        Pure function: no side effects, deterministic output.
        
        Args:
            tool_result: Tool execution result
        Returns:
            Base64 screenshot data or None
            
        Side Effects: None (pure function contract)
        """
        # Check tool result artifacts
        if tool_result.artifacts and "screenshot" in tool_result.artifacts:
            logger.debug("Found screenshot in tool result artifacts")
            return tool_result.artifacts["screenshot"]
        
        # Check tool result data dict (SDK tools often return it here, including frontend tools)
        if isinstance(tool_result.data, dict):
            if "screenshot" in tool_result.data:
                screenshot_data = tool_result.data["screenshot"]
                if screenshot_data and isinstance(screenshot_data, str):
                    logger.debug("Found screenshot in tool result data")
                    return screenshot_data
                else:
                    logger.warning(f"Screenshot data found but invalid type: {type(screenshot_data)}")
        
        # Debug logging for troubleshooting
        logger.debug(
            f"No screenshot found in tool result. "
            f"Data type: {type(tool_result.data)}, "
            f"Data keys: {list(tool_result.data.keys()) if isinstance(tool_result.data, dict) else 'N/A'}, "
            f"Artifacts: {list(tool_result.artifacts.keys()) if tool_result.artifacts else None}"
        )
        
        return None
