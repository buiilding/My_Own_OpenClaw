"""
Security Boundaries for Tool Execution.

Provides permission checking, resource limits, and audit logging for tool execution.
"""
import logging
import time
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Optional, Set
from pathlib import Path

logger = logging.getLogger(__name__)


class Permission(Enum):
    """Tool execution permissions."""
    READ_FILESYSTEM = "read_filesystem"
    WRITE_FILESYSTEM = "write_filesystem"
    EXECUTE_COMMANDS = "execute_commands"
    NETWORK_ACCESS = "network_access"
    COMPUTER_CONTROL = "computer_control"
    READ_MEMORY = "read_memory"
    WRITE_MEMORY = "write_memory"


@dataclass
class ResourceLimits:
    """Resource limits for tool execution."""
    timeout: float = 30.0  # seconds
    max_memory_mb: Optional[int] = None  # MB, None = unlimited
    max_file_size_mb: Optional[int] = None  # MB, None = unlimited
    max_network_requests: int = 10
    max_concurrent_tools: int = 3


@dataclass
class ToolExecutionAudit:
    """Audit log entry for tool execution."""
    tool_name: str
    user_id: str
    session_id: str
    parameters: Dict[str, Any]
    success: bool
    execution_time: float
    error: Optional[str] = None
    timestamp: float = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = time.time()


class SecurityPolicy:
    """
    Defines security policy for tool execution.
    """
    
    def __init__(self, tool_registry: Optional[Any] = None):
        """
        Initialize security policy with defaults.
        
        Args:
            tool_registry: Optional ToolRegistry instance for looking up tool metadata
        """
        self.resource_limits = ResourceLimits()
        self.required_permissions: Dict[str, Set[Permission]] = {}
        self.blocked_tools: Set[str] = set()
        self.blocked_paths: List[str] = []
        self.audit_log: List[ToolExecutionAudit] = []
        self.max_audit_log_size = 1000
        self.tool_registry = tool_registry
    
    def check_permission(
        self,
        tool_name: str,
        permission: Permission,
        parameters: Dict[str, Any],
        tool_instance: Optional[Any] = None
    ) -> bool:
        """
        Check if a tool has the required permission.
        
        Args:
            tool_name: Name of the tool
            permission: Permission to check
            parameters: Tool parameters (for context-aware checks)
            tool_instance: Optional tool instance (if not provided, will look up from registry)
            
        Returns:
            True if permission is granted, False otherwise
        """
        # Check if tool is blocked
        if tool_name in self.blocked_tools:
            logger.warning(f"Tool {tool_name} is blocked by security policy")
            return False
        
        # Get tool instance if not provided
        tool = tool_instance
        if tool is None and self.tool_registry:
            tool = self.tool_registry.get_tool(tool_name)
        
        # Get required permissions from tool metadata (single source of truth)
        required = set()
        if tool and hasattr(tool, 'required_permissions'):
            required = tool.required_permissions
        
        # Fallback to explicit permissions dict (for tools not in registry)
        if not required:
            required = self.required_permissions.get(tool_name, set())
        
        # If still no permissions found, log warning and allow (tools should declare permissions)
        if not required:
            logger.warning(
                f"Tool '{tool_name}' does not declare required_permissions. "
                "All tools should explicitly declare their permissions. "
                "Defaulting to no permissions required (allow)."
            )
        
        # Check if permission is in required set
        if permission not in required:
            # Permission not required, allow
            return True
        
        # For now, all required permissions are granted
        # In production, implement user/role-based permission checking
        return True
    
    def check_resource_limits(
        self,
        tool_name: str,
        estimated_time: Optional[float] = None
    ) -> bool:
        """
        Check if tool execution would exceed resource limits.
        
        Args:
            tool_name: Name of the tool
            estimated_time: Estimated execution time (if available)
            
        Returns:
            True if within limits, False otherwise
        """
        if estimated_time and estimated_time > self.resource_limits.timeout:
            logger.warning(
                f"Tool {tool_name} estimated time {estimated_time}s exceeds "
                f"limit {self.resource_limits.timeout}s"
            )
            return False
        
        return True
    
    def check_path_access(self, path: str) -> bool:
        """
        Check if a path is accessible.
        
        Args:
            path: Path to check
            
        Returns:
            True if path is allowed, False if blocked
        """
        path_obj = Path(path).resolve()
        
        # Check blocked paths
        for blocked in self.blocked_paths:
            if path_obj.is_relative_to(Path(blocked).resolve()):
                logger.warning(f"Path {path} is blocked by security policy")
                return False
        
        return True
    
    def log_execution(self, audit: ToolExecutionAudit) -> None:
        """
        Log tool execution for audit purposes.
        
        Args:
            audit: Audit log entry
        """
        self.audit_log.append(audit)
        
        # Trim log if too large
        if len(self.audit_log) > self.max_audit_log_size:
            self.audit_log = self.audit_log[-self.max_audit_log_size:]
        
        # Log to logger
        status = "SUCCESS" if audit.success else "FAILED"
        logger.info(
            f"Tool execution audit: {audit.tool_name} | "
            f"User: {audit.user_id} | Session: {audit.session_id} | "
            f"Status: {status} | Time: {audit.execution_time:.3f}s"
        )
        
        if audit.error:
            logger.warning(f"Tool execution error: {audit.error}")
    
    def get_audit_log(
        self,
        tool_name: Optional[str] = None,
        user_id: Optional[str] = None,
        limit: int = 100
    ) -> List[ToolExecutionAudit]:
        """
        Get audit log entries.
        
        Args:
            tool_name: Filter by tool name (optional)
            user_id: Filter by user ID (optional)
            limit: Maximum number of entries to return
            
        Returns:
            List of audit log entries
        """
        entries = self.audit_log
        
        if tool_name:
            entries = [e for e in entries if e.tool_name == tool_name]
        
        if user_id:
            entries = [e for e in entries if e.user_id == user_id]
        
        # Sort by timestamp (newest first)
        entries.sort(key=lambda e: e.timestamp, reverse=True)
        
        return entries[:limit]


