import sys
import types


def install_route_deps_shim():
    """Install a lightweight deps shim so websocket route modules import cleanly in tests."""
    original_deps = sys.modules.get("backend.src.api.deps")
    fake_deps = types.ModuleType("backend.src.api.deps")
    fake_deps.ContainerDep = object
    fake_deps.SessionManagerDep = object
    fake_deps.HandlerRegistryDep = object
    sys.modules["backend.src.api.deps"] = fake_deps
    return original_deps


def restore_route_deps_shim(original_deps) -> None:
    if original_deps is not None:
        sys.modules["backend.src.api.deps"] = original_deps
    else:
        sys.modules.pop("backend.src.api.deps", None)
