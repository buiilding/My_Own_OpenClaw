"""Covers backend security executor module surface."""

import backend.src.core.security.executor as executor_module


def test_security_executor_module_only_exposes_implemented_executors() -> None:
    assert hasattr(executor_module, "ToolExecutor")
    assert hasattr(executor_module, "DirectToolExecutor")
    assert not hasattr(executor_module, "ProcessSandboxedExecutor")
