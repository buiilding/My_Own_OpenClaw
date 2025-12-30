# Security and Permissions Guide

This guide provides documentation for the Personal Assistant's security framework, focusing on tool execution security, permission systems, and basic security boundaries.

## Overview

The Personal Assistant implements security measures focused on tool execution safety:

- **Permission System**: Tool-based permission checking for operations like filesystem access, command execution, and network access
- **Resource Limits**: Execution time, memory, and concurrency limits for tool operations
- **Audit Logging**: Basic logging of tool executions for monitoring
- **Path Security**: Blocking access to sensitive filesystem locations

## Permission System

### Tool Execution Permissions

The system implements permission-based security for tool execution:

```python
from backend.src.core.security.policy import Permission, SecurityPolicy

# Available permissions
class Permission(Enum):
    READ_FILESYSTEM = "read_filesystem"
    WRITE_FILESYSTEM = "write_filesystem"
    EXECUTE_COMMANDS = "execute_commands"
    NETWORK_ACCESS = "network_access"
    COMPUTER_CONTROL = "computer_control"
    READ_MEMORY = "read_memory"
    WRITE_MEMORY = "write_memory"

# Check tool permissions
security_policy = SecurityPolicy()

allowed = security_policy.check_permission(
    tool_name="read_file",
    permission=Permission.READ_FILESYSTEM,
    parameters={"path": "/safe/file.txt"}
)
```

## Resource Limits and Security Boundaries

### Execution Resource Limits

Tool execution is constrained by configurable resource limits:

```python
from backend.src.core.security.policy import ResourceLimits, SecurityPolicy

# Default resource limits
limits = ResourceLimits(
    timeout=30.0,  # seconds
    max_memory_mb=None,  # unlimited
    max_file_size_mb=None,  # unlimited
    max_network_requests=10,
    max_concurrent_tools=3
)

security_policy = SecurityPolicy()
security_policy.resource_limits = limits

# Check if execution would exceed limits
can_execute = security_policy.check_resource_limits("some_tool", estimated_time=25.0)
```

### Path Security

Filesystem access is restricted to prevent access to sensitive locations:

```python
# Block access to sensitive paths
security_policy.blocked_paths = ["/etc", "/root", "/home/*/secret"]

# Check path access
allowed = security_policy.check_path_access("/safe/user/data.txt")  # True
blocked = security_policy.check_path_access("/etc/passwd")  # False
```

## Tool Execution Audit Logging

### Basic Audit Logging

Tool executions are logged for monitoring and debugging:

```python
from backend.src.core.security.policy import SecurityPolicy, ToolExecutionAudit

security_policy = SecurityPolicy()

# Log tool execution
audit_entry = ToolExecutionAudit(
    tool_name="read_file",
    user_id="user123",
    session_id="session456",
    parameters={"path": "/file.txt"},
    success=True,
    execution_time=1.23
)

security_policy.log_execution(audit_entry)

# Retrieve audit logs
logs = security_policy.get_audit_log(
    tool_name="read_file",
    user_id="user123",
    limit=50
)
```

### Audit Log Management

The system maintains a rolling audit log with configurable size limits:

```python
# Configure audit log size
security_policy.max_audit_log_size = 1000  # Keep last 1000 entries

# Audit logs are automatically trimmed when size limit is exceeded
# Logs are also written to the application logger
```

### Security Implementation Notes

**Current Limitations:**
- No user authentication system (single-user assumption)
- No MFA or advanced access controls
- No network security features
- Basic audit logging only
- No input validation framework
- No incident response system

**Future Enhancements:**
These security features are planned for future implementation:
- User authentication and session management
- Multi-factor authentication
- Advanced audit logging and analysis
- Input validation and sanitization
- Network security and encryption
- Incident response and automated remediation

## Implementation Status

### ✅ **Implemented Security Features**

- **Tool Permission System**: Permission-based access control for tool execution
- **Resource Limits**: Configurable execution time, memory, and concurrency limits
- **Basic Audit Logging**: Tool execution tracking and logging
- **Path Security**: Filesystem access restrictions to prevent directory traversal
- **Security Policy Framework**: Extensible security policy system

### 📋 **Planned Security Features**

- **User Authentication**: Multi-user support with secure authentication
- **Session Management**: Secure session handling and timeout management
- **MFA Support**: Multi-factor authentication for enhanced security
- **Advanced Audit**: Comprehensive security event logging and analysis
- **Input Validation**: Request sanitization and injection prevention
- **Network Security**: HTTPS, rate limiting, and API security
- **Incident Response**: Automated monitoring and security response

The current security implementation focuses on tool execution safety and basic access control, with comprehensive enterprise security features planned for future development.
