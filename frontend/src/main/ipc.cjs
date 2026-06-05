const {
  ipcMain,
  shell,
  Menu,
  BrowserWindow,
  screen,
  clipboard,
  nativeImage,
} = require('electron');
const { v4: uuidv4 } = require('uuid');
const {
  resolveBackendEndpointCandidates,
  resolveBackendEndpoints,
  resolvePreferredArtifactHttpUrl,
} = require('./backend_endpoints.cjs');
const {
  createBackendEndpointState,
} = require('./ipc/ipc_backend_endpoint_state.cjs');
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
  handleRendererLog,
} = require('./ipc/ipc_diagnostics_runtime.cjs');
const {
  fetchArtifactImage,
} = require('./ipc/ipc_artifact_fetch.cjs');
const {
  registerArtifactHandlers,
} = require('./ipc/ipc_artifact_handlers.cjs');
const {
  resolveConversationRef: resolveConversationRefFromPayload,
  buildQueryInterrupted,
  buildQuerySendFailure,
} = require('./ipc/ipc_query_events.cjs');
const {
  processBackendMessageData,
  runBeforeOverlayQueryCapture,
  uploadArtifact,
} = require('./ipc/ipc_runtime_helpers.cjs');
const {
  createCurrentTurnTraceLogger,
} = require('./ipc/ipc_assistant_trace.cjs');
const {
  buildBackendQueryPayload,
  buildQueryPayload,
  prepareAutomatedQueryPayload,
  prepareRendererQueryPayload,
} = require('./ipc/ipc_query_runtime.cjs');
const {
  createAutomatedQueryDispatcher,
} = require('./ipc/ipc_automated_query_dispatcher.cjs');
const {
  initializeIpcStartupState,
} = require('./ipc/ipc_startup_state.cjs');
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
  registerOpenAICodexOAuthHandlers,
} = require('./ipc/ipc_openai_codex_oauth_handlers.cjs');
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
  buildAgentDefinition,
} = require('./agent_definition.cjs');
const {
  WindieClient,
} = require('../../../packages/windie-sdk-js/cjs/index.js');
const {
  buildConversationEventFromBackendEvent,
} = require('./ipc_conversation_event_broadcast.cjs');
const { logChatPillMainTrace } = require('./chat_pill_trace_runtime.cjs');

const backendEndpointState = createBackendEndpointState({
  resolveBackendEndpointCandidates,
  resolveBackendEndpoints,
  env: process.env,
});
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
const backendMessageObservers = new Set();
let applyResponseOverlayPhase = null;
let onBeforeOverlayQueryCapture = null;
let setAgentLoopStopShortcutEnabled = null;
let setGlobalAgentStopShortcutAccelerator = null;
let localToolLifecycle = null;
let currentGlobalAgentStopShortcutStatus = null;
let pendingInstallAuthStatePromise = null;
let windieAgent = null;
let pendingWindieAgentStartPromise = null;
let latestCurrentTurnProjection = null;
const currentTurnTraceLogger = createCurrentTurnTraceLogger({ log });
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
  updateSettings: (payload) => updateSettingsOnBackend(payload),
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
    const endpointCandidates = backendEndpointState.getCandidates();
    for (let index = 0; index < endpointCandidates.length; index += 1) {
      const candidate = endpointCandidates[index];
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
  backendEndpointState.refresh(options);
}

function setActiveBackendEndpoint(index) {
  return backendEndpointState.setActive(index);
}

function advanceToNextBackendEndpoint() {
  return backendEndpointState.advance();
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
  latestCurrentTurnProjection = null;
  currentTurnTraceLogger.reset();
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
  latestCurrentTurnProjection = null;
  currentTurnTraceLogger.reset();
}

function normalizeOptionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function resolveWorkspacePathForAgent(payload = {}) {
  return (
    normalizeOptionalString(payload?.workspace_path)
    || normalizeOptionalString(payload?.workspacePath)
    || normalizeOptionalString(latestFrontendConfig?.workspace_path)
    || normalizeOptionalString(latestFrontendConfig?.workspacePath)
  );
}

