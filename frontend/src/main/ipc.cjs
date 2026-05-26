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
  executeToolForBackend,
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
  redactProviderSecretsFromFrontendConfig,
  saveFrontendConfigToDisk,
} = require('./ipc/ipc_frontend_config.cjs');
const {
  registerFrontendConfigHandlers,
} = require('./ipc/ipc_frontend_config_handlers.cjs');
const {
  loadInstallAuthStateFromDisk,
  registerInstallWithBackend,
  saveInstallAuthStateToDisk,
} = require('./ipc/ipc_install_auth_state.cjs');
const {
  isValidConfigPayload,
} = require('./ipc/ipc_settings_sync.cjs');
const {
  createIpcSettingsSyncRuntime,
} = require('./ipc/ipc_settings_sync_runtime.cjs');
const {
  createModelListRequestRuntime,
} = require('./ipc/ipc_model_list_runtime.cjs');
const {
  handleRendererLog,
} = require('./ipc/ipc_diagnostics_runtime.cjs');
const {
  fetchArtifactImage,
} = require('./ipc/ipc_artifact_fetch.cjs');
const { persistMemoryStoreEvent } = require('./ipc/ipc_memory_store_persistence.cjs');
const { buildQueryPayloadContext } = require('./query_payload_builder.cjs');
const {
  resolveConversationRef: resolveConversationRefFromPayload,
  buildLocalUserMessage,
  buildQueryInterrupted,
  buildQuerySendFailure,
} = require('./ipc/ipc_query_events.cjs');
const {
  normalizeBackendPayload,
  processBackendMessageData,
  runBeforeOverlayQueryCapture,
  uploadArtifact,
} = require('./ipc/ipc_runtime_helpers.cjs');
const {
  buildBackendQueryPayload,
  buildQueryPayload,
  prepareAutomatedQueryPayload,
  prepareRendererQueryPayload,
} = require('./ipc/ipc_query_runtime.cjs');
const {
  resolveWorkspaceRepoInstructionPromptLayers,
} = require('./repo_instruction_runtime.cjs');
const {
  loadExtensionSkillPromptLayers,
  loadPublicExtensionRegistry,
} = require('./extension_manifest.cjs');
const {
  createChatQueryHandlers,
} = require('./ipc/ipc_chat_query_handlers.cjs');
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
  registerResponseOverlayHandlers,
} = require('./ipc/ipc_response_overlay_handlers.cjs');
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
  normalizeSdkRuntimeCommand,
  shouldConnectForSdkRuntimeCommand,
  shouldLogRendererSdkRuntimeCommand,
  shouldQueueUntilConnected,
  shouldSyncSettingsBeforeSdkRuntimeCommand,
  sendSdkRuntimeCommand,
} = require('./ipc/ipc_sdk_command_router.cjs');
const {
  isAgentLoopStopShortcutPhase,
} = require('./agent_stop_shortcut_runtime.cjs');
const {
  buildAgentDefinition,
} = require('./agent_definition.cjs');
const {
  buildWindieSdkMainHandshake,
  createWindieSdkMainRuntime,
} = require('./windie_sdk_runtime.cjs');
const {
  buildConversationEventFromBackendEvent,
} = require('./ipc_conversation_event_broadcast.cjs');
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
let rendererWindows = new Set();
let isConnected = false;
let isFirstQuery = true;
let currentUserId = null;
let currentInstallId = null;
let currentInstallToken = null;
let currentSessionId = null;
let currentServerUserId = null;
let currentConversationRef = null;
let activeQueryContext = null;
let latestFrontendConfig = null;
const modelListRequestRuntime = createModelListRequestRuntime();
const backendMessageObservers = new Set();
let applyResponseOverlayPhase = null;
let onBeforeOverlayQueryCapture = null;
let setAgentLoopStopShortcutEnabled = null;
let setGlobalAgentStopShortcutAccelerator = null;
let currentGlobalAgentStopShortcutStatus = null;
let pendingInstallAuthStatePromise = null;
let windieSdkRuntime = null;
const responseOverlayPhaseState = createResponseOverlayPhaseState();
const ipcEventReplayState = createIpcEventReplayState();
const settingsSyncRuntime = createIpcSettingsSyncRuntime({
  getLatestFrontendConfig: () => latestFrontendConfig,
  setLatestFrontendConfig: (config) => {
    latestFrontendConfig = config;
  },
  loadCachedFrontendConfig: () => loadCachedFrontendConfigFromDisk(),
  isConnected: () => isConnected,
  isBackendRuntimeConnected,
  ensureBackendConnection,
  getRuntime: getWindieSdkRuntime,
  sendSdkRuntimeCommand,
  log,
  timeoutMs: SETTINGS_SYNC_TIMEOUT_MS,
});

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
    registered: status.registered === true,
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
  const persistableConfig = redactProviderSecretsFromFrontendConfig(config);
  const result = await saveFrontendConfigToDisk(persistableConfig, log);
  if (
    result?.success
    && persistableConfig
    && typeof persistableConfig === 'object'
    && !Array.isArray(persistableConfig)
  ) {
    latestFrontendConfig = { ...persistableConfig };
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
  settingsSyncRuntime.reset();
}

