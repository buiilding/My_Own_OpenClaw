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
} = require('./app/backend_endpoints.cjs');
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
  handleRendererLiveSurfaceTrace,
} = require('./debug/live_surface_trace_runtime.cjs');
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
  preserveSdkTurnInputFields,
} = require('./ipc/ipc_query_runtime.cjs');
const {
  createAutomatedQueryDispatcher,
} = require('./ipc/ipc_automated_query_dispatcher.cjs');
const {
  initializeIpcStartupState,
} = require('./ipc/ipc_startup_state.cjs');
const {
  resolveWorkspaceRepoInstructionPromptLayers,
} = require('./app/repo_instruction_runtime.cjs');
const {
  loadExtensionSkillPromptLayers,
  loadPublicExtensionRegistry,
} = require('./extensions/extension_manifest.cjs');
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
} = require('./app/openai_codex_oauth.cjs');
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
} = require('./surfaces/display_affinity_runtime.cjs');
const {
  applyTranscriptSessionSync,
} = require('./ipc/ipc_transcript_session_sync.cjs');
const {
  isAgentLoopStopShortcutPhase,
} = require('./sdk/agent_stop_shortcut_runtime.cjs');
const {
  buildAgentDefinition,
} = require('./sdk/agent_definition.cjs');
const {
  createDesktopAutoSidecarLaunchPlan,
} = require('./sidecar/sdk_sidecar_launch_options.cjs');
const {
  WindieClient,
  TraceRecorder,
  createConversationEvent,
} = require('../../../packages/windie-sdk-js/cjs/index.js');
const {
  buildConversationEventFromBackendEvent,
} = require('./ipc/ipc_conversation_event_broadcast.cjs');
const { logChatPillMainTrace } = require('./debug/chat_pill_trace_runtime.cjs');
const {
  logLiveSurfaceTrace,
  summarizeCurrentTurn,
} = require('./debug/live_surface_trace_runtime.cjs');

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
let syncSdkLiveTurnSurfaceIntent = null;
let windieAgentWebSocketImpl = null;
let currentGlobalAgentStopShortcutStatus = null;
let pendingInstallAuthStatePromise = null;
let windieAgent = null;
let pendingWindieAgentStartPromise = null;
let latestCurrentTurnProjection = null;
let desktopAutoSidecarLaunchConfig = null;
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
  syncSdkLiveTurnSurfaceIntent = null;
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

function buildDesktopAutoSidecarOptionsForAgent() {
  const plan = createDesktopAutoSidecarLaunchPlan({
    ...(desktopAutoSidecarLaunchConfig || {}),
    backendEndpoints: {
      httpUrl: backendEndpointState.getHttpUrl(),
    },
    ...(windieAgentWebSocketImpl ? { WebSocketImpl: windieAgentWebSocketImpl } : {}),
  });
  if (plan.ok !== true) {
    throw new Error(plan.error || 'Windie sidecar daemon launch is unavailable.');
  }
  return plan.options;
}

