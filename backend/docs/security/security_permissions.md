# Security and Permissions Guide

This guide provides comprehensive documentation for the Personal Assistant's security framework, covering authentication, authorization, permission systems, sandboxing, and security best practices.

## Overview

The Personal Assistant implements a multi-layered security approach:

- **Authentication**: User identity verification and session management
- **Authorization**: Permission-based access control and resource restrictions
- **Sandboxing**: Isolated execution environments for tool operations
- **Audit Logging**: Comprehensive security event tracking
- **Input Validation**: Protection against malicious input and injection attacks
- **Network Security**: Secure communication and API protection

## Authentication System

### User Authentication

The system supports multiple authentication methods:

```python
from backend.src.core.security.auth import AuthManager, UserSession

auth_manager = AuthManager()

# Authenticate user
async def authenticate_user(username: str, password: str) -> UserSession:
    """Authenticate user with credentials"""
    user = await auth_manager.authenticate_credentials(username, password)

    if not user:
        raise AuthenticationError("Invalid credentials")

    # Create session
    session = await auth_manager.create_session(
        user_id=user.id,
        device_info=get_device_info(),
        ip_address=get_client_ip()
    )

    return session

# Token-based authentication
async def authenticate_token(token: str) -> UserSession:
    """Authenticate user with JWT token"""
    try:
        payload = await auth_manager.verify_token(token)

        session = await auth_manager.get_session(payload.session_id)

        if not session or session.is_expired():
            raise AuthenticationError("Invalid or expired session")

        return session

    except jwt.ExpiredSignatureError:
        raise AuthenticationError("Token expired")
    except jwt.InvalidTokenError:
        raise AuthenticationError("Invalid token")

# Session management
async def validate_session(session_id: str) -> bool:
    """Validate active session"""
    session = await auth_manager.get_session(session_id)

    if not session:
        return False

    if session.is_expired():
        await auth_manager.revoke_session(session_id)
        return False

    # Check for suspicious activity
    if await auth_manager.detect_suspicious_activity(session):
        await auth_manager.revoke_session(session_id)
        await security_logger.log_security_event(
            "suspicious_session_activity",
            session_id=session_id,
            user_id=session.user_id
        )
        return False

    return True
```

### Multi-Factor Authentication (MFA)

Enhanced security with MFA support:

```python
from backend.src.core.security.mfa import MFAManager

mfa_manager = MFAManager()

# Enable MFA for user
async def enable_mfa(user_id: str, method: str = "totp") -> dict:
    """Enable MFA for user"""
    secret = await mfa_manager.generate_secret(user_id)

    # Generate QR code for TOTP
    qr_code_url = await mfa_manager.generate_qr_code(user_id, secret)

    return {
        "secret": secret,
        "qr_code_url": qr_code_url,
        "backup_codes": await mfa_manager.generate_backup_codes(user_id)
    }

# Verify MFA token
async def verify_mfa(user_id: str, token: str) -> bool:
    """Verify MFA token"""
    return await mfa_manager.verify_token(user_id, token)

# MFA-protected authentication flow
async def authenticate_with_mfa(username: str, password: str, mfa_token: str = None) -> UserSession:
    """Complete authentication with MFA"""
    # Primary authentication
    user = await auth_manager.authenticate_credentials(username, password)

    if not user:
        raise AuthenticationError("Invalid credentials")

    # Check if MFA is required
    if user.mfa_enabled:
        if not mfa_token:
            raise MFARequiredError("MFA token required")

        if not await verify_mfa(user.id, mfa_token):
            raise AuthenticationError("Invalid MFA token")

    # Create session
    session = await auth_manager.create_session(user.id)
    return session
```

## Authorization and Permissions

### Permission System

Role-based access control with granular permissions:

