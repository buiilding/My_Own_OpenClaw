import fs from 'node:fs/promises';
import path from 'node:path';

const chatRoot = path.resolve(__dirname, '../../frontend/src/renderer/features/chat');
const allowedRelativePaths = new Set([
  'session/desktopConversationRuntimeClient.ts',
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

describe('renderer chat runtime boundary', () => {
  test('chat feature code uses the desktop conversation runtime facade for backend commands', async () => {
    const files = await listSourceFiles(chatRoot);
    const offenders: string[] = [];

    for (const file of files) {
      const relativePath = path.relative(chatRoot, file);
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

  test('message sender leaves user transcript persistence to the runtime facade', async () => {
    const source = await fs.readFile(
      path.join(chatRoot, 'hooks/useChatMessageSender.ts'),
      'utf8',
    );

    expect(source).not.toContain('recordUserMessage');
  });

  test('chat feature transcript persistence calls stay inside the runtime facade', async () => {
    const persistenceCallerFiles = [
      'hooks/chatStream/useChatStreamCompletionHandler.ts',
      'hooks/chatStream/useChatStreamTerminalHandlers.ts',
      'hooks/chatStream/useChatStreamToolHandlers.ts',
      'utils/toolOutputTranscriptPersistence.ts',
    ];
    const offenders: string[] = [];

    for (const relativePath of persistenceCallerFiles) {
      const file = path.join(chatRoot, relativePath);
      const source = await fs.readFile(file, 'utf8');
      if (source.includes('infrastructure/transcript/TranscriptWriter')) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
  });

  test('chat feature session helpers stay inside the runtime facade', async () => {
    const files = await listSourceFiles(chatRoot);
    const offenders: string[] = [];

    for (const file of files) {
      const relativePath = path.relative(chatRoot, file);
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

  test('chat stream compaction persistence uses the desktop runtime facade', async () => {
    const source = await fs.readFile(
      path.join(chatRoot, 'hooks/chatStream/useChatStreamCompactionHandlers.ts'),
      'utf8',
    );

    expect(source).not.toContain('ElectronSidecarConversationStore');
    expect(source).toContain('DesktopConversationRuntimeClient.replaceCompactedReplay');
  });

  test('conversation replay rewrites use the desktop runtime facade', async () => {
    const source = await fs.readFile(
      path.join(chatRoot, 'hooks/useConversationReplayActions.js'),
      'utf8',
    );

    expect(source).not.toContain('ElectronSidecarConversationStore');
    expect(source).toContain('DesktopConversationRuntimeClient.editAndResend');
    expect(source).toContain('DesktopConversationRuntimeClient.retryTurn');
  });

  test('conversation inference rehydrate snapshots use the desktop runtime facade', async () => {
    const source = await fs.readFile(
      path.join(chatRoot, 'session/conversationInferenceSessionRuntime.ts'),
      'utf8',
    );

    expect(source).not.toContain('ElectronSidecarConversationStore');
    expect(source).toContain('DesktopConversationRuntimeClient.loadRehydrateSnapshot');
  });

  test('app conversation runtime facade delegates transcript storage to projection runtime', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopConversationRuntimeClient.ts'),
      'utf8',
    );

    expect(source).not.toContain('infrastructure/transcript/TranscriptWriter');
    expect(source).toContain('SdkConversationRuntime');
    expect(source).toContain('DesktopTranscriptProjectionRuntimeClient');
  });
});