function handleWindieAgentConnection(event = {}) {
  if (event.type === 'open') {
    const handshakeUserId = event.handshake && typeof event.handshake.user_id === 'string'
      ? event.handshake.user_id
      : null;
    if (handshakeUserId) {
      currentServerUserId = handshakeUserId;
    }
    isConnected = true;
    isFirstQuery = true;
    resetSettingsSyncState();
    setResponseOverlayPhase('idle', 'ws-open');
    ipcEventReplayState.clear();
    log('Successfully connected to Python backend through Windie SDK runtime.');
    log(`Handshake sent with authenticated user_id: ${handshakeUserId || currentUserId || 'unknown'}`);
    broadcastConnectionStatus(true);
    return;
  }
  if (event.type === 'close') {
    handleAgentBackendClose(event);
    return;
  }
  if (event.type === 'error') {
    log(`WebSocket error: ${event.error?.message || event.error}`);
    return;
  }
  if (event.type === 'handshake-error') {
    log(`Error sending handshake: ${event.error}`);
    return;
  }
  if (event.type === 'message-error') {
    log(`Error parsing message from backend: ${event.error}`);
  }
}

function handleWindieAgentBackendFallback(endpointPayload = {}) {
  const candidates = backendEndpointState.getCandidates();
  const fallbackIndex = candidates.findIndex(candidate => (
    candidate.wsUrl === endpointPayload.wsUrl
    || candidate.httpUrl === endpointPayload.httpBaseUrl
    || candidate.httpUrl === endpointPayload.httpUrl
    || candidate.httpUrl === endpointPayload.backendUrl
  ));
  if (fallbackIndex >= 0) {
    setActiveBackendEndpoint(fallbackIndex);
  } else {
    advanceToNextBackendEndpoint();
  }
  log(`Primary backend unavailable. Falling back to ${backendEndpointState.getEndpoint().wsUrl}.`);
}

function resolveRuntimeConversationRef(input = {}) {
  const payload = input && typeof input === 'object' && !Array.isArray(input)
    ? input.payload
    : null;
  const fromPayload = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload.conversation_ref
    : null;
  const direct = input && typeof input === 'object' && !Array.isArray(input)
    ? (input.conversation_ref || input.conversationRef)
    : null;
  return normalizeOptionalString(fromPayload)
    || normalizeOptionalString(direct)
    || currentConversationRef
    || null;
}

function statusFromConversationEvent(event = {}, workspacePath = null) {
  if (event.type === 'turn_completed') {
    return {
      phase: 'ready',
      conversationRef: event.conversationRef,
      turnRef: event.turnRef,
      workspacePath,
    };
  }
  if (event.type === 'turn_stopped') {
    return {
      phase: 'stopped',
      conversationRef: event.conversationRef,
      turnRef: event.turnRef,
      workspacePath,
    };
  }
  if (event.type === 'turn_error' || event.type === 'runtime_error') {
    return {
      phase: 'error',
      conversationRef: event.conversationRef,
      turnRef: event.turnRef,
      workspacePath,
      error: typeof event.payload?.error === 'string' ? event.payload.error : null,
    };
  }
  return null;
}

function buildDesktopInstallAuth() {
  if (!currentInstallToken) {
    return undefined;
  }
  return {
    ...(currentUserId ? { userId: currentUserId } : {}),
    ...(currentInstallId ? { installId: currentInstallId } : {}),
    installToken: currentInstallToken,
    autoRegister: false,
  };
}

function buildManagedBackendEndpoints() {
  return backendEndpointState.getCandidates().map(endpoint => ({
    backendUrl: endpoint.httpUrl || endpoint.httpBaseUrl || endpoint.backendUrl,
    httpBaseUrl: endpoint.httpUrl || endpoint.httpBaseUrl || endpoint.backendUrl,
    wsUrl: endpoint.wsUrl,
    wsOrigin: endpoint.wsOrigin || endpoint.httpUrl || endpoint.httpBaseUrl || endpoint.backendUrl,
  }));
}

