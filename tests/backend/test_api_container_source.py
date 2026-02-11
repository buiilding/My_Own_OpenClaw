from pathlib import Path


def test_api_container_uses_core_owned_routing_spec() -> None:
    source = Path("backend/src/core/container/api_container.py").read_text(encoding="utf-8")
    assert "build_handler_bindings(" in source
