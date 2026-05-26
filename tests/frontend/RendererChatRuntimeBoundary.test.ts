import fs from 'node:fs/promises';
import path from 'node:path';

const rendererRoot = path.resolve(__dirname, '../../frontend/src/renderer');
const chatRoot = path.join(rendererRoot, 'features/chat');
const allowedRelativePaths = new Set<string>();

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
  test('chat feature code uses desktop runtime facades for backend commands', async () => {
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

  test('app live-turn runtime facade does not own transcript projection writes', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient.ts'),
      'utf8',
    );

    expect(source).not.toContain('recordUserMessage');
    expect(source).not.toContain('recordAssistantMessage');
    expect(source).not.toContain('recordToolMessage');
  });

  test('chat feature code does not use the live-turn facade for transcript session identity', async () => {
    const files = await listSourceFiles(chatRoot);
    const offenders: string[] = [];
    const forbiddenCalls = [
      'DesktopLiveTurnRuntimeClient.getActiveConversationRef',
      'DesktopLiveTurnRuntimeClient.getTranscriptSessionInfo',
      'DesktopLiveTurnRuntimeClient.setActiveConversationRef',
      'DesktopLiveTurnRuntimeClient.updateTranscriptSession',
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

  test('chat stream compaction persistence uses the continuity runtime facade', async () => {
    const source = await fs.readFile(
      path.join(chatRoot, 'hooks/chatStream/useChatStreamCompactionHandlers.ts'),
      'utf8',
    );

    expect(source).not.toContain('DesktopConversationStoreAdapter');
    expect(source).toContain('DesktopConversationContinuityService.replaceCompactedReplay');
    expect(source).not.toContain('DesktopLiveTurnRuntimeClient.replaceCompactedReplay');
    expect(source).not.toContain('DesktopLiveTurnRuntimeClient.replaceCompactedReplayFromBackendEvent');
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

  test('chat stream backend ingress normalization stays behind the app runtime', async () => {
    const source = await fs.readFile(
      path.join(chatRoot, 'hooks/useChatStream.ts'),
      'utf8',
    );

    expect(source).toContain('desktopChatStreamIngressRuntime');
    expect(source).not.toContain('chatStreamBackendIngress');
    expect(source).not.toContain('normalizeBackendEventToConversationEvent');
  });

  test('chat stream hooks do not import backend event contracts directly', async () => {
    const files = await listSourceFiles(path.join(chatRoot, 'hooks'));
    const offenders: string[] = [];

    for (const file of files) {
      const source = await fs.readFile(file, 'utf8');
      if (source.includes('types/backendEvents')) {
        offenders.push(path.relative(chatRoot, file));
      }
    }

    expect(offenders).toEqual([]);
  });

  test('chat stream event routing and stale-turn guards stay behind app runtime helpers', async () => {
    const source = await fs.readFile(
      path.join(chatRoot, 'hooks/useChatStream.ts'),
      'utf8',
    );

    expect(source).toContain('desktopChatStreamEventRuntime');
    expect(source).toContain('desktopChatStreamTrackingRuntime');
    expect(source).not.toContain('chatStreamEventRuntime');
    expect(source).not.toContain('chatStreamConversationGate');
    expect(source).not.toContain('chatStreamTurnGuard');
    expect(source).not.toContain('chatStreamTerminalHandoffGuard');
    expect(source).not.toContain('chatStreamTracking');
  });

  test('chat stream text state is owned by the SDK current-turn projection listener', async () => {
    await expect(fs.stat(
      path.join(chatRoot, 'hooks/chatStream/useChatStreamTextHandlers.ts'),
    )).rejects.toThrow();

    const streamSource = await fs.readFile(
      path.join(chatRoot, 'hooks/useChatStream.ts'),
      'utf8',
    );
    const projectionSource = await fs.readFile(
      path.join(chatRoot, 'hooks/useConversationRuntimeProjectionStream.ts'),
      'utf8',
    );

    expect(streamSource).not.toContain('assistant_delta');
    expect(streamSource).not.toContain('reasoning_delta');
    expect(projectionSource).toContain('SdkCurrentTurnProjection');
    expect(projectionSource).toContain('setThinkingStatus');
    expect(projectionSource).toContain('streaming-response');
  });

  test('chat stream consumes main-owned SDK conversation events instead of raw backend events', async () => {
    const streamSource = await fs.readFile(
      path.join(chatRoot, 'hooks/useChatStream.ts'),
      'utf8',
    );
    const ingressSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatStreamIngressRuntime.ts'),
      'utf8',
    );

    expect(streamSource).toContain('ON_CHANNELS.CONVERSATION_EVENT');
    expect(streamSource).not.toContain('ON_CHANNELS.FROM_BACKEND');
    expect(streamSource).not.toContain('handleBackendStreamIngress');
    expect(ingressSource).not.toContain('normalizeBackendEventToConversationEvent');
  });

  test('renderer subscriptions do not use raw backend channel for owned app paths', async () => {
    const files = await listSourceFiles(rendererRoot);
    const offenders: string[] = [];

    for (const file of files) {
      const relativePath = path.relative(rendererRoot, file);
      const source = await fs.readFile(file, 'utf8');
      if (source.includes('IpcBridge.on(ON_CHANNELS.FROM_BACKEND')) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
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

  test('chat stream terminal telemetry does not own live response phase', async () => {
    const source = await fs.readFile(
      path.join(chatRoot, 'hooks/chatStream/useChatStreamTerminalHandlers.ts'),
      'utf8',
    );

    expect(source).not.toContain("recordTrackingEvent('streaming-complete'");
    expect(source).not.toContain('setIsSending(');
    expect(source).not.toContain('setThinkingStatus(');
    expect(source).not.toContain('setThinkingSourceEventType(');
    expect(source).toContain("recordTrackingEvent('token-count'");
    expect(source).toContain("recordTrackingEvent('memory-store'");
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

  test('chat stream tool progress state is owned by the SDK current-turn projection listener', async () => {
    const streamSource = await fs.readFile(
      path.join(chatRoot, 'hooks/useChatStream.ts'),
      'utf8',
    );
    const projectionSource = await fs.readFile(
      path.join(chatRoot, 'hooks/useConversationRuntimeProjectionStream.ts'),
      'utf8',
    );

    expect(streamSource).not.toContain("event.type !== 'tool_progress'");
    expect(streamSource).not.toContain("event.type === 'tool_progress'");
    expect(projectionSource).toContain("toolEvent.kind === 'tool_progress'");
    expect(projectionSource).toContain('web-search-progress');
  });

  test('chat stream tool-call transcript persistence consumes SDK tool-call events directly', async () => {
    const source = await fs.readFile(
      path.join(chatRoot, 'hooks/chatStream/useChatStreamToolHandlers.ts'),
      'utf8',
    );

    expect(source).not.toContain('ToolCallEvent');
    expect(source).not.toContain("unwrapToolBackendEvent<ToolCallEvent>");
    expect(source).toContain("event.type !== 'tool_call'");
    expect(source).toContain('payload?.structuredPayload');
  });

  test('chat stream tool-output transcript persistence consumes SDK tool-output events directly', async () => {
    const source = await fs.readFile(
      path.join(chatRoot, 'hooks/chatStream/useChatStreamToolHandlers.ts'),
      'utf8',
    );

    expect(source).not.toContain('ToolOutputEvent');
    expect(source).not.toContain("unwrapToolBackendEvent<ToolOutputEvent>");
    expect(source).toContain("event.type !== 'tool_output'");
    expect(source).toContain('payload?.screenshotRef');
  });

  test('chat stream tool-bundle transcript persistence consumes SDK tool-bundle events directly', async () => {
    const source = await fs.readFile(
      path.join(chatRoot, 'hooks/chatStream/useChatStreamToolHandlers.ts'),
      'utf8',
    );

    expect(source).not.toContain('ToolBundleEvent');
    expect(source).not.toContain('unwrapToolBackendEvent');
    expect(source).toContain("event.type !== 'tool_bundle_call'");
    expect(source).toContain('payload.bundleId');
  });

  test('conversation replay rewrites use the continuity runtime facade', async () => {
    const source = await fs.readFile(
      path.join(chatRoot, 'hooks/useConversationReplayActions.js'),
      'utf8',
    );

    expect(source).not.toContain('DesktopConversationStoreAdapter');
    expect(source).toContain('DesktopConversationContinuityService.editAndResend');
    expect(source).toContain('DesktopConversationContinuityService.retryTurn');
    expect(source).not.toContain('DesktopLiveTurnRuntimeClient.editAndResend');
    expect(source).not.toContain('DesktopLiveTurnRuntimeClient.retryTurn');
  });

  test('renderer feature code routes active conversation selection through session helpers', async () => {
    const files = await listSourceFiles(path.resolve(__dirname, '../../frontend/src/renderer/features'));
    const offenders: string[] = [];

    for (const file of files) {
      const relativePath = path.relative(rendererRoot, file);
      const source = await fs.readFile(file, 'utf8');
      if (source.includes('.setActiveConversationRef(')) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
  });

  test('renderer feature code does not expose local tool execution IPC paths', async () => {
    const files = await listSourceFiles(path.resolve(__dirname, '../../frontend/src/renderer/features'));
    const offenders: string[] = [];
    const forbidden = [
      'sendToolResult',
      'sendToolBundleResult',
      'executeLocalTool',
      'executeTool(',
      "IpcBridge.send('tool-result'",
      "IpcBridge.send('tool-bundle-result'",
      'IpcBridge.send(SEND_CHANNELS.TOOL_RESULT',
      'IpcBridge.send(SEND_CHANNELS.TOOL_BUNDLE_RESULT',
    ];

    for (const file of files) {
      const relativePath = path.relative(rendererRoot, file);
      const source = await fs.readFile(file, 'utf8');
      if (forbidden.some(pattern => source.includes(pattern))) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
  });

  test('conversation inference rehydrate snapshots use the continuity runtime facade', async () => {
    const source = await fs.readFile(
      path.join(chatRoot, 'session/conversationInferenceSessionRuntime.ts'),
      'utf8',
    );

    expect(source).not.toContain('DesktopConversationStoreAdapter');
    expect(source).toContain('DesktopConversationContinuityService.loadLocalConversationSnapshot');
    expect(source).toContain('DesktopConversationContinuityService.rehydrateFromStore');
    expect(source).toContain('DesktopConversationContinuityService.rehydrateMessages');
    expect(source).not.toContain('DesktopLiveTurnRuntimeClient.loadRehydrateSnapshot');
    expect(source).not.toContain('DesktopLiveTurnRuntimeClient.loadLocalConversationSnapshot');
    expect(source).not.toContain('DesktopLiveTurnRuntimeClient.rehydrateFromStore');
    expect(source).not.toContain('DesktopLiveTurnRuntimeClient.rehydrate');
  });

  test('app live-turn runtime facade delegates transcript storage to projection runtime', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient.ts'),
      'utf8',
    );

    expect(source).not.toContain('infrastructure/transcript/TranscriptWriter');
    expect(source).toContain('createConversationRuntime');
    expect(source).not.toContain('recordUserMessage');
    expect(source).not.toContain('recordAssistantMessage');
    expect(source).not.toContain('recordToolMessage');
    expect(source).not.toContain('replaceCompactedReplay(');
    expect(source).not.toContain('loadLocalConversationSnapshot(');
    expect(source).not.toContain('loadRehydrateSnapshot(');
    expect(source).not.toContain('rehydrateFromStore(');
    expect(source).not.toContain('StaticRehydrateConversationStore');
    expect(source).not.toContain('RehydrateConversationEntry');
    expect(source).not.toContain('DesktopTranscriptProjectionRuntimeClient');
    expect(source).not.toContain('createSeededConversationRuntime');
    expect(source).not.toContain('editAndResend(input');
    expect(source).not.toContain('retryTurn(input');
    expect(source).not.toContain('compactHistory(');
    expect(/\n\s{2}rehydrate\(input/.test(source)).toBe(false);
    expect(source).not.toContain('setModel(');
    expect(source).not.toContain('getTranscriptSessionInfo()');
    expect(source).not.toContain('setActiveConversationRef(');
    expect(source).not.toContain('updateTranscriptSession(');
    expect(source).not.toContain('rewriteTranscriptProjection(input');
    expect(/\n\s{2}sendRehydrate\(input/.test(source)).toBe(false);
    expect(source).not.toContain('DesktopTranscriptProjectionRuntimeClient');
  });

  test('manual compaction uses the continuity runtime facade', async () => {
    const source = await fs.readFile(
      path.join(chatRoot, 'utils/session/manualCompactionRuntime.js'),
      'utf8',
    );

    expect(source).toContain('DesktopConversationContinuityService.compactHistory');
    expect(source).not.toContain('DesktopLiveTurnRuntimeClient.compactHistory');
  });

  test('app live-turn runtime facade does not expose raw stream ingress helpers', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient.ts'),
      'utf8',
    );

    expect(source).not.toContain('toBackendStreamEvent');
    expect(source).not.toContain('normalizeBackendStreamEvent');
    expect(source).not.toContain('normalizeBackendEventToConversationEvent');
  });
});
