---
summary: "Troubleshooting Guide"
read_when:
  - When diagnosing runtime issues.
---

# Troubleshooting Guide

## Common Issues

### Backend Issues

#### Backend Won't Start

**Symptoms**:
- Backend fails to start
- Error messages in console
- Port already in use

**Solutions**:
1. **Check Port Availability**:
   ```bash
   # Windows
   netstat -ano | findstr :8765
   
   # macOS/Linux
   lsof -i :8765
   ```

2. **Kill Existing Process**:
   ```bash
   # Windows
   taskkill /PID <pid> /F
   
   # macOS/Linux
   kill -9 <pid>
   ```

3. **Check Dependencies**:
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

4. **Check Python Version**:
   ```bash
   python --version  # Should be 3.11
   ```

#### Import Errors

**Symptoms**:
- `ModuleNotFoundError`
- Import path errors

**Solutions**:
1. **Run from Correct Directory**:
   ```bash
   cd /path/to/WindieOS
   <windie> start backend
   ```

2. **Check PYTHONPATH**:
   ```bash
   export PYTHONPATH="${PYTHONPATH}:$(pwd)"
   ```

3. **Reinstall Dependencies**:
   ```bash
   pip install -r requirements.txt --force-reinstall
   ```

#### API Key Issues

**Symptoms**:
- Authentication errors
- API key not found

**Solutions**:
1. **Check Environment Variable**:
   ```bash
   # Windows
   echo %OPENAI_API_KEY%
   
   # macOS/Linux
   echo $OPENAI_API_KEY
   ```

2. **Set Environment Variable**:
   ```bash
   # Windows
   $env:OPENAI_API_KEY = "your-key"
   
   # macOS/Linux
   export OPENAI_API_KEY="your-key"
   ```

3. **Check Backend Config**:
   - Verify `backend/src/core/config/app_config.py` uses the provider you expect
   - Confirm the provider’s API key environment variable is set (see `backend/src/core/config/models.py`)

### Frontend Issues

#### Frontend Won't Start

**Symptoms**:
- npm install fails
- Electron won't launch
- Build errors

**Solutions**:
1. **Clear npm Cache**:
   ```bash
   npm cache clean --force
   ```

2. **Reinstall Dependencies**:
   ```bash
   cd frontend
   rm -rf node_modules
   npm install
   ```
   
   Windows PowerShell:
   ```powershell
   cd frontend
   Remove-Item -Recurse -Force .\node_modules
   npm install
   ```

3. **Check Node Version**:
   ```bash
   node --version  # Should be 18+
   ```

4. **Cross-OS Electron payload mismatch**:
   - Symptom: `npm run electron` fails with `spawn ...\frontend\node_modules\electron\dist\electron ENOENT` on Windows.
   - Cause: `frontend/node_modules/electron` was installed on Linux/macOS, so the package contains `dist/electron` and `.so` files instead of `electron.exe`.
   - Fix: delete `frontend/node_modules` on Windows and run `npm install` again in `frontend`.

5. **Docs listing fails from the wrong working directory**:
   - Cause: `<windie> docs list` must run from the repository root.
   - Fix: `cd` to the WindieOS checkout and rerun `<windie> docs list`.

#### Electron Sandbox Error (Linux)

**Symptoms**:
- `FATAL:setuid_sandbox_host.cc` or `zygote_host_impl_linux.cc` errors

**Solutions**:
1. **Disable Electron sandbox (local dev)**:
   ```bash
   ELECTRON_DISABLE_SANDBOX=1 <windie> start desktop
   ```
2. **Set chrome-sandbox permissions** (system-specific; may require root):
   - Ensure `node_modules/electron/dist/chrome-sandbox` is owned by root and mode `4755`

#### Connection Issues

**Symptoms**:
- "Disconnected" status in UI
- Messages not sending
- WebSocket errors

**Solutions**:
1. **Check Backend Running**:
   - Verify backend is running
   - Check backend logs

