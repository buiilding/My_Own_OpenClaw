"""
OCR Plugin for Agent.

This plugin provides OCR analysis functionality for screenshots.
Tools can use the perform_ocr() method to analyze screenshots.
"""
import logging
import base64
from typing import Any, Dict, List, Optional

from backend.src.agent.plugins.interface import AgentPlugin, PluginResult

logger = logging.getLogger(__name__)

# Try to import OCR library
OCR_IMPORT_ERROR = None
try:
    from rapidocr import RapidOCR
    OCR_AVAILABLE = True
except ImportError as e:
    RapidOCR = None
    OCR_AVAILABLE = False
    OCR_IMPORT_ERROR = str(e)
except Exception as e:
    RapidOCR = None
    OCR_AVAILABLE = False
    OCR_IMPORT_ERROR = f"Unexpected error during import: {e}"

# Module-level singleton instance for OCR plugin
# This ensures the OCR engine is initialized only once across the entire application
_ocr_plugin_singleton = None


def get_ocr_plugin_instance():
    """
    Get or create the singleton OCR plugin instance.
    
    This ensures the OCR engine is initialized only once, avoiding
    expensive reinitialization overhead on subsequent calls.
    
    Returns:
        OCRPlugin: The singleton OCR plugin instance
    """
    global _ocr_plugin_singleton
    if _ocr_plugin_singleton is None:
        _ocr_plugin_singleton = OCRPlugin()
    return _ocr_plugin_singleton


