/**
 * Covers renderer chat runtime boundary. behavior in the frontend test suite.
 */

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

  test('renderer feature modules do not import infrastructure modules directly', async () => {
    const featureRoot = path.join(rendererRoot, 'features');
    const files = await listSourceFiles(featureRoot);
    const offenders: string[] = [];

    for (const file of files) {
      const relativePath = path.relative(featureRoot, file);
      const source = await fs.readFile(file, 'utf8');
      if (source.includes('infrastructure/')) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
  });

  test('chat feature code reads SDK conversation contracts through app runtime facade', async () => {
    const files = await listSourceFiles(chatRoot);
    const offenders: string[] = [];
    const contractsSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopConversationRuntimeContracts.ts'),
      'utf8',
    );

    for (const file of files) {
      const relativePath = path.relative(chatRoot, file);
      const source = await fs.readFile(file, 'utf8');
      if (source.includes('infrastructure/api/agentSdkClient')) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
    expect(contractsSource).toContain('infrastructure/api/agentSdkClient');
  });

  test('chat feature code builds deferred model selection through app runtime facade', async () => {
    const files = await listSourceFiles(chatRoot);
    const offenders: string[] = [];
    const runtimeClientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopRendererConfigRuntimeClient.js'),
      'utf8',
    );

    for (const file of files) {
      const relativePath = path.relative(chatRoot, file);
      const source = await fs.readFile(file, 'utf8');
      if (source.includes('app/providers/appConfigRuntimeSync')) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
    expect(runtimeClientSource).toContain('buildDeferredQueryModelSelection');
  });

  test('chat runtime hooks read app config through renderer config runtime facade', async () => {
    const hookFiles = [
      'components/ChatInterface.jsx',
      'hooks/useChatMessageSender.ts',
      'hooks/useChatStream.ts',
      'hooks/useChatSurfaceController.js',
      'hooks/useConversationReplayActions.js',
    ];
    const runtimeClientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopRendererConfigRuntimeClient.js'),
      'utf8',
    );

    for (const relativePath of hookFiles) {
      const source = await fs.readFile(path.join(chatRoot, relativePath), 'utf8');
      expect(source).toContain('desktopRendererConfigRuntimeClient');
      expect(source).not.toContain('app/providers/AppConfigContext');
      expect(source).not.toContain('useAppConfigContext');
    }
    expect(runtimeClientSource).toContain('useAppConfigContext');
    expect(runtimeClientSource).toContain('useDesktopRendererConfigContext');
  });

  test('message sender does not persist live user transcript rows in renderer', async () => {
    const hookSource = await fs.readFile(
      path.join(chatRoot, 'hooks/useChatMessageSender.ts'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.join(chatRoot, 'utils/messageSender/desktopChatSendPreparation.ts'),
      'utf8',
    );

    expect(hookSource).not.toContain('recordUserTranscriptMessage');
    expect(hookSource).not.toContain('recordUserMessage');
    expect(helperSource).not.toContain('recordUserTranscriptMessage');
    expect(helperSource).not.toContain('recordTranscriptUserMessage');
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

  test('chat stream live handlers do not persist transcript rows in renderer', async () => {
    const persistenceCallerFiles = [
      'hooks/chatStream/useChatStreamCompletionHandler.ts',
      'hooks/chatStream/useChatStreamTerminalHandlers.ts',
    ];
    const offenders: string[] = [];

    for (const relativePath of persistenceCallerFiles) {
      const file = path.join(chatRoot, relativePath);
      const source = await fs.readFile(file, 'utf8');
      if (
        source.includes('recordAssistantMessage')
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

  test('renderer feature and app code does not own backend-wire event helpers', async () => {
    const backendEventContractPath = path.join(
      path.resolve(__dirname, '../..'),
      'frontend/src/renderer/types/backendEvents.ts',
    );

    await expect(fs.access(backendEventContractPath)).rejects.toThrow();

    const rendererRoot = path.resolve(chatRoot, '../..');
    const files = (await Promise.all([
      listSourceFiles(path.join(rendererRoot, 'app')),
      listSourceFiles(path.join(rendererRoot, 'features')),
    ])).flat();
    const offenders: string[] = [];
    const forbiddenBackendWireNeedles = [
      'types/backendEvents',
      'events/backendEvents',
      'normalizeBackendEventToConversationEvent',
      'unwrapToolBackendEvent',
      'unwrapErrorBackendEvent',
      'unwrapTokenCountBackendEvent',
      'unwrapMemoryStoreBackendEvent',
      'unwrapBackendEvent',
      'ON_CHANNELS.FROM_BACKEND',
      'WINDIE_FROM_BACKEND',
      'from-backend',
    ];

    for (const file of files) {
      const source = await fs.readFile(file, 'utf8');
      if (forbiddenBackendWireNeedles.some((needle) => source.includes(needle))) {
        offenders.push(path.relative(rendererRoot, file));
      }
    }

    expect(offenders).toEqual([]);
  });

  test('dashboard memory feature code routes through the desktop memory runtime client', async () => {
    const dashboardRoot = path.resolve(
      __dirname,
      '../../frontend/src/renderer/features/dashboard',
    );
    const files = [
      path.join(dashboardRoot, 'components/sections/MemorySection.jsx'),
      path.join(dashboardRoot, 'components/sections/MemoryItem.jsx'),
      path.join(dashboardRoot, 'components/sections/memorySectionData.js'),
      path.join(dashboardRoot, 'components/sections/memorySectionState.js'),
    ];
    const offenders: string[] = [];

    for (const file of files) {
      const source = await fs.readFile(file, 'utf8');
      if (
        source.includes('LIST_EPISODIC_MEMORIES')
        || source.includes('LIST_SEMANTIC_MEMORIES')
        || source.includes('DELETE_EPISODIC_MEMORY')
        || source.includes('DELETE_SEMANTIC_MEMORY')
        || source.includes('CLEAR_LOCAL_MEMORY')
        || source.includes('CLEAR_CHAT_HISTORY')
        || source.includes('MEMORY_STORE_CHANGED')
        || source.includes('DESKTOP_RUNTIME_ON_CHANNELS')
        || source.includes('window.ipc')
      ) {
        offenders.push(path.relative(dashboardRoot, file));
      }
    }

    expect(offenders).toEqual([]);
  });

  test('dashboard MCP section routes registry IPC through app runtime client', async () => {
    const sectionSource = await fs.readFile(
      path.resolve(
        __dirname,
        '../../frontend/src/renderer/features/dashboard/components/sections/McpsSection.jsx',
      ),
      'utf8',
    );
    const clientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopMcpRuntimeClient.ts'),
      'utf8',
    );

    expect(sectionSource).not.toContain('IpcBridge');
    expect(sectionSource).not.toContain('INVOKE_CHANNELS');
    expect(sectionSource).not.toContain('LIST_MCP_SERVERS');
    expect(sectionSource).not.toContain('REFRESH_MCP_SERVERS');
    expect(sectionSource).not.toContain('SET_MCP_SERVER_ENABLED');
    expect(sectionSource).toContain('DesktopMcpRuntimeClient.listMcpServers');
    expect(sectionSource).toContain('DesktopMcpRuntimeClient.refreshMcpServers');
    expect(sectionSource).toContain('DesktopMcpRuntimeClient.setMcpServerEnabled');
    expect(clientSource).toContain('INVOKE_CHANNELS.LIST_MCP_SERVERS');
    expect(clientSource).toContain('INVOKE_CHANNELS.REFRESH_MCP_SERVERS');
    expect(clientSource).toContain('INVOKE_CHANNELS.SET_MCP_SERVER_ENABLED');
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
    const projectionSideEffectsSource = await fs.readFile(
      path.join(chatRoot, 'utils/state/currentTurnProjectionSideEffects.ts'),
      'utf8',
    );

    expect(streamSource).not.toContain('assistant_delta');
    expect(streamSource).not.toContain('reasoning_delta');
    expect(projectionSource).toContain('SdkCurrentTurnProjection');
    expect(projectionSource).toContain('applyCurrentTurnProjectionSideEffects');
    expect(projectionSideEffectsSource).toContain('setThinkingStatus');
    expect(projectionSideEffectsSource).toContain('streaming-response');
  });

  test('chat stream consumes main-owned SDK conversation events instead of backend-wire events', async () => {
    const streamSource = await fs.readFile(
      path.join(chatRoot, 'hooks/useChatStream.ts'),
      'utf8',
    );
    const ingressSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatStreamIngressRuntime.ts'),
      'utf8',
    );
    const eventClientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopConversationRuntimeEventClient.ts'),
      'utf8',
    );

    expect(streamSource).toContain('DesktopConversationRuntimeEventClient.onConversationEvent');
    expect(streamSource).not.toContain('DESKTOP_RUNTIME_ON_CHANNELS.CONVERSATION_EVENT');
    expect(streamSource).not.toContain('ON_CHANNELS.WINDIE_CONVERSATION_EVENT');
    expect(streamSource).not.toContain('ON_CHANNELS.FROM_BACKEND');
    expect(streamSource).not.toContain('handleBackendStreamIngress');
    expect(ingressSource).not.toContain('normalizeBackendEventToConversationEvent');
    expect(eventClientSource).toContain('DESKTOP_RUNTIME_ON_CHANNELS.CONVERSATION_EVENT');
  });

  test('chat screenshot presentation builds artifact URLs through app runtime client', async () => {
    const screenshotSource = await fs.readFile(
      path.join(chatRoot, 'utils/message/messageScreenshots.js'),
      'utf8',
    );
    const resolvedScreenshotSource = await fs.readFile(
      path.join(chatRoot, 'utils/message/useResolvedMessageScreenshots.js'),
      'utf8',
    );
    const replayActionsSource = await fs.readFile(
      path.join(chatRoot, 'hooks/useConversationReplayActions.js'),
      'utf8',
    );
    const dataUrlImageSource = await fs.readFile(
      path.join(chatRoot, 'utils/dataUrlImageUtils.js'),
      'utf8',
    );
    const chatStreamEventSource = await fs.readFile(
      path.join(chatRoot, 'utils/chatStream/chatStreamEventUtils.ts'),
      'utf8',
    );
    const artifactClientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopArtifactRuntimeClient.ts'),
      'utf8',
    );
    const endpointClientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopRuntimeEndpointClient.ts'),
      'utf8',
    );

    expect(screenshotSource).toContain('DesktopArtifactRuntimeClient.buildArtifactUrl');
    expect(screenshotSource).not.toContain('RuntimeEndpointStore');
    expect(screenshotSource).not.toContain('buildRuntimeArtifactUrl');
    for (const source of [
      screenshotSource,
      resolvedScreenshotSource,
      replayActionsSource,
      dataUrlImageSource,
      chatStreamEventSource,
    ]) {
      expect(source).not.toContain('infrastructure/services/screenshotMessageState');
      expect(source).not.toContain('infrastructure/services/ArtifactImageUtils');
    }
    expect(screenshotSource).toContain('DesktopArtifactRuntimeClient.resolveScreenshotAttachmentState');
    expect(screenshotSource).toContain('DesktopArtifactRuntimeClient.normalizeArtifactImageContentType');
    expect(resolvedScreenshotSource).toContain('DesktopArtifactRuntimeClient.inferArtifactRefFromUrl');
    expect(replayActionsSource).toContain('DesktopArtifactRuntimeClient.resolveReplayScreenshotState');
    expect(dataUrlImageSource).toContain('DesktopArtifactRuntimeClient.resolveArtifactImageExtension');
    expect(chatStreamEventSource).toContain('DesktopArtifactRuntimeClient.buildRemoteScreenshotAttachment');
    expect(artifactClientSource).toContain('DesktopRuntimeEndpointClient.buildArtifactUrl');
    expect(artifactClientSource).toContain('resolveScreenshotAttachmentState');
    expect(artifactClientSource).toContain('normalizeArtifactImageContentType');
    expect(endpointClientSource).toContain('buildRuntimeArtifactUrl');
  });

  test('chat startup mode reads through app runtime client', async () => {
    const chatInterfaceSource = await fs.readFile(
      path.join(chatRoot, 'components/ChatInterface.jsx'),
      'utf8',
    );
    const startupClientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopStartupRuntimeClient.ts'),
      'utf8',
    );

    expect(chatInterfaceSource).toContain('DesktopStartupRuntimeClient.isVmModeEnabled');
    expect(chatInterfaceSource).not.toContain('infrastructure/runtime/vmMode');
    expect(startupClientSource).toContain('isVmModeEnabled');
  });

  test('dashboard conversation hook subscribes through app runtime conversation event client', async () => {
    const dashboardHookSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/features/dashboard/hooks/useDashboardConversations.js'),
      'utf8',
    );
    const eventClientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopConversationRuntimeEventClient.ts'),
      'utf8',
    );
    const localRuntimeStatusClientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopLocalRuntimeStatusRuntimeClient.ts'),
      'utf8',
    );

    expect(dashboardHookSource).toContain('DesktopConversationRuntimeEventClient.onConversationEvent');
    expect(dashboardHookSource).toContain('DesktopLocalRuntimeStatusRuntimeClient.subscribe');
    expect(dashboardHookSource).toContain('DesktopLocalRuntimeStatusRuntimeClient.getSnapshot');
    expect(dashboardHookSource).not.toContain('DESKTOP_RUNTIME_ON_CHANNELS.CONVERSATION_EVENT');
    expect(dashboardHookSource).not.toContain('infrastructure/runtime/localRuntimeStatusStore');
    expect(dashboardHookSource).not.toContain('IpcBridge.on');
    expect(eventClientSource).toContain('DESKTOP_RUNTIME_ON_CHANNELS.CONVERSATION_EVENT');
    expect(localRuntimeStatusClientSource).toContain('subscribeLocalRuntimeStatusStore');
    expect(localRuntimeStatusClientSource).toContain('getLocalRuntimeStatusSnapshot');
  });

  test('conversation runtime projections subscribe through app runtime client', async () => {
    const projectionSource = await fs.readFile(
      path.join(chatRoot, 'hooks/useConversationRuntimeProjectionStream.ts'),
      'utf8',
    );
    const eventClientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopConversationRuntimeEventClient.ts'),
      'utf8',
    );

    expect(projectionSource).not.toContain('DESKTOP_RUNTIME_ON_CHANNELS');
    expect(projectionSource).not.toContain('IpcBridge.on');
    expect(projectionSource).not.toContain('infrastructure/transcript/sdkDisplayChatMessageProjection');
    expect(projectionSource).toContain('desktopConversationDisplayProjection');
    expect(projectionSource).toContain('DesktopConversationRuntimeEventClient.onPendingTurn');
    expect(projectionSource).toContain('DesktopConversationRuntimeEventClient.onCurrentTurn');
    expect(projectionSource).toContain('DesktopConversationRuntimeEventClient.onDisplayRows');
    expect(eventClientSource).toContain('DESKTOP_RUNTIME_ON_CHANNELS.PENDING_TURN');
    expect(eventClientSource).toContain('DESKTOP_RUNTIME_ON_CHANNELS.CURRENT_TURN');
    expect(eventClientSource).toContain('DESKTOP_RUNTIME_ON_CHANNELS.ROWS');
  });

  test('dashboard conversation resume projects display rows through app runtime client', async () => {
    const dashboardHookSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/features/dashboard/hooks/useDashboardConversations.js'),
      'utf8',
    );
    const displayProjectionSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopConversationDisplayProjection.ts'),
      'utf8',
    );

    expect(dashboardHookSource).not.toContain('infrastructure/transcript/sdkDisplayChatMessageProjection');
    expect(dashboardHookSource).toContain('desktopConversationDisplayProjection');
    expect(displayProjectionSource).toContain('sdkDisplayChatMessageProjection');
  });

  test('chat markdown display reads renderer markdown helpers through app runtime client', async () => {
    const files = [
      path.join(chatRoot, 'utils/message/markdownMessageRendering.js'),
      path.join(chatRoot, 'utils/message/threadFindState.js'),
      path.join(chatRoot, 'components/message/content/MarkdownMessage.jsx'),
      path.join(chatRoot, 'components/message/content/HighlightedPlainText.jsx'),
    ];
    const markdownClientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopMarkdownRuntimeClient.ts'),
      'utf8',
    );

    for (const file of files) {
      const source = await fs.readFile(file, 'utf8');
      expect(source).not.toContain('infrastructure/markdown');
      expect(source).not.toContain('infrastructure/llmOutputContract');
      expect(source).toContain('desktopMarkdownRuntimeClient');
    }
    expect(markdownClientSource).toContain('infrastructure/markdown');
    expect(markdownClientSource).toContain('infrastructure/llmOutputContract');
  });

  test('chat message state helpers route transcript builders through app runtime client', async () => {
    const files = [
      path.join(chatRoot, 'utils/toolOutputMessages.ts'),
      path.join(chatRoot, 'utils/chatStream/chatStreamMessageUpdates.ts'),
      path.join(chatRoot, 'utils/message/messageTransparency.js'),
      path.join(chatRoot, 'utils/message/liveTurnPresentationMessages.js'),
      path.join(chatRoot, 'utils/state/chatBoxResponseState.js'),
    ];
    const chatMessageClientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatMessageRuntimeClient.ts'),
      'utf8',
    );

    for (const file of files) {
      const source = await fs.readFile(file, 'utf8');
      expect(source).not.toContain('infrastructure/transcript/toolCall');
      expect(source).not.toContain('infrastructure/transcript/toolOutputChatMessageState');
      expect(source).not.toContain('infrastructure/transcript/toolSchemaShape');
      expect(source).not.toContain('infrastructure/text/incomingTextNormalization');
      expect(source).toContain('desktopChatMessageRuntimeClient');
    }
    expect(chatMessageClientSource).toContain('infrastructure/transcript/toolCallMessageState');
    expect(chatMessageClientSource).toContain('infrastructure/transcript/toolCallChatMessageState');
    expect(chatMessageClientSource).toContain('infrastructure/transcript/toolOutputChatMessageState');
    expect(chatMessageClientSource).toContain('infrastructure/transcript/toolSchemaShape');
    expect(chatMessageClientSource).toContain('infrastructure/text/incomingTextNormalization');
  });

  test('renderer feature hooks read latest-ref helper through app runtime facade', async () => {
    const featureRoot = path.join(rendererRoot, 'features');
    const files = await listSourceFiles(featureRoot);
    const offenders: string[] = [];
    const hookClientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopRendererHooksRuntimeClient.ts'),
      'utf8',
    );

    for (const file of files) {
      const relativePath = path.relative(featureRoot, file);
      const source = await fs.readFile(file, 'utf8');
      if (source.includes('infrastructure/hooks/useLatestRef')) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
    expect(hookClientSource).toContain('infrastructure/hooks/useLatestRef');
  });

  test('renderer subscriptions do not use backend-wire channel for owned app paths', async () => {
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
    expect(source).not.toContain('payload.sourceEvent');
    expect(source).not.toContain('rawConversationRef');
    expect(source).not.toContain('rawUserId');
    expect(source).toContain('event.conversationRef');
    expect(source).not.toContain('payload?.userId');
    expect(source).not.toContain('recordAssistantTranscriptMessage');
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
    expect(source).not.toContain('rawEvent');
    expect(source).toContain("recordTrackingEvent('token-count'");
    expect(source).not.toContain("recordTrackingEvent('memory-store'");
  });

  test('chat stream local-user display is owned by SDK display rows', async () => {
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
    expect(handlerSource).not.toContain('payload?.screenshotRefs');
    expect(handlerSource).not.toContain('addMessage(');
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
    const projectionSideEffectsSource = await fs.readFile(
      path.join(chatRoot, 'utils/state/currentTurnProjectionSideEffects.ts'),
      'utf8',
    );

    expect(streamSource).not.toContain("event.type !== 'tool_progress'");
    expect(streamSource).not.toContain("event.type === 'tool_progress'");
    expect(projectionSource).toContain('applyCurrentTurnProjectionSideEffects');
    expect(projectionSideEffectsSource).toContain("toolEvent.kind === 'tool_progress'");
    expect(projectionSideEffectsSource).toContain('web-search-progress');
  });

  test('chat stream tool display state stays with the SDK current-turn projection listener', async () => {
    await expect(fs.stat(
      path.join(chatRoot, 'hooks/chatStream/useChatStreamToolHandlers.ts'),
    )).rejects.toThrow();

    const source = await fs.readFile(
      path.join(chatRoot, 'hooks/useChatStream.ts'),
      'utf8',
    );
    const projectionSideEffectsSource = await fs.readFile(
      path.join(chatRoot, 'utils/state/currentTurnProjectionSideEffects.ts'),
      'utf8',
    );

    expect(source).not.toContain('ToolCallEvent');
    expect(source).not.toContain("unwrapToolBackendEvent<ToolCallEvent>");
    expect(source).not.toContain('recordToolTranscriptMessage');
    expect(source).not.toContain('ToolOutputEvent');
    expect(source).not.toContain("unwrapToolBackendEvent<ToolOutputEvent>");
    expect(source).not.toContain('recordToolOutputTranscriptMessage');
    expect(source).not.toContain('ToolBundleEvent');
    expect(source).not.toContain('unwrapToolBackendEvent');
    expect(source).toContain("event.type === 'tool_call'");
    expect(source).toContain("event.type === 'tool_output'");
    expect(source).toContain("event.type === 'tool_bundle_call'");
    expect(source).toContain("event.type === 'tool_bundle_output'");
    expect(projectionSideEffectsSource).toContain("toolEvent.kind === 'tool_call'");
    expect(projectionSideEffectsSource).toContain("toolEvent.kind === 'tool_output'");
  });

  test('conversation replay prepares with continuity and dispatches with live-turn send', async () => {
    const source = await fs.readFile(
      path.join(chatRoot, 'hooks/useConversationReplayActions.js'),
      'utf8',
    );

    expect(source).not.toContain('DesktopConversationStoreAdapter');
    expect(source).toContain('DesktopConversationContinuityService.prepareEditAndResend');
    expect(source).toContain('DesktopConversationContinuityService.prepareRetryTurn');
    expect(source).toContain('dispatchPreparedDesktopChatTurn');
    expect(source).not.toContain('recordTranscriptUserMessage');
    expect(source).not.toContain('DesktopLiveTurnRuntimeClient.sendQuery');
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

  test('chat provider delegates active conversation projection to session runtime', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/providers/ChatProvider.jsx'),
      'utf8',
    );

    expect(source).toContain('useConversationSessionProjection');
    expect(source).not.toContain('applyChatConversationProjection');
    expect(source).not.toContain('setActiveConversationRef');
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

  test('minimal chat surfaces route state traces through gated debug helpers', async () => {
    const relativePaths = [
      'features/minimalChatPill/components/MinimalChatPill.jsx',
      'features/minimalChatPill/components/MinimalResponseOverlay.jsx',
      'features/minimalChatPill/hooks/useResponseOverlayWindowSync.js',
    ];
    const forbidden = [
      "console.log('[ChatPillState][renderer]'",
      "console.log('[ResponseOverlayState][renderer]'",
      "console.log('[ResponseOverlayWindowSync][renderer]'",
    ];
    const offenders: string[] = [];

    for (const relativePath of relativePaths) {
      const source = await fs.readFile(
        path.join(rendererRoot, relativePath),
        'utf8',
      );
      if (forbidden.some((needle) => source.includes(needle))) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
  });

  test('renderer does not own backend inference rehydrate state', async () => {
    await expect(fs.access(
      path.join(chatRoot, 'session/conversationInferenceSessionRuntime.ts'),
    )).rejects.toThrow();

    const senderSource = await fs.readFile(
      path.join(chatRoot, 'utils/messageSender/desktopChatSendPreparation.ts'),
      'utf8',
    );

    expect(senderSource).not.toContain('rehydrateFromStore');
    expect(senderSource).not.toContain('loadRehydrateSnapshot');
    expect(senderSource).not.toContain('ConversationInferenceSession');
  });

  test('app live-turn runtime facade delegates transcript storage to projection runtime', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient.ts'),
      'utf8',
    );

    expect(source).not.toContain('infrastructure/transcript/TranscriptWriter');
    expect(source).not.toContain('createConversationRuntime');
    expect(source).not.toContain('recordUserMessage');
    expect(source).not.toContain('recordAssistantMessage');
    expect(source).not.toContain('recordToolMessage');
    expect(source).not.toContain('replaceCompactedReplay(');
    expect(source).not.toContain('loadLocalConversationSnapshot(');
    expect(source).not.toContain('loadRehydrateSnapshot(');
    expect(source).not.toContain('rehydrateFromStore(');
    expect(source).not.toContain('StaticRehydrateConversationStore');
    expect(source).not.toContain('RehydrateConversationEntry');
    expect(source).not.toContain('createSeededConversationRuntime');
    expect(source).not.toContain('editAndResend(input');
    expect(source).not.toContain('retryTurn(input');
    expect(source).not.toContain('compactHistory(');
    expect(/\n\s{2}rehydrate\(input/.test(source)).toBe(false);
    expect(source).not.toContain('setModel(');
    expect(source).not.toContain('getTranscriptSessionInfo()');
    expect(source).not.toContain('setActiveConversationRef(');
    expect(source).not.toContain('updateTranscriptSession(');
    expect(/\n\s{2}sendRehydrate\(input/.test(source)).toBe(false);
  });

  test('manual compaction uses the continuity runtime facade', async () => {
    const source = await fs.readFile(
      path.join(chatRoot, 'utils/session/manualCompactionRuntime.js'),
      'utf8',
    );

    expect(source).toContain('DesktopConversationContinuityService.compactHistory');
    expect(source).not.toContain('DesktopLiveTurnRuntimeClient.compactHistory');
  });

  test('chat send and stop code routes pending-turn IPC through app runtime client', async () => {
    const checkedPaths = [
      path.join(chatRoot, 'hooks/useChatMessageSender.ts'),
      path.join(chatRoot, 'hooks/useStopTurnHandler.js'),
      path.join(chatRoot, 'utils/messageSender/desktopChatSendPreparation.ts'),
    ];
    const offenders: string[] = [];

    for (const filePath of checkedPaths) {
      const source = await fs.readFile(filePath, 'utf8');
      if (
        source.includes('DESKTOP_RUNTIME_SEND_CHANNELS')
        || source.includes('PENDING_TURN')
        || source.includes('infrastructure/ipc/channels')
      ) {
        offenders.push(path.relative(rendererRoot, filePath));
      }
    }

    const clientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopPendingTurnRuntimeClient.ts'),
      'utf8',
    );

    expect(offenders).toEqual([]);
    expect(clientSource).toContain('DESKTOP_RUNTIME_SEND_CHANNELS.PENDING_TURN');
  });

  test('chat stream debug trace routes live-surface IPC through app runtime client', async () => {
    const source = await fs.readFile(
      path.join(chatRoot, 'utils/chatStream/chatStreamDebugTrace.ts'),
      'utf8',
    );
    const clientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopLiveSurfaceTraceRuntimeClient.ts'),
      'utf8',
    );

    expect(source).not.toContain('SEND_CHANNELS');
    expect(source).not.toContain('LIVE_SURFACE_TRACE');
    expect(source).not.toContain('IpcBridge');
    expect(clientSource).toContain('SEND_CHANNELS.LIVE_SURFACE_TRACE');
  });

  test('chat send preparation routes chatbox window policy through app runtime client', async () => {
    const source = await fs.readFile(
      path.join(chatRoot, 'utils/messageSender/desktopChatSendPreparation.ts'),
      'utf8',
    );
    const clientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopWindowRuntimeClient.ts'),
      'utf8',
    );

    expect(source).not.toContain('SHOW_CHATBOX');
    expect(source).not.toContain('IpcBridge.invoke');
    expect(source).toContain('DesktopWindowRuntimeClient.showChatbox');
    expect(clientSource).toContain('INVOKE_CHANNELS.SHOW_CHATBOX');
  });

  test('chat send preparation routes interaction diagnostics through app runtime client', async () => {
    const source = await fs.readFile(
      path.join(chatRoot, 'utils/messageSender/desktopChatSendPreparation.ts'),
      'utf8',
    );
    const clientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopInteractionRuntimeClient.ts'),
      'utf8',
    );

    expect(source).not.toContain('rendererInteractionLogger');
    expect(source).not.toContain('import { logUserSentMessage');
    expect(source).toContain('DesktopInteractionRuntimeClient.logUserSentMessage');
    expect(clientSource).toContain('rendererInteractionLogger');
    expect(clientSource).toContain('logUserSentMessage(details)');
  });

  test('message artifact image UI routes desktop IPC through app runtime client', async () => {
    const resolverSource = await fs.readFile(
      path.join(chatRoot, 'utils/message/useResolvedMessageScreenshots.js'),
      'utf8',
    );
    const userMessageSource = await fs.readFile(
      path.join(chatRoot, 'components/message/content/UserMessage.jsx'),
      'utf8',
    );
    const clientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopArtifactRuntimeClient.ts'),
      'utf8',
    );

    expect(resolverSource).not.toContain('FETCH_ARTIFACT_IMAGE');
    expect(resolverSource).not.toContain('IpcBridge.invoke');
    expect(resolverSource).toContain('DesktopArtifactRuntimeClient.fetchArtifactImage');
    expect(userMessageSource).not.toContain('SHOW_IMAGE_CONTEXT_MENU');
    expect(userMessageSource).not.toContain('IpcBridge.invoke');
    expect(userMessageSource).toContain('DesktopArtifactRuntimeClient.showImageContextMenu');
    expect(clientSource).toContain('INVOKE_CHANNELS.FETCH_ARTIFACT_IMAGE');
    expect(clientSource).toContain('INVOKE_CHANNELS.SHOW_IMAGE_CONTEXT_MENU');
  });

  test('chat session and transport hooks route main session IPC through app runtime client', async () => {
    const bootstrapSource = await fs.readFile(
      path.join(chatRoot, 'hooks/useChatSessionBootstrap.ts'),
      'utf8',
    );
    const loopStateSource = await fs.readFile(
      path.join(chatRoot, 'hooks/useChatLoopUiState.js'),
      'utf8',
    );
    const clientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopClientSessionRuntimeClient.ts'),
      'utf8',
    );

    expect(bootstrapSource).not.toContain('GET_CLIENT_USER_ID');
    expect(bootstrapSource).not.toContain('IpcBridge.invoke');
    expect(bootstrapSource).toContain('DesktopClientSessionRuntimeClient.loadMainSessionSnapshot');
    expect(loopStateSource).not.toContain('GET_CLIENT_USER_ID');
    expect(loopStateSource).not.toContain('ON_CHANNELS');
    expect(loopStateSource).not.toContain('IpcBridge.');
    expect(loopStateSource).toContain('DesktopClientSessionRuntimeClient.onIpcStatus');
    expect(loopStateSource).toContain('DesktopClientSessionRuntimeClient.loadMainSessionSnapshot');
    expect(clientSource).toContain('INVOKE_CHANNELS.GET_CLIENT_USER_ID');
    expect(clientSource).toContain('ON_CHANNELS.IPC_STATUS');
  });

  test('dashboard shell routes main-window target and user snapshot IPC through app runtime clients', async () => {
    const dashboardShellSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/features/dashboard/components/DashboardShell.jsx'),
      'utf8',
    );
    const sessionClientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopClientSessionRuntimeClient.ts'),
      'utf8',
    );
    const windowClientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopWindowRuntimeClient.ts'),
      'utf8',
    );

    expect(dashboardShellSource).not.toContain('IpcBridge');
    expect(dashboardShellSource).not.toContain('INVOKE_CHANNELS');
    expect(dashboardShellSource).not.toContain('ON_CHANNELS');
    expect(dashboardShellSource).not.toContain('GET_CLIENT_USER_ID');
    expect(dashboardShellSource).not.toContain('MAIN_WINDOW_OPEN_TARGET');
    expect(dashboardShellSource).toContain('DesktopClientSessionRuntimeClient.loadMainSessionSnapshot');
    expect(dashboardShellSource).toContain('DesktopWindowRuntimeClient.onMainWindowOpenTarget');
    expect(sessionClientSource).toContain('INVOKE_CHANNELS.GET_CLIENT_USER_ID');
    expect(windowClientSource).toContain('ON_CHANNELS.MAIN_WINDOW_OPEN_TARGET');
  });

  test('chat interface routes audio and workspace subscriptions through app runtime clients', async () => {
    const chatInterfaceSource = await fs.readFile(
      path.join(chatRoot, 'components/ChatInterface.jsx'),
      'utf8',
    );
    const replayActionsSource = await fs.readFile(
      path.join(chatRoot, 'hooks/useConversationReplayActions.js'),
      'utf8',
    );
    const newChatSessionSource = await fs.readFile(
      path.join(chatRoot, 'utils/session/newChatSession.ts'),
      'utf8',
    );
    const sendPreparationSource = await fs.readFile(
      path.join(chatRoot, 'utils/messageSender/desktopChatSendPreparation.ts'),
      'utf8',
    );
    const dashboardHookSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/features/dashboard/hooks/useDashboardConversations.js'),
      'utf8',
    );
    const dashboardShellSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/features/dashboard/components/DashboardShell.jsx'),
      'utf8',
    );
    const bindingsSource = await fs.readFile(
      path.join(chatRoot, 'hooks/useChatInterfaceBindings.js'),
      'utf8',
    );
    const audioClientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopAudioRuntimeClient.ts'),
      'utf8',
    );
    const shortcutClientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopShortcutRuntimeClient.ts'),
      'utf8',
    );
    const workspaceClientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopWorkspaceRuntimeClient.ts'),
      'utf8',
    );

    expect(chatInterfaceSource).not.toContain('WORKSPACE_ACCESS_UPDATED');
    expect(chatInterfaceSource).not.toContain('IpcBridge.on');
    expect(chatInterfaceSource).not.toContain('infrastructure/workspace/workspaceAccess');
    expect(chatInterfaceSource).not.toContain('infrastructure/workspace/conversationWorkspaceBinding');
    expect(chatInterfaceSource).not.toContain('infrastructure/audio/PlayerService');
    expect(replayActionsSource).not.toContain('infrastructure/workspace/conversationWorkspaceBinding');
    expect(newChatSessionSource).not.toContain('infrastructure/workspace/conversationWorkspaceBinding');
    expect(sendPreparationSource).not.toContain('infrastructure/workspace/conversationWorkspaceBinding');
    expect(dashboardHookSource).not.toContain('infrastructure/workspace/conversationWorkspaceBinding');
    expect(dashboardShellSource).not.toContain('infrastructure/workspace/conversationWorkspaceBinding');
    expect(chatInterfaceSource).toContain('DesktopWorkspaceRuntimeClient.onWorkspaceAccessUpdated');
    expect(chatInterfaceSource).toContain('DesktopWorkspaceRuntimeClient.fetchActiveWorkspaceSelection');
    expect(chatInterfaceSource).toContain('DesktopWorkspaceRuntimeClient.requestActiveWorkspaceSelection');
    expect(chatInterfaceSource).toContain('DesktopAudioRuntimeClient.createAudioPlayer');
    expect(sendPreparationSource).not.toContain('infrastructure/workspace/workspaceAccess');
    expect(sendPreparationSource).toContain('DesktopWorkspaceRuntimeClient.fetchActiveWorkspaceSelection');
    expect(sendPreparationSource).toContain('DesktopWorkspaceRuntimeClient.setConversationWorkspaceBinding');
    expect(replayActionsSource).toContain('DesktopWorkspaceRuntimeClient.getConversationWorkspaceBinding');
    expect(newChatSessionSource).toContain('DesktopWorkspaceRuntimeClient.setConversationWorkspaceBinding');
    expect(dashboardHookSource).toContain('DesktopWorkspaceRuntimeClient.resolveConversationWorkspaceBinding');
    expect(dashboardShellSource).toContain('DesktopWorkspaceRuntimeClient.clearAllConversationWorkspaceBindings');
    expect(bindingsSource).not.toContain('AUDIO_CHUNK');
    expect(bindingsSource).not.toContain('IpcBridge.on');
    expect(bindingsSource).not.toContain('infrastructure/shortcuts/agentStopShortcut');
    expect(bindingsSource).toContain('DesktopAudioRuntimeClient.onAudioChunk');
    expect(bindingsSource).toContain('DesktopShortcutRuntimeClient.isAgentStopShortcutEvent');
    expect(audioClientSource).toContain('ON_CHANNELS.AUDIO_CHUNK');
    expect(audioClientSource).toContain('PlayerService');
    expect(audioClientSource).toContain('createAudioPlayer');
    expect(shortcutClientSource).toContain('isAgentStopShortcutEvent');
    expect(workspaceClientSource).toContain('ON_CHANNELS.WORKSPACE_ACCESS_UPDATED');
    expect(workspaceClientSource).toContain('INVOKE_CHANNELS.CHECK_PERMISSION');
    expect(workspaceClientSource).toContain('INVOKE_CHANNELS.REQUEST_PERMISSION');
  });

  test('renderer app startup and main window controls route window IPC through app runtime client', async () => {
    const appSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/App.jsx'),
      'utf8',
    );
    const controlsSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/hooks/useMainWindowControls.js'),
      'utf8',
    );
    const clientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopWindowRuntimeClient.ts'),
      'utf8',
    );

    expect(appSource).not.toContain('SHOW_MAIN_WINDOW');
    expect(appSource).not.toContain('SHOW_CHATBOX');
    expect(appSource).not.toContain('IpcBridge.invoke');
    expect(appSource).toContain('DesktopWindowRuntimeClient.showMainWindow');
    expect(appSource).toContain('DesktopWindowRuntimeClient.showChatbox');
    expect(controlsSource).not.toContain('INVOKE_CHANNELS');
    expect(controlsSource).not.toContain('IpcBridge.invoke');
    expect(controlsSource).toContain('DesktopWindowRuntimeClient.minimizeWindow');
    expect(controlsSource).toContain('DesktopWindowRuntimeClient.toggleMaximizeWindow');
    expect(controlsSource).toContain('DesktopWindowRuntimeClient.closeWindow');
    expect(controlsSource).toContain('DesktopWindowRuntimeClient.showMainWindow');
    expect(clientSource).toContain('INVOKE_CHANNELS.SHOW_MAIN_WINDOW');
    expect(clientSource).toContain('INVOKE_CHANNELS.SHOW_CHATBOX');
    expect(clientSource).toContain('INVOKE_CHANNELS.WINDOW_MINIMIZE');
    expect(clientSource).toContain('INVOKE_CHANNELS.WINDOW_TOGGLE_MAXIMIZE');
    expect(clientSource).toContain('INVOKE_CHANNELS.WINDOW_CLOSE');
  });

  test('minimal chat pill routes chatbox window IPC through app runtime client', async () => {
    const pillSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/features/minimalChatPill/components/MinimalChatPill.jsx'),
      'utf8',
    );
    const bindingsSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/features/minimalChatPill/hooks/useMinimalChatPillBindings.js'),
      'utf8',
    );
    const clientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopWindowRuntimeClient.ts'),
      'utf8',
    );

    for (const source of [pillSource, bindingsSource]) {
      expect(source).not.toContain('IpcBridge');
      expect(source).not.toContain('INVOKE_CHANNELS');
      expect(source).not.toContain('SEND_CHANNELS');
      expect(source).not.toContain('ON_CHANNELS');
    }
    expect(pillSource).toContain('DesktopWindowRuntimeClient.setChatboxVisualAnchorHeight');
    expect(pillSource).toContain('DesktopWindowRuntimeClient.activateChatboxTextEntry');
    expect(pillSource).toContain('DesktopWindowRuntimeClient.setChatboxHitTestActive');
    expect(pillSource).toContain('DesktopWindowRuntimeClient.showMainWindow');
    expect(pillSource).toContain('DesktopWindowRuntimeClient.hideChatbox');
    expect(pillSource).toContain('DesktopWindowRuntimeClient.moveChatboxTo');
    expect(bindingsSource).toContain('DesktopWindowRuntimeClient.onChatboxFocus');
    expect(bindingsSource).toContain('DesktopWindowRuntimeClient.onWakewordSttTrigger');
    expect(clientSource).toContain('INVOKE_CHANNELS.SET_CHATBOX_VISUAL_ANCHOR_HEIGHT');
    expect(clientSource).toContain('INVOKE_CHANNELS.ACTIVATE_CHATBOX_TEXT_ENTRY');
    expect(clientSource).toContain('INVOKE_CHANNELS.SET_CHATBOX_HIT_TEST_ACTIVE');
    expect(clientSource).toContain('INVOKE_CHANNELS.HIDE_CHATBOX');
    expect(clientSource).toContain('SEND_CHANNELS.MOVE_CHATBOX_TO');
    expect(clientSource).toContain('ON_CHANNELS.CHATBOX_FOCUS');
    expect(clientSource).toContain('ON_CHANNELS.WAKEWORD_STT_TRIGGER');
  });

  test('minimal response overlay routes responsebox IPC through app runtime client', async () => {
    const overlaySource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/features/minimalChatPill/components/MinimalResponseOverlay.jsx'),
      'utf8',
    );
    const syncSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/features/minimalChatPill/hooks/useResponseOverlayWindowSync.js'),
      'utf8',
    );
    const viewModelSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/features/minimalChatPill/hooks/useResponseOverlayViewModel.js'),
      'utf8',
    );
    const clientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopResponseOverlayRuntimeClient.ts'),
      'utf8',
    );

    for (const source of [overlaySource, syncSource, viewModelSource]) {
      expect(source).not.toContain('IpcBridge');
      expect(source).not.toContain('INVOKE_CHANNELS');
      expect(source).not.toContain('ON_CHANNELS');
    }
    expect(overlaySource).toContain('DesktopResponseOverlayRuntimeClient.setResponseboxHitTestActive');
    expect(syncSource).toContain('DesktopResponseOverlayRuntimeClient.setResponseboxSize');
    expect(syncSource).toContain('DesktopResponseOverlayRuntimeClient.onResponseOverlayVisibility');
    expect(viewModelSource).toContain('DesktopResponseOverlayRuntimeClient.setResponseboxSize');
    expect(clientSource).toContain('INVOKE_CHANNELS.SET_RESPONSEBOX_SIZE');
    expect(clientSource).toContain('INVOKE_CHANNELS.SET_RESPONSEBOX_HIT_TEST_ACTIVE');
    expect(clientSource).toContain('ON_CHANNELS.RESPONSE_OVERLAY_VISIBILITY');
  });

  test('chat browser session control routes browser session store through app runtime client', async () => {
    const controlSource = await fs.readFile(
      path.join(chatRoot, 'components/ChatBrowserSessionControl.jsx'),
      'utf8',
    );
    const browserClientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopBrowserSessionRuntimeClient.js'),
      'utf8',
    );

    expect(controlSource).not.toContain('infrastructure/hooks/useBrowserSessionControl');
    expect(controlSource).not.toContain('browserSessionStore');
    expect(controlSource).toContain('useDesktopBrowserSessionControl');
    expect(browserClientSource).toContain('browserSessionStore');
    await expect(fs.stat(
      path.resolve(__dirname, '../../frontend/src/renderer/infrastructure/hooks/useBrowserSessionControl.js'),
    )).rejects.toThrow();
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

  test('live current-turn presentation does not read backend-shaped payload details', async () => {
    const source = await fs.readFile(
      path.join(chatRoot, 'utils/message/liveTurnPresentationMessages.js'),
      'utf8',
    );

    expect(source).toContain('toolCallDetails');
    expect(source).toContain('toolOutputDetails');
    expect(source).not.toContain('entry.structuredPayload');
    expect(source).not.toContain('entry.payload');
  });

  test('current-turn tool-event fallback does not read backend-shaped payload details', async () => {
    const source = await fs.readFile(
      path.join(chatRoot, 'utils/state/chatBoxResponseState.js'),
      'utf8',
    );

    expect(source).toContain('toolCallDetails');
    expect(source).toContain('toolOutputDetails');
    expect(source).not.toContain('toolEvent.payload');
    expect(source).not.toContain('structuredPayload');
  });

  test('display-row chat projection consumes SDK source event metadata', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/infrastructure/transcript/sdkDisplayChatMessageProjection.ts'),
      'utf8',
    );
    const chatStoreSource = await fs.readFile(
      path.join(chatRoot, 'stores/chatStore.ts'),
      'utf8',
    );
    const sourceChannelPath = path.join(chatRoot, 'utils/message/sourceChannels.js');

    expect(source).toContain('sourceEventType');
    expect(source).toContain('desktopChatMessageTypes');
    expect(source).toContain('desktopPresentationSourceChannels');
    expect(source).not.toContain('features/chat');
    expect(source).not.toContain('rawEventType');
    expect(source).not.toContain('metadata.raw');
    expect(source).not.toContain('payload.raw');
    expect(chatStoreSource).toContain('desktopChatMessageTypes');
    expect(chatStoreSource).toContain('export type { ChatMessage, TokenCounts }');
    expect(chatStoreSource).not.toContain('export interface ChatMessage');
    await expect(fs.stat(sourceChannelPath)).rejects.toThrow();
  });
});
