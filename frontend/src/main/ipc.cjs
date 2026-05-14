const {
  ipcMain,
  shell,
  Menu,
  BrowserWindow,
  screen,
  clipboard,
  nativeImage,
} = require('electron');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const {
  getLocalBackendStatus,
  getSystemState,
  searchMemory,
  storeMemory,
} = require('./local_backend_bridge.cjs');
const {
  resolveBackendEndpointCandidates,
  resolveBackendEndpoints,
  resolvePreferredArtifactHttpUrl,
} = require('./backend_endpoints.cjs');
const {
  loadFrontendConfigFromDisk,
  saveFrontendConfigToDisk,
} = require('./ipc/ipc_frontend_config.cjs');
const {
  loadInstallAuthStateFromDisk,
  registerInstallWithBackend,
  saveInstallAuthStateToDisk,
} = require('./ipc/ipc_install_auth_state.cjs');
const {
  clearPendingSettingsSyncs,
  isValidConfigPayload,
  resolveSettingsSync,
  waitForSettingsAck,
} = require('./ipc/ipc_settings_sync.cjs');
const {
  fetchArtifactImage,
} = require('./ipc/ipc_artifact_fetch.cjs');
const { persistMemoryStoreEvent } = require('./ipc/ipc_memory_store_persistence.cjs');
const { buildQueryPayloadContent } = require('./query_payload_builder.cjs');
const {
  resolveConversationRef: resolveConversationRefFromPayload,
  buildLocalUserMessage,
  buildQuerySendFailure,
} = require('./ipc/ipc_query_events.cjs');
const {
  normalizeBackendPayload,
  processBackendMessageData,
  runBeforeOverlayQueryCapture,
  uploadArtifact,
} = require('./ipc/ipc_runtime_helpers.cjs');
const {
  buildQueryPayload,
  prepareAutomatedQueryPayload,
  prepareRendererQueryPayload,
} = require('./ipc/ipc_query_runtime.cjs');
const {
  resolveWorkspaceRepoInstructionMessages,
  resolveWorkspaceRepoInstructionPromptLayers,
} = require('./repo_instruction_runtime.cjs');
const {
  loadExtensionPromptLayers,
} = require('./extension_manifest.cjs');
const {
  handleRendererQuerySendFailure,
  prepareRendererQuerySend,
} = require('./ipc/ipc_query_send_runtime.cjs');
const {
  trackRendererWindow: trackRendererWindowRuntime,
  broadcastToRenderers: broadcastToRenderersRuntime,
} = require('./ipc/ipc_renderer_windows.cjs');
const {
  broadcastLocalUserMessage: broadcastLocalUserMessageRuntime,
  broadcastQuerySendFailure: broadcastQuerySendFailureRuntime,
} = require('./ipc/ipc_query_broadcast.cjs');
const {
  createResponseOverlayPhaseState,
} = require('./ipc/ipc_overlay_phase_state.cjs');
const {
  createIpcEventReplayState,
} = require('./ipc/ipc_event_replay_state.cjs');
const {
  loginOpenAICodexOAuth,
  logoutOpenAICodexOAuth,
} = require('./openai_codex_oauth.cjs');
const {
  registerClipboardImageHandler,
} = require('./ipc/ipc_clipboard_image.cjs');
const {
  registerImageContextMenuHandler,
} = require('./ipc/ipc_image_context_menu.cjs');
const {
  resolveActiveSurfaceDisplayAffinity,
  setActiveDisplayAffinity,
} = require('./display_affinity_runtime.cjs');
const {
  applyTranscriptSessionSync,
} = require('./ipc/ipc_transcript_session_sync.cjs');
const {
  isAgentLoopStopShortcutPhase,
} = require('./agent_stop_shortcut_runtime.cjs');
const {
  buildAgentCapabilityHandshakePayload,
} = require('./agent_capability_handshake.cjs');
const { logChatPillMainTrace } = require('./chat_pill_trace_runtime.cjs');

let BACKEND_ENDPOINTS = resolveBackendEndpoints();
let BACKEND_URL = BACKEND_ENDPOINTS.wsUrl;
let BACKEND_HTTP_URL = BACKEND_ENDPOINTS.httpUrl;
let BACKEND_ENDPOINT_CANDIDATES = [BACKEND_ENDPOINTS];
let activeBackendEndpointIndex = 0;
const SETTINGS_SYNC_TIMEOUT_MS = 2500;
const BACKEND_RECONNECT_INTERVAL_MS = 1000;
const BACKEND_CONNECT_TIMEOUT_MS = 10000;
const BACKEND_IDLE_DISCONNECT_TIMEOUT_MS = 30 * 60 * 1000;
let ws = null;
let rendererWindows = new Set();
let isConnected = false;
let isFirstQuery = true;
let currentUserId = null;
let currentInstallId = null;
let currentInstallToken = null;
let currentSessionId = null;
let currentServerUserId = null;
let currentConversationRef = null;
let latestFrontendConfig = null;
let hasAttemptedInitialSettingsSync = false;
let pendingSettingsSyncPromise = null;
const pendingSettingsSyncs = new Map();
let hasPendingListModelsRequest = false;
const backendMessageObservers = new Set();
const pendingBackendConnectWaiters = new Set();
let applyResponseOverlayPhase = null;
let onBeforeOverlayQueryCapture = null;
let setAgentLoopStopShortcutEnabled = null;
let setGlobalAgentStopShortcutAccelerator = null;
let currentGlobalAgentStopShortcutStatus = null;
let backendReconnectTimer = null;
let backendIdleDisconnectTimer = null;
let shouldMaintainBackendConnection = false;
let intentionalSocketCloseReason = null;
let pendingInstallAuthStatePromise = null;
const responseOverlayPhaseState = createResponseOverlayPhaseState();
const ipcEventReplayState = createIpcEventReplayState();

