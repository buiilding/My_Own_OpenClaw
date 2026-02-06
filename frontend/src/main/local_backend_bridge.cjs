/**
 * Local Backend Bridge - Electron IPC bridge for Python local backend
 * 
 * Spawns Python local backend subprocess and handles JSON-RPC protocol
 * communication between Electron main process and Python backend.
 */

const { spawn } = require('child_process');
const path = require('path');
const { ipcMain } = require('electron');
const { v4: uuidv4 } = require('uuid');

let pythonProcess = null;
let isPythonReady = false;
let pendingRequests = new Map();
let stdoutBuffer = '';
let readinessCheckCallback = null;

// Cache Python path to avoid repeated file system checks
let cachedPythonPath = null;

function getReadinessRetryDelay(attempt) {
  return Math.min(50 * Math.pow(2, attempt - 1), 1000);
}

function scheduleReadinessRetry(mainWindow, attempt, maxAttempts) {
  if (attempt < maxAttempts) {
    const delay = getReadinessRetryDelay(attempt);
    setTimeout(() => checkReadiness(mainWindow, attempt + 1, maxAttempts), delay);
    return true;
  }
  return false;
}

function markBackendReady(mainWindow) {
  isPythonReady = true;
  mainWindow?.webContents.send('local-backend-status', { ready: true });
}

/**
 * Get Python executable path (cached after first lookup)
 */
function getPythonPath() {
  // Return cached path if available
  if (cachedPythonPath !== null) {
    return cachedPythonPath;
  }

  const fs = require('fs');
  
  // Check conda environment first (common on Windows)
  const condaPrefix = process.env.CONDA_PREFIX;
  if (condaPrefix) {
    const condaPython = process.platform === 'win32'
      ? path.join(condaPrefix, 'python.exe')
      : path.join(condaPrefix, 'bin', 'python3');
    
    if (fs.existsSync(condaPython)) {
      cachedPythonPath = condaPython;
      return cachedPythonPath;
    }
  }
  
  // Try common Python paths (no file check needed - will fail at spawn if invalid)
  cachedPythonPath = process.platform === 'win32' ? 'py' : 'python3';
  return cachedPythonPath;
}

/**
 * Check if Python backend is ready by sending ping
 * Retries with exponential backoff until ready or max attempts
 */
function checkReadiness(mainWindow, attempt = 1, maxAttempts = 10) {
  if (!pythonProcess) {
    return;
  }

  // Send ping request to check if backend is ready
  // Use a special marker ID that won't conflict with normal requests
  const requestId = `__readiness_check_${attempt}__`;
  const request = {
    jsonrpc: '2.0',
    id: requestId,
    method: 'ping',
    params: {},
  };

  try {
    const jsonStr = JSON.stringify(request);
    pythonProcess.stdin.write(jsonStr + '\n');
  } catch (error) {
    console.error('[LocalBackend] Failed to send ping:', error);
    scheduleReadinessRetry(mainWindow, attempt, maxAttempts);
    return;
  }

  // Store callback to handle ping response
  readinessCheckCallback = (response) => {
    if (response.id === requestId) {
      readinessCheckCallback = null;
      
              if (response.result && response.result.status === 'ok') {
                isPythonReady = true;
                // Only log in development
                if (process.env.NODE_ENV !== 'production') {
                  console.log('[LocalBackend] Python service ready (verified via ping)');
                }
                mainWindow?.webContents.send('local-backend-status', { ready: true });
      } else {
        // Retry if ping failed
        if (!scheduleReadinessRetry(mainWindow, attempt, maxAttempts)) {
          // Max attempts reached, mark as ready anyway to avoid blocking
          console.warn('[LocalBackend] Backend readiness check failed after max attempts, marking as ready');
          markBackendReady(mainWindow);
        }
      }
    }
  };

  // Set timeout for readiness check
  setTimeout(() => {
    if (readinessCheckCallback) {
      readinessCheckCallback = null;
      // Ping timed out, retry if attempts remain
      if (!scheduleReadinessRetry(mainWindow, attempt, maxAttempts)) {
        console.warn('[LocalBackend] Backend readiness check timed out after max attempts');
        // Mark as ready anyway to avoid blocking forever
        markBackendReady(mainWindow);
      }
    }
  }, 500);
}