function createDirectWakeUpAgentAdapter({
  agent,
  workspacePath = null,
  store = null,
} = {}) {
  const defaultConversationRef = `conv-${agent.id}`;
  const runtimeHandles = new Map();
  let detachRawBackendEvents = () => {};
  let closed = false;

  function broadcastStatus(status) {
    broadcastToRenderers('windie:status', status);
  }

  function createRuntimeHandle(nextConversationRef) {
    const runtimeConversationRef = normalizeOptionalString(nextConversationRef) || defaultConversationRef;
    const runtime = agent.conversation({
      conversationRef: runtimeConversationRef,
      ...(store ? { store } : {}),
    });
    const handle = {
      conversationRef: runtimeConversationRef,
      runtime,
      detachRuntimeEvents: () => {},
      latestSnapshot: null,
      activeTurnRef: null,
      sendInFlight: false,
      terminal: false,
      inferenceContextReady: false,
      inferenceContextPromise: null,
    };
    handle.detachRuntimeEvents = runtime.subscribeEvents((event, snapshot) => {
      handle.latestSnapshot = snapshot;
      if (snapshot?.currentTurn?.turnRef) {
        handle.activeTurnRef = snapshot.currentTurn.turnRef;
      }
      const phase = snapshot?.currentTurn?.phase;
      if (phase === 'complete' || phase === 'error' || phase === 'idle') {
        handle.sendInFlight = false;
        handle.terminal = true;
      } else if (phase) {
        handle.terminal = false;
      }
      broadcastToRenderers('windie:conversation-event', event);
      if (event && event.type === 'memory_store_changed') {
        broadcastToRenderers('windie:memory-store-changed', event);
      }
      broadcastToRenderers('windie:rows', snapshot.displayRows);
      latestCurrentTurnProjection = snapshot.currentTurn || null;
      logLiveSurfaceTrace('sdk.current_turn.received', {
        ...summarizeCurrentTurn(snapshot.currentTurn),
        source: 'conversation-runtime',
        displayRowCount: Array.isArray(snapshot.displayRows) ? snapshot.displayRows.length : 0,
      });
      currentTurnTraceLogger.trace(snapshot.currentTurn);
      if (syncSdkLiveTurnSurfaceIntent) {
        try {
          syncSdkLiveTurnSurfaceIntent(snapshot.currentTurn || null);
        } catch (error) {
          log('Failed to sync SDK live-turn surface intent:', error?.message || error);
        }
      }
      broadcastToRenderers('windie:current-turn', snapshot.currentTurn);
      const terminalStatus = statusFromConversationEvent(event, workspacePath);
      if (terminalStatus) {
        broadcastStatus(terminalStatus);
      }
    });
    runtimeHandles.set(runtimeConversationRef, handle);
    broadcastStatus({
      phase: 'ready',
      conversationRef: runtimeConversationRef,
      workspacePath,
    });
    return handle;
  }

  function getConversationRuntimeHandle(nextConversationRef = null) {
    const resolvedConversationRef = normalizeOptionalString(nextConversationRef) || defaultConversationRef;
    return runtimeHandles.get(resolvedConversationRef) || createRuntimeHandle(resolvedConversationRef);
  }

  function closeRuntimeHandle(nextConversationRef = null) {
    const resolvedConversationRef = normalizeOptionalString(nextConversationRef);
    if (!resolvedConversationRef) {
      return;
    }
    const handle = runtimeHandles.get(resolvedConversationRef);
    if (!handle) {
      return;
    }
    handle.detachRuntimeEvents();
    handle.runtime.close();
    runtimeHandles.delete(resolvedConversationRef);
  }

  function closeAllRuntimeHandles() {
    for (const handle of runtimeHandles.values()) {
      handle.detachRuntimeEvents();
      handle.runtime.close();
    }
    runtimeHandles.clear();
  }

  function markInferenceContextStale(nextConversationRef = null) {
    const resolvedConversationRef = normalizeOptionalString(nextConversationRef);
    const handles = resolvedConversationRef
      ? [runtimeHandles.get(resolvedConversationRef)].filter(Boolean)
      : Array.from(runtimeHandles.values());
    for (const handle of handles) {
      handle.inferenceContextReady = false;
      handle.inferenceContextPromise = null;
    }
  }

  async function reloadRuntimeSnapshot(handle) {
    const snapshot = await handle.runtime.load();
    handle.latestSnapshot = snapshot;
    return snapshot;
  }

  async function ensureInferenceContextForSend(handle, sendInput = {}) {
    if (handle.inferenceContextReady) {
      return;
    }
    if (handle.inferenceContextPromise) {
      await handle.inferenceContextPromise;
      return;
    }
    handle.inferenceContextPromise = (async () => {
      const snapshot = handle.latestSnapshot || await handle.runtime.load();
      handle.latestSnapshot = snapshot;
      const rehydrate = snapshot?.rehydrate;
      const messages = Array.isArray(rehydrate?.messages) ? rehydrate.messages : [];
      if (messages.length > 0) {
        await handle.runtime.rehydrateMessages({
          conversation_ref: handle.conversationRef,
          messages,
          rehydrate_mode: 'replace',
          workspace_path: resolveWorkspacePathForAgent(sendInput?.payload || sendInput) || workspacePath || null,
        });
      }
      handle.inferenceContextReady = true;
    })();
    try {
      await handle.inferenceContextPromise;
    } finally {
      handle.inferenceContextPromise = null;
    }
  }

  getConversationRuntimeHandle(defaultConversationRef);
  detachRawBackendEvents = agent.subscribeRawBackendEvents((event) => {
    handleAgentBackendEvent(event);
  });

  return {
    run: async (input = {}) => {
      const sendInput = typeof input === 'string' ? { text: input } : input;
      const resolvedConversationRef = resolveRuntimeConversationRef(sendInput) || defaultConversationRef;
      const handle = getConversationRuntimeHandle(resolvedConversationRef);
      if (handle.sendInFlight && !handle.terminal) {
        throw new Error(`Conversation already has an active turn: ${resolvedConversationRef}`);
      }
      handle.sendInFlight = true;
      handle.terminal = false;
      broadcastStatus({
        phase: 'running',
        conversationRef: resolvedConversationRef,
        turnRef: sendInput.turnRef ?? null,
        workspacePath,
      });
      try {
        await ensureInferenceContextForSend(handle, sendInput);
        const result = await handle.runtime.send(sendInput);
        handle.activeTurnRef = result.turnRef;
        broadcastStatus({
          phase: 'running',
          conversationRef: resolvedConversationRef,
          turnRef: result.turnRef,
          workspacePath,
        });
        return result;
      } catch (error) {
        handle.sendInFlight = false;
        handle.terminal = true;
        throw error;
      }
    },
    stop: async (input = {}) => {
      const stopConversationRef = resolveRuntimeConversationRef(input) || defaultConversationRef;
      const stopTurnRef = input && typeof input === 'object' && typeof input.turn_ref === 'string'
        ? input.turn_ref
        : (input && typeof input === 'object' && typeof input.turnRef === 'string' ? input.turnRef : null);
      const handle = getConversationRuntimeHandle(stopConversationRef);
      handle.sendInFlight = false;
      handle.terminal = true;
      return handle.runtime.stop(stopTurnRef || handle.activeTurnRef || null);
    },
    updateSettings: payload => agent.updateSettings(payload),
    requestModelList: () => agent.requestModelList(),
    rehydrateMessages: async (payload = {}) => {
      const handle = getConversationRuntimeHandle(resolveRuntimeConversationRef(payload));
      const result = await handle.runtime.rehydrateMessages(payload);
      handle.inferenceContextReady = true;
      return result;
    },
    compactHistory: async (payload = {}) => {
      const handle = getConversationRuntimeHandle(resolveRuntimeConversationRef(payload));
      await ensureInferenceContextForSend(handle, payload);
      return handle.runtime.compactHistory({
        force: payload.force,
        payload,
      });
    },
    listMemories: options => agent.listMemories(options),
    deleteMemory: options => agent.deleteMemory(options),
    clearMemories: options => agent.clearMemories(options),
    listConversations: options => agent.listConversations(options),
    searchConversations: options => agent.searchConversations(options),
    deleteConversation: async (options = {}) => {
      const deletedConversationRef = typeof options === 'string'
        ? options
        : (options?.conversationRef || options?.conversation_ref || null);
      await agent.deleteConversation(options);
      closeRuntimeHandle(deletedConversationRef);
    },
    clearConversations: async (options = {}) => {
      await agent.clearConversations(options);
      closeAllRuntimeHandles();
    },
    loadConversation: async (options = {}) => {
      const loadConversationRef = typeof options === 'string'
        ? options
        : (options?.conversationRef || options?.conversation_ref || null);
      const handle = getConversationRuntimeHandle(loadConversationRef);
      return reloadRuntimeSnapshot(handle);
    },
    getConversationRevision: options => agent.getConversationRevision(options),
    appendConversationEvent: async (options = {}) => {
      const event = options && typeof options === 'object' && 'event' in options
        ? options.event
        : options;
      const appendConversationRef = resolveRuntimeConversationRef(event) || resolveRuntimeConversationRef(options);
      await agent.appendConversationEvent(options);
      if (appendConversationRef) {
        const handle = getConversationRuntimeHandle(appendConversationRef);
        markInferenceContextStale(appendConversationRef);
        await reloadRuntimeSnapshot(handle);
      }
    },
    rewriteConversation: async (options = {}) => {
      const plan = options && typeof options === 'object' && 'plan' in options
        ? options.plan
        : options;
      const rewriteConversationRef = resolveRuntimeConversationRef(plan) || resolveRuntimeConversationRef(options);
      await agent.rewriteConversation(options);
      if (rewriteConversationRef) {
        const handle = getConversationRuntimeHandle(rewriteConversationRef);
        markInferenceContextStale(rewriteConversationRef);
        await reloadRuntimeSnapshot(handle);
      }
    },
    replaceCompactedReplay: async (options = {}) => {
      const snapshot = options && typeof options === 'object' && 'snapshot' in options
        ? options.snapshot
        : options;
      const replayConversationRef = resolveRuntimeConversationRef(snapshot) || resolveRuntimeConversationRef(options);
      await agent.replaceCompactedReplay(options);
      if (replayConversationRef) {
        const handle = getConversationRuntimeHandle(replayConversationRef);
        markInferenceContextStale(replayConversationRef);
        await reloadRuntimeSnapshot(handle);
      }
    },
    prepareEditAndResend: async (options = {}) => {
      const editConversationRef = resolveRuntimeConversationRef(options);
      const handle = getConversationRuntimeHandle(editConversationRef);
      const input = { ...options };
      delete input.conversationRef;
      delete input.conversation_ref;
      delete input.revisionId;
      delete input.revision_id;
      delete input.store;
      markInferenceContextStale(handle.conversationRef);
      const prepared = await handle.runtime.prepareEditAndResend(input);
      handle.inferenceContextReady = true;
      await reloadRuntimeSnapshot(handle);
      return prepared;
    },
    prepareRetryTurn: async (options = {}) => {
      const retryConversationRef = resolveRuntimeConversationRef(options);
      const handle = getConversationRuntimeHandle(retryConversationRef);
      const input = { ...options };
      delete input.conversationRef;
      delete input.conversation_ref;
      delete input.revisionId;
      delete input.revision_id;
      delete input.store;
      markInferenceContextStale(handle.conversationRef);
      const prepared = await handle.runtime.prepareRetryTurn(input);
      handle.inferenceContextReady = true;
      await reloadRuntimeSnapshot(handle);
      return prepared;
    },
    wakewordDetected: payload => agent.wakewordDetected(payload),
    ensureConnected: () => agent.ensureConnected(),
    isConnected: () => agent.isConnected(),
    markInferenceContextsStale: () => markInferenceContextStale(),
    noteBackendTraffic: reason => agent.noteBackendTraffic(reason),
    syncBackendIdleTimer: reason => agent.syncBackendIdleTimer(reason),
    localStatus: () => agent.status(),
    close: () => {
      if (closed) {
        return;
      }
      closed = true;
      detachRawBackendEvents();
      closeAllRuntimeHandles();
      agent.sleep();
      broadcastStatus({
        phase: 'closed',
        conversationRef: defaultConversationRef,
        workspacePath,
      });
    },
  };
}

