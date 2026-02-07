import hashlib
import logging

import pytest

from backend.src.services.vision.providers.internvl import (
    InternVLModel,
    _build_instruction_log_metadata,
    _is_meta_tensor_loading_error,
    build_grounding_prompt,
)
from backend.src.services.vision.providers.base import (
    load_model_with_fallbacks,
    resolve_model_device,
)


class _FakeCuda:
    def __init__(self, available: bool):
        self._available = available

    def is_available(self) -> bool:
        return self._available


class _FakeTorch:
    bfloat16 = "bf16"
    float16 = "f16"
    float32 = "f32"

    def __init__(self, cuda_available: bool):
        self.cuda = _FakeCuda(cuda_available)


def _test_logger():
    return logging.getLogger("tests.vision.provider.loader")


class _Param:
    def __init__(self, device):
        self.device = device


class _ModelWithDevice:
    def __init__(self, device):
        self.device = device


class _ModelWithParamsOnly:
    def __init__(self, device):
        self._device = device

    def parameters(self):
        return iter([_Param(self._device)])


class _ModelWithoutDeviceOrParams:
    pass


class _ParamWithDType:
    def __init__(self, dtype):
        self.dtype = dtype


class _ModelWithDTypeParams:
    def __init__(self, dtype):
        self._dtype = dtype

    def parameters(self):
        return iter([_ParamWithDType(self._dtype)])


class _DummyEvalModel:
    def __init__(self):
        self.moved_to = None
        self.eval_called = False

    def to(self, device):
        self.moved_to = device
        return self

    def eval(self):
        self.eval_called = True
        return self


def test_loader_returns_device_map_model_when_first_attempt_succeeds():
    fake_torch = _FakeTorch(cuda_available=True)
    calls = {"device_map": [], "direct": []}

    def load_device_map(dtype):
        calls["device_map"].append(dtype)
        return {"path": "device_map"}

    def load_direct(dtype, device):
        calls["direct"].append((dtype, device))
        return {"path": "direct"}

    model, dtype = load_model_with_fallbacks(
        provider_label="InternVL",
        model_name="provider/model",
        torch_module=fake_torch,
        device_map_dtype=fake_torch.bfloat16,
        load_device_map_model=load_device_map,
        load_direct_model=load_direct,
        logger_instance=_test_logger(),
        direct_retry_message="trying direct loading",
        cpu_retry_message="trying CPU fallback",
        failure_message="Failed to load vision model",
    )

    assert model == {"path": "device_map"}
    assert dtype == fake_torch.bfloat16
    assert calls["direct"] == []


def test_resolve_model_device_prefers_model_device_attribute():
    assert resolve_model_device(_ModelWithDevice("cuda:0")) == "cuda:0"


def test_resolve_model_device_uses_first_parameter_device():
    assert resolve_model_device(_ModelWithParamsOnly("cpu")) == "cpu"


def test_resolve_model_device_falls_back_to_cpu_when_unavailable():
    assert resolve_model_device(_ModelWithoutDeviceOrParams()) == "cpu"


def test_build_instruction_log_metadata_truncates_preview_and_hashes_text():
    instruction = "x" * 80

    preview, digest = _build_instruction_log_metadata(instruction)

    assert preview == "x" * 50
    assert digest == hashlib.sha256(instruction.encode()).hexdigest()[:8]


def test_build_instruction_log_metadata_keeps_short_preview():
    instruction = "click submit"

    preview, digest = _build_instruction_log_metadata(instruction)

    assert preview == instruction
    assert digest == hashlib.sha256(instruction.encode()).hexdigest()[:8]


def test_build_grounding_prompt_contains_instruction_ref():
    instruction = "click submit button"

    prompt = build_grounding_prompt(instruction)

    assert "<ref>click submit button</ref>" in prompt
    assert "Answer in the format of [[x1, y1, x2, y2]]" in prompt


def test_is_meta_tensor_loading_error_detects_meta_tensor_messages():
    assert _is_meta_tensor_loading_error(RuntimeError("Tensor.item() cannot be called on meta tensors"))
    assert _is_meta_tensor_loading_error(RuntimeError("meta tensor construction path failed"))
    assert _is_meta_tensor_loading_error(RuntimeError("ordinary error")) is False


def test_internvl_resolve_model_dtype_prefers_cached_dtype():
    model = InternVLModel.__new__(InternVLModel)
    model._model_dtype = "cached-dtype"

    dtype = model._resolve_model_dtype()

    assert dtype == "cached-dtype"


def test_internvl_resolve_model_dtype_uses_model_parameter_dtype():
    model = InternVLModel.__new__(InternVLModel)
    model._model_dtype = None
    model.model = _ModelWithDTypeParams("param-dtype")

    dtype = model._resolve_model_dtype()

    assert dtype == "param-dtype"


