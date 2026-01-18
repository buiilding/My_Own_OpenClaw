"""
Security module for the Desktop Assistant.

This module provides security-related functionality including tool execution
sandboxing, isolation, and security boundaries.
"""

from backend.src.core.security.executor import (
    ToolExecutor,
    DirectToolExecutor,
    ProcessSandboxedExecutor,
    get_tool_executor,
    set_tool_executor,
)

from backend.src.core.security.policy import (
    Permission,
    ResourceLimits,
    SecurityPolicy,
    ToolExecutionAudit,
)

__all__ = [
    "ToolExecutor",
    "DirectToolExecutor",
    "ProcessSandboxedExecutor",
    "get_tool_executor",
    "set_tool_executor",
    "Permission",
    "ResourceLimits",
    "SecurityPolicy",
    "ToolExecutionAudit",
]