```python
from backend.src.core.security.permissions import PermissionManager, Permission
from enum import Enum

class SystemPermissions(Enum):
    # Basic permissions
    READ_CONVERSATION = "conversation:read"
    WRITE_CONVERSATION = "conversation:write"
    DELETE_CONVERSATION = "conversation:delete"

    # Tool permissions
    EXECUTE_TOOLS = "tools:execute"
    MANAGE_TOOLS = "tools:manage"
    INSTALL_TOOLS = "tools:install"

    # System permissions
    SYSTEM_ADMIN = "system:admin"
    USER_MANAGEMENT = "user:manage"
    CONFIGURATION = "config:manage"

    # Computer control permissions
    COMPUTER_CONTROL = "computer:control"
    FILESYSTEM_ACCESS = "filesystem:access"
    NETWORK_ACCESS = "network:access"

permission_manager = PermissionManager()

# Check user permissions
async def check_user_permission(user_id: str, permission: str, resource: str = None) -> bool:
    """Check if user has specific permission"""
    user_permissions = await permission_manager.get_user_permissions(user_id)

    # Check direct permission
    if permission in user_permissions:
        return True

    # Check role-based permissions
    user_roles = await permission_manager.get_user_roles(user_id)
    for role in user_roles:
        role_permissions = await permission_manager.get_role_permissions(role)
        if permission in role_permissions:
            # Check resource-specific restrictions
            if resource and not await check_resource_access(role, permission, resource):
                continue
            return True

    return False

# Resource-specific access control
async def check_resource_access(role: str, permission: str, resource: str) -> bool:
    """Check resource-specific access rules"""
    rules = await permission_manager.get_resource_rules(role, permission)

    for rule in rules:
        if rule.matches_resource(resource):
            return rule.allows_access()

    return False
```

### Role-Based Access Control (RBAC)

Hierarchical role system with inheritance:

```python
from backend.src.core.security.rbac import RoleManager, Role

role_manager = RoleManager()

# Define roles
user_role = Role(
    name="user",
    permissions=[
        SystemPermissions.READ_CONVERSATION,
        SystemPermissions.WRITE_CONVERSATION,
        SystemPermissions.EXECUTE_TOOLS
    ],
    inherits_from=[]
)

admin_role = Role(
    name="admin",
    permissions=[
        SystemPermissions.SYSTEM_ADMIN,
        SystemPermissions.USER_MANAGEMENT,
        SystemPermissions.CONFIGURATION
    ],
    inherits_from=["user"]
)

# Register roles
await role_manager.register_role(user_role)
await role_manager.register_role(admin_role)

# Assign roles to users
await role_manager.assign_role_to_user("user123", "user")
await role_manager.assign_role_to_user("admin456", "admin")

# Check role inheritance
async def user_has_role(user_id: str, role_name: str) -> bool:
    """Check if user has role (including inherited roles)"""
    user_roles = await role_manager.get_user_roles_with_inheritance(user_id)
    return role_name in user_roles

# Dynamic role assignment
async def assign_role_based_on_trust_score(user_id: str):
    """Assign roles based on user trust score"""
    trust_score = await calculate_user_trust_score(user_id)

    if trust_score >= 0.9:
        await role_manager.assign_role_to_user(user_id, "trusted_user")
    elif trust_score >= 0.7:
        await role_manager.assign_role_to_user(user_id, "standard_user")
    else:
        await role_manager.assign_role_to_user(user_id, "restricted_user")
```

### Permission Policies

Declarative permission policies for complex access rules:

```python
from backend.src.core.security.policies import PolicyEngine, Policy

policy_engine = PolicyEngine()

# Define policies
conversation_policy = Policy(
    name="conversation_access",
    effect="allow",
    principals=["users"],
    actions=["conversation:read", "conversation:write"],
    resources=["conversation:*"],
    conditions=[
        {
            "condition": "string_equals",
            "key": "resource.owner",
            "value": "principal.id"
        }
    ]
)

admin_policy = Policy(
    name="admin_access",
    effect="allow",
    principals=["roles:admin"],
    actions=["*"],
    resources=["*"],
    conditions=[]
)

# Register policies
await policy_engine.register_policy(conversation_policy)
await policy_engine.register_policy(admin_policy)

# Evaluate policies
async def evaluate_access(principal: str, action: str, resource: str, context: dict = None) -> bool:
    """Evaluate access based on policies"""
    decision = await policy_engine.evaluate(
        principal=principal,
        action=action,
        resource=resource,
        context=context or {}
    )

    return decision.effect == "allow"
```

