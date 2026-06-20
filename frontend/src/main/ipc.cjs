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
  createDesktopUiConfigPersistenceRuntime,
} = require('./ipc/ipc_desktop_ui_config_persistence_runtime.cjs');
const {
  createGlobalStopShortcutConfigRuntime,
} = require('./ipc/ipc_global_stop_shortcut_config_runtime.cjs');
const {
  createMainProcessTraceRuntime,
} = require('./ipc/ipc_main_process_trace_runtime.cjs');
const {
  createMcpRefreshRuntime,
} = require('./ipc/ipc_mcp_refresh_runtime.cjs');
const {
  handleAgentBackendFallbackEvent,
  handleAgentConnectionEvent,
} = require('./ipc/ipc_agent_connection_events.cjs');
const {
  handleAgentBackendCloseEvent,
} = require('./ipc/ipc_agent_backend_close_runtime.cjs');
const {
  createElectronAgentClient: createElectronAgentClientRuntime,
} = require('./ipc/ipc_electron_agent_client_factory.cjs');
const {
  startAgentRuntime,
} = require('./ipc/ipc_agent_wakeup_runtime.cjs');
const {
  createAgentRuntimeLifecycle,
} = require('./ipc/ipc_agent_runtime_lifecycle.cjs');
const {
  createAgentSdkRuntimeCommands,
} = require('./ipc/ipc_agent_sdk_runtime_commands.cjs');
const {
  createBackendMessageObserverRegistry,
} = require('./ipc/ipc_backend_message_observers.cjs');
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
  createInstallAuthRuntime,
} = require('./ipc/ipc_install_auth_runtime.cjs');
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
  clearPendingTurnState,
  pendingTurnMatchesCurrentTurn,
  registerPendingTurnHandlers,
} = require('./ipc/ipc_pending_turn_handlers.cjs');
const {
  resolveMainStopTarget: resolveMainStopTargetRuntime,
  triggerMainStopTarget,
} = require('./ipc/ipc_stop_target_runtime.cjs');
const {
  createDirectWakeUpAgentAdapter,
} = require('./ipc/ipc_direct_wake_up_agent_adapter.cjs');
const {
  attachAgentDefinitionContext: attachAgentDefinitionContextRuntime,
} = require('./ipc/ipc_agent_definition_context.cjs');
const {
  APP_DIAGNOSTICS_PATH,
  MCP_ENABLEMENT_DIAGNOSTICS_PATH,
  PERMISSION_PROBE_DIAGNOSTICS_PATH,
  appendDiagnosticEvent,
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
  loadPublicExtensionRegistry,
} = require('./extensions/extension_manifest.cjs');
const {
  getEnabledMcpServerSpecsForConfig,
  listMcpServersForConfig,
  refreshMcpServersForConfig,
  updateMcpServerEnablementForConfig,
} = require('./extensions/mcp_control.cjs');
const {
  createChatQueryHandlers,
} = require('./ipc/ipc_chat_query_handlers.cjs');
const {
  registerAgentSdkInvokeHandler,
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
  DESKTOP_RUNTIME_INVOKE_CHANNELS,
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
let applyResponseOverlayPhase = null;
let onBeforeOverlayQueryCapture = null;
let setAgentLoopStopShortcutEnabled = null;
let setGlobalAgentStopShortcutAccelerator = null;
let localToolLifecycle = null;
let syncSdkLiveTurnSurfaceIntent = null;
let agentWebSocketImpl = null;
let agentClient = null;
let latestCurrentTurnProjection = null;
let latestPendingTurn = null;
let desktopLocalRuntimeLaunchConfig = null;
const currentTurnTraceLogger = createCurrentTurnTraceLogger({ log });
const electronMainTraceLogger = createElectronMainTraceLogger({ log });
const responseOverlayPhaseState = createResponseOverlayPhaseState();
const ipcEventReplayState = createIpcEventReplayState();
const backendMessageObserverRegistry = createBackendMessageObserverRegistry({
  log,
});
const agentRuntimeLifecycle = createAgentRuntimeLifecycle({
  startAgent,
  getAgentClient,
  getAgentClientIfInitialized: () => agentClient,
  logMainRuntime,
});
const {
  sendQueryThroughAgentSdkRuntime,
  stopQueryThroughAgentSdkRuntime,
  updateSettingsThroughAgentSdkRuntime,
  requestModelListThroughAgentSdkRuntime,
  sendWakewordDetectedThroughAgentSdkRuntime,
} = createAgentSdkRuntimeCommands({
  ensureAgent,
  getActiveAgent: () => agentRuntimeLifecycle.getActiveAgent(),
  resolveConversationRefFromPayload,
  resolveWorkspacePathForAgent,
  clearLatestPendingTurn,
  log,
});
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
const {
  countMcpEnabledServersInConfig,
  getDesktopUiConfigForMcpRegistry,
  persistDesktopUiConfigToDisk,
  preserveMainOwnedDesktopUiConfigFields,
} = createDesktopUiConfigPersistenceRuntime({
  getLatestDesktopUiConfig: () => latestDesktopUiConfig,
  setLatestDesktopUiConfig: (config) => {
    latestDesktopUiConfig = config;
  },
  loadDesktopUiConfigFromDiskSync,
  redactDesktopUiConfigProviderSecrets,
  saveDesktopUiConfigToDisk,
  isValidConfigPayload,
  appendDiagnosticEvent,
  mcpEnablementDiagnosticsPath: MCP_ENABLEMENT_DIAGNOSTICS_PATH,
  log,
});
const globalStopShortcutConfigRuntime = createGlobalStopShortcutConfigRuntime({
  isValidConfigPayload,
  getLatestDesktopUiConfig: () => latestDesktopUiConfig,
  persistDesktopUiConfigToDisk,
  broadcastConnectionStatus: (connected) => broadcastConnectionStatus(connected),
  isConnected: () => isConnected,
});
const mainProcessTraceRuntime = createMainProcessTraceRuntime({
  ensureAgent,
  appendAppDiagnostic,
  permissionProbeDiagnosticsPath: PERMISSION_PROBE_DIAGNOSTICS_PATH,
  TraceRecorder,
  createConversationEvent,
});
const mcpRefreshRuntime = createMcpRefreshRuntime({
  getDesktopUiConfigForMcpRegistry,
  countMcpEnabledServersInConfig,
  ensureAgent,
  refreshMcpServersForConfig,
  getMcpClientInfo: () => ipcHostCopy.identity.mcpClientInfo,
  isTest: () => process.env.NODE_ENV === 'test',
  log,
});
const installAuthRuntime = createInstallAuthRuntime({
  getCurrentState: () => ({
    installToken: currentInstallToken,
    userId: currentUserId,
    installId: currentInstallId,
  }),
  applyInstallAuthState,
  getEndpointCandidates: () => backendEndpointState.getCandidates(),
  setActiveBackendEndpoint,
  loadInstallAuthStateFromDisk,
  validateInstallAuthStateWithBackend,
  registerInstallWithBackend,
  saveInstallAuthStateToDisk,
  clearInstallAuthStateFromDisk,
  log,
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
  return installAuthRuntime.buildInstallAuthHeaders();
}

async function ensureInstallAuthState() {
  return installAuthRuntime.ensureInstallAuthState();
}

function applyShortcutStatusFallbackToConfig(config) {
  return globalStopShortcutConfigRuntime.applyShortcutStatusFallbackToConfig(config);
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

async function loadCachedDesktopUiConfigFromDisk() {
  return loadDesktopUiConfigFromDisk(log);
}

function updateGlobalAgentStopShortcutStatus(status) {
  globalStopShortcutConfigRuntime.updateGlobalAgentStopShortcutStatus(status);
}

function getGlobalAgentStopShortcutStatus() {
  return globalStopShortcutConfigRuntime.getStatus();
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
  globalStopShortcutConfigRuntime.reset();
  installAuthRuntime.reset();
  mcpRefreshRuntime.reset();
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
  return handleAgentConnectionEvent(event, {
    getCurrentUserId: () => currentUserId,
    setCurrentServerUserId: (value) => {
      currentServerUserId = value;
    },
    setConnected: (value) => {
      isConnected = value;
    },
    setFirstQuery: (value) => {
      isFirstQuery = value;
    },
    traceBackendConnection: (data) => electronMainTraceLogger.traceBackendConnection(data),
    resetSettingsSyncState,
    setResponseOverlayPhase,
    clearEventReplayState: () => ipcEventReplayState.clear(),
    logMainRuntime,
    log,
    broadcastConnectionStatus,
    handleAgentBackendClose,
  });
}

function handleAgentBackendFallback(endpointPayload = {}) {
  return handleAgentBackendFallbackEvent(endpointPayload, {
    getEndpointCandidates: () => backendEndpointState.getCandidates(),
    setActiveBackendEndpoint,
    advanceToNextBackendEndpoint,
    getCurrentEndpoint: () => backendEndpointState.getEndpoint(),
    logMainRuntime,
    log,
  });
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
  return createElectronAgentClientRuntime({
    AgentClient,
    backendEndpointState,
    desktopLocalRuntimeLaunchConfig,
    WebSocketImpl: agentWebSocketImpl,
    reconnectIntervalMs: BACKEND_RECONNECT_INTERVAL_MS,
    connectTimeoutMs: BACKEND_CONNECT_TIMEOUT_MS,
    idleDisconnectTimeoutMs: BACKEND_IDLE_DISCONNECT_TIMEOUT_MS,
    onBackendOpen: payload => handleAgentConnection({ type: 'open', ...payload }),
    onBackendClose: payload => handleAgentConnection({ type: 'close', ...payload }),
    onBackendError: payload => handleAgentConnection({ type: 'error', ...payload }),
    onBackendHandshakeError: error => handleAgentConnection({ type: 'handshake-error', error }),
    onBackendMessageError: error => handleAgentConnection({ type: 'message-error', error }),
    onBackendSend: type => {
      agentRuntimeLifecycle.noteBackendTraffic(`send:${type}`);
    },
    onBackendFallback: endpoint => handleAgentBackendFallback(endpoint),
    isTest: process.env.NODE_ENV === 'test',
    logMainRuntime,
  });
}

function getAgentClient() {
  if (!agentClient) {
    logMainRuntime('[Main][SDK] client_initialized');
    agentClient = createElectronAgentClient();
  }
  return agentClient;
}

async function startAgent({ reason = 'request', workspacePath = null } = {}) {
  return startAgentRuntime({ reason, workspacePath }, {
    ensureInstallAuthState,
    resolveWorkspacePathForAgent,
    getAgentClient,
    buildDesktopInstallAuth,
    getSdkAgentName: () => ipcHostCopy.identity.sdkAgentName,
    isTest: () => process.env.NODE_ENV === 'test',
    getEnabledMcpServerSpecsForConfig,
    getDesktopUiConfigForMcpRegistry,
    getLocalToolLifecycle: () => localToolLifecycle,
    createDirectWakeUpAgentAdapter,
    buildDirectWakeUpAgentAdapterDeps: () => ({
      broadcastToRenderers,
      resolveRuntimeConversationRef,
      setLatestCurrentTurnProjection: (currentTurnProjection) => {
        latestCurrentTurnProjection = currentTurnProjection;
      },
      getLatestPendingTurn: () => latestPendingTurn,
      pendingTurnMatchesCurrentTurn,
      clearLatestPendingTurn,
      logLiveSurfaceTrace,
      summarizeCurrentTurn,
      isDebugFlagEnabled,
      currentTurnTraceLogger,
      getSyncSdkLiveTurnSurfaceIntent: () => syncSdkLiveTurnSurfaceIntent,
      log,
      buildConversationTerminalStatus,
      resolveWorkspacePathForAgent,
      handleAgentBackendEvent,
      refreshMcpServersForConfig,
      getMcpClientInfo: () => ipcHostCopy.identity.mcpClientInfo,
    }),
    appendIpcBridgeDiagnostic,
    log,
  });
}

async function ensureAgent({ reason = 'request', workspacePath = null } = {}) {
  return agentRuntimeLifecycle.ensureAgent({ reason, workspacePath });
}

function syncBackendIdleDisconnectTimer(reason = 'idle-sync') {
  agentRuntimeLifecycle.syncBackendIdleDisconnectTimer(reason);
}

function noteBackendTraffic(reason = 'traffic') {
  agentRuntimeLifecycle.noteBackendTraffic(reason);
}

function getKnownAgentLocalRuntime() {
  return agentRuntimeLifecycle.getKnownAgentLocalRuntime();
}

async function ensureAgentLocalRuntime({ reason = 'local-runtime' } = {}) {
  return agentRuntimeLifecycle.ensureAgentLocalRuntime({ reason });
}

function isBackendRuntimeConnected() {
  return agentRuntimeLifecycle.isBackendRuntimeConnected(isConnected);
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
  return mcpRefreshRuntime.refreshMcpServersForLatestConfig(reason);
}

function refreshEnabledMcpServersAfterStartup(config) {
  return mcpRefreshRuntime.refreshEnabledMcpServersAfterStartup(config);
}

function buildIpcStatusPayload(connected) {
  return {
    isConnected: connected,
    userId: currentUserId,
    runtimeWsUrl: backendEndpointState.getWsUrl(),
    runtimeHttpUrl: backendEndpointState.getHttpUrl(),
    globalAgentStopShortcutStatus: getGlobalAgentStopShortcutStatus(),
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

function clearLatestPendingTurn(input = {}) {
  return clearPendingTurnState({
    ...input,
    getLatestPendingTurn: () => latestPendingTurn,
    setLatestPendingTurn: (pendingTurn) => {
      latestPendingTurn = pendingTurn;
    },
    broadcastToRenderers,
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
  backendMessageObserverRegistry.notify(rendererData);
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
  return handleAgentBackendCloseEvent({ closeReason, shouldReconnect }, {
    setConnected: (value) => {
      isConnected = value;
    },
    markInferenceContextsStale: () => agentRuntimeLifecycle.getActiveAgent()?.markInferenceContextsStale?.(),
    resetSettingsSyncState,
    getResponseOverlayPhase: () => responseOverlayPhaseState.getPhase(),
    getActiveQueryContext: () => activeQueryContext,
    setActiveQueryContext: (value) => {
      activeQueryContext = value;
    },
    getCurrentSessionId: () => currentSessionId,
    getCurrentServerUserId: () => currentServerUserId,
    getCurrentUserId: () => currentUserId,
    getQueryEventsCopy: () => ipcHostCopy.queryEvents,
    buildQueryInterrupted,
    handleAgentBackendEvent,
    setResponseOverlayPhase,
    resetBackendSessionState,
    clearEventReplayState: () => ipcEventReplayState.clear(),
    log,
    broadcastConnectionStatus,
  });
}

function shutdownIpcForTests() {
  resetSettingsSyncState();
  resetBackendSessionState();
  resetIpcProcessStateForTests();
  rendererWindows = new Set();
  backendMessageObserverRegistry.reset();
  applyResponseOverlayPhase = null;
  onBeforeOverlayQueryCapture = null;
  setAgentLoopStopShortcutEnabled = null;
  setGlobalAgentStopShortcutAccelerator = null;
  localToolLifecycle = null;
  syncSdkLiveTurnSurfaceIntent = null;
  agentWebSocketImpl = null;
  installAuthRuntime.reset();
  isConnected = false;
  mcpRefreshRuntime.reset();
  latestPendingTurn = null;
  void agentClient?.shutdownLocalRuntime?.();
  agentClient = null;
  agentRuntimeLifecycle.reset({ closeActiveAgent: true });
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
      globalAgentStopShortcutStatus: getGlobalAgentStopShortcutStatus(),
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

  registerPendingTurnHandlers({
    ipcMain,
    clearLatestPendingTurn,
    setLatestPendingTurn: (pendingTurn) => {
      latestPendingTurn = pendingTurn;
    },
    broadcastToRenderers,
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

  registerAgentSdkInvokeHandler({
    ipcMain,
    invokeChannel: DESKTOP_RUNTIME_INVOKE_CHANNELS.INVOKE,
    handleRendererChatQuery,
    handleRendererStopQuery,
    deps: {
      getState: () => ({
        currentConversationRef,
        currentSessionId,
        currentUserId,
        isConnected,
        agent: agentRuntimeLifecycle.getActiveAgent(),
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
  });

}

async function appendMainProcessTraceEvent(input = {}) {
  return mainProcessTraceRuntime.appendMainProcessTraceEvent(input);
}

function resolveMainStopTarget() {
  return resolveMainStopTargetRuntime({
    latestCurrentTurnProjection,
    latestPendingTurn,
    currentConversationRef,
  });
}

async function triggerStopQueryFromMain() {
  return triggerMainStopTarget({
    stopTarget: resolveMainStopTarget(),
    stopQueryThroughAgentSdkRuntime,
    setResponseOverlayPhase,
  });
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
  return backendMessageObserverRegistry.register(observer);
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
    globalAgentStopShortcutStatus: getGlobalAgentStopShortcutStatus(),
  };
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function appendAppDiagnostic(input = {}) {
  try {
    return appendDiagnosticEvent(input);
  } catch (error) {
    log(`[AppDiagnostics] failed to persist ${input.path || APP_DIAGNOSTICS_PATH}: ${error?.message || error}`);
    return { stored: false, reason: error?.message || String(error) };
  }
}

function attachAgentDefinitionContext(payload) {
  return attachAgentDefinitionContextRuntime(payload, {
    latestDesktopUiConfig,
    platformName: process.platform,
    buildAgentDefinition,
    isDefaultAgentDefinition,
  });
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