/**
 * Start Python local backend service
 */
function startLocalBackend(mainWindow) {
  if (pythonProcess) {
    console.log('[LocalBackend] Service already running');
    return;
  }

  const pythonPath = getPythonPath();
  const scriptPath = path.join(__dirname, 'python', 'local_backend.py');

  // Verify script exists (only check once - script location is static)
  const fs = require('fs');
  if (!fs.existsSync(scriptPath)) {
    // Only log error - don't block startup with console.error in production
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[LocalBackend] Script not found at: ${scriptPath}`);
    }
    mainWindow?.webContents.send('local-backend-status', { 
      ready: false, 
      error: `Local backend script not found: ${scriptPath}` 
    });
    return;
  }

  // Only log startup in development
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[LocalBackend] Starting Python local backend: ${pythonPath} ${scriptPath}`);
  }

  pythonProcess = spawn(pythonPath, [scriptPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: path.dirname(scriptPath),
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
    }
  });

  // Check readiness by sending ping request instead of arbitrary delay
  // This allows the frontend to start immediately while backend initializes
  checkReadiness(mainWindow);

  stdoutBuffer = '';

  // Handle stdout (JSON-RPC responses, one line per message)
  pythonProcess.stdout.on('data', (data) => {
    try {
      stdoutBuffer += data.toString();
      
      // Process complete lines
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() || ''; // Keep incomplete line

      for (const line of lines) {
        if (line.trim()) {
          try {
            const response = JSON.parse(line);
            handlePythonResponse(response);
          } catch (error) {
            console.error('[LocalBackend] Error parsing response:', error, 'Line:', line);
          }
        }
      }
    } catch (error) {
      console.error('[LocalBackend] Error processing stdout:', error);
    }
  });

  // Handle stderr (logs from Python)
  pythonProcess.stderr.on('data', (data) => {
    const text = data.toString();
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.trim()) {
        console.log(`[LocalBackend Python] ${line}`);
      }
    }
  });

  // Handle process exit
  pythonProcess.on('exit', (code, signal) => {
    console.log(`[LocalBackend] Python process exited with code ${code}, signal ${signal}`);
    pythonProcess = null;
    isPythonReady = false;
    pendingRequests.clear();
    stdoutBuffer = '';
    
    if (code !== 0 && code !== null) {
      mainWindow?.webContents.send('local-backend-status', { 
        ready: false,
        error: `Python process exited with code ${code}`
      });
    }
  });

  // Handle process errors
  pythonProcess.on('error', (error) => {
    console.error('[LocalBackend] Failed to start Python process:', error);
    pythonProcess = null;
    isPythonReady = false;
    pendingRequests.clear();
    stdoutBuffer = '';
    
    let errorMessage = error.message;
    if (error.code === 'ENOENT') {
      errorMessage = `Python executable '${pythonPath}' not found. Please install Python 3 or ensure it is in your PATH.`;
    }
    
    mainWindow?.webContents.send('local-backend-status', { 
      ready: false, 
      error: errorMessage 
    });
  });
}

/**
 * Handle responses from Python process
 */
function handlePythonResponse(response) {
  const requestId = response.id;
  
  // Check if this is a readiness check response
  if (readinessCheckCallback && requestId && requestId.startsWith('__readiness_check_')) {
    readinessCheckCallback(response);
    return;
  }
  
  if (requestId && pendingRequests.has(requestId)) {
    const { resolve, reject, timeout } = pendingRequests.get(requestId);
    clearTimeout(timeout);
    pendingRequests.delete(requestId);
    
    if (response.error) {
      reject(new Error(response.error.message || 'JSON-RPC error'));
    } else {
      resolve(response.result);
    }
  } else {
    console.warn('[LocalBackend] Received response for unknown request:', requestId);
  }
}

