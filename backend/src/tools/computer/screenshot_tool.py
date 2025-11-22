"""
Screenshot Tool (SDK Version)

Captures screenshots of the computer screen for computer use automation.
"""
import logging
import base64
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

from backend.sdk.tool import Tool
from backend.sdk.context import Context
from backend.src.tools.computer.computer_interface import ComputerInterface

logger = logging.getLogger(__name__)

# Global storage for latest OCR results to support ClickOCRTool (Backward Compatibility)
_latest_ocr_results = None

try:
    from rapidocr_onnxruntime import RapidOCR
    OCR_AVAILABLE = True
except ImportError:
    RapidOCR = None
    OCR_AVAILABLE = False

class ScreenshotToolArgs(BaseModel):
    include_ocr: bool = Field(False, description="Whether to include OCR analysis for text detection")

class ScreenshotTool(Tool[ScreenshotToolArgs]):
    """
    Capture a screenshot of the current computer screen.
    Returns a base64-encoded image and optional OCR text detection.
    """
    name = "screenshot"
    description = "Capture a screenshot of the current computer screen."
    args_model = ScreenshotToolArgs

    def __init__(self):
        self.computer = ComputerInterface()
        self._ocr_engine = None

    async def run(self, args: ScreenshotToolArgs, ctx: Context) -> Dict[str, Any]:
        # Ensure computer interface is initialized
        if not self.computer._initialized:
             success = await self.computer.initialize()
             if not success:
                 raise Exception("Computer interface initialization failed")

        # Take screenshot
        result = await self.computer.screenshot()
        if not result.success or not result.screenshot_data:
            raise Exception(f"Screenshot failed: {result.error}")

        response_data = {"screenshot": result.screenshot_data}
        
        # OCR Logic
        if args.include_ocr:
            if not OCR_AVAILABLE:
                raise Exception("OCR requested but rapidocr is not installed")
            
            ocr_results = await self._perform_ocr(result.screenshot_data)
            response_data["ocr_results"] = ocr_results or []
            
            # Store in global for ClickOCRTool compatibility
            global _latest_ocr_results
            _latest_ocr_results = response_data["ocr_results"]
            
        return response_data

    async def _perform_ocr(self, screenshot_b64: str) -> Optional[List[Dict[str, Any]]]:
        """
        Perform OCR analysis on a base64-encoded screenshot.
        """
        try:
            if self._ocr_engine is None:
                # Configure RapidOCR
                ocr_params = {"EngineConfig.onnxruntime.use_cuda": True}
                self._ocr_engine = RapidOCR(params=ocr_params)

            # Decode base64
            image_bytes = base64.b64decode(screenshot_b64)
            
            # Run OCR
            result = self._ocr_engine(image_bytes)
            
            if not result or not hasattr(result, "txts"):
                return []

            # Extract
            text_list = getattr(result, "txts", []) or []
            boxes_list = getattr(result, "boxes", []) or []
            scores_list = getattr(result, "scores", []) or []

            ocr_results = []
            for i, (text, box) in enumerate(zip(text_list, boxes_list)):
                 # Convert box to (x, y, w, h)
                 if not box or len(box) < 4: continue
                 x_coords = [p[0] for p in box]
                 y_coords = [p[1] for p in box]
                 x1, y1 = int(min(x_coords)), int(min(y_coords))
                 x2, y2 = int(max(x_coords)), int(max(y_coords))
                 
                 confidence = float(scores_list[i]) if i < len(scores_list) else 0.0

                 ocr_results.append({
                     "id": str(i),
                     "text": str(text).strip(),
                     "confidence": confidence,
                     "bbox": {
                         "x": x1, "y": y1, 
                         "width": x2 - x1, "height": y2 - y1
                     }
                 })
            return ocr_results

        except Exception as e:
            logger.error(f"OCR failed: {e}")
            return None

    def get_json_schema(self) -> dict:
        schema = super().get_json_schema()
        schema["capabilities"] = {
            "returns_image": True,
            "image_format": "base64_png"
        }
        return schema
