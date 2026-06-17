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
  'app/runtime/desktopAgentRuntimeTransport.ts',
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

    expect(source).toContain("export * from '../../../../../packages/windie-sdk-js/src';");
    expect(source).not.toContain('WindieModelSelection as AgentModelSelection');
  });
});
