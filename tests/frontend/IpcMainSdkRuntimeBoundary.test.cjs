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

  test('electron main starts the SDK through WindieClient wakeUp directly', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc.cjs'),
      'utf8',
    );
    const wrapperExists = await fs.access(
      path.resolve(__dirname, '../../frontend/src/main/windie_agent_host.cjs'),
    ).then(() => true, () => false);

    expect(wrapperExists).toBe(false);
    expect(source).toContain('new WindieClient({');
    expect(source).toContain('client.wakeUp({');
    expect(source).toContain('agent.conversation({');
    expect(source).toContain('localToolLifecycle');
    expect(source).toContain("require('../../../packages/windie-sdk-js/cjs/index.js')");
    expect(source).not.toContain('WindieAgent.startDesktop');
    expect(source).not.toContain('createWindieAgentHost');
    expect(source).not.toContain("require('./windie_agent_host.cjs')");
    expect(source).not.toContain('createWindieSdkMainRuntime');
    expect(source).not.toContain('createManagedBackendSession');
    expect(source).not.toContain('sendSdkRuntimeCommand');
    expect(source).not.toContain('WebSocketImpl:');
    expect(source).not.toContain('executeLocalTool:');
    const wakeCall = source.match(/client\.wakeUp\(\{[\s\S]*?\n  \}\);/)?.[0] || '';
    expect(wakeCall).toContain('installAuth: buildDesktopInstallAuth()');
    expect(wakeCall).toContain("name: 'WindieOS'");
    expect(wakeCall).toContain('workspacePath: resolvedWorkspacePath');
    expect(wakeCall).toContain("builtins: process.env.NODE_ENV === 'test' ? [] : 'default'");
    expect(wakeCall).toContain('localToolLifecycle');
    expect(wakeCall).not.toContain('conversationRef:');
  });

  test('electron main exposes SDK-shaped user commands through a strict invoke allowlist', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc.cjs'),
      'utf8',
    );

    expect(source).toContain("ipcMain.handle('windie:invoke'");
    expect(source).toContain('buildWindieSdkCommandHandlers');
    expect(source).toContain("'memories.list'");
    expect(source).toContain("'memories.delete'");
    expect(source).toContain("'memories.clearAll'");
    expect(source).toContain("'conversations.list'");
    expect(source).toContain("'conversations.search'");
    expect(source).toContain("'conversations.delete'");
    expect(source).toContain("'conversations.clearAll'");
    expect(source).toContain("'conversation.send'");
    expect(source).toContain("'conversation.stop'");
    expect(source).toContain("'conversation.rehydrate'");
    expect(source).toContain("'conversation.compact'");
    expect(source).toContain("'conversation.prepareEditAndResend'");
    expect(source).toContain("'conversation.prepareRetryTurn'");
    expect(source).toContain("'settings.update'");
    expect(source).toContain("'models.list'");
    expect(source).toContain("'wakeword.detected'");
    expect(source).toContain('agent.listMemories(');
    expect(source).toContain('agent.deleteMemory(');
    expect(source).toContain('agent.clearMemories(');
    expect(source).toContain('agent.clearConversations(');
    expect(source).toContain('agent.prepareEditAndResend(');
    expect(source).toContain('agent.prepareRetryTurn(');
    expect(source).toContain('requireCommandUserId');
    expect(source).toContain('requireAuthenticatedCommandUserId');
    expect(source).toContain("userId === 'default_user'");
    expect(source).not.toContain('handleWindieSdkInvoke(event, payload, { method');

    const memoryHandlers = source.match(/'memories\.list'[\s\S]*?'conversations\.list'/)?.[0] || '';
    expect(memoryHandlers).toContain('userId: requireAuthenticatedCommandUserId()');
    expect(memoryHandlers).not.toContain('requireCommandUserId(payload)');
  });
});
