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
    get_security_policy,
    check_tool_execution_permission,
    audit_tool_execution,
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
    "get_security_policy",
    "check_tool_execution_permission",
    "audit_tool_execution",
]
