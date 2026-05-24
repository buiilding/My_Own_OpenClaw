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

  test('message sender keeps user transcript persistence behind its helper', async () => {
    const source = await fs.readFile(
      path.join(chatRoot, 'hooks/useChatMessageSender.ts'),
      'utf8',
    );

    expect(source).not.toContain('recordUserMessage');
    expect(source).not.toContain('DesktopTranscriptProjectionRuntimeClient');
    expect(source).toContain('recordUserTranscriptMessage');
  });

  test('app conversation runtime facade does not own transcript projection writes', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopConversationRuntimeClient.ts'),
      'utf8',
    );

    expect(source).not.toContain('recordUserMessage');
    expect(source).not.toContain('recordAssistantMessage');
    expect(source).not.toContain('recordToolMessage');
  });

  test('chat feature code does not use the conversation command facade for transcript session identity', async () => {
    const files = await listSourceFiles(chatRoot);
    const offenders: string[] = [];
    const forbiddenCalls = [
      'DesktopConversationRuntimeClient.getActiveConversationRef',
      'DesktopConversationRuntimeClient.getTranscriptSessionInfo',
      'DesktopConversationRuntimeClient.setActiveConversationRef',
      'DesktopConversationRuntimeClient.updateTranscriptSession',
    ];

    for (const file of files) {
      const relativePath = path.relative(chatRoot, file);
      if (allowedRelativePaths.has(relativePath)) {
        continue;
      }
      const source = await fs.readFile(file, 'utf8');
      if (forbiddenCalls.some((call) => source.includes(call))) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
  });

  test('chat stream transcript writes stay behind the transcript persistence helper', async () => {
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
      if (
        source.includes('DesktopTranscriptProjectionRuntimeClient')
        || source.includes('recordAssistantMessage')
        || source.includes('recordToolMessage')
        || source.includes('infrastructure/transcript/TranscriptWriter')
      ) {
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

  test('chat feature code loads local conversation snapshots through runtime facades', async () => {
    const files = await listSourceFiles(chatRoot);
    const offenders: string[] = [];

    for (const file of files) {
      const relativePath = path.relative(chatRoot, file);
      if (allowedRelativePaths.has(relativePath)) {
        continue;
      }
      const source = await fs.readFile(file, 'utf8');
      if (source.includes('conversationLocalSnapshotLoader')) {
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

    expect(source).not.toContain('DesktopConversationStoreAdapter');
    expect(source).toContain('DesktopConversationRuntimeClient.replaceCompactedReplay');
    expect(source).not.toContain('DesktopConversationRuntimeClient.replaceCompactedReplayFromBackendEvent');
  });

  test('chat stream terminal handlers consume SDK events directly', async () => {
    const source = await fs.readFile(
      path.join(chatRoot, 'hooks/chatStream/useChatStreamTerminalHandlers.ts'),
      'utf8',
    );

    expect(source).not.toContain('unwrapErrorBackendEvent');
    expect(source).not.toContain('unwrapTokenCountBackendEvent');
    expect(source).not.toContain('unwrapMemoryStoreBackendEvent');
    expect(source).not.toContain('types/backendEvents');
    expect(source).toContain('ConversationEvent');
  });

  test('chat stream text handlers consume SDK reasoning events directly', async () => {
    const source = await fs.readFile(
      path.join(chatRoot, 'hooks/chatStream/useChatStreamTextHandlers.ts'),
      'utf8',
    );

    expect(source).not.toContain('unwrapLlmThoughtBackendEvent');
    expect(source).not.toContain('LlmThoughtEvent');
    expect(source).not.toContain('types/backendEvents');
    expect(source).toContain('ConversationEvent');
  });

  test('chat stream completion handler consumes SDK completion identity directly', async () => {
    const source = await fs.readFile(
      path.join(chatRoot, 'hooks/chatStream/useChatStreamCompletionHandler.ts'),
      'utf8',
    );

    expect(source).not.toContain('payload.rawEvent');
    expect(source).not.toContain('rawConversationRef');
    expect(source).not.toContain('rawUserId');
    expect(source).toContain('event.conversationRef');
    expect(source).toContain('payload?.userId');
  });

  test('chat stream local-user display consumes SDK user-message events directly', async () => {
    const streamSource = await fs.readFile(
      path.join(chatRoot, 'hooks/useChatStream.ts'),
      'utf8',
    );
    const handlerSource = await fs.readFile(
      path.join(chatRoot, 'hooks/chatStream/useChatStreamLocalUserHandler.ts'),
      'utf8',
    );

    expect(streamSource).not.toContain("if (event.type === 'local-user-message')");
    expect(streamSource).toContain("event.type !== 'user_message'");
    expect(handlerSource).not.toContain('LocalUserMessageEvent');
    expect(handlerSource).toContain("event.type !== 'user_message'");
    expect(handlerSource).toContain('payload?.screenshotRefs');
  });

  test('chat stream tool progress consumes SDK tool progress directly', async () => {
    const source = await fs.readFile(
      path.join(chatRoot, 'hooks/chatStream/useChatStreamToolHandlers.ts'),
      'utf8',
    );

    expect(source).not.toContain('unwrapWebSearchProgressBackendEvent');
    expect(source).not.toContain('WebSearchProgressEvent');
    expect(source).toContain("event.type !== 'tool_progress'");
    expect(source).toContain('payload?.requestId');
  });

  test('chat stream tool-call display consumes SDK tool-call events directly', async () => {
    const source = await fs.readFile(
      path.join(chatRoot, 'hooks/chatStream/useChatStreamToolHandlers.ts'),
      'utf8',
    );

    expect(source).not.toContain('ToolCallEvent');
    expect(source).not.toContain("unwrapToolBackendEvent<ToolCallEvent>");
    expect(source).toContain("event.type !== 'tool_call'");
    expect(source).toContain('payload?.structuredPayload');
  });

  test('chat stream tool-output display consumes SDK tool-output events directly', async () => {
    const source = await fs.readFile(
      path.join(chatRoot, 'hooks/chatStream/useChatStreamToolHandlers.ts'),
      'utf8',
    );

    expect(source).not.toContain('ToolOutputEvent');
    expect(source).not.toContain("unwrapToolBackendEvent<ToolOutputEvent>");
    expect(source).toContain("event.type !== 'tool_output'");
    expect(source).toContain('payload?.screenshotRef');
  });

  test('chat stream tool-bundle display consumes SDK tool-bundle events directly', async () => {
    const source = await fs.readFile(
      path.join(chatRoot, 'hooks/chatStream/useChatStreamToolHandlers.ts'),
      'utf8',
    );

    expect(source).not.toContain('ToolBundleEvent');
    expect(source).not.toContain('unwrapToolBackendEvent');
    expect(source).toContain("event.type !== 'tool_bundle_call'");
    expect(source).toContain('payload.bundleId');
  });

  test('conversation replay rewrites use the desktop runtime facade', async () => {
    const source = await fs.readFile(
      path.join(chatRoot, 'hooks/useConversationReplayActions.js'),
      'utf8',
    );

    expect(source).not.toContain('DesktopConversationStoreAdapter');
    expect(source).toContain('DesktopConversationRuntimeClient.editAndResend');
    expect(source).toContain('DesktopConversationRuntimeClient.retryTurn');
  });

  test('conversation inference rehydrate snapshots use the desktop runtime facade', async () => {
    const source = await fs.readFile(
      path.join(chatRoot, 'session/conversationInferenceSessionRuntime.ts'),
      'utf8',
    );

    expect(source).not.toContain('DesktopConversationStoreAdapter');
    expect(source).not.toContain('DesktopConversationRuntimeClient.loadRehydrateSnapshot');
    expect(source).toContain('DesktopConversationRuntimeClient.rehydrateFromStore');
  });

  test('app conversation runtime facade delegates transcript storage to projection runtime', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopConversationRuntimeClient.ts'),
      'utf8',
    );

    expect(source).not.toContain('infrastructure/transcript/TranscriptWriter');
    expect(source).toContain('createConversationRuntime');
    expect(source).not.toContain('recordUserMessage');
    expect(source).not.toContain('recordAssistantMessage');
    expect(source).not.toContain('recordToolMessage');
    expect(source).not.toContain('getTranscriptSessionInfo()');
    expect(source).not.toContain('setActiveConversationRef(');
    expect(source).not.toContain('updateTranscriptSession(');
    expect(source).not.toContain('rewriteTranscriptProjection(input');
    expect(/\n\s{2}sendRehydrate\(input/.test(source)).toBe(false);
    expect(source).toContain('DesktopTranscriptProjectionRuntimeClient');
  });

  test('app conversation runtime facade does not expose raw stream ingress helpers', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopConversationRuntimeClient.ts'),
      'utf8',
    );

    expect(source).not.toContain('toBackendStreamEvent');
    expect(source).not.toContain('normalizeBackendStreamEvent');
    expect(source).not.toContain('normalizeBackendEventToConversationEvent');
  });
});