/**
 * Send JSON-RPC request to Python process
 */
function sendRequest(method, params = {}) {
  if (!pythonProcess || !isPythonReady) {
    throw new Error('Local backend not ready');
  }

  const requestId = uuidv4();
  const request = {
    jsonrpc: '2.0',
    id: requestId,
    method: method,
    params: params,
  };

  return new Promise((resolve, reject) => {
    // Set timeout (30 seconds)
    const timeout = setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        reject(new Error('Request timed out'));
      }
    }, 30000);

    pendingRequests.set(requestId, { resolve, reject, timeout });

    try {
      const jsonStr = JSON.stringify(request);
      pythonProcess.stdin.write(jsonStr + '\n');
    } catch (error) {
      clearTimeout(timeout);
      pendingRequests.delete(requestId);
      reject(error);
    }
  });
}

/**
 * Stop the Python local backend service
 */
function stopLocalBackend() {
  if (pythonProcess) {
    console.log('[LocalBackend] Stopping Python process...');
    pythonProcess.kill('SIGTERM');

    // Force kill if still running after 5 seconds
    setTimeout(() => {
      if (pythonProcess) {
        console.log('[LocalBackend] Force killing Python process');
        pythonProcess.kill('SIGKILL');
      }
    }, 5000);
  }
}

/**
 * Initialize IPC handlers for local backend communication
 */
