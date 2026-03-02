const { spawn } = require('child_process');
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const { ipcMain } = require('electron');
const { v4: uuidv4 } = require('uuid');
const { resolveBackendEndpoints } = require('./backend_endpoints.cjs');
const {
  COMPILED_RPC_HANDLER_DEFINITIONS,
  mapSearchMemoryPayload,
  registerMappedRpcHandlers,
} = require('./local_backend_bridge_rpc_mappers.cjs');
const { resolveToolArgs } = require('./local_backend_bridge_tool_args.cjs');
const {
  createWindowResolvers,
  withHiddenWindowForScreenshot,
} = require('./local_backend_bridge_windows.cjs');
const {
  getErrorMessage,
  shouldForwardStderrLine,
  toErrorResponse,
  withLocalBackendNodeOptions,
} = require('./local_backend_bridge_utils.cjs');
const {
  resolvePythonExecutablePath,
  resolveSidecarLaunchTarget,
} = require('./runtime_paths.cjs');

let pythonProcess = null;
let isPythonReady = false;
let pendingRequests = new Map();
let stdoutBuffer = '';
let pendingStdoutLines = [];
let isDrainingStdoutLines = false;
let readinessCheckCallback = null;
let readinessCheckToken = 0;

let cachedPythonPath = null;
const LARGE_JSON_PARSE_OFFLOAD_THRESHOLD_BYTES = 128 * 1024;

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isImageContentType(value) {
  return typeof value === 'string' && value.toLowerCase().startsWith('image/');
}

function resolveScreenshotContentType(data) {
  if (!isRecord(data)) {
    return 'image/jpeg';
  }
  if (isImageContentType(data.screenshot_content_type)) {
    return data.screenshot_content_type.toLowerCase();
  }
  if (isImageContentType(data.image_content_type)) {
    return data.image_content_type.toLowerCase();
  }

  const format = (
    typeof data.compression === 'string'
      ? data.compression
      : typeof data.format === 'string'
        ? data.format
        : ''
  ).toLowerCase();
  if (format === 'png') {
    return 'image/png';
  }
  if (format === 'webp') {
    return 'image/webp';
  }
  return 'image/jpeg';
}

function resolveScreenshotFilename(screenshotPath, contentType) {
  const basename = path.basename(screenshotPath || '');
  if (basename && basename.includes('.')) {
    return basename;
  }
  if (contentType === 'image/png') {
    return 'screenshot.png';
  }
  if (contentType === 'image/webp') {
    return 'screenshot.webp';
  }
  return 'screenshot.jpg';
}

