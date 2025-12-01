# Troubleshooting Guide

This comprehensive troubleshooting guide provides systematic approaches to diagnose and resolve issues with the Personal Assistant Backend. It covers common problems, debugging techniques, and preventive measures.

## Quick Start Checklist

Before diving into specific issues, run through this checklist:

### Environment Verification
```bash
# Check Python version
python --version  # Should be 3.9+

# Check dependencies
pip list | grep -E "(fastapi|uvicorn|dependency-injector)"

# Check environment variables
env | grep -E "(OPENAI|ANTHROPIC|LOG_LEVEL)"

# Check port availability
netstat -tlnp | grep 8765 || echo "Port 8765 available"

# Check disk space
df -h | grep -E "(Filesystem|/$)"
```

### Application Health Check
```bash
# Test basic connectivity
curl -f http://localhost:8765/health || echo "Health check failed"

# Check WebSocket endpoint
timeout 5 websocat ws://localhost:8765/ws --text -E <<< '{"type": "ping"}' || echo "WebSocket failed"

# Check logs for errors
tail -20 /app/logs/assistant.log | grep -i error || echo "No recent errors"
```

## Common Startup Issues

### Import Errors

**Symptoms:**
- `ModuleNotFoundError` or `ImportError` on startup
- Application fails to start with import-related exceptions

**Diagnosis:**
```bash
# Check Python path
python -c "import sys; print('\n'.join(sys.path))"

# Test specific imports
python -c "import backend.src.main" 2>&1 || echo "Import failed"

# Check for circular imports
python -c "import backend.src.core.container" 2>&1 || echo "Container import failed"
```

**Solutions:**

1. **PYTHONPATH Issues:**
```bash
# Set PYTHONPATH explicitly
export PYTHONPATH=/path/to/backend:$PYTHONPATH
python -m backend.src.main

# Or use absolute imports
cd /path/to/backend
python -m backend.src.main
```

2. **Missing Dependencies:**
```bash
# Reinstall requirements
pip install -r requirements.txt --force-reinstall

# Check for conflicting versions
pip check

# Create fresh virtual environment
deactivate
rm -rf venv
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

3. **Circular Import Detection:**
```bash
# Use import analysis
python -c "
import sys
import importlib

modules = ['backend.src.main', 'backend.src.core.container']
for mod in modules:
    try:
        importlib.import_module(mod)
        print(f'{mod}: OK')
    except ImportError as e:
        print(f'{mod}: FAILED - {e}')
