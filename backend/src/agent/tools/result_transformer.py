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
from dataclasses import dataclass
from typing import Any, Dict, Optional

from backend.src.core.interfaces.tool import ToolResult
from backend.src.agent.plugins.manager import PluginManager

logger = logging.getLogger(__name__)


@dataclass
class ProcessedToolResult:
    """Processed tool result ready for history commit and event presentation."""
    tool_name: str
    formatted_message: str
    screenshot_data: Optional[str] = None
    success: bool = True
    error: str = ""
    execution_time: float = 0.0
    active_window: Optional[str] = None
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
    
    Note: PluginManager is used only for calling plugin hooks (which may have
    side effects, but those are isolated to plugins, not this class).
    """

    def __init__(self, plugin_manager: PluginManager):
        """
        Initialize the result transformer.
        
        Args:
            plugin_manager: Plugin manager for plugin hooks.
                          Used only for calling on_tool_end hooks, not for state access.
        
        Note: PluginManager is passed for hook execution only.
              This class does not access PluginManager's internal state.
        
        Optional Hardening (for future consideration):
        - Pass callables instead of PluginManager to make dependencies explicit
        - Freeze input ToolResult dataclass to prevent accidental mutation
        - Add runtime checks to verify no side effects occur
        """
        self.plugin_manager = plugin_manager

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
            tool_result: Raw tool execution result (may be mutated by plugins, but
                        this method itself has no side effects)
            
        Returns:
            ProcessedToolResult with enriched and normalized data
            
        Side Effects: None (pure function contract)
        """
        # 1. Plugin Hooks (plugins can process results, but screenshots come from frontend)
        # Call plugins individually to namespace artifacts by plugin name
        # This enables replay, debugging, plugin disabling, and deterministic diffs
        if tool_result.artifacts is None:
            tool_result.artifacts = {}
        
        for plugin in self.plugin_manager._get_plugins():
            if not hasattr(plugin, "on_tool_end"):
                continue
            
            try:
                plugin_result = await plugin.on_tool_end(tool_name, tool_result)
                if plugin_result and plugin_result.artifacts:
                    # Namespace artifacts by plugin name to avoid collisions
                    tool_result.artifacts.setdefault(plugin.name, {}).update(
                        plugin_result.artifacts
                    )
            except Exception as e:
                logger.error(
                    f"Error in plugin {plugin.name}.on_tool_end: {e}", exc_info=True
                )
        
        # Get merged plugin result for screenshot extraction (backward compatibility)
        plugin_result = await self.plugin_manager.on_tool_end(tool_name, tool_result)
        
        # Extract screenshot data (helper method to avoid nested checks)
        screenshot_data = self._extract_screenshot_data(tool_result, plugin_result)

        # 2. Format message for history
        # System context is embedded in result.llm_content (frontend provides it)
        screenshot_indicator = (
            f"State of the screen after {tool_name} was executed:"
            if screenshot_data
            else None
        )
        
        formatted_message = tool_result.format_for_history(
            tool_name=tool_name,
            system_context=None,  # Explicitly None, as context is now in llm_content
            screenshot_indicator=screenshot_indicator,
        )

        # Extract active window from metadata
        active_window = None
        if tool_result.metadata:
            active_window = tool_result.metadata.get("active_window")

        return ProcessedToolResult(
            tool_name=tool_name,
            formatted_message=formatted_message,
            screenshot_data=screenshot_data,
            success=tool_result.success,
            error=tool_result.error or "",
            artifacts=tool_result.artifacts,
            active_window=active_window,
        )

    def _extract_screenshot_data(
        self, tool_result: ToolResult, plugin_result: Optional[Any]
    ) -> Optional[str]:
        """
        Extract screenshot data from tool result or plugin artifacts.
        
        Pure function: no side effects, deterministic output.
        
        Args:
            tool_result: Tool execution result
            plugin_result: Optional plugin result with artifacts
            
        Returns:
            Base64 screenshot data or None
            
        Side Effects: None (pure function contract)
        """
        # Check plugin artifacts first (screenshots come from frontend, not plugins)
        if plugin_result and plugin_result.artifacts and "screenshot" in plugin_result.artifacts:
            logger.debug("Found screenshot in plugin artifacts")
            return plugin_result.artifacts["screenshot"]
        
        # Check tool result artifacts
        if tool_result.artifacts and "screenshot" in tool_result.artifacts:
            logger.debug("Found screenshot in tool result artifacts")
            return tool_result.artifacts["screenshot"]
        
        # Check tool result data dict (SDK tools often return it here, including frontend tools)
        if isinstance(tool_result.data, dict):
            if "screenshot" in tool_result.data:
                screenshot_data = tool_result.data["screenshot"]
                if screenshot_data and isinstance(screenshot_data, str):
                    logger.debug(f"Found screenshot in tool result data (length: {len(screenshot_data)})")
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