2. **Check WebSocket URL**:
   - Dev/source and packaged defaults use `wss://api.windieos.com/ws`
   - Local backend origins are explicit; the app does not silently switch to `ws://127.0.0.1:8765/ws` when the hosted socket fails
   - For remote backend, set Electron env vars before launch:
     - `BACKEND_HOST=<backend-ip>` (and optional `BACKEND_PORT`)
     - or `BACKEND_HTTP_URL` / `BACKEND_WS_URL`
   - Verify no firewall blocking

3. **Check Browser Console**:
   - Open DevTools (Ctrl+Shift+I)
   - Look for WebSocket errors

#### Hosted Auth Issues (Planned)

**Symptoms**:
- Login loop
- `auth-required` responses
- Session expires unexpectedly

**Solutions**:
1. **Re-authenticate** and verify device session.
2. **Clear stored tokens** in OS keychain and log in again.
3. **Check system clock** for time skew (JWT validation).

#### Usage Limit Reached (Planned)

**Symptoms**:
- `limit-reached` response
- Messages blocked with upgrade prompt

**Solutions**:
1. **Wait for reset window** (monthly/daily).
2. **Upgrade plan** to increase limits.
3. **Switch to local-only mode** (if supported).

#### UI Not Updating

**Symptoms**:
- Messages not appearing
- Settings not saving
- Stale data

**Solutions**:
1. **Refresh Application**:
   - Close and reopen Electron
   - Restart dev server

2. **Clear Cache**:
   ```bash
   # Clear Electron cache
   rm -rf ~/.config/windieos/Cache
   ```

3. **Check React DevTools**:
   - Verify component updates
   - Check state changes

### Tool Execution Issues

#### Tools Not Executing

**Symptoms**:
- Tool calls not working
- Execution errors
- Timeout errors

**Solutions**:
1. **Check Tool Registration**:
   - Verify tool is registered
   - Check tool name matches

2. **Check Local-Runtime Python**:
   - Verify local-runtime Python is running
   - Check local-runtime Python logs

3. **Check Permissions**:
   - Local-runtime tools are not permission-gated by default
   - Check OS-level permissions (screen recording, accessibility)

#### Screenshot Issues

**Symptoms**:
- Screenshots not capturing
- Screenshot errors
- Missing screenshots

**Solutions**:
1. **Check Permissions**:
   - macOS: Screen recording permission
   - Windows: No special permissions needed
   - Linux: X11 permissions

2. **Check pyautogui**:
   ```bash
   pip install pyautogui
   ```

3. **Check Display**:
   - Verify display is accessible
   - Check multi-monitor setup

### LLM Issues

#### LLM Not Responding

**Symptoms**:
- No response from LLM
- Timeout errors
- API errors

**Solutions**:
1. **Check API Key**:
   - Verify API key is valid
   - Check API key permissions

2. **Check Model Availability**:
   - Verify model exists
   - Check model access

3. **Check Network**:
   - Verify internet connection
   - Check firewall settings

4. **Check Rate Limits**:
   - Verify not rate limited
   - Check API usage

#### Local Provider Discovery Warnings

**Symptoms**:
- Backend logs warnings like:
  - `Error listing Ollama models: All connection attempts failed`
  - `Error listing LM Studio models: All connection attempts failed`

**What It Means**:
- Expected when Ollama/LM Studio are not running locally.
- Not fatal if you are using a cloud provider (OpenAI, Anthropic, Kimi, etc.).

**When to Act**:
1. If you need local models, start Ollama/LM Studio and verify they are reachable.
2. If you do not use local models, you can ignore these warnings.

#### Streaming Issues

**Symptoms**:
- Streaming not working
- Chunks missing
- Incomplete responses

**Solutions**:
1. **Check WebSocket Connection**:
   - Verify connection stable
   - Check for disconnects

2. **Check Buffer Size**:
   - Increase buffer if needed
   - Check message size limits

3. **Check Network**:
   - Verify stable connection
   - Check for packet loss

