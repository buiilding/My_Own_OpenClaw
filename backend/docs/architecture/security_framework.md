# Security Framework Documentation

This document provides comprehensive documentation for the Personal Assistant Backend security framework, including permission systems, resource limits, audit logging, and execution isolation.

## Overview

The security framework provides comprehensive protection for tool execution, user access control, and system resource management. It implements defense-in-depth security with multiple layers of protection.

## Core Security Components

### Security Policy System

**Location**: `backend/src/core/security/policy.py`

The security policy system defines and enforces security boundaries for tool execution.

#### Permission Model

```python
class Permission(Enum):
    """Tool execution permissions."""
    READ_FILESYSTEM = "read_filesystem"
    WRITE_FILESYSTEM = "write_filesystem"
    EXECUTE_COMMANDS = "execute_commands"
    NETWORK_ACCESS = "network_access"
    COMPUTER_CONTROL = "computer_control"
    READ_MEMORY = "read_memory"
    WRITE_MEMORY = "write_memory"
```

#### Resource Limits

```python
@dataclass
class ResourceLimits:
    """Resource limits for tool execution."""
    timeout: float = 30.0  # seconds
    max_memory_mb: Optional[int] = None  # MB, None = unlimited
    max_file_size_mb: Optional[int] = None  # MB, None = unlimited
    max_network_requests: int = 10
    max_concurrent_tools: int = 3
```

#### Security Policy Implementation

```python
class SecurityPolicy:
    def check_permission(
        self,
        tool_name: str,
        permission: Permission,
        parameters: Dict[str, Any]
    ) -> bool:
        """Check if tool has required permission."""

    def check_resource_limits(
        self,
        tool_name: str,
        estimated_time: Optional[float] = None
    ) -> bool:
        """Check if execution would exceed resource limits."""

    def check_path_access(self, path: str) -> bool:
        """Check if path is accessible."""
```

### Tool Execution Audit System

#### Audit Logging

```python
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
```

#### Audit Functions

```python
def audit_tool_execution(
    tool_name: str,
    user_id: str,
    session_id: str,
    parameters: Dict[str, Any],
    success: bool,
    execution_time: float,
    error: Optional[str] = None
) -> None:
    """Log tool execution for audit purposes."""
```

### Security Executor

**Location**: `backend/src/core/security/executor.py`

The security executor provides different execution isolation levels.

#### Executor Types

```python
class ToolExecutor(ABC):
    """Abstract base class for tool execution."""

    @abstractmethod
    async def execute(self, tool: Tool, args: Any, context: ToolContext) -> Any:
        """Execute tool with security boundaries."""
```

#### Available Executors

- **DirectToolExecutor**: Executes tools directly in the current process (lowest overhead)
- **ProcessSandboxedExecutor**: Executes tools in separate processes (planned feature)

## Security Architecture

### Defense in Depth Layers

1. **Permission Layer**: Checks user/tool permissions before execution
2. **Resource Layer**: Enforces CPU, memory, and I/O limits
3. **Path Layer**: Validates file system access paths
4. **Execution Layer**: Provides process isolation
5. **Audit Layer**: Logs all security-relevant events

### Security Boundaries

#### User Permissions

Users are assigned permissions that control what operations they can perform:

```python
# User context with permissions
user_context = UserContext(
    user_id="user123",
    permissions=[
        "read_filesystem",
        "execute_commands",
        "network_access"
    ]
)
```

#### Tool Permissions

Tools declare their required permissions:

```python
class FileWriterTool(Tool[FileArgs]):
    name = "write_file"
    description = "Write content to files"
    required_permissions = ["write_filesystem"]
```

#### Built-in Tool Permissions

The system automatically assigns permissions to built-in tools:

```python
builtin_permissions = {
    "write_file": {Permission.WRITE_FILESYSTEM},
    "read_file": {Permission.READ_FILESYSTEM},
    "list_directory": {Permission.READ_FILESYSTEM},
    "run_shell_command": {Permission.EXECUTE_COMMANDS},
    "click_ocr": {Permission.COMPUTER_CONTROL},
    "keyboard": {Permission.COMPUTER_CONTROL},
}
```

## Security Configuration

### Configuration Options

```yaml
# config.yaml
security:
  # Resource limits
  resource_limits:
    timeout: 30.0
    max_memory_mb: 512
    max_file_size_mb: 100
    max_network_requests: 10
    max_concurrent_tools: 3

  # Permission settings
  blocked_tools: []
  blocked_paths:
    - "/etc"
    - "/root"
    - "C:\\Windows\\System32"

  # Audit settings
  audit_enabled: true
  max_audit_log_size: 1000
  audit_log_path: "/var/log/assistant/audit.log"
```

### Runtime Security Policy

```python
# Initialize security policy
policy = SecurityPolicy()
policy.resource_limits = ResourceLimits(
    timeout=30.0,
    max_memory_mb=512,
    max_file_size_mb=100
)
policy.blocked_paths = ["/etc", "/root", "C:\\Windows\\System32"]
```

