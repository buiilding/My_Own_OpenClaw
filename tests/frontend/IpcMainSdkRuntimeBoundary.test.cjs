/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');

describe('main ipc sdk runtime boundary', () => {
  test('ipc.cjs does not call low-level SDK runtime send methods directly', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc.cjs'),
      'utf8',
    );
    const directRuntimeSendPattern = /\.(sendBackendMessage|sendQuery|sendWakewordDetected|sendStopQuery|sendUpdateSettings|sendListModels)\s*\(/g;

    expect(source.match(directRuntimeSendPattern) || []).toEqual([]);
  });

  test('electron main starts the SDK through AgentClient wakeUp directly', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc.cjs'),
      'utf8',
    );
    expect(source).toContain('new AgentClient({');
    expect(source).toContain('client.wakeUp({');
    expect(source).toContain('agent.conversation({');
    expect(source).toContain('isDefaultAgentDefinition(generatedAgentDefinition)');
    expect(source).not.toContain("generatedAgentDefinition.mode === 'windie_default'");
    expect(source).toContain('localToolLifecycle');
    expect(source).toContain('agentWebSocketImpl');
    expect(source).toContain('autoSidecar: buildDesktopLocalRuntimeLaunchOptionsForAgent()');
    expect(source).toContain('desktopLocalRuntimeLaunchConfig');
    expect(source).toContain('createDesktopLocalRuntimeLaunchPlan');
    expect(source).not.toContain('buildDesktopAutoSidecarOptionsForAgent');
    expect(source).not.toContain('desktopAutoSidecarLaunchConfig');
    expect(source).not.toContain('createDesktopAutoSidecarLaunchPlan');
    expect(source).toContain("require('../../../packages/windie-sdk-js/cjs/index.js')");
    expect(source).not.toContain('WindieAgent.startDesktop');
    expect(source).not.toContain('ensureDaemonBackedLocalRuntime');
    expect(source).not.toContain('ensureLocalRuntime: ensureDaemonBackedLocalRuntime');
    expect(source).not.toMatch(/create\w*AgentHost/);
    expect(source).not.toMatch(/require\(['"].*agent_host\.cjs['"]\)/);
    expect(source).not.toContain('createWindieSdkMainRuntime');
    expect(source).not.toContain('createManagedBackendSession');
    expect(source).not.toContain('sendSdkRuntimeCommand');
    expect(source).not.toContain('executeLocalTool:');
    expect(source).not.toContain('sendQueryToBackend');
    expect(source).not.toContain('sendStopQueryToBackend');
    expect(source).not.toContain('requestModelListFromBackend');
    expect(source).not.toContain('sendWakewordDetectedToBackend');
    expect(source).toContain('sendQueryThroughSdkAgent');
    expect(source).toContain('stopQueryThroughSdkAgent');
    expect(source).toContain('requestModelListThroughSdkAgent');
    expect(source).toContain('sendWakewordDetectedThroughSdkAgent');
    const wakeCall = source.match(/client\.wakeUp\(\{[\s\S]*?\n  \}\);/)?.[0] || '';
    expect(wakeCall).toContain('installAuth: buildDesktopInstallAuth()');
    expect(wakeCall).toContain('name: mainHostSkin.identity.sdkAgentName');
    expect(wakeCall).toContain('workspacePath: resolvedWorkspacePath');
    expect(wakeCall).toContain("builtins: process.env.NODE_ENV === 'test' ? [] : 'default'");
    expect(wakeCall).toContain("mcps: process.env.NODE_ENV === 'test'");
    expect(wakeCall).toContain('getEnabledMcpServerSpecsForConfig({ config: getFrontendConfigForMcpRegistry() })');
    expect(wakeCall).toContain('localToolLifecycle');
    expect(wakeCall).not.toContain('conversationRef:');
    expect(source).toContain('onFrontendConfigLoaded: refreshEnabledMcpServersAfterStartup');
    expect(source).toContain("refreshMcpServersForLatestConfig('mcp-startup')");
    expect(source).toContain('[Main][SDK] client_initialized');
    expect(source).toContain('[Main][SDK] creating_client backend=');
    expect(source).toContain('[Main][SDK] local_runtime_ensure_start reason=');
    expect(source).toContain('[Main][SDK] local_runtime_ready reason=');
    expect(source).toContain('[Main][Backend] connected user=');
    expect(source).not.toContain('Windie SDK runtime');
    expect(source).not.toContain('WindieClient wakeUp runtime started');
    expect(source).not.toContain('Failed to send query through WindieAgent');
  });

  test('electron main exposes SDK-shaped user commands through a strict invoke allowlist', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc.cjs'),
      'utf8',
    );
    const source = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc/ipc_agent_sdk_command_handlers.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('DESKTOP_AGENT_INVOKE_CHANNELS');
    expect(mainSource).toContain('ipcMain.handle(DESKTOP_AGENT_INVOKE_CHANNELS.INVOKE');
    expect(mainSource).toContain('handleAgentSdkInvoke(event, payload');
    expect(mainSource).toContain('ensureAgent,');
    expect(mainSource).not.toContain('ensureAgent: ensureWindieAgent');
    expect(mainSource).not.toContain('getKnownWindieLocalRuntime');
    expect(mainSource).not.toContain('ensureWindieLocalRuntime');
    expect(mainSource).not.toContain('function buildAgentSdkCommandHandlers');
    expect(source).toContain('buildAgentSdkCommandHandlers');
    expect(source).toContain('SDK_RUNTIME_COMMANDS');
    expect(source).toContain('[SDK_RUNTIME_COMMANDS.MEMORIES_LIST]');
    expect(source).toContain('[SDK_RUNTIME_COMMANDS.MEMORIES_DELETE]');
    expect(source).toContain('[SDK_RUNTIME_COMMANDS.MEMORIES_CLEAR_ALL]');
    expect(source).toContain('[SDK_RUNTIME_COMMANDS.CONVERSATIONS_LIST]');
    expect(source).toContain('[SDK_RUNTIME_COMMANDS.CONVERSATIONS_SEARCH]');
    expect(source).toContain('[SDK_RUNTIME_COMMANDS.CONVERSATIONS_DELETE]');
    expect(source).toContain('[SDK_RUNTIME_COMMANDS.CONVERSATIONS_CLEAR_ALL]');
    expect(source).toContain('[SDK_RUNTIME_COMMANDS.DIAGNOSTICS_APPEND]');
    expect(source).toContain('[SDK_RUNTIME_COMMANDS.CONVERSATION_SEND]');
    expect(source).toContain('[SDK_RUNTIME_COMMANDS.CONVERSATION_STOP]');
    expect(source).toContain('[SDK_RUNTIME_COMMANDS.CONVERSATION_REHYDRATE]');
    expect(source).toContain('[SDK_RUNTIME_COMMANDS.CONVERSATION_COMPACT]');
    expect(source).toContain('[SDK_RUNTIME_COMMANDS.CONVERSATION_PREPARE_EDIT_AND_RESEND]');
    expect(source).toContain('[SDK_RUNTIME_COMMANDS.CONVERSATION_PREPARE_RETRY_TURN]');
    expect(source).toContain('[SDK_RUNTIME_COMMANDS.SETTINGS_UPDATE]');
    expect(source).toContain('[SDK_RUNTIME_COMMANDS.MODELS_LIST]');
    expect(source).toContain('[SDK_RUNTIME_COMMANDS.WAKEWORD_DETECTED]');
    expect(source).toContain('localRuntimeReady: true');
    expect(source).toContain('localRuntimeReady: Boolean(deps.getState().agent)');
    expect(source).not.toContain('sidecarReady:');
    expect(source).toContain('agent.listMemories(');
    expect(source).toContain('agent.deleteMemory(');
    expect(source).toContain('agent.clearMemories(');
    expect(source).toContain('agent.clearConversations(');
    expect(source).toContain('runtimeRegistry.prepareEditAndResend(');
    expect(source).toContain('runtimeRegistry.prepareRetryTurn(');
    expect(source).not.toContain('agent.prepareEditAndResend(');
    expect(source).not.toContain('agent.prepareRetryTurn(');
    expect(source).toContain('requireCommandUserId');
    expect(source).toContain('requireAuthenticatedCommandUserId');
    expect(source).toContain("userId === 'default_user'");
    expect(mainSource).not.toContain('handleAgentSdkInvoke(event, payload, { method');
    const sdkCommandModule = require('../../frontend/src/main/ipc/ipc_agent_sdk_command_handlers.cjs');
    expect(sdkCommandModule.buildAgentSdkCommandHandlers).toBeUndefined();
    expect(typeof sdkCommandModule.handleAgentSdkInvoke).toBe('function');

    const memoryHandlers = source.match(/MEMORIES_LIST[\s\S]*?CONVERSATIONS_LIST/)?.[0] || '';
    expect(memoryHandlers).toContain('requireAuthenticatedCommandUserId(deps.getState().currentUserId);');
    expect(memoryHandlers).not.toContain('userId: requireAuthenticatedCommandUserId()');
    expect(memoryHandlers).not.toContain('requireCommandUserId(payload)');
  });
});
