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
   python --version  # Should be 3.9+
   ```

#### Import Errors

**Symptoms**:
- `ModuleNotFoundError`
- Import path errors

**Solutions**:
1. **Run from Correct Directory**:
   ```bash
   cd backend
   python -m backend.src.main
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

3. **Check Config File**:
   - Verify API key in config file
   - Check config file location

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

3. **Check Node Version**:
   ```bash
   node --version  # Should be 18+
   ```

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
   - Should be `ws://127.0.0.1:8765/ws`
   - Verify no firewall blocking

3. **Check Browser Console**:
   - Open DevTools (Ctrl+Shift+I)
   - Look for WebSocket errors

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
   rm -rf ~/.config/DesktopAssistant/Cache
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

2. **Check Python Sidecar**:
   - Verify Python sidecar running
   - Check sidecar logs

3. **Check Permissions**:
   - Verify tool has permissions
   - Check resource limits

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
   - Verify memory enabled in config
   - Check memory settings

2. **Check Database**:
   - Verify database accessible
   - Check database permissions

3. **Check Embeddings**:
   - Verify embeddings model loaded
   - Check GPU/CPU availability

#### Slow Memory Search

**Symptoms**:
- Slow search performance
- High CPU usage
- Timeout errors

**Solutions**:
1. **Enable GPU**:
   - Use CUDA for embeddings
   - Check GPU availability

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
   - Enable response caching
   - Check cache settings

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
python -m backend.src.main
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
- [Installation Guide](INSTALLATION.md)
- [Configuration Guide](CONFIGURATION.md)
- [Developer Guide](DEVELOPER_GUIDE.md)
