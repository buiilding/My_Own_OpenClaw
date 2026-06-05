import fs from 'node:fs/promises';
import path from 'node:path';

const appRoot = path.resolve(__dirname, '../../frontend/src/renderer/app');
const allowedRelativePaths = new Set([
  'runtime/desktopChatStreamIngressRuntime.ts',
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
  test('conversation library facade uses SDK-shaped commands for user-facing conversation actions', async () => {
    const source = await fs.readFile(
      path.join(appRoot, 'runtime/desktopConversationLibraryClient.js'),
      'utf8',
    );

    expect(source).toContain('invokeWindieCommand');
    expect(source).toContain("'conversations.list'");
    expect(source).toContain("'conversations.search'");
    expect(source).toContain("'conversations.delete'");
    expect(source).toContain("'conversation.load'");
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

  test('app runtime modules do not import chat feature internals', async () => {
    const files = await listSourceFiles(path.join(appRoot, 'runtime'));
    const offenders: string[] = [];

    for (const file of files) {
      const relativePath = path.relative(appRoot, file);
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
});
