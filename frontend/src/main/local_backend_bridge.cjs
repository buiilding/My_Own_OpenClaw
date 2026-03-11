const { spawn } = require('child_process');
const fs = require('fs');
const { ipcMain, BrowserWindow, screen } = require('electron');
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
  resolveScreenshotToolDisplayBounds,
} = require('./local_backend_bridge_display_bounds.cjs');
const {
  materializeScreenshotAttachment,
} = require('./local_backend_bridge_screenshot_attachment.cjs');
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
const {
  getActiveDisplayAffinity,
  resolveActiveSurfaceDisplayAffinityForWindows,
  toScreenshotDisplayBounds,
} = require('./display_affinity_runtime.cjs');
const { createLocalBackendSupervisor } = require('./local_backend_supervisor.cjs');

let pythonProcess = null;
let pendingRequests = new Map();
let stdoutBuffer = '';
let pendingStdoutLines = [];
let isDrainingStdoutLines = false;
let readinessCheckCallback = null;
let readinessCheckToken = 0;

let cachedPythonPath = null;
const LARGE_JSON_PARSE_OFFLOAD_THRESHOLD_BYTES = 128 * 1024;
const isTestEnv = process.env.NODE_ENV === 'test';
let runtimeScreenCaptureCapabilityVerifier = async () => ({
  granted: false,
  reason: 'Local backend bridge is not initialized.',
  details: {
    initialized: false,
  },
});
const localBackendSupervisor = createLocalBackendSupervisor();

