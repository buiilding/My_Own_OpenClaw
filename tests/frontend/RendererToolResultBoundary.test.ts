import fs from 'node:fs/promises';
import path from 'node:path';

const rendererRoot = path.resolve(__dirname, '../../frontend/src/renderer');
const allowedRelativePaths = new Set([
  'features/chat/utils/conversationReplayToolMessages.js',
  'infrastructure/transcript/structuredToolPayload.js',
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

describe('renderer tool-result boundary', () => {
  test('renderer source does not own backend tool-result delivery', async () => {
    const files = await listSourceFiles(rendererRoot);
    const offenders: string[] = [];

    for (const file of files) {
      const relativePath = path.relative(rendererRoot, file);
      if (allowedRelativePaths.has(relativePath)) {
        continue;
      }
      const source = await fs.readFile(file, 'utf8');
      if (
        source.includes("'tool-result'")
        || source.includes('"tool-result"')
        || source.includes("'tool-bundle-result'")
        || source.includes('"tool-bundle-result"')
      ) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
  });
});
