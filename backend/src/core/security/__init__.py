"""
Security module for the Desktop Assistant.

This module provides security-related functionality for tool execution,
permissions, and trust boundaries.
"""

from backend.src.core.security.executor import (
    ToolExecutor,
    DirectToolExecutor,
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
    "get_tool_executor",
    "set_tool_executor",
    "Permission",
    "ResourceLimits",
    "SecurityPolicy",
    "ToolExecutionAudit",
]