def test_internvl_load_model_retries_without_low_cpu_mem_usage_on_meta_error(monkeypatch):
    model = InternVLModel.__new__(InternVLModel)
    model.model_name = "OpenGVLab/InternVL3_5-4B"
    model.trust_remote_code = True
    calls = []

    def fake_from_pretrained(_model_name, **kwargs):
        calls.append(kwargs.copy())
        if len(calls) == 1:
            raise RuntimeError("Tensor.item() cannot be called on meta tensors")
        return _DummyEvalModel()

    monkeypatch.setattr(
        "backend.src.services.vision.providers.internvl.AutoModel.from_pretrained",
        fake_from_pretrained,
    )

    loaded = model._load_model(dtype="bf16", use_flash_attn=False, device="cpu")

    assert isinstance(loaded, _DummyEvalModel)
    assert loaded.moved_to == "cpu"
    assert loaded.eval_called is True
    assert len(calls) == 2
    assert calls[0]["low_cpu_mem_usage"] is True
    assert calls[1]["low_cpu_mem_usage"] is False


def test_internvl_load_model_does_not_retry_non_meta_errors(monkeypatch):
    model = InternVLModel.__new__(InternVLModel)
    model.model_name = "OpenGVLab/InternVL3_5-4B"
    model.trust_remote_code = True
    calls = {"count": 0}

    def fake_from_pretrained(_model_name, **_kwargs):
        calls["count"] += 1
        raise RuntimeError("some other loading error")

    monkeypatch.setattr(
        "backend.src.services.vision.providers.internvl.AutoModel.from_pretrained",
        fake_from_pretrained,
    )

    with pytest.raises(RuntimeError, match="some other loading error"):
        model._load_model(dtype="bf16", use_flash_attn=False, device="cpu")

    assert calls["count"] == 1


def test_loader_falls_back_to_direct_cuda_loading_when_device_map_fails():
    fake_torch = _FakeTorch(cuda_available=True)
    calls = {"device_map": 0, "direct": []}

    def load_device_map(_dtype):
        calls["device_map"] += 1
        raise RuntimeError("device_map failed")

    def load_direct(dtype, device):
        calls["direct"].append((dtype, device))
        return {"path": "direct", "device": device, "dtype": dtype}

    model, dtype = load_model_with_fallbacks(
        provider_label="InternVL",
        model_name="provider/model",
        torch_module=fake_torch,
        device_map_dtype=fake_torch.bfloat16,
        load_device_map_model=load_device_map,
        load_direct_model=load_direct,
        logger_instance=_test_logger(),
        direct_retry_message="trying direct loading",
        cpu_retry_message="trying CPU fallback",
        failure_message="Failed to load vision model",
    )

    assert calls["device_map"] == 1
    assert calls["direct"] == [(fake_torch.float16, "cuda")]
    assert model == {"path": "direct", "device": "cuda", "dtype": fake_torch.float16}
    assert dtype == fake_torch.float16


def test_loader_uses_cpu_fallback_when_direct_loading_fails():
    fake_torch = _FakeTorch(cuda_available=True)
    calls = {"direct": []}

    def load_device_map(_dtype):
        raise RuntimeError("device_map failed")

    def load_direct(dtype, device):
        calls["direct"].append((dtype, device))
        if device == "cuda":
            raise RuntimeError("direct failed")
        return {"path": "cpu_fallback", "device": device, "dtype": dtype}

    model, dtype = load_model_with_fallbacks(
        provider_label="InternVL",
        model_name="provider/model",
        torch_module=fake_torch,
        device_map_dtype=fake_torch.bfloat16,
        load_device_map_model=load_device_map,
        load_direct_model=load_direct,
        logger_instance=_test_logger(),
        direct_retry_message="trying direct loading",
        cpu_retry_message="trying CPU fallback",
        failure_message="Failed to load vision model",
    )

    assert calls["direct"] == [(fake_torch.float16, "cuda"), (fake_torch.float32, "cpu")]
    assert model == {
        "path": "cpu_fallback",
        "device": "cpu",
        "dtype": fake_torch.float32,
    }
    assert dtype == fake_torch.float32


def test_loader_raises_runtime_error_when_all_attempts_fail():
    fake_torch = _FakeTorch(cuda_available=False)

    def load_device_map(_dtype):
        raise RuntimeError("device_map failed")

    def load_direct(_dtype, _device):
        raise RuntimeError("direct failed")

    with pytest.raises(RuntimeError) as exc_info:
        load_model_with_fallbacks(
            provider_label="Venus",
            model_name="provider/model",
            torch_module=fake_torch,
            device_map_dtype=fake_torch.float32,
            load_device_map_model=load_device_map,
            load_direct_model=load_direct,
            logger_instance=_test_logger(),
            direct_retry_message="trying direct loading",
            cpu_retry_message="trying CPU fallback",
            failure_message="Failed to load Venus vision model",
        )

    assert "Failed to load Venus vision model" in str(exc_info.value)
