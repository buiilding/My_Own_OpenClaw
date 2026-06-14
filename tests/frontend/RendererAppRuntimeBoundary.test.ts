/**
 * Covers renderer app runtime boundary. behavior in the frontend test suite.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const appRoot = path.resolve(__dirname, '../../frontend/src/renderer/app');
const rendererRoot = path.resolve(__dirname, '../../frontend/src/renderer');
const allowedRelativePaths = new Set([
  'runtime/desktopChatStreamIngressRuntime.ts',
  'runtime/desktopTranscriptSessionRuntimeClient.ts',
]);
const allowedSdkOwnedInternalChannelPaths = new Set([
  'infrastructure/ipc/channels.ts',
]);

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/');
}

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
  test('conversation library facade uses SDK-shaped commands for user-facing conversation actions', async () => {
    const source = await fs.readFile(
      path.join(appRoot, 'runtime/desktopConversationLibraryClient.js'),
      'utf8',
    );

    expect(source).toContain('invokeWindieCommand');
    expect(source).toContain("'conversations.list'");
    expect(source).toContain("'conversations.search'");
    expect(source).toContain("'conversations.delete'");
    expect(source).toContain("'conversation.loadDisplay'");
    expect(source).not.toContain("'conversation.load'");
    expect(source).not.toContain("'conversation.loadRehydrate'");
    expect(source).not.toContain('DesktopConversationStoreAdapter');
    expect(source).not.toContain('INVOKE_CHANNELS.LIST_CHAT_CONVERSATIONS');
    expect(source).not.toContain('INVOKE_CHANNELS.GET_CHAT_EVENTS');
  });

  test('live-turn and backend transport facades use SDK-shaped command invoke for SDK runtime commands', async () => {
    const liveTurnSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopLiveTurnRuntimeClient.ts'),
      'utf8',
    );
    const backendTransportSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopBackendTransport.ts'),
      'utf8',
    );

    expect(liveTurnSource).toContain('invokeWindieCommand');
    expect(liveTurnSource).toContain("'conversation.send'");
    expect(liveTurnSource).toContain("'conversation.stop'");
    expect(liveTurnSource).not.toContain('WINDIE_SEND');
    expect(liveTurnSource).not.toContain('WINDIE_STOP');

    expect(backendTransportSource).toContain('invokeWindieCommand');
    expect(backendTransportSource).toContain("'conversation.send'");
    expect(backendTransportSource).toContain("'conversation.stop'");
    expect(backendTransportSource).toContain("'conversation.rehydrate'");
    expect(backendTransportSource).toContain("'conversation.compact'");
    expect(backendTransportSource).toContain("'settings.update'");
    expect(backendTransportSource).toContain("'models.list'");
    expect(backendTransportSource).toContain("'wakeword.detected'");
    expect(backendTransportSource).not.toContain('WINDIE_SEND');
    expect(backendTransportSource).not.toContain('WINDIE_STOP');
    expect(backendTransportSource).not.toContain('WINDIE_REHYDRATE');
    expect(backendTransportSource).not.toContain('WINDIE_COMPACT_HISTORY');
  });

  test('app provider code uses runtime facades for transcript session helpers', async () => {
    const files = await listSourceFiles(appRoot);
    const offenders: string[] = [];

    for (const file of files) {
      const relativePath = normalizeRelativePath(path.relative(appRoot, file));
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

  test('app runtime modules do not import chat feature internals', async () => {
    const files = await listSourceFiles(path.join(appRoot, 'runtime'));
    const offenders: string[] = [];

    for (const file of files) {
      const relativePath = normalizeRelativePath(path.relative(appRoot, file));
      if (allowedRelativePaths.has(relativePath)) {
        continue;
      }
      const source = await fs.readFile(file, 'utf8');
      if (source.includes('features/chat')) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
  });

  test('renderer app and feature code does not call SDK-owned sidecar/internal IPC channels', async () => {
    const roots = [
      path.join(rendererRoot, 'app'),
      path.join(rendererRoot, 'features'),
      path.join(rendererRoot, 'infrastructure/transcript'),
    ];
    const files = (await Promise.all(roots.map(root => listSourceFiles(root)))).flat();
    const offenders: string[] = [];
    const forbidden = [
      'INVOKE_CHANNELS.WINDIE_SEND',
      'INVOKE_CHANNELS.WINDIE_STOP',
      'INVOKE_CHANNELS.WINDIE_REHYDRATE',
      'INVOKE_CHANNELS.WINDIE_COMPACT_HISTORY',
      'INVOKE_CHANNELS.WINDIE_UPDATE_SETTINGS',
      'INVOKE_CHANNELS.WINDIE_LIST_MODELS',
      'INVOKE_CHANNELS.LIST_CHAT_CONVERSATIONS',
      'INVOKE_CHANNELS.SEARCH_CHAT_CONVERSATIONS',
      'INVOKE_CHANNELS.GET_CHAT_EVENTS',
      'INVOKE_CHANNELS.DELETE_CHAT_CONVERSATION',
      'INVOKE_CHANNELS.CLEAR_CHAT_HISTORY',
      'windie:send',
      'windie:stop',
      'windie:rehydrate',
      'windie:compact-history',
      'list-chat-conversations',
      'search-chat-conversations',
      'get-chat-events',
      'delete-chat-conversation',
      'clear-chat-history',
    ];

    for (const file of files) {
      const relativePath = normalizeRelativePath(path.relative(rendererRoot, file));
      if (allowedSdkOwnedInternalChannelPaths.has(relativePath)) {
        continue;
      }
      const source = await fs.readFile(file, 'utf8');
      if (forbidden.some((needle) => source.includes(needle))) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
  });
});
