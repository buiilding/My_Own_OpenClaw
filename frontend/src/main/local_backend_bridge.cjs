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
const { resolveBackendEndpoints } = require('./backend_endpoints.cjs');
const {
  firstExistingPath,
  getBundledPythonExecutableCandidates,
  resolvePythonScriptPath,
} = require('./runtime_paths.cjs');

let pythonProcess = null;
let isPythonReady = false;
let pendingRequests = new Map();
let stdoutBuffer = '';
let readinessCheckCallback = null;
let readinessCheckToken = 0;
const SUPPRESSED_STDERR_PATTERNS = [
  '[DEP0169] DeprecationWarning: `url.parse()`',
  'Use `node --trace-deprecation ...` to show where the warning was created',
];

// Cache Python path to avoid repeated file system checks
let cachedPythonPath = null;

function getReadinessRetryDelay(attempt) {
  return Math.min(50 * Math.pow(2, attempt - 1), 1000);
}

function scheduleReadinessRetry(mainWindow, attempt, maxAttempts, checkToken) {
  if (attempt < maxAttempts) {
    const delay = getReadinessRetryDelay(attempt);
    setTimeout(() => {
      if (typeof checkToken === 'number' && checkToken !== readinessCheckToken) {
        return;
      }
      checkReadiness(mainWindow, attempt + 1, maxAttempts);
    }, delay);
    return true;
  }
  return false;
}

function markBackendReady(mainWindow) {
  isPythonReady = true;
  mainWindow?.webContents.send('local-backend-status', { ready: true });
}

function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function toErrorResponse(error) {
  return {
    success: false,
    error: getErrorMessage(error),
  };
}

function getPayloadObject(payload = {}) {
  if (payload && typeof payload === 'object') {
    return payload;
  }
  return {};
}

function createPayloadMapper(fieldMap) {
  const compiledMappings = Object.entries(fieldMap).map(([targetKey, mapping]) => {
    if (typeof mapping === 'function') {
      return {
        targetKey,
        mapperType: 'function',
        mapping,
      };
    }
    if (Array.isArray(mapping)) {
      return {
        targetKey,
        mapperType: 'fallback',
        sourceKeys: mapping,
      };
    }
    return {
      targetKey,
      mapperType: 'direct',
      sourceKey: mapping,
    };
  });

  return (payload) => {
    const source = getPayloadObject(payload);
    const mapped = {};

    for (const compiled of compiledMappings) {
      if (compiled.mapperType === 'function') {
        mapped[compiled.targetKey] = compiled.mapping(source);
        continue;
      }
      if (compiled.mapperType === 'fallback') {
        let resolved;
        for (const sourceKey of compiled.sourceKeys) {
          if (source[sourceKey] !== undefined) {
            resolved = source[sourceKey];
            break;
          }
        }
        mapped[compiled.targetKey] = resolved;
        continue;
      }
      mapped[compiled.targetKey] = source[compiled.sourceKey];
    }

    return mapped;
  };
}

function registerMappedRpcHandlers(registerRpcHandler, definitions) {
  for (const { channel, method, mapParams } of definitions) {
    registerRpcHandler(channel, method, mapParams);
  }
}

const mapSearchMemoryPayload = createPayloadMapper({
  query: 'query',
  user_id: 'user_id',
  limit: 'limit',
  memory_type: 'memory_type',
  exclude_conversation_id: ['excludeConversationId', 'exclude_conversation_id'],
});

