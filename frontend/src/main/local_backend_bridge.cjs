const { spawn } = require('child_process');
const path = require('path');
const { ipcMain } = require('electron');
const { v4: uuidv4 } = require('uuid');
const { resolveBackendEndpoints } = require('./backend_endpoints.cjs');
const {
  COMPILED_RPC_HANDLER_DEFINITIONS,
  mapSearchMemoryPayload,
  registerMappedRpcHandlers,
} = require('./local_backend_bridge_rpc_mappers.cjs');
const {
  createWindowResolvers,
  withHiddenWindowForScreenshot,
} = require('./local_backend_bridge_windows.cjs');
const {
  getErrorMessage,
  shouldSuppressStderrLine,
  toErrorResponse,
  withLocalBackendNodeOptions,
} = require('./local_backend_bridge_utils.cjs');
const {
  resolvePythonExecutablePath,
  resolvePythonScriptPath,
} = require('./runtime_paths.cjs');

let pythonProcess = null;
let isPythonReady = false;
let pendingRequests = new Map();
let stdoutBuffer = '';
let readinessCheckCallback = null;
let readinessCheckToken = 0;

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

function getPythonPath() {
  if (cachedPythonPath !== null) {
    return cachedPythonPath;
  }

  cachedPythonPath = resolvePythonExecutablePath();
  return cachedPythonPath;
}

function checkReadiness(mainWindow, attempt = 1, maxAttempts = 10) {
  if (!pythonProcess) {
    return;
  }
  const checkToken = ++readinessCheckToken;

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

  readinessCheckCallback = (response) => {
    if (checkToken !== readinessCheckToken) {
      return;
    }
    if (response.id === requestId) {
      readinessCheckCallback = null;
      
      if (response.result && response.result.status === 'ok') {
        if (process.env.NODE_ENV !== 'production') {
          console.log('[LocalBackend] Python service ready (verified via ping)');
        }
        markBackendReady(mainWindow);
      } else {
        if (!scheduleReadinessRetry(mainWindow, attempt, maxAttempts, checkToken)) {
          console.warn('[LocalBackend] Backend readiness check failed after max attempts, marking as ready');
          markBackendReady(mainWindow);
        }
      }
    }
  };

  setTimeout(() => {
    if (checkToken !== readinessCheckToken) {
      return;
    }
    if (readinessCheckCallback) {
      readinessCheckCallback = null;
      if (!scheduleReadinessRetry(mainWindow, attempt, maxAttempts, checkToken)) {
        console.warn('[LocalBackend] Backend readiness check timed out after max attempts');
        markBackendReady(mainWindow);
      }
    }
  }, 500);
}

function startLocalBackend(mainWindow) {
  if (pythonProcess) {
    console.log('[LocalBackend] Service already running');
    return;
  }

  const pythonPath = getPythonPath();
  const scriptPath = resolvePythonScriptPath('local_backend.py');

  const fs = require('fs');
  if (!fs.existsSync(scriptPath)) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[LocalBackend] Script not found at: ${scriptPath}`);
    }
    mainWindow?.webContents.send('local-backend-status', { 
      ready: false, 
      error: `Local backend script not found: ${scriptPath}` 
    });
    return;
  }

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

  checkReadiness(mainWindow);

  stdoutBuffer = '';

  pythonProcess.stdout.on('data', (data) => {
    try {
      stdoutBuffer += data.toString();
      
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() || '';

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

  pythonProcess.stderr.on('data', (data) => {
    const text = data.toString();
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.trim()) {
        if (shouldSuppressStderrLine(line)) {
          continue;
        }
        console.log(`[LocalBackend Python] ${line}`);
      }
    }
  });

  pythonProcess.on('exit', (code, signal) => {
    console.log(`[LocalBackend] Python process exited with code ${code}, signal ${signal}`);
    resetBackendProcessState('Local backend process exited');
    const exitError = code !== 0 && code !== null
      ? `Python process exited with code ${code}`
      : null;
    notifyBackendUnavailable(mainWindow, exitError);
  });

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

function handlePythonResponse(response) {
  const requestId = response.id;
  
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

function stopLocalBackend() {
  if (pythonProcess) {
    const processToStop = pythonProcess;
    console.log('[LocalBackend] Stopping Python process...');
    processToStop.kill('SIGTERM');

    setTimeout(() => {
      if (pythonProcess && pythonProcess === processToStop) {
        console.log('[LocalBackend] Force killing Python process');
        processToStop.kill('SIGKILL');
      }
    }, 5000);
  }
}

function initializeLocalBackendBridge(getWindows) {
  const {
    resolveWindows,
    resolveChatWindow,
    resolveResponseWindow,
  } = createWindowResolvers(getWindows);

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

  ipcMain.handle('execute-tool', async (event, { toolName, args }) => {
    try {
      const timeoutMs = toolName === 'browser' ? 120000 : 30000;
      const runTool = () =>
        sendRequest('execute_tool', {
          tool_name: toolName,
          args: args,
        }, { timeoutMs });
      const result = toolName === 'screenshot'
        ? await withHiddenWindowForScreenshot({
          task: runTool,
          resolveWindows,
          resolveChatWindow,
          resolveResponseWindow,
        })
        : await runTool();
      
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

  ipcMain.handle('get-system-state', async (event, { fields } = {}) => {
    return getSystemStateFromBackend(fields);
  });

  ipcMain.handle('search-memory', async (event, payload = {}) => (
    sendMemorySearchRequest(payload)
  ));

  registerMappedRpcHandlers(registerRpcHandler, COMPILED_RPC_HANDLER_DEFINITIONS);

  if (process.env.NODE_ENV !== 'production') {
    console.log('[LocalBackend] Local backend bridge initialized');
  }
}

async function getSystemState(fields = null) {
  return getSystemStateFromBackend(fields);
}

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
