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

  test('main tool router delegates local tool routing to the sdk package', async () => {
    const source = await read('frontend/src/main/ipc/ipc_sdk_tool_router.cjs');

    expect(source).toContain('packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.cjs');
    expect(source).not.toContain('async function routeToolCallToLocalRuntime');
    expect(source).not.toContain('async function routeToolBundleToLocalRuntime');
  });

  test('renderer conversation runtime delegates backend and projection work to app runtimes', async () => {
    const source = await read('frontend/src/renderer/app/runtime/desktopConversationRuntimeClient.ts');

    expect(source).toContain('DesktopBackendCommandRuntimeClient');
    expect(source).toContain('DesktopSettingsRuntimeClient');
    expect(source).toContain('DesktopTranscriptProjectionRuntimeClient');
    expect(source).not.toContain('infrastructure/api/client');
    expect(source).not.toContain('infrastructure/transcript/TranscriptWriter');
    expect(source.includes('ElectronSidecarConversationStore')).toBe(false);
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

  test('current frontend inventory docs do not route work to deleted renderer runtimes', async () => {
    const currentInventoryDocs = [
      'docs/frontend/inventory/frontend_runtime_surface_matrix_reference.md',
      'docs/frontend/inventory/frontend_capability_to_file_matrix_reference.md',
      'docs/frontend/inventory/frontend_functionality_capability_catalog_reference.md',
      'docs/frontend/renderer/chat/README.md',
      'docs/frontend/contracts/events/README.md',
      'docs/frontend/contracts/events/tool_runtime/README.md',
      'docs/frontend/inventory/domains/frontend_change_path_playbook_reference.md',
      'docs/frontend/inventory/domains/frontend_domain_ownership_matrix_reference.md',
    ];

    const offenders: Record<string, string[]> = {};
    for (const relativePath of currentInventoryDocs) {
      const source = await read(relativePath);
      const staleMentions = [
        'frontend/src/renderer/features/chat/hooks/useToolRunner.ts',
        'frontend/src/renderer/infrastructure/services/ToolExecutionService.ts',
        'frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts',
        'renderer/useToolRunner.ts',
      ].filter((needle) => source.includes(needle));
      if (staleMentions.length > 0) {
        offenders[relativePath] = staleMentions;
      }
    }

    expect(offenders).toEqual({});
  });
});