async function startWindieAgent({ reason = 'request', workspacePath = null } = {}) {
  await ensureInstallAuthState();
  const resolvedWorkspacePath = workspacePath || resolveWorkspacePathForAgent() || undefined;
  const localRuntimeOptions = process.env.NODE_ENV === 'test'
    ? { autoStartLocalRuntime: false }
    : { autoSidecar: buildDesktopAutoSidecarOptionsForAgent() };
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
    ...(windieAgentWebSocketImpl ? { WebSocketImpl: windieAgentWebSocketImpl } : {}),
    ...localRuntimeOptions,
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
  windieAgent?.markInferenceContextsStale?.();
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
  syncSdkLiveTurnSurfaceIntent = null;
  windieAgentWebSocketImpl = null;
  pendingInstallAuthStatePromise = null;
  isConnected = false;
  pendingWindieAgentStartPromise = null;
  windieAgent?.close();
  windieAgent = null;
  desktopAutoSidecarLaunchConfig = null;
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
  syncSdkLiveTurnSurfaceIntent = typeof options.syncSdkLiveTurnSurfaceIntent === 'function'
    ? options.syncSdkLiveTurnSurfaceIntent
    : null;
  windieAgentWebSocketImpl = typeof options.WebSocketImpl === 'function'
    ? options.WebSocketImpl
    : null;
  desktopAutoSidecarLaunchConfig = {
    isPackaged: options.isPackaged === true,
    permissionStatePath: options.permissionStatePath,
    authStatePath: options.authStatePath,
  };
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

  ipcMain.on('live-surface-trace', (_event, payload = {}) => {
    handleRendererLiveSurfaceTrace(payload);
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
    attachAgentDefinitionContext: (payload) => preserveSdkTurnInputFields(
      buildBackendQueryPayload(attachAgentDefinitionContext(payload)),
      payload,
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
    const sourcePayload = isPlainObject(payload) ? payload : {};
    const resources = Array.isArray(sourcePayload.resources) ? sourcePayload.resources : undefined;
    const metadata = isPlainObject(sourcePayload.metadata) ? sourcePayload.metadata : undefined;
    const backendPayload = { ...sourcePayload };
    delete backendPayload.resources;
    delete backendPayload.metadata;
    const agent = await ensureWindieAgent({
      reason: 'query',
      conversationRef: resolveConversationRefFromPayload(backendPayload),
      workspacePath: resolveWorkspacePathForAgent(backendPayload),
    });
    const text = typeof backendPayload.text === 'string' ? backendPayload.text : '';
    const result = await agent.run({
      text,
      turnRef: messageId || undefined,
      payload: backendPayload,
      resources,
      metadata,
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

async function appendMainProcessTraceEvent(input = {}) {
  const conversationRef = normalizeOptionalString(input.conversationRef)
    || currentConversationRef;
  if (!conversationRef) {
    return { stored: false, reason: 'missing_conversation_ref' };
  }
  const turnRef = normalizeOptionalString(input.turnRef) || null;
  const agent = await ensureWindieAgent({
    reason: 'main-process-trace',
    conversationRef,
  });
  const recorder = new TraceRecorder({
    conversationRef,
    turnRef,
    runtime: input.runtime || 'electron-main',
    emit: async (payload) => {
      await agent.appendConversationEvent(createConversationEvent({
        type: 'trace_event',
        conversationRef,
        turnRef,
        source: 'ui',
        payload,
      }));
    },
  });
  const payload = await recorder.record({
    path: input.path,
    stage: input.stage,
    status: input.status,
    runtime: input.runtime || 'electron-main',
    requestId: input.requestId,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    durationMs: input.durationMs,
    data: input.data,
    error: input.error,
  });
  return { stored: true, traceId: payload.traceId, spanId: payload.spanId };
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
      requireAuthenticatedCommandUserId();
      return agent.listMemories({
        type: normalizeMemoryType(payload.type),
        limit: normalizePositiveInteger(payload.limit),
      });
    },
    'memories.delete': async (payload = {}) => {
      const agent = await ensureWindieAgent({ reason: 'sdk-command:memories.delete' });
      requireAuthenticatedCommandUserId();
      return agent.deleteMemory({
        type: normalizeMemoryType(payload.type),
        memoryId: requireCommandString(payload, 'memoryId', 'memory id'),
      });
    },
    'memories.clearAll': async (payload = {}) => {
      const agent = await ensureWindieAgent({ reason: 'sdk-command:memories.clearAll' });
      requireAuthenticatedCommandUserId();
      return agent.clearMemories();
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
    'conversation.loadDisplay': async (payload = {}) => {
      requireCommandUserId(payload);
      const agent = await ensureWindieAgent({
        reason: 'sdk-command:conversation.loadDisplay',
        conversationRef: optionalCommandConversationRef(payload),
      });
      const snapshot = await agent.loadConversation({
        conversationRef: requireCommandConversationRef(payload),
      });
      return {
        display: snapshot.display,
        displayRows: snapshot.displayRows,
        currentTurn: snapshot.currentTurn,
      };
    },
    'conversation.loadRehydrate': async (payload = {}) => {
      requireCommandUserId(payload);
      const agent = await ensureWindieAgent({
        reason: 'sdk-command:conversation.loadRehydrate',
        conversationRef: optionalCommandConversationRef(payload),
      });
      const snapshot = await agent.loadConversation({
        conversationRef: requireCommandConversationRef(payload),
      });
      return {
        rehydrate: snapshot.rehydrate,
      };
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
      const runtimeRegistry = await ensureWindieAgent({
        reason: 'sdk-command:conversation.appendEvent',
        conversationRef: optionalCommandConversationRef(event) || optionalCommandConversationRef(payload),
      });
      await runtimeRegistry.appendConversationEvent(event);
      return { stored: true };
    },
    'conversation.rewrite': async (payload = {}) => {
      requireCommandUserId(payload);
      const plan = isPlainObject(payload.plan) ? payload.plan : null;
      if (!plan) {
        throw new Error('conversation.rewrite requires a plan payload');
      }
      const runtimeRegistry = await ensureWindieAgent({
        reason: 'sdk-command:conversation.rewrite',
        conversationRef: optionalCommandConversationRef(plan) || optionalCommandConversationRef(payload),
      });
      await runtimeRegistry.rewriteConversation(plan);
      return { rewritten: true };
    },
    'conversation.replaceCompactedReplay': async (payload = {}) => {
      requireCommandUserId(payload);
      const snapshot = isPlainObject(payload.snapshot) ? payload.snapshot : null;
      if (!snapshot) {
        throw new Error('conversation.replaceCompactedReplay requires a snapshot payload');
      }
      const runtimeRegistry = await ensureWindieAgent({
        reason: 'sdk-command:conversation.replaceCompactedReplay',
        conversationRef: optionalCommandConversationRef(snapshot) || optionalCommandConversationRef(payload),
      });
      await runtimeRegistry.replaceCompactedReplay(snapshot);
      return { stored: true };
    },
    'conversation.prepareEditAndResend': async (payload = {}) => {
      requireCommandUserId(payload);
      const conversationRef = requireCommandConversationRef(payload);
      const workspacePath = resolveWorkspacePathForAgent(payload) || null;
      const runtimeRegistry = await ensureWindieAgent({
        reason: 'sdk-command:conversation.prepareEditAndResend',
        conversationRef,
        workspacePath,
      });
      const prepared = await runtimeRegistry.prepareEditAndResend({
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
      const runtimeRegistry = await ensureWindieAgent({
        reason: 'sdk-command:conversation.prepareRetryTurn',
        conversationRef,
        workspacePath,
      });
      const messageId = normalizeOptionalString(payload.messageId || payload.message_id);
      const prepared = await runtimeRegistry.prepareRetryTurn({
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
  appendMainProcessTraceEvent,
  sendAutomatedQuery,
  sendStopQueryToBackend,
  shutdownIpcForTests,
  triggerStopQueryFromMain,
  updateGlobalAgentStopShortcutStatus,
};