## Sandboxing and Isolation

### Tool Execution Sandbox

Isolated execution environment for tools:

```python
from backend.src.core.security.sandbox import ToolSandbox, SandboxConfig

class SecureToolExecutor:
    def __init__(self):
        self.sandbox = ToolSandbox()

    async def execute_tool_safely(
        self,
        tool_name: str,
        args: dict,
        user_id: str,
        permissions: list
    ) -> dict:
        """Execute tool in secure sandbox"""

        # Create sandbox configuration
        config = SandboxConfig(
            max_execution_time=30,  # seconds
            max_memory_mb=100,
            max_cpu_percent=50,
            allowed_imports=[],  # Restrict imports
            network_access=self._has_network_permission(permissions),
            filesystem_access=self._has_filesystem_permission(permissions),
            system_commands=self._has_system_permission(permissions)
        )

        # Execute in sandbox
        async with self.sandbox.create_isolation(config) as isolation:
            try:
                # Pre-execution security checks
                await self._validate_tool_execution(tool_name, args, user_id)

                # Execute tool
                result = await isolation.execute_tool(tool_name, args)

                # Post-execution validation
                await self._validate_tool_result(result)

                # Log execution
                await security_logger.log_tool_execution(
                    tool_name=tool_name,
                    user_id=user_id,
                    args=args,
                    result=result,
                    success=True
                )

                return result

            except Exception as e:
                # Log security violation
                await security_logger.log_security_violation(
                    "tool_execution_failed",
                    tool_name=tool_name,
                    user_id=user_id,
                    error=str(e)
                )
                raise

    def _has_network_permission(self, permissions: list) -> bool:
        return "network_access" in permissions

    def _has_filesystem_permission(self, permissions: list) -> bool:
        return "filesystem_access" in permissions

    def _has_system_permission(self, permissions: list) -> bool:
        return "system_commands" in permissions

    async def _validate_tool_execution(self, tool_name: str, args: dict, user_id: str):
        """Validate tool execution parameters"""
        # Check tool exists and is approved
        tool_info = await tool_registry.get_tool_info(tool_name)
        if not tool_info or not tool_info.approved:
            raise SecurityError(f"Tool {tool_name} is not approved")

        # Validate arguments against schema
        if not await self._validate_args_against_schema(args, tool_info.schema):
            raise SecurityError("Invalid tool arguments")

        # Check user has permission for this tool
        if not await permission_manager.check_user_permission(user_id, f"tool:{tool_name}"):
            raise SecurityError(f"User {user_id} not authorized for tool {tool_name}")

    async def _validate_args_against_schema(self, args: dict, schema: dict) -> bool:
        """Validate arguments against tool schema"""
        try:
            # Use Pydantic for validation
            from pydantic import BaseModel

            # Create dynamic model from schema
            fields = {}
            for field_name, field_info in schema.items():
                if field_info.get("type") == "string":
                    fields[field_name] = (str, ...)
                elif field_info.get("type") == "integer":
                    fields[field_name] = (int, ...)
                elif field_info.get("type") == "boolean":
                    fields[field_name] = (bool, ...)

            ValidationModel = type('ValidationModel', (BaseModel,), {'__annotations__': fields})

            # Validate
            ValidationModel(**args)
            return True

        except Exception:
            return False

    async def _validate_tool_result(self, result: dict):
        """Validate tool execution result"""
        # Check for sensitive data leakage
        if self._contains_sensitive_data(result):
            raise SecurityError("Tool result contains sensitive data")

        # Validate result structure
        required_fields = ["success", "data"]
        for field in required_fields:
            if field not in result:
                raise SecurityError(f"Tool result missing required field: {field}")

    def _contains_sensitive_data(self, data: dict) -> bool:
        """Check if data contains sensitive information"""
        sensitive_patterns = [
            r"password|secret|token|key",
            r"\b\d{16}\b",  # Credit card numbers
            r"\b\d{3}-\d{2}-\d{4}\b",  # SSN
        ]

        def check_value(value):
            if isinstance(value, str):
                for pattern in sensitive_patterns:
                    if re.search(pattern, value, re.IGNORECASE):
                        return True
            elif isinstance(value, dict):
                return any(check_value(v) for v in value.values())
            elif isinstance(value, list):
                return any(check_value(item) for item in data)
            return False

        return check_value(data)
```

