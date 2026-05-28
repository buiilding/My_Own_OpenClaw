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

  test('electron main starts the high-level desktop agent directly', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc.cjs'),
      'utf8',
    );
    const wrapperExists = await fs.access(
      path.resolve(__dirname, '../../frontend/src/main/windie_agent_host.cjs'),
    ).then(() => true, () => false);

    expect(wrapperExists).toBe(false);
    expect(source).toContain('WindieAgent.startDesktop');
    expect(source).toContain("require('../../../packages/windie-sdk-js/cjs/index.js')");
    expect(source).not.toContain('createWindieAgentHost');
    expect(source).not.toContain("require('./windie_agent_host.cjs')");
    expect(source).not.toContain('createWindieSdkMainRuntime');
    expect(source).not.toContain('createManagedBackendSession');
    expect(source).not.toContain('sendSdkRuntimeCommand');
    expect(source).not.toContain('WebSocketImpl:');
    expect(source).not.toContain('sidecar:');
    expect(source).not.toContain('executeLocalTool:');
    const startupCall = source.match(/WindieAgent\.startDesktop\(\{[\s\S]*?\n  \}\);/)?.[0] || '';
    expect(startupCall).toContain('apiKey: currentInstallToken');
    expect(startupCall).toContain("appName: 'WindieOS'");
    expect(startupCall).toContain('workspace: workspacePath || resolveWorkspacePathForAgent() || undefined');
    expect(startupCall).not.toContain('userId:');
    expect(startupCall).not.toContain('installId:');
    expect(startupCall).not.toContain('conversationRef:');
    expect(startupCall).not.toContain('endpointCandidates:');
    expect(startupCall).not.toContain('reconnectIntervalMs:');
    expect(startupCall).not.toContain('connectTimeoutMs:');
    expect(startupCall).not.toContain('idleDisconnectTimeoutMs:');
    expect(startupCall).not.toContain('onBackendOpen:');
    expect(startupCall).not.toContain('onBackendClose:');
  });
});
