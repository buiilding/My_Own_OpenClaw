from pathlib import Path


def test_api_container_registers_load_settings_handler() -> None:
    source = Path("backend/src/core/container/api_container.py").read_text(encoding="utf-8")
    assert 'registry.register("load-settings", load_settings_handler)' in source
