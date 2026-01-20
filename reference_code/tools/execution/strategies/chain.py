"""
Execution Chain Builder.

Creates standard execution strategy chains.
"""
from typing import Any

from backend.src.tools.execution.strategies.audit import AuditExecutionStrategy
from backend.src.tools.execution.strategies.base import ExecutionStrategy
from backend.src.tools.execution.strategies.security import SecurityExecutionStrategy
from backend.src.tools.execution.strategies.validation import (
    ValidationExecutionStrategy,
)


def create_execution_chain(
    tool_registry: Any,
    security_policy: Any,
) -> ExecutionStrategy:
    """
    Create a standard execution strategy chain.

    Args:
        tool_registry: ToolRegistry instance
        security_policy: SecurityPolicy instance

    Returns:
        Root execution strategy with chain: Validation -> Security -> Audit -> Execute
    """
    # Terminal strategy (actual execution)
    execute_strategy = ExecutionStrategy()

    # Audit strategy
    audit_strategy = AuditExecutionStrategy(
        audit_logger=None, next_strategy=execute_strategy  # Uses global audit function
    )

    # Security strategy
    security_strategy = SecurityExecutionStrategy(
        security_policy=security_policy, next_strategy=audit_strategy
    )

    # Validation strategy (root)
    validation_strategy = ValidationExecutionStrategy(
        tool_registry=tool_registry, next_strategy=security_strategy
    )

    return validation_strategy