function createDirectWakeUpAgentAdapter({
  agent,
  workspacePath = null,
  store = null,
} = {}) {
  let runtime = null;
  let conversationRef = `conv-${agent.id}`;
  let detachRuntimeEvents = () => {};
  let detachRawBackendEvents = () => {};
  let closed = false;

  function broadcastStatus(status) {
    broadcastToRenderers('windie:status', status);
  }

  function attachRuntime(nextRuntime) {
    detachRuntimeEvents();
    detachRuntimeEvents = nextRuntime.subscribeEvents((event, snapshot) => {
      broadcastToRenderers('windie:conversation-event', event);
      if (event && event.type === 'memory_store_changed') {
        broadcastToRenderers('windie:memory-store-changed', event);
      }
      broadcastToRenderers('windie:rows', snapshot.displayRows);
      latestCurrentTurnProjection = snapshot.currentTurn || null;
      currentTurnTraceLogger.trace(snapshot.currentTurn);
      broadcastToRenderers('windie:current-turn', snapshot.currentTurn);
      const terminalStatus = statusFromConversationEvent(event, workspacePath);
      if (terminalStatus) {
        broadcastStatus(terminalStatus);
      }
    });
  }

  function selectConversationRuntime(nextConversationRef = null) {
    const resolvedConversationRef = normalizeOptionalString(nextConversationRef) || conversationRef;
    if (runtime && resolvedConversationRef === conversationRef) {
      return runtime;
    }
    if (runtime) {
      detachRuntimeEvents();
      runtime.close();
    }
    conversationRef = resolvedConversationRef;
    runtime = agent.conversation({
      conversationRef,
      ...(store ? { store } : {}),
    });
    attachRuntime(runtime);
    broadcastStatus({
      phase: 'ready',
      conversationRef,
      workspacePath,
    });
    return runtime;
  }

  runtime = agent.conversation({
    conversationRef,
    ...(store ? { store } : {}),
  });
  attachRuntime(runtime);
  detachRawBackendEvents = agent.subscribeRawBackendEvents((event) => {
    handleAgentBackendEvent(event);
  });

  return {
    run: async (input = {}) => {
      const sendInput = typeof input === 'string' ? { text: input } : input;
      const activeRuntime = selectConversationRuntime(resolveRuntimeConversationRef(sendInput));
      broadcastStatus({
        phase: 'running',
        conversationRef,
        turnRef: sendInput.turnRef ?? null,
        workspacePath,
      });
      const result = await activeRuntime.send(sendInput);
      broadcastStatus({
        phase: 'running',
        conversationRef,
        turnRef: result.turnRef,
        workspacePath,
      });
      return result;
    },
    stop: async (input = {}) => {
      const stopConversationRef = typeof input === 'object' && input?.conversation_ref
        ? input.conversation_ref
        : conversationRef;
      selectConversationRuntime(stopConversationRef);
      return agent.stop(stopConversationRef || conversationRef);
    },
    updateSettings: payload => agent.updateSettings(payload),
    requestModelList: () => agent.requestModelList(),
    rehydrateMessages: async (payload = {}) => {
      const activeRuntime = selectConversationRuntime(resolveRuntimeConversationRef(payload));
      return activeRuntime.rehydrateMessages(payload);
    },
    compactHistory: async (payload = {}) => {
      const activeRuntime = selectConversationRuntime(resolveRuntimeConversationRef(payload));
      return activeRuntime.compactHistory({
        force: payload.force,
        payload,
      });
    },
    listMemories: options => agent.listMemories(options),
    deleteMemory: options => agent.deleteMemory(options),
    clearMemories: options => agent.clearMemories(options),
    listConversations: options => agent.listConversations(options),
    searchConversations: options => agent.searchConversations(options),
    deleteConversation: options => agent.deleteConversation(options),
    clearConversations: options => agent.clearConversations(options),
    loadConversation: options => agent.loadConversation(options),
    getConversationRevision: options => agent.getConversationRevision(options),
    appendConversationEvent: options => agent.appendConversationEvent(options),
    rewriteConversation: options => agent.rewriteConversation(options),
    replaceCompactedReplay: options => agent.replaceCompactedReplay(options),
    wakewordDetected: payload => agent.wakewordDetected(payload),
    ensureConnected: () => agent.ensureConnected(),
    isConnected: () => agent.isConnected(),
    noteBackendTraffic: reason => agent.noteBackendTraffic(reason),
    syncBackendIdleTimer: reason => agent.syncBackendIdleTimer(reason),
    localStatus: () => agent.status(),
    close: () => {
      if (closed) {
        return;
      }
      closed = true;
      detachRuntimeEvents();
      detachRawBackendEvents();
      runtime?.close();
      agent.sleep();
      broadcastStatus({
        phase: 'closed',
        conversationRef,
        workspacePath,
      });
    },
  };
}

