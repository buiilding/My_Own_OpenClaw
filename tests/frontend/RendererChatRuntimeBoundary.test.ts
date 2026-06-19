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
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatSendPreparationRuntime.ts'),
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

  test('chat stream model context type is owned by app runtime facade', async () => {
    const streamSource = await fs.readFile(
      path.join(chatRoot, 'hooks/useChatStream.ts'),
      'utf8',
    );
    const localUserHandlerSource = await fs.readFile(
      path.join(chatRoot, 'hooks/chatStream/useChatStreamLocalUserHandler.ts'),
      'utf8',
    );
    const modelContextSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatStreamModelContextRuntime.ts'),
      'utf8',
    );

    for (const source of [streamSource, localUserHandlerSource]) {
      expect(source).toContain('desktopChatStreamModelContextRuntime');
      expect(source).not.toContain('utils/chatStream/chatStreamTypes');
      expect(source).not.toContain('utils/transcriptModelContext');
    }
    expect(modelContextSource).toContain('modelProvider');
    expect(modelContextSource).toContain('supportsThinkingTextStream');
    expect(modelContextSource).not.toContain('features/chat');
    await expect(fs.stat(
      path.join(chatRoot, 'utils/chatStream/chatStreamTypes.ts'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.join(chatRoot, 'utils/transcriptModelContext.ts'),
    )).rejects.toThrow();
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

  test('chat stream payload alias normalization stays behind app runtime facade', async () => {
    const payloadRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatStreamEventPayloadRuntime.ts'),
      'utf8',
    );
    const compactionHookSource = await fs.readFile(
      path.join(chatRoot, 'hooks/chatStream/useChatStreamCompactionHandlers.ts'),
      'utf8',
    );
    const metadataHookSource = await fs.readFile(
      path.join(chatRoot, 'hooks/chatStream/useChatStreamMetadataHandlers.ts'),
      'utf8',
    );

    expect(payloadRuntimeSource).toContain('replacement_history_entries');
    expect(payloadRuntimeSource).toContain('replacement_history_preview');
    expect(payloadRuntimeSource).toContain('summary_preview');
    expect(payloadRuntimeSource).toContain('toolSchemas');
    expect(compactionHookSource).toContain('buildCompactionDebugInfo');
    expect(compactionHookSource).toContain('buildCompactedReplaySnapshot');
    expect(compactionHookSource).toContain('resolveCompactionErrorText');
    expect(compactionHookSource).not.toContain('event.payload.error');
    expect(metadataHookSource).toContain('resolveToolSchemasMetadataPayload');
    expect(compactionHookSource).not.toContain('replacement_history_entries');
    expect(compactionHookSource).not.toContain('replacement_history_preview');
    expect(compactionHookSource).not.toContain('summary_preview');
    expect(metadataHookSource).not.toContain('toolSchemas');
  });

  test('chat stream terminal handlers consume SDK events directly', async () => {
    const source = await fs.readFile(
      path.join(chatRoot, 'hooks/chatStream/useChatStreamTerminalHandlers.ts'),
      'utf8',
    );
    const payloadRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatStreamEventPayloadRuntime.ts'),
      'utf8',
    );

    expect(source).not.toContain('unwrapErrorBackendEvent');
    expect(source).not.toContain('unwrapTokenCountBackendEvent');
    expect(source).not.toContain('unwrapMemoryStoreBackendEvent');
    expect(source).not.toContain('types/backendEvents');
    expect(source).toContain('buildTokenCountsFromPayload');
    expect(source).toContain('resolveTerminalErrorPayload');
    expect(source).not.toContain('prompt_tokens');
    expect(source).not.toContain('usage_source');
    expect(source).not.toContain('cache_status');
    expect(source).toContain('ConversationEvent');
    expect(payloadRuntimeSource).toContain('prompt_tokens');
    expect(payloadRuntimeSource).toContain('usage_source');
    expect(payloadRuntimeSource).toContain('cache_status');
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
    expect(sectionSource).not.toContain('normalizeMcpRegistry');
    expect(sectionSource).not.toContain('mcp_errors');
    expect(sectionSource).not.toContain('enabled_mcp_servers');
    expect(sectionSource).not.toContain('payload?.success');
    expect(sectionSource).not.toContain('payload.error ||');
    expect(sectionSource).toContain('DesktopMcpRuntimeClient.listMcpServers');
    expect(sectionSource).toContain('DesktopMcpRuntimeClient.refreshMcpServers');
    expect(sectionSource).toContain('DesktopMcpRuntimeClient.setMcpServerEnabled');
    expect(sectionSource).toContain('EMPTY_DESKTOP_MCP_REGISTRY');
    expect(clientSource).toContain('normalizeDesktopMcpRegistry');
    expect(clientSource).toContain('normalizeDesktopMcpEnablementResult');
    expect(clientSource).toContain('errorMessage');
    expect(clientSource).toContain('mcp_errors');
    expect(clientSource).toContain('enabled_mcp_servers');
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
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopCurrentTurnProjectionEffectsRuntime.ts'),
      'utf8',
    );
    const thinkingRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatStreamThinkingRuntime.ts'),
      'utf8',
    );

    expect(streamSource).not.toContain('assistant_delta');
    expect(streamSource).not.toContain('reasoning_delta');
    expect(projectionSource).toContain('SdkCurrentTurnProjection');
    expect(projectionSource).toContain('desktopCurrentTurnProjectionEffectsRuntime');
    expect(projectionSource).toContain('applyCurrentTurnProjectionSideEffects');
    expect(projectionSideEffectsSource).toContain('setThinkingStatus');
    expect(projectionSideEffectsSource).toContain('streaming-response');
    expect(projectionSideEffectsSource).toContain('desktopChatStreamThinkingRuntime');
    expect(projectionSideEffectsSource).not.toContain('features/chat');
    expect(thinkingRuntimeSource).toContain('GENERIC_THINKING_STATUS');
    await expect(fs.stat(
      path.join(chatRoot, 'utils/state/currentTurnProjectionSideEffects.ts'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.join(chatRoot, 'utils/chatStream/chatStreamFormatting.ts'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.join(chatRoot, 'utils/chatStream/chatStreamThinkingStatus.ts'),
    )).rejects.toThrow();
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
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopMessageScreenshotRuntime.js'),
      'utf8',
    );
    const resolvedScreenshotSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopResolvedMessageScreenshotsRuntime.js'),
      'utf8',
    );
    const replayActionsSource = await fs.readFile(
      path.join(chatRoot, 'hooks/useConversationReplayActions.js'),
      'utf8',
    );
    const composerAttachmentSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopComposerAttachmentRuntime.js'),
      'utf8',
    );
    const chatStreamEventPayloadSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatStreamEventPayloadRuntime.ts'),
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
      composerAttachmentSource,
      chatStreamEventPayloadSource,
    ]) {
      expect(source).not.toContain('infrastructure/services/screenshotMessageState');
      expect(source).not.toContain('infrastructure/services/ArtifactImageUtils');
    }
    expect(screenshotSource).toContain('DesktopArtifactRuntimeClient.resolveScreenshotAttachmentState');
    expect(screenshotSource).toContain('DesktopArtifactRuntimeClient.normalizeArtifactImageContentType');
    expect(resolvedScreenshotSource).toContain('desktopMessageScreenshotRuntime');
    expect(resolvedScreenshotSource).toContain('DesktopArtifactRuntimeClient.inferArtifactRefFromUrl');
    expect(replayActionsSource).toContain('DesktopArtifactRuntimeClient.resolveReplayScreenshotState');
    expect(composerAttachmentSource).toContain('DesktopArtifactRuntimeClient.resolveArtifactImageExtension');
    expect(chatStreamEventPayloadSource).toContain('DesktopArtifactRuntimeClient.buildRemoteScreenshotAttachment');
    expect(artifactClientSource).toContain('DesktopRuntimeEndpointClient.buildArtifactUrl');
    expect(artifactClientSource).toContain('resolveScreenshotAttachmentState');
    expect(artifactClientSource).toContain('normalizeArtifactImageContentType');
    expect(endpointClientSource).toContain('buildRuntimeArtifactUrl');
    await expect(fs.stat(
      path.join(chatRoot, 'utils/message/useResolvedMessageScreenshots.js'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.join(chatRoot, 'utils/message/messageScreenshots.js'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.join(chatRoot, 'utils/chatStream/chatStreamEventUtils.ts'),
    )).rejects.toThrow();
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
    expect(projectionSource).not.toContain('function isCurrentTurnProjection');
    expect(projectionSource).not.toContain('function isSdkDisplayRows');
    expect(projectionSource).not.toContain('payload && typeof payload');
    expect(projectionSource).toContain('DesktopConversationRuntimeEventClient.onPendingTurn');
    expect(projectionSource).toContain('DesktopConversationRuntimeEventClient.onCurrentTurnProjection');
    expect(projectionSource).toContain('DesktopConversationRuntimeEventClient.onDisplayRowsProjection');
    expect(eventClientSource).toContain('DESKTOP_RUNTIME_ON_CHANNELS.PENDING_TURN');
    expect(eventClientSource).toContain('DESKTOP_RUNTIME_ON_CHANNELS.CURRENT_TURN');
    expect(eventClientSource).toContain('DESKTOP_RUNTIME_ON_CHANNELS.ROWS');
    expect(eventClientSource).toContain('normalizeCurrentTurnProjectionEvent');
    expect(eventClientSource).toContain('normalizeDisplayRowsProjectionEvent');
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
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopMarkdownMessageRuntime.js'),
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopThreadFindRuntime.js'),
      path.join(chatRoot, 'components/message/content/MarkdownMessage.jsx'),
      path.join(chatRoot, 'components/message/content/HighlightedPlainText.jsx'),
    ];
    const chatInterfaceSource = await fs.readFile(
      path.join(chatRoot, 'components/ChatInterface.jsx'),
      'utf8',
    );
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
    expect(chatInterfaceSource).toContain('desktopThreadFindRuntime');
    expect(chatInterfaceSource).not.toContain('utils/message/threadFindState');
    expect(markdownClientSource).toContain('infrastructure/markdown');
    expect(markdownClientSource).toContain('infrastructure/llmOutputContract');
    await expect(fs.stat(
      path.join(chatRoot, 'utils/message/markdownMessageRendering.js'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.join(chatRoot, 'utils/message/threadFindState.js'),
    )).rejects.toThrow();
  });

  test('message source and token tags stay behind app runtime presentation facades', async () => {
    const sourceBadgeSource = await fs.readFile(
      path.join(chatRoot, 'components/message/MessageSourceBadge.jsx'),
      'utf8',
    );
    const thinkingDisplaySource = await fs.readFile(
      path.join(chatRoot, 'components/message/ThinkingDisplay.jsx'),
      'utf8',
    );
    const sourceTagRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopMessageSourceTagRuntime.js'),
      'utf8',
    );
    const tokenUsageRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopMessageTokenUsageRuntime.js'),
      'utf8',
    );

    expect(sourceBadgeSource).toContain('desktopMessageSourceTagRuntime');
    expect(sourceBadgeSource).toContain('desktopMessageTokenUsageRuntime');
    expect(thinkingDisplaySource).toContain('desktopMessageSourceTagRuntime');
    expect(sourceBadgeSource).not.toContain('utils/message/sourceTags');
    expect(sourceBadgeSource).not.toContain('utils/message/messageTokenUsage');
    expect(thinkingDisplaySource).not.toContain('utils/message/sourceTags');
    expect(sourceTagRuntimeSource).toContain('desktopPresentationSourceChannels');
    expect(sourceTagRuntimeSource).not.toContain('features/chat');
    expect(tokenUsageRuntimeSource).toContain('tokens(provider)');
    expect(tokenUsageRuntimeSource).not.toContain('features/chat');
    await expect(fs.stat(
      path.join(chatRoot, 'utils/message/sourceTags.js'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.join(chatRoot, 'utils/message/messageTokenUsage.js'),
    )).rejects.toThrow();
  });

  test('message row classes and screenshot descriptors stay behind app runtime facades', async () => {
    const messageItemSource = await fs.readFile(
      path.join(chatRoot, 'components/message/MessageItem.jsx'),
      'utf8',
    );
    const messageContentSource = await fs.readFile(
      path.join(chatRoot, 'components/MessageContent.jsx'),
      'utf8',
    );
    const classRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopMessageClassRuntime.js'),
      'utf8',
    );
    const screenshotRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopMessageScreenshotRuntime.js'),
      'utf8',
    );

    expect(messageItemSource).toContain('desktopMessageClassRuntime');
    expect(messageItemSource).not.toContain('utils/message/messageListClasses');
    expect(messageContentSource).toContain('desktopMessageScreenshotRuntime');
    expect(messageContentSource).not.toContain('utils/message/messageScreenshots');
    expect(classRuntimeSource).toContain('desktopMessageScreenshotRuntime');
    expect(classRuntimeSource).not.toContain('features/chat');
    expect(screenshotRuntimeSource).not.toContain('features/chat');
    await expect(fs.stat(
      path.join(chatRoot, 'utils/message/messageListClasses.js'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.join(chatRoot, 'utils/message/messageScreenshots.js'),
    )).rejects.toThrow();
  });

  test('message-list scroll and action state stays behind app runtime facade', async () => {
    const messageListSource = await fs.readFile(
      path.join(chatRoot, 'components/MessageList.jsx'),
      'utf8',
    );
    const messageItemSource = await fs.readFile(
      path.join(chatRoot, 'components/message/MessageItem.jsx'),
      'utf8',
    );
    const autoScrollSource = await fs.readFile(
      path.join(chatRoot, 'hooks/useMessageListAutoScroll.js'),
      'utf8',
    );
    const messageListRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopMessageListRuntime.js'),
      'utf8',
    );

    for (const source of [messageListSource, messageItemSource, autoScrollSource]) {
      expect(source).toContain('desktopMessageListRuntime');
      expect(source).not.toContain('utils/message/messageListState');
    }
    expect(messageListRuntimeSource).toContain('resolveCompactionStatusText');
    expect(messageListRuntimeSource).toContain('shouldAutoScrollForAgentLoopMessageUpdate');
    expect(messageListRuntimeSource).not.toContain('features/chat');
    await expect(fs.stat(
      path.join(chatRoot, 'utils/message/messageListState.js'),
    )).rejects.toThrow();
  });

  test('chat message state helpers route transcript builders through app runtime client', async () => {
    const files = [
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatStreamMessageUpdateRuntime.ts'),
    ];
    const chatMessageClientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatMessageRuntimeClient.ts'),
      'utf8',
    );
    const currentTurnMessageSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopCurrentTurnMessageRuntime.js'),
      'utf8',
    );

    for (const file of files) {
      const source = await fs.readFile(file, 'utf8');
      expect(source).not.toContain('infrastructure/transcript/toolCall');
      expect(source).not.toContain('infrastructure/transcript/toolOutputChatMessageState');
      expect(source).not.toContain('infrastructure/transcript/toolSchemaShape');
      expect(source).not.toContain('infrastructure/text/incomingTextNormalization');
      expect(source).toContain('desktopChatMessageRuntimeClient');
      expect(source).not.toContain('features/chat');
    }
    expect(chatMessageClientSource).toContain('infrastructure/transcript/toolCallMessageState');
    expect(chatMessageClientSource).toContain('infrastructure/transcript/toolCallChatMessageState');
    expect(chatMessageClientSource).toContain('infrastructure/transcript/toolOutputChatMessageState');
    expect(chatMessageClientSource).toContain('infrastructure/transcript/toolSchemaShape');
    expect(chatMessageClientSource).toContain('infrastructure/text/incomingTextNormalization');
    expect(currentTurnMessageSource).toContain('desktopChatMessageRuntimeClient');
    await expect(fs.stat(
      path.join(chatRoot, 'utils/toolOutputMessages.ts'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.join(chatRoot, 'utils/message/liveTurnPresentationMessages.js'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.join(chatRoot, 'utils/state/chatBoxResponseState.js'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.join(chatRoot, 'utils/chatStream/chatStreamMessageUpdates.ts'),
    )).rejects.toThrow();
  });

  test('message transparency descriptors are owned by app runtime facade', async () => {
    const messageListSource = await fs.readFile(
      path.join(chatRoot, 'components/MessageList.jsx'),
      'utf8',
    );
    const transparencySectionsSource = await fs.readFile(
      path.join(chatRoot, 'components/message/MessageTransparencySections.jsx'),
      'utf8',
    );
    const overlaySource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/features/minimalChatPill/components/MinimalResponseOverlay.jsx'),
      'utf8',
    );
    const transparencyRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopMessageTransparencyRuntime.js'),
      'utf8',
    );

    for (const source of [messageListSource, transparencySectionsSource, overlaySource]) {
      expect(source).toContain('desktopMessageTransparencyRuntime');
      expect(source).not.toContain('utils/message/messageTransparency');
    }
    expect(transparencyRuntimeSource).toContain('desktopChatMessageRuntimeClient');
    expect(transparencyRuntimeSource).toContain('normalizeToolSchemaList');
    expect(transparencyRuntimeSource).not.toContain('features/chat');
    await expect(fs.stat(
      path.join(chatRoot, 'utils/message/messageTransparency.js'),
    )).rejects.toThrow();
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
    expect(handlerSource).not.toContain('event.payload?.text');
    expect(handlerSource).not.toContain('event.payload?.content');
    expect(handlerSource).not.toContain('function readString');
    expect(handlerSource).toContain('resolveLocalUserMessageText');
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
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopCurrentTurnProjectionEffectsRuntime.ts'),
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
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopCurrentTurnProjectionEffectsRuntime.ts'),
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
    const replayRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopConversationReplayRuntime.js'),
      'utf8',
    );

    expect(source).not.toContain('DesktopConversationStoreAdapter');
    expect(source).toContain('desktopConversationReplayRuntime');
    expect(source).not.toContain('utils/conversationReplayToolMessages');
    expect(source).toContain('DesktopConversationContinuityService.prepareEditAndResend');
    expect(source).toContain('DesktopConversationContinuityService.prepareRetryTurn');
    expect(source).toContain('dispatchPreparedDesktopChatTurn');
    expect(source).not.toContain('recordTranscriptUserMessage');
    expect(source).not.toContain('DesktopLiveTurnRuntimeClient.sendQuery');
    expect(source).not.toContain('DesktopLiveTurnRuntimeClient.editAndResend');
    expect(source).not.toContain('DesktopLiveTurnRuntimeClient.retryTurn');
    expect(replayRuntimeSource).toContain('buildReplayContextMessages');
    expect(replayRuntimeSource).not.toContain('features/chat');
    await expect(fs.stat(
      path.join(chatRoot, 'utils/conversationReplayToolMessages.js'),
    )).rejects.toThrow();
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
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatSendPreparationRuntime.ts'),
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
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopManualCompactionRuntime.js'),
      'utf8',
    );

    expect(source).toContain('DesktopConversationContinuityService.compactHistory');
    expect(source).not.toContain('DesktopLiveTurnRuntimeClient.compactHistory');
    expect(source).not.toContain('features/chat');
    await expect(fs.stat(
      path.join(chatRoot, 'utils/session/manualCompactionRuntime.js'),
    )).rejects.toThrow();
  });

  test('chat send and stop code routes pending-turn IPC through app runtime client', async () => {
    const checkedPaths = [
      path.join(chatRoot, 'hooks/useChatMessageSender.ts'),
      path.join(chatRoot, 'hooks/useStopTurnHandler.js'),
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatSendPreparationRuntime.ts'),
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

  test('chat stop-turn state is owned by app runtime', async () => {
    const stopHandlerSource = await fs.readFile(
      path.join(chatRoot, 'hooks/useStopTurnHandler.js'),
      'utf8',
    );
    const chatStoreSource = await fs.readFile(
      path.join(chatRoot, 'stores/chatStore.ts'),
      'utf8',
    );
    const stopRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopStopTurnRuntime.js'),
      'utf8',
    );

    expect(stopHandlerSource).toContain('desktopStopTurnRuntime');
    expect(chatStoreSource).toContain('desktopStopTurnRuntime');
    expect(stopHandlerSource).not.toContain('utils/state/stopQueryState');
    expect(chatStoreSource).not.toContain('utils/state/stopQueryState');
    expect(stopRuntimeSource).toContain('resolveStopTurnTarget');
    expect(stopRuntimeSource).toContain('buildStoppedCurrentTurnProjection');
    expect(stopRuntimeSource).not.toContain('features/chat');
    await expect(fs.stat(
      path.join(chatRoot, 'utils/state/stopQueryState.js'),
    )).rejects.toThrow();
  });

  test('renderer trace runtime routes live-surface IPC through app runtime client', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopRendererTraceRuntime.ts'),
      'utf8',
    );
    const chatProviderSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/providers/ChatProvider.jsx'),
      'utf8',
    );
    const clientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopLiveSurfaceTraceRuntimeClient.ts'),
      'utf8',
    );

    expect(source).not.toContain('SEND_CHANNELS');
    expect(source).not.toContain('LIVE_SURFACE_TRACE');
    expect(source).not.toContain('IpcBridge');
    expect(source).not.toContain('features/chat');
    expect(source).toContain('configureRendererTraceWorkspaceSnapshotResolver');
    expect(chatProviderSource).toContain('configureRendererTraceWorkspaceSnapshotResolver');
    expect(clientSource).toContain('SEND_CHANNELS.LIVE_SURFACE_TRACE');
    await expect(fs.stat(
      path.join(chatRoot, 'utils/chatStream/chatStreamDebugTrace.ts'),
    )).rejects.toThrow();
  });

  test('chat send preparation routes chatbox window policy through app runtime client', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatSendPreparationRuntime.ts'),
      'utf8',
    );
    const clientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopWindowRuntimeClient.ts'),
      'utf8',
    );

    expect(source).not.toContain('SHOW_CHATBOX');
    expect(source).not.toContain('IpcBridge.invoke');
    expect(source).not.toContain('features/chat');
    expect(source).toContain('DesktopWindowRuntimeClient.showChatbox');
    expect(clientSource).toContain('INVOKE_CHANNELS.SHOW_CHATBOX');
    await expect(fs.stat(
      path.join(chatRoot, 'utils/messageSender/desktopChatSendPreparation.ts'),
    )).rejects.toThrow();
  });

  test('chat send payload normalization stays behind app runtime facades', async () => {
    const senderHookSource = await fs.readFile(
      path.join(chatRoot, 'hooks/useChatMessageSender.ts'),
      'utf8',
    );
    const sendPreparationSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatSendPreparationRuntime.ts'),
      'utf8',
    );
    const payloadRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatSendPayloadRuntime.ts'),
      'utf8',
    );
    const stateRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatSendStateRuntime.ts'),
      'utf8',
    );

    expect(senderHookSource).toContain('desktopChatSendPayloadRuntime');
    expect(sendPreparationSource).toContain('desktopChatSendPayloadRuntime');
    expect(sendPreparationSource).toContain('desktopChatSendStateRuntime');
    expect(sendPreparationSource).not.toContain('chatMessageSenderPayloads');
    expect(sendPreparationSource).not.toContain('chatMessageSenderUtils');
    expect(payloadRuntimeSource).toContain('normalizeOutgoingPayload');
    expect(payloadRuntimeSource).toContain('normalizeAttachmentFilenames');
    expect(payloadRuntimeSource).not.toContain('features/chat');
    expect(stateRuntimeSource).toContain('hasUserMessages');
    expect(stateRuntimeSource).not.toContain('features/chat');
    await expect(fs.stat(
      path.join(chatRoot, 'utils/messageSender/chatMessageSenderPayloads.ts'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.join(chatRoot, 'utils/messageSender/chatMessageSenderUtils.ts'),
    )).rejects.toThrow();
  });

  test('chat send preparation routes interaction diagnostics through app runtime client', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatSendPreparationRuntime.ts'),
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
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopResolvedMessageScreenshotsRuntime.js'),
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
    await expect(fs.stat(
      path.join(chatRoot, 'utils/message/useResolvedMessageScreenshots.js'),
    )).rejects.toThrow();
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
    expect(loopStateSource).not.toContain('payload?.isConnected');
    expect(loopStateSource).toContain('DesktopClientSessionRuntimeClient.onIpcTransportStatus');
    expect(loopStateSource).toContain('DesktopClientSessionRuntimeClient.loadMainTransportStatus');
    expect(loopStateSource).toContain('payload.hasConnectionState !== true');
    expect(clientSource).toContain('INVOKE_CHANNELS.GET_CLIENT_USER_ID');
    expect(clientSource).toContain('ON_CHANNELS.IPC_STATUS');
    expect(clientSource).toContain('normalizeDesktopTransportConnectionStatus');
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
    expect(dashboardShellSource).not.toContain('payload?.target');
    expect(dashboardShellSource).not.toContain('typeof payload?.userId');
    expect(dashboardShellSource).not.toContain('payload.userId.trim');
    expect(dashboardShellSource).toContain('DesktopClientSessionRuntimeClient.loadMainSessionSnapshot');
    expect(dashboardShellSource).toContain('DesktopWindowRuntimeClient.onMainWindowOpenTarget');
    expect(sessionClientSource).toContain('normalizeDesktopClientSessionSnapshot');
    expect(sessionClientSource).toContain('INVOKE_CHANNELS.GET_CLIENT_USER_ID');
    expect(windowClientSource).toContain('normalizeMainWindowOpenTargetPayload');
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
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopNewChatSessionRuntime.ts'),
      'utf8',
    );
    const sendPreparationSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatSendPreparationRuntime.ts'),
      'utf8',
    );
    const conversationSessionRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopConversationSessionRuntime.ts'),
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
    expect(chatInterfaceSource).not.toContain('payload?.workspaceName');
    expect(chatInterfaceSource).not.toContain('payload?.workspacePath');
    expect(chatInterfaceSource).not.toContain('infrastructure/audio/PlayerService');
    expect(replayActionsSource).not.toContain('infrastructure/workspace/conversationWorkspaceBinding');
    expect(newChatSessionSource).not.toContain('infrastructure/workspace/conversationWorkspaceBinding');
    expect(sendPreparationSource).not.toContain('infrastructure/workspace/conversationWorkspaceBinding');
    expect(dashboardHookSource).not.toContain('infrastructure/workspace/conversationWorkspaceBinding');
    expect(dashboardShellSource).not.toContain('infrastructure/workspace/conversationWorkspaceBinding');
    expect(chatInterfaceSource).toContain('DesktopWorkspaceRuntimeClient.onWorkspaceAccessUpdated');
    expect(chatInterfaceSource).toContain('DesktopWorkspaceRuntimeClient.fetchActiveWorkspaceSelection');
    expect(chatInterfaceSource).toContain('DesktopWorkspaceRuntimeClient.requestActiveWorkspaceSelection');
    expect(workspaceClientSource).toContain('normalizeWorkspaceAccessUpdatedPayload');
    expect(chatInterfaceSource).toContain('DesktopAudioRuntimeClient.createAudioPlayer');
    expect(sendPreparationSource).not.toContain('infrastructure/workspace/workspaceAccess');
    expect(sendPreparationSource).toContain('DesktopWorkspaceRuntimeClient.fetchActiveWorkspaceSelection');
    expect(sendPreparationSource).toContain('DesktopWorkspaceRuntimeClient.setConversationWorkspaceBinding');
    expect(replayActionsSource).toContain('DesktopWorkspaceRuntimeClient.getConversationWorkspaceBinding');
    expect(replayActionsSource).toContain('desktopConversationSessionRuntime');
    expect(replayActionsSource).not.toContain('utils/session/conversationRef');
    expect(newChatSessionSource).toContain('DesktopWorkspaceRuntimeClient.setConversationWorkspaceBinding');
    expect(newChatSessionSource).toContain('desktopConversationSessionRuntime');
    expect(newChatSessionSource).not.toContain('utils/session/conversationRef');
    expect(newChatSessionSource).not.toContain('features/chat');
    expect(sendPreparationSource).toContain('desktopConversationSessionRuntime');
    expect(sendPreparationSource).not.toContain('utils/session/conversationRef');
    expect(conversationSessionRuntimeSource).toContain('createConversationRef');
    expect(conversationSessionRuntimeSource).not.toContain('features/chat');
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
    await expect(fs.stat(
      path.join(chatRoot, 'utils/session/conversationRef.ts'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.join(chatRoot, 'utils/session/newChatSession.ts'),
    )).rejects.toThrow();
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
    const layoutRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatboxLayoutRuntime.js'),
      'utf8',
    );

    for (const source of [pillSource, bindingsSource]) {
      expect(source).not.toContain('IpcBridge');
      expect(source).not.toContain('INVOKE_CHANNELS');
      expect(source).not.toContain('SEND_CHANNELS');
      expect(source).not.toContain('ON_CHANNELS');
      expect(source).toContain('desktopChatboxLayoutRuntime');
      expect(source).not.toContain('chat/utils/state/chatBoxState');
    }
    expect(layoutRuntimeSource).toContain('resolveChatboxVisualAnchorHeight');
    expect(layoutRuntimeSource).toContain('CHATBOX_VISUAL_ANCHOR_HEIGHT_COMPACT');
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
    await expect(fs.stat(
      path.join(chatRoot, 'utils/state/chatBoxState.js'),
    )).rejects.toThrow();
  });

  test('chat and minimal pill attachment preview labels use app runtime presentation facade', async () => {
    const messageInputSource = await fs.readFile(
      path.join(chatRoot, 'components/MessageInput.jsx'),
      'utf8',
    );
    const previewRowSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/features/minimalChatPill/components/AttachmentPreviewRow.jsx'),
      'utf8',
    );
    const attachmentRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopAttachmentPresentationRuntime.js'),
      'utf8',
    );

    expect(messageInputSource).toContain('desktopAttachmentPresentationRuntime');
    expect(previewRowSource).toContain('desktopAttachmentPresentationRuntime');
    expect(attachmentRuntimeSource).toContain('resolveReadableFileTypeLabel');
    expect(attachmentRuntimeSource).not.toContain('features/chat');
    expect(messageInputSource).not.toContain('composerAttachmentPresentation');
    expect(previewRowSource).not.toContain('composerAttachmentPresentation');
    await expect(fs.stat(
      path.join(chatRoot, 'utils/composerAttachmentPresentation.js'),
    )).rejects.toThrow();
  });

  test('chat composer outgoing payload normalization stays behind app runtime facade', async () => {
    const composerDraftSource = await fs.readFile(
      path.join(chatRoot, 'hooks/useChatComposerDraft.js'),
      'utf8',
    );
    const messageInputRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopMessageInputRuntime.js'),
      'utf8',
    );

    expect(composerDraftSource).toContain('desktopMessageInputRuntime');
    expect(composerDraftSource).not.toContain('utils/message/messageInput');
    expect(messageInputRuntimeSource).toContain('buildOutgoingMessage');
    expect(messageInputRuntimeSource).not.toContain('features/chat');
    await expect(fs.stat(
      path.join(chatRoot, 'utils/message/messageInput.js'),
    )).rejects.toThrow();
  });

  test('chat composer attachment parsing stays behind app runtime facade', async () => {
    const composerDraftSource = await fs.readFile(
      path.join(chatRoot, 'hooks/useChatComposerDraft.js'),
      'utf8',
    );
    const composerAttachmentSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopComposerAttachmentRuntime.js'),
      'utf8',
    );

    expect(composerDraftSource).toContain('desktopComposerAttachmentRuntime');
    expect(composerDraftSource).not.toContain('clipboardImageUtils');
    expect(composerDraftSource).not.toContain('fileAttachmentUtils');
    expect(composerAttachmentSource).toContain('parseClipboardImageItems');
    expect(composerAttachmentSource).toContain('parseSelectedComposerFiles');
    expect(composerAttachmentSource).toContain('parseBase64ImageDataUrl');
    expect(composerAttachmentSource).not.toContain('features/chat');
    await expect(fs.stat(
      path.join(chatRoot, 'utils/dataUrlImageUtils.js'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.join(chatRoot, 'utils/clipboardImageUtils.js'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.join(chatRoot, 'utils/fileAttachmentUtils.js'),
    )).rejects.toThrow();
  });

  test('chat composer transcription-region reconciliation stays behind app runtime facade', async () => {
    const transcriptionHookSource = await fs.readFile(
      path.join(chatRoot, 'hooks/useTranscription.ts'),
      'utf8',
    );
    const transcriptionRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopTranscriptionRegionRuntime.ts'),
      'utf8',
    );

    expect(transcriptionHookSource).toContain('desktopTranscriptionRegionRuntime');
    expect(transcriptionHookSource).not.toContain('utils/transcriptionRegions');
    expect(transcriptionRuntimeSource).toContain('updateRegionAfterInputChange');
    expect(transcriptionRuntimeSource).toContain('updateRegionAfterPaste');
    expect(transcriptionRuntimeSource).not.toContain('features/chat');
    await expect(fs.stat(
      path.join(chatRoot, 'utils/transcriptionRegions.ts'),
    )).rejects.toThrow();
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
    const layoutRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopResponseOverlayLayoutRuntime.js'),
      'utf8',
    );

    for (const source of [overlaySource, syncSource, viewModelSource]) {
      expect(source).not.toContain('IpcBridge');
      expect(source).not.toContain('INVOKE_CHANNELS');
      expect(source).not.toContain('ON_CHANNELS');
    }
    expect(overlaySource).toContain('desktopResponseOverlayLayoutRuntime');
    expect(syncSource).toContain('desktopResponseOverlayLayoutRuntime');
    expect(syncSource).not.toContain('overlayFrameSize');
    expect(syncSource).not.toContain('responseOverlayLayoutMode');
    expect(syncSource).not.toContain('responseOverlayLayoutContract');
    expect(syncSource).not.toContain('payload?.visible');
    expect(clientSource).toContain('normalizeResponseOverlayVisibilityPayload');
    expect(layoutRuntimeSource).toContain('getRoundedFrameSize');
    expect(layoutRuntimeSource).toContain('RESPONSE_OVERLAY_LAYOUT_MODE');
    expect(layoutRuntimeSource).toContain('RESPONSE_OVERLAY_LAYOUT');
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

  test('chat and dashboard model selection share app runtime reconciliation', async () => {
    const chatModelOptionsSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatModelOptionsRuntime.js'),
      'utf8',
    );
    const chatInterfaceSource = await fs.readFile(
      path.join(chatRoot, 'components/ChatInterface.jsx'),
      'utf8',
    );
    const headerControlsSource = await fs.readFile(
      path.join(chatRoot, 'components/ChatInterfaceHeaderControls.jsx'),
      'utf8',
    );
    const modelsSectionSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/features/dashboard/components/sections/ModelsSection.jsx'),
      'utf8',
    );
    const modelRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopModelSelectionRuntime.js'),
      'utf8',
    );

    expect(chatModelOptionsSource).toContain('desktopModelSelectionRuntime');
    expect(chatModelOptionsSource).toContain('desktopRuntimeConfig');
    expect(chatModelOptionsSource).not.toContain('features/chat');
    expect(chatModelOptionsSource).not.toContain('dashboard/utils/modelSelectionUtils');
    expect(chatInterfaceSource).toContain('desktopChatModelOptionsRuntime');
    expect(headerControlsSource).toContain('desktopChatModelOptionsRuntime');
    expect(modelsSectionSource).toContain('desktopModelSelectionRuntime');
    expect(modelRuntimeSource).toContain('buildModelConfigUpdate');
    await expect(fs.stat(
      path.resolve(__dirname, '../../frontend/src/renderer/features/dashboard/utils/modelSelectionUtils.js'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.join(chatRoot, 'utils/chatModelOptions.js'),
    )).rejects.toThrow();
  });

  test('chat stream reads model thinking capabilities through app runtime', async () => {
    const streamSource = await fs.readFile(
      path.join(chatRoot, 'hooks/useChatStream.ts'),
      'utf8',
    );
    const modelThinkingRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopModelThinkingRuntime.ts'),
      'utf8',
    );

    expect(streamSource).toContain('desktopModelThinkingRuntime');
    expect(streamSource).not.toContain('utils/modelThinkingCapabilities');
    expect(modelThinkingRuntimeSource).toContain('supports_thinking');
    expect(modelThinkingRuntimeSource).toContain('supports_thinking_text_stream');
    await expect(fs.stat(
      path.join(chatRoot, 'utils/modelThinkingCapabilities.ts'),
    )).rejects.toThrow();
  });

  test('chat and dashboard active-session reset share app runtime rules', async () => {
    const newChatSessionSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopNewChatSessionRuntime.ts'),
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
    const activeSessionRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopActiveChatSessionRuntime.ts'),
      'utf8',
    );

    for (const source of [newChatSessionSource, dashboardHookSource, dashboardShellSource]) {
      expect(source).toContain('desktopActiveChatSessionRuntime');
      expect(source).not.toContain('features/chat/utils/session/resetActiveChatSession');
    }
    expect(newChatSessionSource).not.toContain('features/chat');
    expect(activeSessionRuntimeSource).toContain('resetActiveChatSession');
    expect(activeSessionRuntimeSource).toContain('applyRendererConversationSelection');
    expect(activeSessionRuntimeSource).toContain('DesktopTranscriptSessionRuntimeClient.updateTranscriptSession');
    await expect(fs.stat(
      path.join(chatRoot, 'utils/session/resetActiveChatSession.ts'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.join(chatRoot, 'utils/session/newChatSession.ts'),
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
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopCurrentTurnMessageRuntime.js'),
      'utf8',
    );

    expect(source).toContain('toolCallDetails');
    expect(source).toContain('toolOutputDetails');
    expect(source).not.toContain('entry.structuredPayload');
    expect(source).not.toContain('entry.payload');
  });

  test('current-turn tool-event fallback does not read backend-shaped payload details', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopCurrentTurnMessageRuntime.js'),
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