### Memory Issues

#### Memory Not Working

**Symptoms**:
- Memories not saving
- Search not working
- Memory errors

**Solutions**:
1. **Check Memory Enabled**:
   - Backend embedding API depends on `memory_enabled` in `backend/src/core/config/app_config.py`
   - If disabled, `/api/embeddings` returns 503 and memory search/store will fail

2. **Check Database**:
   - Verify the local-runtime memory directory exists and is writable:
     `~/.config/windieos/memory/` (Linux),
     `~/Library/Application Support/windieos/memory/` (macOS),
     `%APPDATA%/windieos/memory/` (Windows)

3. **Check Embeddings**:
   - Verify the backend is running and `/api/embeddings/health` is healthy
   - If you don’t have CUDA, set `device="cpu"` in `backend/src/core/container/factories.py`

#### Continue Conversation Fails on Missing Screenshot Artifact

**Symptoms**:
- Error during resume/rehydrate mentioning unresolved `screenshot_ref` or "Artifact not found".

**Current Behavior**:
- Backend now logs a warning and continues rehydrate with text-only entries when a screenshot artifact is missing.
- Conversation resume should continue instead of failing the whole restore.

**If You Still See Hard Failures**:
1. Ensure backend includes current rehydrate artifact handling in `backend/src/api/services/rehydrate_execution.py`.
2. Restart backend after pulling latest changes.

#### Slow Memory Search

**Symptoms**:
- Slow search performance
- High CPU usage
- Timeout errors

**Solutions**:
1. **Check Embedding Provider**:
   - Embedding generation time affects overall memory latency
   - Ensure `/api/embeddings` is healthy and not erroring

2. **Optimize Index**:
   - Rebuild FAISS index
   - Check index size

3. **Reduce Search Scope**:
   - Limit search results
   - Use filters

### Performance Issues

#### Slow Response Times

**Symptoms**:
- Slow LLM responses
- High latency
- Timeout errors

**Solutions**:
1. **Check Model**:
   - Use faster model
   - Check model performance

2. **Enable Caching**:
   - Embedding/tool schema caches are enabled by default
   - Verify cache isn’t being cleared between requests

3. **Optimize Prompts**:
   - Reduce prompt size
   - Simplify prompts

#### High Memory Usage

**Symptoms**:
- High RAM usage
- Memory warnings
- System slowdown

**Solutions**:
1. **Reduce Cache Size**:
   - Lower cache limits
   - Clear cache periodically

2. **Limit History**:
   - Reduce history length
   - Clean old memories

3. **Optimize Embeddings**:
   - Use smaller model
   - Reduce batch size

## Getting Help

### Logs

**Backend Logs**:
- Check console output
- Look for error messages
- Check log files

**Frontend Logs**:
- Check browser console
- Check Electron DevTools
- Look for error messages

### Debug Mode

**Enable Debug Logging**:
```bash
export DESKTOP_ASSISTANT_LOG_LEVEL=DEBUG
<windie> start backend
```

### Common Error Messages

**"Connection refused"**:
- Backend not running
- Wrong port
- Firewall blocking

**"Module not found"**:
- Missing dependency
- Wrong Python path
- Virtual environment not activated

**"API key invalid"**:
- Wrong API key
- Expired key
- Key not set

**"Tool execution failed"**:
- Tool error
- Permission issue
- Resource limit

## Reporting Issues

When reporting issues, include:

1. **System Information**:
   - OS version
   - Python version
   - Node.js version

2. **Error Messages**:
   - Full error text
   - Stack traces
   - Log output

3. **Steps to Reproduce**:
   - Detailed steps
   - Expected behavior
   - Actual behavior

4. **Configuration**:
   - Config file (sanitized)
   - Environment variables (sanitized)
   - Settings

---

For more help, see:
- [Installation Guide](installation.md)
- Configuration Guide (private backend docs)
- [Developer Guide](../development/developer_guide.md)
