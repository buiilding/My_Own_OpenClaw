import base64

import backend.src.services.ocr.ocr_service as ocr_service_module
import pytest
from backend.src.core.config.models import OCRConfig
from backend.src.services.ocr.ocr_service import OcrService, is_cuda_error


def test_is_cuda_error_detects_onnxruntime_and_keywords():
    class ONNXRuntimeError(RuntimeError):
        pass

    assert is_cuda_error(ONNXRuntimeError("anything")) is True
    assert is_cuda_error(RuntimeError("CUDNN_STATUS_ALLOC_FAILED")) is True
    assert is_cuda_error(RuntimeError("plain error")) is False


def test_decode_screenshot_accepts_plain_base64_and_data_url():
    service = OcrService()
    raw = b"image-bytes"
    encoded = base64.b64encode(raw).decode("ascii")

    assert service._decode_screenshot(encoded) == raw
    assert service._decode_screenshot(f"data:image/png;base64,{encoded}") == raw


def test_decode_screenshot_rejects_invalid_payloads():
    service = OcrService()

    assert service._decode_screenshot("") is None
    assert service._decode_screenshot("not-base64!!!") is None
    assert service._decode_screenshot("data:image/png;base64") is None
    assert service._decode_screenshot(None) is None


def test_build_bbox_list_skips_invalid_polygons():
    service = OcrService()
    boxes = [
        [[10, 20], [20, 20], [20, 30], [10, 30]],
        [[0.5, 1.5], [2.5, 1.5], [2.5, 4.0], [0.5, 4.0]],
        None,
        [[1, 2], [3, 4]],  # too short
        [[1, 2], [3, "x"], [5, 6], [7, 8]],  # invalid point
    ]

    assert service._build_bbox_list(boxes) == [(10, 20, 20, 30), (0, 1, 2, 4)]


def test_build_ocr_params_uses_thresholds_and_thread_config(monkeypatch):
    config = OCRConfig(
        batch_size_thresholds=[
            [16.0, 24, 10],
            [8.0, 12, 6],
            [0.0, 6, 4],
        ],
        use_cpu_cores_for_threads=True,
        inter_op_threads_max=6,
        inter_op_threads_min=3,
    )
    service = OcrService(config=config)
    monkeypatch.setattr(service, "_detect_gpu_memory", lambda: 12.0)
    monkeypatch.setattr(service, "_detect_cpu_cores", lambda: 10)

    params = service._build_ocr_params(use_cuda=True)

    assert params["Rec.rec_batch_num"] == 12
    assert params["Cls.cls_batch_num"] == 6
    assert params["EngineConfig.onnxruntime.intra_op_num_threads"] == 10
    assert params["EngineConfig.onnxruntime.inter_op_num_threads"] == 5


def test_normalize_ocr_field_coerces_common_types():
    service = OcrService()

    assert service._normalize_ocr_field(None) == []
    assert service._normalize_ocr_field("text") == ["text"]
    assert service._normalize_ocr_field((1, 2)) == [1, 2]
    assert service._normalize_ocr_field(123) == [123]


def test_normalize_ocr_field_handles_numpy_array_if_available():
    service = OcrService()
    if not ocr_service_module.NUMPY_AVAILABLE:
        return

    array = ocr_service_module.np.array([1, 2, 3])
    assert service._normalize_ocr_field(array) == [1, 2, 3]


def test_build_ocr_params_cpu_mode_uses_lowest_batch_threshold(monkeypatch):
    config = OCRConfig(batch_size_thresholds=[[8.0, 12, 6], [0.0, 5, 3]])
    service = OcrService(config=config)
    monkeypatch.setattr(service, "_detect_cpu_cores", lambda: 8)

    params = service._build_ocr_params(use_cuda=False)

    assert params["Rec.rec_batch_num"] == 5
    assert params["Cls.cls_batch_num"] == 3
    assert params["EngineConfig.onnxruntime.use_cuda"] is False


def test_build_ocr_params_uses_sorted_thresholds_when_config_unsorted(monkeypatch):
    config = OCRConfig(
        batch_size_thresholds=[
            [0.0, 5, 3],
            [16.0, 24, 10],
            [8.0, 12, 6],
        ]
    )
    service = OcrService(config=config)
    monkeypatch.setattr(service, "_detect_gpu_memory", lambda: 12.0)
    monkeypatch.setattr(service, "_detect_cpu_cores", lambda: 8)

    params_gpu = service._build_ocr_params(use_cuda=True)
    params_cpu = service._build_ocr_params(use_cuda=False)

    assert params_gpu["Rec.rec_batch_num"] == 12
    assert params_gpu["Cls.cls_batch_num"] == 6
    assert params_cpu["Rec.rec_batch_num"] == 5
    assert params_cpu["Cls.cls_batch_num"] == 3


def test_ensure_engine_initialized_sync_short_circuits_when_engine_exists():
    service = OcrService()
    service._ocr_engine = object()

    assert service._ensure_engine_initialized_sync() is True


def test_ensure_engine_initialized_sync_uses_lazy_init_when_available(monkeypatch):
    service = OcrService()
    service._ocr_engine = None
    monkeypatch.setattr(ocr_service_module, "OCR_AVAILABLE", True)

    called = {"lazy": 0}

    def fake_lazy():
        called["lazy"] += 1
        service._ocr_engine = object()
        return True

    monkeypatch.setattr(service, "_lazy_initialize_engine", fake_lazy)

    assert service._ensure_engine_initialized_sync() is True
    assert called["lazy"] == 1


def test_run_ocr_engine_retries_with_cpu_when_cuda_error(monkeypatch):
    service = OcrService()
    service.use_cuda = True

    class RaisingEngine:
        def __call__(self, _image):
            raise RuntimeError("CUDNN_STATUS_ALLOC_FAILED")

    service._ocr_engine = RaisingEngine()
    image_bytes = b"image"
    expected = object()
    captured = {"payload": None}

    def fake_retry(payload):
        captured["payload"] = payload
        return expected

    monkeypatch.setattr(service, "_retry_ocr_with_cpu", fake_retry)

    assert service._run_ocr_engine(image_bytes) is expected
    assert captured["payload"] == image_bytes


def test_run_ocr_engine_raises_non_cuda_errors():
    service = OcrService()
    service.use_cuda = True

    class RaisingEngine:
        def __call__(self, _image):
            raise RuntimeError("non-cuda-failure")

    service._ocr_engine = RaisingEngine()

    with pytest.raises(RuntimeError, match="non-cuda-failure"):
        service._run_ocr_engine(b"image")


def test_build_ocr_results_maps_valid_rows_and_skips_invalid_rows():
    service = OcrService()

    class DummyResult:
        txts = ["hello", "bad"]
        scores = [0.75, "nan-not-float"]
        boxes = [
            [[1, 2], [4, 2], [4, 7], [1, 7]],
            [[8, 1], [10, "x"], [10, 4], [8, 4]],
        ]

    results = service._build_ocr_results(DummyResult())

    assert results == [
        {
            "id": "0",
            "text": "hello",
            "confidence": 0.75,
            "bbox": {"x": 1, "y": 2, "width": 3, "height": 5},
        }
    ]
