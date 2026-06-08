const { spawn } = require('child_process');
const { ipcMain } = require('electron');
const {
  resolveBackendEndpointCandidates,
  resolveBackendEndpoints,
} = require('../app/backend_endpoints.cjs');
const {
  COMPILED_RPC_HANDLER_DEFINITIONS,
  mapSearchMemoryPayload,
  registerMappedRpcHandlers,
} = require('./local_backend_bridge_rpc_mappers.cjs');
const {
  createWindowResolvers,
} = require('./local_backend_bridge_window_visibility.cjs');
const {
  getErrorMessage,
  shouldForwardStderrLine,
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
  createLocalBackendStderrTransport,
} = require('./local_backend_stderr_transport.cjs');
const {
  createLocalBackendLaunchPlan,
} = require('./local_backend_launch_plan.cjs');
const {
  createLocalBackendProcessEvents,
} = require('./local_backend_process_events.cjs');
const {
  createLocalBackendStopController,
} = require('./local_backend_stop_controller.cjs');
const {
  broadcastConversationMetadataInvalidation,
  buildLocalBackendStatusPayload,
  sendLocalBackendStatus,
} = require('./local_backend_status_broadcaster.cjs');
const {
  loadInstallAuthStateFromDisk,
} = require('../ipc/ipc_install_auth_state.cjs');
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

const localBackendStderrTransport = createLocalBackendStderrTransport({
  isActiveProcessReference,
  shouldForwardStderrLine,
});

const localBackendProcessEvents = createLocalBackendProcessEvents({
  isActiveProcessReference,
  resetBackendProcessState,
  notifyBackendUnavailable,
});

const localBackendStopController = createLocalBackendStopController({
  clearDaemonRuntime,
  getDaemonManager: () => sidecarDaemonManager,
  getProcess: () => pythonProcess,
  resetBackendProcessState,
  setRuntimeExecuteTool: (executeTool) => {
    runtimeExecuteTool = executeTool;
  },
  supervisor: localBackendSupervisor,
});

const localBackendRpcTransport = createLocalBackendRpcTransport({
  getDaemonManager: () => sidecarDaemonManager,
  getDaemonLaunchOptions: () => sidecarDaemonRpcLaunchOptions,
  standaloneTransport: localBackendRequestTransport,
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
  sendLocalBackendStatus(mainWindow, {
    ready: false,
    error,
  });
}

function clearDaemonRuntime() {
  sidecarDaemonManager = null;
  sidecarDaemonRpcLaunchOptions = null;
  daemonBackendProcessRef = null;
}

function startLocalBackend(mainWindow, options = {}) {
  if (pythonProcess) {
    console.log('[LocalBackend] Service already running');
    return;
  }

  const launchPlan = createLocalBackendLaunchPlan({ options });
  const { launchTarget } = launchPlan;
  if (launchPlan.ok !== true) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[LocalBackend] ${launchPlan.error}`);
    }
    sendLocalBackendStatus(mainWindow, {
      ready: false,
      error: launchPlan.error,
    });
    return;
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `[LocalBackend] Starting local backend (${launchTarget.kind}): ` +
      `${launchTarget.command} ${launchTarget.args.join(' ')}`.trim(),
    );
  }

  pythonProcess = spawn(launchPlan.command, launchPlan.args, launchPlan.spawnOptions);
  const processRef = pythonProcess;
  const generation = localBackendSupervisor.attachProcess(processRef);
  localBackendReadinessRuntime.resetToGeneration(generation);

  localBackendReadinessRuntime.check(mainWindow);
  localBackendStdoutTransport.reset();
  localBackendStdoutTransport.attach(processRef);
  localBackendStderrTransport.attach(processRef);
  localBackendProcessEvents.attach({
    processRef,
    mainWindow,
    launchTarget,
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

function stopLocalBackend() {
  localBackendStopController.stop();
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
      broadcastConversationMetadataInvalidation(resolveWindows, payload);
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
};
