# Troubleshooting Quick Reference

This quick reference guide provides solutions for the most common issues encountered with the Personal Assistant Backend. For detailed troubleshooting, see the [full troubleshooting guide](troubleshooting.md).

## Quick Diagnosis Commands

```bash
# Check if server is running
curl http://localhost:8765/health

# Check WebSocket connectivity
node -e "const ws=new WebSocket('ws://localhost:8765/ws');ws.onopen=()=>console.log('Connected');ws.onerror=(e)=>console.log('Error:',e);"

# Check Python environment
python --version && which python && python -c "import backend.src.main; print('Import OK')"

# Check database
sqlite3 ~/.config/DesktopAssistant/assistant.db "SELECT COUNT(*) FROM memories;"

# Check logs
tail -f assistant.log | grep -i error
```

## Startup Issues

### "Module not found" errors

**Symptoms**: ImportError when starting the application

**Solutions**:
```bash
# Fix Python path
export PYTHONPATH=$PWD:$PYTHONPATH
python -m backend.src.main

# Or run with module path
cd backend
python -m src.main

# Reinstall dependencies
pip install -r requirements.txt --force-reinstall
```

### Port already in use

**Symptoms**: "Address already in use" error

**Solutions**:
```bash
# Find process using port 8765
lsof -ti:8765 | xargs kill -9

# Or use different port
uvicorn backend.src.main:app --port 8766
```

### Missing API keys

**Symptoms**: "No API key configured" error

**Solutions**:
```powershell
# Windows PowerShell
$env:OPENAI_API_KEY = "your-key-here"
$env:ANTHROPIC_API_KEY = "your-key-here"
```

```bash
# Linux/macOS
export OPENAI_API_KEY="your-key-here"
export ANTHROPIC_API_KEY="your-key-here"
```

## WebSocket Issues

### Connection fails

**Symptoms**: WebSocket connection immediately closes

**Quick Check**:
```javascript
const ws = new WebSocket('ws://localhost:8765/ws');
ws.onopen = () => console.log('Connected');
ws.onclose = (e) => console.log('Closed:', e.code, e.reason);
ws.onerror = (e) => console.log('Error:', e);
```

**Common Causes & Solutions**:

1. **Missing handshake**:
   ```javascript
   ws.send(JSON.stringify({type: 'handshake', user_id: 'test'}));
   ```

2. **CORS issues**: Check if frontend is connecting from allowed origin
3. **SSL issues**: Ensure proper SSL configuration for production

### Messages not received

**Symptoms**: WebSocket connected but no responses to messages

**Debug Steps**:
1. Check server logs for message processing
2. Verify message format matches API spec
3. Test with ping message first

**Test Message**:
```javascript
ws.send(JSON.stringify({
  id: 'test-ping',
  type: 'ping',
  payload: {text: 'test'}
}));
```

## Query Processing Issues

### "No model selected" error

**Symptoms**: Queries fail with model selection error

**Solutions**:
1. Check settings are loaded: Send `load-settings` message
2. Update model selection: Send `update-settings` message
3. Verify API keys are configured

### LLM provider errors

**Symptoms**: "API key invalid" or "Rate limit exceeded"

**Solutions**:
```bash
# Check API key validity
curl -H "Authorization: Bearer $OPENAI_API_KEY" \
     https://api.openai.com/v1/models

# Check rate limits (varies by provider)
# OpenAI: 60 RPM, Anthropic: 50 RPM
```

### Tool execution failures

**Symptoms**: Tool calls fail or return errors

**Debug Steps**:
1. Check tool is registered: Look for tool in logs during startup
2. Verify tool arguments: Check argument validation
3. Check tool permissions: Some tools require specific permissions

**Test Tool Execution**:
```javascript
ws.send(JSON.stringify({
  type: 'query',
  payload: {text: 'list files in current directory'}
}));
```

## Performance Issues

### Slow responses

**Symptoms**: Queries take > 10 seconds

**Quick Diagnosis**:
```bash
# Check system resources
top -p $(pgrep python)
free -h
df -h

# Profile with Python
python -c "import cProfile; cProfile.run('import backend.src.main', sort='cumulative')"
```

**Common Solutions**:
- Check LLM provider latency
- Monitor memory usage (target < 80%)
- Review concurrent connections
- Check database performance

### Memory leaks

**Symptoms**: Memory usage grows over time

**Debug**:
```python
import tracemalloc
tracemalloc.start()
# Run some queries
snapshot = tracemalloc.take_snapshot()
stats = snapshot.statistics('lineno')
for stat in stats[:10]:
    print(stat)
```

**Solutions**:
- Check session cleanup
- Review conversation history limits
- Monitor object reference cycles

### High CPU usage

**Symptoms**: CPU usage > 80%

**Debug**:
```bash
# Profile CPU usage
py-spy top --pid $(pgrep python)
```

**Common Causes**:
- LLM inference processing
- Large data processing
- Memory garbage collection

## Database Issues

### Database locked errors

**Symptoms**: SQLite "database is locked" errors