async function startWindieAgent({ reason = 'request', workspacePath = null } = {}) {
  await ensureInstallAuthState();
  const resolvedWorkspacePath = workspacePath || resolveWorkspacePathForAgent() || undefined;
  const client = new WindieClient({
    backendUrl: backendEndpointState.getHttpUrl(),
    httpBaseUrl: backendEndpointState.getHttpUrl(),
    wsUrl: backendEndpointState.getWsUrl(),
    wsOrigin: backendEndpointState.getHttpUrl(),
    backendEndpoints: buildManagedBackendEndpoints(),
    backendSession: 'managed',
    reconnectIntervalMs: BACKEND_RECONNECT_INTERVAL_MS,
    connectTimeoutMs: BACKEND_CONNECT_TIMEOUT_MS,
    idleDisconnectTimeoutMs: BACKEND_IDLE_DISCONNECT_TIMEOUT_MS,
    ...(process.env.NODE_ENV === 'test' ? { autoStartLocalRuntime: false } : {}),
    onBackendOpen: payload => handleWindieAgentConnection({ type: 'open', ...payload }),
    onBackendClose: payload => handleWindieAgentConnection({ type: 'close', ...payload }),
    onBackendError: payload => handleWindieAgentConnection({ type: 'error', ...payload }),
    onBackendHandshakeError: error => handleWindieAgentConnection({ type: 'handshake-error', error }),
    onBackendMessageError: error => handleWindieAgentConnection({ type: 'message-error', error }),
    onBackendSend: type => {
      windieAgent?.noteBackendTraffic?.(`send:${type}`);
    },
    onBackendFallback: endpoint => handleWindieAgentBackendFallback(endpoint),
  });
  const agent = await client.wakeUp({
    installAuth: buildDesktopInstallAuth(),
    name: 'WindieOS',
    workspacePath: resolvedWorkspacePath,
    builtins: process.env.NODE_ENV === 'test' ? [] : 'default',
    ...(process.env.NODE_ENV === 'test' ? { memory: false, persistence: false } : {}),
    localToolLifecycle,
  });
  const adapter = createDirectWakeUpAgentAdapter({
    agent,
    workspacePath: resolvedWorkspacePath || null,
  });
  log(`WindieClient wakeUp runtime started for ${reason}.`);
  return adapter;
}

async function ensureWindieAgent({ reason = 'request', workspacePath = null } = {}) {
  if (windieAgent) {
    return windieAgent;
  }
  if (!pendingWindieAgentStartPromise) {
    pendingWindieAgentStartPromise = startWindieAgent({
      reason,
      workspacePath,
    })
      .then((agent) => {
        windieAgent = agent;
        return agent;
      })
      .finally(() => {
        pendingWindieAgentStartPromise = null;
      });
  }
  return pendingWindieAgentStartPromise;
}

function syncBackendIdleDisconnectTimer(reason = 'idle-sync') {
  windieAgent?.syncBackendIdleTimer(reason);
}

function noteBackendTraffic(reason = 'traffic') {
  windieAgent?.noteBackendTraffic(reason);
}

function isBackendRuntimeConnected() {
  return isConnected && Boolean(windieAgent?.isConnected());
}

async function ensureBackendConnection(reason = 'request', timeoutMs = BACKEND_CONNECT_TIMEOUT_MS) {
  const agent = await ensureWindieAgent({
    reason,
    conversationRef: currentConversationRef,
  });
  return agent.ensureConnected({
    reason,
    timeoutMs,
    conversationRef: currentConversationRef,
  });
}

function buildIpcStatusPayload(connected) {
  return {
    isConnected: connected,
    userId: currentUserId,
    backendWsUrl: backendEndpointState.getWsUrl(),
    backendHttpUrl: backendEndpointState.getHttpUrl(),
    globalAgentStopShortcutStatus: currentGlobalAgentStopShortcutStatus,
  };
}

