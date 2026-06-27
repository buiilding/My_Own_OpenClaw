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
  createBackendEndpointRuntime,
} = require('./ipc/ipc_backend_endpoint_state.cjs');
const {
  createIpcHostRuntimeConfig,
} = require('./ipc/ipc_host_runtime_config.cjs');
const {
  loadDesktopUiConfigFromDisk,
  loadDesktopUiConfigFromDiskSync,
  redactDesktopUiConfigProviderSecrets,
  saveDesktopUiConfigToDisk,
} = require('./ipc/ipc_desktop_ui_config.cjs');
const {
  createDesktopUiConfigStoreRuntime,
} = require('./ipc/ipc_desktop_ui_config_store.cjs');
const {
  hydrateProviderApiKeySecretsForBackendSettings,
} = require('./ipc/ipc_provider_credentials_store.cjs');
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
  createAgentConnectionEventsRuntime,
} = require('./ipc/ipc_agent_connection_events.cjs');
const {
  createIpcProcessResetRuntime,
} = require('./ipc/ipc_process_reset_runtime.cjs');
const {
  createAgentBackendCloseRuntime,
} = require('./ipc/ipc_agent_backend_close_runtime.cjs');
const {
  createAgentBackendEventRuntime,
} = require('./ipc/ipc_agent_backend_event_runtime.cjs');
const {
  createActiveQueryContextState,
} = require('./ipc/ipc_active_query_context.cjs');
const {
  createBackendSessionState,
} = require('./ipc/ipc_backend_session_state.cjs');
const {
  createBackendConnectionGateState,
} = require('./ipc/ipc_backend_connection_gate_state.cjs');
const {
  createConversationEventProjectionRuntime,
} = require('./ipc/ipc_conversation_event_projection.cjs');
const {
  createElectronAgentClientFactoryRuntime,
} = require('./ipc/ipc_electron_agent_client_factory.cjs');
const {
  createAgentClientLifecycleRuntime,
} = require('./ipc/ipc_agent_client_lifecycle.cjs');
const {
  createRuntimeConversationRefRuntime,
} = require('./ipc/ipc_runtime_conversation_ref.cjs');
const {
  createAgentWakeupRuntime,
} = require('./ipc/ipc_agent_wakeup_runtime.cjs');
const {
  createAgentRuntimeLifecycleRuntime,
} = require('./ipc/ipc_agent_runtime_lifecycle.cjs');
const {
  createAgentSdkRuntimeCommandsRuntime,
} = require('./ipc/ipc_agent_sdk_runtime_commands.cjs');
const {
  createBackendMessageObserverRegistry,
} = require('./ipc/ipc_backend_message_observers.cjs');
const {
  createIpcStatusPayloads,
} = require('./ipc/ipc_status_payloads.cjs');
const {
  createIpcSessionContextRuntime,
} = require('./ipc/ipc_session_context_runtime.cjs');
const {
  createIpcHostCopyRuntime,
} = require('./ipc/ipc_host_copy_runtime.cjs');
const {
  createIpcHostOptionState,
} = require('./ipc/ipc_host_option_state.cjs');
const {
  createDesktopUiConfigHandlersRuntime,
} = require('./ipc/ipc_desktop_ui_config_handlers.cjs');
const {
  createExtensionMcpHandlersRuntime,
} = require('./ipc/ipc_extension_mcp_handlers.cjs');
const {
  createClientSessionHandlersRuntime,
} = require('./ipc/ipc_client_session_handlers.cjs');
const {
  clearInstallAuthStateFromDisk,
  loadInstallAuthStateFromDisk,
  registerInstallWithBackend,
  saveInstallAuthStateToDisk,
  validateInstallAuthStateWithBackend,
} = require('./ipc/ipc_install_auth_state.cjs');
const {
  createInstallAuthContextRuntime,
} = require('./ipc/ipc_install_auth_context_runtime.cjs');
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
  createRendererDiagnosticsHandlersRuntime,
} = require('./ipc/ipc_renderer_diagnostics_handlers.cjs');
const {
  createPendingTurnRuntime,
} = require('./ipc/ipc_pending_turn_handlers.cjs');
const {
  createIpcLiveTurnState,
} = require('./ipc/ipc_live_turn_state.cjs');
const {
  createMainStopTargetRuntime,
} = require('./ipc/ipc_stop_target_runtime.cjs');
const {
  createDirectWakeUpAgentAdapter,
} = require('./ipc/ipc_direct_wake_up_agent_adapter.cjs');
const {
  createDirectWakeUpAgentAdapterDepsRuntime,
} = require('./ipc/ipc_direct_wake_up_agent_adapter_deps.cjs');
const {
  createAgentDefinitionContextRuntime,
} = require('./ipc/ipc_agent_definition_context.cjs');
const {
  MCP_ENABLEMENT_DIAGNOSTICS_PATH,
  PERMISSION_PROBE_DIAGNOSTICS_PATH,
  appendDiagnosticEvent,
} = require('./diagnostics/app_diagnostics_store.cjs');
const {
  createIpcAppDiagnosticsRuntime,
} = require('./ipc/ipc_app_diagnostics_runtime.cjs');
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
  createArtifactHandlersRuntime,
} = require('./ipc/ipc_artifact_handlers.cjs');
const {
  createQueryEventsRuntime,
} = require('./ipc/ipc_query_events.cjs');
const {
  buildConversationTerminalStatus,
} = require('./ipc/ipc_conversation_status_runtime.cjs');
const {
  createWorkspacePathRuntime,
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
  buildQueryPayload,
  buildRendererBackendQueryPayloadWithAgentDefinition,
  prepareAutomatedQueryPayload,
  prepareRendererQueryPayload,
} = require('./ipc/ipc_query_runtime.cjs');
const {
  createAutomatedQueryRuntime,
} = require('./ipc/ipc_automated_query_dispatcher.cjs');
const {
  createIpcStartupStateRuntime,
} = require('./ipc/ipc_startup_state.cjs');
const {
  createIpcInitializationRuntime,
} = require('./ipc/ipc_initialization_runtime.cjs');
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
  createChatQueryHandlerRuntime,
} = require('./ipc/ipc_chat_query_handlers.cjs');
const {
  createAgentSdkInvokeHandlerRuntime,
} = require('./ipc/ipc_agent_sdk_command_handlers.cjs');
const {
  createRendererWindowRuntime,
} = require('./ipc/ipc_renderer_windows.cjs');
const {
  broadcastQuerySendFailure: broadcastQuerySendFailureRuntime,
} = require('./ipc/ipc_query_broadcast.cjs');
const {
  createResponseOverlayPhaseState,
} = require('./ipc/ipc_overlay_phase_state.cjs');
const {
  createResponseOverlayPhaseRuntime,
} = require('./ipc/ipc_response_overlay_phase_runtime.cjs');
const {
  createIpcEventReplayState,
} = require('./ipc/ipc_event_replay_state.cjs');
const {
  DESKTOP_RUNTIME_INVOKE_CHANNELS,
} = require('./ipc/ipc_desktop_runtime_channels.cjs');
const {
  createImageInteractionHandlersRuntime,
} = require('./ipc/ipc_image_interaction_handlers.cjs');
const {
  resolveActiveSurfaceDisplayAffinity,
  setActiveDisplayAffinity,
} = require('./surfaces/display_affinity_runtime.cjs');
const {
  isAgentLoopStopShortcutPhase,
} = require('./shortcuts/agent_stop_shortcut_runtime.cjs');
const {
  AgentClient,
} = require('../../packages/windie-sdk-js/cjs/runtime/AgentClient.js');
const {
  buildAgentDefinition,
  isDefaultAgentDefinition,
} = require('../../packages/windie-sdk-js/cjs/runtime/AgentDefinition.js');
const {
  TraceRecorder,
} = require('../../packages/windie-sdk-js/cjs/runtime/TraceRecorder.js');
const {
  createConversationEvent,
} = require('../../packages/windie-sdk-js/cjs/conversation/events.js');
const { logChatPillMainTrace } = require('./debug/chat_pill_trace_runtime.cjs');
const {
  logLiveSurfaceTrace,
  summarizeCurrentTurn,
} = require('./debug/live_surface_trace_runtime.cjs');

