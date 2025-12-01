# Advanced Configuration Guide

This comprehensive guide covers advanced configuration scenarios, optimization techniques, and real-world deployment configurations for the Personal Assistant system.

## Table of Contents

- [Configuration Architecture](#configuration-architecture)
- [Environment-Based Configuration](#environment-based-configuration)
- [Performance Tuning](#performance-tuning)
- [Security Configuration](#security-configuration)
- [Multi-Provider Setup](#multi-provider-setup)
- [High Availability Setup](#high-availability-setup)
- [Development vs Production](#development-vs-production)
- [Troubleshooting Configuration](#troubleshooting-configuration)

## Configuration Architecture

### Configuration Sources

The system supports multiple configuration sources with the following precedence (highest to lowest):

1. **Environment Variables** - Runtime overrides
2. **Instance-specific config files** - Deployment-specific settings
3. **Base configuration files** - Default settings
4. **Built-in defaults** - Fallback values

### Configuration Structure

```yaml
# config.yaml - Main configuration structure
app:
  # Core application settings
  name: "Personal Assistant"
  version: "1.0.0"
  environment: "production"  # development, staging, production

  # Server configuration
  server:
    host: "0.0.0.0"
    port: 8765
    cors_origins: ["http://localhost:5173"]
    max_connections: 100
    connection_timeout: 30

  # LLM Configuration
  llm:
    provider: "openai"  # openai, anthropic, local
    model: "gpt-4"
    temperature: 0.7
    max_tokens: 4000
    timeout: 60
    retry_attempts: 3
    fallback_providers: ["anthropic", "local"]

  # Memory configuration
  memory:
    enabled: true
    type: "vector"  # vector, semantic, episodic
    storage_path: "./data/memory"
    max_items: 10000
    similarity_threshold: 0.8
    embedding_model: "sentence-transformers/all-MiniLM-L6-v2"

  # Tool configuration
  tools:
    enabled: true
    timeout: 30
    max_parallel: 3
    security:
      allow_file_operations: true
      allow_network_requests: true
      max_file_size_mb: 100
      allowed_domains: ["*.github.com", "*.wikipedia.org"]

  # Plugin configuration
  plugins:
    enabled: true
    auto_discover: true
    plugin_dirs: ["./plugins", "/opt/pa/plugins"]
    disabled_plugins: ["debug_plugin"]

  # Logging configuration
  logging:
    level: "INFO"
    format: "json"
    file: "./logs/personal-assistant.log"
    max_size: "100MB"
    backups: 5
    console: true

  # Monitoring and metrics
  monitoring:
    enabled: true
    metrics_port: 9090
    health_check_interval: 30
    performance_tracking: true

  # Security settings
  security:
    api_keys_required: true
    rate_limiting:
      requests_per_minute: 60
      burst_limit: 10
    audit_logging: true
    input_validation: true
```

## Environment-Based Configuration

### Development Environment

```yaml
# config.development.yaml
app:
  environment: "development"

  server:
    host: "localhost"
    port: 8765
    cors_origins: ["http://localhost:5173", "http://localhost:3000"]
    debug: true

  llm:
    provider: "openai"
    model: "gpt-3.5-turbo"  # Use cheaper model for development
    temperature: 0.9  # More creative for testing
    max_tokens: 2000
    timeout: 30

  memory:
    enabled: true
    max_items: 1000  # Smaller memory for development

  logging:
    level: "DEBUG"
    console: true
    file: "./logs/dev.log"

  plugins:
    disabled_plugins: []  # Enable all plugins in development

  monitoring:
    enabled: false  # Disable monitoring overhead in development
```

**Environment Variables for Development:**
```bash
export PA_ENVIRONMENT=development
export PA_LLM_API_KEY=sk-dev-...
export PA_DEBUG=true
export PA_LOG_LEVEL=DEBUG
```

### Production Environment

```yaml
# config.production.yaml
app:
  environment: "production"

  server:
    host: "0.0.0.0"
    port: 8765
    cors_origins: ["https://yourapp.com"]
    max_connections: 1000
    connection_timeout: 60
    ssl_enabled: true
    ssl_cert: "/etc/ssl/certs/pa.crt"
    ssl_key: "/etc/ssl/private/pa.key"

  llm:
    provider: "openai"
    model: "gpt-4"
    temperature: 0.7
    max_tokens: 4000
    timeout: 120
    retry_attempts: 5
    fallback_providers: ["anthropic", "azure"]

  memory:
    enabled: true
    max_items: 50000
    storage_path: "/var/lib/personal-assistant/memory"
    backup_enabled: true
    backup_interval_hours: 24

  tools:
    timeout: 60
    max_parallel: 10
    security:
      allow_file_operations: false  # Restrict in production
      allow_network_requests: true
      max_file_size_mb: 50
      allowed_domains: ["api.github.com", "en.wikipedia.org"]

  logging:
    level: "WARNING"
    format: "json"
    file: "/var/log/personal-assistant/app.log"
    max_size: "500MB"
    backups: 10

  monitoring:
    enabled: true
    metrics_port: 9090
    alerting:
      enabled: true
      webhook_url: "https://alerts.yourcompany.com/webhook"

  security:
    api_keys_required: true
    rate_limiting:
      requests_per_minute: 100
      burst_limit: 20
    audit_logging: true
    input_sanitization: true
    encryption:
      enabled: true
      key_path: "/etc/pa/encryption.key"
```

**Production Environment Variables:**
```bash
export PA_ENVIRONMENT=production
export PA_LLM_API_KEY=sk-prod-...
export PA_DATABASE_URL=postgresql://user:pass@db.host:5432/pa
export PA_REDIS_URL=redis://cache.host:6379
export PA_SSL_CERT_PATH=/etc/ssl/certs/pa.crt
export PA_SSL_KEY_PATH=/etc/ssl/private/pa.key
```

### Staging Environment

```yaml
# config.staging.yaml
app:
  environment: "staging"

  # Mix of development and production settings
  server:
    host: "0.0.0.0"
    port: 8765
    cors_origins: ["https://staging.yourapp.com"]
    max_connections: 500

  llm:
    provider: "anthropic"  # Test different provider in staging
    model: "claude-3-sonnet"
    temperature: 0.7

  monitoring:
    enabled: true
    alerting:
      enabled: true
      webhook_url: "https://staging-alerts.yourcompany.com/webhook"

  # Enable additional validation in staging
  security:
    input_validation: true
    audit_logging: true
    rate_limiting:
      requests_per_minute: 200  # Higher limits for testing
```

## Performance Tuning

### Memory Optimization

```yaml
# High-performance memory configuration
memory:
  enabled: true
  type: "vector"

  # Storage optimization
  storage:
    type: "sqlite"  # sqlite, postgresql, redis
    path: "/dev/shm/pa_memory.db"  # RAM disk for speed
    wal_mode: true  # Write-ahead logging
    synchronous: "NORMAL"  # Balance speed vs safety

  # Embedding optimization
  embedding:
    model: "sentence-transformers/paraphrase-MiniLM-L3-v2"  # Smaller, faster model
    cache_enabled: true
    cache_size: 10000
    batch_size: 32

  # Retrieval optimization
  retrieval:
    index_type: "hnsw"  # Hierarchical Navigable Small World
    ef_construction: 200
    ef_search: 64
    similarity_metric: "cosine"

  # Memory management
  max_items: 100000
  cleanup_interval_minutes: 60
  compression_enabled: true
```

### LLM Optimization

```yaml
# Optimized LLM configuration
llm:
  # Primary provider
  provider: "openai"
  model: "gpt-4-turbo-preview"
  temperature: 0.7
  max_tokens: 2000

  # Performance settings
  timeout: 30
  retry_attempts: 3
  retry_backoff: "exponential"
  max_retry_delay: 60

  # Connection pooling
  connection_pool:
    max_connections: 20
    max_keepalive: 10
    keepalive_timeout: 30

  # Caching
  cache:
    enabled: true
    ttl_seconds: 3600  # 1 hour
    max_size_mb: 500

  # Fallback configuration
  fallback_providers:
    - provider: "anthropic"
      model: "claude-3-haiku"  # Faster fallback
      priority: 1
    - provider: "local"
      model: "llama-2-7b-chat"
      priority: 2
```

### Tool Performance Configuration

```yaml
# High-performance tool configuration
tools:
  # Execution settings
  timeout: 30
  max_parallel: 5
  queue_size: 100

  # Resource limits
  memory_limit_mb: 512
  cpu_limit_percent: 80

  # Caching
  result_cache:
    enabled: true
    ttl_seconds: 300
    max_entries: 1000

  # Batch processing
  batch_processing:
    enabled: true
    max_batch_size: 10
    batch_timeout: 5

  # Specific tool optimizations
  optimizations:
    file_operations:
      buffer_size: 8192
      encoding_detection: true
    web_requests:
      user_agent: "Personal-Assistant/1.0"
      timeout: 10
      max_redirects: 3
    shell_commands:
      shell: "/bin/bash"
      working_directory: "/tmp"
```

### Server Optimization

```yaml
# High-performance server configuration
server:
  # Network settings
  host: "0.0.0.0"
  port: 8765
  max_connections: 10000
  connection_timeout: 30

  # WebSocket settings
  websocket:
    max_message_size: 1048576  # 1MB
    compression: true
    heartbeat_interval: 30

  # HTTP settings
  http:
    max_request_size: 10485760  # 10MB
    keep_alive: true
    keep_alive_timeout: 75

  # SSL/TLS optimization
  ssl:
    enabled: true
    cert: "/etc/ssl/certs/pa.crt"
    key: "/etc/ssl/private/pa.key"
    ciphers: "ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-GCM-SHA256"
    protocol: "TLSv1.2"

  # CORS configuration
  cors:
    origins: ["https://yourapp.com"]
    methods: ["GET", "POST", "OPTIONS"]
    headers: ["Content-Type", "Authorization"]
    credentials: true
    max_age: 86400

  # Rate limiting
  rate_limiting:
    enabled: true
    requests_per_minute: 1000
    burst_limit: 100
    strategy: "sliding_window"
```

## Security Configuration

### Basic Security Setup

```yaml
# Basic security configuration
security:
  # API authentication
  api_keys:
    required: true
    header_name: "X-API-Key"
    keys:
      - "sk-prod-1234567890abcdef"
      - "sk-dev-0987654321fedcba"

  # Input validation
  input_validation:
    enabled: true
    max_input_length: 10000
    allowed_characters: "alphanumeric + punctuation"
    sanitize_html: true

  # Rate limiting
  rate_limiting:
    enabled: true
    requests_per_minute: 60
    burst_limit: 10
    block_duration_minutes: 15

  # Audit logging
  audit:
    enabled: true
    log_file: "/var/log/pa/audit.log"
    events:
      - "authentication"
      - "tool_execution"
      - "file_access"
      - "network_request"
```

### Advanced Security Configuration

```yaml
# Advanced security configuration
security:
  # Multi-factor authentication
  mfa:
    enabled: true
    provider: "totp"  # totp, sms, email
    required_for_admin: true

  # Encryption
  encryption:
    enabled: true
    algorithm: "AES-256-GCM"
    key_rotation_days: 90
    master_key_path: "/etc/pa/master.key"

  # Network security
  network:
    allowed_ips: ["192.168.1.0/24", "10.0.0.0/8"]
    blocked_ips: ["1.2.3.4"]
    firewall:
      enabled: true
      rules_path: "/etc/pa/firewall.rules"

  # Content security
  content_security:
    max_file_size_mb: 10
    allowed_mime_types: ["text/*", "image/png", "image/jpeg"]
    virus_scanning: true
    clamav_socket: "/var/run/clamav/clamd.ctl"

  # Session security
  sessions:
    max_age_hours: 24
    secure_cookies: true
    http_only: true
    same_site: "strict"

  # Monitoring and alerting
  monitoring:
    intrusion_detection: true
    anomaly_detection: true
    alert_webhook: "https://security.yourcompany.com/alerts"
```

### Compliance Configuration

```yaml
# GDPR and compliance configuration
compliance:
  gdpr:
    enabled: true
    data_retention_days: 2555  # 7 years
    consent_required: true
    data_portability: true
    right_to_be_forgotten: true

  audit:
    enabled: true
    immutable_logs: true
    log_encryption: true
    retention_period_years: 7

  privacy:
    anonymize_ips: true
    data_minimization: true
    purpose_limitation: true

  # Industry-specific compliance
  hipaa: false  # Set to true for healthcare
  pci_dss: false  # Set to true for payment processing
  soc2: true

  # Data handling
  data_handling:
    encryption_at_rest: true
    encryption_in_transit: true
    backup_encryption: true
    cross_border_transfers: false
```

## Multi-Provider Setup

### LLM Provider Configuration

```yaml
# Multi-provider LLM configuration
llm:
  # Provider routing
  routing:
    strategy: "cost_optimized"  # latency, cost_optimized, quality_first
    fallback_enabled: true
    circuit_breaker_enabled: true

  # OpenAI configuration
  providers:
    openai:
      enabled: true
      api_key: "${OPENAI_API_KEY}"
      models:
        - name: "gpt-4-turbo"
          context_window: 128000
          cost_per_token: 0.00003
          priority: 1
        - name: "gpt-3.5-turbo"
          context_window: 16385
          cost_per_token: 0.000002
          priority: 2

    # Anthropic configuration
    anthropic:
      enabled: true
      api_key: "${ANTHROPIC_API_KEY}"
      models:
        - name: "claude-3-opus"
          context_window: 200000
          cost_per_token: 0.000015
          priority: 1
        - name: "claude-3-haiku"
          context_window: 200000
          cost_per_token: 0.00000025
          priority: 3

    # Azure OpenAI configuration
    azure:
      enabled: true
      endpoint: "https://your-resource.openai.azure.com/"
      api_key: "${AZURE_API_KEY}"
      deployment_mappings:
        "gpt-4": "your-gpt4-deployment"
        "gpt-3.5-turbo": "your-gpt35-deployment"

    # Local model configuration
    local:
      enabled: true
      endpoint: "http://localhost:8000"
      models:
        - name: "llama-2-70b-chat"
          priority: 4

  # Load balancing
  load_balancing:
    enabled: true
    algorithm: "round_robin"  # round_robin, least_loaded, geographic
    health_checks:
      enabled: true
      interval_seconds: 30
      timeout_seconds: 5
      failure_threshold: 3

  # Cost management
  cost_management:
    enabled: true
    monthly_budget: 1000.0
    alert_threshold_percent: 80
    tracking_enabled: true
```

### Tool Provider Configuration

```yaml
# Multi-provider tool configuration
tools:
  # Provider management
  providers:
    local:
      enabled: true
      priority: 1
      timeout: 30

    remote:
      enabled: true
      endpoints:
        - url: "https://api.tools.example.com"
          api_key: "${TOOLS_API_KEY}"
          priority: 2
        - url: "https://backup.tools.example.com"
          api_key: "${BACKUP_TOOLS_API_KEY}"
          priority: 3

  # Tool routing
  routing:
    strategy: "capability_based"  # capability_based, latency, cost
    fallback_enabled: true

  # Specific tool configurations
  configurations:
    web_search:
      providers: ["serpapi", "google", "duckduckgo"]
      fallback_order: ["serpapi", "google", "duckduckgo"]
      cache_enabled: true
      cache_ttl: 3600

    code_execution:
      providers: ["local", "remote"]
      security: "sandboxed"
      timeout: 10
      memory_limit: "256MB"

    file_processing:
      providers: ["local"]
      allowed_extensions: [".txt", ".md", ".json", ".csv"]
      max_file_size: "10MB"
```

## High Availability Setup

### Load Balancing Configuration

```yaml
# Load balancer configuration
load_balancer:
  enabled: true
  type: "nginx"  # nginx, haproxy, aws_alb

  upstreams:
    app_servers:
      - "app1.internal:8765"
      - "app2.internal:8765"
      - "app3.internal:8765"

  health_checks:
    enabled: true
    path: "/health"
    interval: 10
    timeout: 5
    unhealthy_threshold: 3
    healthy_threshold: 2

  ssl_termination: true
  session_stickiness: false  # WebSocket connections
```

### Database Clustering

```yaml
# Database cluster configuration
database:
  type: "postgresql"
  cluster:
    enabled: true
    master: "db-master.internal:5432"
    replicas:
      - "db-replica1.internal:5432"
      - "db-replica2.internal:5432"

  connection_pool:
    min_connections: 10
    max_connections: 100
    connection_timeout: 30

  replication:
    synchronous_commit: "on"
    wal_level: "replica"
```

### Redis Cluster Configuration

```yaml
# Redis cluster for caching and sessions
redis:
  cluster:
    enabled: true
    nodes:
      - "redis1.internal:6379"
      - "redis2.internal:6379"
      - "redis3.internal:6379"

  connection:
    max_connections: 50
    retry_on_timeout: true
    socket_timeout: 5
    socket_connect_timeout: 5

  # Cache configuration
  cache:
    default_ttl: 3600
    max_memory: "1GB"
    eviction_policy: "allkeys-lru"
```

### Monitoring and Alerting

```yaml
# Comprehensive monitoring configuration
monitoring:
  # Metrics collection
  metrics:
    enabled: true
    collector: "prometheus"
    endpoint: "/metrics"
    interval: 15

  # Health checks
  health_checks:
    enabled: true
    checks:
      - name: "database"
        type: "postgresql"
        connection_string: "${DATABASE_URL}"
        interval: 30
      - name: "redis"
        type: "redis"
        url: "${REDIS_URL}"
        interval: 30
      - name: "llm_providers"
        type: "http"
        urls: ["https://api.openai.com/health", "https://api.anthropic.com/health"]
        interval: 60

  # Alerting
  alerting:
    enabled: true
    rules:
      - name: "high_error_rate"
        condition: "rate(errors_total[5m]) > 0.1"
        severity: "critical"
        channels: ["slack", "email"]
      - name: "high_latency"
        condition: "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 5"
        severity: "warning"
        channels: ["slack"]
      - name: "low_availability"
        condition: "up == 0"
        severity: "critical"
        channels: ["pagerduty", "slack", "email"]

  # Logging
  logging:
    centralized: true
    aggregator: "elasticsearch"
    retention_days: 30
```

## Development vs Production

### Development Overrides

```yaml
# Development overrides using environment variables
# These override the base configuration

# Server configuration
PA_SERVER_HOST=localhost
PA_SERVER_PORT=8765
PA_SERVER_DEBUG=true

# Database (use local SQLite)
PA_DATABASE_URL=sqlite:///dev.db

# Redis (use local instance)
PA_REDIS_URL=redis://localhost:6379

# LLM (use mock or development API)
PA_LLM_PROVIDER=mock
PA_LLM_MOCK_RESPONSES=true

# Logging
PA_LOG_LEVEL=DEBUG
PA_LOG_CONSOLE=true

# Disable expensive features
PA_MONITORING_ENABLED=false
PA_CACHE_ENABLED=false
PA_RATE_LIMITING_ENABLED=false
```

### Production Overrides

```bash
# Production environment variables
export PA_ENVIRONMENT=production
export PA_SERVER_HOST=0.0.0.0
export PA_SERVER_PORT=8765
export PA_SSL_ENABLED=true
export PA_SSL_CERT_PATH=/etc/ssl/certs/pa.crt
export PA_SSL_KEY_PATH=/etc/ssl/private/pa.key

# Database cluster
export PA_DATABASE_URL=postgresql://pa_user:pa_pass@db-cluster.example.com:5432/pa_prod?sslmode=require

# Redis cluster
export PA_REDIS_URL=redis://pa-cache.example.com:6379

# LLM providers
export PA_LLM_OPENAI_API_KEY=sk-prod-...
export PA_LLM_ANTHROPIC_API_KEY=sk-ant-prod-...

# Monitoring
export PA_MONITORING_ENABLED=true
export PA_METRICS_PORT=9090
export PA_HEALTH_CHECK_INTERVAL=30

# Security
export PA_API_KEYS_REQUIRED=true
export PA_RATE_LIMITING_REQUESTS_PER_MINUTE=100
export PA_AUDIT_LOGGING_ENABLED=true
```

## Troubleshooting Configuration

### Configuration Validation

```yaml
# Configuration validation settings
validation:
  enabled: true
  strict: true  # Fail on unknown keys
  schema_path: "./schemas/config.schema.json"

  # Type checking
  type_checking:
    enabled: true
    strict_types: true

  # Value validation
  value_validation:
    enabled: true
    ranges:
      port: [1024, 65535]
      timeout: [1, 300]
      max_connections: [1, 10000]
```

### Debug Configuration

```yaml
# Debug configuration for troubleshooting
debug:
  enabled: true
  log_config_loading: true
  validate_on_startup: true

  # Request debugging
  request_debugging:
    log_headers: true
    log_body: false  # Don't log sensitive data
    log_timing: true

  # Performance debugging
  performance_debugging:
    profile_requests: true
    log_slow_queries: true
    slow_query_threshold_ms: 1000

  # Memory debugging
  memory_debugging:
    track_allocations: true
    log_memory_usage: true
    gc_debug_flags: ["DEBUG_STATS", "DEBUG_LEAK"]
```

### Configuration Testing

```python
# config_test.py - Configuration testing utilities
import os
import yaml
from pathlib import Path
from typing import Dict, Any

def test_configuration_loading():
    """Test configuration loading and validation."""
    config_files = [
        "config.yaml",
        "config.production.yaml",
        "config.development.yaml"
    ]

    for config_file in config_files:
        if Path(config_file).exists():
            print(f"Testing {config_file}...")

            try:
                with open(config_file, 'r') as f:
                    config = yaml.safe_load(f)

                # Validate required sections
                required_sections = ["app", "llm", "server"]
                for section in required_sections:
                    assert section in config, f"Missing required section: {section}"

                # Validate LLM configuration
                llm_config = config.get("llm", {})
                assert "provider" in llm_config, "LLM provider not specified"

                print(f"✅ {config_file} is valid")

            except Exception as e:
                print(f"❌ {config_file} validation failed: {e}")

def test_environment_variables():
    """Test environment variable configuration."""
    required_vars = [
        "PA_LLM_API_KEY",
        "PA_DATABASE_URL"
    ]

    optional_vars = [
        "PA_SERVER_HOST",
        "PA_SERVER_PORT",
        "PA_LOG_LEVEL"
    ]

    print("Checking environment variables...")

    for var in required_vars:
        if not os.getenv(var):
            print(f"⚠️  Required environment variable missing: {var}")
        else:
            print(f"✅ {var} is set")

    for var in optional_vars:
        if os.getenv(var):
            print(f"✅ {var} is set")
        else:
            print(f"ℹ️  {var} not set (using default)")

if __name__ == "__main__":
    test_configuration_loading()
    test_environment_variables()
```

This advanced configuration guide provides comprehensive examples for deploying and optimizing the Personal Assistant system across different environments and use cases. Each configuration section includes detailed explanations and best practices for production deployment.
