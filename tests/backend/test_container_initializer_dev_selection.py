from types import SimpleNamespace
import importlib.util
from pathlib import Path

import pytest

_MODULE_PATH = (
    Path(__file__).resolve().parents[2]
    / "backend"
    / "src"
    / "core"
    / "container"
    / "initializer.py"
)
_SPEC = importlib.util.spec_from_file_location("windieos_container_initializer", _MODULE_PATH)
if _SPEC is None or _SPEC.loader is None:
    raise RuntimeError(f"Unable to load module spec for {_MODULE_PATH}")
_MODULE = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(_MODULE)
ContainerInitializer = _MODULE.ContainerInitializer


class DummyVisionService:
    def __init__(self):
        self.calls = 0
        self.initialization_error = None

    async def initialize(self):
        self.calls += 1
        return True


class DummyOcrService:
    def __init__(self):
        self.calls = 0
        self.enabled = True

    async def initialize(self, _cfg):
        self.calls += 1


@pytest.mark.asyncio
async def test_initialize_vision_service_skipped_when_disabled(monkeypatch: pytest.MonkeyPatch):
    vision_service = DummyVisionService()
    container = SimpleNamespace(vision_service=vision_service)
    initializer = ContainerInitializer(container)
    monkeypatch.setattr(initializer, "_should_initialize_vision_service", lambda: False)

    await initializer._initialize_vision_service()

    assert vision_service.calls == 0


@pytest.mark.asyncio
async def test_initialize_ocr_service_skipped_and_disabled_when_disabled(monkeypatch: pytest.MonkeyPatch):
    ocr_service = DummyOcrService()
    container = SimpleNamespace(
        ocr_service=ocr_service,
        config=SimpleNamespace(ocr_config=object()),
    )
    initializer = ContainerInitializer(container)
    monkeypatch.setattr(initializer, "_should_initialize_ocr_service", lambda: False)

    await initializer._initialize_ocr_service()

    assert ocr_service.calls == 0
    assert ocr_service.enabled is False


@pytest.mark.asyncio
async def test_initialize_ocr_service_runs_when_enabled(monkeypatch: pytest.MonkeyPatch):
    ocr_service = DummyOcrService()
    container = SimpleNamespace(
        ocr_service=ocr_service,
        config=SimpleNamespace(ocr_config=object()),
    )
    initializer = ContainerInitializer(container)
    monkeypatch.setattr(initializer, "_should_initialize_ocr_service", lambda: True)

    await initializer._initialize_ocr_service()

    assert ocr_service.calls == 1
    assert ocr_service.enabled is True
