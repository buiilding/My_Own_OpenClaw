import pytest

import backend.src.services.vision.vision_service as vision_service_module
from backend.src.services.vision.vision_service import VisionService


class DummyInternModel:
    def __init__(self, model_name, device, trust_remote_code):
        self.model_name = model_name
        self.device = device
        self.trust_remote_code = trust_remote_code


class DummyVenusModel:
    def __init__(self, model_name, device, trust_remote_code):
        self.model_name = model_name
        self.device = device
        self.trust_remote_code = trust_remote_code


@pytest.mark.asyncio
async def test_initialize_returns_false_when_vision_dependencies_unavailable(monkeypatch):
    monkeypatch.setattr(vision_service_module, "VISION_MODELS_AVAILABLE", False)
    service = VisionService()

    assert await service.initialize() is False
    assert service.is_initialized is False
    assert service.initialization_error == "Vision model dependencies not available"


def test_build_model_instance_selects_venus_provider_by_prefix(monkeypatch):
    monkeypatch.setattr(vision_service_module, "InternVLModel", DummyInternModel)
    monkeypatch.setattr(vision_service_module, "VenusVisionModel", DummyVenusModel)
    service = VisionService(model_name="inclusionAI/UI-Venus-Ground-7B")

    model = service._build_model_instance()

    assert isinstance(model, DummyVenusModel)
    assert model.device == "auto"
    assert model.trust_remote_code is True


def test_build_model_instance_defaults_to_internvl_provider(monkeypatch):
    monkeypatch.setattr(vision_service_module, "InternVLModel", DummyInternModel)
    monkeypatch.setattr(vision_service_module, "VenusVisionModel", DummyVenusModel)
    service = VisionService(model_name="OpenGVLab/InternVL3_5-4B")

    model = service._build_model_instance()

    assert isinstance(model, DummyInternModel)
    assert model.device == "auto"
    assert model.trust_remote_code is True


@pytest.mark.asyncio
async def test_initialize_builds_model_and_marks_service_ready(monkeypatch):
    monkeypatch.setattr(vision_service_module, "VISION_MODELS_AVAILABLE", True)
    service = VisionService(model_name="OpenGVLab/InternVL3_5-4B")
    built_model = object()
    monkeypatch.setattr(service, "_build_model_instance", lambda: built_model)

    assert await service.initialize() is True
    assert service.is_initialized is True
    assert service.model is built_model


@pytest.mark.asyncio
async def test_initialize_failure_resets_model_state(monkeypatch):
    monkeypatch.setattr(vision_service_module, "VISION_MODELS_AVAILABLE", True)
    service = VisionService(model_name="OpenGVLab/InternVL3_5-4B")
    service._model = object()
    service._initialized = True

    def fail_build():
        raise RuntimeError("build failed")

    monkeypatch.setattr(service, "_build_model_instance", fail_build)

    assert await service.initialize() is True  # already initialized short-circuit

    service._initialized = False
    assert await service.initialize() is False
    assert service.is_initialized is False
    assert service.model is None
    assert service.initialization_error == "build failed"


@pytest.mark.asyncio
async def test_unload_model_clears_state_and_calls_cleanup_hooks(monkeypatch):
    service = VisionService()
    service._initialized = True
    service._model = object()
    called = {"cuda_clear": 0, "gc_collect": 0}

    monkeypatch.setattr(service, "_clear_cuda_cache_if_available", lambda: called.__setitem__("cuda_clear", 1))
    import gc
    monkeypatch.setattr(gc, "collect", lambda: called.__setitem__("gc_collect", 1))

    assert await service.unload_model() is True
    assert service.is_initialized is False
    assert service.model is None
    assert called["cuda_clear"] == 1
    assert called["gc_collect"] == 1


@pytest.mark.asyncio
async def test_unload_model_returns_false_when_not_initialized():
    service = VisionService()

    assert await service.unload_model() is False