function applyInstallAuthState(state) {
  if (!state || typeof state !== 'object') {
    return null;
  }
  const installToken = typeof state.installToken === 'string' ? state.installToken.trim() : '';
  const userId = typeof state.userId === 'string' ? state.userId.trim() : '';
  const installId = typeof state.installId === 'string' ? state.installId.trim() : '';
  if (!installToken || !userId || !installId) {
    return null;
  }
  currentInstallToken = installToken;
  currentInstallId = installId;
  currentUserId = userId;
  if (!currentServerUserId) {
    currentServerUserId = userId;
  }
  return {
    installToken,
    userId,
    installId,
  };
}

function buildInstallAuthHeaders() {
  if (typeof currentInstallToken !== 'string' || !currentInstallToken) {
    return {};
  }
  return {
    Authorization: `Bearer ${currentInstallToken}`,
  };
}

async function ensureInstallAuthState() {
  const currentState = applyInstallAuthState({
    installToken: currentInstallToken,
    userId: currentUserId,
    installId: currentInstallId,
  });
  if (currentState) {
    return currentState;
  }
  if (pendingInstallAuthStatePromise) {
    return pendingInstallAuthStatePromise;
  }

  pendingInstallAuthStatePromise = (async () => {
    const cachedState = applyInstallAuthState(await loadInstallAuthStateFromDisk(log));
    if (cachedState) {
      return cachedState;
    }

    let lastError = null;
    for (let index = 0; index < BACKEND_ENDPOINT_CANDIDATES.length; index += 1) {
      const candidate = BACKEND_ENDPOINT_CANDIDATES[index];
      try {
        const registeredState = await registerInstallWithBackend({
          backendHttpUrl: candidate.httpUrl,
          operatingSystem: resolveFrontendOperatingSystem(process.platform),
          log,
        });
        const persistResult = await saveInstallAuthStateToDisk(registeredState, log);
        if (!persistResult?.success) {
          throw new Error(persistResult?.error || 'Failed to persist install auth state');
        }
        setActiveBackendEndpoint(index);
        return applyInstallAuthState(registeredState);
      } catch (error) {
        lastError = error;
        log(`Install registration failed against ${candidate.httpUrl}: ${error?.message || error}`);
      }
    }
    throw lastError || new Error('Failed to register install with backend');
  })().finally(() => {
    pendingInstallAuthStatePromise = null;
  });

  return pendingInstallAuthStatePromise;
}

function resolveFrontendOperatingSystem(platformName = process.platform) {
  switch (platformName) {
    case 'darwin':
      return 'macOS';
    case 'win32':
      return 'Windows';
    case 'linux':
      return 'Linux';
    default:
      return typeof platformName === 'string' && platformName.trim().length > 0
        ? platformName.trim()
        : null;
  }
}

function normalizeGlobalAgentStopShortcutStatus(status) {
  if (!status || typeof status !== 'object' || Array.isArray(status)) {
    return null;
  }

  const normalizeAccelerator = (value) => {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  };

  const supportedAccelerators = Array.isArray(status.supportedAccelerators)
    ? status.supportedAccelerators
      .filter((value) => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim())
    : [];

  return {
    enabled: status.enabled === true,
    requestedAccelerator: normalizeAccelerator(status.requestedAccelerator),
    resolvedAccelerator: normalizeAccelerator(status.resolvedAccelerator),
    registeredAccelerator: normalizeAccelerator(status.registeredAccelerator),
    registrationFailed: status.registrationFailed === true,
    usingFallback: status.usingFallback === true,
    supportedAccelerators,
  };
}

function applyShortcutStatusFallbackToConfig(config) {
  if (!isValidConfigPayload(config)) {
    return config;
  }
  const resolvedAccelerator = currentGlobalAgentStopShortcutStatus?.resolvedAccelerator;
  if (
    currentGlobalAgentStopShortcutStatus?.registrationFailed === true
    || typeof resolvedAccelerator !== 'string'
    || !resolvedAccelerator
    || config.global_agent_stop_shortcut === resolvedAccelerator
  ) {
    return config;
  }
  return {
    ...config,
    global_agent_stop_shortcut: resolvedAccelerator,
  };
}

function refreshBackendEndpoints(options = {}) {
  BACKEND_ENDPOINT_CANDIDATES = resolveBackendEndpointCandidates(process.env, options);
  activeBackendEndpointIndex = 0;
  BACKEND_ENDPOINTS = BACKEND_ENDPOINT_CANDIDATES[0] || resolveBackendEndpoints(process.env, options);
  BACKEND_URL = BACKEND_ENDPOINTS.wsUrl;
  BACKEND_HTTP_URL = BACKEND_ENDPOINTS.httpUrl;
}

function setActiveBackendEndpoint(index) {
  const candidate = BACKEND_ENDPOINT_CANDIDATES[index];
  if (!candidate) {
    return false;
  }
  activeBackendEndpointIndex = index;
  BACKEND_ENDPOINTS = candidate;
  BACKEND_URL = candidate.wsUrl;
  BACKEND_HTTP_URL = candidate.httpUrl;
  return true;
}