### Input Validation and Sanitization

Comprehensive input validation to prevent attacks:

```python
from backend.src.core.security.validation import InputValidator, Sanitizer
import re

input_validator = InputValidator()
sanitizer = Sanitizer()

# Validate user input
async def validate_user_input(input_text: str, input_type: str = "text") -> str:
    """Validate and sanitize user input"""

    # Basic sanitization
    sanitized = await sanitizer.sanitize_html(input_text)
    sanitized = await sanitizer.sanitize_sql(sanitized)

    # Type-specific validation
    if input_type == "text":
        if not await input_validator.validate_text_length(sanitized, max_length=10000):
            raise ValidationError("Text too long")

        if await input_validator.contains_malicious_patterns(sanitized):
            raise ValidationError("Input contains malicious content")

    elif input_type == "code":
        if not await input_validator.validate_code_syntax(sanitized, language="python"):
            raise ValidationError("Invalid code syntax")

        # Check for dangerous code patterns
        if await input_validator.contains_dangerous_code(sanitized):
            raise ValidationError("Code contains dangerous operations")

    elif input_type == "file_path":
        if not await input_validator.validate_file_path(sanitized):
            raise ValidationError("Invalid file path")

        # Prevent directory traversal
        if ".." in sanitized or not sanitized.startswith("/safe/"):
            raise ValidationError("Path traversal attempt detected")

    return sanitized

# SQL injection prevention
async def safe_database_query(user_input: str, user_id: str):
    """Execute safe parameterized query"""
    # Use parameterized queries
    result = await db.execute(
        "SELECT * FROM conversations WHERE user_id = $1 AND content LIKE $2",
        user_id,
        f"%{user_input}%"  # Safe with parameterized query
    )
    return result

# XSS prevention
async def safe_html_output(user_content: str) -> str:
    """Sanitize HTML output"""
    from bleach import clean

    allowed_tags = ['p', 'br', 'strong', 'em', 'u']
    allowed_attrs = {}

    return clean(user_content, tags=allowed_tags, attributes=allowed_attrs, strip=True)
```

## Audit Logging and Monitoring

### Security Event Logging

Comprehensive security event tracking:

