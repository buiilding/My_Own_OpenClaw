"""
OCR Service.

Provides OCR analysis for screenshots without the plugin system.
"""
import base64
import logging
import threading
from typing import Any, Dict, List, Optional

from backend.src.core.config.models import OCRConfig

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

CUDA_ERROR_KEYWORDS = [
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
    "AllocateRawInternal",
    "RUNTIME_EXCEPTION",
]


def is_cuda_error(error: Exception) -> bool:
    error_msg = str(error)
    error_type = type(error).__name__
    if "ONNXRuntimeError" in error_type or "RuntimeException" in error_type:
        return True
    if "ONNXRuntimeError" in error_msg:
        return True
    return any(keyword in error_msg for keyword in CUDA_ERROR_KEYWORDS)


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
            if hasattr(os, "cpu_count"):
                cores = os.cpu_count()
                if cores:
                    return max(4, cores - 1)
        except Exception:
            pass
        return 4

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

        rec_batch_num = 6
        cls_batch_num = 4
        if use_cuda and gpu_memory_gb:
            for min_gpu, rec_batch, cls_batch in config.batch_size_thresholds:
                if gpu_memory_gb >= min_gpu:
                    rec_batch_num = rec_batch
                    cls_batch_num = cls_batch
                    break
        else:
            if config.batch_size_thresholds:
                _, rec_batch_num, cls_batch_num = config.batch_size_thresholds[-1]

        if config.use_cpu_cores_for_threads:
            intra_op_threads = cpu_cores
            inter_op_threads = min(
                config.inter_op_threads_max,
                max(config.inter_op_threads_min, cpu_cores // 2)
            )
        else:
            intra_op_threads = cpu_cores
            inter_op_threads = min(4, max(2, cpu_cores // 2))

        ocr_params = {
            "Global.use_det": config.use_detection,
            "Global.use_cls": config.use_classification,
            "Global.use_rec": config.use_recognition,
            "Global.text_score": config.text_score_threshold,
            "Global.max_side_len": config.max_side_len,
            "Global.min_side_len": config.min_side_len,
            "EngineConfig.onnxruntime.use_cuda": use_cuda,
            "EngineConfig.onnxruntime.intra_op_num_threads": intra_op_threads,
            "EngineConfig.onnxruntime.inter_op_num_threads": inter_op_threads,
            "Det.limit_side_len": config.det_limit_side_len,
            "Det.limit_type": config.det_limit_type,
            "Det.thresh": config.det_thresh,
            "Det.box_thresh": config.det_box_thresh,
            "Det.max_candidates": config.det_max_candidates,
            "Det.unclip_ratio": config.det_unclip_ratio,
            "Det.score_mode": config.det_score_mode,
            "Cls.cls_batch_num": cls_batch_num,
            "Cls.cls_thresh": config.cls_thresh,
            "Rec.rec_batch_num": rec_batch_num,
        }

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
            ocr_params = self._build_ocr_params(use_cuda=True)
            self._ocr_engine = RapidOCR(params=ocr_params)
            self.use_cuda = True
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
                    ocr_params = self._build_ocr_params(use_cuda=False)
                    self._ocr_engine = RapidOCR(params=ocr_params)
                    self.use_cuda = False
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
            if self._ocr_engine is None:
                with self._init_lock:
                    if self._ocr_engine is not None:
                        pass
                    elif not OCR_AVAILABLE:
                        logger.warning("OCR requested but rapidocr not available")
                        return None
                    else:
                        logger.warning(
                            "OCR engine not initialized at startup, initializing now (this should not happen)"
                        )
                        try:
                            ocr_params = self._build_ocr_params(use_cuda=True)
                            self._ocr_engine = RapidOCR(params=ocr_params)
                            self.use_cuda = True
                            logger.info("Initialized RapidOCR engine with CUDA support (lazy initialization)")
                            logger.info("[OCR] Using CUDA device for OCR processing")
                        except Exception as e:
                            logger.debug(
                                f"CUDA initialization failed during lazy init, trying CPU: {e}"
                            )
                            ocr_params = self._build_ocr_params(use_cuda=False)
                            self._ocr_engine = RapidOCR(params=ocr_params)
                            self.use_cuda = False
                            logger.info("Initialized RapidOCR engine with CPU (lazy initialization fallback)")
                            logger.info("[OCR] Using CPU device for OCR processing (CUDA unavailable)")

            try:
                image_bytes = base64.b64decode(screenshot_b64)
            except Exception as e:
                logger.error(f"Failed to decode screenshot base64: {e}")
                return None

            try:
                result = self._ocr_engine(image_bytes)
            except Exception as ocr_error:
                error_msg = str(ocr_error)

                if is_cuda_error(ocr_error) and self.use_cuda:
                    logger.debug(
                        "OCR CUDA error during analysis. GPU memory exhausted. "
                        f"Reloading OCR engine with CPU fallback. Error: {error_msg[:200]}"
                    )
                    try:
                        ocr_params = self._build_ocr_params(use_cuda=False)
                        self._ocr_engine = RapidOCR(params=ocr_params)
                        self.use_cuda = False
                        logger.warning(
                            "OCR engine reloaded with CPU (CUDA memory exhausted) - retrying analysis"
                        )
                        result = self._ocr_engine(image_bytes)
                        logger.info("OCR analysis completed successfully with CPU fallback")
                    except Exception as reload_error:
                        logger.error(
                            f"OCR CPU fallback also failed: {reload_error}. "
                            "Skipping OCR analysis.",
                            exc_info=True,
                        )
                        return None
                elif is_cuda_error(ocr_error):
                    logger.warning(
                        "OCR analysis failed (already using CPU but CUDA error persists): "
                        f"{error_msg[:200]}. Skipping OCR analysis."
                    )
                    return None
                else:
                    raise

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

            ocr_results = []
            for i, (text, bbox) in enumerate(zip(text_list, bbox_list)):
                try:
                    x1, y1, x2, y2 = bbox
                    confidence = (
                        float(scores_list[i])
                        if i < len(scores_list) and scores_list[i] is not None
                        else 0.9
                    )

                    ocr_results.append({
                        "id": str(i),
                        "text": str(text).strip(),
                        "confidence": confidence,
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
            logger.info(
                "[Timing] OCR analysis completed in "
                f"{ocr_analysis_time:.3f}s (device={device}): found {len(ocr_results)} text elements"
            )
            logger.info(f"OCR analysis completed: found {len(ocr_results)} text elements")

            return ocr_results

        except Exception as e:
            logger.error(f"OCR analysis failed: {e}", exc_info=True)
            return None

    def _normalize_ocr_field(self, value: Any) -> List[Any]:
        if value is None:
            return []
        if isinstance(value, str):
            return [value]
        try:
            import numpy as np

            if isinstance(value, np.ndarray):
                return value.tolist()
        except Exception:
            pass
        if isinstance(value, (list, tuple)):
            return list(value)
        return [value]

    def _build_bbox_list(self, boxes_list: List[Any]) -> List[tuple[int, int, int, int]]:
        bbox_list: List[tuple[int, int, int, int]] = []
        for box in boxes_list:
            if box is not None and len(box) >= 4:
                x_coords = [p[0] for p in box]
                y_coords = [p[1] for p in box]
                x1 = int(min(x_coords))
                y1 = int(min(y_coords))
                x2 = int(max(x_coords))
                y2 = int(max(y_coords))
                bbox_list.append((x1, y1, x2, y2))
        return bbox_list

    async def shutdown(self) -> None:
        """Cleanup OCR resources."""
        self._ocr_engine = None
        logger.debug("OCR service shutdown")
