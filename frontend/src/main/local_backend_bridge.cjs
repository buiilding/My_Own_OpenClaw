const { spawn } = require('child_process');
const fs = require('fs');
const { ipcMain } = require('electron');
const {
  resolveBackendEndpointCandidates,
  resolveBackendEndpoints,
} = require('./backend_endpoints.cjs');
const {
  COMPILED_RPC_HANDLER_DEFINITIONS,
  mapSearchMemoryPayload,
  registerMappedRpcHandlers,
} = require('./local_backend_bridge_rpc_mappers.cjs');
const {
  createWindowResolvers,
} = require('./local_backend_bridge_windows.cjs');
const {
  getErrorMessage,
  shouldForwardStderrLine,
  withLocalBackendNodeOptions,
} = require('./local_backend_bridge_utils.cjs');
const {
  createLocalBackendRequestTransport,
} = require('./local_backend_bridge_request_transport.cjs');
const {
  createLocalBackendExecuteToolRuntime,
} = require('./local_backend_bridge_execute_tool_runtime.cjs');
const {
  loadInstallAuthStateFromDisk,
} = require('./ipc/ipc_install_auth_state.cjs');
const {
  resolveSidecarLaunchTarget,
} = require('./runtime_paths.cjs');
const { createLocalBackendSupervisor } = require('./local_backend_supervisor.cjs');
const { createSidecarDaemonManager } = require('./sidecar_daemon_manager.cjs');
const { v4: uuidv4 } = require('uuid');

let pythonProcess = null;
let stdoutBuffer = '';
let pendingStdoutLines = [];
let isDrainingStdoutLines = false;
let readinessCheckCallback = null;
let readinessCheckToken = 0;

const LARGE_JSON_PARSE_OFFLOAD_THRESHOLD_BYTES = 128 * 1024;
const BROWSER_CONTROL_EXPLANATION = 'Manage the dedicated browser session from the chat header.';
const isTestEnv = process.env.NODE_ENV === 'test';
let runtimeScreenCaptureCapabilityVerifier = async () => ({
  granted: false,
  reason: 'Local backend bridge is not initialized.',
  details: {
    initialized: false,
  },
});
let runtimeExecuteTool = async () => ({
  success: false,
  error: 'Local backend bridge is not initialized.',
});
const localBackendSupervisor = createLocalBackendSupervisor();
let sidecarDaemonManager = null;
let sidecarDaemonRpcLaunchOptions = null;
let daemonBackendProcessRef = null;

function isBackendReady() {
  return localBackendSupervisor.getSnapshot().ready;
}

const localBackendRequestTransport = createLocalBackendRequestTransport({
  getProcess: () => pythonProcess,
  isBackendReady,
  getReadinessCallback: () => readinessCheckCallback,
});

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
        localBackendRequestTransport.handlePythonResponse(response);
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

function buildLocalBackendStatusPayload() {
  const snapshot = localBackendSupervisor.getSnapshot();
  return {
    ready: snapshot.ready === true,
    status: typeof snapshot.status === 'string' ? snapshot.status : 'stopped',
    error: typeof snapshot.lastError === 'string' ? snapshot.lastError : '',
    sidecarDaemon: sidecarDaemonManager?.getSnapshot?.() || null,
  };
}

function resetBackendProcessState({ reason, status = 'stopped' } = {}) {
  pythonProcess = null;
  localBackendSupervisor.clear({
    status,
    error: status === 'error' ? reason || '' : '',
  });
  readinessCheckCallback = null;
  readinessCheckToken = localBackendSupervisor.getSnapshot().generation;
  localBackendRequestTransport.rejectPendingRequests(reason);
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
  const permissionStatePath = typeof options.permissionStatePath === 'string'
    ? options.permissionStatePath.trim()
    : '';

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

  const backendEnv = withLocalBackendNodeOptions({
    ...process.env,
    PYTHONUNBUFFERED: '1',
    WINDIE_BACKEND_HTTP_URL: backendEndpoints.httpUrl,
    ...(typeof options.authStatePath === 'string' && options.authStatePath.trim()
      ? { WINDIE_BACKEND_AUTH_STATE_PATH: options.authStatePath.trim() }
      : {}),
    WINDIE_PACKAGED_APP: packagedApp ? '1' : '0',
    WINDIE_ENABLE_BROWSER_FEATURE_PACK_AUTOINSTALL: packagedApp ? '0' : '1',
    ...(permissionStatePath ? { WINDIE_PERMISSION_STATE_PATH: permissionStatePath } : {}),
    ...(
      packagedApp
      && launchTarget.kind === 'python'
        ? {
            PYTHONDONTWRITEBYTECODE: '1',
            ...(
              process.platform !== 'win32'
              && launchTarget.runtimeRoot
                ? {
                    PYTHONHOME: launchTarget.runtimeRoot,
                    PYTHONNOUSERSITE: '1',
                  }
                : {}
            ),
          }
        : {}
    ),
  });
  if (packagedApp && launchTarget.kind === 'python') {
    delete backendEnv.PYTHONPATH;
  }

  pythonProcess = spawn(launchTarget.command, launchTarget.args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: launchTarget.cwd,
    env: backendEnv,
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
          localBackendRequestTransport.handlePythonResponse(response);
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
        : `Python executable '${launchTarget.command}' not found. Please install Python 3 or ensure it is in your PATH.`;
    }

    notifyBackendUnavailable(mainWindow, errorMessage);
  });
}

