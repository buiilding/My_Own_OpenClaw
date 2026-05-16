import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../..');

async function read(relativePath: string): Promise<string> {
  return fs.readFile(path.join(repoRoot, relativePath), 'utf8');
}

describe('modular sdk refactor completion boundary', () => {
  test('main runtime does not expose raw backend envelope sends', async () => {
    const source = await read('frontend/src/main/windie_sdk_runtime.cjs');

    expect(source).toContain("packages/windie-sdk-js/src/transport/ManagedBackendSession.cjs");
    expect(source).not.toContain('sendBackendMessage,');
    expect(source).not.toContain('sendEnvelope,');
    expect(source).not.toContain('connectWaiters');
    expect(source).not.toContain('idleDisconnectTimer');
    expect(source).not.toContain('reconnectTimer');
    expect(source).not.toContain('shouldMaintainConnection');
    expect(source).toContain('sendCompactHistory');
    expect(source).toContain('sendRehydrateConversation');
    expect(source).toContain('sendToolBundleResult');
    expect(source).toContain('sendToolResult');
  });

  test('renderer conversation runtime delegates backend and projection work to app runtimes', async () => {
    const source = await read('frontend/src/renderer/app/runtime/desktopConversationRuntimeClient.ts');

    expect(source).toContain('DesktopBackendCommandRuntimeClient');
    expect(source).toContain('DesktopSettingsRuntimeClient');
    expect(source).toContain('DesktopTranscriptProjectionRuntimeClient');
    expect(source).not.toContain('infrastructure/api/client');
    expect(source).not.toContain('infrastructure/transcript/TranscriptWriter');
    expect(source).not.toContain('ElectronSidecarConversationStore');
  });

  test('public examples exercise sdk stream, retry, stop, local tool, and model controls', async () => {
    const cli = await read('examples/cli-agent/run.mjs');
    const customUi = await read('examples/custom-ui/index.html');
    const localTool = await read('examples/local-tool-extension/run.mjs');
    const repoAgent = await read('examples/repo-agent-extension/run.mjs');

    expect(cli).toContain('conversation.stream');
    expect(cli).toContain('conversation.retryTurn');
    expect(cli).toContain('conversation.stop');
    expect(customUi).toContain('conversation.setModel');
    expect(customUi).toContain('conversation.retryTurn');
    expect(customUi).toContain('conversation.stop');
    expect(localTool).toContain('moduleTool');
    expect(localTool).toContain('agent.stop');
    expect(repoAgent).toContain('plugins: [{ path: exampleDir }]');
    expect(repoAgent).toContain('agent.stop');
  });
});