function broadcastConnectionStatus(connected) {
  broadcastToRenderers('ipc-status', buildIpcStatusPayload(connected));
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
    getLatestCurrentTurn: () => latestCurrentTurnProjection,
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

function handleAgentBackendEvent(rendererData) {
  const activeContext = activeQueryContext;
  if (
    rendererData
    && typeof rendererData === 'object'
    && rendererData.type === 'query-accepted'
    && activeContext
    && typeof rendererData.turn_ref === 'string'
    && rendererData.turn_ref === activeContext.queryMessageId
  ) {
    activeContext.accepted = true;
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

function handleAgentBackendClose({ closeReason, shouldReconnect } = {}) {
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
    handleAgentBackendEvent(interruptedEvent);
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
}

function shutdownIpcForTests() {
  resetSettingsSyncState();
  resetBackendSessionState();
  resetIpcProcessStateForTests();
  rendererWindows = new Set();
  backendMessageObservers.clear();
  applyResponseOverlayPhase = null;
  onBeforeOverlayQueryCapture = null;
  setAgentLoopStopShortcutEnabled = null;
  setGlobalAgentStopShortcutAccelerator = null;
  localToolLifecycle = null;
  pendingInstallAuthStatePromise = null;
  isConnected = false;
  pendingWindieAgentStartPromise = null;
  windieAgent?.close();
  windieAgent = null;
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
  localToolLifecycle = options.localToolLifecycle && typeof options.localToolLifecycle === 'object'
    ? options.localToolLifecycle
    : null;
  const getWindows = typeof options.getWindows === 'function'
    ? options.getWindows
    : () => ({ mainWindow: win, chatWindow: null });
  rendererWindows = new Set();
  trackRendererWindow(win);
  initializeIpcStartupState({
    loadInstallAuthStateFromDisk,
    applyInstallAuthState,
    loadCachedFrontendConfigFromDisk,
    isValidConfigPayload,
    applyShortcutStatusFallbackToConfig,
    setLatestFrontendConfig: (config) => {
      latestFrontendConfig = config;
    },
    setGlobalAgentStopShortcutAccelerator,
    setAgentLoopStopShortcutEnabled,
    getResponseOverlayPhase: () => responseOverlayPhaseState.getPhase(),
    isAgentLoopStopShortcutPhase,
    log,
  });

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
      backendWsUrl: backendEndpointState.getWsUrl(),
      backendHttpUrl: backendEndpointState.getHttpUrl(),
      globalAgentStopShortcutStatus: currentGlobalAgentStopShortcutStatus,
    };
  });

  registerResponseOverlayHandlers({
    ipcMain,
    getResponseOverlayPhase: () => responseOverlayPhaseState.getPhase(),
    setResponseOverlayPhase,
  });

  registerArtifactHandlers({
    ipcMain,
    uploadArtifact,
    fetchArtifactImage,
    ensureInstallAuthState,
    getBackendHttpUrl: () => backendEndpointState.getHttpUrl(),
    buildInstallAuthHeaders,
  });

  registerClipboardImageHandler({
    ipcMain,
    clipboard,
    nativeImage,
    getTrustedImageOrigins: () => [
      backendEndpointState.getHttpUrl(),
      ...backendEndpointState.getCandidates().map((candidate) => candidate.httpUrl),
    ],
  });
  registerImageContextMenuHandler({
    ipcMain,
    Menu,
    BrowserWindow,
    clipboard,
    nativeImage,
    getTrustedImageOrigins: () => [
      backendEndpointState.getHttpUrl(),
      ...backendEndpointState.getCandidates().map((candidate) => candidate.httpUrl),
    ],
  });

  registerOpenAICodexOAuthHandlers({
    ipcMain,
    loginOpenAICodexOAuth,
    logoutOpenAICodexOAuth,
    openExternal: (url) => shell.openExternal(url),
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
    getPendingSettingsSyncPromise: () => settingsSyncRuntime.getPendingSettingsSyncPromise(),
    sendQueryToBackend,
    stopQuery: sendStopQueryToBackend,
    setResponseOverlayPhase,
    resolvePreferredArtifactHttpUrl: () => resolvePreferredArtifactHttpUrl(
      backendEndpointState.getHttpUrl(),
      backendEndpointState.getCandidates(),
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
      broadcastToRenderers,
      ipcEventReplayState,
      buildQueryPayload,
      broadcastQuerySendFailureRuntime,
      buildQuerySendFailure,
    },
  });

  ipcMain.handle('windie:invoke', async (event, payload = {}) => (
    handleWindieSdkInvoke(event, payload, {
      handleRendererChatQuery,
      handleRendererStopQuery,
    })
  ));

}