function initializeLocalBackendBridge(getWindows) {
  const resolveWindows = () => {
    if (typeof getWindows === 'function') {
      const result = getWindows();
      if (result && typeof result === 'object') {
        const { mainWindow, chatWindow } = result;
        return [mainWindow, chatWindow].filter(Boolean);
      }
    }
    return [];
  };
  const resolveChatWindow = () => {
    if (typeof getWindows === 'function') {
      const result = getWindows();
      if (result && typeof result === 'object') {
        return result.chatWindow || null;
      }
    }
    return null;
  };

  const [mainWindow] = resolveWindows();
  startLocalBackend(mainWindow);

  async function withHiddenWindowForScreenshot(task) {
    if (process.platform !== 'linux') {
      return task();
    }
    const windows = resolveWindows().filter((win) => win && !win.isDestroyed());
    const chatWindow = resolveChatWindow();
    if (windows.length === 0) {
      return task();
    }

    const windowStates = windows.map((win) => ({
      win,
      wasVisible: win.isVisible(),
      wasFocused: win.isFocused(),
      wasMinimized: win.isMinimized(),
    }));
    const focusedWindow = windowStates.find((state) => state.wasFocused)?.win || null;

    for (const state of windowStates) {
      if (state.wasVisible && !state.wasMinimized) {
        state.win.hide();
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 120));

    try {
      return await task();
    } finally {
      for (const state of windowStates) {
        if (state.wasVisible && !state.wasMinimized && !state.win.isDestroyed()) {
          if (chatWindow && state.win === chatWindow && typeof state.win.showInactive === 'function') {
            state.win.showInactive();
          } else {
            state.win.show();
            if (
              chatWindow &&
              state.win === chatWindow &&
              !state.wasFocused &&
              typeof state.win.blur === 'function'
            ) {
              state.win.blur();
            }
          }
          if (chatWindow && state.win === chatWindow) {
            try {
              state.win.setAlwaysOnTop(true, 'floating');
              if (typeof state.win.moveTop === 'function') {
                state.win.moveTop();
              }
            } catch (error) {
              console.warn('[LocalBackend] Failed to keep chatbox on top:', error?.message || error);
            }
          }
        }
      }
      if (focusedWindow && !focusedWindow.isDestroyed()) {
        focusedWindow.focus();
      }
    }
  }

  // Handle tool execution requests
  ipcMain.handle('execute-tool', async (event, { toolName, args, skipAutoCapture = false }) => {
    try {
      const runTool = () =>
        sendRequest('execute_tool', {
          tool_name: toolName,
          args: args,
        });
      const result = toolName === 'screenshot'
        ? await withHiddenWindowForScreenshot(runTool)
        : await runTool();
      
      // Convert Python result format to expected format
      if (result.success === false) {
        return { success: false, error: result.error };
      }
      
      return {
        success: true,
        data: result.data || result,
      };
    } catch (error) {
      console.error(`[LocalBackend] Tool execution failed: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  });

  // Handle system state requests
  ipcMain.handle('get-system-state', async (event, { fields } = {}) => {
    try {
      const result = await sendRequest('get_system_state', { fields });
      
      if (result.success === false) {
        return null;
      }
      
      return result.data || result;
    } catch (error) {
      console.error(`[LocalBackend] System state request failed: ${error.message}`);
      return null;
    }
  });

  // Handle memory search requests (integrated into local backend)
  ipcMain.handle('search-memory', async (event, { query, user_id, limit, memory_type }) => {
    try {
      const result = await sendRequest('search_memory', {
        query: query,
        user_id: user_id,
        limit: limit,
        memory_type: memory_type,
      });
      
      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  });

  // Handle conversation list requests
  ipcMain.handle('list-conversations', async (event, { userId, limit, recordKind } = {}) => {
    try {
      const result = await sendRequest('list_conversations', {
        user_id: userId,
        limit: limit,
        record_kind: recordKind,
      });

      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  });

  // Handle conversation detail requests
  ipcMain.handle('get-conversation', async (event, { userId, conversationId, limit, recordKind } = {}) => {
    try {
      const result = await sendRequest('get_conversation', {
        user_id: userId,
        conversation_id: conversationId ?? null,
        limit: limit,
        record_kind: recordKind,
      });

      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  });

  // Handle memory storage requests
  ipcMain.handle('store-memory', async (event, { userQuery, assistantResponse, memoryType, userId, sessionId }) => {
    try {
      const result = await sendRequest('store_memory', {
        user_query: userQuery,
        assistant_response: assistantResponse,
        memory_type: memoryType,
        user_id: userId,
        session_id: sessionId,
      });
      
      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  });

  ipcMain.handle('store-transcript', async (event, { content, userId, sessionId, role, messageType, toolName, correlationId, messageIndex, modelId, modelProvider, timestamp } = {}) => {
    try {
      const result = await sendRequest('store_transcript', {
        content: content,
        user_id: userId,
        session_id: sessionId,
        role: role,
        message_type: messageType,
        tool_name: toolName,
        correlation_id: correlationId,
        message_index: messageIndex,
        model_id: modelId,
        model_provider: modelProvider,
        timestamp: timestamp,
      });

      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  });

  // Only log initialization in development
  if (process.env.NODE_ENV !== 'production') {
    console.log('[LocalBackend] Local backend bridge initialized');
  }
}

/**
 * Helper function to get system state (for use in ipc.cjs)
 */
async function getSystemState(fields = null) {
  try {
    const result = await sendRequest('get_system_state', fields ? { fields } : {});
    if (result.success === false) {
      return null;
    }
    return result.data || result;
  } catch (error) {
    console.error(`[LocalBackend] System state request failed: ${error.message}`);
    return null;
  }
}

/**
 * Helper function to search memory (for use in ipc.cjs)
 */
async function searchMemory(query, user_id, limit, memory_type) {
  try {
    const result = await sendRequest('search_memory', {
      query: query,
      user_id: user_id,
      limit: limit,
      memory_type: memory_type,
    });
    return result;
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  initializeLocalBackendBridge,
  stopLocalBackend,
  getSystemState,
  searchMemory,
};
