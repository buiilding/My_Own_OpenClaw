from backend.src.core.config.models import OCRConfig
from backend.src.services.ocr.runtime_config import (
    build_ocr_params_payload,
    detect_cpu_cores,
    normalized_batch_thresholds,
    resolve_batch_sizes,
    resolve_thread_counts,
)


def test_normalized_batch_thresholds_ignores_malformed_rows():
    thresholds = normalized_batch_thresholds(
        [
            [16.0, 24, 10],
            ["bad", 12, 6],
            [8.0, "bad", 6],
            [0.0, 5, 3],
        ]
    )

    assert thresholds == [(16.0, 24, 10), (0.0, 5, 3)]


def test_normalized_batch_thresholds_falls_back_when_all_invalid():
    thresholds = normalized_batch_thresholds([["bad", "bad", "bad"]])

    assert thresholds == [(0.0, 6, 4)]


def test_resolve_batch_sizes_uses_gpu_match_or_cpu_lowest_threshold():
    sorted_thresholds = [(16.0, 24, 10), (8.0, 12, 6), (0.0, 6, 4)]

    assert resolve_batch_sizes(
        use_cuda=True,
        gpu_memory_gb=12.0,
        sorted_thresholds=sorted_thresholds,
    ) == (12, 6)
    assert resolve_batch_sizes(
        use_cuda=False,
        gpu_memory_gb=None,
        sorted_thresholds=sorted_thresholds,
    ) == (6, 4)


def test_resolve_thread_counts_honors_config_bounds():
    config = OCRConfig(
        use_cpu_cores_for_threads=True,
        inter_op_threads_max=6,
        inter_op_threads_min=3,
    )

    intra_threads, inter_threads = resolve_thread_counts(config, cpu_cores=10)
    assert intra_threads == 10
    assert inter_threads == 5


def test_build_ocr_params_payload_sets_runtime_flags_and_batches():
    config = OCRConfig()

    params = build_ocr_params_payload(
        config=config,
        use_cuda=False,
        intra_op_threads=8,
        inter_op_threads=4,
        rec_batch_num=5,
        cls_batch_num=3,
    )

    assert params["EngineConfig.onnxruntime.use_cuda"] is False
    assert params["EngineConfig.onnxruntime.intra_op_num_threads"] == 8
    assert params["EngineConfig.onnxruntime.inter_op_num_threads"] == 4
    assert params["Rec.rec_batch_num"] == 5
    assert params["Cls.cls_batch_num"] == 3


def test_detect_cpu_cores_falls_back_when_cpu_count_missing(monkeypatch):
    monkeypatch.delattr("backend.src.services.ocr.runtime_config.os.cpu_count", raising=False)

    assert detect_cpu_cores() == 4
