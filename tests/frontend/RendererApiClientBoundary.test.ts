/**
 * Covers renderer api client boundary. behavior in the frontend test suite.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const rendererRoot = path.resolve(__dirname, '../../frontend/src/renderer');
const allowedRelativePaths = new Set([
  'app/runtime/desktopLiveTurnRuntimeClient.ts',
  'app/runtime/desktopSettingsRuntimeClient.ts',
  'app/runtime/desktopVoiceRuntimeClient.ts',
]);
const allowedBackendIpcRelativePaths = new Set([
  'app/runtime/desktopRuntimeTransport.ts',
  'infrastructure/ipc/channels.ts',
]);

async function listSourceFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listSourceFiles(absolutePath));
      continue;
    }
    if (/\.(cjs|js|jsx|ts|tsx)$/.test(entry.name)) {
      files.push(absolutePath);
    }
  }
  return files;
}

describe('renderer api client boundary', () => {
  test('legacy renderer ApiClient has been deleted', async () => {
    await expect(fs.access(path.join(rendererRoot, 'infrastructure/api/client.ts'))).rejects.toThrow();
  });

  test('renderer features use desktop runtime facades instead of direct ApiClient calls', async () => {
    const files = await listSourceFiles(rendererRoot);
    const offenders: string[] = [];

    for (const file of files) {
      const relativePath = path.relative(rendererRoot, file);
      if (allowedRelativePaths.has(relativePath)) {
        continue;
      }
      const source = await fs.readFile(file, 'utf8');
      if (source.includes('infrastructure/api/client') || source.includes('ApiClient.')) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
  });

  test('renderer backend IPC sends stay inside desktop runtime adapters', async () => {
    const files = await listSourceFiles(rendererRoot);
    const offenders: string[] = [];

    for (const file of files) {
      const relativePath = path.relative(rendererRoot, file);
      if (allowedBackendIpcRelativePaths.has(relativePath)) {
        continue;
      }
      const source = await fs.readFile(file, 'utf8');
      if (source.includes('SEND_CHANNELS.TO_BACKEND') || source.includes("'to-backend'") || source.includes('"to-backend"')) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
  });

  test('renderer SDK facade uses generic SDK type names directly', async () => {
    const source = await fs.readFile(
      path.join(rendererRoot, 'infrastructure/api/agentSdkClient.ts'),
      'utf8',
    );
    const retiredProductType = `${'Wind' + 'ie'}ModelSelection`;

    expect(source).toContain("export * from '../../../../../packages/windie-sdk-js/src';");
    expect(source).not.toContain(`${retiredProductType} as AgentModelSelection`);
  });

  test('production renderer sdk facade imports stay behind app runtime contracts', async () => {
    const files = await listSourceFiles(rendererRoot);
    const offenders: string[] = [];
    const allowedRelativePath = 'app/runtime/desktopConversationRuntimeContracts.ts';

    for (const file of files) {
      const relativePath = path.relative(rendererRoot, file).replace(/\\/g, '/');
      if (relativePath === allowedRelativePath) {
        continue;
      }
      const source = await fs.readFile(file, 'utf8');
      if (
        source.includes('infrastructure/api/agentSdkClient')
        || source.includes('../api/agentSdkClient')
        || source.includes('api/agentSdkClient')
      ) {
        offenders.push(relativePath);
      }
    }

    const contractsSource = await fs.readFile(
      path.join(rendererRoot, allowedRelativePath),
      'utf8',
    );

    expect(offenders).toEqual([]);
    expect(contractsSource).toContain('infrastructure/api/agentSdkClient');
  });

  test('renderer architecture docs do not restore deleted api client or app-import sdk facade labels', async () => {
    const docs = await Promise.all([
      fs.readFile(path.resolve(__dirname, '../../docs/architecture/frontend_architecture.md'), 'utf8'),
      fs.readFile(path.resolve(__dirname, '../../docs/planning/windieos_mobile_app_plan.md'), 'utf8'),
      fs.readFile(path.join(rendererRoot, 'folder_structure.md'), 'utf8'),
    ]);
    const docText = docs.join('\n');

    expect(docText).toContain('legacy renderer\n  `infrastructure/api/client.ts` bridge has been removed');
    expect(docText).toContain('SDK runtime and hosted transport facade');
    expect(docText).toContain('Renderer SDK facade for hosted transport wrappers and runtime contracts');
    expect(docText).not.toContain('Developer-facing backend SDK transport wrapper');
    expect(docText).not.toContain('Renderer SDK facade for hosted transport wrappers, runtime contracts, and app imports');
    expect(docText).not.toContain('`renderer/infrastructure/api/client.ts` remains');
    expect(docText).not.toContain('typed backend command emitter');
  });
});