```python
from backend.src.core.security.audit import SecurityAuditor, AuditEvent

security_auditor = SecurityAuditor()

# Log security events
async def log_security_event(event_type: str, **kwargs):
    """Log security-related events"""
    event = AuditEvent(
        event_type=event_type,
        timestamp=datetime.utcnow(),
        user_id=kwargs.get("user_id"),
        session_id=kwargs.get("session_id"),
        ip_address=kwargs.get("ip_address"),
        user_agent=kwargs.get("user_agent"),
        details=kwargs
    )

    await security_auditor.log_event(event)

# Authentication events
async def log_authentication_attempt(username: str, success: bool, ip_address: str):
    """Log authentication attempts"""
    await log_security_event(
        "authentication_attempt",
        username=username,
        success=success,
        ip_address=ip_address
    )

# Authorization events
async def log_authorization_check(user_id: str, permission: str, granted: bool, resource: str = None):
    """Log authorization checks"""
    await log_security_event(
        "authorization_check",
        user_id=user_id,
        permission=permission,
        granted=granted,
        resource=resource
    )

# Tool execution events
async def log_tool_execution(tool_name: str, user_id: str, args: dict, success: bool):
    """Log tool execution events"""
    await log_security_event(
        "tool_execution",
        tool_name=tool_name,
        user_id=user_id,
        args=args,
        success=success
    )

# Security violation events
async def log_security_violation(violation_type: str, **details):
    """Log security violations"""
    await log_security_event(
        f"security_violation_{violation_type}",
        severity="high",
        **details
    )

# Automated monitoring
class SecurityMonitor:
    def __init__(self):
        self.failed_login_attempts = defaultdict(list)
        self.suspicious_activities = []

    async def monitor_failed_logins(self, username: str, ip_address: str):
        """Monitor failed login attempts"""
        now = datetime.utcnow()
        self.failed_login_attempts[username].append((now, ip_address))

        # Remove old attempts (last hour)
        cutoff = now - timedelta(hours=1)
        self.failed_login_attempts[username] = [
            (t, ip) for t, ip in self.failed_login_attempts[username] if t > cutoff
        ]

        # Check for brute force attack
        recent_attempts = len(self.failed_login_attempts[username])
        if recent_attempts >= 5:
            await log_security_violation(
                "brute_force_attempt",
                username=username,
                ip_address=ip_address,
                attempt_count=recent_attempts
            )

            # Implement temporary lockout
            await self.implement_lockout(username)

    async def monitor_suspicious_activity(self, user_id: str, activity: str, score: float):
        """Monitor for suspicious user activity"""
        if score > 0.8:  # High suspicion score
            await log_security_violation(
                "suspicious_activity",
                user_id=user_id,
                activity=activity,
                suspicion_score=score
            )

            # Trigger additional security measures
            await self.trigger_security_response(user_id)

    async def implement_lockout(self, username: str):
        """Implement temporary account lockout"""
        lockout_duration = timedelta(minutes=15)

        await auth_manager.lock_account(username, lockout_duration)

        await log_security_event(
            "account_lockout",
            username=username,
            duration_minutes=15,
            reason="brute_force_protection"
        )

    async def trigger_security_response(self, user_id: str):
        """Trigger security response for suspicious activity"""
        # Force re-authentication
        await auth_manager.invalidate_user_sessions(user_id)

        # Send security alert
        await notification_service.send_security_alert(
            user_id=user_id,
            alert_type="suspicious_activity_detected"
        )
```

### Audit Trail Analysis

Analyze audit logs for security insights:

```python
from backend.src.core.security.analysis import AuditAnalyzer

audit_analyzer = AuditAnalyzer()

# Analyze authentication patterns
async def analyze_authentication_patterns(time_window: timedelta = timedelta(days=7)):
    """Analyze authentication patterns for anomalies"""
    events = await security_auditor.get_events(
        event_types=["authentication_attempt", "authentication_success"],
        time_window=time_window
    )

    # Calculate failure rates
    total_attempts = len(events)
    failed_attempts = len([e for e in events if not e.details.get("success")])

    failure_rate = failed_attempts / total_attempts if total_attempts > 0 else 0

    # Detect unusual patterns
    if failure_rate > 0.3:  # More than 30% failures
        await log_security_event(
            "high_authentication_failure_rate",
            failure_rate=failure_rate,
            time_window=str(time_window)
        )

    # Analyze by IP address
    ip_attempts = defaultdict(int)
    ip_failures = defaultdict(int)

    for event in events:
        ip = event.details.get("ip_address")
        ip_attempts[ip] += 1
        if not event.details.get("success"):
            ip_failures[ip] += 1

    # Flag suspicious IPs
    for ip, attempts in ip_attempts.items():
        if attempts > 100:  # Too many attempts from single IP
            failure_rate = ip_failures[ip] / attempts
            if failure_rate > 0.5:
                await log_security_violation(
                    "suspicious_ip_activity",
                    ip_address=ip,
                    total_attempts=attempts,
                    failure_rate=failure_rate
                )

# Analyze tool usage patterns
async def analyze_tool_usage_patterns():
    """Analyze tool usage for security insights"""
    events = await security_auditor.get_events(
        event_types=["tool_execution"],
        time_window=timedelta(hours=24)
    )

    # Group by user and tool
    user_tool_usage = defaultdict(lambda: defaultdict(int))

    for event in events:
        user_id = event.user_id
        tool_name = event.details.get("tool_name")
        user_tool_usage[user_id][tool_name] += 1

    # Detect unusual usage patterns
    for user_id, tool_counts in user_tool_usage.items():
        total_executions = sum(tool_counts.values())

        # Check for single tool overuse
        max_tool_usage = max(tool_counts.values())
        if max_tool_usage > total_executions * 0.8:  # 80% of executions are one tool
            most_used_tool = max(tool_counts, key=tool_counts.get)
            await log_security_event(
                "unusual_tool_usage_pattern",
                user_id=user_id,
                tool_name=most_used_tool,
                usage_count=max_tool_usage,
                total_executions=total_executions
            )

# Generate security reports
async def generate_security_report(report_period: str = "daily"):
    """Generate comprehensive security report"""
    if report_period == "daily":
        time_window = timedelta(days=1)
    elif report_period == "weekly":
        time_window = timedelta(weeks=1)
    else:
        time_window = timedelta(hours=1)

    events = await security_auditor.get_events(time_window=time_window)

    report = {
        "period": report_period,
        "total_events": len(events),
        "security_violations": len([e for e in events if e.event_type.startswith("security_violation")]),
        "authentication_failures": len([e for e in events if e.event_type == "authentication_attempt" and not e.details.get("success")]),
        "tool_executions": len([e for e in events if e.event_type == "tool_execution"]),
        "top_violation_types": await audit_analyzer.get_top_violation_types(events),
        "risky_users": await audit_analyzer.identify_risky_users(events),
        "recommendations": await audit_analyzer.generate_security_recommendations(events)
    }

    return report
```