const backendEndpointState = createBackendEndpointRuntime({
  configureBackendEndpointRuntime,
  resolveBackendEndpointCandidates,
  resolveBackendEndpoints,
  env: process.env,
});
const ipcHostRuntimeConfig = createIpcHostRuntimeConfig({
  backendEndpointState,
  configureDebugEnvRuntime,
});
const SETTINGS_SYNC_TIMEOUT_MS = 2500;
const BACKEND_RECONNECT_INTERVAL_MS = 1000;
const BACKEND_CONNECT_TIMEOUT_MS = 10000;
const BACKEND_IDLE_DISCONNECT_TIMEOUT_MS = 30 * 60 * 1000;
const ipcHostCopyRuntime = createIpcHostCopyRuntime();
const queryEventsRuntime = createQueryEventsRuntime({
  getCopy: () => ipcHostCopyRuntime.getQueryEvents(),
});
const {
  resolveConversationRefFromPayload,
  buildQueryInterrupted,
  buildQuerySendFailure,
} = queryEventsRuntime;
const currentTurnTraceLogger = createCurrentTurnTraceLogger({ log });
const electronMainTraceLogger = createElectronMainTraceLogger({ log });
const activeQueryContextState = createActiveQueryContextState();
const backendSessionState = createBackendSessionState();
const conversationEventProjectionRuntime = createConversationEventProjectionRuntime({
  getFallbackConversationRef: () => backendSessionState.getConversationRef(),
});
const runtimeConversationRefRuntime = createRuntimeConversationRefRuntime({
  getFallbackConversationRef: () => backendSessionState.getConversationRef(),
});
const backendConnectionGateState = createBackendConnectionGateState();
const hostOptionState = createIpcHostOptionState();
const desktopUiConfigStore = createDesktopUiConfigStoreRuntime({
  loadDesktopUiConfigFromDisk,
  loadDesktopUiConfigFromDiskSync,
  redactDesktopUiConfigProviderSecrets,
  saveDesktopUiConfigToDisk,
  isValidConfigPayload,
  applyShortcutStatusFallbackToConfig,
  appendDiagnosticEvent,
  mcpEnablementDiagnosticsPath: MCP_ENABLEMENT_DIAGNOSTICS_PATH,
  log,
});
const workspacePathRuntime = createWorkspacePathRuntime({
  getLatestDesktopUiConfig: () => desktopUiConfigStore.getSnapshot(),
});
const liveTurnState = createIpcLiveTurnState();
const pendingTurnRuntime = createPendingTurnRuntime({
  liveTurnState,
  broadcastToRenderers,
});
const mainStopTargetRuntime = createMainStopTargetRuntime({
  getLatestConversationView: () => liveTurnState.getLatestConversationView(),
  getLatestPendingTurn: () => liveTurnState.getLatestPendingTurn(),
  getCurrentConversationRef: () => backendSessionState.getConversationRef(),
  stopQueryThroughAgentSdkRuntime: (input) => stopQueryThroughAgentSdkRuntime(input),
  setResponseOverlayPhase,
});
const responseOverlayPhaseState = createResponseOverlayPhaseState();
const responseOverlayPhaseRuntime = createResponseOverlayPhaseRuntime({
  responseOverlayPhaseState,
  logChatPillMainTrace,
  getApplyResponseOverlayPhase: () => hostOptionState.getApplyResponseOverlayPhase(),
  getSetAgentLoopStopShortcutEnabled: () => hostOptionState.getSetAgentLoopStopShortcutEnabled(),
  isAgentLoopStopShortcutPhase,
  syncBackendIdleDisconnectTimer,
  broadcastToRenderers,
  log,
});
const ipcEventReplayState = createIpcEventReplayState();
const rendererWindowRuntime = createRendererWindowRuntime({
  getResponseOverlayPhase: () => responseOverlayPhaseState.getPhase(),
  getLatestCurrentTurn: () => liveTurnState.getLatestCurrentTurn(),
  getLatestConversationView: () => liveTurnState.getLatestConversationView(),
  getLatestPendingTurn: () => liveTurnState.getLatestPendingTurn(),
  getReplayEvents: () => ipcEventReplayState.snapshot(),
  buildConversationEvent: (event) => conversationEventProjectionRuntime.build(event),
});
const backendMessageObserverRegistry = createBackendMessageObserverRegistry({
  log,
});
const installAuthContextRuntime = createInstallAuthContextRuntime({
  getCurrentServerUserId: () => backendSessionState.getServerUserId(),
  setCurrentServerUserId: (value) => {
    backendSessionState.setServerUserId(value);
  },
  getEndpointCandidates: () => backendEndpointState.getCandidates(),
  setActiveBackendEndpoint,
  loadInstallAuthStateFromDisk,
  validateInstallAuthStateWithBackend,
  registerInstallWithBackend,
  saveInstallAuthStateToDisk,
  clearInstallAuthStateFromDisk,
  log,
});
const ipcSessionContextRuntime = createIpcSessionContextRuntime({
  backendSessionState,
  installAuthContextRuntime,
  backendConnectionGateState,
  getActiveAgent: () => agentRuntimeLifecycle.getActiveAgent(),
});
const ipcStatusPayloads = createIpcStatusPayloads({
  getState: () => ipcSessionContextRuntime.getStatusState(),
  getRuntimeEndpointSnapshot: () => ({
    runtimeWsUrl: backendEndpointState.getWsUrl(),
    runtimeHttpUrl: backendEndpointState.getHttpUrl(),
  }),
  getGlobalAgentStopShortcutStatus,
  broadcastToRenderers,
});
const electronAgentClientFactoryRuntime = createElectronAgentClientFactoryRuntime({
  AgentClient,
  backendEndpointState,
  getDesktopLocalRuntimeLaunchConfig: () => hostOptionState.getDesktopLocalRuntimeLaunchConfig(),
  getWebSocketImpl: () => hostOptionState.getAgentWebSocketImpl(),
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
  isTest: () => process.env.NODE_ENV === 'test',
  logMainRuntime,
});
const agentClientLifecycle = createAgentClientLifecycleRuntime({
  createAgentClient: () => electronAgentClientFactoryRuntime.createClient(),
  logMainRuntime,
});
const agentRuntimeLifecycle = createAgentRuntimeLifecycleRuntime({
  startAgent,
  getAgentClient,
  getAgentClientIfInitialized: () => agentClientLifecycle.getAgentClientIfInitialized(),
  logMainRuntime,
  getCurrentConversationRef: () => backendSessionState.getConversationRef(),
  defaultBackendConnectTimeoutMs: BACKEND_CONNECT_TIMEOUT_MS,
});
const {
  sendQueryThroughAgentSdkRuntime,
  stopQueryThroughAgentSdkRuntime,
  updateSettingsThroughAgentSdkRuntime,
  requestModelListThroughAgentSdkRuntime,
  sendWakewordDetectedThroughAgentSdkRuntime,
} = createAgentSdkRuntimeCommandsRuntime({
  ensureAgent,
  getActiveAgent: () => agentRuntimeLifecycle.getActiveAgent(),
  resolveConversationRefFromPayload,
  resolveWorkspacePathForAgent,
  clearLatestPendingTurn,
  log,
});
const settingsSyncRuntime = createIpcSettingsSyncRuntime({
  getLatestDesktopUiConfig: () => desktopUiConfigStore.getSnapshot(),
  replaceDesktopUiConfigFromRenderer: (config) => desktopUiConfigStore.replaceFromRenderer(config),
  loadCachedDesktopUiConfig: () => hydrateDesktopUiConfigStore(),
  isConnected: () => backendConnectionGateState.getConnected(),
  isBackendRuntimeConnected,
  ensureBackendConnection,
  updateSettings: (payload) => updateSettingsThroughAgentSdkRuntime(payload),
  hydrateProviderApiKeySecretsForBackendSettings,
  traceSettingsUpdate: (config, source, msgId) => electronMainTraceLogger.traceSettingsUpdate(
    config,
    source,
    msgId,
  ),
  log,
  timeoutMs: SETTINGS_SYNC_TIMEOUT_MS,
});
const globalStopShortcutConfigRuntime = createGlobalStopShortcutConfigRuntime({
  isValidConfigPayload,
  getLatestDesktopUiConfig: () => desktopUiConfigStore.getSnapshot(),
  persistDesktopUiConfigToDisk,
  broadcastConnectionStatus: (connected) => ipcStatusPayloads.broadcastConnectionStatus(connected),
  isConnected: () => backendConnectionGateState.getConnected(),
});
const mainProcessTraceRuntime = createMainProcessTraceRuntime({
  ensureAgent,
  appendAppDiagnostic,
  permissionProbeDiagnosticsPath: PERMISSION_PROBE_DIAGNOSTICS_PATH,
  TraceRecorder,
  createConversationEvent,
});
const ipcAppDiagnosticsRuntime = createIpcAppDiagnosticsRuntime({
  appendDiagnosticEvent,
  log,
});
const mcpRefreshRuntime = createMcpRefreshRuntime({
  getDesktopUiConfigForMcpRegistry,
  countMcpEnabledServersInConfig,
  ensureAgent,
  refreshMcpServersForConfig,
  getMcpClientInfo: () => ipcHostCopyRuntime.getMcpClientInfo(),
  isTest: () => process.env.NODE_ENV === 'test',
  log,
});
const agentConnectionEventsRuntime = createAgentConnectionEventsRuntime({
  getCurrentUserId: () => ipcSessionContextRuntime.getCurrentUserId(),
  setCurrentServerUserId: (value) => {
    backendSessionState.setServerUserId(value);
  },
  setConnected: (value) => {
    backendConnectionGateState.setConnected(value);
  },
  setFirstQuery: (value) => {
    backendConnectionGateState.setFirstQuery(value);
  },
  traceBackendConnection: (data) => electronMainTraceLogger.traceBackendConnection(data),
  resetSettingsSyncState,
  setResponseOverlayPhase,
  clearEventReplayState: () => ipcEventReplayState.clear(),
  logMainRuntime,
  log,
  broadcastConnectionStatus: (connected) => ipcStatusPayloads.broadcastConnectionStatus(connected),
  handleAgentBackendClose,
  getEndpointCandidates: () => backendEndpointState.getCandidates(),
  setActiveBackendEndpoint,
  advanceToNextBackendEndpoint,
  getCurrentEndpoint: () => backendEndpointState.getEndpoint(),
});
const agentBackendEventRuntime = createAgentBackendEventRuntime({
  getActiveQueryContext: () => activeQueryContextState.get(),
  setActiveQueryContext: (value) => activeQueryContextState.set(value),
  appendForActiveTurn: (event) => ipcEventReplayState.appendForActiveTurn(event),
  clearEventReplayState: () => ipcEventReplayState.clear(),
  noteBackendTraffic,
  notifyBackendMessageObservers: (event) => backendMessageObserverRegistry.notify(event),
  processBackendMessageData,
  processBackendMessageDeps: {
    setCurrentSessionId: (value) => {
      backendSessionState.setSessionId(value);
    },
    setCurrentServerUserId: (value) => {
      backendSessionState.setServerUserId(value);
    },
    setCurrentConversationRef: (value) => {
      backendSessionState.setConversationRef(value);
    },
    resolveSettingsAck: (msgId, wasSuccessful) => settingsSyncRuntime.resolveAck(
      msgId,
      wasSuccessful,
    ),
    setResponseOverlayPhase,
    getResponseOverlayPhase: () => responseOverlayPhaseState.getPhase(),
    broadcastToRenderers,
    traceBackendEvent: (data) => electronMainTraceLogger.traceBackendEvent(data),
    log,
  },
});
const agentBackendCloseRuntime = createAgentBackendCloseRuntime({
  setConnected: (value) => {
    backendConnectionGateState.setConnected(value);
  },
  markInferenceContextsStale: () => agentRuntimeLifecycle.getActiveAgent()?.markInferenceContextsStale?.(),
  resetSettingsSyncState,
  getResponseOverlayPhase: () => responseOverlayPhaseState.getPhase(),
  getActiveQueryContext: () => activeQueryContextState.get(),
  setActiveQueryContext: (value) => activeQueryContextState.set(value),
  getCurrentSessionId: () => backendSessionState.getSessionId(),
  getCurrentServerUserId: () => backendSessionState.getServerUserId(),
  getCurrentUserId: () => ipcSessionContextRuntime.getCurrentUserId(),
  getQueryEventsCopy: () => ipcHostCopyRuntime.getQueryEvents(),
  buildQueryInterrupted,
  handleAgentBackendEvent,
  setResponseOverlayPhase,
  resetBackendSessionState,
  clearEventReplayState: () => ipcEventReplayState.clear(),
  log,
  broadcastConnectionStatus: (connected) => ipcStatusPayloads.broadcastConnectionStatus(connected),
});
const ipcProcessResetRuntime = createIpcProcessResetRuntime({
  settingsSyncRuntime,
  backendSessionState,
  liveTurnState,
  currentTurnTraceLogger,
  electronMainTraceLogger,
  backendConnectionGateState,
  installAuthContextRuntime,
  activeQueryContextState,
  desktopUiConfigStore,
  globalStopShortcutConfigRuntime,
  mcpRefreshRuntime,
  hostOptionState,
  rendererWindowRuntime,
  backendMessageObserverRegistry,
  agentClientLifecycle,
  agentRuntimeLifecycle,
});
const directWakeUpAgentAdapterDepsRuntime = createDirectWakeUpAgentAdapterDepsRuntime({
  broadcastToRenderers,
  resolveRuntimeConversationRef,
  setLatestSdkLiveTurn: (sdkLiveTurn) => liveTurnState.setLatestCurrentTurn(
    sdkLiveTurn,
  ),
  setLatestConversationView: (conversationView) => liveTurnState.setLatestConversationView(
    conversationView,
  ),
  getLatestPendingTurn: () => liveTurnState.getLatestPendingTurn(),
  pendingTurnMatchesCurrentTurn: pendingTurnRuntime.matchesCurrentTurn,
  clearLatestPendingTurn,
  logLiveSurfaceTrace,
  summarizeCurrentTurn,
  isDebugFlagEnabled,
  currentTurnTraceLogger,
  traceRuntimeSend: (input) => electronMainTraceLogger.traceRuntimeSend(input),
  getSyncSdkLiveTurnSurfaceIntent: () => hostOptionState.getSyncSdkLiveTurnSurfaceIntent(),
  log,
  buildConversationTerminalStatus,
  resolveWorkspacePathForAgent,
  handleAgentBackendEvent,
  refreshMcpServersForConfig,
  getMcpClientInfo: () => ipcHostCopyRuntime.getMcpClientInfo(),
});
const agentWakeupRuntime = createAgentWakeupRuntime({
  ensureInstallAuthState: () => installAuthContextRuntime.ensureInstallAuthState(),
  resolveWorkspacePathForAgent,
  getAgentClient,
  buildDesktopInstallAuth: () => installAuthContextRuntime.buildDesktopInstallAuth(),
  getSdkAgentName: () => ipcHostCopyRuntime.getSdkAgentName(),
  isTest: () => process.env.NODE_ENV === 'test',
  getEnabledMcpServerSpecsForConfig,
  getDesktopUiConfigForMcpRegistry,
  getLocalToolLifecycle: () => hostOptionState.getLocalToolLifecycle(),
  createDirectWakeUpAgentAdapter,
  buildDirectWakeUpAgentAdapterDeps: () => directWakeUpAgentAdapterDepsRuntime.build(),
  appendIpcBridgeDiagnostic,
  log,
});
const agentDefinitionContextRuntime = createAgentDefinitionContextRuntime({
  getLatestDesktopUiConfig: () => desktopUiConfigStore.getDesktopUiConfigForAgentDefinition(),
  platformName: process.platform,
  buildAgentDefinition,
  isDefaultAgentDefinition,
});
function attachRuntimeTurnContextToPayload(payload) {
  return buildRendererBackendQueryPayloadWithAgentDefinition({
    payload,
    attachAgentDefinitionContext,
  });
}
const chatQueryHandlerRuntime = createChatQueryHandlerRuntime({
  getState: () => ipcSessionContextRuntime.getQueryState(),
  setCurrentConversationRef: (conversationRef) => {
    backendSessionState.setConversationRef(conversationRef);
  },
  setActiveQueryContext: (queryContext) => activeQueryContextState.set(queryContext),
  setFirstQuery: (nextValue) => {
    backendConnectionGateState.setFirstQuery(nextValue);
  },
  attachAgentDefinitionContextToPayload: attachRuntimeTurnContextToPayload,
  ensureInstallAuthState: () => installAuthContextRuntime.ensureInstallAuthState(),
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
    log,
    prepareRendererQueryPayload,
    resolveConversationRefFromPayload,
    uuidGenerator: uuidv4,
    logChatPillMainTrace,
    setResponseOverlayPhase,
    setActiveDisplayAffinity,
    resolveActiveSurfaceDisplayAffinity,
    broadcastToRenderers,
    ipcEventReplayState,
    buildQueryPayload,
    broadcastQuerySendFailureRuntime,
    buildQuerySendFailure,
    traceRendererQuery: (input) => electronMainTraceLogger.traceRendererQuery(input),
  },
});
const automatedQueryRuntime = createAutomatedQueryRuntime({
  prepareAutomatedQueryPayload,
  ensureBackendConnection,
  ensureInitialSettingsSync,
  getPendingSettingsSyncPromise: () => settingsSyncRuntime.getPendingSettingsSyncPromise(),
  buildQueryPayload,
  attachAgentDefinitionContextToPayload: attachRuntimeTurnContextToPayload,
  sendQueryThroughAgentSdkRuntime,
  getState: () => ipcSessionContextRuntime.getQueryState(),
  setCurrentConversationRef: (conversationRef) => {
    backendSessionState.setConversationRef(conversationRef);
  },
  setFirstQuery: (nextValue) => {
    backendConnectionGateState.setFirstQuery(nextValue);
  },
  uuidGenerator: uuidv4,
});
const agentSdkInvokeHandlerRuntime = createAgentSdkInvokeHandlerRuntime({
  invokeChannel: DESKTOP_RUNTIME_INVOKE_CHANNELS.INVOKE,
  deps: {
    getState: () => ipcSessionContextRuntime.getAgentSdkInvokeState(),
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
    attachRuntimeTurnContextToPayload,
    traceRuntimeSend: (input) => electronMainTraceLogger.traceRuntimeSend(input),
  },
});
const artifactHandlersRuntime = createArtifactHandlersRuntime({
  uploadArtifact,
  fetchArtifactImage,
  ensureInstallAuthState: () => installAuthContextRuntime.ensureInstallAuthState(),
  getBackendHttpUrl: () => backendEndpointState.getHttpUrl(),
  buildInstallAuthHeaders: () => installAuthContextRuntime.buildInstallAuthHeaders(),
});
const rendererDiagnosticsHandlersRuntime = createRendererDiagnosticsHandlersRuntime({
  handleRendererLog,
  handleRendererLiveSurfaceTrace,
});
const imageInteractionHandlersRuntime = createImageInteractionHandlersRuntime({
  Menu,
  BrowserWindow,
  clipboard,
  nativeImage,
  getBackendHttpUrl: () => backendEndpointState.getHttpUrl(),
  getBackendCandidates: () => backendEndpointState.getCandidates(),
});
const clientSessionHandlersRuntime = createClientSessionHandlersRuntime({
  getClientSessionState: () => ipcStatusPayloads.getClientSessionState(),
  getRuntimeEndpointSnapshot: () => ipcStatusPayloads.getRuntimeEndpointSnapshot(),
  setTranscriptSessionState: (state) => ipcSessionContextRuntime.setTranscriptSessionState(state),
  broadcastToRenderers,
});
const extensionMcpHandlersRuntime = createExtensionMcpHandlersRuntime({
  loadPublicExtensionRegistry,
  listMcpServersForConfig,
  updateMcpServerEnablementForConfig,
  getEnabledMcpServerSpecsForConfig,
  refreshMcpServersForLatestConfig,
  persistDesktopUiConfigToDisk,
  getDesktopUiConfigForMcpRegistry,
  ensureAgent,
  mcpClientInfo: () => ipcHostCopyRuntime.getMcpClientInfo(),
});
const desktopUiConfigHandlersRuntime = createDesktopUiConfigHandlersRuntime({
  desktopUiConfigStore,
  persistDesktopUiConfigToDisk,
  isValidConfigPayload,
  getGlobalAgentStopShortcutAcceleratorSetter:
    () => hostOptionState.getSetGlobalAgentStopShortcutAccelerator(),
});
const ipcStartupStateRuntime = createIpcStartupStateRuntime({
  loadInstallAuthStateFromDisk,
  applyInstallAuthState: (state) => installAuthContextRuntime.applyInstallAuthState(state),
  hydrateDesktopUiConfigStore,
  isValidConfigPayload,
  getGlobalAgentStopShortcutAcceleratorSetter:
    () => hostOptionState.getSetGlobalAgentStopShortcutAccelerator(),
  getAgentLoopStopShortcutEnabledSetter:
    () => hostOptionState.getSetAgentLoopStopShortcutEnabled(),
  getResponseOverlayPhase: () => responseOverlayPhaseState.getPhase(),
  isAgentLoopStopShortcutPhase,
  onDesktopUiConfigLoaded: refreshEnabledMcpServersAfterStartup,
  log,
});
const ipcInitializationRuntime = createIpcInitializationRuntime({
  ipcMain,
  refreshBackendEndpoints,
  hostOptionState,
  rendererWindowRuntime,
  trackRendererWindow,
  ipcStartupStateRuntime,
  desktopUiConfigHandlersRuntime,
  extensionMcpHandlersRuntime,
  clientSessionHandlersRuntime,
  artifactHandlersRuntime,
  imageInteractionHandlersRuntime,
  rendererDiagnosticsHandlersRuntime,
  pendingTurnRuntime,
  chatQueryHandlerRuntime,
  agentSdkInvokeHandlerRuntime,
});

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