## Permission Checking

### Tool Execution Permission Check

```python
def check_tool_execution_permission(
    tool_name: str,
    permission: Permission,
    parameters: Dict[str, Any]
) -> bool:
    """Check if tool execution is permitted."""
    policy = get_security_policy()

    # Check if tool is blocked
    if tool_name in policy.blocked_tools:
        logger.warning(f"Tool {tool_name} is blocked by security policy")
        return False

    # Check required permissions
    required_perms = policy.required_permissions.get(tool_name, set())

    # Check built-in tool permissions
    if tool_name in builtin_permissions:
        required_perms = builtin_permissions[tool_name]

    # Verify user has required permissions
    if permission not in required_perms:
        return True  # Permission not required

    # Implement user permission checking here
    return True  # Placeholder - implement actual user permission check
```

### Path Access Validation

```python
def check_path_access(path: str) -> bool:
    """Check if path is accessible."""
    path_obj = Path(path).resolve()

    # Check blocked paths
    for blocked in blocked_paths:
        if path_obj.is_relative_to(Path(blocked).resolve()):
            logger.warning(f"Path {path} is blocked by security policy")
            return False

    return True
```

## Resource Management

### Timeout Enforcement

```python
import asyncio

async def execute_with_timeout(tool, args, context, timeout_seconds=30.0):
    """Execute tool with timeout enforcement."""
    try:
        async with asyncio.timeout(timeout_seconds):
            return await tool.run(args, context)
    except asyncio.TimeoutError:
        logger.error(f"Tool {tool.name} timed out after {timeout_seconds}s")
        raise ToolExecutionTimeout(f"Tool execution timed out")
```

### Memory Limits

```python
import psutil
import os

def check_memory_limits(max_memory_mb: int) -> bool:
    """Check if current memory usage is within limits."""
    process = psutil.Process(os.getpid())
    memory_mb = process.memory_info().rss / 1024 / 1024

    if memory_mb > max_memory_mb:
        logger.warning(f"Memory usage {memory_mb:.1f}MB exceeds limit {max_memory_mb}MB")
        return False

    return True
```

### Concurrent Execution Limits

```python
from asyncio import Semaphore

class ConcurrencyLimiter:
    """Limits concurrent tool executions."""

    def __init__(self, max_concurrent: int = 3):
        self.semaphore = Semaphore(max_concurrent)

    async def execute(self, tool_func, *args, **kwargs):
        """Execute tool with concurrency limiting."""
        async with self.semaphore:
            return await tool_func(*args, **kwargs)
```

## Audit and Monitoring

### Audit Log Management

```python
class SecurityPolicy:
    def log_execution(self, audit: ToolExecutionAudit) -> None:
        """Log tool execution for audit purposes."""
        self.audit_log.append(audit)

        # Trim log if too large
        if len(self.audit_log) > self.max_audit_log_size:
            self.audit_log = self.audit_log[-self.max_audit_log_size:]

        # Log to system logger
        status = "SUCCESS" if audit.success else "FAILED"
        logger.info(
            f"Tool execution audit: {audit.tool_name} | "
            f"User: {audit.user_id} | Session: {audit.session_id} | "
            f"Status: {status} | Time: {audit.execution_time:.3f}s"
        )
```

### Audit Log Queries

```python
def get_audit_log(
    tool_name: Optional[str] = None,
    user_id: Optional[str] = None,
    limit: int = 100
) -> List[ToolExecutionAudit]:
    """Get audit log entries with optional filtering."""
    entries = audit_log

    if tool_name:
        entries = [e for e in entries if e.tool_name == tool_name]

    if user_id:
        entries = [e for e in entries if e.user_id == user_id]

    # Sort by timestamp (newest first)
    entries.sort(key=lambda e: e.timestamp, reverse=True)

    return entries[:limit]
```

## Security Best Practices

### Tool Development Security

#### Input Validation

```python
from pydantic import BaseModel, validator

class SecureToolArgs(BaseModel):
    """Secure tool arguments with validation."""

    file_path: str

    @validator('file_path')
    def validate_path(cls, v):
        """Prevent path traversal attacks."""
        if '..' in v or not v.startswith('/safe/'):
            raise ValueError('Invalid file path')
        return v
```

#### Permission Declaration

```python
class MySecureTool(Tool[SecureToolArgs]):
    """Tool with proper security declarations."""

    name = "my_secure_tool"
    description = "A secure tool implementation"
    required_permissions = ["read_filesystem"]
    destructive = False  # Declare if tool makes destructive changes
```

### Error Handling

```python
async def run(self, args: SecureToolArgs, ctx: Context) -> Dict[str, Any]:
    """Secure tool execution with proper error handling."""
    try:
        # Validate permissions
        if "read_filesystem" not in ctx.user.permissions:
            return {
                "success": False,
                "error": "Insufficient permissions",
                "llm_content": "Error: Permission denied"
            }

        # Validate path access
        if not check_path_access(args.file_path):
            return {
                "success": False,
                "error": "Path access denied",
                "llm_content": "Error: Path access denied"
            }

        # Execute with timeout
        async with asyncio.timeout(30):
            result = await self.secure_operation(args)

        return {
            "success": True,
            "data": result,
            "llm_content": f"Operation completed successfully"
        }

    except Exception as e:
        logger.error(f"Tool execution failed: {e}", exc_info=True)
        return {
            "success": False,
            "error": f"Operation failed: {str(e)}",
            "llm_content": f"Error: Operation failed"
        }
```

