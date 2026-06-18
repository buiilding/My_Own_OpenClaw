/**
 * Covers renderer dashboard runtime boundary. behavior in the frontend test suite.
 */

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
  test('dashboard feature code does not construct the desktop conversation store adapter directly', async () => {
    const files = await listSourceFiles(dashboardRoot);
    const offenders: string[] = [];

    for (const file of files) {
      const relativePath = path.relative(dashboardRoot, file);
      const source = await fs.readFile(file, 'utf8');
      if (source.includes('DesktopConversationStoreAdapter')) {
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

  test('dashboard feature code searches conversations through runtime facades', async () => {
    const files = await listSourceFiles(dashboardRoot);
    const offenders: string[] = [];

    for (const file of files) {
      const relativePath = path.relative(dashboardRoot, file);
      const source = await fs.readFile(file, 'utf8');
      if (source.includes('localConversationStore')) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
  });

  test('dashboard memory feature code uses the memory runtime facade instead of sidecar IPC channels', async () => {
    const files = await listSourceFiles(dashboardRoot);
    const offenders: string[] = [];
    const forbidden = [
      'LIST_EPISODIC_MEMORIES',
      'LIST_SEMANTIC_MEMORIES',
      'DELETE_EPISODIC_MEMORY',
      'DELETE_SEMANTIC_MEMORY',
      'CLEAR_LOCAL_MEMORY',
      'CLEAR_CHAT_HISTORY',
      'list-episodic-memories',
      'list-semantic-memories',
      'delete-episodic-memory',
      'delete-semantic-memory',
      'clear-local-memory',
      'clear-chat-history',
    ];

    for (const file of files) {
      const relativePath = path.relative(dashboardRoot, file);
      const source = await fs.readFile(file, 'utf8');
      if (forbidden.some((needle) => source.includes(needle))) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
  });

  test('dashboard feature code consumes transcript session info through app runtime client', async () => {
    const removedDashboardHookPath = path.join(
      dashboardRoot,
      'hooks/useTranscriptSessionInfo.js',
    );
    await expect(fs.stat(removedDashboardHookPath)).rejects.toThrow();

    const files = await listSourceFiles(dashboardRoot);
    const offenders: string[] = [];

    for (const file of files) {
      const relativePath = path.relative(dashboardRoot, file);
      const source = await fs.readFile(file, 'utf8');
      if (
        source.includes('hooks/useTranscriptSessionInfo')
        || source.includes('useTranscriptSessionInfo')
      ) {
        offenders.push(relativePath);
      }
    }

    const memoryActionsSource = await fs.readFile(
      path.join(dashboardRoot, 'components/sections/settings/useMemorySettingsActions.js'),
      'utf8',
    );

    expect(offenders).toEqual([]);
    expect(memoryActionsSource).toContain('useDesktopTranscriptSessionInfo');
    expect(memoryActionsSource).toContain('app/runtime/desktopTranscriptSessionInfoRuntimeClient');
  });
});
