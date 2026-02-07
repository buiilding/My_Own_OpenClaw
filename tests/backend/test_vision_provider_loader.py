import logging

import pytest

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