async function hydrateDesktopUiConfigStore() {
  return desktopUiConfigStore.hydrate();
}

function persistDesktopUiConfigToDisk(config, options = {}) {
  return desktopUiConfigStore.persist(config, options);
}

function getDesktopUiConfigForMcpRegistry() {
  return desktopUiConfigStore.getDesktopUiConfigForMcpRegistry();
}

function countMcpEnabledServersInConfig(config) {
  return desktopUiConfigStore.countMcpEnabledServersInConfig(config);
}

function updateGlobalAgentStopShortcutStatus(status) {
  globalStopShortcutConfigRuntime.updateGlobalAgentStopShortcutStatus(status);
}

function getGlobalAgentStopShortcutStatus() {
  return globalStopShortcutConfigRuntime.getStatus();
}

function resetSettingsSyncState() {
  ipcProcessResetRuntime.resetSettingsSyncState();
}

function resetBackendSessionState() {
  ipcProcessResetRuntime.resetBackendSessionState();
}

function resolveWorkspacePathForAgent(payload = {}) {
  return workspacePathRuntime.resolve(payload);
}

function handleAgentConnection(event = {}) {
  return agentConnectionEventsRuntime.handleConnection(event);
}

function handleAgentBackendFallback(endpointPayload = {}) {
  return agentConnectionEventsRuntime.handleBackendFallback(endpointPayload);
}