const COMPILED_RPC_HANDLER_DEFINITIONS = [
  {
    channel: 'list-conversations',
    method: 'list_conversations',
    mapParams: createPayloadMapper({
      user_id: 'userId',
      limit: 'limit',
      record_kind: 'recordKind',
    }),
  },
  {
    channel: 'get-conversation',
    method: 'get_conversation',
    mapParams: createPayloadMapper({
      user_id: 'userId',
      conversation_id: ({ conversationId }) => conversationId ?? null,
      limit: 'limit',
      record_kind: 'recordKind',
    }),
  },
  {
    channel: 'list-semantic-memories',
    method: 'list_semantic_memories',
    mapParams: createPayloadMapper({
      user_id: 'userId',
      limit: 'limit',
    }),
  },
  {
    channel: 'delete-conversation',
    method: 'delete_conversation',
    mapParams: createPayloadMapper({
      user_id: 'userId',
      conversation_id: ({ conversationId }) => conversationId ?? null,
      record_kind: 'recordKind',
    }),
  },
  {
    channel: 'delete-semantic-memory',
    method: 'delete_semantic_memory',
    mapParams: createPayloadMapper({
      user_id: 'userId',
      memory_id: 'memoryId',
    }),
  },
  {
    channel: 'store-memory',
    method: 'store_memory',
    mapParams: createPayloadMapper({
      user_query: 'userQuery',
      assistant_response: 'assistantResponse',
      memory_type: 'memoryType',
      user_id: 'userId',
      session_id: 'sessionId',
    }),
  },
  {
    channel: 'store-transcript',
    method: 'store_transcript',
    mapParams: createPayloadMapper({
      content: 'content',
      user_id: 'userId',
      conversation_ref: 'conversationRef',
      role: 'role',
      message_type: 'messageType',
      tool_name: 'toolName',
      correlation_id: 'correlationId',
      message_index: 'messageIndex',
      model_id: 'modelId',
      model_provider: 'modelProvider',
      screenshot: 'screenshot',
      timestamp: 'timestamp',
    }),
  },
];

function rejectPendingRequests(reason) {
  const pendingEntries = Array.from(pendingRequests.entries());
  for (const [requestId, pending] of pendingEntries) {
    clearTimeout(pending.timeout);
    pendingRequests.delete(requestId);
    pending.reject(new Error(reason));
  }
}

function resetBackendProcessState(reason) {
  pythonProcess = null;
  isPythonReady = false;
  readinessCheckCallback = null;
  readinessCheckToken += 1;
  rejectPendingRequests(reason);
  stdoutBuffer = '';
}