async function sendQueryToBackend({ payload = {}, messageId = null } = {}) {
  try {
    const agent = await ensureWindieAgent({
      reason: 'query',
      conversationRef: resolveConversationRefFromPayload(payload),
      workspacePath: resolveWorkspacePathForAgent(payload),
    });
    const text = typeof payload.text === 'string' ? payload.text : '';
    const result = await agent.run({
      text,
      turnRef: messageId || undefined,
      payload,
    });
    return result?.queryMessageId || result?.turnRef || null;
  } catch (error) {
    log(`Failed to send query through WindieAgent: ${error?.message || error}`);
    return null;
  }
}

async function sendStopQueryToBackend(payload = {}) {
  if (!windieAgent) {
    return null;
  }
  return windieAgent.stop({
    conversation_ref: resolveConversationRefFromPayload(payload),
    turn_ref: payload && typeof payload.turn_ref === 'string'
      ? payload.turn_ref
      : null,
  });
}

async function updateSettingsOnBackend(payload = {}) {
  const agent = await ensureWindieAgent({ reason: 'update-settings' });
  return agent.updateSettings(payload);
}

async function requestModelListFromBackend() {
  const agent = await ensureWindieAgent({ reason: 'list-models' });
  return agent.requestModelList();
}

async function sendWakewordDetectedToBackend(payload = {}) {
  const agent = await ensureWindieAgent({ reason: 'wakeword-detected' });
  return agent.wakewordDetected(payload);
}

async function triggerStopQueryFromMain() {
  const messageId = await sendStopQueryToBackend(
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
    backendWsUrl: backendEndpointState.getWsUrl(),
    backendHttpUrl: backendEndpointState.getHttpUrl(),
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

function normalizePositiveInteger(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : undefined;
}

function normalizeMemoryType(value) {
  const type = normalizeOptionalString(value);
  if (type !== 'episodic' && type !== 'semantic') {
    throw new Error('Windie SDK command requires memory type episodic or semantic.');
  }
  return type;
}

function requireCommandUserId(payload = {}) {
  const userId = normalizeOptionalString(payload.userId || payload.user_id);
  if (!userId || userId === 'default_user') {
    throw new Error('Windie SDK command requires an active user id.');
  }
  if (currentUserId && userId !== currentUserId) {
    throw new Error('Windie SDK command user id does not match the active user.');
  }
  return userId;
}

function requireAuthenticatedCommandUserId() {
  const userId = normalizeOptionalString(currentUserId);
  if (!userId || userId === 'default_user') {
    throw new Error('Windie SDK command requires an authenticated user.');
  }
  return userId;
}

function optionalCommandConversationRef(payload = {}) {
  return normalizeOptionalString(payload.conversationRef || payload.conversation_ref);
}

function requireCommandConversationRef(payload = {}) {
  const conversationRef = optionalCommandConversationRef(payload);
  if (!conversationRef) {
    throw new Error('Windie SDK command requires a conversation reference.');
  }
  return conversationRef;
}

function requireCommandString(payload = {}, key, label) {
  const value = normalizeOptionalString(payload[key]);
  if (!value) {
    throw new Error(`Windie SDK command requires ${label}.`);
  }
  return value;
}

function optionalCommandNonNegativeInteger(payload = {}, keys = []) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
      return value;
    }
  }
  return undefined;
}

