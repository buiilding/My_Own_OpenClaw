"""Covers backend security executor exports."""

from backend.src.core.security import __all__ as security_exports


def test_security_exports_only_implemented_executors() -> None:
    assert "ToolExecutor" in security_exports
    assert "DirectToolExecutor" in security_exports
    assert "ProcessSandboxedExecutor" not in security_exports
