/**
 * Provides the ipc module for the Electron main process.
 */

const {
  ipcMain,
  Menu,
  BrowserWindow,
  screen,
  clipboard,
  nativeImage,
} = require('electron');
const { v4: uuidv4 } = require('uuid');
const {
  configureBackendEndpointRuntime,
  resolveBackendEndpointCandidates,
  resolveBackendEndpoints,
  resolvePreferredArtifactHttpUrl,
} = require('./app/backend_endpoints.cjs');
const {
  configureDebugEnvRuntime,
  isDebugFlagEnabled,
} = require('./app/debug_env.cjs');
const {
  createBackendEndpointState,
} = require('./ipc/ipc_backend_endpoint_state.cjs');
const {
  loadDesktopUiConfigFromDisk,
  loadDesktopUiConfigFromDiskSync,
  redactDesktopUiConfigProviderSecrets,
  saveDesktopUiConfigToDisk,
} = require('./ipc/ipc_desktop_ui_config.cjs');
const {
  registerDesktopUiConfigHandlers,
} = require('./ipc/ipc_desktop_ui_config_handlers.cjs');
const {
  registerExtensionMcpHandlers,
} = require('./ipc/ipc_extension_mcp_handlers.cjs');
const {
  registerClientSessionHandlers,
} = require('./ipc/ipc_client_session_handlers.cjs');
const {
  clearInstallAuthStateFromDisk,
  loadInstallAuthStateFromDisk,
  registerInstallWithBackend,
  saveInstallAuthStateToDisk,
  validateInstallAuthStateWithBackend,
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
  registerRendererDiagnosticsHandlers,
} = require('./ipc/ipc_renderer_diagnostics_handlers.cjs');
const {
  APP_DIAGNOSTICS_PATH,
  MCP_ENABLEMENT_DIAGNOSTICS_PATH,
  PERMISSION_PROBE_DIAGNOSTICS_PATH,
  appendDiagnosticEvent,
  appUserDataRoot,
} = require('./diagnostics/app_diagnostics_store.cjs');
const {
  appendIpcBridgeDiagnostic,
} = require('./diagnostics/app_diagnostics_runtime.cjs');
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
  buildConversationTerminalStatus,
} = require('./ipc/ipc_conversation_status_runtime.cjs');
const {
  resolveWorkspacePathForAgentPayload,
} = require('./ipc/ipc_workspace_path_runtime.cjs');
const {
  processBackendMessageData,
  runBeforeOverlayQueryCapture,
  uploadArtifact,
} = require('./ipc/ipc_runtime_helpers.cjs');
const {
  createElectronMainTraceLogger,
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
  MCP_ENABLED_CONFIG_KEY,
  getEnabledMcpServerSpecsForConfig,
  listMcpServersForConfig,
  refreshMcpServersForConfig,
  updateMcpServerEnablementForConfig,
} = require('./extensions/mcp_control.cjs');
const {
  createChatQueryHandlers,
} = require('./ipc/ipc_chat_query_handlers.cjs');
const {
  handleAgentSdkInvoke,
} = require('./ipc/ipc_agent_sdk_command_handlers.cjs');
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
  createIpcEventReplayState,
} = require('./ipc/ipc_event_replay_state.cjs');
const {
  DESKTOP_RUNTIME_SEND_CHANNELS,
  DESKTOP_RUNTIME_INVOKE_CHANNELS,
  DESKTOP_RUNTIME_ON_CHANNELS,
} = require('./ipc/ipc_desktop_runtime_channels.cjs');
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
  isAgentLoopStopShortcutPhase,
} = require('./shortcuts/agent_stop_shortcut_runtime.cjs');
const {
  buildElectronAgentDefinitionInputs,
} = require('./agent/electron_agent_definition_inputs.cjs');
const {
  createDesktopLocalRuntimeLaunchPlan,
} = require('./sidecar/local_runtime_launch_options.cjs');
const {
  AgentClient,
  buildAgentDefinition,
  isDefaultAgentDefinition,
  TraceRecorder,
  createConversationEvent,
} = require('../../../packages/windie-sdk-js/cjs/index.js');
const {
  normalizeBackendEventToConversationEvent,
} = require('../../../packages/windie-sdk-js/cjs/transport/backendEventNormalizer.js');
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
const DEFAULT_IPC_HOST_COPY = Object.freeze({
  identity: Object.freeze({
    sdkAgentName: 'Desktop Agent',
    mcpClientInfo: Object.freeze({
      name: 'Desktop Runtime',
      version: '0.0.0',
    }),
  }),
  queryEvents: Object.freeze({}),
});
let ipcHostCopy = DEFAULT_IPC_HOST_COPY;
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
let latestDesktopUiConfig = null;
const backendMessageObservers = new Set();
let applyResponseOverlayPhase = null;
let onBeforeOverlayQueryCapture = null;
let setAgentLoopStopShortcutEnabled = null;
let setGlobalAgentStopShortcutAccelerator = null;
let localToolLifecycle = null;
let syncSdkLiveTurnSurfaceIntent = null;
let agentWebSocketImpl = null;
let currentGlobalAgentStopShortcutStatus = null;
let pendingInstallAuthStatePromise = null;
let agentClient = null;
let activeAgent = null;
let pendingAgentStartPromise = null;
let pendingStartupMcpRefreshPromise = null;
let latestCurrentTurnProjection = null;
let latestPendingTurn = null;
let desktopLocalRuntimeLaunchConfig = null;
const currentTurnTraceLogger = createCurrentTurnTraceLogger({ log });
const electronMainTraceLogger = createElectronMainTraceLogger({ log });
const responseOverlayPhaseState = createResponseOverlayPhaseState();
const ipcEventReplayState = createIpcEventReplayState();
const settingsSyncRuntime = createIpcSettingsSyncRuntime({
  getLatestDesktopUiConfig: () => latestDesktopUiConfig,
  setLatestDesktopUiConfig: (config) => {
    latestDesktopUiConfig = config;
  },
  loadCachedDesktopUiConfig: () => loadCachedDesktopUiConfigFromDisk(),
  isConnected: () => isConnected,
  isBackendRuntimeConnected,
  ensureBackendConnection,
  updateSettings: (payload) => updateSettingsThroughAgentSdkRuntime(payload),
  traceSettingsUpdate: (config, source, msgId) => electronMainTraceLogger.traceSettingsUpdate(
    config,
    source,
    msgId,
  ),
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
    let lastError = null;
    const endpointCandidates = backendEndpointState.getCandidates();
    const cachedDiskState = await loadInstallAuthStateFromDisk(log);
    if (cachedDiskState) {
      let sawInvalidCachedToken = false;
      for (let index = 0; index < endpointCandidates.length; index += 1) {
        const candidate = endpointCandidates[index];
        const validation = await validateInstallAuthStateWithBackend(cachedDiskState, {
          backendHttpUrl: candidate.httpUrl,
        });
        if (validation.valid && validation.state) {
          setActiveBackendEndpoint(index);
          const validatedState = applyInstallAuthState(validation.state);
          const persistedIdentityMatches = (
            validation.state.userId === cachedDiskState.userId
            && validation.state.installId === cachedDiskState.installId
          );
          if (!persistedIdentityMatches) {
            await saveInstallAuthStateToDisk(validation.state, log);
          }
          return validatedState;
        }
        if (validation.invalidToken) {
          sawInvalidCachedToken = true;
          log(`Cached install auth was rejected by ${candidate.httpUrl} (${validation.status || 'invalid'}); registering a fresh install.`);
        } else {
          lastError = new Error(
            `Install auth validation failed against ${candidate.httpUrl}: ${validation.error || 'unknown error'}`,
          );
          log(lastError.message);
        }
      }
      if (!sawInvalidCachedToken) {
        const cachedState = applyInstallAuthState(cachedDiskState);
        if (cachedState) {
          return cachedState;
        }
      }
      await clearInstallAuthStateFromDisk(log);
    }

    for (let index = 0; index < endpointCandidates.length; index += 1) {
      const candidate = endpointCandidates[index];
      try {
        const registeredState = await registerInstallWithBackend({
          backendHttpUrl: candidate.httpUrl,
          operatingSystem: resolveDesktopHostOperatingSystem(process.platform),
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

function resolveDesktopHostOperatingSystem(platformName = process.platform) {
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
  if (isDebugFlagEnabled('ipcStdout')) {
    console.log(`[Main][IPC] ${message}`);
  }
}

function logMainRuntime(message) {
  console.log(message);
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

async function loadCachedDesktopUiConfigFromDisk() {
  return loadDesktopUiConfigFromDisk(log);
}

function preserveMainOwnedDesktopUiConfigFields(config, options = {}) {
  const {
    preserveMcpEnablement = true,
  } = options;
  if (!isValidConfigPayload(config)) {
    return config;
  }
  if (!preserveMcpEnablement) {
    return config;
  }
  const diskConfig = Array.isArray(latestDesktopUiConfig?.[MCP_ENABLED_CONFIG_KEY])
    ? null
    : loadDesktopUiConfigFromDiskSync(log);
  const enabledMcpServers = Array.isArray(latestDesktopUiConfig?.[MCP_ENABLED_CONFIG_KEY])
    ? latestDesktopUiConfig[MCP_ENABLED_CONFIG_KEY]
    : diskConfig?.[MCP_ENABLED_CONFIG_KEY];
  if (!Array.isArray(enabledMcpServers)) {
    return config;
  }
  return {
    ...config,
    [MCP_ENABLED_CONFIG_KEY]: enabledMcpServers.filter((serverId) => typeof serverId === 'string'),
  };
}

function getDesktopUiConfigForMcpRegistry() {
  return preserveMainOwnedDesktopUiConfigFields(latestDesktopUiConfig || {});
}

function countMcpEnabledServersInConfig(config) {
  return Array.isArray(config?.[MCP_ENABLED_CONFIG_KEY])
    ? config[MCP_ENABLED_CONFIG_KEY].filter((serverId) => typeof serverId === 'string').length
    : 0;
}

function resolveMcpEnablementPreserveSource(config, options = {}) {
  if (!isValidConfigPayload(config) || options.preserveMcpEnablement === false) {
    return 'none';
  }
  if (Array.isArray(latestDesktopUiConfig?.[MCP_ENABLED_CONFIG_KEY])) {
    return 'latest';
  }
  const diskConfig = loadDesktopUiConfigFromDiskSync(log);
  if (Array.isArray(diskConfig?.[MCP_ENABLED_CONFIG_KEY])) {
    return 'disk';
  }
  return 'none';
}

function recordMcpEnablementDiagnostic(input = {}) {
  try {
    return appendDiagnosticEvent({
      path: MCP_ENABLEMENT_DIAGNOSTICS_PATH,
      traceId: input.traceId || `mcp-enable-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      runtime: 'electron-main',
      ...input,
    });
  } catch {
    return { stored: false };
  }
}

async function persistDesktopUiConfigToDisk(config, options = {}) {
  const preserveSource = resolveMcpEnablementPreserveSource(config, options);
  const payloadHasEnabledKey = Array.isArray(config?.[MCP_ENABLED_CONFIG_KEY]);
  const persistableConfig = redactDesktopUiConfigProviderSecrets(
    preserveMainOwnedDesktopUiConfigFields(config, options),
  );
  const result = await saveDesktopUiConfigToDisk(persistableConfig, log);
  recordMcpEnablementDiagnostic({
    stage: result?.success === false ? 'config_save_failed' : 'config_saved',
    status: result?.success === false ? 'failed' : 'succeeded',
    data: {
      phase: 'config_save',
      preserveMcpEnablement: options.preserveMcpEnablement !== false,
      preserveSource,
      payloadHasEnabledKey,
      latestHasEnabledKey: Array.isArray(latestDesktopUiConfig?.[MCP_ENABLED_CONFIG_KEY]),
      persistedEnabledServerCount: countMcpEnabledServersInConfig(persistableConfig),
      payloadEnabledServerCount: countMcpEnabledServersInConfig(config),
    },
    error: result?.success === false ? result.error : null,
  });
  if (
    result?.success
    && persistableConfig
    && typeof persistableConfig === 'object'
    && !Array.isArray(persistableConfig)
  ) {
    latestDesktopUiConfig = { ...persistableConfig };
  }
  return result;
}

function updateGlobalAgentStopShortcutStatus(status) {
  currentGlobalAgentStopShortcutStatus = normalizeGlobalAgentStopShortcutStatus(status);

  if (isValidConfigPayload(latestDesktopUiConfig)) {
    const nextConfig = applyShortcutStatusFallbackToConfig(latestDesktopUiConfig);
    if (nextConfig !== latestDesktopUiConfig) {
      void persistDesktopUiConfigToDisk(nextConfig);
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
  latestPendingTurn = null;
  currentTurnTraceLogger.reset();
  electronMainTraceLogger.reset();
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
  latestDesktopUiConfig = null;
  currentGlobalAgentStopShortcutStatus = null;
  pendingInstallAuthStatePromise = null;
  pendingStartupMcpRefreshPromise = null;
  latestCurrentTurnProjection = null;
  latestPendingTurn = null;
  syncSdkLiveTurnSurfaceIntent = null;
  currentTurnTraceLogger.reset();
  electronMainTraceLogger.reset();
}

function normalizeOptionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function resolveWorkspacePathForAgent(payload = {}) {
  return resolveWorkspacePathForAgentPayload(payload, latestDesktopUiConfig);
}

function handleAgentConnection(event = {}) {
  if (event.type === 'open') {
    const handshakeUserId = event.handshake && typeof event.handshake.user_id === 'string'
      ? event.handshake.user_id
      : null;
    if (handshakeUserId) {
      currentServerUserId = handshakeUserId;
    }
    isConnected = true;
    isFirstQuery = true;
    electronMainTraceLogger.traceBackendConnection(event);
    resetSettingsSyncState();
    setResponseOverlayPhase('idle', 'ws-open');
    ipcEventReplayState.clear();
    logMainRuntime(`[Main][Backend] connected user=${handshakeUserId || currentUserId || 'unknown'}`);
    log('Successfully connected to agent backend through Agent SDK runtime.');
    log(`Handshake sent with authenticated user_id: ${handshakeUserId || currentUserId || 'unknown'}`);
    broadcastConnectionStatus(true);
    return;
  }
  if (event.type === 'close') {
    electronMainTraceLogger.traceBackendConnection(event);
    logMainRuntime(`[Main][Backend] closed code=${event.code ?? 'unknown'} reason=${event.reason || 'unknown'}`);
    handleAgentBackendClose(event);
    return;
  }
  if (event.type === 'error') {
    electronMainTraceLogger.traceBackendConnection(event);
    logMainRuntime(`[Main][Backend] error message=${JSON.stringify(event.error?.message || String(event.error || 'unknown'))}`);
    log(`WebSocket error: ${event.error?.message || event.error}`);
    return;
  }
  if (event.type === 'handshake-error') {
    electronMainTraceLogger.traceBackendConnection(event);
    logMainRuntime(`[Main][Backend] handshake_error message=${JSON.stringify(event.error?.message || String(event.error || 'unknown'))}`);
    log(`Error sending handshake: ${event.error}`);
    return;
  }
  if (event.type === 'message-error') {
    electronMainTraceLogger.traceBackendConnection(event);
    logMainRuntime(`[Main][Backend] message_error message=${JSON.stringify(event.error?.message || String(event.error || 'unknown'))}`);
    log(`Error parsing message from backend: ${event.error}`);
  }
}

function handleAgentBackendFallback(endpointPayload = {}) {
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
  logMainRuntime(`[Main][Backend] fallback ws=${backendEndpointState.getEndpoint().wsUrl}`);
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

function buildDesktopLocalRuntimeLaunchOptionsForAgent() {
  const plan = createDesktopLocalRuntimeLaunchPlan({
    ...(desktopLocalRuntimeLaunchConfig || {}),
    backendEndpoints: {
      httpUrl: backendEndpointState.getHttpUrl(),
    },
    userDataRoot: appUserDataRoot(),
    ...(agentWebSocketImpl ? { WebSocketImpl: agentWebSocketImpl } : {}),
  });
  if (plan.ok !== true) {
    throw new Error(plan.error || 'Desktop local runtime launch is unavailable.');
  }
  return plan.options;
}

function buildDesktopLocalRuntimeOptions() {
  return process.env.NODE_ENV === 'test'
    ? { autoStartLocalRuntime: false }
    : { autoLocalRuntime: buildDesktopLocalRuntimeLaunchOptionsForAgent() };
}

function configureIpcHostRuntime(config = {}) {
  configureBackendEndpointRuntime(config.hostedBackend);
  backendEndpointState.refresh();
  configureDebugEnvRuntime(config.debug);
}

function configureIpcHostCopyRuntime(copy = {}) {
  ipcHostCopy = {
    identity: copy.identity && typeof copy.identity === 'object'
      ? copy.identity
      : DEFAULT_IPC_HOST_COPY.identity,
    queryEvents: copy.queryEvents && typeof copy.queryEvents === 'object'
      ? copy.queryEvents
      : DEFAULT_IPC_HOST_COPY.queryEvents,
  };
}

function createElectronAgentClient() {
  logMainRuntime(`[Main][SDK] creating_client backend=${backendEndpointState.getHttpUrl()}`);
  return new AgentClient({
    backendUrl: backendEndpointState.getHttpUrl(),
    httpBaseUrl: backendEndpointState.getHttpUrl(),
    wsUrl: backendEndpointState.getWsUrl(),
    wsOrigin: backendEndpointState.getHttpUrl(),
    backendEndpoints: buildManagedBackendEndpoints(),
    backendSession: 'managed',
    reconnectIntervalMs: BACKEND_RECONNECT_INTERVAL_MS,
    connectTimeoutMs: BACKEND_CONNECT_TIMEOUT_MS,
    idleDisconnectTimeoutMs: BACKEND_IDLE_DISCONNECT_TIMEOUT_MS,
    ...(agentWebSocketImpl ? { WebSocketImpl: agentWebSocketImpl } : {}),
    ...buildDesktopLocalRuntimeOptions(),
    onBackendOpen: payload => handleAgentConnection({ type: 'open', ...payload }),
    onBackendClose: payload => handleAgentConnection({ type: 'close', ...payload }),
    onBackendError: payload => handleAgentConnection({ type: 'error', ...payload }),
    onBackendHandshakeError: error => handleAgentConnection({ type: 'handshake-error', error }),
    onBackendMessageError: error => handleAgentConnection({ type: 'message-error', error }),
    onBackendSend: type => {
      activeAgent?.noteBackendTraffic?.(`send:${type}`);
    },
    onBackendFallback: endpoint => handleAgentBackendFallback(endpoint),
  });
}

function getAgentClient() {
  if (!agentClient) {
    logMainRuntime('[Main][SDK] client_initialized');
    agentClient = createElectronAgentClient();
  }
  return agentClient;
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
    broadcastToRenderers(DESKTOP_RUNTIME_ON_CHANNELS.STATUS, status);
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
      broadcastToRenderers(DESKTOP_RUNTIME_ON_CHANNELS.CONVERSATION_EVENT, event);
      if (event && event.type === 'memory_store_changed') {
        broadcastToRenderers(DESKTOP_RUNTIME_ON_CHANNELS.MEMORY_STORE_CHANGED, event);
      }
      broadcastToRenderers(DESKTOP_RUNTIME_ON_CHANNELS.ROWS, snapshot.displayRows);
      latestCurrentTurnProjection = snapshot.currentTurn || null;
      if (pendingTurnMatchesCurrentTurn(latestPendingTurn, snapshot.currentTurn)) {
        clearLatestPendingTurn({
          conversationRef: latestPendingTurn.conversationRef,
          turnRef: latestPendingTurn.turnRef,
          broadcast: true,
        });
      }
      logLiveSurfaceTrace('sdk.current_turn.received', {
        ...summarizeCurrentTurn(snapshot.currentTurn),
        source: 'conversation-runtime',
        displayRowCount: Array.isArray(snapshot.displayRows) ? snapshot.displayRows.length : 0,
      });
      if (isDebugFlagEnabled('streamEvents')) {
        currentTurnTraceLogger.trace(snapshot.currentTurn);
      }
      if (syncSdkLiveTurnSurfaceIntent) {
        try {
          syncSdkLiveTurnSurfaceIntent(snapshot.currentTurn || null);
        } catch (error) {
          log('Failed to sync SDK live-turn surface intent:', error?.message || error);
        }
      }
      broadcastToRenderers(DESKTOP_RUNTIME_ON_CHANNELS.CURRENT_TURN, snapshot.currentTurn);
      const terminalStatus = buildConversationTerminalStatus(event, workspacePath);
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
        : null;
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
    localRuntime: agent.localRuntime || null,
    registerMcps: (mcps, options) => agent.registerMcps(mcps, options),
    refreshMcpServers: async ({ config = null } = {}) => (
      refreshMcpServersForConfig({
        config,
        localRuntime: agent.localRuntime || null,
        clientInfo: ipcHostCopy.identity.mcpClientInfo,
      })
    ),
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

async function startAgent({ reason = 'request', workspacePath = null } = {}) {
  await ensureInstallAuthState();
  const resolvedWorkspacePath = workspacePath || resolveWorkspacePathForAgent() || undefined;
  const client = getAgentClient();
  const agent = await client.wakeUp({
    installAuth: buildDesktopInstallAuth(),
    name: ipcHostCopy.identity.sdkAgentName,
    workspacePath: resolvedWorkspacePath,
    builtins: process.env.NODE_ENV === 'test' ? [] : 'default',
    mcps: process.env.NODE_ENV === 'test'
      ? []
      : getEnabledMcpServerSpecsForConfig({ config: getDesktopUiConfigForMcpRegistry() }),
    ...(process.env.NODE_ENV === 'test' ? { memory: false, persistence: false } : {}),
    localToolLifecycle,
  });
  const adapter = createDirectWakeUpAgentAdapter({
    agent,
    workspacePath: resolvedWorkspacePath || null,
  });
  appendIpcBridgeDiagnostic({
    action: 'runtime.wakeup',
    phase: 'sdk',
    status: 'succeeded',
    statusReason: reason,
    hasWorkspacePath: Boolean(resolvedWorkspacePath),
  });
  log(`Agent SDK wakeUp runtime started for ${reason}.`);
  return adapter;
}

async function ensureAgent({ reason = 'request', workspacePath = null } = {}) {
  if (activeAgent) {
    return activeAgent;
  }
  if (!pendingAgentStartPromise) {
    pendingAgentStartPromise = startAgent({
      reason,
      workspacePath,
    })
      .then((agent) => {
        activeAgent = agent;
        return agent;
      })
      .finally(() => {
        pendingAgentStartPromise = null;
      });
  }
  return pendingAgentStartPromise;
}

function syncBackendIdleDisconnectTimer(reason = 'idle-sync') {
  activeAgent?.syncBackendIdleTimer(reason);
}

function noteBackendTraffic(reason = 'traffic') {
  activeAgent?.noteBackendTraffic(reason);
}

function getKnownAgentLocalRuntime() {
  return agentClient?.getKnownLocalRuntime?.() || activeAgent?.localRuntime || null;
}

async function ensureAgentLocalRuntime({ reason = 'local-runtime' } = {}) {
  logMainRuntime(`[Main][SDK] local_runtime_ensure_start reason=${reason}`);
  try {
    const runtime = await getAgentClient().localRuntime({ reason });
    logMainRuntime(`[Main][SDK] local_runtime_ready reason=${reason}`);
    return runtime;
  } catch (error) {
    logMainRuntime(`[Main][SDK] local_runtime_failed reason=${reason} message=${JSON.stringify(error?.message || String(error))}`);
    throw error;
  }
}

function isBackendRuntimeConnected() {
  return isConnected && Boolean(activeAgent?.isConnected());
}

async function ensureBackendConnection(reason = 'request', timeoutMs = BACKEND_CONNECT_TIMEOUT_MS) {
  const agent = await ensureAgent({
    reason,
    conversationRef: currentConversationRef,
  });
  return agent.ensureConnected({
    reason,
    timeoutMs,
    conversationRef: currentConversationRef,
  });
}

async function refreshMcpServersForLatestConfig(reason = 'mcp-refresh') {
  const config = getDesktopUiConfigForMcpRegistry();
  if (process.env.NODE_ENV !== 'test') {
    const agent = await ensureAgent({ reason });
    if (typeof agent.refreshMcpServers === 'function') {
      return agent.refreshMcpServers({ config });
    }
  }
  return refreshMcpServersForConfig({
    config,
    clientInfo: ipcHostCopy.identity.mcpClientInfo,
  });
}

function refreshEnabledMcpServersAfterStartup(config) {
  if (process.env.NODE_ENV === 'test' || countMcpEnabledServersInConfig(config) === 0) {
    return;
  }
  if (pendingStartupMcpRefreshPromise) {
    return;
  }
  pendingStartupMcpRefreshPromise = refreshMcpServersForLatestConfig('mcp-startup')
    .catch((error) => {
      log(`Failed to refresh enabled MCP servers at startup: ${error?.message || error}`);
    })
    .finally(() => {
      pendingStartupMcpRefreshPromise = null;
    });
}

function buildIpcStatusPayload(connected) {
  return {
    isConnected: connected,
    userId: currentUserId,
    runtimeWsUrl: backendEndpointState.getWsUrl(),
    runtimeHttpUrl: backendEndpointState.getHttpUrl(),
    globalAgentStopShortcutStatus: currentGlobalAgentStopShortcutStatus,
  };
}

function buildConversationEventFromBackendEvent(event, options = {}) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return null;
  }
  return normalizeBackendEventToConversationEvent(event, {
    fallbackConversationRef: options.fallbackConversationRef,
    fallbackRevisionId: options.fallbackRevisionId,
    fallbackTurnRef: options.fallbackTurnRef,
  });
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
    getLatestPendingTurn: () => latestPendingTurn,
    getReplayEvents: () => ipcEventReplayState.snapshot(),
    buildConversationEvent: (event) => buildConversationEventFromBackendEvent(event, {
      fallbackConversationRef: currentConversationRef,
    }),
  });
}

function normalizePendingTurnPayload(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
  const pendingTurn = source.pendingTurn && typeof source.pendingTurn === 'object'
    ? source.pendingTurn
    : source;
  const conversationRef = typeof pendingTurn.conversationRef === 'string'
    && pendingTurn.conversationRef.trim()
    ? pendingTurn.conversationRef.trim()
    : null;
  const turnRef = typeof pendingTurn.turnRef === 'string' && pendingTurn.turnRef.trim()
    ? pendingTurn.turnRef.trim()
    : null;
  const userMessageId = typeof pendingTurn.userMessageId === 'string'
    && pendingTurn.userMessageId.trim()
    ? pendingTurn.userMessageId.trim()
    : null;
  const text = typeof pendingTurn.text === 'string' ? pendingTurn.text : null;
  const timestamp = typeof pendingTurn.timestamp === 'string' && pendingTurn.timestamp.trim()
    ? pendingTurn.timestamp
    : null;
  if (!conversationRef || !turnRef || !userMessageId || text === null || !timestamp) {
    return null;
  }
  const attachmentFilenames = Array.isArray(pendingTurn.attachmentFilenames)
    ? pendingTurn.attachmentFilenames.filter((entry) => (
      typeof entry === 'string' && entry.trim()
    ))
    : null;
  return {
    conversationRef,
    turnRef,
    userMessageId,
    text,
    timestamp,
    attachmentFilenames: attachmentFilenames && attachmentFilenames.length > 0
      ? attachmentFilenames
      : null,
  };
}

function pendingTurnMatchesCurrentTurn(pendingTurn, currentTurn) {
  return Boolean(
    pendingTurn
      && currentTurn
      && pendingTurn.conversationRef === currentTurn.conversationRef
      && pendingTurn.turnRef === currentTurn.turnRef,
  );
}

function pendingTurnMatchesTarget(pendingTurn, input = {}) {
  if (!pendingTurn) {
    return false;
  }
  const conversationRef = normalizeOptionalString(input.conversationRef);
  const turnRef = normalizeOptionalString(input.turnRef);
  return (
    (!conversationRef || pendingTurn.conversationRef === conversationRef)
    && (!turnRef || pendingTurn.turnRef === turnRef)
  );
}

function clearLatestPendingTurn(input = {}) {
  const pendingTurn = latestPendingTurn;
  if (!pendingTurn || !pendingTurnMatchesTarget(pendingTurn, input)) {
    return false;
  }
  latestPendingTurn = null;
  if (input.broadcast === true) {
    broadcastToRenderers(DESKTOP_RUNTIME_ON_CHANNELS.PENDING_TURN, {
      type: 'clear',
      conversationRef: normalizeOptionalString(input.conversationRef)
        || pendingTurn.conversationRef,
      turnRef: normalizeOptionalString(input.turnRef)
        || pendingTurn.turnRef,
    });
  }
  return true;
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
    traceBackendEvent: (data) => electronMainTraceLogger.traceBackendEvent(data),
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
  activeAgent?.markInferenceContextsStale?.();
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
      copy: ipcHostCopy.queryEvents,
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
    log('Disconnected from agent backend. Attempting to reconnect...');
  } else {
    log(`Disconnected from agent backend (${closeReason || 'idle'}).`);
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
  agentWebSocketImpl = null;
  pendingInstallAuthStatePromise = null;
  isConnected = false;
  pendingAgentStartPromise = null;
  pendingStartupMcpRefreshPromise = null;
  latestPendingTurn = null;
  void agentClient?.shutdownLocalRuntime?.();
  agentClient = null;
  activeAgent?.close();
  activeAgent = null;
  desktopLocalRuntimeLaunchConfig = null;
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
  agentWebSocketImpl = typeof options.WebSocketImpl === 'function'
    ? options.WebSocketImpl
    : null;
  desktopLocalRuntimeLaunchConfig = {
    isPackaged: options.isPackaged === true,
    permissionStatePath: options.permissionStatePath,
    authStatePath: options.authStatePath,
    copy: options.bundledRuntimeCopy,
    daemonEntrypoint: options.localRuntimeDaemonEntrypoint,
    localRuntimeEnv: options.localRuntimeEnv,
    runtimePaths: options.runtimePaths,
  };
  const getWindows = typeof options.getWindows === 'function'
    ? options.getWindows
    : () => ({ mainWindow: win, chatWindow: null });
  rendererWindows = new Set();
  trackRendererWindow(win);
  initializeIpcStartupState({
    loadInstallAuthStateFromDisk,
    applyInstallAuthState,
    loadCachedDesktopUiConfigFromDisk,
    isValidConfigPayload,
    applyShortcutStatusFallbackToConfig,
    setLatestDesktopUiConfig: (config) => {
      latestDesktopUiConfig = config;
    },
    setGlobalAgentStopShortcutAccelerator,
    setAgentLoopStopShortcutEnabled,
    getResponseOverlayPhase: () => responseOverlayPhaseState.getPhase(),
    isAgentLoopStopShortcutPhase,
    onDesktopUiConfigLoaded: refreshEnabledMcpServersAfterStartup,
    log,
  });

  registerDesktopUiConfigHandlers({
    ipcMain,
    loadCachedDesktopUiConfigFromDisk,
    persistDesktopUiConfigToDisk,
    isValidConfigPayload,
    applyShortcutStatusFallbackToConfig,
    getLatestDesktopUiConfig: () => latestDesktopUiConfig,
    setLatestDesktopUiConfig: (config) => {
      latestDesktopUiConfig = config;
    },
    setGlobalAgentStopShortcutAccelerator,
  });

  registerExtensionMcpHandlers({
    ipcMain,
    loadPublicExtensionRegistry,
    listMcpServersForConfig,
    updateMcpServerEnablementForConfig,
    getEnabledMcpServerSpecsForConfig,
    refreshMcpServersForLatestConfig,
    persistDesktopUiConfigToDisk,
    getDesktopUiConfigForMcpRegistry,
    ensureAgent,
    mcpClientInfo: ipcHostCopy.identity.mcpClientInfo,
  });

  registerClientSessionHandlers({
    ipcMain,
    getClientSessionState: () => ({
      currentUserId,
      currentConversationRef,
      currentServerUserId,
      currentSessionId,
      isConnected,
      globalAgentStopShortcutStatus: currentGlobalAgentStopShortcutStatus,
    }),
    getRuntimeEndpointSnapshot: () => ({
      runtimeWsUrl: backendEndpointState.getWsUrl(),
      runtimeHttpUrl: backendEndpointState.getHttpUrl(),
    }),
    setTranscriptSessionState: ({
      currentConversationRef: nextConversationRef,
      currentUserId: nextUserId,
    }) => {
      currentConversationRef = nextConversationRef;
      currentUserId = nextUserId;
    },
    broadcastToRenderers,
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

  registerRendererDiagnosticsHandlers({
    ipcMain,
    handleRendererLog,
    handleRendererLiveSurfaceTrace,
  });

  ipcMain.on(DESKTOP_RUNTIME_SEND_CHANNELS.PENDING_TURN, (_event, payload = {}) => {
    const source = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload
      : {};
    if (source.type === 'clear') {
      if (
        Object.prototype.hasOwnProperty.call(source, 'conversation_ref')
        || Object.prototype.hasOwnProperty.call(source, 'turn_ref')
      ) {
        return;
      }
      const conversationRef = typeof source.conversationRef === 'string' && source.conversationRef.trim()
        ? source.conversationRef.trim()
        : null;
      const turnRef = typeof source.turnRef === 'string' && source.turnRef.trim()
        ? source.turnRef.trim()
        : null;
      clearLatestPendingTurn({ conversationRef, turnRef });
      broadcastToRenderers(DESKTOP_RUNTIME_ON_CHANNELS.PENDING_TURN, {
        type: 'clear',
        conversationRef,
        turnRef,
      });
      return;
    }
    const pendingTurn = normalizePendingTurnPayload(source);
    if (!pendingTurn) {
      return;
    }
    latestPendingTurn = pendingTurn;
    broadcastToRenderers(DESKTOP_RUNTIME_ON_CHANNELS.PENDING_TURN, {
      type: 'pending',
      pendingTurn,
    });
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
    sendQueryThroughAgentSdkRuntime,
    stopQueryThroughAgentSdkRuntime,
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
      buildQuerySendFailure: (input) => buildQuerySendFailure({
        ...input,
        copy: ipcHostCopy.queryEvents,
      }),
      traceRendererQuery: (input) => electronMainTraceLogger.traceRendererQuery(input),
    },
  });

  ipcMain.handle(DESKTOP_RUNTIME_INVOKE_CHANNELS.INVOKE, async (event, payload = {}) => (
    handleAgentSdkInvoke(event, payload, {
      handleRendererChatQuery,
      handleRendererStopQuery,
      deps: {
        getState: () => ({
          currentConversationRef,
          currentSessionId,
          currentUserId,
          isConnected,
          agent: activeAgent,
        }),
        ensureAgent,
        resolveWorkspacePathForAgent,
        sendSettingsUpdate,
        requestModelListThroughAgentSdkRuntime,
        isBackendRuntimeConnected,
        ensureBackendConnection,
        ensureInitialSettingsSync,
        getPendingSettingsSyncPromise: () => settingsSyncRuntime.getPendingSettingsSyncPromise(),
        sendWakewordDetectedThroughAgentSdkRuntime,
        appendAppDiagnostic,
      },
    })
  ));

}

async function sendQueryThroughAgentSdkRuntime({ payload = {}, messageId = null } = {}) {
  try {
    const sourcePayload = isPlainObject(payload) ? payload : {};
    const resources = Array.isArray(sourcePayload.resources) ? sourcePayload.resources : undefined;
    const metadata = isPlainObject(sourcePayload.metadata) ? sourcePayload.metadata : undefined;
    const backendPayload = { ...sourcePayload };
    delete backendPayload.resources;
    delete backendPayload.metadata;
    const agent = await ensureAgent({
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
    log(`Failed to send query through Agent SDK runtime: ${error?.message || error}`);
    return null;
  }
}

async function stopQueryThroughAgentSdkRuntime(payload = {}) {
  if (!activeAgent) {
    return false;
  }
  const stopTurnRef = payload && typeof payload.turn_ref === 'string'
    ? payload.turn_ref
    : null;
  const stopConversationRef = resolveConversationRefFromPayload(payload);
  clearLatestPendingTurn({
    conversationRef: stopConversationRef,
    turnRef: stopTurnRef,
    broadcast: true,
  });
  await activeAgent.stop({
    conversation_ref: stopConversationRef,
    turn_ref: stopTurnRef,
  });
  return true;
}

async function updateSettingsThroughAgentSdkRuntime(payload = {}) {
  const agent = await ensureAgent({ reason: 'update-settings' });
  return agent.updateSettings(payload);
}

async function requestModelListThroughAgentSdkRuntime() {
  const agent = await ensureAgent({ reason: 'list-models' });
  return agent.requestModelList();
}

async function sendWakewordDetectedThroughAgentSdkRuntime(payload = {}) {
  const agent = await ensureAgent({ reason: 'wakeword-detected' });
  return agent.wakewordDetected(payload);
}

async function appendMainProcessTraceEvent(input = {}) {
  const path = normalizeOptionalString(input.path);
  const conversationRef = normalizeOptionalString(input.conversationRef);
  const turnRef = normalizeOptionalString(input.turnRef);
  if (path === PERMISSION_PROBE_DIAGNOSTICS_PATH && (!conversationRef || !turnRef)) {
    return appendAppDiagnostic({
      path,
      stage: normalizeOptionalString(input.stage) || 'unknown',
      status: normalizeOptionalString(input.status) || 'succeeded',
      runtime: normalizeOptionalString(input.runtime) || 'electron-main',
      requestId: normalizeOptionalString(input.requestId),
      durationMs: normalizePositiveInteger(input.durationMs),
      data: isPlainObject(input.data) ? input.data : {},
      error: input.error,
    });
  }
  if (!conversationRef) {
    return { stored: false, reason: 'missing_conversation_ref' };
  }
  if (!turnRef) {
    return { stored: false, reason: 'missing_turn_ref' };
  }
  const agent = await ensureAgent({
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
    path,
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

const STOPPABLE_CURRENT_TURN_PHASES = new Set([
  'awaiting',
  'streaming',
  'tool_call',
  'tool_output',
]);

function isStoppableCurrentTurnProjection(currentTurnProjection) {
  if (!currentTurnProjection || typeof currentTurnProjection !== 'object') {
    return false;
  }
  const phase = normalizeOptionalString(currentTurnProjection.phase);
  return (
    STOPPABLE_CURRENT_TURN_PHASES.has(phase)
    || currentTurnProjection.presentation?.isBusy === true
  );
}

function resolveMainStopTarget() {
  if (isStoppableCurrentTurnProjection(latestCurrentTurnProjection)) {
    const conversationRef = normalizeOptionalString(latestCurrentTurnProjection.conversationRef)
      || currentConversationRef;
    return {
      source: 'sdk-current-turn',
      conversationRef,
      turnRef: normalizeOptionalString(latestCurrentTurnProjection.turnRef),
      canStop: Boolean(conversationRef),
    };
  }
  if (latestPendingTurn) {
    return {
      source: 'pending-turn',
      conversationRef: latestPendingTurn.conversationRef,
      turnRef: latestPendingTurn.turnRef,
      canStop: true,
    };
  }
  return {
    source: 'idle',
    conversationRef: currentConversationRef,
    turnRef: null,
    canStop: Boolean(currentConversationRef),
  };
}

async function triggerStopQueryFromMain() {
  const stopTarget = resolveMainStopTarget();
  if (!stopTarget.canStop) {
    return false;
  }
  const stopped = await stopQueryThroughAgentSdkRuntime({
    conversation_ref: stopTarget.conversationRef,
    turn_ref: stopTarget.turnRef,
  });
  if (!stopped) {
    return false;
  }
  setResponseOverlayPhase('complete', 'stop-query');
  return true;
}

function registerRendererWindow(win) {
  trackRendererWindow(win);
}

function getLatestDesktopUiConfig() {
  if (!isValidConfigPayload(latestDesktopUiConfig)) {
    return null;
  }
  return { ...latestDesktopUiConfig };
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

function appendAppDiagnostic(input = {}) {
  try {
    return appendDiagnosticEvent(input);
  } catch (error) {
    log(`[AppDiagnostics] failed to persist ${input.path || APP_DIAGNOSTICS_PATH}: ${error?.message || error}`);
    return { stored: false, reason: error?.message || String(error) };
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
  const customInstructions = typeof latestDesktopUiConfig?.agent_custom_instructions === 'string'
    ? latestDesktopUiConfig.agent_custom_instructions.trim()
    : '';
  const workspacePath = typeof payload.workspace_path === 'string'
    ? payload.workspace_path.trim()
    : '';
  const agentsMd = workspacePath
    ? resolveWorkspaceRepoInstructionPromptLayers(workspacePath)
    : [];
  const generatedAgentDefinition = buildAgentDefinition(buildElectronAgentDefinitionInputs({
    includeToolManifest: false,
    customInstructions,
    promptLayers: loadExtensionSkillPromptLayers(),
    agentsMd,
    workspacePath,
    operatingSystem: resolveDesktopHostOperatingSystem(process.platform),
  }));
  const suppliedAgentDefinition = isPlainObject(payload.agent_definition)
    ? payload.agent_definition
    : null;
  if (isDefaultAgentDefinition(generatedAgentDefinition) && !suppliedAgentDefinition) {
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
  sendQueryThroughAgentSdkRuntime,
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
  configureIpcHostRuntime,
  getBackendConnectionState,
  getKnownAgentLocalRuntime,
  configureIpcHostCopyRuntime,
  ensureAgentLocalRuntime,
  getLatestDesktopUiConfig,
  initializeIpc,
  registerBackendMessageObserver,
  registerRendererWindow,
  appendMainProcessTraceEvent,
  appendAppDiagnostic,
  sendAutomatedQuery,
  stopQueryThroughAgentSdkRuntime,
  shutdownIpcForTests,
  triggerStopQueryFromMain,
  updateGlobalAgentStopShortcutStatus,
};
