/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');

const retiredProductPrefix = 'Wind' + 'ie';

function retiredProductName(suffix) {
  return `${retiredProductPrefix}${suffix}`;
}

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
    expect(source).toContain('function createElectronAgentClient()');
    expect(source).not.toContain('createDesktopAgentClient');
    expect(source).toContain('client.wakeUp({');
    expect(source).toContain('agent.conversation({');
    expect(source).toContain('isDefaultAgentDefinition(generatedAgentDefinition)');
    expect(source).not.toContain("generatedAgentDefinition.mode === 'windie_default'");
    expect(source).toContain('localToolLifecycle');
    expect(source).toContain('agentWebSocketImpl');
    expect(source).toContain('autoLocalRuntime: buildDesktopLocalRuntimeLaunchOptionsForAgent()');
    expect(source).not.toContain('autoSidecar: buildDesktopLocalRuntimeLaunchOptionsForAgent()');
    expect(source).toContain('desktopLocalRuntimeLaunchConfig');
    expect(source).toContain('createDesktopLocalRuntimeLaunchPlan');
    expect(source).not.toContain('buildDesktopAutoSidecarOptionsForAgent');
    expect(source).not.toContain('desktopAutoSidecarLaunchConfig');
    expect(source).not.toContain('createDesktopAutoSidecarLaunchPlan');
    expect(source).toContain("require('../../../packages/windie-sdk-js/cjs/index.js')");
    expect(source).not.toContain(`${retiredProductName('Agent')}.startDesktop`);
    expect(source).not.toContain('ensureDaemonBackedLocalRuntime');
    expect(source).not.toContain('ensureLocalRuntime: ensureDaemonBackedLocalRuntime');
    expect(source).not.toMatch(/create\w*AgentHost/);
    expect(source).not.toMatch(/require\(['"].*agent_host\.cjs['"]\)/);
    expect(source).not.toContain(`create${retiredProductName('SdkMainRuntime')}`);
    expect(source).not.toContain('createManagedBackendSession');
    expect(source).not.toContain('sendSdkRuntimeCommand');
    expect(source).not.toContain('executeLocalTool:');
    expect(source).not.toContain('sendQueryToBackend');
    expect(source).not.toContain('sendStopQueryToBackend');
    expect(source).not.toContain('requestModelListFromBackend');
    expect(source).not.toContain('sendWakewordDetectedToBackend');
    expect(source).toContain('sendQueryThroughAgentSdkRuntime');
    expect(source).toContain('stopQueryThroughAgentSdkRuntime');
    expect(source).toContain('requestModelListThroughAgentSdkRuntime');
    expect(source).toContain('sendWakewordDetectedThroughAgentSdkRuntime');
    const wakeCall = source.match(/client\.wakeUp\(\{[\s\S]*?\n  \}\);/)?.[0] || '';
    expect(wakeCall).toContain('installAuth: buildDesktopInstallAuth()');
    expect(wakeCall).toContain('name: ipcHostCopy.identity.sdkAgentName');
    expect(wakeCall).toContain('workspacePath: resolvedWorkspacePath');
    expect(wakeCall).toContain("builtins: process.env.NODE_ENV === 'test' ? [] : 'default'");
    expect(wakeCall).toContain("mcps: process.env.NODE_ENV === 'test'");
    expect(wakeCall).toContain('getEnabledMcpServerSpecsForConfig({ config: getDesktopUiConfigForMcpRegistry() })');
    expect(wakeCall).toContain('localToolLifecycle');
    expect(wakeCall).not.toContain('conversationRef:');
    expect(source).toContain('onDesktopUiConfigLoaded: refreshEnabledMcpServersAfterStartup');
    expect(source).toContain("refreshMcpServersForLatestConfig('mcp-startup')");
    expect(source).toContain('[Main][SDK] client_initialized');
    expect(source).toContain('[Main][SDK] creating_client backend=');
    expect(source).toContain('[Main][SDK] local_runtime_ensure_start reason=');
    expect(source).toContain('[Main][SDK] local_runtime_ready reason=');
    expect(source).toContain('[Main][Backend] connected user=');
    expect(source).not.toContain(`${retiredProductPrefix} SDK runtime`);
    expect(source).not.toContain(`${retiredProductName('Client')} wakeUp runtime started`);
    expect(source).not.toContain(`Failed to send query through ${retiredProductName('Agent')}`);
  });

  test('local runtime status IPC uses shared generic channel constants in main bridge code', async () => {
    const bridgeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/sidecar/local_runtime_bridge.cjs'),
      'utf8',
    );
    const broadcasterSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/sidecar/local_runtime_status_broadcaster.cjs'),
      'utf8',
    );
    const channelSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc/ipc_desktop_runtime_channels.cjs'),
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
      path.resolve(__dirname, '../../frontend/src/main/ipc.cjs'),
      'utf8',
    );
    const source = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc/ipc_agent_sdk_command_handlers.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('DESKTOP_RUNTIME_INVOKE_CHANNELS');
    expect(mainSource).toContain('ipcMain.handle(DESKTOP_RUNTIME_INVOKE_CHANNELS.INVOKE');
    expect(mainSource).toContain('handleAgentSdkInvoke(event, payload');
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

  test('electron main rejects removed user_id SDK command alias', async () => {
    const { handleAgentSdkInvoke } = require('../../frontend/src/main/ipc/ipc_agent_sdk_command_handlers.cjs');
    const ensureAgent = jest.fn(async () => ({
      listConversations: jest.fn(async () => []),
    }));
    const appendAppDiagnostic = jest.fn(input => input);

    const result = await handleAgentSdkInvoke(
      null,
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

  test('electron main rejects removed conversation_ref SDK command alias', async () => {
    const { handleAgentSdkInvoke } = require('../../frontend/src/main/ipc/ipc_agent_sdk_command_handlers.cjs');
    const ensureAgent = jest.fn(async () => ({
      loadConversation: jest.fn(async () => ({
        display: { messages: [] },
        displayRows: [],
        currentTurn: null,
      })),
    }));
    const appendAppDiagnostic = jest.fn(input => input);

    const result = await handleAgentSdkInvoke(
      null,
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
    const { handleAgentSdkInvoke } = require('../../frontend/src/main/ipc/ipc_agent_sdk_command_handlers.cjs');
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

    await expect(handleAgentSdkInvoke(
      null,
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
    await expect(handleAgentSdkInvoke(
      null,
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
    const { handleAgentSdkInvoke } = require('../../frontend/src/main/ipc/ipc_agent_sdk_command_handlers.cjs');
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

    await expect(handleAgentSdkInvoke(
      null,
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
    await expect(handleAgentSdkInvoke(
      null,
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

  test('electron main rejects removed edit and retry SDK command aliases', async () => {
    const { handleAgentSdkInvoke } = require('../../frontend/src/main/ipc/ipc_agent_sdk_command_handlers.cjs');
    const ensureAgent = jest.fn(async () => ({
      prepareRetryTurn: jest.fn(async () => ({})),
    }));

    const result = await handleAgentSdkInvoke(
      null,
      {
        command: 'conversation.prepareRetryTurn',
        payload: {
          userId: 'user-1',
          conversationRef: 'conv-1',
          message_id: 'message-1',
          turn_ref: 'turn-1',
        },
      },
      {
        deps: {
          ensureAgent,
          appendAppDiagnostic: jest.fn(input => input),
          getState: () => ({
            currentUserId: 'user-1',
          }),
        },
      },
    );

    expect(result).toEqual({
      ok: false,
      error: 'Agent SDK edit/retry commands require camelCase fields; removed field(s): turn_ref, message_id.',
    });
    expect(ensureAgent).not.toHaveBeenCalled();
  });
});
