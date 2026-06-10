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
} = require('./local_backend_bridge_utils.cjs');
const {
  createLocalBackendExecuteToolRuntime,
} = require('./local_backend_bridge_execute_tool_runtime.cjs');
const {
  broadcastConversationMetadataInvalidation,
  buildLocalBackendStatusPayload,
  sendLocalBackendStatus,
} = require('./local_backend_status_broadcaster.cjs');
const {
  loadInstallAuthStateFromDisk,
} = require('../ipc/ipc_install_auth_state.cjs');
const { createLocalBackendSupervisor } = require('./local_backend_supervisor.cjs');
const {
  createDesktopAutoSidecarLaunchPlan,
} = require('./sdk_sidecar_launch_options.cjs');
const {
  createWindieLocalRuntimeProvider,
} = require('../../../../packages/windie-sdk-js/cjs/index.js');

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
let sdkLocalRuntimeProvider = null;
let sdkLocalRuntime = null;
let sdkLocalRuntimeEventUnsubscribe = null;
let sdkLocalRuntimeEventHandler = null;
let sdkSidecarSnapshot = null;
let daemonBackendProcessRef = null;
let sdkStatusMainWindow = null;

function markBackendReady(mainWindow) {
  localBackendSupervisor.markReady();
  sendLocalBackendStatus(mainWindow, {
    ready: true,
  });
}

function clearDaemonRuntime() {
  sdkLocalRuntimeEventUnsubscribe?.();
  sdkLocalRuntimeEventUnsubscribe = null;
  sdkLocalRuntime = null;
  sdkLocalRuntimeProvider = null;
  sdkSidecarSnapshot = null;
  daemonBackendProcessRef = null;
  sdkStatusMainWindow = null;
}

function createStoppedToolExecutor() {
  return async () => ({
    success: false,
    error: 'Local backend bridge is stopped.',
  });
}

function attachSdkLocalRuntimeEvents(runtime) {
  if (sdkLocalRuntimeEventUnsubscribe || typeof runtime?.subscribeEvents !== 'function') {
    return;
  }
  sdkLocalRuntimeEventUnsubscribe = runtime.subscribeEvents((payload) => {
    sdkLocalRuntimeEventHandler?.(payload);
  });
}

async function ensureSdkLocalRuntime() {
  if (!sdkLocalRuntimeProvider) {
    throw new Error('Windie SDK local runtime provider is not initialized.');
  }
  if (sdkLocalRuntime) {
    return sdkLocalRuntime;
  }
  const runtime = await sdkLocalRuntimeProvider({
    wakeUp: {},
    needsLocalRuntime: true,
  });
  if (!runtime) {
    throw new Error('Windie SDK local runtime provider did not return a runtime.');
  }
  sdkLocalRuntime = runtime;
  sdkSidecarSnapshot = {
    provider: 'sdk',
    hasClient: true,
    ...(sdkSidecarSnapshot?.discoveryPath ? { discoveryPath: sdkSidecarSnapshot.discoveryPath } : {}),
  };
  attachSdkLocalRuntimeEvents(runtime);
  if (!daemonBackendProcessRef) {
    daemonBackendProcessRef = { kind: 'sdk-sidecar-daemon' };
    localBackendSupervisor.attachProcess(daemonBackendProcessRef);
  }
  if (sdkStatusMainWindow && daemonBackendProcessRef) {
    markBackendReady(sdkStatusMainWindow);
  }
  return runtime;
}

function createSdkRpcRequestId() {
  return `electron-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sendRequest(method, params = {}) {
  if (!sdkLocalRuntimeProvider) {
    return Promise.reject(new Error('Windie SDK local runtime provider is not initialized.'));
  }
  return ensureSdkLocalRuntime().then(runtime => runtime.rpc({
    id: createSdkRpcRequestId(),
    method,
    params,
  }));
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

function stopLocalBackend() {
  runtimeExecuteTool = createStoppedToolExecutor();
  if (sdkLocalRuntime && typeof sdkLocalRuntime.shutdown === 'function') {
    void sdkLocalRuntime.shutdown();
  }
  clearDaemonRuntime();
  localBackendSupervisor.clear({
    status: 'stopped',
    error: '',
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
  sdkLocalRuntimeEventHandler = (payload) => {
    broadcastConversationMetadataInvalidation(resolveWindows, payload);
  };
  const sidecarLaunchPlan = options.autoSidecarLaunchPlan || (
    isTestEnv
      ? null
      : createDesktopAutoSidecarLaunchPlan({
          isPackaged,
          backendEndpoints,
          permissionStatePath: options.permissionStatePath,
          authStatePath: options.authStatePath,
          WebSocketImpl: options.WebSocketImpl,
        })
  );
  if (options.localRuntimeProvider) {
    sdkLocalRuntimeProvider = options.localRuntimeProvider;
    sdkSidecarSnapshot = {
      provider: 'sdk',
      hasClient: false,
    };
  } else if (sidecarLaunchPlan?.ok === true) {
    sdkLocalRuntimeProvider = createWindieLocalRuntimeProvider(sidecarLaunchPlan.options);
    sdkSidecarSnapshot = {
      provider: 'sdk',
      hasClient: false,
      discoveryPath: sidecarLaunchPlan.options.discoveryFile || null,
    };
  } else {
    sdkLocalRuntimeProvider = null;
    sdkSidecarSnapshot = sidecarLaunchPlan && sidecarLaunchPlan.ok === false
      ? {
          provider: 'sdk',
          hasClient: false,
          error: sidecarLaunchPlan.error || 'Sidecar daemon launch is unavailable.',
        }
      : null;
  }
  const sidecarDaemonClient = options.sidecarDaemonClient || (
    sdkLocalRuntimeProvider
      ? {
          executeTool: async (payload) => {
            const runtime = await ensureSdkLocalRuntime();
            if (typeof runtime.executeTool !== 'function') {
              throw new Error('Windie SDK local runtime does not support tool execution.');
            }
            return runtime.executeTool(payload);
          },
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
  sdkStatusMainWindow = mainWindow;
  if (sdkLocalRuntimeProvider) {
    localBackendSupervisor.clear({
      status: 'stopped',
      error: '',
    });
  } else {
    sendLocalBackendStatus(mainWindow, {
      ready: false,
      error: sidecarLaunchPlan?.error || 'Windie SDK local runtime provider is unavailable.',
    });
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
    sidecarDaemonSnapshot: sdkSidecarSnapshot,
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
