"""Runtime configuration helpers for OCR engine setup."""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Tuple

from backend.src.core.config.models import OCRConfig


def detect_gpu_memory_gb() -> Optional[float]:
    """Return primary GPU memory in GB when CUDA is available."""
    try:
        import torch

        if torch.cuda.is_available():
            return torch.cuda.get_device_properties(0).total_memory / (1024**3)
    except (ImportError, Exception):
        return None
    return None


def detect_cpu_cores() -> int:
    """Return physical CPU cores estimate with conservative fallback."""
    try:
        if hasattr(os, "cpu_count"):
            cores = os.cpu_count()
            if cores:
                return max(4, cores - 1)
    except Exception:
        return 4
    return 4


def normalized_batch_thresholds(
    thresholds: List[List[float | int]],
) -> List[Tuple[float, int, int]]:
    """Normalize and sort batch-size thresholds by descending VRAM requirement."""
    normalized: List[Tuple[float, int, int]] = []
    for row in thresholds:
        if not isinstance(row, (list, tuple)) or len(row) != 3:
            continue
        try:
            min_gpu = float(row[0])
            rec_batch = int(row[1])
            cls_batch = int(row[2])
        except (TypeError, ValueError):
            continue
        normalized.append((min_gpu, rec_batch, cls_batch))

    if not normalized:
        normalized = [(0.0, 6, 4)]
    return sorted(normalized, key=lambda item: item[0], reverse=True)


def resolve_batch_sizes(
    *,
    use_cuda: bool,
    gpu_memory_gb: Optional[float],
    sorted_thresholds: List[Tuple[float, int, int]],
) -> Tuple[int, int]:
    """Resolve OCR recognition/classification batch sizes from runtime + thresholds."""
    rec_batch_num = 6
    cls_batch_num = 4
    if use_cuda and gpu_memory_gb:
        for min_gpu, rec_batch, cls_batch in sorted_thresholds:
            if gpu_memory_gb >= min_gpu:
                rec_batch_num = rec_batch
                cls_batch_num = cls_batch
                break
    elif sorted_thresholds:
        _, rec_batch_num, cls_batch_num = sorted_thresholds[-1]
    return rec_batch_num, cls_batch_num


def resolve_thread_counts(config: OCRConfig, cpu_cores: int) -> Tuple[int, int]:
    """Resolve intra/inter-op thread counts for OCR runtime."""
    if config.use_cpu_cores_for_threads:
        intra_op_threads = cpu_cores
        inter_op_threads = min(
            config.inter_op_threads_max,
            max(config.inter_op_threads_min, cpu_cores // 2),
        )
    else:
        intra_op_threads = cpu_cores
        inter_op_threads = min(4, max(2, cpu_cores // 2))
    return intra_op_threads, inter_op_threads


def build_ocr_params_payload(
    *,
    config: OCRConfig,
    use_cuda: bool,
    intra_op_threads: int,
    inter_op_threads: int,
    rec_batch_num: int,
    cls_batch_num: int,
) -> Dict[str, Any]:
    """Build OCR params dictionary with explicit runtime + model options."""
    return {
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
