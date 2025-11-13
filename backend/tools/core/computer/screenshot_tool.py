"""
Screenshot Tool

Captures screenshots of the computer screen for computer use automation.
Supports optional OCR analysis for text element detection.
"""

import base64
import logging
from typing import Any, Dict, List, Optional

from backend.config import AppServices
from backend.tools.base import Kind, Tool, ToolContext, ToolResult

from .computer_interface import ComputerInterface

# Optional OCR imports
try:
    from rapidocr import RapidOCR

    OCR_AVAILABLE = True
except ImportError:
    RapidOCR = None
    OCR_AVAILABLE = False

logger = logging.getLogger(__name__)

# Global storage for latest OCR results (similar to CoAct-1 approach)
_latest_ocr_results = None


class ScreenshotTool(Tool):
    """
    Tool for capturing screenshots of the computer screen.

    This tool takes screenshots and returns them as base64-encoded images
    that can be used by LLMs for visual understanding and computer control.
    """

    def __init__(self, config: AppServices):
        super().__init__(
            name="screenshot",
            description="Capture a screenshot of the current computer screen and return it as a base64-encoded image. Optionally include OCR analysis to detect text elements with coordinates.",
            kind=Kind.READ,
        )
        self.config = config
        self.computer = ComputerInterface()
        self._ocr_engine = None

    async def execute_async(
        self, context: ToolContext, include_ocr: bool = False, **kwargs
    ) -> ToolResult:
        """
        Take a screenshot and return it.

        Args:
            context: Tool execution context
            include_ocr: Whether to include OCR analysis for text detection

        Returns:
            ToolResult with screenshot data and optional OCR results
        """
        try:
            # Ensure computer interface is initialized
            init_error = await self.computer.ensure_initialized()
            if init_error:
                return init_error

            # Take screenshot
            result = await self.computer.screenshot()

            if result.success and result.screenshot_data:
                response_data = {"screenshot": result.screenshot_data}
                metadata = {"screenshot_size": len(result.screenshot_data)}

                # Perform OCR analysis if requested
                if include_ocr:
                    if not OCR_AVAILABLE:
                        return ToolResult(
                            success=False,
                            error="OCR functionality not available (rapidocr not installed)",
                            llm_content="Error: OCR requested but rapidocr is not available",
                            return_display="OCR not available",
                        )

                    ocr_results = await self._perform_ocr(result.screenshot_data)
                    if ocr_results is not None:
                        response_data["ocr_results"] = ocr_results
                        metadata["ocr_elements_count"] = len(ocr_results)

                        # Store OCR results globally for click tool access
                        global _latest_ocr_results
                        _latest_ocr_results = ocr_results

                        # Format OCR results in CoAct-1 style for LLM
                        ocr_lines = ["OCR-DETECTED TEXT ELEMENTS:"]
                        for i, item in enumerate(ocr_results):
                            ocr_lines.append(f"ID {i}: \"{item['text']}\"")

                        ocr_text_summary = "\n".join(ocr_lines)

                        llm_content = f"Screenshot captured with OCR analysis. Detected {len(ocr_results)} text elements.\n\n{ocr_text_summary}"
                        return_display = f"Screenshot captured with {len(ocr_results)} text elements detected"
                    else:
                        response_data["ocr_results"] = []
                        metadata["ocr_error"] = "OCR analysis failed"
                        llm_content = "Screenshot captured (OCR analysis failed)"
                        return_display = "Screenshot captured but OCR failed"
                else:
                    llm_content = "Screenshot captured successfully"
                    return_display = "Screenshot captured and returned as base64 image"

                return ToolResult(
                    success=True,
                    data=response_data,
                    llm_content=llm_content,
                    return_display=return_display,
                    metadata=metadata,
                )
            else:
                return ToolResult(
                    success=False,
                    error=result.error or "Screenshot capture failed",
                    llm_content=f"Error capturing screenshot: {result.error}",
                    return_display=f"Screenshot failed: {result.error}",
                )

        except Exception as e:
            logger.error(f"Screenshot tool error: {e}", exc_info=True)
            return ToolResult(
                success=False,
                error=f"Screenshot capture failed: {str(e)}",
                llm_content="Error: Failed to capture screenshot",
                return_display=f"Screenshot error: {str(e)}",
            )

    async def _perform_ocr(self, screenshot_b64: str) -> Optional[List[Dict[str, Any]]]:
        """
        Perform OCR analysis on a base64-encoded screenshot.

        Args:
            screenshot_b64: Base64-encoded screenshot data

        Returns:
            List of OCR results with text, confidence, and bounding box coordinates
        """
        try:
            # Initialize OCR engine if needed
            if self._ocr_engine is None:
                if not OCR_AVAILABLE:
                    logger.warning("OCR requested but rapidocr not available")
                    return None

                # Configure RapidOCR to use CUDA for better performance
                ocr_params = {
                    "EngineConfig.onnxruntime.use_cuda": True,
                }
                self._ocr_engine = RapidOCR(params=ocr_params)
                logger.info("Initialized RapidOCR engine with CUDA support")

            # Decode base64 to bytes
            try:
                image_bytes = base64.b64decode(screenshot_b64)
            except Exception as e:
                logger.error(f"Failed to decode screenshot base64: {e}")
                return None

            # Perform OCR
            result = self._ocr_engine(image_bytes)

            if not result or not hasattr(result, "txts"):
                logger.warning("OCR returned invalid result format")
                return []

            # Extract text and bounding boxes from RapidOCR result
            text_list = getattr(result, "txts", None)
            if text_list is None:
                text_list = []

            scores_list = getattr(result, "scores", None)
            if scores_list is None:
                scores_list = []

            boxes_list = getattr(result, "boxes", None)
            if boxes_list is None:
                boxes_list = []

            # Convert boxes to (x1, y1, x2, y2) format
            bbox_list = []
            for box in boxes_list:
                if box is not None and len(box) >= 4:
                    # box is a list of points: [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
                    x_coords = [p[0] for p in box]
                    y_coords = [p[1] for p in box]
                    x1 = int(min(x_coords))
                    y1 = int(min(y_coords))
                    x2 = int(max(x_coords))
                    y2 = int(max(y_coords))
                    bbox_list.append((x1, y1, x2, y2))

            if not text_list or not bbox_list:
                logger.info("OCR found no text elements")
                return []

            # Format OCR results
            ocr_results = []
            for i, (text, bbox) in enumerate(zip(text_list, bbox_list)):
                try:
                    # bbox format: (x1, y1, x2, y2)
                    x1, y1, x2, y2 = bbox

                    # Get confidence score if available
                    confidence = (
                        float(scores_list[i])
                        if i < len(scores_list) and scores_list[i] is not None
                        else 0.9
                    )

                    ocr_results.append(
                        {
                            "id": str(i),
                            "text": str(text).strip(),
                            "confidence": confidence,  # Confidence score from RapidOCR
                            "bbox": {
                                "x": int(x1),
                                "y": int(y1),
                                "width": int(x2 - x1),
                                "height": int(y2 - y1),
                            },
                        }
                    )
                except (ValueError, IndexError) as e:
                    logger.warning(f"Failed to parse OCR bbox for text '{text}': {e}")
                    continue

            logger.info(
                f"OCR analysis completed: found {len(ocr_results)} text elements"
            )
            return ocr_results

        except Exception as e:
            logger.error(f"OCR analysis failed: {e}", exc_info=True)
            return None

    def get_capabilities(self) -> Dict[str, Any]:
        """Get tool capabilities."""
        capabilities = super().get_capabilities()
        capabilities.update(
            {
                "returns_image": True,
                "image_format": "base64_png",
                "supports_ocr": OCR_AVAILABLE,
                "ocr_format": "text_elements_with_coordinates",
                "requires_display": True,
                "safe": True,  # Screenshots are read-only
            }
        )
        return capabilities