## Network Security

### API Security

Secure API endpoints and communication:

```python
from backend.src.core.security.api import APISecurity, RateLimiter
from fastapi import Request, HTTPException
from slowapi import Limiter
from slowapi.util import get_remote_address

api_security = APISecurity()
rate_limiter = RateLimiter()

# API key authentication
async def authenticate_api_key(api_key: str) -> dict:
    """Authenticate API key"""
    key_info = await api_security.validate_api_key(api_key)

    if not key_info or not key_info.active:
        raise HTTPException(status_code=401, detail="Invalid API key")

    # Check rate limits
    if not await rate_limiter.check_limit(key_info.key_id, key_info.requests_per_hour):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    return key_info

# Request validation middleware
async def validate_request(request: Request) -> dict:
    """Validate incoming request"""
    # Check content type
    content_type = request.headers.get("content-type", "")
    if not content_type.startswith("application/json"):
        raise HTTPException(status_code=400, detail="Invalid content type")

    # Validate request size
    content_length = int(request.headers.get("content-length", 0))
    if content_length > 10 * 1024 * 1024:  # 10MB limit
        raise HTTPException(status_code=413, detail="Request too large")

    # Parse and validate JSON
    try:
        body = await request.json()
    except:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Sanitize input
    sanitized_body = await input_validator.sanitize_request_body(body)

    return sanitized_body

# CORS configuration
from fastapi.middleware.cors import CORSMiddleware

cors_middleware = CORSMiddleware(
    allow_origins=["https://trusted-domain.com"],  # Specific domains only
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
    max_age=86400  # 24 hours
)

# Rate limiting
limiter = Limiter(key_func=get_remote_address)

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    """Apply rate limiting"""
    # Global rate limit: 100 requests per minute per IP
    response = await limiter.limit("100/minute")(request, call_next)

    # Add rate limit headers
    response.headers["X-RateLimit-Limit"] = "100"
    response.headers["X-RateLimit-Remaining"] = str(await limiter.get_remaining(request))
    response.headers["X-RateLimit-Reset"] = str(await limiter.get_reset_time(request))

    return response
```

### Data Encryption

Encrypt sensitive data at rest and in transit:

```python
from backend.src.core.security.encryption import DataEncryptor, KeyManager
import cryptography
from cryptography.fernet import Fernet

data_encryptor = DataEncryptor()
key_manager = KeyManager()

# Encrypt sensitive data
async def encrypt_sensitive_data(data: str, purpose: str = "general") -> str:
    """Encrypt sensitive data"""
    key = await key_manager.get_encryption_key(purpose)
    encrypted = await data_encryptor.encrypt(data, key)
    return encrypted

# Decrypt data
async def decrypt_sensitive_data(encrypted_data: str, purpose: str = "general") -> str:
    """Decrypt sensitive data"""
    key = await key_manager.get_encryption_key(purpose)
    decrypted = await data_encryptor.decrypt(encrypted_data, key)
    return decrypted

# Database field-level encryption
class EncryptedField:
    """Database field with automatic encryption/decryption"""

    def __init__(self, value: str, encrypted: bool = False):
        if encrypted:
            self._value = value  # Already encrypted
            self._encrypted = True
        else:
            self._value = None
            self._encrypted = False
            self._plain_value = value

    async def get_value(self) -> str:
        """Get decrypted value"""
        if not self._encrypted:
            return self._plain_value

        if not self._value:
            return None

        return await decrypt_sensitive_data(self._value)

    async def set_value(self, value: str):
        """Set and encrypt value"""
        self._plain_value = value
        self._value = await encrypt_sensitive_data(value)
        self._encrypted = True

    def get_encrypted_value(self) -> str:
        """Get encrypted value for storage"""
        return self._value

# HTTPS/TLS configuration
from ssl import SSLContext, PROTOCOL_TLSv1_2
import certifi

def create_ssl_context() -> SSLContext:
    """Create secure SSL context"""
    ssl_context = SSLContext(PROTOCOL_TLSv1_2)
    ssl_context.verify_mode = ssl.CERT_REQUIRED
    ssl_context.check_hostname = True
    ssl_context.load_verify_locations(certifi.where())

    # Disable vulnerable protocols
    ssl_context.options |= ssl.OP_NO_TLSv1 | ssl.OP_NO_TLSv1_1

    return ssl_context

# Secure WebSocket connections
async def create_secure_websocket_connection(url: str):
    """Create secure WebSocket connection"""
    ssl_context = create_ssl_context()

    async with websockets.connect(
        url,
        ssl=ssl_context,
        extra_headers={"Authorization": f"Bearer {token}"}
    ) as websocket:
        # Secure communication
        await websocket.send(json.dumps({"type": "handshake", "token": token}))
        response = await websocket.recv()
        return json.loads(response)
```

## Security Configuration

Comprehensive security configuration:

```yaml
security:
  # Authentication
  authentication:
    session_timeout_minutes: 480  # 8 hours
    max_login_attempts: 5
    lockout_duration_minutes: 15
    mfa_required: true
    password_policy:
      min_length: 12
      require_uppercase: true
      require_lowercase: true
      require_numbers: true
      require_symbols: true

  # Authorization
  authorization:
    enable_rbac: true
    default_deny: true
    permission_cache_ttl_seconds: 300

  # Sandboxing
  sandboxing:
    enabled: true
    max_execution_time_seconds: 30
    max_memory_mb: 100
    max_cpu_percent: 50
    network_isolation: true
    filesystem_restrictions: true

  # Input validation
  validation:
    max_input_length: 10000
    sanitize_html: true
    prevent_xss: true
    prevent_sqli: true

  # Audit logging
  audit:
    enabled: true
    log_security_events: true
    log_authentication: true
    log_authorization: true
    retention_days: 365

  # Network security
  network:
    enforce_https: true
    hsts_enabled: true
    cors_restrictive: true
    rate_limiting_enabled: true
    api_key_required: true

  # Encryption
  encryption:
    algorithm: "AES-256-GCM"
    key_rotation_days: 90
    encrypt_sensitive_fields: true

  # Monitoring
  monitoring:
    security_alerts_enabled: true
    anomaly_detection: true
    automated_responses: true
```

## Security Best Practices

### Development Security