## Security Testing

### Unit Tests

```python
import pytest
from backend.src.core.security.policy import SecurityPolicy, Permission

class TestSecurityPolicy:
    def test_permission_checking(self):
        """Test permission validation."""
        policy = SecurityPolicy()

        # Test blocked tool
        policy.blocked_tools.add("dangerous_tool")
        assert not policy.check_permission("dangerous_tool", Permission.EXECUTE_COMMANDS, {})

        # Test allowed tool
        assert policy.check_permission("safe_tool", Permission.READ_FILESYSTEM, {})
```

### Integration Tests

```python
@pytest.mark.asyncio
class TestSecureToolExecution:
    async def test_tool_with_insufficient_permissions(self):
        """Test tool execution with insufficient permissions."""
        tool = SecureTool()
        context = Context(
            user=UserContext(user_id="user1", permissions=[]),  # No permissions
            session=SessionContext(session_id="session1")
        )

        result = await tool.run(SecureToolArgs(file_path="/safe/file.txt"), context)

        assert result["success"] is False
        assert "permission" in result["error"].lower()
```

### Security Audit

```python
def audit_security_configuration():
    """Audit security configuration for vulnerabilities."""
    issues = []

    # Check resource limits
    if resource_limits.timeout > 300:
        issues.append("Timeout too high - potential DoS vulnerability")

    # Check blocked paths
    critical_paths = ["/etc", "/root", "C:\\Windows\\System32"]
    for path in critical_paths:
        if path not in blocked_paths:
            issues.append(f"Critical path not blocked: {path}")

    return issues
```

## Production Deployment Security

### Secure Configuration

```yaml
# production-security.yaml
security:
  resource_limits:
    timeout: 30.0
    max_memory_mb: 256
    max_file_size_mb: 50
    max_network_requests: 5
    max_concurrent_tools: 2

  blocked_tools:
    - "dangerous_tool"
    - "untrusted_tool"

  blocked_paths:
    - "/etc"
    - "/root"
    - "/home"
    - "C:\\Windows"
    - "C:\\Program Files"
    - "C:\\Users\\Administrator"

  audit_enabled: true
  audit_log_path: "/var/log/assistant/audit.log"
  max_audit_log_size: 10000
```

### Monitoring and Alerts

```python
def setup_security_monitoring():
    """Set up security monitoring and alerting."""

    # Monitor failed permission checks
    @metrics.counter('security.permission_denied_total')
    def log_permission_denied(tool_name: str, user_id: str):
        pass

    # Monitor resource limit violations
    @metrics.counter('security.resource_limit_exceeded_total')
    def log_resource_violation(resource_type: str, limit: float, actual: float):
        pass

    # Alert on suspicious patterns
    def check_suspicious_activity():
        recent_audits = get_audit_log(limit=100)
        failed_attempts = [a for a in recent_audits if not a.success]

        if len(failed_attempts) > 10:  # Threshold
            alert_security_team("High number of failed tool executions detected")
```

### Backup and Recovery

```python
def backup_security_logs():
    """Backup security audit logs."""
    import shutil
    from datetime import datetime

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = f"/var/backups/assistant/security_audit_{timestamp}.log"

    shutil.copy2(audit_log_path, backup_path)

    # Rotate old backups (keep last 30 days)
    cleanup_old_backups("/var/backups/assistant/", 30)
```

## Compliance and Regulatory Considerations

### Data Protection

- **PII Handling**: Ensure tools don't inadvertently expose personal information
- **Data Minimization**: Only collect necessary data for tool execution
- **Retention Limits**: Implement data retention policies for audit logs

### Access Controls

- **Principle of Least Privilege**: Users only get minimum required permissions
- **Role-Based Access**: Implement role-based permission assignment
- **Session Management**: Proper session timeout and invalidation

### Incident Response

```python
def handle_security_incident(incident_type: str, details: Dict[str, Any]):
    """Handle security incidents according to response plan."""

    # Log incident
    logger.critical(f"Security incident: {incident_type}", extra=details)

    # Immediate actions based on incident type
    if incident_type == "unauthorized_access":
        # Lock user account
        disable_user_account(details["user_id"])
        # Notify administrators
        notify_security_team(details)

    elif incident_type == "suspicious_activity":
        # Increase monitoring
        enable_enhanced_monitoring(details["user_id"])

    # Create incident report
    create_incident_report(incident_type, details)
```

This comprehensive security framework provides robust protection for the Personal Assistant Backend while maintaining usability and performance. The layered security approach ensures that multiple safeguards are in place to protect against various threat vectors.