async function uploadScreenshotArtifactFromPath({
  screenshotPath,
  backendHttpUrl,
  contentType,
}) {
  const resolvedContentType = isImageContentType(contentType) ? contentType : 'image/jpeg';
  const fileBuffer = await fsPromises.readFile(screenshotPath);
  const blob = new Blob([fileBuffer], { type: resolvedContentType });
  const form = new FormData();
  form.append('file', blob, resolveScreenshotFilename(screenshotPath, resolvedContentType));

  const response = await fetch(`${backendHttpUrl}/api/artifacts/`, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upload failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

async function unlinkQuietly(targetPath) {
  if (!targetPath) {
    return;
  }
  try {
    await fsPromises.unlink(targetPath);
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      console.warn(`[LocalBackend] Failed to delete temporary screenshot ${targetPath}:`, error);
    }
  }
}

async function hydrateScreenshotArtifact(result, backendHttpUrl) {
  if (!result || result.success === false || !isRecord(result.data)) {
    return result;
  }
  const data = result.data;
  const screenshotPath = typeof data.screenshot_path === 'string'
    ? data.screenshot_path.trim()
    : '';
  if (!screenshotPath) {
    return result;
  }

  try {
    const uploaded = await uploadScreenshotArtifactFromPath({
      screenshotPath,
      backendHttpUrl,
      contentType: resolveScreenshotContentType(data),
    });
    const artifactId = (
      uploaded
      && typeof uploaded === 'object'
      && typeof uploaded.artifact_id === 'string'
      && uploaded.artifact_id.trim()
    ) ? uploaded.artifact_id.trim() : null;
    const artifactUrl = (
      uploaded
      && typeof uploaded === 'object'
      && typeof uploaded.url === 'string'
      && uploaded.url.trim()
    ) ? uploaded.url.trim() : null;

    if (artifactId) {
      data.screenshot_ref = artifactId;
      data.screenshot_url = artifactUrl || `${backendHttpUrl}/api/artifacts/${artifactId}`;
    }
  } catch (error) {
    console.warn(
      `[LocalBackend] Failed to upload screenshot artifact from ${screenshotPath}: ${getErrorMessage(error)}`,
    );
  } finally {
    await unlinkQuietly(screenshotPath);
    delete data.screenshot_path;
  }

  return result;
}

function shouldOffloadJsonParse(line) {
  return Buffer.byteLength(line, 'utf8') >= LARGE_JSON_PARSE_OFFLOAD_THRESHOLD_BYTES;
}

function parseJsonInWorker(line) {
  let WorkerClass;
  try {
    ({ Worker: WorkerClass } = require('worker_threads'));
  } catch (_error) {
    return Promise.resolve(JSON.parse(line));
  }

  return new Promise((resolve, reject) => {
    const worker = new WorkerClass(
      `
const { parentPort } = require('worker_threads');
parentPort.on('message', (payload) => {
  try {
    parentPort.postMessage({ ok: true, value: JSON.parse(payload) });
  } catch (error) {
    parentPort.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
`,
      { eval: true },
    );

    let settled = false;
    const finish = (resolver, value) => {
      if (settled) {
        return;
      }
      settled = true;
      Promise.resolve(worker.terminate())
        .catch(() => {})
        .finally(() => resolver(value));
    };

    worker.once('message', (message) => {
      if (message && message.ok === true) {
        finish(resolve, message.value);
        return;
      }
      const errorMessage = (
        message
        && typeof message === 'object'
        && typeof message.error === 'string'
        && message.error.trim()
      ) ? message.error : 'JSON parse worker failed';
      finish(reject, new Error(errorMessage));
    });

    worker.once('error', (error) => {
      finish(reject, error);
    });

    worker.once('exit', (code) => {
      if (!settled && code !== 0) {
        finish(reject, new Error(`JSON parse worker exited with code ${code}`));
      }
    });

    worker.postMessage(line);
  });
}

async function drainStdoutLines(processRef) {
  if (isDrainingStdoutLines) {
    return;
  }
  isDrainingStdoutLines = true;

  try {
    while (pendingStdoutLines.length > 0) {
      if (!isActiveProcessReference(processRef)) {
        pendingStdoutLines = [];
        return;
      }

      const line = pendingStdoutLines.shift();
      try {
        const response = shouldOffloadJsonParse(line)
          ? await parseJsonInWorker(line)
          : JSON.parse(line);
        handlePythonResponse(response);
      } catch (error) {
        console.error('[LocalBackend] Error parsing response:', error, 'Line:', line);
      }
    }
  } finally {
    isDrainingStdoutLines = false;
    if (pendingStdoutLines.length > 0 && isActiveProcessReference(processRef)) {
      void drainStdoutLines(processRef);
    }
  }
}

function isActiveProcessReference(processRef) {
  return Boolean(processRef) && pythonProcess === processRef;
}

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
  pendingStdoutLines = [];
  isDrainingStdoutLines = false;
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

function startLocalBackend(mainWindow, options = {}) {
  if (pythonProcess) {
    console.log('[LocalBackend] Service already running');
    return;
  }

  const launchTarget = resolveSidecarLaunchTarget('local_backend.py');
  const scriptPath = launchTarget.resolvedPath;
  const pythonPath = launchTarget.kind === 'python' ? getPythonPath() : launchTarget.command;

  if (launchTarget.kind === 'python' && !fs.existsSync(scriptPath)) {
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
    console.log(
      `[LocalBackend] Starting local backend (${launchTarget.kind}): ` +
      `${launchTarget.command} ${launchTarget.args.join(' ')}`.trim(),
    );
  }

  const backendEndpoints = options.backendEndpoints || resolveBackendEndpoints(process.env, {
    isPackaged: options.isPackaged === true,
  });

  pythonProcess = spawn(launchTarget.command, launchTarget.args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: launchTarget.cwd,
    env: withLocalBackendNodeOptions({
      ...process.env,
      PYTHONUNBUFFERED: '1',
      WINDIE_BACKEND_HTTP_URL: backendEndpoints.httpUrl,
    }),
  });
  const processRef = pythonProcess;

  checkReadiness(mainWindow);

  stdoutBuffer = '';

  pythonProcess.stdout.on('data', (data) => {
    if (!isActiveProcessReference(processRef)) {
      return;
    }
    try {
      stdoutBuffer += data.toString();
      
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }

        const queueLine = (
          isDrainingStdoutLines
          || pendingStdoutLines.length > 0
          || shouldOffloadJsonParse(line)
        );

        if (queueLine) {
          pendingStdoutLines.push(line);
          continue;
        }

        try {
          const response = JSON.parse(line);
          handlePythonResponse(response);
        } catch (error) {
          console.error('[LocalBackend] Error parsing response:', error, 'Line:', line);
        }
      }

      if (pendingStdoutLines.length > 0) {
        void drainStdoutLines(processRef);
      }
    } catch (error) {
      console.error('[LocalBackend] Error processing stdout:', error);
    }
  });

  pythonProcess.stderr.on('data', (data) => {
    if (!isActiveProcessReference(processRef)) {
      return;
    }
    const text = data.toString();
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.trim()) {
        if (!shouldForwardStderrLine(line)) {
          continue;
        }
        console.log(`[LocalBackend Python] ${line}`);
      }
    }
  });

  pythonProcess.on('exit', (code, signal) => {
    if (!isActiveProcessReference(processRef)) {
      return;
    }
    console.log(`[LocalBackend] Python process exited with code ${code}, signal ${signal}`);
    resetBackendProcessState('Local backend process exited');
    const exitError = code !== 0 && code !== null
      ? `Python process exited with code ${code}`
      : null;
    notifyBackendUnavailable(mainWindow, exitError);
  });

  pythonProcess.on('error', (error) => {
    if (!isActiveProcessReference(processRef)) {
      return;
    }
    console.error('[LocalBackend] Failed to start Python process:', error);
    resetBackendProcessState('Local backend process error');

    let errorMessage = error.message;
    if (error.code === 'ENOENT') {
      errorMessage = launchTarget.kind === 'binary'
        ? `Bundled sidecar executable '${launchTarget.command}' not found. Reinstall WindieOS.`
        : `Python executable '${pythonPath}' not found. Please install Python 3 or ensure it is in your PATH.`;
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

function mapStoreMemoryPayload(payload = {}) {
  const source = (
    payload
    && typeof payload === 'object'
    && !Array.isArray(payload)
  ) ? payload : {};

  return {
    user_query: source.user_query ?? source.userQuery,
    assistant_response: source.assistant_response ?? source.assistantResponse,
    memory_type: source.memory_type ?? source.memoryType,
    user_id: source.user_id ?? source.userId,
    session_id: source.session_id ?? source.sessionId,
  };
}

async function storeMemory(payload = {}) {
  return sendRequestOrError(
    'store_memory',
    mapStoreMemoryPayload(payload),
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

function initializeLocalBackendBridge(getWindows, options = {}) {
  const getFrontendConfig = typeof options.getFrontendConfig === 'function'
    ? options.getFrontendConfig
    : null;
  const isPackaged = options.isPackaged === true;
  const backendEndpoints = resolveBackendEndpoints(process.env, { isPackaged });
  const {
    resolveWindows,
    resolveChatWindow,
    resolveResponseWindow,
  } = createWindowResolvers(getWindows);

  const [mainWindow] = resolveWindows();
  startLocalBackend(mainWindow, { isPackaged, backendEndpoints });

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
      const normalizedArgs = resolveToolArgs(toolName, args, getFrontendConfig);
      const runTool = () =>
        sendRequest('execute_tool', {
          tool_name: toolName,
          args: normalizedArgs,
        }, { timeoutMs });
      let result = toolName === 'screenshot'
        ? await withHiddenWindowForScreenshot({
          platform: process.platform,
          task: runTool,
          resolveWindows,
          resolveChatWindow,
          resolveResponseWindow,
        })
        : await runTool();
      result = await hydrateScreenshotArtifact(result, backendEndpoints.httpUrl);
      
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
  storeMemory,
};