```python
# Security code review checklist
class SecurityChecklist:
    @staticmethod
    def review_code_for_vulnerabilities(code: str) -> list:
        """Review code for common vulnerabilities"""
        issues = []

        # Check for hardcoded secrets
        if re.search(r"(password|secret|key)\s*=\s*['\"][^'\"]*['\"]", code, re.IGNORECASE):
            issues.append("Hardcoded credentials detected")

        # Check for SQL injection
        if "execute(" in code and "%" in code:
            issues.append("Potential SQL injection vulnerability")

        # Check for XSS vulnerabilities
        if "innerHTML" in code or ".html(" in code:
            issues.append("Potential XSS vulnerability")

        # Check for insecure deserialization
        if "pickle.loads" in code or "yaml.unsafe_load" in code:
            issues.append("Unsafe deserialization detected")

        return issues

# Secure coding patterns
class SecureCodingPatterns:
    @staticmethod
    def safe_file_operations():
        """Demonstrate safe file operations"""
        # Good: Use secure temporary files
        import tempfile
        with tempfile.NamedTemporaryFile(delete=True) as tmp:
            # Safe temporary file usage
            tmp.write(data)
            tmp.flush()

        # Bad: Don't use user input in file paths directly
        # user_path = request.args.get('path')  # UNSAFE
        # with open(user_path, 'r') as f:  # Directory traversal vulnerability

        # Good: Validate and sanitize file paths
        user_path = request.args.get('path')
        safe_path = validate_and_sanitize_path(user_path, allowed_base="/safe/")
        if safe_path:
            with open(safe_path, 'r') as f:
                content = f.read()

    @staticmethod
    def safe_subprocess_execution():
        """Demonstrate safe subprocess execution"""
        import subprocess

        # Good: Use subprocess with shell=False and argument list
        result = subprocess.run(
            ["ls", "-la", "/safe/directory"],
            capture_output=True,
            text=True,
            timeout=30,
            check=True
        )

        # Bad: Don't use shell=True with user input
        # user_cmd = request.args.get('cmd')  # UNSAFE
        # subprocess.run(user_cmd, shell=True)  # Command injection vulnerability

        # Good: Validate commands against whitelist
        allowed_commands = {"ls", "cat", "head", "tail"}
        user_cmd = request.args.get('cmd')
        if user_cmd in allowed_commands:
            result = subprocess.run([user_cmd], ...)
```

### Incident Response

```python
from backend.src.core.security.incident import IncidentResponseManager

incident_manager = IncidentResponseManager()

# Handle security incidents
async def handle_security_incident(incident_type: str, details: dict):
    """Handle security incidents systematically"""

    # Create incident record
    incident = await incident_manager.create_incident(
        incident_type=incident_type,
        severity=details.get("severity", "medium"),
        description=details.get("description"),
        affected_users=details.get("affected_users", []),
        details=details
    )

    # Execute response plan
    response_plan = await incident_manager.get_response_plan(incident_type)

    for action in response_plan.actions:
        try:
            await execute_response_action(action, incident)
        except Exception as e:
            await incident_manager.log_action_failure(action, str(e))

    # Notify stakeholders
    await incident_manager.notify_stakeholders(incident)

    # Document resolution
    await incident_manager.document_resolution(incident)

async def execute_response_action(action: dict, incident: dict):
    """Execute specific response actions"""
    action_type = action["type"]

    if action_type == "revoke_sessions":
        user_ids = action.get("user_ids", incident["affected_users"])
        for user_id in user_ids:
            await auth_manager.revoke_user_sessions(user_id)

    elif action_type == "block_ip":
        ip_addresses = action.get("ip_addresses", [])
        for ip in ip_addresses:
            await network_security.block_ip(ip)

    elif action_type == "enable_monitoring":
        await monitoring_system.enable_enhanced_monitoring(
            duration_minutes=action.get("duration_minutes", 60)
        )

    elif action_type == "backup_data":
        await data_backup.create_emergency_backup()

# Automated incident detection
async def monitor_for_incidents():
    """Continuously monitor for security incidents"""
    while True:
        # Check for anomalies
        anomalies = await anomaly_detector.detect_anomalies()

        for anomaly in anomalies:
            if anomaly.confidence > 0.8:  # High confidence
                await handle_security_incident(
                    "anomaly_detected",
                    {
                        "description": anomaly.description,
                        "confidence": anomaly.confidence,
                        "affected_systems": anomaly.affected_systems
                    }
                )

        await asyncio.sleep(300)  # Check every 5 minutes
```

This comprehensive security and permissions guide provides the foundation for implementing robust security measures throughout the Personal Assistant system, ensuring user data protection, system integrity, and compliance with security best practices.</contents>
</xai:function_call">
