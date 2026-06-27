/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');

const retiredProductPrefix = 'Wind' + 'ie';

function retiredProductName(suffix) {
  return `${retiredProductPrefix}${suffix}`;
}

describe('main ipc sdk runtime boundary', () => {
  const retiredAgentClientLifecycleFactorySignature = `function ${[
    'createAgentClient',
    'Lifecycle',
  ].join('')}(`;
  const retiredAgentRuntimeLifecycleFactorySignature = `function ${[
    'createAgentRuntime',
    'Lifecycle',
  ].join('')}(`;
  const retiredAgentSdkRuntimeCommandsFactorySignature = `function ${[
    'createAgentSdkRuntime',
    'Commands',
  ].join('')}(`;
  const retiredChatQueryHandlersExport = `${['createChatQuery', 'Handlers'].join('')},`;
  const retiredAgentSdkInvokeHandlerExport = `  ${['handleAgentSdk', 'Invoke'].join('')},`;
  const retiredAgentSdkInvokeRegistrationExport = `  ${['registerAgentSdkInvoke', 'Handler'].join('')},`;

  function createAgentSdkInvokeTestRuntime({
    deps,
    handleInvoke,
    handleRendererChatQuery = jest.fn(),
    handleRendererStopQuery = jest.fn(),
  } = {}) {
    const {
      createAgentSdkInvokeHandlerRuntime,
    } = require('../../src/main/ipc/ipc_agent_sdk_command_handlers.cjs');
    const handlers = {};
    const ipcMain = {
      handle: jest.fn((channel, handler) => {
        handlers[channel] = handler;
      }),
    };
    const runtime = createAgentSdkInvokeHandlerRuntime({
      invokeChannel: 'windie:invoke',
      deps,
      ...(handleInvoke ? { handleInvoke } : {}),
    });

    runtime.register({
      ipcMain,
      handleRendererChatQuery,
      handleRendererStopQuery,
    });

    return {
      handleRendererChatQuery,
      handleRendererStopQuery,
      handlers,
      invoke: (event, payload) => handlers['windie:invoke'](event, payload),
      ipcMain,
    };
  }

  function invokeAgentSdkCommand(payload, options = {}) {
    const runtime = createAgentSdkInvokeTestRuntime(options);
    return runtime.invoke(null, payload);
  }

  test('main helper modules import SDK contracts from owner modules', async () => {
    const ipcSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const commandHandlersSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_agent_sdk_command_handlers.cjs'),
      'utf8',
    );
    const queryBroadcastSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_query_broadcast.cjs'),
      'utf8',
    );

    expect(ipcSource).toContain('packages/windie-sdk-js/cjs/runtime/AgentClient.js');
    expect(ipcSource).toContain('packages/windie-sdk-js/cjs/runtime/AgentDefinition.js');
    expect(ipcSource).toContain('packages/windie-sdk-js/cjs/runtime/TraceRecorder.js');
    expect(ipcSource).toContain('packages/windie-sdk-js/cjs/conversation/events.js');
    expect(ipcSource).not.toContain('packages/windie-sdk-js/cjs/index.js');
    expect(commandHandlersSource).toContain(
      'packages/windie-sdk-js/cjs/runtime/SdkRuntimeCommands.js',
    );
    expect(commandHandlersSource).not.toContain('packages/windie-sdk-js/cjs/index.js');
    expect(queryBroadcastSource).toContain(
      'packages/windie-sdk-js/cjs/conversation/events.js',
    );
    expect(queryBroadcastSource).not.toContain('packages/windie-sdk-js/cjs/index.js');
  });

  test('ipc.cjs does not call low-level SDK runtime send methods directly', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const directRuntimeSendPattern = /\.(sendBackendMessage|sendQuery|sendWakewordDetected|sendStopQuery|sendUpdateSettings|sendListModels)\s*\(/g;

    expect(source.match(directRuntimeSendPattern) || []).toEqual([]);
  });

  test('renderer window registry construction stays behind the runtime facade', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const rendererWindowsSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_renderer_windows.cjs'),
      'utf8',
    );

    expect(source).toContain('createRendererWindowRuntime({');
    expect(source).not.toContain('createRendererWindowRegistry()');
    expect(source).not.toContain('rendererWindowRegistry');
    expect(rendererWindowsSource).toContain('function createRendererWindowRuntime');
    expect(rendererWindowsSource).toContain('registry = createRendererWindowRegistry()');
    expect(rendererWindowsSource).not.toContain('  createRendererWindowRegistry,');
  });

  test('chat query helper names the connection gate as Agent SDK runtime readiness', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_chat_query_handlers.cjs'),
      'utf8',
    );

    expect(source).toContain('agentRuntimeConnectionReady');
    expect(source).toContain('Failed to connect Agent SDK runtime for query');
    expect(source).not.toContain('backendConnectionReady');
    expect(source).not.toContain('Failed to connect backend for query');
  });

  test('electron main starts the SDK through AgentClient wakeUp directly', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const conversationStatusRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_conversation_status_runtime.cjs'),
      'utf8',
    );
    const workspacePathRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_workspace_path_runtime.cjs'),
      'utf8',
    );
    const chatQueryHandlersSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_chat_query_handlers.cjs'),
      'utf8',
    );
    const artifactHandlersSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_artifact_handlers.cjs'),
      'utf8',
    );
    const rendererDiagnosticsHandlersSource = await fs.readFile(
      path.resolve(
        __dirname,
        '../../src/main/ipc/ipc_renderer_diagnostics_handlers.cjs',
      ),
      'utf8',
    );
    const imageInteractionHandlersSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_image_interaction_handlers.cjs'),
      'utf8',
    );
    const clientSessionHandlersSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_client_session_handlers.cjs'),
      'utf8',
    );
    const extensionMcpHandlersSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_extension_mcp_handlers.cjs'),
      'utf8',
    );
    const desktopUiConfigHandlersSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_desktop_ui_config_handlers.cjs'),
      'utf8',
    );
    const startupStateSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_startup_state.cjs'),
      'utf8',
    );
    const directWakeUpAdapterSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_direct_wake_up_agent_adapter.cjs'),
      'utf8',
    );
    const agentDefinitionContextSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_agent_definition_context.cjs'),
      'utf8',
    );
    const mcpRefreshRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_mcp_refresh_runtime.cjs'),
      'utf8',
    );
    const agentConnectionEventSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_agent_connection_events.cjs'),
      'utf8',
    );
    const agentBackendCloseRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_agent_backend_close_runtime.cjs'),
      'utf8',
    );
    const agentBackendEventRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_agent_backend_event_runtime.cjs'),
      'utf8',
    );
    const activeQueryContextSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_active_query_context.cjs'),
      'utf8',
    );
    const conversationEventProjectionSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_conversation_event_projection.cjs'),
      'utf8',
    );
    const desktopUiConfigStoreSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_desktop_ui_config_store.cjs'),
      'utf8',
    );
    const liveTurnStateSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_live_turn_state.cjs'),
      'utf8',
    );
    const pendingTurnHandlersSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_pending_turn_handlers.cjs'),
      'utf8',
    );
    const electronAgentClientFactorySource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_electron_agent_client_factory.cjs'),
      'utf8',
    );
    const agentClientLifecycleSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_agent_client_lifecycle.cjs'),
      'utf8',
    );
    const runtimeConversationRefSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_runtime_conversation_ref.cjs'),
      'utf8',
    );
    const responseOverlayPhaseRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_response_overlay_phase_runtime.cjs'),
      'utf8',
    );
    const agentWakeupRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_agent_wakeup_runtime.cjs'),
      'utf8',
    );
    const agentRuntimeLifecycleSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_agent_runtime_lifecycle.cjs'),
      'utf8',
    );
    const agentSdkRuntimeCommandsSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_agent_sdk_runtime_commands.cjs'),
      'utf8',
    );
    const backendMessageObserversSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_backend_message_observers.cjs'),
      'utf8',
    );
    const statusPayloadsSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_status_payloads.cjs'),
      'utf8',
    );
    const sessionContextRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_session_context_runtime.cjs'),
      'utf8',
    );
    const hostCopyRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_host_copy_runtime.cjs'),
      'utf8',
    );
    const hostOptionStateSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_host_option_state.cjs'),
      'utf8',
    );
    const initializationRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_initialization_runtime.cjs'),
      'utf8',
    );
    const appDiagnosticsRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_app_diagnostics_runtime.cjs'),
      'utf8',
    );
    const installAuthIdentitySource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_install_auth_identity_runtime.cjs'),
      'utf8',
    );
    const installAuthContextSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_install_auth_context_runtime.cjs'),
      'utf8',
    );
    const backendSessionStateSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_backend_session_state.cjs'),
      'utf8',
    );
    const backendConnectionGateStateSource = await fs.readFile(
      path.resolve(
        __dirname,
        '../../src/main/ipc/ipc_backend_connection_gate_state.cjs',
      ),
      'utf8',
    );
    expect(source).toContain('createElectronAgentClientFactoryRuntime({');
    expect(source).toContain('electronAgentClientFactoryRuntime.createClient()');
    expect(source).not.toContain('new AgentClient({');
    expect(electronAgentClientFactorySource).toContain('function createElectronAgentClientFactoryRuntime');
    expect(electronAgentClientFactorySource).toContain('new AgentClient({');
    expect(electronAgentClientFactorySource).not.toContain('  createElectronAgentClient,');
    expect(electronAgentClientFactorySource).not.toContain('  buildManagedBackendEndpoints,');
    expect(source).not.toContain('function createElectronAgentClient()');
    expect(source).not.toContain('createDesktopAgentClient');
    expect(source).toContain('createAgentWakeupRuntime({');
    expect(source).toContain('agentWakeupRuntime.start({ reason, workspacePath })');
    expect(source).not.toContain('startAgentRuntime({ reason, workspacePath }');
    expect(source).not.toContain('client.wakeUp({');
    expect(agentWakeupRuntimeSource).toContain('function createAgentWakeupRuntime');
    expect(agentWakeupRuntimeSource).not.toContain('  startAgentRuntime,');
    expect(agentWakeupRuntimeSource).toContain('client.wakeUp({');
    expect(source).toContain('createDirectWakeUpAgentAdapter,');
    expect(source).not.toContain('createDirectWakeUpAgentAdapter({');
    expect(agentWakeupRuntimeSource).toContain('createDirectWakeUpAgentAdapter({');
    expect(source).not.toContain('function createDirectWakeUpAgentAdapter');
    expect(source).not.toContain('agent.conversation({');
    expect(source).not.toContain('buildConversationTerminalStatus(event, workspacePath)');
    expect(directWakeUpAdapterSource).toContain('function createDirectWakeUpAgentAdapter');
    expect(directWakeUpAdapterSource).toContain('agent.conversation({');
    expect(directWakeUpAdapterSource).toContain('buildConversationTerminalStatus(event, workspacePath)');
    expect(directWakeUpAdapterSource).toContain('setLatestSdkLiveTurn(snapshot.currentTurn || null)');
    expect(directWakeUpAdapterSource).toContain('setLatestConversationView(snapshot.view || null)');
    expect(directWakeUpAdapterSource).toContain('syncSdkLiveTurnSurfaceIntent(snapshot || null)');
    expect(directWakeUpAdapterSource).toContain('view: snapshot.view || null');
    expect(directWakeUpAdapterSource).toContain('pendingTurnMatchesCurrentTurn(latestPendingTurn, snapshot.currentTurn)');
    expect(source).toContain('createWorkspacePathRuntime({');
    expect(source).toContain('workspacePathRuntime.resolve(payload)');
    expect(source).not.toContain('resolveWorkspacePathForAgentPayload(payload, desktopUiConfigStore.getRawForInternalUse())');
    expect(workspacePathRuntimeSource).toContain('function createWorkspacePathRuntime');
    expect(source).not.toContain('event.payload?.error');
    expect(source).not.toContain('payload?.workspace_path');
    expect(source).not.toContain('payload?.workspacePath');
    expect(conversationStatusRuntimeSource).not.toContain('  resolveConversationStatusError,');
    expect(conversationStatusRuntimeSource).toContain('event.payload?.error');
    expect(workspacePathRuntimeSource).toContain('payload?.workspace_path');
    expect(workspacePathRuntimeSource).toContain('payload?.workspacePath');
    expect(workspacePathRuntimeSource).not.toContain('  normalizeOptionalString,');
    expect(workspacePathRuntimeSource).not.toContain('  resolveWorkspacePathForAgentPayload,');
    expect(source).toContain('createAgentDefinitionContextRuntime({');
    expect(source).toContain('agentDefinitionContextRuntime.attach(payload)');
    expect(agentDefinitionContextSource).toContain('function createAgentDefinitionContextRuntime');
    expect(agentDefinitionContextSource).not.toContain('  attachAgentDefinitionContext,');
    expect(agentDefinitionContextSource).not.toContain('  mergeAgentDefinitionContext,');
    expect(source).toContain('createChatQueryHandlerRuntime({');
    expect(source).toContain('createIpcInitializationRuntime({');
    expect(source).toContain('ipcInitializationRuntime.initialize(win, options)');
    expect(source).not.toContain('chatQueryHandlerRuntime.createHandlers({');
    expect(initializationRuntimeSource).toContain('chatQueryHandlerRuntime.createHandlers({');
    expect(source).not.toContain('createChatQueryHandlers({');
    expect(chatQueryHandlersSource).toContain('function createChatQueryHandlerRuntime');
    expect(chatQueryHandlersSource).toContain('return createChatQueryHandlers({');
    expect(chatQueryHandlersSource).not.toContain(retiredChatQueryHandlersExport);
    expect(source).toContain('createArtifactHandlersRuntime({');
    expect(source).not.toContain('artifactHandlersRuntime.register({ ipcMain })');
    expect(initializationRuntimeSource).toContain('artifactHandlersRuntime.register({ ipcMain })');
    expect(source).not.toContain('registerArtifactHandlers({');
    expect(artifactHandlersSource).toContain('function createArtifactHandlersRuntime');
    expect(artifactHandlersSource).toContain('return registerArtifactHandlers({');
    expect(artifactHandlersSource).not.toContain('  registerArtifactHandlers,');
    expect(source).toContain('createRendererDiagnosticsHandlersRuntime({');
    expect(source).not.toContain('rendererDiagnosticsHandlersRuntime.register({ ipcMain })');
    expect(initializationRuntimeSource).toContain('rendererDiagnosticsHandlersRuntime.register({ ipcMain })');
    expect(source).not.toContain('registerRendererDiagnosticsHandlers({');
    expect(rendererDiagnosticsHandlersSource).toContain(
      'function createRendererDiagnosticsHandlersRuntime',
    );
    expect(rendererDiagnosticsHandlersSource).toContain(
      'return registerRendererDiagnosticsHandlers({',
    );
    expect(rendererDiagnosticsHandlersSource).not.toContain('  registerRendererDiagnosticsHandlers,');
    expect(source).toContain('createImageInteractionHandlersRuntime({');
    expect(source).not.toContain('imageInteractionHandlersRuntime.register({ ipcMain })');
    expect(initializationRuntimeSource).toContain('imageInteractionHandlersRuntime.register({ ipcMain })');
    expect(source).not.toContain('registerImageInteractionHandlers({');
    expect(imageInteractionHandlersSource).toContain('function createImageInteractionHandlersRuntime');
    expect(imageInteractionHandlersSource).toContain('return registerImageInteractionHandlers({');
    expect(imageInteractionHandlersSource).not.toContain('  registerImageInteractionHandlers,');
    expect(source).toContain('createClientSessionHandlersRuntime({');
    expect(source).not.toContain('clientSessionHandlersRuntime.register({ ipcMain })');
    expect(initializationRuntimeSource).toContain('clientSessionHandlersRuntime.register({ ipcMain })');
    expect(source).not.toContain('registerClientSessionHandlers({');
    expect(clientSessionHandlersSource).toContain('function createClientSessionHandlersRuntime');
    expect(clientSessionHandlersSource).toContain('return registerClientSessionHandlers({');
    expect(clientSessionHandlersSource).not.toContain('  registerClientSessionHandlers,');
    expect(clientSessionHandlersSource).not.toContain('  buildClientSessionSnapshot,');
    expect(source).toContain('createExtensionMcpHandlersRuntime({');
    expect(source).not.toContain('extensionMcpHandlersRuntime.register({ ipcMain })');
    expect(initializationRuntimeSource).toContain('extensionMcpHandlersRuntime.register({ ipcMain })');
    expect(source).not.toContain('registerExtensionMcpHandlers({');
    expect(extensionMcpHandlersSource).toContain('function createExtensionMcpHandlersRuntime');
    expect(extensionMcpHandlersSource).toContain('return registerExtensionMcpHandlers({');
    expect(extensionMcpHandlersSource).not.toContain('  registerExtensionMcpHandlers,');
    expect(source).toContain('createDesktopUiConfigHandlersRuntime({');
    expect(source).not.toContain('desktopUiConfigHandlersRuntime.register({ ipcMain })');
    expect(initializationRuntimeSource).toContain('desktopUiConfigHandlersRuntime.register({ ipcMain })');
    expect(source).not.toContain('registerDesktopUiConfigHandlers({');
    expect(desktopUiConfigHandlersSource).toContain('function createDesktopUiConfigHandlersRuntime');
    expect(desktopUiConfigHandlersSource).toContain('return registerDesktopUiConfigHandlers({');
    expect(desktopUiConfigHandlersSource).not.toContain('  registerDesktopUiConfigHandlers,');
    expect(source).toContain('createIpcStartupStateRuntime({');
    expect(source).not.toContain('ipcStartupStateRuntime.initialize()');
    expect(initializationRuntimeSource).toContain('ipcStartupStateRuntime.initialize()');
    expect(source).not.toContain('initializeIpcStartupState({');
    expect(startupStateSource).toContain('function createIpcStartupStateRuntime');
    expect(startupStateSource).toContain('return initializeIpcStartupState({');
    expect(startupStateSource).not.toContain('  initializeIpcStartupState,');
    expect(source).not.toContain('resolveWorkspaceRepoInstructionPromptLayers(workspacePath)');
    expect(source).not.toContain('loadExtensionSkillPromptLayers()');
    expect(agentDefinitionContextSource).toContain('isDefaultAgentDefinition(generatedAgentDefinition)');
    expect(agentDefinitionContextSource).toContain('resolveWorkspaceRepoInstructionPromptLayers(workspacePath)');
    expect(agentDefinitionContextSource).toContain('loadExtensionSkillPromptLayers()');
    expect(agentDefinitionContextSource).toContain('includeExtensionPromptLayers: false');
    expect(source).not.toContain("generatedAgentDefinition.mode === 'windie_default'");
    expect(source).toContain('createIpcHostOptionState()');
    expect(source).toContain('hostOptionState.getLocalToolLifecycle()');
    expect(source).toContain('hostOptionState.getAgentWebSocketImpl()');
    expect(source).not.toContain('let localToolLifecycle = null');
    expect(source).not.toContain('let agentWebSocketImpl = null');
    expect(hostOptionStateSource).toContain('let localToolLifecycle = null;');
    expect(hostOptionStateSource).toContain('let agentWebSocketImpl = null;');
    expect(hostOptionStateSource).not.toContain('  normalizeOptionalFunction,');
    expect(hostOptionStateSource).not.toContain('  normalizeOptionalObject,');
    expect(source).not.toContain('autoLocalRuntime: buildDesktopLocalRuntimeLaunchOptionsForAgent()');
    expect(electronAgentClientFactorySource).toContain('autoLocalRuntime: buildDesktopLocalRuntimeLaunchOptionsForAgent({');
    expect(electronAgentClientFactorySource).not.toContain('  buildDesktopLocalRuntimeLaunchOptionsForAgent,');
    expect(electronAgentClientFactorySource).not.toContain('  buildDesktopLocalRuntimeOptions,');
    expect(electronAgentClientFactorySource).not.toContain('autoSidecar: buildDesktopLocalRuntimeLaunchOptionsForAgent()');
    expect(source).toContain('hostOptionState.getDesktopLocalRuntimeLaunchConfig()');
    expect(source).not.toContain('let desktopLocalRuntimeLaunchConfig = null');
    expect(hostOptionStateSource).toContain('let desktopLocalRuntimeLaunchConfig = null;');
    expect(hostOptionStateSource).not.toContain('  buildDesktopLocalRuntimeLaunchConfig,');
    expect(source).not.toContain('createDesktopLocalRuntimeLaunchPlan');
    expect(electronAgentClientFactorySource).toContain('createDesktopLocalRuntimeLaunchPlan');
    expect(source).not.toContain('buildDesktopAutoSidecarOptionsForAgent');
    expect(source).not.toContain('desktopAutoSidecarLaunchConfig');
    expect(source).not.toContain('createDesktopAutoSidecarLaunchPlan');
    expect(source).toContain("require('../../../packages/windie-sdk-js/cjs/runtime/AgentClient.js')");
    expect(source).toContain("require('../../../packages/windie-sdk-js/cjs/runtime/AgentDefinition.js')");
    expect(source).toContain("require('../../../packages/windie-sdk-js/cjs/runtime/TraceRecorder.js')");
    expect(source).toContain("require('../../../packages/windie-sdk-js/cjs/conversation/events.js')");
    expect(source).not.toContain("require('../../../packages/windie-sdk-js/cjs/index.js')");
    expect(source).not.toContain(`${retiredProductName('Agent')}.startDesktop`);
    expect(source).not.toContain('ensureDaemonBackedLocalRuntime');
    expect(source).not.toContain('ensureLocalRuntime: ensureDaemonBackedLocalRuntime');
    expect(source).not.toMatch(/create\w*AgentHost/);
    expect(source).not.toMatch(/require\(['"].*agent_host\.cjs['"]\)/);
    expect(source).not.toContain(`create${retiredProductName('SdkMainRuntime')}`);
    expect(source).not.toContain('createManagedBackendSession');
    expect(source).not.toContain('createManagedWebSocketSession');
    expect(source).not.toContain('sendSdkRuntimeCommand');
    expect(source).not.toContain('executeLocalTool:');
    expect(source).not.toContain('sendQueryToBackend');
    expect(source).not.toContain('sendStopQueryToBackend');
    expect(source).not.toContain('requestModelListFromBackend');
    expect(source).not.toContain('sendWakewordDetectedToBackend');
    expect(source).toContain('createAgentSdkRuntimeCommandsRuntime({');
    expect(source).toContain('sendQueryThroughAgentSdkRuntime');
    expect(source).toContain('stopQueryThroughAgentSdkRuntime');
    expect(source).toContain('requestModelListThroughAgentSdkRuntime');
    expect(source).toContain('sendWakewordDetectedThroughAgentSdkRuntime');
    expect(source).not.toContain('agent.run({');
    expect(source).not.toContain('agent.stop({');
    expect(source).not.toContain('agent.updateSettings(payload)');
    expect(source).not.toContain('agent.requestModelList()');
    expect(source).not.toContain('agent.wakewordDetected(payload)');
    expect(agentSdkRuntimeCommandsSource).toContain('const queryInput = {');
    expect(agentSdkRuntimeCommandsSource).toContain('await agent.run(queryInput, { model })');
    expect(agentSdkRuntimeCommandsSource).toContain('await agent.run(queryInput)');
    expect(agentSdkRuntimeCommandsSource).toContain(
      'function createAgentSdkRuntimeCommandsRuntime',
    );
    expect(agentSdkRuntimeCommandsSource).not.toContain(
      retiredAgentSdkRuntimeCommandsFactorySignature,
    );
    expect(agentSdkRuntimeCommandsSource).toContain('agent.stop({');
    expect(agentSdkRuntimeCommandsSource).toContain('agent.updateSettings(payload)');
    expect(agentSdkRuntimeCommandsSource).toContain('agent.requestModelList()');
    expect(agentSdkRuntimeCommandsSource).toContain('agent.wakewordDetected(payload)');
    expect(source).toContain('createBackendMessageObserverRegistry({');
    expect(source).not.toContain('const backendMessageObservers = new Set()');
    expect(source).not.toContain('for (const observer of backendMessageObservers)');
    expect(backendMessageObserversSource).toContain('const observers = new Set();');
    expect(backendMessageObserversSource).toContain('for (const observer of observers)');
    expect(source).toContain('createIpcStatusPayloads({');
    expect(source).toContain('createIpcSessionContextRuntime({');
    expect(source).toContain('ipcSessionContextRuntime.getStatusState()');
    expect(source).toContain('ipcSessionContextRuntime.getQueryState()');
    expect(source).toContain('ipcSessionContextRuntime.getAgentSdkInvokeState()');
    expect(source).toContain('ipcSessionContextRuntime.setTranscriptSessionState(state)');
    expect(source).not.toContain('currentUserId: installAuthContextRuntime.getCurrentUserId()');
    expect(source).not.toContain('...backendSessionState.getSnapshot()');
    expect(source).not.toContain('isFirstQuery: backendConnectionGateState.getFirstQuery()');
    expect(sessionContextRuntimeSource).toContain('currentUserId: getCurrentUserId()');
    expect(sessionContextRuntimeSource).toContain('isFirstQuery: Boolean(call(backendConnectionGateState');
    expect(source).toContain('ipcStatusPayloads.broadcastConnectionStatus(connected)');
    expect(source).not.toContain("broadcastToRenderers('ipc-status'");
    expect(source).not.toContain('function buildIpcStatusPayload(connected)');
    expect(source).not.toContain('backendWsUrl: backendEndpointState.getWsUrl()');
    expect(source).not.toContain('globalAgentStopShortcutStatus: getGlobalAgentStopShortcutStatus()');
    expect(statusPayloadsSource).toContain("statusChannel = 'ipc-status'");
    expect(statusPayloadsSource).toContain('broadcastToRenderers(statusChannel, buildIpcStatusPayload(connected))');
    expect(statusPayloadsSource).toContain('backendWsUrl: endpoints.runtimeWsUrl || null');
    expect(statusPayloadsSource).toContain('runtimeWsUrl: endpoints.runtimeWsUrl || null');
    expect(source).toContain('createIpcHostCopyRuntime()');
    expect(source).toContain('ipcHostCopyRuntime.getSdkAgentName()');
    expect(source).toContain('ipcHostCopyRuntime.getMcpClientInfo()');
    expect(source).toContain('ipcHostCopyRuntime.getQueryEvents()');
    expect(source).not.toContain('const DEFAULT_IPC_HOST_COPY = Object.freeze');
    expect(source).not.toContain('ipcHostCopy.identity');
    expect(source).not.toContain('ipcHostCopy.queryEvents');
    expect(hostCopyRuntimeSource).toContain('const DEFAULT_IPC_HOST_COPY = Object.freeze');
    expect(source).toContain('createIpcAppDiagnosticsRuntime({');
    expect(source).toContain('ipcAppDiagnosticsRuntime.appendAppDiagnostic(input)');
    expect(source).not.toContain('[AppDiagnostics] failed to persist');
    expect(appDiagnosticsRuntimeSource).toContain('[AppDiagnostics] failed to persist');
    expect(source).toContain('createInstallAuthContextRuntime({');
    expect(source).toContain('installAuthContextRuntime.ensureInstallAuthState()');
    expect(source).toContain('installAuthContextRuntime.buildDesktopInstallAuth()');
    expect(source).toContain('installAuthContextRuntime.buildInstallAuthHeaders()');
    expect(source).not.toContain('createInstallAuthIdentityRuntime({');
    expect(source).not.toContain('createInstallAuthRuntime({');
    expect(source).not.toContain('installAuthIdentityRuntime');
    expect(source).not.toContain('installAuthRuntime');
    expect(source).not.toContain('const installToken = typeof state.installToken');
    expect(source).not.toContain('let currentUserId = null');
    expect(source).not.toContain('let currentInstallId = null');
    expect(source).not.toContain('let currentInstallToken = null');
    expect(source).not.toContain('autoRegister: false');
    expect(installAuthContextSource).toContain('createInstallAuthIdentityRuntime({');
    expect(installAuthContextSource).toContain('createInstallAuthRuntime({');
    expect(installAuthIdentitySource).toContain('const installToken = typeof state.installToken');
    expect(installAuthIdentitySource).toContain('let currentInstallToken = initialState.currentInstallToken');
    expect(installAuthIdentitySource).toContain('let currentUserId = initialState.currentUserId');
    expect(installAuthIdentitySource).toContain('let currentInstallId = initialState.currentInstallId');
    expect(installAuthIdentitySource).toContain('autoRegister: false');
    expect(installAuthIdentitySource).not.toContain('  normalizeInstallAuthState,');
    const wakeCall = agentWakeupRuntimeSource.match(/client\.wakeUp\(\{[\s\S]*?\n  \}\);/)?.[0] || '';
    expect(wakeCall).toContain('installAuth: buildDesktopInstallAuth()');
    expect(wakeCall).toContain('name: getSdkAgentName()');
    expect(wakeCall).toContain('workspacePath: resolvedWorkspacePath');
    expect(wakeCall).toContain("builtins: testMode ? [] : 'default'");
    expect(wakeCall).toContain('mcps: testMode');
    expect(wakeCall).toContain('getEnabledMcpServerSpecsForConfig({ config: getDesktopUiConfigForMcpRegistry() })');
    expect(wakeCall).toContain('localToolLifecycle: getLocalToolLifecycle()');
    expect(wakeCall).not.toContain('conversationRef:');
    expect(source).toContain('onDesktopUiConfigLoaded: refreshEnabledMcpServersAfterStartup');
    expect(source).toContain('createMcpRefreshRuntime({');
    expect(source).not.toContain("refreshMcpServersForLatestConfig('mcp-startup')");
    expect(mcpRefreshRuntimeSource).toContain("refreshMcpServersForLatestConfig('mcp-startup')");
    expect(source).not.toContain('[Main][SDK] client_initialized');
    expect(source).toContain('createAgentClientLifecycleRuntime({');
    expect(source).not.toContain('let agentClient = null');
    expect(source).not.toContain('agentClient = createElectronAgentClient()');
    expect(agentClientLifecycleSource).toContain('function createAgentClientLifecycleRuntime');
    expect(agentClientLifecycleSource).not.toContain(
      retiredAgentClientLifecycleFactorySignature,
    );
    expect(agentClientLifecycleSource).toContain('let agentClient = null;');
    expect(agentClientLifecycleSource).toContain('agentClient = createAgentClient();');
    expect(agentClientLifecycleSource).toContain('[Main][SDK] client_initialized');
    expect(source).toContain('createRuntimeConversationRefRuntime({');
    expect(source).toContain('runtimeConversationRefRuntime.resolve(input)');
    expect(source).not.toContain(
      'resolveRuntimeConversationRefValue(input, backendSessionState.getConversationRef())',
    );
    expect(source).not.toContain('const fromPayload = payload && typeof payload ===');
    expect(runtimeConversationRefSource).toContain('payload.conversation_ref');
    expect(runtimeConversationRefSource).toContain('function createRuntimeConversationRefRuntime');
    expect(runtimeConversationRefSource).toContain('input.conversation_ref || input.conversationRef');
    expect(runtimeConversationRefSource).not.toContain('  normalizeOptionalString,');
    expect(runtimeConversationRefSource).not.toContain('  resolveRuntimeConversationRef,');
    expect(source).toContain('createBackendSessionState()');
    expect(source).not.toContain('let currentSessionId = null');
    expect(source).not.toContain('let currentServerUserId = null');
    expect(source).not.toContain('let currentConversationRef = null');
    expect(backendSessionStateSource).toContain('let currentSessionId = initialSessionId;');
    expect(backendSessionStateSource).toContain('let currentServerUserId = initialServerUserId;');
    expect(backendSessionStateSource).toContain('let currentConversationRef = initialConversationRef;');
    expect(source).toContain('createBackendConnectionGateState()');
    expect(source).not.toContain('let isConnected = false');
    expect(source).not.toContain('let isFirstQuery = true');
    expect(backendConnectionGateStateSource).toContain('let isConnected = initialConnected;');
    expect(backendConnectionGateStateSource).toContain('let isFirstQuery = initialFirstQuery;');
    expect(source).toContain('createResponseOverlayPhaseRuntime({');
    expect(source).toContain('responseOverlayPhaseRuntime.setResponseOverlayPhase(phase, source, metadata)');
    expect(source).not.toContain("action: 'set-phase'");
    expect(responseOverlayPhaseRuntimeSource).toContain("action: 'set-phase'");
    expect(responseOverlayPhaseRuntimeSource).toContain('isAgentLoopStopShortcutPhase(getPhase())');
    expect(source).not.toContain('[Main][SDK] creating_client backend=');
    expect(electronAgentClientFactorySource).toContain('[Main][SDK] creating_client backend=');
    expect(source).toContain('createAgentRuntimeLifecycleRuntime({');
    expect(source).not.toContain('let activeAgent');
    expect(source).not.toContain('let pendingAgentStartPromise');
    expect(source).not.toContain('pendingAgentStartPromise = startAgent({');
    expect(agentRuntimeLifecycleSource).toContain('function createAgentRuntimeLifecycleRuntime');
    expect(agentRuntimeLifecycleSource).not.toContain(
      retiredAgentRuntimeLifecycleFactorySignature,
    );
    expect(agentRuntimeLifecycleSource).toContain('let activeAgent = null;');
    expect(agentRuntimeLifecycleSource).toContain('let pendingAgentStartPromise = null;');
    expect(agentRuntimeLifecycleSource).toContain('pendingAgentStartPromise = startAgent({');
    expect(source).not.toContain('[Main][SDK] local_runtime_ensure_start reason=');
    expect(source).not.toContain('[Main][SDK] local_runtime_ready reason=');
    expect(source).toContain('agentRuntimeLifecycle.ensureCurrentBackendConnection(reason, timeoutMs)');
    expect(source).not.toContain('agentRuntimeLifecycle.ensureBackendConnection({');
    expect(source).not.toContain('conversationRef: backendSessionState.getConversationRef()');
    expect(source).not.toContain('agent.ensureConnected({');
    expect(agentRuntimeLifecycleSource).toContain('function ensureCurrentBackendConnection');
    expect(agentRuntimeLifecycleSource).toContain('conversationRef: getCurrentConversationRef()');
    expect(agentRuntimeLifecycleSource).toContain('agent.ensureConnected({');
    expect(agentRuntimeLifecycleSource).toContain('[Main][SDK] local_runtime_ensure_start reason=');
    expect(agentRuntimeLifecycleSource).toContain('[Main][SDK] local_runtime_ready reason=');
    expect(source).toContain('createAgentConnectionEventsRuntime({');
    expect(source).toContain('agentConnectionEventsRuntime.handleConnection(event)');
    expect(source).toContain('agentConnectionEventsRuntime.handleBackendFallback(endpointPayload)');
    expect(source).not.toContain('[Main][Backend] connected user=');
    expect(source).not.toContain("event.type === 'open'");
    expect(agentConnectionEventSource).toContain('[Main][Backend] connected user=');
    expect(agentConnectionEventSource).toContain("event.type === 'open'");
    expect(agentConnectionEventSource).not.toContain('  handleAgentConnectionEvent,');
    expect(agentConnectionEventSource).not.toContain('  handleAgentBackendFallbackEvent,');
    expect(source).toContain('createAgentBackendCloseRuntime({');
    expect(source).toContain('agentBackendCloseRuntime.handle({ closeReason, shouldReconnect })');
    expect(source).not.toContain('handleAgentBackendCloseEvent({ closeReason, shouldReconnect }');
    expect(source).not.toContain('Active query interrupted by backend disconnect');
    expect(agentBackendCloseRuntimeSource).toContain('function createAgentBackendCloseRuntime');
    expect(agentBackendCloseRuntimeSource).not.toContain('  handleAgentBackendCloseEvent,');
    expect(agentBackendCloseRuntimeSource).toContain('Active query interrupted by backend disconnect');
    expect(source).toContain('createAgentBackendEventRuntime({');
    expect(source).toContain('agentBackendEventRuntime.handle(rendererData)');
    expect(source).not.toContain('handleAgentBackendEventRuntime(rendererData');
    expect(source).not.toContain("rendererData.type === 'query-accepted'");
    expect(source).not.toContain("rendererData.type === 'streaming-complete'");
    expect(agentBackendEventRuntimeSource).toContain('function createAgentBackendEventRuntime');
    expect(agentBackendEventRuntimeSource).not.toContain('  handleAgentBackendEventRuntime,');
    expect(agentBackendEventRuntimeSource).toContain("event.type === 'query-accepted'");
    expect(agentBackendEventRuntimeSource).toContain("event.type === 'streaming-complete'");
    expect(source).toContain('createActiveQueryContextState()');
    expect(source).toContain('activeQueryContextState.get()');
    expect(source).toContain('activeQueryContextState.set(');
    expect(source).not.toContain('let activeQueryContext = null');
    expect(source).not.toContain('activeQueryContext =');
    expect(activeQueryContextSource).toContain('let activeQueryContext = initialContext;');
    expect(source).toContain('createDesktopUiConfigStoreRuntime({');
    expect(source).toContain('desktopUiConfigStore.getSnapshot()');
    expect(source).toContain('desktopUiConfigStore.persist(config, options)');
    expect(source).not.toContain('createDesktopUiConfigCache');
    expect(source).not.toContain('createDesktopUiConfigPersistenceRuntime');
    expect(source).not.toContain('let latestDesktopUiConfig = null');
    expect(source).not.toContain('latestDesktopUiConfig = config');
    expect(desktopUiConfigStoreSource).toContain('let currentConfig = null;');
    expect(desktopUiConfigStoreSource).toContain('function createDesktopUiConfigStoreRuntime');
    expect(source).toContain('createIpcLiveTurnState()');
    expect(source).toContain('liveTurnState.getLatestCurrentTurn()');
    expect(source).toContain('liveTurnState.setLatestCurrentTurn(');
    expect(source).toContain('getLatestConversationView: () => liveTurnState.getLatestConversationView()');
    expect(source).toContain('liveTurnState.getLatestConversationView()');
    expect(source).toContain('liveTurnState.setLatestConversationView(');
    expect(source).toContain('liveTurnState.getLatestPendingTurn()');
    expect(source).toContain('createPendingTurnRuntime({');
    expect(source).toContain('pendingTurnMatchesCurrentTurn: pendingTurnRuntime.matchesCurrentTurn');
    expect(source).toContain('pendingTurnRuntime.clear(input)');
    expect(source).not.toContain('pendingTurnRuntime.register({ ipcMain })');
    expect(initializationRuntimeSource).toContain('pendingTurnRuntime.register({ ipcMain })');
    expect(source).not.toContain('liveTurnState.setLatestPendingTurn(');
    expect(pendingTurnHandlersSource).toContain('function createPendingTurnRuntime');
    expect(pendingTurnHandlersSource).toContain('liveTurnState.setLatestPendingTurn(pendingTurn)');
    expect(pendingTurnHandlersSource).not.toContain('  registerPendingTurnHandlers,');
    expect(pendingTurnHandlersSource).not.toContain('  normalizePendingTurnPayload,');
    expect(pendingTurnHandlersSource).not.toContain('  pendingTurnMatchesCurrentTurn,');
    expect(source).not.toContain('let latestSdkLiveTurn = null');
    expect(source).not.toContain('let latestPendingTurn = null');
    expect(source).not.toContain('latestCurrentTurnProjection');
    expect(source).not.toContain('currentTurnProjection');
    expect(source).not.toContain('latestPendingTurn = pendingTurn');
    expect(liveTurnStateSource).toContain('let latestSdkLiveTurn = initialSdkLiveTurn;');
    expect(liveTurnStateSource).toContain('let latestConversationView = initialConversationView;');
    expect(liveTurnStateSource).toContain('let latestPendingTurn = initialPendingTurn;');
    expect(source).toContain('createConversationEventProjectionRuntime({');
    expect(source).toContain('conversationEventProjectionRuntime.build(event)');
    expect(source).not.toContain('buildConversationEventFromBackendEvent(event');
    expect(source).not.toContain('normalizeBackendEventToConversationEvent');
    expect(conversationEventProjectionSource).toContain('normalizeBackendEventToConversationEvent');
    expect(conversationEventProjectionSource).toContain('fallbackConversationRef: options.fallbackConversationRef');
    expect(source).not.toContain("action: 'runtime.wakeup'");
    expect(agentWakeupRuntimeSource).toContain("action: 'runtime.wakeup'");
    expect(source).not.toContain(`${retiredProductPrefix} SDK runtime`);
    expect(source).not.toContain(`${retiredProductName('Client')} wakeUp runtime started`);
    expect(source).not.toContain(`Failed to send query through ${retiredProductName('Agent')}`);
  });

  test('local runtime status IPC uses shared generic channel constants in main bridge code', async () => {
    const bridgeSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/sidecar/local_runtime_bridge.cjs'),
      'utf8',
    );
    const broadcasterSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/sidecar/local_runtime_status_broadcaster.cjs'),
      'utf8',
    );
    const channelSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_desktop_runtime_channels.cjs'),
      'utf8',
    );
    const legacyInvokeChannel = ['get-local', 'backend-status'].join('-');
    const legacyStatusChannel = ['local', 'backend-status'].join('-');

    expect(channelSource).toContain('GET_LOCAL_RUNTIME_STATUS: IPC_CHANNELS.INVOKE_CHANNELS.GET_LOCAL_RUNTIME_STATUS');
    expect(channelSource).toContain('LOCAL_RUNTIME_STATUS: IPC_CHANNELS.ON_CHANNELS.LOCAL_RUNTIME_STATUS');
    expect(bridgeSource).toContain('DESKTOP_RUNTIME_INVOKE_CHANNELS.GET_LOCAL_RUNTIME_STATUS');
    expect(broadcasterSource).toContain('DESKTOP_RUNTIME_ON_CHANNELS.LOCAL_RUNTIME_STATUS');
    expect(bridgeSource).not.toContain(`ipcMain.handle('${legacyInvokeChannel}'`);
    expect(broadcasterSource).not.toContain(`webContents.send('${legacyStatusChannel}'`);
  });

  test('electron main exposes SDK-shaped user commands through a strict invoke allowlist', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const source = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_agent_sdk_command_handlers.cjs'),
      'utf8',
    );
    const metadataDiagnosticsSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_conversation_metadata_diagnostics_runtime.cjs'),
      'utf8',
    );
    const initializationRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_initialization_runtime.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('DESKTOP_RUNTIME_INVOKE_CHANNELS');
    expect(mainSource).toContain('createAgentSdkInvokeHandlerRuntime({');
    expect(mainSource).not.toContain('agentSdkInvokeHandlerRuntime.register({');
    expect(initializationRuntimeSource).toContain('agentSdkInvokeHandlerRuntime.register({');
    expect(mainSource).toContain('invokeChannel: DESKTOP_RUNTIME_INVOKE_CHANNELS.INVOKE');
    expect(mainSource).not.toContain('registerAgentSdkInvokeHandler({');
    expect(mainSource).not.toContain('ipcMain.handle(DESKTOP_RUNTIME_INVOKE_CHANNELS.INVOKE');
    expect(source).toContain('function createAgentSdkInvokeHandlerRuntime');
    expect(source).toContain('function registerAgentSdkInvokeHandler');
    expect(source).not.toContain(retiredAgentSdkInvokeHandlerExport);
    expect(source).not.toContain(retiredAgentSdkInvokeRegistrationExport);
    expect(source).toContain('handleInvoke(event, payload');
    expect(mainSource).toContain('ensureAgent,');
    expect(mainSource).not.toContain(`ensureAgent: ensure${retiredProductName('Agent')}`);
    expect(mainSource).not.toContain(`getKnown${retiredProductName('LocalRuntime')}`);
    expect(mainSource).not.toContain(`ensure${retiredProductName('LocalRuntime')}`);
    expect(mainSource).not.toContain('function buildAgentSdkCommandHandlers');
    expect(source).toContain('buildAgentSdkCommandHandlers');
    expect(source).toContain('SDK_RUNTIME_COMMANDS');
    expect(source).toContain('[SDK_RUNTIME_COMMANDS.MEMORIES_LIST]');
    expect(source).toContain('[SDK_RUNTIME_COMMANDS.MEMORIES_DELETE]');
    expect(source).toContain('[SDK_RUNTIME_COMMANDS.MEMORIES_CLEAR_ALL]');
    expect(source).toContain('[SDK_RUNTIME_COMMANDS.CONVERSATIONS_LIST]');
    expect(source).toContain('ipc_conversation_metadata_diagnostics_runtime');
    expect(source).toContain('createConversationMetadataDiagnosticsRuntime');
    expect(source).toContain('conversationMetadataDiagnosticsRuntime.createContext');
    expect(source).toContain('conversationMetadataDiagnosticsRuntime.record');
    expect(source).not.toContain('function normalizeAppDiagnosticContext');
    expect(source).not.toContain('function recordConversationMetadataListDiagnostic');
    expect(metadataDiagnosticsSource).toContain('normalizeAppDiagnosticContext');
    expect(metadataDiagnosticsSource).toContain('recordConversationMetadataListDiagnostic');
    expect(metadataDiagnosticsSource).toContain('function createConversationMetadataDiagnosticsRuntime');
    expect(metadataDiagnosticsSource).not.toContain('  normalizeAppDiagnosticContext,');
    expect(metadataDiagnosticsSource).not.toContain('  recordConversationMetadataListDiagnostic,');
    expect(source).toContain('[SDK_RUNTIME_COMMANDS.CONVERSATIONS_SEARCH]');
    expect(source).toContain('[SDK_RUNTIME_COMMANDS.CONVERSATIONS_DELETE]');
    expect(source).toContain('[SDK_RUNTIME_COMMANDS.CONVERSATIONS_CLEAR_ALL]');
    expect(source).toContain('[SDK_RUNTIME_COMMANDS.DIAGNOSTICS_APPEND]');
    expect(source).toContain('[SDK_RUNTIME_COMMANDS.CONVERSATION_SEND]');
    expect(source).toContain('[SDK_RUNTIME_COMMANDS.CONVERSATION_STOP]');
    expect(source).toContain('[SDK_RUNTIME_COMMANDS.CONVERSATION_REHYDRATE]');
    expect(source).toContain('[SDK_RUNTIME_COMMANDS.CONVERSATION_COMPACT]');
    expect(source).not.toContain('[SDK_RUNTIME_COMMANDS.CONVERSATION_REWRITE]');
    expect(source).not.toContain('[SDK_RUNTIME_COMMANDS.CONVERSATION_PREPARE_EDIT_AND_RESEND]');
    expect(source).not.toContain('[SDK_RUNTIME_COMMANDS.CONVERSATION_PREPARE_RETRY_TURN]');
    expect(source).toContain('[SDK_RUNTIME_COMMANDS.SETTINGS_UPDATE]');
    expect(source).toContain("'agent-sdk-command'");
    expect(source).not.toContain("'renderer-sdk-command'");
    expect(source).toContain('[SDK_RUNTIME_COMMANDS.MODELS_LIST]');
    expect(source).toContain('[SDK_RUNTIME_COMMANDS.WAKEWORD_DETECTED]');
    expect(source).toContain('localRuntimeReady: true');
    expect(source).toContain('localRuntimeReady: Boolean(deps.getState().agent)');
    expect(source).not.toContain('sidecarReady:');
    expect(source).toContain('agent.listMemories(');
    expect(source).toContain('agent.deleteMemory(');
    expect(source).toContain('agent.clearMemories(');
    expect(source).toContain('agent.clearConversations(');
    expect(source).not.toContain('runtimeRegistry.prepareEditAndResend(');
    expect(source).not.toContain('runtimeRegistry.prepareRetryTurn(');
    expect(source).not.toContain('runtimeRegistry.rewriteConversation(');
    expect(source).not.toContain('agent.prepareEditAndResend(');
    expect(source).not.toContain('agent.prepareRetryTurn(');
    expect(source).toContain('requireCommandUserId');
    expect(source).toContain('requireAuthenticatedCommandUserId');
    expect(source).toContain("userId === 'default_user'");
    expect(mainSource).not.toContain('handleAgentSdkInvoke(event, payload, { method');
    const sdkCommandModule = require('../../src/main/ipc/ipc_agent_sdk_command_handlers.cjs');
    expect(sdkCommandModule.buildAgentSdkCommandHandlers).toBeUndefined();
    expect(typeof sdkCommandModule.createAgentSdkInvokeHandlerRuntime).toBe('function');
    expect(sdkCommandModule.handleAgentSdkInvoke).toBeUndefined();
    expect(sdkCommandModule.registerAgentSdkInvokeHandler).toBeUndefined();

    const memoryHandlers = source.match(/MEMORIES_LIST[\s\S]*?CONVERSATIONS_LIST/)?.[0] || '';
    expect(memoryHandlers).toContain('requireAuthenticatedCommandUserId(deps.getState().currentUserId);');
    expect(memoryHandlers).not.toContain('userId: requireAuthenticatedCommandUserId()');
    expect(memoryHandlers).not.toContain('requireCommandUserId(payload)');
  });

  test('SDK invoke registration forwards payloads through the strict command handler', async () => {
    const handleInvoke = jest.fn(async () => ({ ok: true, data: 'done' }));
    const deps = {
      getState: jest.fn(() => ({ currentUserId: 'user-1' })),
    };
    const handleRendererChatQuery = jest.fn();
    const handleRendererStopQuery = jest.fn();

    const runtime = createAgentSdkInvokeTestRuntime({
      handleRendererChatQuery,
      handleRendererStopQuery,
      deps,
      handleInvoke,
    });

    await expect(runtime.invoke({ sender: 'renderer' }, {
      command: 'models.list',
      payload: { userId: 'user-1' },
    })).resolves.toEqual({ ok: true, data: 'done' });

    expect(handleInvoke).toHaveBeenCalledWith(
      { sender: 'renderer' },
      {
        command: 'models.list',
        payload: { userId: 'user-1' },
      },
      {
        handleRendererChatQuery,
        handleRendererStopQuery,
        deps,
      },
    );
  });

  test('SDK invoke runtime wrapper composes registration dependencies once', async () => {
    const {
      createAgentSdkInvokeHandlerRuntime,
    } = require('../../src/main/ipc/ipc_agent_sdk_command_handlers.cjs');
    const handlers = {};
    const ipcMain = {
      handle: jest.fn((channel, handler) => {
        handlers[channel] = handler;
      }),
    };
    const handleInvoke = jest.fn(async () => ({ ok: true, data: 'done' }));
    const deps = {
      getState: jest.fn(() => ({ currentUserId: 'user-1' })),
    };
    const handleRendererChatQuery = jest.fn();
    const handleRendererStopQuery = jest.fn();
    const runtime = createAgentSdkInvokeHandlerRuntime({
      invokeChannel: 'windie:invoke',
      deps,
      handleInvoke,
    });

    runtime.register({
      ipcMain,
      handleRendererChatQuery,
      handleRendererStopQuery,
    });

    await expect(handlers['windie:invoke']({ sender: 'renderer' }, {
      command: 'models.list',
      payload: { userId: 'user-1' },
    })).resolves.toEqual({ ok: true, data: 'done' });

    expect(ipcMain.handle).toHaveBeenCalledWith('windie:invoke', expect.any(Function));
    expect(handleInvoke).toHaveBeenCalledWith(
      { sender: 'renderer' },
      {
        command: 'models.list',
        payload: { userId: 'user-1' },
      },
      {
        handleRendererChatQuery,
        handleRendererStopQuery,
        deps,
      },
    );
  });

  test('electron main rejects removed user_id SDK command alias', async () => {
    const ensureAgent = jest.fn(async () => ({
      listConversations: jest.fn(async () => []),
    }));
    const appendAppDiagnostic = jest.fn(input => input);

    const result = await invokeAgentSdkCommand(
      {
        command: 'conversations.list',
        payload: {
          user_id: 'user-1',
          limit: 5,
        },
      },
      {
        deps: {
          ensureAgent,
          appendAppDiagnostic,
          getState: () => ({
            currentUserId: 'user-1',
            isConnected: true,
            agent: true,
          }),
        },
      },
    );

    expect(result).toEqual({
      ok: false,
      error: 'Agent SDK command requires an active user id.',
    });
    expect(ensureAgent).not.toHaveBeenCalled();
    expect(appendAppDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      stage: 'ipc_received',
      data: expect.objectContaining({
        hasUserId: false,
      }),
    }));
  });

  test('electron main returns ConversationView instead of legacy displayRows in loadDisplay payloads', async () => {
    const loadConversation = jest.fn(async () => ({
      display: { messages: [] },
      view: {
        conversationRef: 'conv-1',
        displayRows: [
          {
            id: 'row-view',
            conversationRef: 'conv-1',
            role: 'assistant',
            type: 'assistant_message',
            content: 'from view',
          },
        ],
        liveTurn: {
          turnRef: null,
          phase: 'idle',
          entries: [],
          isBusy: false,
          isTerminal: true,
          canStop: false,
          lastError: null,
        },
        surfaces: {
          pill: { mode: 'idle' },
          dashboard: { mode: 'idle' },
          responseOverlay: {
            mode: 'hidden',
            visible: false,
            guardRef: null,
            ownerConversationRef: 'conv-1',
            turnRef: null,
          },
        },
        actions: {
          canEdit: false,
          canRetry: false,
          canFork: false,
        },
      },
      displayRows: [
        {
          id: 'row-legacy',
          conversationRef: 'conv-1',
          role: 'assistant',
          type: 'assistant_message',
          content: 'legacy',
        },
      ],
      currentTurn: null,
    }));
    const ensureAgent = jest.fn(async () => ({
      loadConversation,
    }));
    const appendAppDiagnostic = jest.fn(input => input);

    const result = await invokeAgentSdkCommand(
      {
        command: 'conversation.loadDisplay',
        payload: {
          userId: 'user-1',
          conversationRef: 'conv-1',
        },
      },
      {
        deps: {
          ensureAgent,
          appendAppDiagnostic,
          getState: () => ({
            currentUserId: 'user-1',
            isConnected: true,
            agent: true,
          }),
        },
      },
    );

    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({
        view: expect.objectContaining({
          displayRows: [
            expect.objectContaining({
              id: 'row-view',
            }),
          ],
        }),
        currentTurn: null,
      }),
    });
    expect(result.data).not.toHaveProperty('displayRows');
    expect(loadConversation).toHaveBeenCalledWith({
      conversationRef: 'conv-1',
    });
  });

  test('electron main rejects removed conversation_ref SDK command alias', async () => {
    const ensureAgent = jest.fn(async () => ({
      loadConversation: jest.fn(async () => ({
        display: { messages: [] },
        displayRows: [],
        currentTurn: null,
      })),
    }));
    const appendAppDiagnostic = jest.fn(input => input);

    const result = await invokeAgentSdkCommand(
      {
        command: 'conversation.loadDisplay',
        payload: {
          userId: 'user-1',
          conversation_ref: 'conv-1',
        },
      },
      {
        deps: {
          ensureAgent,
          appendAppDiagnostic,
          getState: () => ({
            currentUserId: 'user-1',
            isConnected: true,
            agent: true,
          }),
        },
      },
    );

    expect(result).toEqual({
      ok: false,
      error: 'Agent SDK command requires conversationRef; conversation_ref is not supported.',
    });
    expect(ensureAgent).not.toHaveBeenCalled();
  });

  test('electron main keeps rehydrate and compact on backend transport conversation_ref', async () => {
    const rehydrateMessages = jest.fn(async () => ({ rehydrated: true }));
    const compactHistory = jest.fn(async () => 'turn-compact');
    const ensureAgent = jest.fn(async () => ({
      rehydrateMessages,
      compactHistory,
    }));
    const deps = {
      ensureAgent,
      appendAppDiagnostic: jest.fn(input => input),
      resolveWorkspacePathForAgent: jest.fn(() => '/repo'),
      getState: () => ({
        currentUserId: 'user-1',
        isConnected: true,
        agent: true,
      }),
    };

    await expect(invokeAgentSdkCommand(
      {
        command: 'conversation.rehydrate',
        payload: {
          conversation_ref: 'conv-transport',
          messages: [{ role: 'user', content: 'hello' }],
          rehydrate_mode: 'replace',
          workspace_path: '/repo',
        },
      },
      { deps },
    )).resolves.toEqual({
      ok: true,
      data: { rehydrated: true },
    });
    await expect(invokeAgentSdkCommand(
      {
        command: 'conversation.compact',
        payload: {
          conversation_ref: 'conv-transport',
          force: false,
        },
      },
      { deps },
    )).resolves.toEqual({
      ok: true,
      data: 'turn-compact',
    });

    expect(ensureAgent).toHaveBeenNthCalledWith(1, {
      reason: 'sdk-command:conversation.rehydrate',
      conversationRef: 'conv-transport',
      workspacePath: '/repo',
    });
    expect(ensureAgent).toHaveBeenNthCalledWith(2, {
      reason: 'sdk-command:conversation.compact',
      conversationRef: 'conv-transport',
    });
    expect(rehydrateMessages).toHaveBeenCalledWith(expect.objectContaining({
      conversation_ref: 'conv-transport',
      workspace_path: '/repo',
    }));
    expect(compactHistory).toHaveBeenCalledWith(expect.objectContaining({
      conversation_ref: 'conv-transport',
      force: false,
    }));
  });

  test('electron main rejects removed camelCase conversation refs on transport commands', async () => {
    const ensureAgent = jest.fn(async () => ({
      rehydrateMessages: jest.fn(async () => ({})),
      compactHistory: jest.fn(async () => 'turn-compact'),
    }));
    const deps = {
      ensureAgent,
      appendAppDiagnostic: jest.fn(input => input),
      resolveWorkspacePathForAgent: jest.fn(() => '/repo'),
      getState: () => ({
        currentUserId: 'user-1',
        isConnected: true,
        agent: true,
      }),
    };

    await expect(invokeAgentSdkCommand(
      {
        command: 'conversation.rehydrate',
        payload: {
          conversationRef: 'conv-camel',
          messages: [],
        },
      },
      { deps },
    )).resolves.toEqual({
      ok: false,
      error: 'Agent runtime transport command requires conversation_ref; conversationRef is not supported.',
    });
    await expect(invokeAgentSdkCommand(
      {
        command: 'conversation.compact',
        payload: {
          conversationRef: 'conv-camel',
        },
      },
      { deps },
    )).resolves.toEqual({
      ok: false,
      error: 'Agent runtime transport command requires conversation_ref; conversationRef is not supported.',
    });
    expect(ensureAgent).not.toHaveBeenCalled();
  });

});
