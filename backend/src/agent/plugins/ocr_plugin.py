"""
OCR Plugin for Agent.

This plugin provides OCR analysis functionality for screenshots.
Tools can use the perform_ocr() method to analyze screenshots.
"""
import logging
import base64
from typing import Any, Dict, List, Optional

from backend.src.agent.plugins.interface import AgentPlugin

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

    def _detect_gpu_memory(self) -> Optional[float]:
        """
        Detect GPU memory in GB.
        
        Returns:
            GPU memory in GB, or None if detection fails
        """
        try:
            import torch
            if torch.cuda.is_available():
                gpu_memory_gb = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
                return gpu_memory_gb
        except (ImportError, Exception):
            pass
        return None

    def _detect_cpu_cores(self) -> int:
        """
        Detect number of physical CPU cores.
        
        Returns:
            Number of physical CPU cores, or 4 as fallback
        """
        try:
            import os
            # Try to get physical cores
            if hasattr(os, 'cpu_count'):
                # On some systems, this returns physical cores
                cores = os.cpu_count()
                if cores:
                    # Use physical cores, but leave some for system
                    return max(4, cores - 1)
        except Exception:
            pass
        return 4  # Safe fallback

    def _build_ocr_params(self, use_cuda: bool) -> Dict[str, Any]:
        """
        Build optimized OCR parameters with all configs explicitly set.
        
        Safe optimizations applied:
        - Skip classification (use_cls: False) - screenshots are usually upright
        - Optimized batch sizes based on GPU memory
        - Optimized thread counts based on CPU cores
        
        All other parameters use RapidOCR defaults.
        
        Args:
            use_cuda: Whether to use CUDA
            
        Returns:
            Dictionary of OCR parameters
        """
        # Detect hardware
        gpu_memory_gb = self._detect_gpu_memory() if use_cuda else None
        cpu_cores = self._detect_cpu_cores()
        
        # Determine batch sizes based on GPU memory
        if use_cuda and gpu_memory_gb:
            if gpu_memory_gb >= 16:
                rec_batch_num = 12
                cls_batch_num = 8
            elif gpu_memory_gb >= 12:
                rec_batch_num = 10
                cls_batch_num = 6
            elif gpu_memory_gb >= 8:
                rec_batch_num = 8
                cls_batch_num = 6
            else:
                rec_batch_num = 6
                cls_batch_num = 4
        else:
            # CPU or unknown GPU memory - use conservative values
            rec_batch_num = 6
            cls_batch_num = 4
        
        # Thread optimization
        intra_op_threads = cpu_cores
        inter_op_threads = min(4, max(2, cpu_cores // 2))
        
        # Build comprehensive OCR parameters
        # All parameters explicitly set, with safe optimizations
        ocr_params = {
            # Global settings
            "Global.use_det": True,  # Default: enable detection
            "Global.use_cls": False,  # OPTIMIZATION: Skip classification (screenshots are upright)
            "Global.use_rec": True,  # Default: enable recognition
            "Global.text_score": 0.5,  # Default: text score threshold
            "Global.max_side_len": 2000,  # Default: max side length
            "Global.min_side_len": 30,  # Default: min side length
            
            # Engine configuration
            "EngineConfig.onnxruntime.use_cuda": use_cuda,
            "EngineConfig.onnxruntime.intra_op_num_threads": intra_op_threads,  # OPTIMIZATION: Based on CPU cores
            "EngineConfig.onnxruntime.inter_op_num_threads": inter_op_threads,  # OPTIMIZATION: Based on CPU cores
            
            # Detection settings (all defaults)
            "Det.limit_side_len": 736,  # Default
            "Det.limit_type": "min",  # Default
            "Det.thresh": 0.3,  # Default
            "Det.box_thresh": 0.5,  # Default (keeping for accuracy)
            "Det.max_candidates": 1000,  # Default (keeping for accuracy)
            "Det.unclip_ratio": 1.6,  # Default
            "Det.score_mode": "default",  # Default (not "fast" to preserve accuracy)
            
            # Classification settings (disabled, but parameters still needed)
            "Cls.cls_batch_num": cls_batch_num,  # OPTIMIZATION: Based on GPU memory
            "Cls.cls_thresh": 0.9,  # Default
            
            # Recognition settings
            "Rec.rec_batch_num": rec_batch_num,  # OPTIMIZATION: Based on GPU memory (12 for 16GB)
        }
        
        # Log detected hardware and applied optimizations
        if use_cuda and gpu_memory_gb:
            logger.info(
                f"[OCR] Hardware detected: GPU {gpu_memory_gb:.1f}GB VRAM, "
                f"{cpu_cores} CPU cores. Using batch sizes: rec={rec_batch_num}, cls={cls_batch_num}"
            )
        else:
            logger.info(
                f"[OCR] Hardware detected: {cpu_cores} CPU cores. "
                f"Using batch sizes: rec={rec_batch_num}, cls={cls_batch_num}"
            )
        
        # Log all OCR configuration parameters
        logger.info("[OCR] Configuration parameters:")
        logger.info(f"  Global: use_det={ocr_params['Global.use_det']}, use_cls={ocr_params['Global.use_cls']}, "
                   f"use_rec={ocr_params['Global.use_rec']}, text_score={ocr_params['Global.text_score']}, "
                   f"max_side_len={ocr_params['Global.max_side_len']}, min_side_len={ocr_params['Global.min_side_len']}")
        logger.info(f"  Engine: use_cuda={ocr_params['EngineConfig.onnxruntime.use_cuda']}, "
                   f"intra_op_threads={ocr_params['EngineConfig.onnxruntime.intra_op_num_threads']}, "
                   f"inter_op_threads={ocr_params['EngineConfig.onnxruntime.inter_op_num_threads']}")
        logger.info(f"  Detection: limit_side_len={ocr_params['Det.limit_side_len']}, "
                   f"thresh={ocr_params['Det.thresh']}, box_thresh={ocr_params['Det.box_thresh']}, "
                   f"max_candidates={ocr_params['Det.max_candidates']}, score_mode={ocr_params['Det.score_mode']}")
        logger.info(f"  Classification: cls_batch_num={ocr_params['Cls.cls_batch_num']}, "
                   f"cls_thresh={ocr_params['Cls.cls_thresh']}")
        logger.info(f"  Recognition: rec_batch_num={ocr_params['Rec.rec_batch_num']}")
        
        return ocr_params

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
        import asyncio
        return await asyncio.to_thread(self._perform_ocr_sync, screenshot_b64)

    def _perform_ocr_sync(self, screenshot_b64: str) -> Optional[List[Dict[str, Any]]]:
        """Synchronous implementation of OCR analysis to be run in a thread."""
        import time
        ocr_analysis_start = time.perf_counter()
        device = "CUDA" if self.use_cuda else "CPU"
        logger.info(f"[Timing] OCR analysis starting (device={device})")
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
                    ocr_params = self._build_ocr_params(use_cuda=True)
                    self._ocr_engine = RapidOCR(params=ocr_params)
                    self.use_cuda = True
                    logger.info("Initialized RapidOCR engine with CUDA support (lazy initialization)")
                    logger.info("[OCR] Using CUDA device for OCR processing")
                except Exception as e:
                    # Try CPU fallback if CUDA init fails
                    logger.debug(f"CUDA initialization failed during lazy init, trying CPU: {e}")
                    ocr_params = self._build_ocr_params(use_cuda=False)
                    self._ocr_engine = RapidOCR(params=ocr_params)
                    self.use_cuda = False
                    logger.info("Initialized RapidOCR engine with CPU (lazy initialization fallback)")
                    logger.info("[OCR] Using CPU device for OCR processing (CUDA unavailable)")

            # Decode base64 to bytes
            try:
                image_bytes = base64.b64decode(screenshot_b64)
            except Exception as e:
                logger.error(f"Failed to decode screenshot base64: {e}")
                return None
            
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
                        ocr_params = self._build_ocr_params(use_cuda=False)
                        self._ocr_engine = RapidOCR(params=ocr_params)
                        self.use_cuda = False
                        logger.warning("OCR engine reloaded with CPU (CUDA memory exhausted) - retrying analysis")
                        
                        # Retry OCR with CPU
                        result = self._ocr_engine(image_bytes)
                        logger.info("OCR analysis completed successfully with CPU fallback")
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
            
            ocr_analysis_time = time.perf_counter() - ocr_analysis_start
            device = "CUDA" if self.use_cuda else "CPU"
            logger.info(f"[Timing] OCR analysis completed in {ocr_analysis_time:.3f}s (device={device}): found {len(ocr_results)} text elements")
            logger.info(f"OCR analysis completed: found {len(ocr_results)} text elements")
            
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
                # Check CUDA availability
                try:
                    import torch
                    cuda_available = torch.cuda.is_available()
                    if cuda_available:
                        logger.info("[OCR] CUDA is available, attempting to use GPU")
                    else:
                        logger.info("[OCR] CUDA is not available, will use CPU")
                except ImportError:
                    logger.debug("[OCR] PyTorch not available, cannot check CUDA status")
                
                try:
                    ocr_params = self._build_ocr_params(use_cuda=True)
                    self._ocr_engine = RapidOCR(params=ocr_params)
                    self.use_cuda = True
                    logger.info("OCR plugin initialized and ready with CUDA support")
                    logger.info("[OCR] Using CUDA device for OCR processing")
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
                            ocr_params = self._build_ocr_params(use_cuda=False)
                            self._ocr_engine = RapidOCR(params=ocr_params)
                            self.use_cuda = False
                            logger.info("OCR plugin initialized with CPU fallback")
                            logger.info("[OCR] Using CPU device for OCR processing (CUDA initialization failed)")
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