"
```

### Configuration Errors

**Symptoms:**
- Application starts but fails to initialize components
- "Configuration not found" or validation errors

**Diagnosis:**
```bash
# Check configuration file existence
ls -la config/ || echo "Config directory missing"
ls -la config/*.yaml || echo "Config files missing"

# Validate configuration syntax
python -c "
from backend.src.core.config import ConfigManager
try:
    cm = ConfigManager()
    config = cm.load_config()
    print('Configuration loaded successfully')
    print(f'Providers: {list(config.llm.providers.keys())}')
except Exception as e:
    print(f'Configuration error: {e}')
"

# Check environment variables
env | grep -E "(DATABASE|REDIS|OPENAI)" || echo "Environment variables missing"
```

**Solutions:**

1. **Missing Configuration Files:**
```bash
# Create default configuration
mkdir -p config
cat > config/default.yaml << EOF
environment: development
llm:
  default_provider: openai
  providers:
    openai:
      api_key: "\${OPENAI_API_KEY}"
database:
  url: sqlite:///assistant.db
EOF
```

2. **Environment Variable Issues:**
```bash
# Set required environment variables
export OPENAI_API_KEY="your-key-here"
export ENVIRONMENT=development
export LOG_LEVEL=DEBUG

# Use .env file for local development
cat > .env << EOF
OPENAI_API_KEY=your-key-here
ENVIRONMENT=development
LOG_LEVEL=DEBUG
EOF
```

### Database Connection Issues

**Symptoms:**
- Application starts but fails to connect to database
- "Connection refused" or timeout errors

**Diagnosis:**
```bash
# Test database connectivity
python -c "
import asyncio
from backend.src.memory.storage.local_store import SQLiteMemoryStore

async def test_db():
    try:
        store = SQLiteMemoryStore('assistant.db')
        await store.initialize()
        print('Database connection successful')
        await store.close()
    except Exception as e:
        print(f'Database error: {e}')

asyncio.run(test_db())
"

# Check database file permissions
ls -la assistant.db 2>/dev/null || echo "Database file missing"
ls -ld .  # Check directory permissions
```

**Solutions:**

1. **SQLite Issues:**
```bash
# Reset SQLite database
rm -f assistant.db
python -c "
import asyncio
from backend.src.memory.storage.local_store import SQLiteMemoryStore

async def init_db():
    store = SQLiteMemoryStore('assistant.db')
    await store.initialize()
    await store.close()
    print('Database initialized')

asyncio.run(init_db())
"
```

2. **PostgreSQL Connection Issues:**
```bash
# Test PostgreSQL connection
psql "\$DATABASE_URL" -c "SELECT 1;" || echo "Connection failed"

# Check connection pool settings
export DATABASE_POOL_SIZE=5
export DATABASE_MAX_OVERFLOW=10

# Reset connection pool
# Restart application to recreate pool
```

3. **Migration Issues:**
```bash
# Check database schema
sqlite3 assistant.db ".schema" | head -20

# Reset and reinitialize
rm -f assistant.db
# Restart application to recreate schema
```

## Runtime Issues

### WebSocket Connection Problems

**Symptoms:**
- Frontend can't connect to backend
- WebSocket errors in browser console
- Connection timeouts or disconnections

**Diagnosis:**
```bash
# Test WebSocket connectivity
timeout 10 websocat ws://localhost:8765/ws --text -E <<< '{
  "type": "handshake",
  "user_id": "test"
}' || echo "WebSocket test failed"

# Check server logs for connection attempts
tail -f /app/logs/assistant.log | grep -i websocket

# Test basic HTTP connectivity
curl -I http://localhost:8765/health

# Check CORS headers
curl -H "Origin: http://localhost:5173" -v http://localhost:8765/health 2>&1 | grep -i "access-control"
```

**Solutions:**

1. **CORS Issues:**
```python
# Check CORS configuration in main.py
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

2. **Connection Limits:**
```bash
# Check system limits
ulimit -n  # File descriptor limit

# Check application connection limits
ps aux | grep assistant | wc -l

# Increase limits if needed
echo "fs.file-max = 65536" >> /etc/sysctl.conf
sysctl -p
```

3. **Network Issues:**
```bash
# Check firewall rules
iptables -L | grep 8765

# Test local connectivity
telnet localhost 8765

# Check proxy configuration
env | grep -i proxy
```

### LLM Provider Issues

**Symptoms:**
- LLM requests fail with API errors
- Rate limiting or quota exceeded errors
- Model not found or authentication errors

**Diagnosis:**
```bash
# Test LLM client directly
python -c "
import asyncio
from backend.src.core.container import ApplicationContainer

async def test_llm():
    container = ApplicationContainer()
    await container.initialize()

    try:
        llm_client = container.core.llm_client()
        response = await llm_client.generate_response([
            {'role': 'user', 'content': 'Hello'}
        ])
        print('LLM test successful')
        print(f'Response: {response.get(\"content\", \"\")[:100]}...')
    except Exception as e:
        print(f'LLM error: {e}')
    finally:
        await container.shutdown()

asyncio.run(test_llm())
"

# Check API key configuration
echo "\$OPENAI_API_KEY" | head -c 10  # First 10 chars
echo "\$ANTHROPIC_API_KEY" | head -c 10
```

**Solutions:**

1. **API Key Issues:**
```bash
# Verify API keys
curl -H "Authorization: Bearer \$OPENAI_API_KEY" \
     https://api.openai.com/v1/models 2>/dev/null | jq '.data[0].id' || echo "API key invalid"

# Check key format
echo "\$OPENAI_API_KEY" | grep "^sk-" || echo "Invalid API key format"
```

2. **Rate Limiting:**
```python
# Implement backoff and retry logic
import asyncio
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=4, max=10)
)
async def call_llm_with_retry(client, messages):
    return await client.generate_response(messages)
```

3. **Model Availability:**
```bash
# List available models
curl -H "Authorization: Bearer \$OPENAI_API_KEY" \
     https://api.openai.com/v1/models | jq '.data[].id'

# Check model configuration
python -c "
from backend.src.core.config import get_config_manager
config = get_config_manager().load_config()
print('Available providers:', list(config.llm.providers.keys()))
print('Default model:', config.llm.default_model_id)
"
```

### Tool Execution Failures

**Symptoms:**
- Tools fail to execute or return errors
- Permission denied errors
- Timeout errors during tool execution

**Diagnosis:**
```bash
# Test tool execution directly
python -c "
import asyncio
from backend.src.core.container import ApplicationContainer
from backend.src.sdk.context import Context, UserContext, SessionContext

async def test_tool():
    container = ApplicationContainer()
    await container.initialize()

    try:
        # Get tool registry
        tool_registry = container.tools.tool_registry()
        read_file_tool = tool_registry.get_tool('read_file')

        if not read_file_tool:
            print('read_file tool not found')
            return

        # Create test context
        context = Context(
            user=UserContext(user_id='test', permissions=['read_filesystem']),
            session=SessionContext(session_id='test'),
            runtime=type('Runtime', (), {'workspace_root': '/tmp'})()
        )

        # Execute tool
        result = await read_file_tool.run(
            {'path': 'test_troubleshooting.md'},
            context
        )

        print('Tool execution result:', result)

    except Exception as e:
        print(f'Tool execution error: {e}')
        import traceback
        traceback.print_exc()
    finally:
        await container.shutdown()

asyncio.run(test_tool())
"

# Check tool permissions
python -c "
from backend.src.core.security.policy import get_security_policy
policy = get_security_policy()
print('Blocked tools:', policy.blocked_tools)
print('Blocked paths:', policy.blocked_paths)
"
```

**Solutions:**

1. **Permission Issues:**
```python
# Check user permissions in context
context.user.permissions.append('read_filesystem')

# Or update security policy
from backend.src.core.security.policy import get_security_policy
policy = get_security_policy()
policy.required_permissions['custom_tool'] = set()  # No permissions required
```

2. **Tool Loading Issues:**
```bash
# Check tool discovery
find tools/ -name "*.py" | head -10

# Test tool loading
python -c "
from backend.src.tools.loader import ToolLoader
from backend.src.core.config import get_config_manager

config = get_config_manager().load_config()
loader = ToolLoader(config)
tools = loader.discover_tools()
print(f'Found {len(tools)} tools')
for tool in tools[:5]:
    print(f'  - {tool}')
"
```

3. **Timeout Issues:**
```python
# Increase tool timeout
from backend.src.core.security.policy import get_security_policy
policy = get_security_policy()
policy.resource_limits.timeout = 120.0  # 2 minutes

# Or set per tool
tool_config = {
    'timeout_seconds': 60.0,
    'max_memory_mb': 256
}
```

### Memory and Performance Issues

**Symptoms:**
- High memory usage
- Slow response times
- Out of memory errors
- Application becoming unresponsive

**Diagnosis:**
```bash
# Check memory usage
ps aux --sort=-%mem | head -10

# Monitor memory over time
python -c "
import psutil
import time

process = psutil.Process()
for i in range(10):
    mem = process.memory_info()
    print(f'Memory: {mem.rss / 1024 / 1024:.1f} MB')
    time.sleep(1)
"

# Check for memory leaks
python -c "
import tracemalloc
tracemalloc.start()

# Your code here
import asyncio
from backend.src.core.container import ApplicationContainer

async def test_memory():
    container = ApplicationContainer()
    await container.initialize()

    # Force garbage collection
    import gc
    gc.collect()

    snapshot = tracemalloc.take_snapshot()
    top_stats = snapshot.statistics('lineno')

    print('Top memory users:')
    for stat in top_stats[:10]:
        print(stat)

    await container.shutdown()

asyncio.run(test_memory())
"

# Check database connection pool
python -c "
import asyncio
from backend.src.core.container import ApplicationContainer

async def check_connections():
    container = ApplicationContainer()
    await container.initialize()

    # Check active connections
    # Implementation depends on database type

    await container.shutdown()

asyncio.run(check_connections())
"
```

**Solutions:**

1. **Memory Optimization:**
```python
# Implement streaming for large responses
async def stream_response(messages):
    async for chunk in llm_client.generate_stream(messages):
        yield chunk
        # Allow event loop to process other tasks
        await asyncio.sleep(0)

# Use connection pooling
db_config = {
    'pool_size': 10,
    'max_overflow': 20,
    'pool_recycle': 3600,  # Recycle connections every hour
}
```

2. **Caching Issues:**
```python
# Clear caches
from backend.src.core.cache import cache
await cache.clear()

# Check cache size
stats = await cache.stats()
print(f'Cache entries: {stats.get(\"entries\", 0)}')
print(f'Cache size: {stats.get(\"size\", 0)} bytes')
```

3. **Database Performance:**
```sql
-- Analyze slow queries
EXPLAIN ANALYZE SELECT * FROM memories WHERE user_id = 'user123';

-- Add indexes if needed
CREATE INDEX CONCURRENTLY idx_memories_user_id ON memories(user_id);
CREATE INDEX CONCURRENTLY idx_memories_created_at ON memories(created_at DESC);

-- Vacuum and analyze
VACUUM ANALYZE memories;
```

## Advanced Debugging

### Profiling Application Performance

```python
# CPU profiling
import cProfile
import pstats

def profile_function():
    profiler = cProfile.Profile()
    profiler.enable()

    # Code to profile
    asyncio.run(main())

    profiler.disable()
    stats = pstats.Stats(profiler).sort_stats('cumulative')
    stats.print_stats(20)

# Memory profiling
import tracemalloc

tracemalloc.start()
# Your code here
current, peak = tracemalloc.get_traced_memory()
print(f'Current memory usage: {current / 1024 / 1024:.1f} MB')
print(f'Peak memory usage: {peak / 1024 / 1024:.1f} MB')

# Get detailed breakdown
snapshot = tracemalloc.take_snapshot()
top_stats = snapshot.statistics('traceback')
for stat in top_stats[:10]:
    print(stat)
```

### Distributed Tracing

```python
# Add tracing to requests
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import ConsoleSpanExporter, SimpleSpanProcessor

trace.set_tracer_provider(TracerProvider())
tracer = trace.get_tracer(__name__)

span_processor = SimpleSpanProcessor(ConsoleSpanExporter())
trace.get_tracer_provider().add_span_processor(span_processor)

# Use in code
with tracer.start_as_current_span("llm_request") as span:
    span.set_attribute("llm.provider", "openai")
    span.set_attribute("llm.model", "gpt-4")

    response = await llm_client.generate_response(messages)

    span.set_attribute("llm.tokens_used", response.get("usage", {}).get("total_tokens", 0))
```

### Log Analysis

```bash
# Search for patterns in logs
grep "ERROR" /app/logs/assistant.log | tail -20

# Analyze error frequency
grep "ERROR" /app/logs/assistant.log | \
    awk '{print $1}' | \
    sort | \
    uniq -c | \
    sort -nr | \
    head -10

# Check for memory-related errors
grep -i "memory\|out of memory" /app/logs/assistant.log

# Analyze response times
grep "request_duration" /app/logs/assistant.log | \
    grep -o '"request_duration":[0-9.]*' | \
    cut -d: -f2 | \
    sort -n | \
    awk 'BEGIN {sum=0; count=0} {sum+=$1; count++} END {print "Average:", sum/count, "Count:", count}'
```

### System Resource Monitoring

```bash
# Monitor system resources
watch -n 1 'ps aux --sort=-%cpu | head -10'

# Check disk I/O
iostat -x 1 5

# Monitor network connections
netstat -tlnp | grep 8765
ss -tlnp | grep 8765

# Check system load
uptime
cat /proc/loadavg

# Monitor file descriptors
lsof -p $(pgrep -f assistant) | wc -l
```

## Emergency Procedures

### Application Freeze/Crash

**Immediate Actions:**
```bash
# Check if process is still running
ps aux | grep assistant

# Check recent logs
tail -50 /app/logs/assistant.log

# Restart application
docker-compose restart assistant

# Or manual restart
pkill -f assistant
python -m backend.src.main &
```

### Data Recovery

**Database Recovery:**
```bash
# Create backup of current state
cp assistant.db assistant.db.backup

# Check database integrity
sqlite3 assistant.db "PRAGMA integrity_check;"

# Repair if corrupted
sqlite3 assistant.db ".recover" > recovered.sql
sqlite3 recovered.db < recovered.sql
```

**Configuration Recovery:**
```bash
# Restore from backup
cp /backups/config/production.yaml /app/config/production.yaml

# Check configuration validity
python -c "
from backend.src.core.config import ConfigManager
try:
    cm = ConfigManager()
    config = cm.load_config()
    print('Configuration is valid')
except Exception as e:
    print(f'Configuration error: {e}')
"
```

### Full System Reset

**Last Resort Recovery:**
```bash
# Stop all services
docker-compose down

# Backup current state
mkdir -p /backups/emergency/$(date +%Y%m%d_%H%M%S)
cp -r /app/data /backups/emergency/
cp /app/logs/*.log /backups/emergency/

# Clean restart
rm -rf /app/data/*
rm -rf /app/logs/*.log

# Restart services
docker-compose up -d

# Verify recovery
curl -f http://localhost:8765/health
```

## Preventive Measures

### Monitoring Setup

```python
# Set up comprehensive monitoring
from backend.src.core.metrics import metrics

# Application health metrics
@metrics.gauge('app.uptime_seconds')
def uptime():
    return time.time() - start_time

# Error tracking
@metrics.counter('app.errors_total', labels=['type'])
def track_error(error_type: str):
    pass

# Resource monitoring
@metrics.gauge('app.memory_usage_bytes')
def memory_usage():
    import psutil
    process = psutil.Process()
    return process.memory_info().rss
```

### Automated Health Checks

```bash
# Health check script
#!/bin/bash
HEALTH_URL="http://localhost:8765/health"
WEBSOCKET_URL="ws://localhost:8765/ws"

# HTTP health check
if ! curl -f --max-time 10 "$HEALTH_URL" > /dev/null 2>&1; then
    echo "HTTP health check failed"
    exit 1
fi

# WebSocket health check
if ! timeout 10 websocat "$WEBSOCKET_URL" --text -E <<< '{"type": "ping"}' > /dev/null 2>&1; then
    echo "WebSocket health check failed"
    exit 1
fi

echo "All health checks passed"
```

### Log Rotation and Management

```bash
# Configure logrotate
cat > /etc/logrotate.d/assistant << EOF
/app/logs/assistant.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    create 644 app app
    postrotate
        docker-compose exec assistant kill -HUP 1 2>/dev/null || true
    endscript
}
EOF

# Monitor log sizes
du -sh /app/logs/*
```

### Backup Automation

```bash
# Automated backup script
#!/bin/bash
BACKUP_DIR="/backups/assistant"
DATE=$(date +%Y%m%d_%H%M%S)

# Database backup
pg_dump -h db -U user assistant > "$BACKUP_DIR/db_$DATE.sql" 2>/dev/null || \
sqlite3 assistant.db ".backup '$BACKUP_DIR/db_$DATE.db'"

# Configuration backup
cp /app/config/production.yaml "$BACKUP_DIR/config_$DATE.yaml"

# Compress and cleanup
tar -czf "$BACKUP_DIR/backup_$DATE.tar.gz" -C "$BACKUP_DIR" .
find "$BACKUP_DIR" -name "backup_*.tar.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_DIR/backup_$DATE.tar.gz"
```

This comprehensive troubleshooting guide provides systematic approaches to diagnose and resolve the most common issues encountered with the Personal Assistant Backend, along with preventive measures to avoid future problems.