function isBackendReady() {
  return localBackendSupervisor.getSnapshot().ready;
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
  return localBackendSupervisor.isActiveProcess(processRef);
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
  localBackendSupervisor.markReady();
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

function resetBackendProcessState({ reason, status = 'stopped' } = {}) {
  pythonProcess = null;
  localBackendSupervisor.clear({
    status,
    error: status === 'error' ? reason || '' : '',
  });
  readinessCheckCallback = null;
  readinessCheckToken = localBackendSupervisor.getSnapshot().generation;
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
          if (!isTestEnv) {
            console.warn('[LocalBackend] Backend readiness check failed after max attempts, marking as ready');
          }
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
        if (!isTestEnv) {
          console.warn('[LocalBackend] Backend readiness check timed out after max attempts');
        }
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
  const packagedApp = options.isPackaged === true;

  if (launchTarget.kind === 'python' && !launchTarget.command) {
    const errorMessage = options.isPackaged === true
      ? (
        'Bundled Python runtime not found in app resources. ' +
        'Please reinstall WindieOS.'
      )
      : (
        'Python executable not found. ' +
        'Please install Python 3 or set WINDIE_PYTHON_PATH.'
      );
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[LocalBackend] ${errorMessage}`);
    }
    mainWindow?.webContents.send('local-backend-status', {
      ready: false,
      error: errorMessage,
    });
    return;
  }

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
      WINDIE_PACKAGED_APP: packagedApp ? '1' : '0',
      WINDIE_ENABLE_BROWSER_FEATURE_PACK_AUTOINSTALL: packagedApp ? '0' : '1',
    }),
  });
  const processRef = pythonProcess;
  readinessCheckToken = localBackendSupervisor.attachProcess(processRef);

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
    resetBackendProcessState({
      reason: 'Local backend process exited',
      status: code !== 0 && code !== null ? 'error' : 'stopped',
    });
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
    resetBackendProcessState({
      reason: 'Local backend process error',
      status: 'error',
    });

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
  if (!pythonProcess || !isBackendReady()) {
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
    localBackendSupervisor.beginStop();
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
    resolveMainWindow,
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
      const normalizedArgs = resolveToolArgs(
        toolName,
        args,
        getFrontendConfig,
        console.warn,
        {
          displayBounds: resolveScreenshotToolDisplayBounds({
            BrowserWindow,
            screen,
            webContents: event?.sender || null,
            resolveChatWindow,
            resolveMainWindow,
            getActiveDisplayAffinity,
            resolveActiveSurfaceDisplayAffinityForWindows,
            toScreenshotDisplayBounds,
          }),
        },
      );
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
      result = await materializeScreenshotAttachment(result, backendEndpoints.httpUrl, {
        warn: console.warn,
        getErrorMessage,
      });
      
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

  runtimeScreenCaptureCapabilityVerifier = async () => {
    const cleanupScreenshotPath = async (result) => {
      const screenshotPath = result?.data?.screenshot_path;
      if (typeof screenshotPath !== 'string' || !screenshotPath.trim()) {
        return;
      }
      try {
        await fs.promises.unlink(screenshotPath);
      } catch (error) {
        console.warn(
          `[LocalBackend] Failed to delete screen-capture verification screenshot ${screenshotPath}: ${getErrorMessage(error)}`,
        );
      }
    };

    try {
      const runTool = () => sendRequest(
        'execute_tool',
        {
          tool_name: 'screenshot',
          args: {
            explanation: 'Screen capture permission verification',
            expectation: 'Permission verification screenshot',
          },
        },
        { timeoutMs: 30000 },
      );
      const result = await withHiddenWindowForScreenshot({
        platform: process.platform,
        task: runTool,
        resolveWindows,
        resolveChatWindow,
        resolveResponseWindow,
      });

      await cleanupScreenshotPath(result);

      if (result?.success === true) {
        return {
          granted: true,
          reason: 'Real screenshot capture succeeded.',
          details: {
            capture_backend: result?.data?.capture_meta?.capture_backend || null,
            capture_meta: result?.data?.capture_meta || null,
          },
        };
      }

      return {
        granted: false,
        reason: result?.error || 'Real screenshot capture failed.',
        details: {
          result: result || null,
        },
      };
    } catch (error) {
      return {
        granted: false,
        reason: getErrorMessage(error),
        details: {
          error: getErrorMessage(error),
        },
      };
    }
  };

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

async function getLocalBackendStatus() {
  const result = await sendRequestOrError('get_status');
  if (result && result.success === false) {
    return result;
  }
  return {
    success: true,
    data: result,
  };
}

async function installBrowserChromium() {
  const result = await sendRequestOrError(
    'install_browser_chromium',
    {},
    { timeoutMs: 10 * 60 * 1000 },
  );
  if (result && result.success === false && typeof result.error === 'string') {
    return result;
  }
  return {
    success: true,
    data: result,
  };
}

async function determineMacOsSystemEventsAutomationPermission(askUserIfNeeded = false) {
  const result = await sendRequestOrError(
    'determine_macos_system_events_automation_permission',
    {
      ask_user_if_needed: askUserIfNeeded === true,
    },
  );

  if (result && result.success === false && typeof result.error === 'string') {
    return result;
  }

  return {
    success: true,
    data: result,
  };
}

async function warmBrowserAutomation() {
  const result = await sendRequestOrError(
    'execute_tool',
    {
      tool_name: 'browser',
      args: {
        action: 'connect',
      },
    },
    { timeoutMs: 120000 },
  );

  if (result && result.success === false && typeof result.error === 'string') {
    return result;
  }

  return {
    success: true,
    data: result,
  };
}

async function searchMemory(
  query,
  user_id,
  limit,
  memory_type,
  exclude_conversation_id,
  retrievalOptions = {},
) {
  return sendMemorySearchRequest({
    query,
    user_id,
    limit,
    memory_type,
    exclude_conversation_id,
    ...retrievalOptions,
  });
}

module.exports = {
  initializeLocalBackendBridge,
  stopLocalBackend,
  getSystemState,
  verifyScreenCaptureCapability: async () => runtimeScreenCaptureCapabilityVerifier(),
  getLocalBackendStatus,
  installBrowserChromium,
  determineMacOsSystemEventsAutomationPermission,
  warmBrowserAutomation,
  searchMemory,
  storeMemory,
};
