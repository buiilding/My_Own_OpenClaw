"""
Tool Dispatcher for Frontend Python Sidecar

Routes tool execution requests to the appropriate tool implementations.
"""

import asyncio
import base64
import importlib
import inspect
import io
import logging
import pkgutil
from pathlib import Path
from typing import Any, Dict, Optional, Type

from .protocol import FrontendProtocol, Message

logger = logging.getLogger(__name__)


class ToolDispatcher:
    """
    Dispatches tool execution requests to the appropriate tool classes.

    Automatically discovers and loads tools from the tools/ directory.
    """

    def __init__(self, tools_dir: Path):
        """
        Initialize the dispatcher.

        Args:
            tools_dir: Path to the tools directory
        """
        self.tools_dir = tools_dir
        self.tools: Dict[str, Type] = {}
        self.protocol = FrontendProtocol()

        # Auto-discover and load tools
        self._load_tools()

    def _load_tools(self) -> None:
        """Automatically load all tool classes from the tools directory."""
        try:
            # Import the tools package
            import sys
            tools_path = self.tools_dir.parent
            sys.path.insert(0, str(tools_path))

            # Discover tool modules recursively
            for importer, modname, ispkg in pkgutil.walk_packages(
                [str(self.tools_dir)], f"{self.tools_dir.name}."
            ):
                if not ispkg:  # Only load modules, not packages
                    try:
                        module = importlib.import_module(modname)

                        # Find tool classes in the module
                        for name, obj in inspect.getmembers(module):
                            if (inspect.isclass(obj) and
                                hasattr(obj, 'name') and
                                hasattr(obj, 'run')):
                                # This looks like a tool class
                                tool_name = getattr(obj, 'name', None)
                                if tool_name:
                                    self.tools[tool_name] = obj
                                    logger.info(f"Loaded tool: {tool_name} from {modname}")

                    except Exception as e:
                        logger.error(f"Failed to load tool module {modname}: {e}")

        except Exception as e:
            logger.error(f"Failed to load tools: {e}")

    async def dispatch(self, message: Message) -> None:
        """
        Dispatch a tool execution request.

        Args:
            message: The incoming message with tool request
        """
        try:
            if message.type != "request":
                self.protocol.send_message(
                    self.protocol.create_response(
                        message.id,
                        False,
                        error=f"Invalid message type: {message.type}"
                    )
                )
                return

            tool_name = message.payload.get("tool")
            args = message.payload.get("args", {})

            if not tool_name:
                self.protocol.send_message(
                    self.protocol.create_response(
                        message.id,
                        False,
                        error="No tool specified"
                    )
                )
                return

            # Execute the tool
            result = await self._execute_tool(tool_name, args)
            logger.info(f"Tool execution completed for {tool_name}")

            # Send response
            if isinstance(result, dict) and "success" in result:
                # Tool returned a result dict
                success = result.get("success", False)
                data = result.get("data") if success else None
                error = result.get("error") if not success else None
            else:
                # Tool returned raw data, assume success
                success = True
                data = result
                error = None

            response = self.protocol.create_response(message.id, success, data, error)
            logger.info(f"Sending response for tool {tool_name}")
            self.protocol.send_message(response)

        except Exception as e:
            logger.error(f"Dispatch error: {e}", exc_info=True)
            self.protocol.send_message(
                self.protocol.create_response(
                    message.id,
                    False,
                    error=f"Dispatch failed: {str(e)}"
                )
            )

    async def _execute_tool(self, tool_name: str, args: Dict[str, Any]) -> Any:
        """
        Execute a tool with the given arguments.

        Args:
            tool_name: Name of the tool to execute
            args: Arguments for the tool

        Returns:
            Tool execution result
        """
        tool_class = self.tools.get(tool_name)
        if not tool_class:
            raise ValueError(f"Tool '{tool_name}' not found. Available tools: {list(self.tools.keys())}")

        try:
            # Instantiate the tool
            tool_instance = tool_class()

            # Start system state capture in parallel for maximum speed
            # We do this before tool execution so it's ready by the time we need to format the result
            from core.system_state import get_system_state_xml
            system_state_task = asyncio.create_task(get_system_state_xml())

            # Validate arguments using Pydantic model
            if hasattr(tool_instance, 'validate_args'):
                try:
                    validated_args = tool_instance.validate_args(args)
                except Exception as e:
                    logger.error(f"Argument validation failed for {tool_name}: {e}")
                    system_state_task.cancel() # Cancel the state capture if validation fails
                    return {"success": False, "error": f"Invalid arguments: {str(e)}"}
            else:
                validated_args = args

            # Call the run method with validated args
            if inspect.iscoroutinefunction(tool_instance.run):
                # Async tool
                result = await tool_instance.run(validated_args)
            else:
                # Sync tool - run in global thread pool
                from core.thread_pool import get_executor
                loop = asyncio.get_running_loop()
                result = await loop.run_in_executor(get_executor(), tool_instance.run, validated_args)

            # Check if tool requires automatic image capture
            auto_capture = getattr(tool_class, 'auto_capture_image', None)
            if auto_capture and result and isinstance(result, dict) and result.get("success"):
                # Wait a bit for UI to update (especially for computer control tools)
                await asyncio.sleep(2.0)
                
                # Capture the requested image type
                image_data = await self._capture_image(auto_capture)
                if image_data:
                    # Add image to result data
                    if "data" not in result:
                        result["data"] = {}
                    elif not isinstance(result["data"], dict):
                        # If data is not a dict, wrap it
                        result["data"] = {"result": result["data"]}
                    
                    result["data"]["screenshot"] = image_data
                    logger.debug(f"Automatically captured {auto_capture} for tool {tool_name}")

            # Wait for system state capture to complete
            try:
                system_state_xml = await system_state_task
                logger.info(f"System state capture finished for {tool_name}")
            except Exception as e:
                logger.error(f"Failed to capture system state in dispatcher: {e}")
                system_state_xml = None

            # Apply centralized formatting using Tool.format_result
            if result and isinstance(result, dict) and hasattr(tool_instance, 'format_result'):
                from tools.base import SimpleToolResult
                
                # Reconstruct SimpleToolResult object to use its formatting logic
                success = result.get("success", False)
                data = result.get("data")
                error = result.get("error")
                
                tool_result_obj = SimpleToolResult(success=success, data=data, error=error)
                
                # Format the result (adds header, os_state, footer)
                result = await tool_instance.format_result(tool_result_obj, system_state_xml=system_state_xml)
                
                # If we had a screenshot, make sure it's preserved in the final result data
                if data and isinstance(data, dict) and "screenshot" in data:
                    result["data"]["screenshot"] = data["screenshot"]

            return result

        except Exception as e:
            logger.error(f"Tool execution failed for {tool_name}: {e}", exc_info=True)
            raise

    async def _capture_image(self, image_type: str) -> Optional[str]:
        """
        Capture an image based on the image type.

        Args:
            image_type: Type of image to capture ("screenshot", etc.)

        Returns:
            Base64-encoded image data or None if capture failed
        """
        if image_type == "screenshot":
            return await self._capture_screenshot()
        else:
            logger.warning(f"Unknown image capture type: {image_type}")
            return None

    async def _capture_screenshot(self) -> Optional[str]:
        """
        Capture a screenshot and return base64-encoded data.

        Returns:
            Base64-encoded compressed screenshot data or None if failed
        """
        try:
            import pyautogui
            from .protocol import FrontendProtocol
            from core.thread_pool import get_executor

            # Take screenshot in global thread pool
            loop = asyncio.get_running_loop()
            screenshot = await loop.run_in_executor(get_executor(), pyautogui.screenshot)

            # Convert to base64 with compression
            img_buffer = io.BytesIO()
            screenshot.save(img_buffer, format="PNG", optimize=True)
            img_bytes = img_buffer.getvalue()

            # Compress the image data
            # compressed_bytes = FrontendProtocol.compress_data(img_bytes)
            # b64_data = base64.b64encode(compressed_bytes).decode("utf-8")
            
            # Convert to base64 (no compression for direct UI display)
            b64_data = base64.b64encode(img_bytes).decode("utf-8")

            logger.debug(
                f"Screenshot captured: {len(img_bytes)} bytes original"
            )

            return b64_data

        except Exception as e:
            logger.error(f"Failed to capture screenshot: {e}", exc_info=True)
            return None

    def get_available_tools(self) -> Dict[str, str]:
        """
        Get information about available tools.

        Returns:
            Dictionary mapping tool names to their descriptions
        """
        info = {}
        for name, tool_class in self.tools.items():
            description = getattr(tool_class, 'description', 'No description')
            info[name] = description
        return info

    def shutdown(self) -> None:
        """Shutdown the dispatcher and cleanup resources."""
        logger.info("Shutting down tool dispatcher")
        # Any cleanup logic here