function advanceToNextBackendEndpoint() {
  return setActiveBackendEndpoint(activeBackendEndpointIndex + 1);
}

function log(message) {
  // Only log in development - production logging adds overhead
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[IPC Bridge] ${message}`);
  }
}

function notifyBackendMessageObservers(data) {
  if (!data || typeof data !== 'object') {
    return;
  }
  for (const observer of backendMessageObservers) {
    try {
      observer(data);
    } catch (error) {
      log(`Backend message observer error: ${error}`);
    }
  }
}

async function loadCachedFrontendConfigFromDisk() {
  return loadFrontendConfigFromDisk(log);
}

async function persistFrontendConfigToDisk(config) {
  const result = await saveFrontendConfigToDisk(config, log);
  if (result?.success && config && typeof config === 'object' && !Array.isArray(config)) {
    latestFrontendConfig = { ...config };
  }
  return result;
}

function updateGlobalAgentStopShortcutStatus(status) {
  currentGlobalAgentStopShortcutStatus = normalizeGlobalAgentStopShortcutStatus(status);

  if (isValidConfigPayload(latestFrontendConfig)) {
    const nextConfig = applyShortcutStatusFallbackToConfig(latestFrontendConfig);
    if (nextConfig !== latestFrontendConfig) {
      void persistFrontendConfigToDisk(nextConfig);
    }
  }

  broadcastConnectionStatus(isConnected);
}

function resetSettingsSyncState() {
  hasAttemptedInitialSettingsSync = false;
  pendingSettingsSyncPromise = null;
  clearPendingSettingsSyncs(pendingSettingsSyncs);
}

function resetBackendSessionState() {
  currentSessionId = null;
  currentServerUserId = null;
  currentConversationRef = null;
}

function isActiveBackendLoopPhase(phase) {
  return (
    phase === 'awaiting-first-chunk'
    || phase === 'streaming'
    || phase === 'tool-call'
    || phase === 'tool-output'
  );
}

function clearBackendReconnectTimer() {
  if (backendReconnectTimer !== null) {
    clearTimeout(backendReconnectTimer);
    backendReconnectTimer = null;
  }
}

function scheduleBackendReconnect(delayMs = BACKEND_RECONNECT_INTERVAL_MS) {
  clearBackendReconnectTimer();
  backendReconnectTimer = setTimeout(() => {
    backendReconnectTimer = null;
    connect();
  }, delayMs);
}

function clearBackendIdleDisconnectTimer() {
  if (backendIdleDisconnectTimer !== null) {
    clearTimeout(backendIdleDisconnectTimer);
    backendIdleDisconnectTimer = null;
  }
}

function resolvePendingBackendConnectWaiters() {
  if (pendingBackendConnectWaiters.size === 0) {
    return;
  }
  for (const waiter of pendingBackendConnectWaiters) {
    clearTimeout(waiter.timeoutId);
    waiter.resolve(true);
  }
  pendingBackendConnectWaiters.clear();
}

function rejectPendingBackendConnectWaiters(error) {
  if (pendingBackendConnectWaiters.size === 0) {
    return;
  }
  for (const waiter of pendingBackendConnectWaiters) {
    clearTimeout(waiter.timeoutId);
    waiter.reject(error);
  }
  pendingBackendConnectWaiters.clear();
}

function syncBackendIdleDisconnectTimer(reason = 'idle-sync') {
  clearBackendIdleDisconnectTimer();
  if (!shouldMaintainBackendConnection) {
    return;
  }
  if (!isConnected || !ws || ws.readyState !== WebSocket.OPEN) {
    return;
  }
  if (isActiveBackendLoopPhase(responseOverlayPhaseState.getPhase())) {
    return;
  }
  backendIdleDisconnectTimer = setTimeout(() => {
    log(`Closing idle backend websocket after ${BACKEND_IDLE_DISCONNECT_TIMEOUT_MS}ms (${reason}).`);
    intentionalSocketCloseReason = 'idle-timeout';
    shouldMaintainBackendConnection = false;
    clearBackendReconnectTimer();
    clearBackendIdleDisconnectTimer();
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      ws.close();
    }
  }, BACKEND_IDLE_DISCONNECT_TIMEOUT_MS);
}

function noteBackendTraffic(reason = 'traffic') {
  if (!shouldMaintainBackendConnection) {
    return;
  }
  syncBackendIdleDisconnectTimer(reason);
}

function ensureBackendConnectionDemand() {
  shouldMaintainBackendConnection = true;
  clearBackendReconnectTimer();
  clearBackendIdleDisconnectTimer();
}

function waitForBackendConnection(reason = 'request', timeoutMs = BACKEND_CONNECT_TIMEOUT_MS) {
  if (isConnected && ws && ws.readyState === WebSocket.OPEN) {
    return Promise.resolve(true);
  }
  return new Promise((resolve, reject) => {
    const waiter = {
      resolve,
      reject,
      timeoutId: setTimeout(() => {
        pendingBackendConnectWaiters.delete(waiter);
        reject(new Error(`Timed out connecting to backend for ${reason}.`));
      }, timeoutMs),
    };
    pendingBackendConnectWaiters.add(waiter);
  });
}

async function ensureBackendConnection(reason = 'request', timeoutMs = BACKEND_CONNECT_TIMEOUT_MS) {
  ensureBackendConnectionDemand();
  await ensureInstallAuthState();
  if (isConnected && ws && ws.readyState === WebSocket.OPEN) {
    syncBackendIdleDisconnectTimer(`ensure:${reason}`);
    return true;
  }
  const waitPromise = waitForBackendConnection(reason, timeoutMs);
  connect();
  await waitPromise;
  syncBackendIdleDisconnectTimer(`connected:${reason}`);
  return true;
}

function buildIpcStatusPayload(connected) {
  return {
    isConnected: connected,
    userId: currentUserId,
    backendWsUrl: BACKEND_URL,
    backendHttpUrl: BACKEND_HTTP_URL,
    globalAgentStopShortcutStatus: currentGlobalAgentStopShortcutStatus,
  };
}

function buildBackendSettingsPayload(config) {
  if (!isValidConfigPayload(config)) {
    return null;
  }
  const backendConfig = { ...config };
  delete backendConfig.global_agent_stop_shortcut;
  return backendConfig;
}

function broadcastConnectionStatus(connected) {
  broadcastToRenderers('ipc-status', buildIpcStatusPayload(connected));
}

function queueListModelsRequest() {
  hasPendingListModelsRequest = true;
}

function flushPendingListModelsRequest() {
  if (!hasPendingListModelsRequest) {
    return;
  }
  const msgId = sendMessageToBackend('list-models', {});
  if (!msgId) {
    return;
  }
  hasPendingListModelsRequest = false;
}

async function sendSettingsUpdate(config, source = 'renderer') {
  const backendConfig = buildBackendSettingsPayload(config);
  if (!backendConfig) {
    return Promise.resolve(false);
  }
  latestFrontendConfig = { ...config };
  if (!isConnected || !ws || ws.readyState !== WebSocket.OPEN) {
    try {
      await ensureBackendConnection(`update-settings:${source}`);
    } catch (error) {
      log(`Failed to connect backend for update-settings: ${error?.message || error}`);
      return false;
    }
  }
  const msgId = sendMessageToBackend('update-settings', backendConfig);
  if (!msgId) {
    return Promise.resolve(false);
  }
  const ackPromise = waitForSettingsAck(
    pendingSettingsSyncs,
    msgId,
    source,
    log,
    SETTINGS_SYNC_TIMEOUT_MS,
  );
  pendingSettingsSyncPromise = ackPromise.finally(() => {
    if (pendingSettingsSyncPromise === ackPromise) {
      pendingSettingsSyncPromise = null;
    }
  });
  return pendingSettingsSyncPromise;
}

async function ensureInitialSettingsSync() {
  if (!isConnected) {
    return;
  }

  if (hasAttemptedInitialSettingsSync) {
    if (pendingSettingsSyncPromise) {
      await pendingSettingsSyncPromise;
    }
    return;
  }

  hasAttemptedInitialSettingsSync = true;

  if (pendingSettingsSyncPromise) {
    await pendingSettingsSyncPromise;
    return;
  }

  if (!isValidConfigPayload(latestFrontendConfig)) {
    latestFrontendConfig = await loadCachedFrontendConfigFromDisk();
  }

  if (isValidConfigPayload(latestFrontendConfig)) {
    await sendSettingsUpdate(latestFrontendConfig, 'initial-query-gate');
  }
}

function trackRendererWindow(win) {
  trackRendererWindowRuntime({
    win,
    rendererWindows,
    getResponseOverlayPhase: () => responseOverlayPhaseState.getPhase(),
    getReplayEvents: () => ipcEventReplayState.snapshot(),
  });
}

function broadcastToRenderers(channel, payload, sourceWebContents = null) {
  broadcastToRenderersRuntime({
    rendererWindows,
    channel,
    payload,
    sourceWebContents,
  });
}

function setResponseOverlayPhase(phase, source = 'ipc', metadata = null) {
  logChatPillMainTrace({
    source: 'ipc',
    action: 'set-phase',
    phase,
    correlationId: metadata?.correlation_id || null,
    reason: source,
  }, {
    getResponseOverlayPhase: () => responseOverlayPhaseState.getPhase(),
  });
  responseOverlayPhaseState.setPhase(phase, source, metadata, {
    onPhaseChange: applyResponseOverlayPhase,
    broadcastToRenderers,
    log,
  });
  if (typeof setAgentLoopStopShortcutEnabled === 'function') {
    setAgentLoopStopShortcutEnabled(
      isAgentLoopStopShortcutPhase(responseOverlayPhaseState.getPhase()),
    );
  }
  syncBackendIdleDisconnectTimer(`phase:${phase}`);
}

function connect() {
  if (!shouldMaintainBackendConnection) {
    return;
  }
  if (
    ws &&
    (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)
  ) {
    log('WebSocket already open or connecting.');
    return;
  }
  log(`Attempting to connect to Python backend at ${BACKEND_URL}...`);
  const socket = new WebSocket(BACKEND_URL, {
    origin: BACKEND_ENDPOINTS.wsOrigin,
    headers: buildInstallAuthHeaders(),
  });
  ws = socket;
  let opened = false;

  socket.on('open', async () => {
    if (ws !== socket) {
      return;
    }
    opened = true;
    isConnected = true;
    isFirstQuery = true;
    resetSettingsSyncState();
    setResponseOverlayPhase('idle', 'ws-open');
    ipcEventReplayState.clear();
    clearBackendReconnectTimer();
    log('Successfully connected to Python backend.');

    let sidecarToolManifest = null;
    try {
      const localBackendStatus = await getLocalBackendStatus();
      sidecarToolManifest = localBackendStatus?.success === true
        ? localBackendStatus.data?.tool_manifest
        : null;
    } catch (error) {
      log(`Unable to load sidecar tool manifest before handshake: ${error?.message || error}`);
    }

    if (ws !== socket) {
      return;
    }

    const handshakeMessage = {
      type: 'handshake',
      user_id: currentUserId,
      operating_system: resolveFrontendOperatingSystem(process.platform),
      ...buildAgentCapabilityHandshakePayload({
        disabledTools: latestFrontendConfig?.agent_disabled_local_tools,
        availableCoordinateMethods: latestFrontendConfig?.agent_coordinate_methods,
        sidecarToolManifest,
        requestedAgentPolicy: {
          disabled_tools: latestFrontendConfig?.agent_disabled_remote_tools,
          coordinate_methods: latestFrontendConfig?.agent_coordinate_methods,
        },
      }),
    };
    try {
      ws.send(JSON.stringify(handshakeMessage));
      log(`Handshake sent with authenticated user_id: ${currentUserId}`);
      broadcastConnectionStatus(true);
      resolvePendingBackendConnectWaiters();
      noteBackendTraffic('ws-open');
      flushPendingListModelsRequest();
    } catch (error) {
      log(`Error sending handshake: ${error}`);
      rejectPendingBackendConnectWaiters(error);
    }
  });

  socket.on('message', (message) => {
    if (ws !== socket) {
      return;
    }
    try {
      const data = JSON.parse(message);
      ipcEventReplayState.appendForActiveTurn(data);
      noteBackendTraffic(`message:${data?.type || 'unknown'}`);
      notifyBackendMessageObservers(data);
      processBackendMessageData(data, {
        setCurrentSessionId: (value) => {
          currentSessionId = value;
        },
        setCurrentServerUserId: (value) => {
          currentServerUserId = value;
        },
        setCurrentConversationRef: (value) => {
          currentConversationRef = value;
        },
        resolveSettingsSync: (msgId, wasSuccessful) => {
          resolveSettingsSync(pendingSettingsSyncs, msgId, wasSuccessful);
        },
        setResponseOverlayPhase,
        getResponseOverlayPhase: () => responseOverlayPhaseState.getPhase(),
        onMemoryStoreEvent: (eventData) => {
          persistMemoryStoreEvent(eventData, { storeMemory, log });
        },
        broadcastToRenderers,
        log,
      });
    } catch (error) {
      log(`Error parsing message from backend: ${error}`);
    }
  });

  socket.on('close', () => {
    if (ws !== socket) {
      return;
    }
    isConnected = false;
    resetSettingsSyncState();
    resetBackendSessionState();
    setResponseOverlayPhase('idle', 'ws-close');
    ipcEventReplayState.clear();
    const closeReason = intentionalSocketCloseReason;
    intentionalSocketCloseReason = null;
    clearBackendIdleDisconnectTimer();
    const shouldReconnect = shouldMaintainBackendConnection && !closeReason;
    if (!opened && shouldReconnect && advanceToNextBackendEndpoint()) {
      log(`Primary backend unavailable. Falling back to ${BACKEND_URL}.`);
      broadcastConnectionStatus(false);
      ws = null;
      scheduleBackendReconnect(0);
      return;
    }
    if (shouldReconnect) {
      log('Disconnected from Python backend. Attempting to reconnect...');
    } else {
      log(`Disconnected from Python backend (${closeReason || 'idle'}).`);
    }
    broadcastConnectionStatus(false);
    ws = null;
    if (!shouldReconnect && !opened) {
      rejectPendingBackendConnectWaiters(
        new Error(`Backend websocket closed before connecting (${closeReason || 'not-demanded'}).`),
      );
      return;
    }
    if (shouldReconnect) {
      scheduleBackendReconnect(BACKEND_RECONNECT_INTERVAL_MS);
    }
  });

  socket.on('error', (error) => {
    if (ws !== socket) {
      return;
    }
    log(`WebSocket error: ${error.message}`);
    if (!opened && shouldMaintainBackendConnection && advanceToNextBackendEndpoint()) {
      log(`Primary backend unavailable. Falling back to ${BACKEND_URL}.`);
      ws = null;
      connect();
      return;
    }
    if (!opened && !shouldMaintainBackendConnection) {
      rejectPendingBackendConnectWaiters(error);
    }
    if (socket.readyState === WebSocket.OPEN) {
      socket.close();
    }
  });
}

function sendMessageToBackend(type, payload, messageId = null) {
  if (!isConnected || !ws || ws.readyState !== WebSocket.OPEN) {
    log('Cannot send message: WebSocket is not connected.');
    return null;
  }

  if (!currentUserId) {
    log('Cannot send message: user_id not set (handshake may have failed).');
    return null;
  }

  const msgId = messageId || uuidv4();
  const normalizedPayload = normalizeBackendPayload(type, payload);
  const message = {
    id: msgId,
    type,
    payload: normalizedPayload,
    user_id: currentUserId,
    timestamp: new Date().toISOString(),
  };

  try {
    ws.send(JSON.stringify(message));
    // Only log errors, not every message
    noteBackendTraffic(`send:${type}`);
    return msgId;
  } catch (error) {
    log(`Error sending message to backend: ${error}`);
    return null;
  }
}

function shutdownIpcForTests() {
  shouldMaintainBackendConnection = false;
  intentionalSocketCloseReason = 'test-shutdown';
  clearBackendReconnectTimer();
  clearBackendIdleDisconnectTimer();
  rejectPendingBackendConnectWaiters(new Error('IPC bridge shutdown.'));
  resetSettingsSyncState();
  resetBackendSessionState();
  hasPendingListModelsRequest = false;
  rendererWindows = new Set();
  backendMessageObservers.clear();
  applyResponseOverlayPhase = null;
  onBeforeOverlayQueryCapture = null;
  setAgentLoopStopShortcutEnabled = null;
  setGlobalAgentStopShortcutAccelerator = null;
  pendingInstallAuthStatePromise = null;
  const socket = ws;
  ws = null;
  isConnected = false;
  if (
    socket
    && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
    && typeof socket.close === 'function'
  ) {
    socket.close();
  }
}

function initializeIpc(win, options = {}) {
  refreshBackendEndpoints({
    isPackaged: options.isPackaged === true,
  });
  applyResponseOverlayPhase = typeof options.applyResponseOverlayPhase === 'function'
    ? options.applyResponseOverlayPhase
    : null;
  onBeforeOverlayQueryCapture = typeof options.onBeforeOverlayQueryCapture === 'function'
    ? options.onBeforeOverlayQueryCapture
    : null;
  setAgentLoopStopShortcutEnabled =
    typeof options.setAgentLoopStopShortcutEnabled === 'function'
      ? options.setAgentLoopStopShortcutEnabled
      : null;
  setGlobalAgentStopShortcutAccelerator =
    typeof options.setGlobalAgentStopShortcutAccelerator === 'function'
      ? options.setGlobalAgentStopShortcutAccelerator
      : null;
  const getWindows = typeof options.getWindows === 'function'
    ? options.getWindows
    : () => ({ mainWindow: win, chatWindow: null });
  rendererWindows = new Set();
  trackRendererWindow(win);
  loadInstallAuthStateFromDisk(log)
    .then((state) => {
      applyInstallAuthState(state);
    })
    .catch(() => {});
  loadCachedFrontendConfigFromDisk()
    .then((config) => {
      if (!isValidConfigPayload(config)) {
        return;
      }
      latestFrontendConfig = applyShortcutStatusFallbackToConfig({ ...config });
      if (typeof setGlobalAgentStopShortcutAccelerator === 'function') {
        setGlobalAgentStopShortcutAccelerator(latestFrontendConfig.global_agent_stop_shortcut);
      }
    })
    .catch(() => {});
  if (typeof setAgentLoopStopShortcutEnabled === 'function') {
    setAgentLoopStopShortcutEnabled(
      isAgentLoopStopShortcutPhase(responseOverlayPhaseState.getPhase()),
    );
  }

  ipcMain.handle('load-frontend-config', async () => {
    const config = await loadCachedFrontendConfigFromDisk();
    if (isValidConfigPayload(config)) {
      latestFrontendConfig = applyShortcutStatusFallbackToConfig({ ...config });
      if (typeof setGlobalAgentStopShortcutAccelerator === 'function') {
        setGlobalAgentStopShortcutAccelerator(latestFrontendConfig.global_agent_stop_shortcut);
      }
    }
    return latestFrontendConfig;
  });

  ipcMain.handle('get-client-user-id', async () => {
    return {
      userId: currentUserId,
      conversationRef: currentConversationRef,
      serverUserId: currentServerUserId,
      sessionId: currentSessionId,
      isConnected,
      backendWsUrl: BACKEND_URL,
      backendHttpUrl: BACKEND_HTTP_URL,
      globalAgentStopShortcutStatus: currentGlobalAgentStopShortcutStatus,
    };
  });

  ipcMain.handle('prime-response-overlay-awaiting', async () => {
    const currentPhase = responseOverlayPhaseState.getPhase();
    if (
      currentPhase !== 'streaming'
      && currentPhase !== 'tool-call'
      && currentPhase !== 'tool-output'
    ) {
      setResponseOverlayPhase('awaiting-first-chunk', 'renderer-send-preflight');
    }
    return { success: true };
  });

  ipcMain.handle('upload-artifact', async (_event, payload) => {
    return uploadArtifact({
      ...(payload || {}),
      backendHttpUrl: BACKEND_HTTP_URL,
      headers: buildInstallAuthHeaders(),
    });
  });

  ipcMain.handle('fetch-artifact-image', async (_event, payload) => {
    try {
      await ensureInstallAuthState();
      return await fetchArtifactImage({
        ...(payload || {}),
        backendHttpUrl: BACKEND_HTTP_URL,
        headers: buildInstallAuthHeaders(),
      });
    } catch (error) {
      return {
        success: false,
        error: String(error?.message || error || 'Failed to fetch artifact image.'),
      };
    }
  });

  ipcMain.handle('save-frontend-config', async (event, config) => {
    if (isValidConfigPayload(config) && typeof setGlobalAgentStopShortcutAccelerator === 'function') {
      setGlobalAgentStopShortcutAccelerator(config.global_agent_stop_shortcut);
    }
    return await persistFrontendConfigToDisk(config);
  });

  registerClipboardImageHandler({
    ipcMain,
    clipboard,
    nativeImage,
  });
  registerImageContextMenuHandler({
    ipcMain,
    Menu,
    BrowserWindow,
    clipboard,
    nativeImage,
  });

  ipcMain.handle('openai-codex-oauth-login', async () => {
    try {
      const result = await loginOpenAICodexOAuth({
        openExternal: (url) => shell.openExternal(url),
      });
      return {
        success: true,
        token: result.token,
        auth_path: result.authPath,
      };
    } catch (error) {
      return {
        success: false,
        error: String(error?.message || error || 'OpenAI Codex OAuth login failed.'),
      };
    }
  });

  ipcMain.handle('openai-codex-oauth-logout', async () => {
    try {
      const result = await logoutOpenAICodexOAuth();
      return {
        success: true,
        removed: result.removed,
        auth_path: result.authPath,
      };
    } catch (error) {
      return {
        success: false,
        error: String(error?.message || error || 'OpenAI Codex OAuth sign-out failed.'),
      };
    }
  });

  ipcMain.on('transcript-session-sync', (event, payload = {}) => {
    const syncResult = applyTranscriptSessionSync({
      payload,
      sender: event?.sender || null,
      currentConversationRef,
      currentUserId,
      broadcastToRenderers,
    });
    if (!syncResult) {
      return;
    }

    currentConversationRef = syncResult.nextConversationRef;
    currentUserId = syncResult.nextUserId;
  });

  ipcMain.on('to-backend', async (event, message = {}) => {
    const type = typeof message?.type === 'string' ? message.type : null;
    let payload = (
      message?.payload
      && typeof message.payload === 'object'
      && !Array.isArray(message.payload)
    ) ? { ...message.payload } : {};

    if (!type) {
      log('Ignoring malformed to-backend message: missing string "type"');
      return;
    }

    if (type === 'update-settings') {
      void sendSettingsUpdate(payload, 'renderer-update');
      return;
    }

    if (type === 'list-models' && (!isConnected || !ws || ws.readyState !== WebSocket.OPEN)) {
      queueListModelsRequest();
      log('Queued list-models request until backend websocket is connected.');
      try {
        await ensureBackendConnection('list-models');
      } catch (error) {
        log(`Failed to connect backend for list-models: ${error?.message || error}`);
      }
      return;
    }

    if (type === 'stop-query') {
      setResponseOverlayPhase('complete', 'stop-query');
    }

    // Only log important message types
    if (type === 'query' || type === 'wakeword-detected') {
      log(`Received ${type} from renderer`);
    }

    let queryMessageId = null;
    let queryUsedInitialContext = false;

    if (type === 'query') {
      if (!currentUserId) {
        try {
          await ensureInstallAuthState();
        } catch (error) {
          log(`Failed to resolve authenticated user before query: ${error?.message || error}`);
        }
      }
      const preparedQuery = await prepareRendererQuerySend({
        event,
        payload,
        currentConversationRef,
        currentSessionId,
        currentServerUserId,
        currentUserId,
        backendHttpUrl: resolvePreferredArtifactHttpUrl(
          BACKEND_HTTP_URL,
          BACKEND_ENDPOINT_CANDIDATES,
        ),
        isFirstQuery,
        deps: {
          BrowserWindow,
          screen,
          runBeforeOverlayQueryCapture,
          onBeforeOverlayQueryCapture,
          log,
          prepareRendererQueryPayload,
          resolveConversationRefFromPayload,
          uuidGenerator: uuidv4,
          logChatPillMainTrace,
          setResponseOverlayPhase,
          getWindows,
          setActiveDisplayAffinity,
          resolveActiveSurfaceDisplayAffinity,
          broadcastLocalUserMessageRuntime,
          buildLocalUserMessage,
          broadcastToRenderers,
          ipcEventReplayState,
          buildQueryPayload,
          buildQueryPayloadContent,
          getSystemState,
          searchMemory,
        },
      });
      payload = preparedQuery.payload;
      if (type === 'query' || type === 'rehydrate-conversation') {
        payload = attachLocalRepoInstructionMessages(payload);
      }
      currentConversationRef = preparedQuery.conversationRef;
      queryMessageId = preparedQuery.queryMessageId;
      queryUsedInitialContext = preparedQuery.queryUsedInitialContext;
      log('Complete user message built successfully');
    }

    const shouldConnectForMessage = (
      type === 'query'
      || type === 'wakeword-detected'
      || type === 'compact-history'
      || type === 'rehydrate-conversation'
      || type === 'load-settings'
    );
    let backendConnectionReady = true;
    if (shouldConnectForMessage && (!isConnected || !ws || ws.readyState !== WebSocket.OPEN)) {
      try {
        await ensureBackendConnection(type);
      } catch (error) {
        backendConnectionReady = false;
        log(`Failed to connect backend for ${type}: ${error?.message || error}`);
      }
    }

    if (backendConnectionReady && (type === 'query' || type === 'wakeword-detected')) {
      await ensureInitialSettingsSync();
      if (pendingSettingsSyncPromise) {
        await pendingSettingsSyncPromise;
      }
    }

    // System context is now pre-formatted in llm_content by ChatContext.jsx
    // No need to extract or add system_context here - backend expects pre-formatted messages
    
    const messageId = backendConnectionReady
      ? sendMessageToBackend(type, payload, queryMessageId)
      : null;
    if (!messageId && type === 'query') {
      handleRendererQuerySendFailure({
        payload,
        queryMessageId,
        currentSessionId,
        currentServerUserId,
        currentUserId,
        currentConversationRef,
        deps: {
          resolveConversationRefFromPayload,
          ipcEventReplayState,
          broadcastQuerySendFailureRuntime,
          buildQuerySendFailure,
          setResponseOverlayPhase,
          broadcastToRenderers,
        },
      });
    } else if (type === 'query' && queryUsedInitialContext) {
      isFirstQuery = false;
    }
  });
}

function triggerStopQueryFromMain() {
  const messageId = sendMessageToBackend('stop-query', currentConversationRef
    ? { conversation_ref: currentConversationRef }
    : {});
  if (!messageId) {
    return false;
  }
  setResponseOverlayPhase('complete', 'stop-query');
  return true;
}

function registerRendererWindow(win) {
  trackRendererWindow(win);
}

function getLatestFrontendConfig() {
  if (!isValidConfigPayload(latestFrontendConfig)) {
    return null;
  }
  return { ...latestFrontendConfig };
}

function registerBackendMessageObserver(observer) {
  if (typeof observer !== 'function') {
    return () => {};
  }
  backendMessageObservers.add(observer);
  return () => {
    backendMessageObservers.delete(observer);
  };
}

function getBackendConnectionState() {
  return {
    isConnected,
    userId: currentUserId,
    sessionId: currentSessionId,
    serverUserId: currentServerUserId,
    conversationRef: currentConversationRef,
    backendWsUrl: BACKEND_URL,
    backendHttpUrl: BACKEND_HTTP_URL,
    globalAgentStopShortcutStatus: currentGlobalAgentStopShortcutStatus,
  };
}

function attachLocalRepoInstructionMessages(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }
  const customInstructions = typeof latestFrontendConfig?.agent_custom_instructions === 'string'
    ? latestFrontendConfig.agent_custom_instructions.trim()
    : '';
  const customPromptLayers = customInstructions
    ? [{
      id: 'custom-instructions',
      type: 'custom_instructions',
      priority: 60,
      content: customInstructions,
    }]
    : [];
  const extensionPromptLayers = loadExtensionPromptLayers();

  const workspacePath = typeof payload.workspace_path === 'string'
    ? payload.workspace_path.trim()
    : '';
  if (!workspacePath) {
    const clientPromptLayers = [
      ...extensionPromptLayers,
      ...customPromptLayers,
    ];
    return clientPromptLayers.length > 0
      ? { ...payload, client_prompt_layers: clientPromptLayers }
      : payload;
  }

  const repoInstructionMessages = resolveWorkspaceRepoInstructionMessages(workspacePath);
  const repoInstructionPromptLayers = resolveWorkspaceRepoInstructionPromptLayers(workspacePath);
  const clientPromptLayers = [
    ...repoInstructionPromptLayers,
    ...extensionPromptLayers,
    ...customPromptLayers,
  ];
  if (repoInstructionMessages.length === 0 && clientPromptLayers.length === 0) {
    return payload;
  }

  return {
    ...payload,
    ...(repoInstructionMessages.length > 0
      ? { repo_instruction_messages: repoInstructionMessages }
      : {}),
    ...(clientPromptLayers.length > 0
      ? { client_prompt_layers: clientPromptLayers }
      : {}),
  };
}

async function sendAutomatedQuery(options = {}) {
  const preparedQuery = prepareAutomatedQueryPayload(options, currentConversationRef);
  if (!preparedQuery) {
    return { ok: false, error: 'Missing query text' };
  }

  try {
    await ensureBackendConnection('automated-query');
  } catch (error) {
    return {
      ok: false,
      error: error?.message || 'Backend websocket is not connected',
    };
  }

  await ensureInitialSettingsSync();
  if (pendingSettingsSyncPromise) {
    await pendingSettingsSyncPromise;
  }

  const conversationRef = preparedQuery.conversationRef || `vm-run-${uuidv4()}`;
  const builtQuery = await buildQueryPayload({
    basePayload: {},
    text: preparedQuery.text,
    conversationRef,
    attachmentContext: preparedQuery.attachmentContext,
    memoryRetrievalEnabled: preparedQuery.memoryRetrievalEnabled,
    currentUserId,
    isFirstQuery,
    buildQueryPayloadContent,
    getSystemState,
    searchMemory,
    log,
  });

  const payload = {
    text: preparedQuery.text,
    conversation_ref: conversationRef,
    ...builtQuery.payload,
  };
  if (preparedQuery.attachmentFilenames.length > 0) {
    payload.attachment_filenames = preparedQuery.attachmentFilenames;
  }
  const payloadWithRepoInstructions = attachLocalRepoInstructionMessages(payload);

  const queryMessageId = uuidv4();
  const messageId = sendMessageToBackend('query', payloadWithRepoInstructions, queryMessageId);
  if (!messageId) {
    return { ok: false, error: 'Failed to send query to backend' };
  }

  currentConversationRef = conversationRef;
  if (builtQuery.queryUsedInitialContext) {
    isFirstQuery = false;
  }
  return {
    ok: true,
    messageId,
    queryMessageId,
    conversationRef,
    userId: builtQuery.userId,
  };
}

module.exports = {
  BACKEND_CONNECT_TIMEOUT_MS,
  BACKEND_IDLE_DISCONNECT_TIMEOUT_MS,
  BACKEND_RECONNECT_INTERVAL_MS,
  getBackendConnectionState,
  getLatestFrontendConfig,
  initializeIpc,
  registerBackendMessageObserver,
  registerRendererWindow,
  sendAutomatedQuery,
  sendMessageToBackend,
  shutdownIpcForTests,
  triggerStopQueryFromMain,
  updateGlobalAgentStopShortcutStatus,
};
