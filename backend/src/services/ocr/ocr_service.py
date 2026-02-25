"""
OCR Service.

Provides OCR analysis for screenshots without the plugin system.
"""
import logging
import threading
from typing import Any, Dict, List, Optional

from backend.src.core.config.models import OCRConfig
from backend.src.services.ocr.helpers import (
    decode_screenshot_payload,
    is_cuda_error,
    normalize_ocr_field,
)
from backend.src.services.ocr.runtime_config import (
    build_ocr_params_payload,
    detect_cpu_cores,
    detect_gpu_memory_gb,
    normalized_batch_thresholds,
    resolve_batch_sizes,
    resolve_thread_counts,
)

logger = logging.getLogger(__name__)

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

try:
    import numpy as np
    NUMPY_AVAILABLE = True
except Exception:
    np = None  # type: ignore[assignment]
    NUMPY_AVAILABLE = False

class OcrService:
    """
    OCR service for analyzing screenshots.

    Provides an async API for OCR with CUDA/CPU fallback.
    """

    def __init__(self, config: Optional[OCRConfig] = None) -> None:
        self.enabled = True
        self._ocr_engine = None
        self.use_cuda = False
        self._init_lock = threading.Lock()
        self._ocr_config = config

        if not OCR_AVAILABLE:
            self.enabled = False

    def _detect_gpu_memory(self) -> Optional[float]:
        """
        Detect GPU memory in GB.

        Returns:
            GPU memory in GB, or None if detection fails
        """
        return detect_gpu_memory_gb()

    def _detect_cpu_cores(self) -> int:
        """
        Detect number of physical CPU cores.

        Returns:
            Number of physical CPU cores, or 4 as fallback
        """
        return detect_cpu_cores()

    def _build_ocr_params(self, use_cuda: bool) -> Dict[str, Any]:
        """
        Build optimized OCR parameters with all configs explicitly set.

        Args:
            use_cuda: Whether to use CUDA

        Returns:
            Dictionary of OCR parameters
        """
        config = self._ocr_config or OCRConfig()

        gpu_memory_gb = self._detect_gpu_memory() if use_cuda else None
        cpu_cores = self._detect_cpu_cores()
        sorted_thresholds = self._normalized_batch_thresholds(config.batch_size_thresholds)
        rec_batch_num, cls_batch_num = resolve_batch_sizes(
            use_cuda=use_cuda,
            gpu_memory_gb=gpu_memory_gb,
            sorted_thresholds=sorted_thresholds,
        )
        intra_op_threads, inter_op_threads = resolve_thread_counts(config, cpu_cores)
        ocr_params = build_ocr_params_payload(
            config=config,
            use_cuda=use_cuda,
            intra_op_threads=intra_op_threads,
            inter_op_threads=inter_op_threads,
            rec_batch_num=rec_batch_num,
            cls_batch_num=cls_batch_num,
        )

        if use_cuda and gpu_memory_gb:
            logger.info(
                f"[OCR] Hardware detected: GPU {gpu_memory_gb:.1f}GB VRAM, "
                f"{cpu_cores} CPU cores. Using batch sizes: rec={rec_batch_num}, cls={cls_batch_num}"
            )
        else:
            logger.info(
                f"[OCR] Hardware detected: CPU only. "
                f"{cpu_cores} CPU cores. Using batch sizes: rec={rec_batch_num}, cls={cls_batch_num}"
            )

        return ocr_params

    @staticmethod
    def _normalized_batch_thresholds(
        thresholds: List[List[float | int]],
    ) -> List[tuple[float, int, int]]:
        """Normalize and sort batch-size thresholds by descending VRAM requirement."""
        return normalized_batch_thresholds(thresholds)

    def _create_engine(self, use_cuda: bool) -> None:
        ocr_params = self._build_ocr_params(use_cuda=use_cuda)
        self._ocr_engine = RapidOCR(params=ocr_params)
        self.use_cuda = use_cuda

    async def initialize(self, config: Optional[OCRConfig] = None) -> None:
        """
        Initialize the OCR engine.

        Args:
            config: Optional OCRConfig to apply
        """
        if config is not None:
            self._ocr_config = config

        if not OCR_AVAILABLE:
            self.enabled = False
            logger.warning(
                f"OCR service initialized but rapidocr is not available. Error: {OCR_IMPORT_ERROR}"
            )
            return

        if self._ocr_engine is not None:
            return

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
            self._create_engine(use_cuda=True)
            logger.info("OCR service initialized and ready with CUDA support")
            logger.info("[OCR] Using CUDA device for OCR processing")
        except Exception as e:
            error_msg = str(e)

            if is_cuda_error(e):
                logger.warning(
                    "OCR CUDA initialization failed (GPU error detected). "
                    f"Falling back to CPU. Error: {error_msg[:200]}"
                )
                try:
                    self._create_engine(use_cuda=False)
                    logger.info("OCR service initialized with CPU fallback")
                    logger.info("[OCR] Using CPU device for OCR processing (CUDA initialization failed)")
                except Exception as cpu_error:
                    logger.error(f"OCR CPU initialization also failed: {cpu_error}", exc_info=True)
                    self._ocr_engine = None
            else:
                logger.error(f"Failed to initialize OCR engine: {e}", exc_info=True)
                self._ocr_engine = None

    async def perform_ocr(self, screenshot_b64: str) -> Optional[List[Dict[str, Any]]]:
        """
        Perform OCR analysis on a base64-encoded screenshot.

        Args:
            screenshot_b64: Base64-encoded screenshot image

        Returns:
            List of OCR results with text, bounding boxes, and confidence scores
        """
        if not self.enabled:
            logger.warning("OCR service is disabled or not available")
            return None

        import asyncio
        return await asyncio.to_thread(self._perform_ocr_sync, screenshot_b64)

    def _perform_ocr_sync(self, screenshot_b64: str) -> Optional[List[Dict[str, Any]]]:
        """Synchronous implementation of OCR analysis to be run in a thread."""
        import time
        ocr_analysis_start = time.perf_counter()
        device = "CUDA" if self.use_cuda else "CPU"
        logger.info(f"[Timing] OCR analysis starting (device={device})")
        try:
            if not self._ensure_engine_initialized_sync():
                return None

            image_bytes = self._decode_screenshot(screenshot_b64)
            if image_bytes is None:
                return None

            result = self._run_ocr_engine(image_bytes)
            if result is None:
                return None

            ocr_results = self._build_ocr_results(result)

            ocr_analysis_time = time.perf_counter() - ocr_analysis_start
            device = "CUDA" if self.use_cuda else "CPU"
            logger.info(
                "[Timing] OCR analysis completed in "
                f"{ocr_analysis_time:.3f}s (device={device}): found {len(ocr_results)} text elements"
            )
            logger.info(f"OCR analysis completed: found {len(ocr_results)} text elements")

            return ocr_results

        except Exception as e:
            logger.error(f"OCR analysis failed: {e}", exc_info=True)
            return None

    def _ensure_engine_initialized_sync(self) -> bool:
        """Ensure OCR engine exists for synchronous OCR execution."""
        if self._ocr_engine is not None:
            return True

        with self._init_lock:
            if self._ocr_engine is not None:
                return True
            if not OCR_AVAILABLE:
                logger.warning("OCR requested but rapidocr not available")
                return False

            logger.warning(
                "OCR engine not initialized at startup, initializing now (this should not happen)"
            )
            return self._lazy_initialize_engine()

    def _lazy_initialize_engine(self) -> bool:
        """Initialize OCR engine with CUDA-first strategy and CPU fallback."""
        try:
            self._create_engine(use_cuda=True)
            logger.info("Initialized RapidOCR engine with CUDA support (lazy initialization)")
            logger.info("[OCR] Using CUDA device for OCR processing")
            return True
        except Exception as cuda_error:
            logger.debug(
                "CUDA initialization failed during lazy init, trying CPU: %s",
                cuda_error,
            )
            try:
                self._create_engine(use_cuda=False)
                logger.info("Initialized RapidOCR engine with CPU (lazy initialization fallback)")
                logger.info("[OCR] Using CPU device for OCR processing (CUDA unavailable)")
                return True
            except Exception as cpu_error:
                logger.error(
                    "OCR lazy initialization failed for both CUDA and CPU: %s",
                    cpu_error,
                    exc_info=True,
                )
                self._ocr_engine = None
                return False

    def _run_ocr_engine(self, image_bytes: bytes) -> Any:
        """Execute OCR engine and apply runtime CUDA fallback when needed."""
        try:
            return self._ocr_engine(image_bytes)
        except Exception as ocr_error:
            error_msg = str(ocr_error)

            if not is_cuda_error(ocr_error):
                raise

            if self.use_cuda:
                logger.debug(
                    "OCR CUDA error during analysis. GPU memory exhausted. "
                    f"Reloading OCR engine with CPU fallback. Error: {error_msg[:200]}"
                )
                return self._retry_ocr_with_cpu(image_bytes)

            logger.warning(
                "OCR analysis failed (already using CPU but CUDA error persists): "
                f"{error_msg[:200]}. Skipping OCR analysis."
            )
            return None

    def _retry_ocr_with_cpu(self, image_bytes: bytes) -> Any:
        """Reload OCR engine in CPU mode and retry OCR execution once."""
        try:
            self._create_engine(use_cuda=False)
            logger.warning(
                "OCR engine reloaded with CPU (CUDA memory exhausted) - retrying analysis"
            )
            result = self._ocr_engine(image_bytes)
            logger.info("OCR analysis completed successfully with CPU fallback")
            return result
        except Exception as reload_error:
            logger.error(
                f"OCR CPU fallback also failed: {reload_error}. "
                "Skipping OCR analysis.",
                exc_info=True,
            )
            return None

    def _build_ocr_results(self, result: Any) -> List[Dict[str, Any]]:
        """Map raw OCR engine result object into normalized OCR records."""
        if not result or not hasattr(result, "txts"):
            logger.warning("OCR returned invalid result format")
            return []

        text_list = self._normalize_ocr_field(getattr(result, "txts", None))
        scores_list = self._normalize_ocr_field(getattr(result, "scores", None))
        boxes_list = self._normalize_ocr_field(getattr(result, "boxes", None))

        bbox_list = self._build_bbox_list(boxes_list)
        if not text_list or not bbox_list:
            logger.info("OCR found no text elements")
            return []

        ocr_results: List[Dict[str, Any]] = []
        for i, (text, bbox) in enumerate(zip(text_list, bbox_list)):
            ocr_record = self._build_ocr_record(i, text, bbox, scores_list)
            if ocr_record is not None:
                ocr_results.append(ocr_record)
        return ocr_results

    def _build_ocr_record(
        self,
        index: int,
        text: Any,
        bbox: tuple[int, int, int, int],
        scores_list: List[Any],
    ) -> Optional[Dict[str, Any]]:
        """Build one OCR record row from parsed OCR components."""
        try:
            x1, y1, x2, y2 = bbox
            confidence = (
                float(scores_list[index])
                if index < len(scores_list) and scores_list[index] is not None
                else 0.9
            )

            return {
                "id": str(index),
                "text": str(text).strip(),
                "confidence": confidence,
                "bbox": {
                    "x": int(x1),
                    "y": int(y1),
                    "width": int(x2 - x1),
                    "height": int(y2 - y1),
                },
            }
        except (ValueError, IndexError) as e:
            logger.warning(f"Failed to parse OCR bbox for text '{text}': {e}")
            return None

    def _normalize_ocr_field(self, value: Any) -> List[Any]:
        return normalize_ocr_field(
            value,
            numpy_available=NUMPY_AVAILABLE,
            numpy_module=np,
        )

    def _decode_screenshot(self, screenshot_b64: str) -> Optional[bytes]:
        return decode_screenshot_payload(screenshot_b64, logger=logger)

    def _parse_bbox(self, box: Any) -> Optional[tuple[int, int, int, int]]:
        """Convert OCR polygon points to an axis-aligned bounding box."""
        if box is None or not hasattr(box, "__len__") or len(box) < 4:
            return None

        try:
            x_coords = [float(point[0]) for point in box]
            y_coords = [float(point[1]) for point in box]
        except (TypeError, ValueError, IndexError):
            return None

        return (
            int(min(x_coords)),
            int(min(y_coords)),
            int(max(x_coords)),
            int(max(y_coords)),
        )

    def _build_bbox_list(self, boxes_list: List[Any]) -> List[tuple[int, int, int, int]]:
        bbox_list: List[tuple[int, int, int, int]] = []
        for box in boxes_list:
            bbox = self._parse_bbox(box)
            if bbox is not None:
                bbox_list.append(bbox)
        return bbox_list

    async def shutdown(self) -> None:
        """Cleanup OCR resources."""
        self._ocr_engine = None
        logger.debug("OCR service shutdown")
