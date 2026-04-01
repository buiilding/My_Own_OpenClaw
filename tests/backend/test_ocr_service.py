import base64

import backend.src.services.ocr.ocr_service as ocr_service_module
import pytest
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


def test_build_engine_params_selects_quality_first_profile():
    service = OcrService()
    params = service._build_engine_params(use_cuda=True)

    assert params["Det.engine_type"] == ocr_service_module.EngineType.ONNXRUNTIME
    expected_det_lang = (
        ocr_service_module.LangDet.CH
        if ocr_service_module.LangDet is not None
        else "ch"
    )
    expected_rec_lang = (
        ocr_service_module.LangRec.CH
        if ocr_service_module.LangRec is not None
        else "ch"
    )
    assert params["Det.lang_type"] == expected_det_lang
    assert params["Det.model_type"] == ocr_service_module.ModelType.SERVER
    assert params["Det.ocr_version"] == ocr_service_module.OCRVersion.PPOCRV5
    assert params["Rec.engine_type"] == ocr_service_module.EngineType.ONNXRUNTIME
    assert params["Rec.lang_type"] == expected_rec_lang
    assert params["Rec.model_type"] == ocr_service_module.ModelType.SERVER
    assert params["Rec.ocr_version"] == ocr_service_module.OCRVersion.PPOCRV5
    assert params["EngineConfig.onnxruntime.use_cuda"] is True


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


def test_create_engine_uses_quality_first_profile(monkeypatch):
    service = OcrService()
    captured = {}

    class DummyRapidOCR:
        def __init__(self, *, params):
            captured["params"] = params

    monkeypatch.setattr(ocr_service_module, "RapidOCR", DummyRapidOCR)

    service._create_engine(use_cuda=False)

    assert captured["params"]["Det.engine_type"] == ocr_service_module.EngineType.ONNXRUNTIME
    expected_det_lang = (
        ocr_service_module.LangDet.CH
        if ocr_service_module.LangDet is not None
        else "ch"
    )
    expected_rec_lang = (
        ocr_service_module.LangRec.CH
        if ocr_service_module.LangRec is not None
        else "ch"
    )
    assert captured["params"]["Det.lang_type"] == expected_det_lang
    assert captured["params"]["Det.model_type"] == ocr_service_module.ModelType.SERVER
    assert captured["params"]["Det.ocr_version"] == ocr_service_module.OCRVersion.PPOCRV5
    assert captured["params"]["Rec.engine_type"] == ocr_service_module.EngineType.ONNXRUNTIME
    assert captured["params"]["Rec.lang_type"] == expected_rec_lang
    assert captured["params"]["Rec.model_type"] == ocr_service_module.ModelType.SERVER
    assert captured["params"]["Rec.ocr_version"] == ocr_service_module.OCRVersion.PPOCRV5
    assert captured["params"]["EngineConfig.onnxruntime.use_cuda"] is False
    assert service.use_cuda is False


def test_is_ready_requires_enabled_service_and_engine():
    service = OcrService()

    assert service.is_ready is False

    service._ocr_engine = object()
    assert service.is_ready is True

    service.enabled = False
    assert service.is_ready is False


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