function resetBackendSessionState() {
  currentSessionId = null;
  currentServerUserId = null;
  currentConversationRef = null;
}

function resetIpcProcessStateForTests() {
  isConnected = false;
  isFirstQuery = true;
  currentUserId = null;
  currentInstallId = null;
  currentInstallToken = null;
  currentSessionId = null;
  currentServerUserId = null;
  currentConversationRef = null;
  activeQueryContext = null;
  latestFrontendConfig = null;
  currentGlobalAgentStopShortcutStatus = null;
  pendingInstallAuthStatePromise = null;
}

function isActiveBackendLoopPhase(phase) {
  return (
    phase === 'awaiting-first-chunk'
    || phase === 'streaming'
    || phase === 'tool-call'
    || phase === 'tool-output'
  );
}

function syncBackendIdleDisconnectTimer(reason = 'idle-sync') {
  getWindieSdkRuntime().syncIdleTimer(reason);
}

function noteBackendTraffic(reason = 'traffic') {
  getWindieSdkRuntime().noteTraffic(reason);
}

function isBackendRuntimeConnected() {
  return isConnected && Boolean(windieSdkRuntime?.isOpen?.());
}

async function ensureBackendConnection(reason = 'request', timeoutMs = BACKEND_CONNECT_TIMEOUT_MS) {
  return getWindieSdkRuntime().ensureConnected({ reason, timeoutMs });
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

function broadcastConnectionStatus(connected) {
  broadcastToRenderers('ipc-status', buildIpcStatusPayload(connected));
}

function flushPendingListModelsRequest() {
  modelListRequestRuntime.flush({
    runtime: getWindieSdkRuntime(),
    sendSdkRuntimeCommand,
  });
}

async function sendSettingsUpdate(config, source = 'renderer') {
  return settingsSyncRuntime.sendSettingsUpdate(config, source);
}

async function ensureInitialSettingsSync() {
  return settingsSyncRuntime.ensureInitialSettingsSync();
}

function trackRendererWindow(win) {
  trackRendererWindowRuntime({
    win,
    rendererWindows,
    getResponseOverlayPhase: () => responseOverlayPhaseState.getPhase(),
    getReplayEvents: () => ipcEventReplayState.snapshot(),
    buildConversationEvent: (event) => buildConversationEventFromBackendEvent(event, {
      fallbackConversationRef: currentConversationRef,
    }),
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

async function buildSdkRuntimeHandshake() {
  const operatingSystem = resolveFrontendOperatingSystem(process.platform);
  return buildWindieSdkMainHandshake({
    userId: currentUserId,
    operatingSystem,
    frontendConfig: latestFrontendConfig,
    log,
  });
}

function handleSdkRuntimeEvent(rendererData) {
  if (
    rendererData
    && typeof rendererData === 'object'
    && rendererData.type === 'query-accepted'
    && activeQueryContext
    && typeof rendererData.turn_ref === 'string'
    && rendererData.turn_ref === activeQueryContext.queryMessageId
  ) {
    activeQueryContext.accepted = true;
  }
  ipcEventReplayState.appendForActiveTurn(rendererData);
  noteBackendTraffic(`message:${rendererData?.type || 'unknown'}`);
  notifyBackendMessageObservers(rendererData);
  processBackendMessageData(rendererData, {
    setCurrentSessionId: (value) => {
      currentSessionId = value;
    },
    setCurrentServerUserId: (value) => {
      currentServerUserId = value;
    },
    setCurrentConversationRef: (value) => {
      currentConversationRef = value;
    },
    resolveSettingsSync: (msgId, wasSuccessful) => settingsSyncRuntime.resolveAck(
      msgId,
      wasSuccessful,
    ),
    setResponseOverlayPhase,
    getResponseOverlayPhase: () => responseOverlayPhaseState.getPhase(),
    onMemoryStoreEvent: (eventData) => {
      persistMemoryStoreEvent(eventData, { storeMemory, log });
    },
    broadcastToRenderers,
    log,
  });
  if (
    activeQueryContext
    && rendererData
    && typeof rendererData === 'object'
    && typeof rendererData.turn_ref === 'string'
    && rendererData.turn_ref === activeQueryContext.queryMessageId
    && (rendererData.type === 'streaming-complete' || rendererData.type === 'error')
  ) {
    activeQueryContext = null;
    ipcEventReplayState.clear();
  }
}

function getWindieSdkRuntime() {
  if (windieSdkRuntime) {
    return windieSdkRuntime;
  }
  windieSdkRuntime = createWindieSdkMainRuntime({
    WebSocketImpl: WebSocket,
    createMessageId: uuidv4,
    getEndpoint: () => BACKEND_ENDPOINTS,
    getHeaders: buildInstallAuthHeaders,
    beforeConnect: () => ensureInstallAuthState(),
    shouldHoldOpen: () => isActiveBackendLoopPhase(responseOverlayPhaseState.getPhase()),
    buildHandshake: buildSdkRuntimeHandshake,
    executeLocalTool: executeToolForBackend,
    getUserId: () => currentUserId,
    getCurrentConversationRef: () => currentConversationRef,
    normalizePayload: normalizeBackendPayload,
    advanceEndpoint: advanceToNextBackendEndpoint,
    connectTimeoutMs: BACKEND_CONNECT_TIMEOUT_MS,
    reconnectIntervalMs: BACKEND_RECONNECT_INTERVAL_MS,
    idleDisconnectTimeoutMs: BACKEND_IDLE_DISCONNECT_TIMEOUT_MS,
    onOpen: () => {
      isConnected = true;
      isFirstQuery = true;
      resetSettingsSyncState();
      setResponseOverlayPhase('idle', 'ws-open');
      ipcEventReplayState.clear();
      log('Successfully connected to Python backend through Windie SDK runtime.');
      log(`Handshake sent with authenticated user_id: ${currentUserId}`);
      broadcastConnectionStatus(true);
      flushPendingListModelsRequest();
    },
    onHandshakeError: (error) => {
      log(`Error sending handshake: ${error}`);
    },
    onEvent: handleSdkRuntimeEvent,
    onConversationRuntimeUpdated: (payload) => {
      broadcastToRenderers('conversation-runtime-updated', payload);
    },
    onConversationEvent: ({ conversationEvent }) => {
      broadcastToRenderers('conversation-event', conversationEvent);
    },
    onMessageError: (error) => {
      log(`Error parsing message from backend: ${error}`);
    },
    onClose: ({ closeReason, shouldReconnect }) => {
      isConnected = false;
      resetSettingsSyncState();
      const activePhase = responseOverlayPhaseState.getPhase();
      const hadInterruptedQuery = Boolean(
        activeQueryContext
        && (
          activePhase === 'awaiting-first-chunk'
          || activePhase === 'streaming'
          || activePhase === 'tool-call'
          || activePhase === 'tool-output'
        ),
      );
      if (hadInterruptedQuery) {
        const interruptedEvent = buildQueryInterrupted({
          queryMessageId: activeQueryContext.queryMessageId,
          conversationRef: activeQueryContext.conversationRef,
          currentSessionId,
          currentServerUserId,
          currentUserId,
          accepted: activeQueryContext.accepted,
        });
        log(
          `Active query interrupted by backend disconnect `
          + `(turn_ref=${activeQueryContext.queryMessageId}, `
          + `accepted=${activeQueryContext.accepted ? 'true' : 'false'}).`,
        );
        handleSdkRuntimeEvent(interruptedEvent);
        activeQueryContext = null;
      } else {
        setResponseOverlayPhase('idle', 'ws-close');
      }
      resetBackendSessionState();
      ipcEventReplayState.clear();
      if (shouldReconnect) {
        log('Disconnected from Python backend. Attempting to reconnect...');
      } else {
        log(`Disconnected from Python backend (${closeReason || 'idle'}).`);
      }
      broadcastConnectionStatus(false);
    },
    onError: ({ error }) => {
      log(`WebSocket error: ${error.message}`);
    },
    onFallback: () => {
      log(`Primary backend unavailable. Falling back to ${BACKEND_URL}.`);
    },
    onSend: (type) => {
      noteBackendTraffic(`send:${type}`);
    },
    log,
  });
  return windieSdkRuntime;
}

function shutdownIpcForTests() {
  resetSettingsSyncState();
  resetBackendSessionState();
  resetIpcProcessStateForTests();
  modelListRequestRuntime.clear();
  rendererWindows = new Set();
  backendMessageObservers.clear();
  applyResponseOverlayPhase = null;
  onBeforeOverlayQueryCapture = null;
  setAgentLoopStopShortcutEnabled = null;
  setGlobalAgentStopShortcutAccelerator = null;
  const runtime = windieSdkRuntime;
  windieSdkRuntime = null;
  runtime?.close?.('test-shutdown');
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

  registerFrontendConfigHandlers({
    ipcMain,
    loadCachedFrontendConfigFromDisk,
    persistFrontendConfigToDisk,
    isValidConfigPayload,
    applyShortcutStatusFallbackToConfig,
    getLatestFrontendConfig: () => latestFrontendConfig,
    setLatestFrontendConfig: (config) => {
      latestFrontendConfig = config;
    },
    setGlobalAgentStopShortcutAccelerator,
  });

  ipcMain.handle('list-agent-extensions', async () => loadPublicExtensionRegistry());

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

  registerResponseOverlayHandlers({
    ipcMain,
    getResponseOverlayPhase: () => responseOverlayPhaseState.getPhase(),
    setResponseOverlayPhase,
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

  registerClipboardImageHandler({
    ipcMain,
    clipboard,
    nativeImage,
    getTrustedImageOrigins: () => [
      BACKEND_HTTP_URL,
      ...BACKEND_ENDPOINT_CANDIDATES.map((candidate) => candidate.httpUrl),
    ],
  });
  registerImageContextMenuHandler({
    ipcMain,
    Menu,
    BrowserWindow,
    clipboard,
    nativeImage,
    getTrustedImageOrigins: () => [
      BACKEND_HTTP_URL,
      ...BACKEND_ENDPOINT_CANDIDATES.map((candidate) => candidate.httpUrl),
    ],
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

  ipcMain.on('renderer-log', (_event, payload = {}) => {
    handleRendererLog(payload);
  });

  const {
    handleRendererChatQuery,
    handleRendererStopQuery,
  } = createChatQueryHandlers({
    getState: () => ({
      currentConversationRef,
      currentSessionId,
      currentServerUserId,
      currentUserId,
      isFirstQuery,
    }),
    setCurrentConversationRef: (conversationRef) => {
      currentConversationRef = conversationRef;
    },
    setActiveQueryContext: (queryContext) => {
      activeQueryContext = queryContext;
    },
    setFirstQuery: (nextValue) => {
      isFirstQuery = nextValue;
    },
    attachAgentDefinitionContext: (payload) => buildBackendQueryPayload(
      attachAgentDefinitionContext(payload),
    ),
    ensureInstallAuthState,
    isBackendRuntimeConnected,
    ensureBackendConnection,
    ensureInitialSettingsSync,
    getPendingSettingsSyncPromise: () => settingsSyncRuntime.waitForPendingSync(),
    sendSdkRuntimeCommand,
    getWindieSdkRuntime,
    sendStopQueryToBackend,
    setResponseOverlayPhase,
    resolvePreferredArtifactHttpUrl: () => resolvePreferredArtifactHttpUrl(
      BACKEND_HTTP_URL,
      BACKEND_ENDPOINT_CANDIDATES,
    ),
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
      buildQueryPayloadContext,
      getSystemState,
      searchMemory,
      broadcastQuerySendFailureRuntime,
      buildQuerySendFailure,
    },
  });


  ipcMain.handle('send-chat-query', async (event, payload = {}) => (
    handleRendererChatQuery(event, payload)
  ));

  ipcMain.handle('stop-chat-query', async (_event, payload = {}) => (
    handleRendererStopQuery(payload)
  ));

  ipcMain.on('to-backend', async (_event, message = {}) => {
    const normalizedCommand = normalizeSdkRuntimeCommand(message);
    const type = normalizedCommand.type;
    let payload = normalizedCommand.payload;

    if (!type) {
      log('Ignoring malformed to-backend message: missing string "type"');
      return;
    }

    if (type === 'query' || type === 'stop-query') {
      log(`Ignoring ${type} on generic to-backend IPC; use the typed chat IPC channel.`);
      return;
    }

    if (type === 'update-settings') {
      void sendSettingsUpdate(payload, 'renderer-update');
      return;
    }

    if (shouldQueueUntilConnected(type) && !isBackendRuntimeConnected()) {
      modelListRequestRuntime.queue();
      log('Queued list-models request until backend websocket is connected.');
      try {
        await ensureBackendConnection('list-models');
      } catch (error) {
        log(`Failed to connect backend for list-models: ${error?.message || error}`);
      }
      return;
    }

    // Only log important message types
    if (shouldLogRendererSdkRuntimeCommand(type)) {
      log(`Received ${type} from renderer`);
    }

    if (type === 'rehydrate') {
      payload = attachAgentDefinitionContext(payload);
    }

    let backendConnectionReady = true;
    if (shouldConnectForSdkRuntimeCommand(type) && !isBackendRuntimeConnected()) {
      try {
        await ensureBackendConnection(type);
      } catch (error) {
        backendConnectionReady = false;
        log(`Failed to connect backend for ${type}: ${error?.message || error}`);
      }
    }

    if (backendConnectionReady && shouldSyncSettingsBeforeSdkRuntimeCommand(type)) {
      await ensureInitialSettingsSync();
      await settingsSyncRuntime.waitForPendingSync();
    }

    // System context is now pre-formatted in llm_content by ChatContext.jsx
    // No need to extract or add system_context here - backend expects pre-formatted messages
    
    if (backendConnectionReady) {
      const runtime = getWindieSdkRuntime();
      sendSdkRuntimeCommand(runtime, {
        type,
        payload,
      });
    }
  });
}

function sendStopQueryToBackend(payload = {}, messageId = null) {
  return sendSdkRuntimeCommand(getWindieSdkRuntime(), {
    type: 'stop-query',
    payload,
    messageId,
  });
}

function triggerStopQueryFromMain() {
  const messageId = sendStopQueryToBackend(
    currentConversationRef
      ? { conversation_ref: currentConversationRef }
      : {},
  );
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

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function cloneJsonObject(value) {
  if (!isPlainObject(value)) {
    return {};
  }
  return JSON.parse(JSON.stringify(value));
}

function mergeAgentDefinitionContext(generatedDefinition, suppliedDefinition) {
  const supplied = cloneJsonObject(suppliedDefinition);
  if (Object.keys(supplied).length === 0) {
    return generatedDefinition;
  }

  const generated = cloneJsonObject(generatedDefinition);
  return JSON.parse(JSON.stringify({
    ...generated,
    ...supplied,
    system_prompt: isPlainObject(supplied.system_prompt)
      ? supplied.system_prompt
      : generated.system_prompt,
    tools: isPlainObject(supplied.tools)
      ? supplied.tools
      : generated.tools,
    runtime: {
      ...(isPlainObject(generated.runtime) ? generated.runtime : {}),
      ...(isPlainObject(supplied.runtime) ? supplied.runtime : {}),
    },
    prompt_layers: [
      ...(Array.isArray(generated.prompt_layers) ? generated.prompt_layers : []),
      ...(Array.isArray(supplied.prompt_layers) ? supplied.prompt_layers : []),
    ],
    agents_md: [
      ...(Array.isArray(generated.agents_md) ? generated.agents_md : []),
      ...(Array.isArray(supplied.agents_md) ? supplied.agents_md : []),
    ],
    skills: [
      ...(Array.isArray(generated.skills) ? generated.skills : []),
      ...(Array.isArray(supplied.skills) ? supplied.skills : []),
    ],
    plugins: [
      ...(Array.isArray(generated.plugins) ? generated.plugins : []),
      ...(Array.isArray(supplied.plugins) ? supplied.plugins : []),
    ],
  }));
}

function attachAgentDefinitionContext(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }
  const customInstructions = typeof latestFrontendConfig?.agent_custom_instructions === 'string'
    ? latestFrontendConfig.agent_custom_instructions.trim()
    : '';
  const workspacePath = typeof payload.workspace_path === 'string'
    ? payload.workspace_path.trim()
    : '';
  const agentsMd = workspacePath
    ? resolveWorkspaceRepoInstructionPromptLayers(workspacePath)
    : [];
  const generatedAgentDefinition = buildAgentDefinition({
    includeToolManifest: false,
    customInstructions,
    promptLayers: loadExtensionSkillPromptLayers(),
    agentsMd,
    workspacePath,
    operatingSystem: resolveFrontendOperatingSystem(process.platform),
  });
  const suppliedAgentDefinition = isPlainObject(payload.agent_definition)
    ? payload.agent_definition
    : null;
  if (generatedAgentDefinition.mode === 'windie_default' && !suppliedAgentDefinition) {
    return payload;
  }

  return {
    ...payload,
    agent_definition: mergeAgentDefinitionContext(
      generatedAgentDefinition,
      suppliedAgentDefinition,
    ),
  };
}

async function sendAutomatedQuery(options = {}) {
  const preparedQuery = prepareAutomatedQueryPayload(options);
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
  await settingsSyncRuntime.waitForPendingSync();

  const conversationRef = preparedQuery.conversationRef || `vm-run-${uuidv4()}`;
  const builtQuery = await buildQueryPayload({
    basePayload: {},
    text: preparedQuery.text,
    conversationRef,
    attachmentContext: preparedQuery.attachmentContext,
    memoryRetrievalEnabled: preparedQuery.memoryRetrievalEnabled,
    currentUserId,
    isFirstQuery,
    buildQueryPayloadContext,
    getSystemState,
    searchMemory,
    log,
  });

  const payload = {
    text: preparedQuery.text,
    conversation_ref: conversationRef,
    ...builtQuery.payload,
  };
  const payloadWithAgentDefinition = buildBackendQueryPayload(
    attachAgentDefinitionContext(payload),
  );

  const queryMessageId = uuidv4();
  const messageId = sendSdkRuntimeCommand(getWindieSdkRuntime(), {
    type: 'query',
    payload: payloadWithAgentDefinition,
    messageId: queryMessageId,
  });
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
  sendStopQueryToBackend,
  shutdownIpcForTests,
  triggerStopQueryFromMain,
  updateGlobalAgentStopShortcutStatus,
};