function sendRequest(method, params = {}, options = {}) {
  if (sidecarDaemonManager && typeof sidecarDaemonManager.rpc === 'function') {
    const requestId = uuidv4();
    return sidecarDaemonManager
      .rpc({
        id: requestId,
        method,
        params,
      }, sidecarDaemonRpcLaunchOptions || {})
      .then((response) => {
        if (response?.error) {
          throw new Error(response.error.message || 'JSON-RPC error');
        }
        return response?.result;
      });
  }
  return localBackendRequestTransport.sendRequest(method, params, options);
}

async function sendRequestOrError(method, params = {}, options = {}) {
  try {
    return await sendRequest(method, params, options);
  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error),
    };
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
  runtimeExecuteTool = async () => ({
    success: false,
    error: 'Local backend bridge is stopped.',
  });
  if (sidecarDaemonManager) {
    void sidecarDaemonManager.shutdown();
    sidecarDaemonManager = null;
    sidecarDaemonRpcLaunchOptions = null;
    daemonBackendProcessRef = null;
    resetBackendProcessState({
      reason: 'Sidecar daemon stopped',
      status: 'stopped',
    });
  }
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

function startDaemonBackedLocalBackend(mainWindow, launchOptions = {}) {
  if (!sidecarDaemonManager || typeof sidecarDaemonManager.ensureDaemon !== 'function') {
    return;
  }
  sidecarDaemonRpcLaunchOptions = launchOptions;
  daemonBackendProcessRef = { kind: 'sidecar-daemon' };
  readinessCheckToken = localBackendSupervisor.attachProcess(daemonBackendProcessRef);
  void sidecarDaemonManager.ensureDaemon(launchOptions)
    .then(() => {
      if (daemonBackendProcessRef) {
        markBackendReady(mainWindow);
      }
    })
    .catch((error) => {
      const message = getErrorMessage(error);
      console.warn(`[LocalBackend] Sidecar daemon startup failed: ${message}`);
      daemonBackendProcessRef = null;
      resetBackendProcessState({
        reason: message,
        status: 'error',
      });
      notifyBackendUnavailable(mainWindow, message);
    });
}

async function loadArtifactUploadHeaders() {
  const authState = await loadInstallAuthStateFromDisk((message) => {
    console.warn(`[LocalBackend] ${message}`);
  });
  const installToken = typeof authState?.installToken === 'string'
    ? authState.installToken.trim()
    : '';
  if (!installToken) {
    return {};
  }
  return {
    Authorization: `Bearer ${installToken}`,
  };
}