function buildWindieSdkCommandHandlers({
  event,
  handleRendererChatQuery,
  handleRendererStopQuery,
}) {
  return {
    'conversation.send': async (payload = {}) => handleRendererChatQuery(event, payload),
    'conversation.stop': async (payload = {}) => handleRendererStopQuery(payload),
    'conversation.rehydrate': async (payload = {}) => {
      const agent = await ensureWindieAgent({
        reason: 'sdk-command:conversation.rehydrate',
        conversationRef: optionalCommandConversationRef(payload),
        workspacePath: resolveWorkspacePathForAgent(payload),
      });
      return agent.rehydrateMessages(payload);
    },
    'conversation.compact': async (payload = {}) => {
      const agent = await ensureWindieAgent({
        reason: 'sdk-command:conversation.compact',
        conversationRef: optionalCommandConversationRef(payload),
      });
      return agent.compactHistory(payload);
    },
    'settings.update': async (payload = {}) => sendSettingsUpdate(payload, 'renderer-sdk-command'),
    'models.list': async () => requestModelListFromBackend(),
    'wakeword.detected': async (payload = {}) => {
      if (!isBackendRuntimeConnected()) {
        await ensureBackendConnection('wakeword-detected');
      }
      await ensureInitialSettingsSync();
      const pendingSettingsSyncPromise = settingsSyncRuntime.getPendingSettingsSyncPromise();
      if (pendingSettingsSyncPromise) {
        await pendingSettingsSyncPromise;
      }
      return sendWakewordDetectedToBackend(payload);
    },
    'memories.list': async (payload = {}) => {
      const agent = await ensureWindieAgent({ reason: 'sdk-command:memories.list' });
      return agent.listMemories({
        userId: requireAuthenticatedCommandUserId(),
        type: normalizeMemoryType(payload.type),
        limit: normalizePositiveInteger(payload.limit),
      });
    },
    'memories.delete': async (payload = {}) => {
      const agent = await ensureWindieAgent({ reason: 'sdk-command:memories.delete' });
      return agent.deleteMemory({
        userId: requireAuthenticatedCommandUserId(),
        type: normalizeMemoryType(payload.type),
        memoryId: requireCommandString(payload, 'memoryId', 'memory id'),
      });
    },
    'memories.clearAll': async (payload = {}) => {
      const agent = await ensureWindieAgent({ reason: 'sdk-command:memories.clearAll' });
      return agent.clearMemories({
        userId: requireAuthenticatedCommandUserId(),
      });
    },
    'conversations.list': async (payload = {}) => {
      requireCommandUserId(payload);
      const agent = await ensureWindieAgent({ reason: 'sdk-command:conversations.list' });
      return agent.listConversations({
        limit: normalizePositiveInteger(payload.limit),
      });
    },
    'conversations.search': async (payload = {}) => {
      requireCommandUserId(payload);
      const agent = await ensureWindieAgent({ reason: 'sdk-command:conversations.search' });
      return agent.searchConversations({
        query: typeof payload.query === 'string' ? payload.query : '',
        limit: normalizePositiveInteger(payload.limit),
      });
    },
    'conversations.delete': async (payload = {}) => {
      requireCommandUserId(payload);
      const agent = await ensureWindieAgent({ reason: 'sdk-command:conversations.delete' });
      await agent.deleteConversation({
        conversationRef: requireCommandConversationRef(payload),
      });
      return { deleted: true };
    },
    'conversations.clearAll': async (payload = {}) => {
      requireCommandUserId(payload);
      const agent = await ensureWindieAgent({ reason: 'sdk-command:conversations.clearAll' });
      await agent.clearConversations();
      return { deleted: true };
    },
    'conversation.load': async (payload = {}) => {
      requireCommandUserId(payload);
      const agent = await ensureWindieAgent({
        reason: 'sdk-command:conversation.load',
        conversationRef: optionalCommandConversationRef(payload),
      });
      return agent.loadConversation({
        conversationRef: requireCommandConversationRef(payload),
      });
    },
    'conversation.getRevision': async (payload = {}) => {
      requireCommandUserId(payload);
      const agent = await ensureWindieAgent({
        reason: 'sdk-command:conversation.getRevision',
        conversationRef: optionalCommandConversationRef(payload),
      });
      return agent.getConversationRevision({
        conversationRef: requireCommandConversationRef(payload),
      });
    },
    'conversation.appendEvent': async (payload = {}) => {
      requireCommandUserId(payload);
      const event = isPlainObject(payload.event) ? payload.event : null;
      if (!event) {
        throw new Error('conversation.appendEvent requires an event payload');
      }
      const agent = await ensureWindieAgent({
        reason: 'sdk-command:conversation.appendEvent',
        conversationRef: optionalCommandConversationRef(event) || optionalCommandConversationRef(payload),
      });
      await agent.appendConversationEvent(event);
      return { stored: true };
    },
    'conversation.rewrite': async (payload = {}) => {
      requireCommandUserId(payload);
      const plan = isPlainObject(payload.plan) ? payload.plan : null;
      if (!plan) {
        throw new Error('conversation.rewrite requires a plan payload');
      }
      const agent = await ensureWindieAgent({
        reason: 'sdk-command:conversation.rewrite',
        conversationRef: optionalCommandConversationRef(plan) || optionalCommandConversationRef(payload),
      });
      await agent.rewriteConversation(plan);
      return { rewritten: true };
    },
    'conversation.replaceCompactedReplay': async (payload = {}) => {
      requireCommandUserId(payload);
      const snapshot = isPlainObject(payload.snapshot) ? payload.snapshot : null;
      if (!snapshot) {
        throw new Error('conversation.replaceCompactedReplay requires a snapshot payload');
      }
      const agent = await ensureWindieAgent({
        reason: 'sdk-command:conversation.replaceCompactedReplay',
        conversationRef: optionalCommandConversationRef(snapshot) || optionalCommandConversationRef(payload),
      });
      await agent.replaceCompactedReplay(snapshot);
      return { stored: true };
    },
    'conversation.prepareEditAndResend': async (payload = {}) => {
      requireCommandUserId(payload);
      const conversationRef = requireCommandConversationRef(payload);
      const workspacePath = resolveWorkspacePathForAgent(payload) || null;
      const agent = await ensureWindieAgent({
        reason: 'sdk-command:conversation.prepareEditAndResend',
        conversationRef,
        workspacePath,
      });
      const prepared = await agent.prepareEditAndResend({
        conversationRef,
        messageId: requireCommandString(payload, 'messageId', 'message id'),
        userMessageOrdinal: optionalCommandNonNegativeInteger(payload, ['userMessageOrdinal', 'user_message_ordinal']),
        text: requireCommandString(payload, 'text', 'replacement text'),
        turnRef: normalizeOptionalString(payload.turnRef || payload.turn_ref) || undefined,
        payload: cloneJsonObject(payload.payload),
        model: isPlainObject(payload.model) ? payload.model : undefined,
      });
      return {
        ...prepared,
        conversationRef,
        workspacePath,
      };
    },
    'conversation.prepareRetryTurn': async (payload = {}) => {
      requireCommandUserId(payload);
      const conversationRef = requireCommandConversationRef(payload);
      const workspacePath = resolveWorkspacePathForAgent(payload) || null;
      const agent = await ensureWindieAgent({
        reason: 'sdk-command:conversation.prepareRetryTurn',
        conversationRef,
        workspacePath,
      });
      const messageId = normalizeOptionalString(payload.messageId || payload.message_id);
      const prepared = await agent.prepareRetryTurn({
        conversationRef,
        ...(messageId ? { messageId } : {}),
        userMessageOrdinal: optionalCommandNonNegativeInteger(payload, ['userMessageOrdinal', 'user_message_ordinal']),
        turnRef: normalizeOptionalString(payload.turnRef || payload.turn_ref) || undefined,
        payload: cloneJsonObject(payload.payload),
        model: isPlainObject(payload.model) ? payload.model : undefined,
      });
      return {
        ...prepared,
        conversationRef,
        workspacePath,
      };
    },
  };
}

