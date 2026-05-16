import fs from 'node:fs/promises';
import path from 'node:path';

const dashboardRoot = path.resolve(__dirname, '../../frontend/src/renderer/features/dashboard');

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

describe('renderer dashboard runtime boundary', () => {
  test('dashboard feature code does not construct the Electron conversation store directly', async () => {
    const files = await listSourceFiles(dashboardRoot);
    const offenders: string[] = [];

    for (const file of files) {
      const relativePath = path.relative(dashboardRoot, file);
      const source = await fs.readFile(file, 'utf8');
      if (source.includes('ElectronSidecarConversationStore')) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
  });

  test('dashboard feature code uses runtime facades for transcript session helpers', async () => {
    const files = await listSourceFiles(dashboardRoot);
    const offenders: string[] = [];

    for (const file of files) {
      const relativePath = path.relative(dashboardRoot, file);
      const source = await fs.readFile(file, 'utf8');
      if (source.includes('infrastructure/transcript/TranscriptWriter')) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
  });

  test('dashboard feature code does not import transcript replay storage directly', async () => {
    const files = await listSourceFiles(dashboardRoot);
    const offenders: string[] = [];

    for (const file of files) {
      const relativePath = path.relative(dashboardRoot, file);
      const source = await fs.readFile(file, 'utf8');
      if (source.includes('infrastructure/transcript/conversationReplayState')) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
  });

  test('dashboard feature code loads local conversation snapshots through runtime facades', async () => {
    const files = await listSourceFiles(dashboardRoot);
    const offenders: string[] = [];

    for (const file of files) {
      const relativePath = path.relative(dashboardRoot, file);
      const source = await fs.readFile(file, 'utf8');
      if (source.includes('conversationLocalSnapshotLoader')) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
  });
});
