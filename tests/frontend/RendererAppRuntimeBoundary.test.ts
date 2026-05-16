import fs from 'node:fs/promises';
import path from 'node:path';

const appRoot = path.resolve(__dirname, '../../frontend/src/renderer/app');
const allowedRelativePaths = new Set([
  'runtime/desktopTranscriptSessionRuntimeClient.ts',
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

describe('renderer app runtime boundary', () => {
  test('app provider code uses runtime facades for transcript session helpers', async () => {
    const files = await listSourceFiles(appRoot);
    const offenders: string[] = [];

    for (const file of files) {
      const relativePath = path.relative(appRoot, file);
      if (allowedRelativePaths.has(relativePath)) {
        continue;
      }
      const source = await fs.readFile(file, 'utf8');
      if (source.includes('infrastructure/transcript/TranscriptWriter')) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
  });
});