function resolveRuntimeConversationRef(input = {}) {
  return runtimeConversationRefRuntime.resolve(input);
}

function configureIpcHostRuntime(config = {}) {
  ipcHostRuntimeConfig.configure(config);
}

function configureIpcHostCopyRuntime(copy = {}) {
  ipcHostCopyRuntime.configure(copy);
}

function getAgentClient() {
  return agentClientLifecycle.getAgentClient();
}

async function startAgent({ reason = 'request', workspacePath = null } = {}) {
  return agentWakeupRuntime.start({ reason, workspacePath });
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
  return agentRuntimeLifecycle.isBackendRuntimeConnected(
    backendConnectionGateState.getConnected(),
  );
}

async function ensureBackendConnection(reason = 'request', timeoutMs = BACKEND_CONNECT_TIMEOUT_MS) {
  return agentRuntimeLifecycle.ensureCurrentBackendConnection(reason, timeoutMs);
}

async function refreshMcpServersForLatestConfig(reason = 'mcp-refresh') {
  return mcpRefreshRuntime.refreshMcpServersForLatestConfig(reason);
}

function refreshEnabledMcpServersAfterStartup(config) {
  return mcpRefreshRuntime.refreshEnabledMcpServersAfterStartup(config);
}

async function sendSettingsUpdate(config, source = 'renderer') {
  return settingsSyncRuntime.sendSettingsUpdate(config, source);
}