**Solutions**:
```bash
# Check for long-running queries
sqlite3 ~/.config/DesktopAssistant/assistant.db ".tables"
sqlite3 ~/.config/DesktopAssistant/assistant.db "SELECT * FROM sqlite_master;"

# Reset database (WARNING: loses data)
rm ~/.config/DesktopAssistant/assistant.db
# Restart application to recreate
```

### Missing tables

**Symptoms**: "no such table" errors

**Solutions**:
- Database migration failed during startup
- Check startup logs for migration errors
- Manually recreate database schema

## Configuration Issues

### Settings not persisting

**Symptoms**: Settings reset after restart

**Debug**:
```bash
# Check config file location
ls -la ~/.config/DesktopAssistant/

# Check file permissions
ls -l ~/.config/DesktopAssistant/config.yaml
```

### Invalid configuration

**Symptoms**: Configuration validation errors

**Debug**:
```python
from backend.src.core.config import AppConfig
import yaml

with open('config.yaml') as f:
    config_data = yaml.safe_load(f)

try:
    config = AppConfig(**config_data)
    print("Config valid")
except Exception as e:
    print(f"Config error: {e}")
```

## Network Issues

### Connection timeouts

**Symptoms**: External API calls timeout

**Debug**:
```bash
# Test network connectivity
curl -v --connect-timeout 5 https://api.openai.com/v1/models

# Check DNS resolution
nslookup api.openai.com

# Test with different timeout
curl --max-time 30 https://api.openai.com/v1/models
```

### SSL certificate errors

**Symptoms**: SSL verification fails

**Solutions**:
```bash
# Disable SSL verification (development only)
export PYTHONHTTPSVERIFY=0

# Update CA certificates
pip install --upgrade certifi

# Check certificate expiry
openssl s_client -connect api.openai.com:443 -servername api.openai.com < /dev/null
```

## Logging and Debugging

### Enable debug logging

```python
import logging
logging.basicConfig(level=logging.DEBUG)

# Or set environment variable
export LOG_LEVEL=DEBUG
```

### View detailed logs

```bash
# Follow logs in real-time
tail -f assistant.log

# Filter for specific errors
grep -i error assistant.log | tail -20

# Search for specific user/session
grep "user123" assistant.log
```

### Debug WebSocket messages

```javascript
const ws = new WebSocket('ws://localhost:8765/ws');

// Log all messages
ws.onmessage = (event) => {
  console.log('Received:', JSON.parse(event.data));
};

// Send with detailed logging
ws.send(JSON.stringify({
  id: 'debug-query',
  type: 'query',
  payload: {text: 'debug test'}
}));
```

## Emergency Recovery

### Complete reset

**WARNING: This will delete all data**

```bash
# Stop the application
pkill -f "backend.src.main"

# Remove all data
rm -rf ~/.config/DesktopAssistant/

# Clean Python cache
find . -name "__pycache__" -type d -exec rm -rf {} +

# Restart fresh
python -m backend.src.main
```

### Quick health check script

```bash
#!/bin/bash
# health_check.sh

echo "=== Health Check ==="

# Check if running
if pgrep -f "backend.src.main" > /dev/null; then
    echo "✓ Application is running"
else
    echo "✗ Application is not running"
    exit 1
fi

# Check port
if lsof -Pi :8765 -sTCP:LISTEN -t >/dev/null; then
    echo "✓ Port 8765 is listening"
else
    echo "✗ Port 8765 is not listening"
    exit 1
fi

# Check health endpoint
if curl -s http://localhost:8765/health > /dev/null; then
    echo "✓ Health endpoint responds"
else
    echo "✗ Health endpoint not responding"
    exit 1
fi

# Check database
if sqlite3 ~/.config/DesktopAssistant/assistant.db "SELECT 1;" >/dev/null 2>&1; then
    echo "✓ Database accessible"
else
    echo "✗ Database not accessible"
fi

echo "=== Health check complete ==="
```

## Getting Help

### Log Analysis
```bash
# Extract error patterns
grep -h "ERROR\|CRITICAL" assistant.log | sort | uniq -c | sort -nr

# Find recent errors
grep -A 5 -B 5 "ERROR" assistant.log | tail -50
```

### System Information
```bash
# Collect system info for bug reports
echo "=== System Information ==="
uname -a
python --version
pip list | grep -E "(fastapi|uvicorn|openai|anthropic)"
free -h
df -h
ps aux | grep python
```

### Community Support
1. Check existing issues on GitHub
2. Review the [full troubleshooting guide](troubleshooting.md)
3. Search the [developer guide](DEVELOPER_GUIDE.md) for relevant sections
4. Check [API reference](api_reference.md) for correct usage

## Prevention

### Regular Maintenance
- Monitor error rates (< 5%)
- Keep dependencies updated
- Regular backup of database
- Monitor resource usage

### Best Practices
- Always test configuration changes
- Use virtual environments
- Keep API keys secure
- Monitor application logs
- Regular code reviews

---

**Remember**: When reporting issues, include:
- Error messages and stack traces
- Steps to reproduce
- System information
- Recent log entries
- Configuration (without sensitive data)