def check_tool_execution_permission(
    tool_name: str,
    permission: Permission,
    parameters: Dict[str, Any],
    security_policy: Optional[SecurityPolicy] = None
) -> bool:
    """
    Check if tool execution is permitted.
    
    DEPRECATED: Use SecurityPolicy.check_permission() directly instead.
    This function is kept for backward compatibility.
    
    Args:
        tool_name: Name of the tool
        permission: Required permission
        parameters: Tool parameters
        security_policy: Optional SecurityPolicy instance (creates default if not provided)
        
    Returns:
        True if permitted, False otherwise
    """
    if security_policy is None:
        # Create default policy (not ideal, but maintains backward compatibility)
        security_policy = SecurityPolicy()
    return security_policy.check_permission(tool_name, permission, parameters)


def audit_tool_execution(
    tool_name: str,
    user_id: str,
    session_id: str,
    parameters: Dict[str, Any],
    success: bool,
    execution_time: float,
    error: Optional[str] = None,
    security_policy: Optional[SecurityPolicy] = None
) -> None:
    """
    Log tool execution for audit purposes.
    
    DEPRECATED: Use SecurityPolicy.log_execution() directly instead.
    This function is kept for backward compatibility.
    
    Args:
        tool_name: Name of the tool
        user_id: User ID
        session_id: Session ID
        parameters: Tool parameters
        success: Whether execution succeeded
        execution_time: Execution time in seconds
        error: Error message if failed
        security_policy: Optional SecurityPolicy instance (creates default if not provided)
    """
    audit = ToolExecutionAudit(
        tool_name=tool_name,
        user_id=user_id,
        session_id=session_id,
        parameters=parameters,
        success=success,
        execution_time=execution_time,
        error=error
    )
    
    if security_policy is None:
        # Create default policy (not ideal, but maintains backward compatibility)
        security_policy = SecurityPolicy()
    security_policy.log_execution(audit)

