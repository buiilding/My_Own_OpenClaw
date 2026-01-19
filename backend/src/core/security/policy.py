"""
Security Boundaries for Tool Execution.

Provides permission checking, resource limits, and audit logging for tool execution.
"""
import logging
import time
from collections import deque
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
    """
    Audit log entry for tool execution.
    
    MEMORY DOS PROTECTION: Large parameter values (e.g., Base64 images, large text)
    are truncated to prevent unbounded memory growth in the audit log. While the
    deque is capped at 1000 entries, the content of those entries must also be
    bounded to prevent gigabytes of RAM consumption.
    """
    tool_name: str
    user_id: str
    session_id: str
    parameters: Dict[str, Any]
    success: bool
    execution_time: float
    error: Optional[str] = None
    timestamp: float = None
    
    # Maximum size for string values in parameters (bytes)
    MAX_PARAM_VALUE_SIZE = 1024  # 1KB per parameter value
    # Keys to exclude entirely (too large to store)
    EXCLUDED_PARAM_KEYS = {"image", "screenshot", "content", "data"}
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = time.time()
        
        # MEMORY DOS PROTECTION: Truncate large parameter values and exclude large keys
        # This ensures fixed memory usage per audit entry, preventing unbounded growth
        # even when tools are called with large Base64 images or text blocks.
        self.parameters = self._sanitize_parameters(self.parameters)
    
    def _sanitize_parameters(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Sanitize parameters to prevent unbounded memory growth.
        
        - Excludes keys known to contain large data (images, screenshots, content)
        - Truncates string values to MAX_PARAM_VALUE_SIZE
        - Preserves structure for other parameter types
        
        Args:
            params: Original parameters dictionary
            
        Returns:
            Sanitized parameters dictionary with bounded memory usage
        """
        sanitized = {}
        for key, value in params.items():
            # Exclude keys known to contain large data
            if key.lower() in self.EXCLUDED_PARAM_KEYS:
                sanitized[key] = f"[EXCLUDED: {type(value).__name__}, size={len(str(value))} bytes]"
                continue
            
            # Truncate large string values
            if isinstance(value, str):
                if len(value) > self.MAX_PARAM_VALUE_SIZE:
                    sanitized[key] = value[:self.MAX_PARAM_VALUE_SIZE] + f"... [TRUNCATED: {len(value)} bytes]"
                else:
                    sanitized[key] = value
            elif isinstance(value, dict):
                # Recursively sanitize nested dictionaries
                sanitized[key] = self._sanitize_parameters(value)
            elif isinstance(value, list):
                # Truncate lists if they contain large strings
                sanitized_list = []
                for item in value[:10]:  # Limit to first 10 items
                    if isinstance(item, str) and len(item) > self.MAX_PARAM_VALUE_SIZE:
                        sanitized_list.append(item[:self.MAX_PARAM_VALUE_SIZE] + f"... [TRUNCATED]")
                    else:
                        sanitized_list.append(item)
                if len(value) > 10:
                    sanitized_list.append(f"... [TRUNCATED: {len(value)} items]")
                sanitized[key] = sanitized_list
            else:
                # Preserve other types as-is
                sanitized[key] = value
        
        return sanitized


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
        self.max_audit_log_size = 1000
        # Use deque for O(1) append/pop operations instead of O(N) list slicing
        self.audit_log: deque = deque(maxlen=self.max_audit_log_size)
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
        
        # SECURITY: Fail-closed - if tool doesn't declare permissions, deny access
        if not required:
            logger.error(
                f"Security Audit: Tool '{tool_name}' attempted action '{permission}' "
                "but has NO defined permissions. Action DENIED. "
                "All tools must explicitly declare their permissions."
            )
            return False
        
        # SECURITY: Fail-closed - if tool declares permissions, only allow declared actions
        # If a tool declares SOME permissions but attempts an undeclared action, deny it
        if permission not in required:
            logger.warning(
                f"Security Violation: Tool '{tool_name}' attempted action '{permission}' "
                f"which is NOT in its declared required_permissions {required}. Action DENIED."
            )
            return False
        
        # Permission is in required set - grant access
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
        # Deque automatically handles eviction when maxlen is reached (O(1) operation)
        self.audit_log.append(audit)
        
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
        # Convert deque to list for filtering (deque doesn't support list comprehension directly)
        entries = list(self.audit_log)
        
        if tool_name:
            entries = [e for e in entries if e.tool_name == tool_name]
        
        if user_id:
            entries = [e for e in entries if e.user_id == user_id]
        
        # Sort by timestamp (newest first)
        entries.sort(key=lambda e: e.timestamp, reverse=True)
        
        return entries[:limit]

