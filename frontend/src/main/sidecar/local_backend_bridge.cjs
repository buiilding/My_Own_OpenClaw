/**
 * Bridges local backend behavior for the Electron main process.
 */

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
const {
  appendDiagnosticEvent,
  BROWSER_SESSION_CONTROL_DIAGNOSTICS_PATH,
} = require('../diagnostics/app_diagnostics_store.cjs');
const {
  appendLocalBackendLifecycleDiagnostic,
} = require('../diagnostics/app_diagnostics_runtime.cjs');
const { createLocalBackendSupervisor } = require('./local_backend_supervisor.cjs');

const BROWSER_CONTROL_EXPLANATION = 'Manage the dedicated browser session from the chat header.';
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
const localRuntimeStatusSupervisor = createLocalBackendSupervisor();
let sdkLocalRuntime = null;
let sdkLocalRuntimeEventUnsubscribe = null;
let sdkLocalRuntimeEventHandler = null;
let sdkLocalRuntimeSnapshot = null;
let sdkStatusMainWindow = null;
let getKnownLocalRuntime = null;
let ensureLocalRuntime = null;

function createBrowserSessionDiagnosticId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function appendBrowserSessionDiagnostic(input = {}) {
  try {
    appendDiagnosticEvent({
      path: BROWSER_SESSION_CONTROL_DIAGNOSTICS_PATH,
      ...input,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[LocalBackend] Browser session diagnostic failed: ${getErrorMessage(error)}`);
    }
  }
}

function buildLocalRuntimeDiagnosticData(extra = {}) {
  const snapshot = localRuntimeStatusSupervisor.getSnapshot();
  return {
    ready: snapshot.ready === true,
    status: typeof snapshot.status === 'string' ? snapshot.status : 'stopped',
    hasResolver: Boolean(ensureLocalRuntime),
    hasKnownRuntime: Boolean(resolveKnownLocalRuntime({ quiet: true })),
    hasClient: Boolean(sdkLocalRuntime),
    hasDiscoveryPath: Boolean(sdkLocalRuntimeSnapshot?.discoveryPath),
    ...extra,
  };
}

function buildCurrentLocalBackendStatusPayload() {
  return buildLocalBackendStatusPayload({
    supervisor: localRuntimeStatusSupervisor,
    localRuntimeSnapshot: sdkLocalRuntimeSnapshot,
  });
}

function publishLocalBackendStatus(mainWindow, diagnostic = {}) {
  const payload = buildCurrentLocalBackendStatusPayload();
  sendLocalBackendStatus(mainWindow, payload);
  appendBrowserSessionDiagnostic({
    traceId: diagnostic.traceId,
    requestId: diagnostic.requestId,
    stage: diagnostic.stage || 'status_broadcast',
    status: diagnostic.status || 'succeeded',
    runtime: 'electron-main',
    durationMs: diagnostic.durationMs,
    data: buildLocalRuntimeDiagnosticData(diagnostic.data),
    error: diagnostic.error,
  });
  return payload;
}

function markBackendReady(mainWindow, diagnostic = {}) {
  localRuntimeStatusSupervisor.markReady();
  return publishLocalBackendStatus(mainWindow, {
    stage: 'status_broadcast',
    status: 'succeeded',
    ...diagnostic,
  });
}

function clearSdkLocalRuntime() {
  sdkLocalRuntimeEventUnsubscribe?.();
  sdkLocalRuntimeEventUnsubscribe = null;
  sdkLocalRuntime = null;
  sdkLocalRuntimeSnapshot = null;
  sdkStatusMainWindow = null;
  getKnownLocalRuntime = null;
  ensureLocalRuntime = null;
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

function resolveKnownLocalRuntime({ quiet = false } = {}) {
  if (typeof getKnownLocalRuntime !== 'function') {
    return null;
  }
  try {
    const runtime = getKnownLocalRuntime();
    return runtime && typeof runtime === 'object' ? runtime : null;
  } catch (error) {
    if (!quiet && process.env.NODE_ENV !== 'production') {
      console.warn(`[LocalBackend] Known SDK local runtime lookup failed: ${getErrorMessage(error)}`);
    }
    return null;
  }
}

function rememberSdkLocalRuntime(runtime, {
  source = 'sdk-client',
  discoveryPath = null,
} = {}) {
  const isNewRuntime = sdkLocalRuntime !== runtime;
  if (sdkLocalRuntime && isNewRuntime) {
    sdkLocalRuntimeEventUnsubscribe?.();
    sdkLocalRuntimeEventUnsubscribe = null;
  }
  sdkLocalRuntime = runtime;
  sdkLocalRuntimeSnapshot = {
    provider: 'sdk',
    hasClient: true,
    source: typeof source === 'string' ? source : 'sdk-client',
    ...(
      discoveryPath || sdkLocalRuntimeSnapshot?.discoveryPath
        ? { discoveryPath: discoveryPath || sdkLocalRuntimeSnapshot.discoveryPath }
        : {}
    ),
  };
  attachSdkLocalRuntimeEvents(runtime);
  if (isNewRuntime || !localRuntimeStatusSupervisor.getSnapshot().process) {
    localRuntimeStatusSupervisor.attachProcess({ kind: 'sdk-local-runtime' });
  }
  if (sdkStatusMainWindow) {
    markBackendReady(sdkStatusMainWindow);
  }
  return runtime;
}

async function ensureSdkLocalRuntime(reason = 'local-runtime') {
  const knownRuntime = resolveKnownLocalRuntime();
  if (knownRuntime) {
    if (knownRuntime === sdkLocalRuntime) {
      return sdkLocalRuntime;
    }
    return rememberSdkLocalRuntime(knownRuntime, {
      source: 'sdk-client-known',
    });
  }
  if (sdkLocalRuntime) {
    return sdkLocalRuntime;
  }
  if (typeof ensureLocalRuntime !== 'function') {
    throw new Error('Windie SDK local runtime resolver is not initialized.');
  }
  const runtime = await ensureLocalRuntime({ reason });
  if (!runtime) {
    throw new Error('Windie SDK local runtime resolver did not return a runtime.');
  }
  return rememberSdkLocalRuntime(runtime, {
    source: 'sdk-client',
    discoveryPath: sdkLocalRuntimeSnapshot?.discoveryPath || null,
  });
}

async function wakeSdkLocalRuntimeForStatus(mainWindow) {
  const traceId = createBrowserSessionDiagnosticId('browser-session');
  const requestId = createBrowserSessionDiagnosticId('status');
  const startedAt = Date.now();
  appendBrowserSessionDiagnostic({
    traceId,
    requestId,
    stage: 'status_bootstrap',
    status: 'started',
    runtime: 'electron-main',
    data: buildLocalRuntimeDiagnosticData({
      wakeRequested: Boolean(ensureLocalRuntime && !sdkLocalRuntime),
      alreadyReady: sdkLocalRuntime && localRuntimeStatusSupervisor.getSnapshot().ready === true,
    }),
  });

  if (!ensureLocalRuntime && !resolveKnownLocalRuntime({ quiet: true })) {
    const payload = buildCurrentLocalBackendStatusPayload();
    appendBrowserSessionDiagnostic({
      traceId,
      requestId,
      stage: 'status_bootstrap',
      status: 'failed',
      runtime: 'electron-main',
      durationMs: Date.now() - startedAt,
      data: buildLocalRuntimeDiagnosticData({
        wakeSucceeded: false,
      }),
      error: payload.error || 'Windie SDK local runtime resolver is unavailable.',
    });
    return payload;
  }

  if (sdkLocalRuntime && localRuntimeStatusSupervisor.getSnapshot().ready === true) {
    appendBrowserSessionDiagnostic({
      traceId,
      requestId,
      stage: 'status_bootstrap',
      status: 'succeeded',
      runtime: 'electron-main',
      durationMs: Date.now() - startedAt,
      data: buildLocalRuntimeDiagnosticData({
        alreadyReady: true,
        wakeSucceeded: true,
      }),
    });
    return buildCurrentLocalBackendStatusPayload();
  }

  try {
    await ensureSdkLocalRuntime('status_bootstrap');
    const payload = buildCurrentLocalBackendStatusPayload();
    appendBrowserSessionDiagnostic({
      traceId,
      requestId,
      stage: 'status_bootstrap',
      status: 'succeeded',
      runtime: 'electron-main',
      durationMs: Date.now() - startedAt,
      data: buildLocalRuntimeDiagnosticData({
        wakeSucceeded: payload.ready === true,
      }),
    });
    return payload;
  } catch (error) {
    const message = getErrorMessage(error);
    localRuntimeStatusSupervisor.clear({
      status: 'error',
      error: message,
    });
    const payload = publishLocalBackendStatus(mainWindow, {
      traceId,
      requestId,
      stage: 'status_broadcast',
      status: 'failed',
      error: message,
    });
    appendBrowserSessionDiagnostic({
      traceId,
      requestId,
      stage: 'status_bootstrap',
      status: 'failed',
      runtime: 'electron-main',
      durationMs: Date.now() - startedAt,
      data: buildLocalRuntimeDiagnosticData({
        wakeSucceeded: false,
      }),
      error: message,
    });
    return payload;
  }
}

function createSdkRpcRequestId() {
  return `electron-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sendRequest(method, params = {}) {
  return ensureSdkLocalRuntime(`rpc:${method}`).then((runtime) => {
    if (typeof runtime.rpc !== 'function') {
      throw new Error(`Windie SDK local runtime does not support RPC method ${method}.`);
    }
    return runtime.rpc({
      id: createSdkRpcRequestId(),
      method,
      params,
    });
  });
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
  clearSdkLocalRuntime();
  localRuntimeStatusSupervisor.clear({
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
  getKnownLocalRuntime = typeof options.getKnownLocalRuntime === 'function'
    ? options.getKnownLocalRuntime
    : null;
  ensureLocalRuntime = typeof options.ensureLocalRuntime === 'function'
    ? options.ensureLocalRuntime
    : null;
  sdkLocalRuntimeEventHandler = (payload) => {
    broadcastConversationMetadataInvalidation(resolveWindows, payload);
  };
  const sdkLocalToolExecutor = options.sdkLocalToolExecutor || (
    {
      executeTool: async (payload) => {
        const runtime = await ensureSdkLocalRuntime('execute_tool');
        if (typeof runtime.executeTool !== 'function') {
          throw new Error('Windie SDK local runtime does not support tool execution.');
        }
        return runtime.executeTool(payload);
      },
    }
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
    sdkLocalToolExecutor,
  });

  const [mainWindow] = resolveWindows();
  sdkStatusMainWindow = mainWindow;
  if (ensureLocalRuntime || resolveKnownLocalRuntime({ quiet: true })) {
    sdkLocalRuntimeSnapshot = {
      provider: 'sdk',
      hasClient: false,
      source: 'sdk-client',
    };
    localRuntimeStatusSupervisor.clear({
      status: 'stopped',
      error: '',
    });
  } else {
    sdkLocalRuntimeSnapshot = {
      provider: 'sdk',
      hasClient: false,
      error: 'Windie SDK local runtime resolver is unavailable.',
    };
    localRuntimeStatusSupervisor.clear({
      status: 'error',
      error: 'Windie SDK local runtime resolver is unavailable.',
    });
    publishLocalBackendStatus(mainWindow, {
      stage: 'status_broadcast',
      status: 'failed',
      error: 'Windie SDK local runtime resolver is unavailable.',
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
    const traceId = createBrowserSessionDiagnosticId('browser-session');
    const requestId = createBrowserSessionDiagnosticId('browser-action');
    const startedAt = Date.now();
    appendBrowserSessionDiagnostic({
      traceId,
      requestId,
      stage: 'browser_action',
      status: 'started',
      runtime: 'electron-main',
      data: buildLocalRuntimeDiagnosticData({
        action,
      }),
    });
    try {
      const result = await executeToolRuntime.executeTool(event, {
        toolName: 'browser',
        args: {
          action,
          explanation: BROWSER_CONTROL_EXPLANATION,
          ...extras,
        },
      });
      const resultData = result?.data && typeof result.data === 'object' ? result.data : {};
      const tabs = Array.isArray(resultData.tabs) ? resultData.tabs : [];
      appendBrowserSessionDiagnostic({
        traceId,
        requestId,
        stage: 'browser_action',
        status: result?.success === false ? 'failed' : 'succeeded',
        runtime: 'electron-main',
        durationMs: Date.now() - startedAt,
        data: buildLocalRuntimeDiagnosticData({
          action,
          success: result?.success === true,
          connected: resultData.connected === true,
          tabCount: Number.isFinite(resultData.tab_count) ? resultData.tab_count : tabs.length,
          responseKeyCount: Object.keys(resultData).length,
        }),
        error: result?.success === false ? result?.error : null,
      });
      return result;
    } catch (error) {
      appendBrowserSessionDiagnostic({
        traceId,
        requestId,
        stage: 'browser_action',
        status: 'failed',
        runtime: 'electron-main',
        durationMs: Date.now() - startedAt,
        data: buildLocalRuntimeDiagnosticData({
          action,
          success: false,
        }),
        error,
      });
      throw error;
    }
  });
  ipcMain.handle('get-local-backend-status', async () => wakeSdkLocalRuntimeForStatus(mainWindow));

  runtimeScreenCaptureCapabilityVerifier = executeToolRuntime.createScreenCaptureCapabilityVerifier();
  runtimeExecuteTool = async (payload = {}) => executeToolRuntime.executeTool(null, payload);

  ipcMain.handle('get-system-state', async (event, { fields } = {}) => {
    return getSystemStateFromBackend(fields);
  });

  ipcMain.handle('search-memory', async (event, payload = {}) => (
    sendMemorySearchRequest(payload)
  ));

  registerMappedRpcHandlers(registerRpcHandler, COMPILED_RPC_HANDLER_DEFINITIONS);

  appendLocalBackendLifecycleDiagnostic({
    action: 'bridge_initialized',
    status: 'succeeded',
    ...buildLocalRuntimeDiagnosticData(),
  });
  if (process.env.WINDIE_DEBUG_LOCAL_BACKEND_STDOUT === '1') {
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