class OCRPlugin(AgentPlugin):
    """
    Plugin that provides OCR analysis functionality for screenshots.
    
    Provides OCR engine that can be used by tools like mouse_control (find_coordinates_by="ocr").
    """
    name = "ocr_analysis"
    version = "1.0.0"
    description = "Provides OCR analysis functionality for screenshots"

    def __init__(self, enabled: bool = True):
        """
        Initialize the OCR plugin.
        
        Args:
            enabled: Whether OCR is enabled (default: True)
        """
        self.enabled = enabled
        self._ocr_engine = None
        self.use_cuda = False  # Track if we're using CUDA or CPU

    def _extract_screenshot_data(self, result: Any) -> Optional[str]:
        """
        Extract screenshot data from tool result.
        
        Handles both dict (SDK) and ToolResult formats.
        
        Args:
            result: Tool execution result
            
        Returns:
            Base64 screenshot data or None
        """
        # Handle dict format (SDK tools)
        if isinstance(result, dict):
            # Check direct screenshot key
            if "screenshot" in result:
                return result["screenshot"]
            # Check artifacts
            if "artifacts" in result and isinstance(result["artifacts"], dict):
                if "screenshot" in result["artifacts"]:
                    return result["artifacts"]["screenshot"]
            # Check data key
            if "data" in result and isinstance(result["data"], dict):
                if "screenshot" in result["data"]:
                    return result["data"]["screenshot"]
        
        # Handle ToolResult object format
        if hasattr(result, "data"):
            data = result.data
            if isinstance(data, dict):
                if "screenshot" in data:
                    return data["screenshot"]
                if "artifacts" in data and isinstance(data["artifacts"], dict):
                    if "screenshot" in data["artifacts"]:
                        return data["artifacts"]["screenshot"]
        
        # Handle artifacts attribute
        if hasattr(result, "artifacts") and isinstance(result.artifacts, dict):
            if "screenshot" in result.artifacts:
                return result.artifacts["screenshot"]
        
        return None

    async def perform_ocr(self, screenshot_b64: str) -> Optional[List[Dict[str, Any]]]:
        """
        Perform OCR analysis on a base64-encoded screenshot.
        
        Public method for tools to use OCR functionality.
        Uses the pre-initialized OCR engine from startup (no reinitialization).
        Automatically falls back to CPU if CUDA memory errors occur.
        
        Args:
            screenshot_b64: Base64-encoded screenshot image
            
        Returns:
            List of OCR results with text, bounding boxes, and confidence scores
        """
        try:
            # OCR engine should already be initialized at startup via initialize()
            # This is just a safety check (should never happen in normal operation)
            if self._ocr_engine is None:
                if not OCR_AVAILABLE:
                    logger.warning("OCR requested but rapidocr not available")
                    return None
                
                # Fallback: Initialize OCR engine if somehow not initialized at startup
                logger.warning("OCR engine not initialized at startup, initializing now (this should not happen)")
                try:
                    ocr_params = {
                        "EngineConfig.onnxruntime.use_cuda": True,
                    }
                    self._ocr_engine = RapidOCR(params=ocr_params)
                    self.use_cuda = True
                    logger.info("Initialized RapidOCR engine with CUDA support (lazy initialization)")
                except Exception as e:
                    # Try CPU fallback if CUDA init fails
                    logger.debug(f"CUDA initialization failed during lazy init, trying CPU: {e}")
                    ocr_params = {
                        "EngineConfig.onnxruntime.use_cuda": False,
                    }
                    self._ocr_engine = RapidOCR(params=ocr_params)
                    self.use_cuda = False
                    logger.info("Initialized RapidOCR engine with CPU (lazy initialization fallback)")

            # Decode base64 to bytes
            try:
                image_bytes = base64.b64decode(screenshot_b64)
            except Exception as e:
                logger.error(f"Failed to decode screenshot base64: {e}")
                return None
            
            # Clear GPU cache before OCR to free up memory
            from backend.src.core.services.gpu_memory_manager import GPUMemoryManager
            GPUMemoryManager.clear_all_caches()
            GPUMemoryManager.log_memory_info("before OCR")
            
            # Perform OCR with CUDA error handling and CPU fallback
            try:
                result = self._ocr_engine(image_bytes)
            except Exception as ocr_error:
                # Check if it's a CUDA memory error
                error_msg = str(ocr_error)
                error_type = type(ocr_error).__name__
                
                is_cuda_error = (
                    "ONNXRuntimeError" in error_type or
                    "ONNXRuntimeError" in error_msg or
                    "RuntimeException" in error_type or
                    "RUNTIME_EXCEPTION" in error_msg or
                    any(keyword in error_msg for keyword in [
                        "Failed to allocate memory",
                        "CUBLAS_STATUS_ALLOC_FAILED",
                        "CUBLAS failure",
                        "CUDNN",
                        "CUDA",
                        "cuda_call",
                        "cublas",
                        "cudnn",
                        "CUDNN_STATUS",
                        "CUBLAS_STATUS",
                        "BFCArena",
                        "AllocateRawInternal"
                    ])
                )
                
                # If CUDA error and we're using CUDA, try CPU fallback
                if is_cuda_error and self.use_cuda:
                    logger.debug(
                        f"OCR CUDA error during analysis. GPU memory exhausted. "
                        f"Reloading OCR engine with CPU fallback. Error: {error_msg[:200]}"
                    )
                    try:
                        # Reload OCR engine with CPU
                        ocr_params = {
                            "EngineConfig.onnxruntime.use_cuda": False,
                        }
                        self._ocr_engine = RapidOCR(params=ocr_params)
                        self.use_cuda = False
                        logger.debug("OCR engine reloaded with CPU - retrying analysis")
                        
                        # Retry OCR with CPU
                        result = self._ocr_engine(image_bytes)
                        logger.debug("OCR analysis completed successfully with CPU fallback")
                    except Exception as reload_error:
                        logger.error(
                            f"OCR CPU fallback also failed: {reload_error}. "
                            f"Skipping OCR analysis.",
                            exc_info=True
                        )
                        return None
                elif is_cuda_error:
                    # Already using CPU but still getting CUDA errors - skip
                    logger.warning(
                        f"OCR analysis failed (already using CPU but CUDA error persists): {error_msg[:200]}. "
                        f"Skipping OCR analysis."
                    )
                    return None
                else:
                    # Different error - re-raise
                    raise
            
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

                    ocr_results.append({
                        "id": str(i),
                    "text": str(text).strip(),
                        "confidence": confidence,  # Confidence score from RapidOCR
                    "bbox": {
                            "x": int(x1),
                            "y": int(y1),
                            "width": int(x2 - x1),
                            "height": int(y2 - y1),
                        },
                })
                except (ValueError, IndexError) as e:
                    logger.warning(f"Failed to parse OCR bbox for text '{text}': {e}")
                    continue
            
            logger.info(f"OCR analysis completed: found {len(ocr_results)} text elements")
            
            # Clear GPU cache after OCR to free memory for other services
            GPUMemoryManager.clear_all_caches()
            GPUMemoryManager.log_memory_info("after OCR")
            
            return ocr_results

        except Exception as e:
            logger.error(f"OCR analysis failed: {e}", exc_info=True)
            return None

    async def initialize(self, config: Optional[Dict[str, Any]] = None):
        """Initialize the plugin (optional lifecycle method)."""
        if not OCR_AVAILABLE:
            error_msg = f"OCR plugin initialized but rapidocr is not available. Error: {OCR_IMPORT_ERROR}"
            logger.warning(error_msg)
        else:
            # Initialize OCR engine during plugin initialization
            # Try CUDA first, fall back to CPU if GPU errors occur
            if self._ocr_engine is None:
                try:
                    ocr_params = {
                        "EngineConfig.onnxruntime.use_cuda": True,
                    }
                    self._ocr_engine = RapidOCR(params=ocr_params)
                    self.use_cuda = True
                    logger.info("OCR plugin initialized and ready with CUDA support")
                except Exception as e:
                    # If CUDA fails (any CUDA/CUDNN error), try CPU fallback
                    error_msg = str(e)
                    error_type = type(e).__name__
                    
                    # Check if it's an ONNXRuntimeError or CUDA-related error
                    is_cuda_error = (
                        "ONNXRuntimeError" in error_type or
                        "ONNXRuntimeError" in error_msg or
                        "RuntimeException" in error_type or
                        "RUNTIME_EXCEPTION" in error_msg or
                        any(keyword in error_msg for keyword in [
                            "Failed to allocate memory",
                            "CUBLAS_STATUS_ALLOC_FAILED",
                            "CUBLAS failure",
                            "CUDNN",
                            "CUDA",
                            "cuda_call",
                            "cublas",
                            "cudnn",
                            "CUDNN_STATUS",
                            "CUBLAS_STATUS"
                        ])
                    )
                    
                    if is_cuda_error:
                        logger.warning(
                            f"OCR CUDA initialization failed (GPU error detected). "
                            f"Falling back to CPU. Error: {error_msg[:200]}"
                        )
                        try:
                            ocr_params = {
                                "EngineConfig.onnxruntime.use_cuda": False,
                            }
                            self._ocr_engine = RapidOCR(params=ocr_params)
                            self.use_cuda = False
                            logger.info("OCR plugin initialized with CPU fallback")
                        except Exception as cpu_error:
                            logger.error(f"OCR CPU initialization also failed: {cpu_error}", exc_info=True)
                            self._ocr_engine = None
                    else:
                        # Not a CUDA error - re-raise
                        logger.error(f"Failed to initialize OCR engine: {e}", exc_info=True)
                        self._ocr_engine = None

    async def shutdown(self):
        """Cleanup plugin resources (optional lifecycle method)."""
        self._ocr_engine = None
        logger.debug("OCR plugin shutdown")