async function handleWindieSdkInvoke(event, input = {}, dependencies = {}) {
  const command = normalizeOptionalString(input?.command);
  const payload = isPlainObject(input?.payload) ? input.payload : {};
  const handlers = buildWindieSdkCommandHandlers({
    event,
    ...dependencies,
  });
  try {
    const handler = command ? handlers[command] : null;
    if (!handler) {
      throw new Error(`Unsupported Windie SDK command: ${command || 'unknown'}`);
    }
    const data = await handler(payload);
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || `Windie SDK command failed: ${command || 'unknown'}`,
    };
  }
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

const automatedQueryDispatcher = createAutomatedQueryDispatcher({
  prepareAutomatedQueryPayload,
  ensureBackendConnection,
  ensureInitialSettingsSync,
  getPendingSettingsSyncPromise: () => settingsSyncRuntime.getPendingSettingsSyncPromise(),
  buildQueryPayload,
  attachAgentDefinitionContext: (payload) => buildBackendQueryPayload(
    attachAgentDefinitionContext(payload),
  ),
  sendQueryToBackend,
  getState: () => ({
    currentUserId,
    isFirstQuery,
  }),
  setCurrentConversationRef: (conversationRef) => {
    currentConversationRef = conversationRef;
  },
  setFirstQuery: (nextValue) => {
    isFirstQuery = nextValue;
  },
  uuidGenerator: uuidv4,
  log,
});

async function sendAutomatedQuery(options = {}) {
  return automatedQueryDispatcher.sendAutomatedQuery(options);
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