function notifyBackendUnavailable(mainWindow, error) {
  if (!error) {
    return;
  }
  mainWindow?.webContents.send('local-backend-status', {
    ready: false,
    error,
  });
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

  const explicitPythonPath = process.env.WINDIE_PYTHON_PATH;
  if (explicitPythonPath && fs.existsSync(explicitPythonPath)) {
    cachedPythonPath = explicitPythonPath;
    return cachedPythonPath;
  }

  const bundledPython = firstExistingPath(getBundledPythonExecutableCandidates());
  if (bundledPython) {
    cachedPythonPath = bundledPython;
    return cachedPythonPath;
  }
  
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

function withLocalBackendNodeOptions(baseEnv) {
  const env = { ...baseEnv };
  const nodeOptions = (env.NODE_OPTIONS || '').trim();

  if (nodeOptions.includes('--no-deprecation')) {
    return env;
  }

  env.NODE_OPTIONS = nodeOptions
    ? `${nodeOptions} --no-deprecation`
    : '--no-deprecation';
  return env;
}

/**
 * Check if Python backend is ready by sending ping
 * Retries with exponential backoff until ready or max attempts
 */
function checkReadiness(mainWindow, attempt = 1, maxAttempts = 10) {
  if (!pythonProcess) {
    return;
  }
  const checkToken = ++readinessCheckToken;

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
    scheduleReadinessRetry(mainWindow, attempt, maxAttempts, checkToken);
    return;
  }

  // Store callback to handle ping response
  readinessCheckCallback = (response) => {
    if (checkToken !== readinessCheckToken) {
      return;
    }
    if (response.id === requestId) {
      readinessCheckCallback = null;
      
      if (response.result && response.result.status === 'ok') {
        // Only log in development
        if (process.env.NODE_ENV !== 'production') {
          console.log('[LocalBackend] Python service ready (verified via ping)');
        }
        markBackendReady(mainWindow);
      } else {
        // Retry if ping failed
        if (!scheduleReadinessRetry(mainWindow, attempt, maxAttempts, checkToken)) {
          // Max attempts reached, mark as ready anyway to avoid blocking
          console.warn('[LocalBackend] Backend readiness check failed after max attempts, marking as ready');
          markBackendReady(mainWindow);
        }
      }
    }
  };

  // Set timeout for readiness check
  setTimeout(() => {
    if (checkToken !== readinessCheckToken) {
      return;
    }
    if (readinessCheckCallback) {
      readinessCheckCallback = null;
      // Ping timed out, retry if attempts remain
      if (!scheduleReadinessRetry(mainWindow, attempt, maxAttempts, checkToken)) {
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
  const scriptPath = resolvePythonScriptPath('local_backend.py');

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

  const backendEndpoints = resolveBackendEndpoints();

  pythonProcess = spawn(pythonPath, [scriptPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: path.dirname(scriptPath),
    env: withLocalBackendNodeOptions({
      ...process.env,
      PYTHONUNBUFFERED: '1',
      WINDIE_BACKEND_HTTP_URL: backendEndpoints.httpUrl,
    }),
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
        if (SUPPRESSED_STDERR_PATTERNS.some((pattern) => line.includes(pattern))) {
          continue;
        }
        console.log(`[LocalBackend Python] ${line}`);
      }
    }
  });

  // Handle process exit
  pythonProcess.on('exit', (code, signal) => {
    console.log(`[LocalBackend] Python process exited with code ${code}, signal ${signal}`);
    resetBackendProcessState('Local backend process exited');
    const exitError = code !== 0 && code !== null
      ? `Python process exited with code ${code}`
      : null;
    notifyBackendUnavailable(mainWindow, exitError);
  });

  // Handle process errors
  pythonProcess.on('error', (error) => {
    console.error('[LocalBackend] Failed to start Python process:', error);
    resetBackendProcessState('Local backend process error');

    let errorMessage = error.message;
    if (error.code === 'ENOENT') {
      errorMessage = `Python executable '${pythonPath}' not found. Please install Python 3 or ensure it is in your PATH.`;
    }

    notifyBackendUnavailable(mainWindow, errorMessage);
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
function sendRequest(method, params = {}, options = {}) {
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
    const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 30000;
    // Set timeout
    const timeout = setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        reject(new Error('Request timed out'));
      }
    }, timeoutMs);

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

async function sendRequestOrError(method, params = {}, options = {}) {
  try {
    return await sendRequest(method, params, options);
  } catch (error) {
    return toErrorResponse(error);
  }
}

async function getSystemStateFromBackend(fields) {
  const params = fields ? { fields } : {};
  try {
    const result = await sendRequest('get_system_state', params);
    if (result.success === false) {
      return null;
    }
    return result.data || result;
  } catch (error) {
    console.error(`[LocalBackend] System state request failed: ${getErrorMessage(error)}`);
    return null;
  }
}

async function sendMemorySearchRequest(payload = {}) {
  return sendRequestOrError(
    'search_memory',
    mapSearchMemoryPayload(payload),
  );
}

/**
 * Stop the Python local backend service
 */
function stopLocalBackend() {
  if (pythonProcess) {
    const processToStop = pythonProcess;
    console.log('[LocalBackend] Stopping Python process...');
    processToStop.kill('SIGTERM');

    // Force kill if still running after 5 seconds
    setTimeout(() => {
      if (pythonProcess && pythonProcess === processToStop) {
        console.log('[LocalBackend] Force killing Python process');
        processToStop.kill('SIGKILL');
      }
    }, 5000);
  }
}

/**
 * Initialize IPC handlers for local backend communication
 */
function initializeLocalBackendBridge(getWindows) {
  const resolveWindowProvider = () => {
    if (typeof getWindows === 'function') {
      return getWindows;
    }
    if (getWindows && typeof getWindows === 'object') {
      if ('mainWindow' in getWindows || 'chatWindow' in getWindows) {
        return () => getWindows;
      }
      return () => ({ mainWindow: getWindows, chatWindow: null });
    }
    return () => ({});
  };
  const getWindowState = resolveWindowProvider();

  const resolveWindows = () => {
    const result = getWindowState();
    if (result && typeof result === 'object') {
      const { mainWindow, chatWindow, responseWindow } = result;
      return [mainWindow, chatWindow, responseWindow].filter(Boolean);
    }
    return [];
  };
  const resolveChatWindow = () => {
    const result = getWindowState();
    if (result && typeof result === 'object') {
      return result.chatWindow || null;
    }
    return null;
  };
  const resolveResponseWindow = () => {
    const result = getWindowState();
    if (result && typeof result === 'object') {
      return result.responseWindow || null;
    }
    return null;
  };

  const [mainWindow] = resolveWindows();
  startLocalBackend(mainWindow);

  const registerRpcHandler = (channel, method, mapParams) => {
    ipcMain.handle(channel, async (event, payload = {}) => (
      sendRequestOrError(
        method,
        mapParams(payload || {}),
      )
    ));
  };

  async function withHiddenWindowForScreenshot(task) {
    if (process.platform !== 'linux') {
      return task();
    }
    const windows = resolveWindows().filter((win) => win && !win.isDestroyed());
    const chatWindow = resolveChatWindow();
    const responseWindow = resolveResponseWindow();
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
    await new Promise((resolve) => setTimeout(resolve, 320));

    try {
      return await task();
    } finally {
      for (const state of windowStates) {
        if (state.wasVisible && !state.wasMinimized && !state.win.isDestroyed()) {
          const isOverlayWindow = (
            (chatWindow && state.win === chatWindow)
            || (responseWindow && state.win === responseWindow)
          );
          if (isOverlayWindow && typeof state.win.showInactive === 'function') {
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
          if (isOverlayWindow) {
            try {
              state.win.setAlwaysOnTop(true, 'floating');
              if (typeof state.win.moveTop === 'function') {
                state.win.moveTop();
              }
            } catch (error) {
              console.warn('[LocalBackend] Failed to keep overlay on top:', error?.message || error);
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
      const timeoutMs = toolName === 'browser' ? 120000 : 30000;
      const runTool = () =>
        sendRequest('execute_tool', {
          tool_name: toolName,
          args: args,
        }, { timeoutMs });
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
      console.error(`[LocalBackend] Tool execution failed: ${getErrorMessage(error)}`);
      return {
        success: false,
        error: getErrorMessage(error)
      };
    }
  });

  // Handle system state requests
  ipcMain.handle('get-system-state', async (event, { fields } = {}) => {
    return getSystemStateFromBackend(fields);
  });

  // Handle memory search requests (integrated into local backend)
  ipcMain.handle('search-memory', async (event, payload = {}) => (
    sendMemorySearchRequest(payload)
  ));

  registerMappedRpcHandlers(registerRpcHandler, COMPILED_RPC_HANDLER_DEFINITIONS);

  // Only log initialization in development
  if (process.env.NODE_ENV !== 'production') {
    console.log('[LocalBackend] Local backend bridge initialized');
  }
}

/**
 * Helper function to get system state (for use in ipc.cjs)
 */
async function getSystemState(fields = null) {
  return getSystemStateFromBackend(fields);
}

/**
 * Helper function to search memory (for use in ipc.cjs)
 */
async function searchMemory(
  query,
  user_id,
  limit,
  memory_type,
  exclude_conversation_id,
) {
  return sendMemorySearchRequest({
    query,
    user_id,
    limit,
    memory_type,
    exclude_conversation_id,
  });
}

module.exports = {
  initializeLocalBackendBridge,
  stopLocalBackend,
  getSystemState,
  searchMemory,
};