function initializeLocalBackendBridge(getWindows, options = {}) {
  const getFrontendConfig = typeof options.getFrontendConfig === 'function'
    ? options.getFrontendConfig
    : null;
  const isPackaged = options.isPackaged === true;
  const backendEndpointCandidates = resolveBackendEndpointCandidates(process.env, { isPackaged });
  const backendEndpoints = backendEndpointCandidates[0] || resolveBackendEndpoints(process.env, { isPackaged });
  const {
    resolveWindows,
    resolveMainWindow,
    resolveChatWindow,
    resolveResponseWindow,
  } = createWindowResolvers(getWindows);
  const getArtifactUploadHeaders = typeof options.getArtifactUploadHeaders === 'function'
    ? options.getArtifactUploadHeaders
    : loadArtifactUploadHeaders;
  sidecarDaemonManager = options.sidecarDaemonManager || (
    isTestEnv
      ? null
      : createSidecarDaemonManager()
  );
  if (typeof sidecarDaemonManager?.subscribeEvents === 'function') {
    sidecarDaemonManager.subscribeEvents((payload) => {
      for (const win of resolveWindows()) {
        if (!win || win.isDestroyed?.()) {
          continue;
        }
        win.webContents?.send?.('sidecar-event', payload);
      }
    });
  }
  const sidecarDaemonClient = options.sidecarDaemonClient || (
    sidecarDaemonManager
      ? {
          executeTool: (payload) => sidecarDaemonManager.executeTool(payload, {
            isPackaged,
            backendEndpoints,
            permissionStatePath: options.permissionStatePath,
            authStatePath: options.authStatePath,
          }),
        }
      : null
  );
  const executeToolRuntime = createLocalBackendExecuteToolRuntime({
    sendRequest,
    backendHttpUrl: backendEndpoints.httpUrl,
    getArtifactUploadHeaders,
    getFrontendConfig,
    resolveWindows,
    resolveChatWindow,
    resolveMainWindow,
    resolveResponseWindow,
    sidecarDaemonClient,
    prepareComputerUseSurface: options.prepareComputerUseSurface,
  });

  const [mainWindow] = resolveWindows();
  const localRuntimeLaunchOptions = {
    isPackaged,
    backendEndpoints,
    permissionStatePath: options.permissionStatePath,
    authStatePath: options.authStatePath,
  };
  if (sidecarDaemonManager) {
    startDaemonBackedLocalBackend(mainWindow, localRuntimeLaunchOptions);
  } else {
    startLocalBackend(mainWindow, localRuntimeLaunchOptions);
  }

  const registerRpcHandler = (channel, method, mapParams) => {
    ipcMain.handle(channel, async (event, payload = {}) => (
      sendRequestOrError(
        method,
        mapParams(payload || {}),
      )
    ));
  };

  ipcMain.handle('capture-screenshot-attachment', async (event, payload = {}) => (
    executeToolRuntime.executeTool(event, {
      toolName: 'screenshot',
      args: payload?.args || {},
    })
  ));
  ipcMain.handle('read-attachment-file', async (event, payload = {}) => (
    executeToolRuntime.executeTool(event, {
      toolName: 'read_file',
      args: { file_path: payload?.filePath },
    })
  ));
  ipcMain.handle('run-browser-action', async (event, payload = {}) => {
    const { action, ...extras } = payload || {};
    return executeToolRuntime.executeTool(event, {
      toolName: 'browser',
      args: {
        action,
        explanation: BROWSER_CONTROL_EXPLANATION,
        ...extras,
      },
    });
  });
  ipcMain.handle('get-local-backend-status', async () => buildLocalBackendStatusPayload());

  runtimeScreenCaptureCapabilityVerifier = executeToolRuntime.createScreenCaptureCapabilityVerifier();
  runtimeExecuteTool = async (payload = {}) => executeToolRuntime.executeTool(null, payload);

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
  console.log('[BrowserRuntime] Requesting browser runtime status/install from local backend');
  const result = await sendRequestOrError(
    'install_browser_chromium',
    {},
    { timeoutMs: 10 * 60 * 1000 },
  );
  if (result && result.success === false && typeof result.error === 'string') {
    console.error('[BrowserRuntime] Chromium install request failed:', result.error);
    return result;
  }
  if (result && typeof result === 'object') {
    if (result.skipped === true && typeof result.browser_binary_path === 'string') {
      console.log(
        `[BrowserRuntime] Using existing Chrome/Chromium-family browser at ${result.browser_binary_path}; skipping Chromium install`,
      );
    } else if (result.installed === true && typeof result.browser_binary_path === 'string') {
      console.log(
        `[BrowserRuntime] Chromium install completed and browser binary is ready at ${result.browser_binary_path}`,
      );
    } else if (result.installed === false && result.skipped !== true) {
      console.log('[BrowserRuntime] No existing Chrome/Chromium was detected; Chromium install was attempted');
    }
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
        explanation: 'Open the WindieOS browser for onboarding and profile setup.',
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
  executeToolForBackend: async (payload) => runtimeExecuteTool(payload),
  getLocalBackendStatus,
  installBrowserChromium,
  determineMacOsSystemEventsAutomationPermission,
  warmBrowserAutomation,
  searchMemory,
  storeMemory,
};
