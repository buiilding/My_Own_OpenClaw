/**
 * Covers renderer dashboard runtime boundary. behavior in the frontend test suite.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const dashboardRoot = path.resolve(__dirname, '../../frontend/src/renderer/features/dashboard');
const repoRoot = path.resolve(__dirname, '../..');

const dashboardConversationDocs = [
  'docs/frontend/renderer/dashboard_memory_management_and_resume_reference.md',
  'docs/frontend/renderer/dashboard/shell/dashboard_section_router_and_placeholder_panel_contract_reference.md',
  'docs/frontend/renderer/dashboard/shell/dashboard_conversation_hook_search_polling_and_group_bucket_contract_reference.md',
  'docs/frontend/renderer/transcript_session_and_rehydrate_reference.md',
];

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
  test('dashboard conversation docs route list search and resume through runtime facades', async () => {
    const forbidden = [
      'LIST_CHAT_CONVERSATIONS',
      'SEARCH_CHAT_CONVERSATIONS',
      'GET_CHAT_EVENTS',
    ];
    const offenders: string[] = [];
    const combinedDocs: string[] = [];

    for (const relativeDocPath of dashboardConversationDocs) {
      const source = await fs.readFile(path.join(repoRoot, relativeDocPath), 'utf8');
      combinedDocs.push(source);
      for (const needle of forbidden) {
        if (source.includes(needle)) {
          offenders.push(`${relativeDocPath}: ${needle}`);
        }
      }
    }

    const combinedSource = combinedDocs.join('\n');
    expect(offenders).toEqual([]);
    expect(combinedSource).toContain('DesktopConversationLibraryClient');
    expect(combinedSource).toContain('conversations.search');
    expect(combinedSource).toContain('conversation.loadDisplay');
  });

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
