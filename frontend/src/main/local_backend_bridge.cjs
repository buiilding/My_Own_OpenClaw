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
  mapStoreMemoryPayload,
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
  createLocalBackendRpcTransport,
} = require('./local_backend_bridge_rpc_transport.cjs');
const {
  createLocalBackendExecuteToolRuntime,
} = require('./local_backend_bridge_execute_tool_runtime.cjs');
const {
  createLocalBackendReadinessRuntime,
} = require('./local_backend_readiness_runtime.cjs');
const {
  createLocalBackendStdoutTransport,
} = require('./local_backend_stdout_transport.cjs');
const {
  broadcastSidecarEvent,
  buildLocalBackendStatusPayload,
  sendLocalBackendStatus,
} = require('./local_backend_status_broadcaster.cjs');
const {
  loadInstallAuthStateFromDisk,
} = require('./ipc/ipc_install_auth_state.cjs');
const {
  resolveSidecarLaunchTarget,
} = require('./runtime_paths.cjs');
const { createLocalBackendSupervisor } = require('./local_backend_supervisor.cjs');
const { createSidecarDaemonManager } = require('./sidecar_daemon_manager.cjs');

let pythonProcess = null;

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

const localBackendReadinessRuntime = createLocalBackendReadinessRuntime({
  getProcess: () => pythonProcess,
  supervisor: localBackendSupervisor,
  sendStatus: sendLocalBackendStatus,
  isTestEnv,
});

const localBackendRequestTransport = createLocalBackendRequestTransport({
  getProcess: () => pythonProcess,
  isBackendReady,
  getReadinessCallback: () => localBackendReadinessRuntime.getCallback(),
});

const localBackendStdoutTransport = createLocalBackendStdoutTransport({
  handleResponse: (response) => localBackendRequestTransport.handlePythonResponse(response),
  isActiveProcessReference,
});

const localBackendRpcTransport = createLocalBackendRpcTransport({
  getDaemonManager: () => sidecarDaemonManager,
  getDaemonLaunchOptions: () => sidecarDaemonRpcLaunchOptions,
  legacyTransport: localBackendRequestTransport,
});

function isActiveProcessReference(processRef) {
  return localBackendSupervisor.isActiveProcess(processRef);
}

function markBackendReady(mainWindow) {
  localBackendReadinessRuntime.markReady(mainWindow);
}

function resetBackendProcessState({ reason, status = 'stopped' } = {}) {
  pythonProcess = null;
  localBackendSupervisor.clear({
    status,
    error: status === 'error' ? reason || '' : '',
  });
  localBackendReadinessRuntime.resetToGeneration();
  localBackendRequestTransport.rejectPendingRequests(reason);
  localBackendStdoutTransport.reset();
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
  const generation = localBackendSupervisor.attachProcess(processRef);
  localBackendReadinessRuntime.resetToGeneration(generation);

  localBackendReadinessRuntime.check(mainWindow);
  localBackendStdoutTransport.reset();
  localBackendStdoutTransport.attach(processRef);

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
  return localBackendRpcTransport.sendRequest(method, params, options);
}

async function sendRequestOrError(method, params = {}, options = {}) {
  return localBackendRpcTransport.sendRequestOrError(method, params, options);
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
  const generation = localBackendSupervisor.attachProcess(daemonBackendProcessRef);
  localBackendReadinessRuntime.resetToGeneration(generation);
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
      broadcastSidecarEvent(resolveWindows, payload);
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
  ipcMain.handle('get-local-backend-status', async () => buildLocalBackendStatusPayload({
    supervisor: localBackendSupervisor,
    sidecarDaemonManager,
  }));

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