async function ensureInitialSettingsSync() {
  return settingsSyncRuntime.ensureInitialSettingsSync();
}

function trackRendererWindow(win) {
  rendererWindowRuntime.track(win);
}

function clearLatestPendingTurn(input = {}) {
  return pendingTurnRuntime.clear(input);
}

function broadcastToRenderers(channel, payload, sourceWebContents = null) {
  rendererWindowRuntime.broadcast(channel, payload, sourceWebContents);
}

function setResponseOverlayPhase(phase, source = 'ipc', metadata = null) {
  responseOverlayPhaseRuntime.setResponseOverlayPhase(phase, source, metadata);
}

function handleAgentBackendEvent(rendererData) {
  return agentBackendEventRuntime.handle(rendererData);
}

function handleAgentBackendClose({ closeReason, shouldReconnect } = {}) {
  return agentBackendCloseRuntime.handle({ closeReason, shouldReconnect });
}

function shutdownIpcForTests() {
  ipcProcessResetRuntime.shutdownIpcForTests();
}

function initializeIpc(win, options = {}) {
  ipcInitializationRuntime.initialize(win, options);
}

async function appendMainProcessTraceEvent(input = {}) {
  return mainProcessTraceRuntime.appendMainProcessTraceEvent(input);
}

async function triggerStopQueryFromMain() {
  return mainStopTargetRuntime.trigger();
}

function registerRendererWindow(win) {
  trackRendererWindow(win);
}

function getLatestDesktopUiConfig() {
  return desktopUiConfigStore.getSnapshot();
}

function registerBackendMessageObserver(observer) {
  return backendMessageObserverRegistry.register(observer);
}

function getBackendConnectionState() {
  return ipcStatusPayloads.getBackendConnectionState();
}

function appendAppDiagnostic(input = {}) {
  return ipcAppDiagnosticsRuntime.appendAppDiagnostic(input);
}

function attachAgentDefinitionContext(payload) {
  return agentDefinitionContextRuntime.attach(payload);
}

async function sendAutomatedQuery(options = {}) {
  return automatedQueryRuntime.sendAutomatedQuery(options);
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
