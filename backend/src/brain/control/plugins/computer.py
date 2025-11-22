import asyncio
import logging
from typing import Any, Optional

from backend.src.brain.control.plugin_interface import AgentPlugin, PluginResult
from backend.src.tools.registry import ToolRegistry

logger = logging.getLogger(__name__)

class ComputerUsePlugin(AgentPlugin):
    """
    Plugin that handles computer use capabilities like auto-screenshots.
    Refactored to work with SDK tools and optimize flow.
    """
    name = "computer_use"

    def __init__(self, tool_registry: ToolRegistry, screenshot_delay: float = 0.5):
        self.tool_registry = tool_registry
        self.screenshot_delay = screenshot_delay

    async def on_tool_end(self, tool_name: str, result: Any) -> Optional[PluginResult]:
        """
        Called after a tool finishes execution.
        Checks if the tool requires a screenshot and captures one if needed.
        """
        requires_screenshot = False
        
        # 1. Check Tool Capabilities (SDK tools return schemas with capabilities)
        try:
            tool = self.tool_registry.get_tool(tool_name)
            if tool:
                schema = tool.get_schema()
                # Check nested capabilities dict (SDK style) or top-level (Legacy style)
                caps = schema.get("capabilities", {})
                if isinstance(caps, dict) and caps.get("requires_screenshot"):
                     requires_screenshot = True
                
                # Fallback for legacy capability check if schema didn't have it
                if not requires_screenshot:
                     legacy_caps = tool.get_capabilities()
                     if legacy_caps.get("requires_screenshot"):
                         requires_screenshot = True

        except Exception as e:
            logger.debug(f"Could not check capabilities for {tool_name}: {e}")

        # 2. If tool itself returned a screenshot, skip
        # Handle both Legacy ToolResult and SDK Dict result
        if isinstance(result, dict) and "screenshot" in result:
            return None
        if hasattr(result, "artifacts") and result.artifacts and "screenshot" in result.artifacts:
            return None
        if hasattr(result, "data") and isinstance(result.data, dict) and "screenshot" in result.data:
            return None

        if requires_screenshot:
            try:
                await asyncio.sleep(self.screenshot_delay)
                
                # Optimization: Call ComputerInterface directly instead of full tool pipeline?
                # For now, calling the tool is safer as it handles initialization logic universally.
                # Since we refactored ScreenshotTool to SDK, calling it via registry is fine.
                
                screenshot_result = await self.tool_registry.execute_tool("screenshot")
                
                screenshot_data = None
                if screenshot_result.success:
                    # SDK Tool returns data in .data (if Adapter wrapped) or directly if we unwrapped it?
                    # The Registry.execute_tool returns ToolResult (Legacy Wrapper).
                    # For SDK tool, ToolResult.data holds the Dict returned by run()
                    
                    data = screenshot_result.data
                    if isinstance(data, dict) and "screenshot" in data:
                        screenshot_data = data["screenshot"]
                
                if screenshot_data:
                    return PluginResult(
                        artifacts={"screenshot": screenshot_data}
                    )
            except Exception as e:
                logger.warning(f"ComputerUsePlugin: Failed to capture screenshot: {e}")

        return None
