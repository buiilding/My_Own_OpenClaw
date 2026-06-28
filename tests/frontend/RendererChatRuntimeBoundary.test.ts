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
  test('chat feature code uses app-runtime clients for backend commands', async () => {
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
    expect(contractsSource).toContain("packages/windie-sdk-js/src");
    expect(contractsSource).not.toContain("export * from '../../../../../packages/windie-sdk-js/src';");
    expect(contractsSource).not.toContain('infrastructure/api/agentSdkClient');
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
    expect(runtimeClientSource).toContain('DesktopRendererConfigRuntimeClient');
    expect(runtimeClientSource).not.toContain('export function buildDeferredQueryModelSelection');
  });

  test('chat feature copy reads active skin through renderer skin facade', async () => {
    const skinConsumerFiles = [
      'components/ChatBrowserSessionControl.jsx',
      'components/ChatInterface.jsx',
    ];

    for (const relativePath of skinConsumerFiles) {
      const source = await fs.readFile(path.join(chatRoot, relativePath), 'utf8');
      expect(source).toContain('DesktopRuntimeSkin');
      expect(source).toContain('DesktopRuntimeSkin.desktopRuntimeSkin');
      expect(source).not.toContain('import { desktopRuntimeSkin');
      expect(source).not.toContain('const chatSkin = desktopRuntimeSkin');
      expect(source).not.toContain('= desktopRuntimeSkin.chat');
    }
  });

  test('chat surface hook reads surface authority through app runtime facade', async () => {
    const hookSource = await fs.readFile(
      path.join(chatRoot, 'hooks/useChatSurfaceController.js'),
      'utf8',
    );
    const surfaceRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatSurfaceRuntime.js'),
      'utf8',
    );

    expect(hookSource).toContain('DesktopChatSurfaceRuntime');
    expect(hookSource).toContain('buildChatSurfaceControllerStateFromSurfaceState');
    expect(hookSource).toContain('liveTurnPhase: surfacePhase');
    expect(hookSource).toContain('liveTurnSource: surfaceSource');
    expect(hookSource).toContain('surfacePhase');
    expect(hookSource).toContain('surfaceSource');
    expect(hookSource).not.toContain('liveTurnPhase,');
    expect(hookSource).not.toContain('liveTurnSource,');
    expect(hookSource).not.toContain('buildChatSurfaceControllerState({');
    expect(hookSource).not.toContain('currentTurnProjection = null');
    expect(hookSource).not.toContain('conversationView = null');
    expect(hookSource).not.toContain('pendingTurn = null');
    expect(hookSource).not.toContain('conversationView?.surfaces');
    expect(hookSource).not.toContain('conversationView?.liveTurn?.canStop');
    expect(hookSource).not.toContain('currentTurnProjection?.conversationRef');
    expect(hookSource).not.toContain('resolveVisibleTurnLifecycle');
    expect(hookSource).not.toContain('resolveLiveTurnPresentationInput');
    expect(surfaceRuntimeSource).toContain('resolveVisibleTurnLifecycle');
    expect(surfaceRuntimeSource).toContain('resolveLiveTurnPresentationInput');
    expect(surfaceRuntimeSource).toContain('buildChatSurfaceControllerStateFromSurfaceState');
    expect(surfaceRuntimeSource).toContain('DesktopConversationViewWorkspaceRuntime');
    expect(surfaceRuntimeSource).toContain('hasWorkspaceConversationView({ conversationView })');
    expect(surfaceRuntimeSource).not.toContain('hasWorkspaceConversationView({ conversationView: surfaceState.conversationView })');
    expect(surfaceRuntimeSource).not.toContain('function isConversationView(value)');
    expect(surfaceRuntimeSource).not.toContain('readExactRef(value.conversationRef)');
    expect(surfaceRuntimeSource).not.toContain('Array.isArray(value.displayRows)');
    expect(surfaceRuntimeSource).not.toContain('isObject(value.liveTurn)');
    expect(surfaceRuntimeSource).not.toContain('isObject(value.surfaces)');
    expect(surfaceRuntimeSource).not.toContain('isObject(value.actions)');
    expect(surfaceRuntimeSource).not.toContain('const conversationView = isConversationView(surfaceState.conversationView)');
    expect(surfaceRuntimeSource).not.toContain('sdkLiveTurn: hasConversationView ? null : surfaceState.sdkLiveTurn ?? null');
    expect(surfaceRuntimeSource).not.toContain('surfaceState.currentTurnProjection');
    expect(surfaceRuntimeSource).toContain('conversationView: surfaceState.conversationView ?? null');
    expect(surfaceRuntimeSource).toContain('const rendererFallbackMessages = hasConversationView');
    expect(surfaceRuntimeSource).toContain('const effectiveSdkLiveTurn = hasConversationView ? null : sdkLiveTurn');
    expect(surfaceRuntimeSource).toContain('sdkLiveTurn: effectiveSdkLiveTurn');
    expect(surfaceRuntimeSource).toContain('messages: rendererFallbackMessages');
    expect(surfaceRuntimeSource).toContain('function readExactSurfaceIdentity(value)');
    expect(surfaceRuntimeSource).toContain('readExactSurfaceIdentity(conversationView?.conversationRef)');
    expect(surfaceRuntimeSource).toContain('readExactSurfaceIdentity(sdkLiveTurn?.conversationRef)');
    expect(surfaceRuntimeSource).toContain('readExactSurfaceIdentity(sessionConversationRef)');
    expect(surfaceRuntimeSource).not.toContain('conversationView?.conversationRef\n    || sdkLiveTurn?.conversationRef');
    expect(surfaceRuntimeSource).not.toContain('|| sessionConversationRef\n    || null');
    expect(surfaceRuntimeSource).toContain('resolveConversationViewSurfaceMode(');
    expect(surfaceRuntimeSource).toContain('CONVERSATION_VIEW_LOOP_SURFACE_MODES');
    expect(surfaceRuntimeSource).toContain('readExactLoopSurfaceMode(conversationView?.surfaces?.[surfaceName]?.mode)');
    expect(surfaceRuntimeSource).not.toContain('conversationView?.surfaces?.[surfaceName]?.mode ?? null');
    expect(surfaceRuntimeSource).toContain('effectiveConversationView,');
    expect(surfaceRuntimeSource).toContain('DesktopStopTurnRuntime');
    expect(surfaceRuntimeSource).toContain('resolveStopTurnTarget({');
    expect(surfaceRuntimeSource).not.toContain('effectiveConversationView?.liveTurn?.canStop');
    expect(surfaceRuntimeSource).not.toContain('features/chat');
  });

  test('minimal chat pill consumes neutral surface trace fields', async () => {
    const minimalPillSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/features/minimalChatPill/components/MinimalChatPill.jsx'),
      'utf8',
    );

    expect(minimalPillSource).toContain('surfacePhase');
    expect(minimalPillSource).toContain('surfaceSource');
    expect(minimalPillSource).not.toContain('liveTurnPhase');
    expect(minimalPillSource).not.toContain('liveTurnSource');
  });

  test('chat pill session traces read opaque SDK view envelopes through workspace gate', async () => {
    const pillSessionRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatPillSessionRuntime.ts'),
      'utf8',
    );

    expect(pillSessionRuntimeSource).toContain('DesktopConversationViewWorkspaceRuntime');
    expect(pillSessionRuntimeSource).toContain(
      'hasWorkspaceConversationView({ conversationView: candidateConversationView })',
    );
    expect(pillSessionRuntimeSource).toContain('sdkLiveTurn?: unknown');
    expect(pillSessionRuntimeSource).toContain('function resolveViewCanStop');
    expect(pillSessionRuntimeSource).toContain('function resolveNoViewLiveTurnRef');
    expect(pillSessionRuntimeSource).not.toContain('desktopConversationRuntimeContracts');
    expect(pillSessionRuntimeSource).not.toContain('as ConversationView');
    expect(pillSessionRuntimeSource).not.toContain('type ChatPillCurrentTurnProjection');
    expect(pillSessionRuntimeSource).not.toContain('type ChatPillConversationView');
    expect(pillSessionRuntimeSource).not.toContain('conversationView?: ChatPillConversationView');
    expect(pillSessionRuntimeSource).not.toContain('displayRows?: unknown[] | null');
    expect(pillSessionRuntimeSource).not.toContain('function isConversationView');
    expect(pillSessionRuntimeSource).not.toContain('Array.isArray(value.displayRows)');
    expect(pillSessionRuntimeSource).not.toContain('isObjectRecord(value.liveTurn)');
    expect(pillSessionRuntimeSource).not.toContain('isObjectRecord(value.surfaces)');
    expect(pillSessionRuntimeSource).not.toContain('isObjectRecord(value.actions)');
    expect(pillSessionRuntimeSource).not.toContain('Boolean(conversationView && typeof conversationView === \'object\')');
    expect(pillSessionRuntimeSource).not.toContain('chatSurfaceState.messages.length');
    expect(pillSessionRuntimeSource).toContain('messageCount: rendererFallbackMessages.length');
  });

  test('live surface runtime rejects repaired overlay refs', async () => {
    const surfaceRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopLiveTurnSurfaceRuntime.js'),
      'utf8',
    );
    const turnRefNormalizer = surfaceRuntimeSource.match(
      /function normalizeTurnRef\(value\) \{[\s\S]*?\n\}/,
    )?.[0] ?? '';
    const conversationRefNormalizer = surfaceRuntimeSource.match(
      /function normalizeConversationRef\(value\) \{[\s\S]*?\n\}/,
    )?.[0] ?? '';
    const phaseNormalizer = surfaceRuntimeSource.match(
      /function normalizePhase\(value\) \{[\s\S]*?\n\}/,
    )?.[0] ?? '';

    expect(phaseNormalizer).toContain('value.length > 0 && value === value.trim()');
    expect(phaseNormalizer).not.toContain('value.trim() ? value.trim() : null');
    expect(turnRefNormalizer).toContain('value.length > 0 && value === value.trim()');
    expect(turnRefNormalizer).not.toContain('value.trim() ? value.trim() : null');
    expect(conversationRefNormalizer).toContain('value.length > 0 && value === value.trim()');
    expect(conversationRefNormalizer).not.toContain('value.trim() ? value.trim() : null');
    expect(surfaceRuntimeSource).toContain('DesktopConversationViewWorkspaceRuntime');
    expect(surfaceRuntimeSource).toContain('hasWorkspaceConversationView({ conversationView })');
    expect(surfaceRuntimeSource).not.toContain('function isConversationView(value)');
    expect(surfaceRuntimeSource).not.toContain('Array.isArray(value.displayRows)');
    expect(surfaceRuntimeSource).not.toContain('const liveTurnRef = normalizeTurnRef(liveTurn.turnRef)');
    expect(surfaceRuntimeSource).not.toContain('const sdkLiveTurnRef = normalizeTurnRef(sdkLiveTurn?.turnRef)');
    expect(surfaceRuntimeSource).not.toContain('const conversationRef = normalizeConversationRef(conversationView.conversationRef)');
    expect(surfaceRuntimeSource).not.toContain('const sdkConversationRef = normalizeConversationRef(sdkLiveTurn?.conversationRef)');
    expect(surfaceRuntimeSource).toContain('const canBorrowLiveTurnRef = !surfaceConversationRef || surfaceConversationRef === viewConversationRef;');
    expect(surfaceRuntimeSource).toContain('|| (canBorrowLiveTurnRef ? normalizeTurnRef(liveTurn?.turnRef) : null)');
    expect(surfaceRuntimeSource).toContain('turnRef: overlayIntent.turnRef');
    expect(surfaceRuntimeSource).toContain('conversationRef: overlayIntent.conversationRef');
    expect(surfaceRuntimeSource).toContain('guardRef: overlayIntent.staleGuardRef');
    expect(surfaceRuntimeSource).not.toContain('turnRef: overlayIntent.turnRef ||');
    expect(surfaceRuntimeSource).not.toContain('conversationRef: overlayIntent.conversationRef ||');
    expect(surfaceRuntimeSource).not.toContain('guardRef: overlayIntent.staleGuardRef ||');
    expect(surfaceRuntimeSource).not.toContain('turnRef: overlayIntent.turnRef || liveTurn.turnRef');
    expect(surfaceRuntimeSource).not.toContain('conversationRef: overlayIntent.conversationRef || conversationView.conversationRef');
    expect(surfaceRuntimeSource).not.toContain('turnRef: overlayIntent.turnRef || sdkLiveTurn?.turnRef');
    expect(surfaceRuntimeSource).not.toContain('conversationRef: overlayIntent.conversationRef || sdkLiveTurn?.conversationRef');
  });

  test('chat runtime hooks read app config through renderer config runtime facade', async () => {
    const hookFiles = [
      'components/ChatInterface.jsx',
      'hooks/useChatMessageSender.ts',
      'hooks/useChatStream.ts',
      'hooks/useChatSurfaceController.js',
    ];
    const runtimeClientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopRendererConfigRuntimeClient.js'),
      'utf8',
    );

    for (const relativePath of hookFiles) {
      const source = await fs.readFile(path.join(chatRoot, relativePath), 'utf8');
      expect(source).toContain('desktopRendererConfigRuntimeClient');
      expect(source).toContain('DesktopRendererConfigRuntimeClient');
      expect(source).not.toContain('import { useDesktopRendererConfigContext');
      expect(source).not.toContain('useDesktopRendererConfigContext,');
      expect(source).not.toContain('app/providers/AppConfigContext');
      expect(source).not.toContain('useAppConfigContext');
    }
    expect(runtimeClientSource).toContain('useAppConfigContext');
    expect(runtimeClientSource).toContain('useDesktopRendererConfigContext');
    expect(runtimeClientSource).toContain('readDeferredQueryModelSelection');
    expect(runtimeClientSource).toContain('DesktopRendererConfigStorageRuntime.loadConfigFromStorage');
    expect(runtimeClientSource).not.toContain('export function useDesktopRendererConfigContext');
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
    const liveTurnRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient.ts'),
      'utf8',
    );

    expect(hookSource).not.toContain('recordUserTranscriptMessage');
    expect(hookSource).not.toContain('recordUserMessage');
    expect(hookSource).toContain('DesktopChatSendPreparationRuntime');
    expect(helperSource).toContain('export const DesktopChatSendPreparationRuntime = Object.freeze');
    expect(helperSource).not.toContain('export async function prepareDesktopChatSend');
    expect(helperSource).not.toContain('export async function dispatchPreparedDesktopChatTurn');
    expect(helperSource).not.toContain('recordUserTranscriptMessage');
    expect(helperSource).not.toContain('recordTranscriptUserMessage');
    expect(helperSource).not.toContain('model: null');
    expect(helperSource).not.toContain('preparedTurn.model');
    expect(helperSource).not.toContain('AgentModelSelection');
    expect(liveTurnRuntimeSource).not.toContain('AgentModelSelection');
    expect(liveTurnRuntimeSource).not.toContain('input.model');
    expect(liveTurnRuntimeSource).not.toContain('model: input.model');
    expect(liveTurnRuntimeSource).toContain('function optionalExactString(value: unknown)');
    expect(liveTurnRuntimeSource).not.toContain('function optionalString(value: unknown)');
    expect(liveTurnRuntimeSource).toContain('workspace_path: optionalExactString(input.workspacePath) ?? null');
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

  test('chat stream compaction persistence uses the app runtime command facade', async () => {
    const source = await fs.readFile(
      path.join(chatRoot, 'hooks/chatStream/useChatStreamCompactionHandlers.ts'),
      'utf8',
    );
    const runtimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatStreamCompactionRuntime.ts'),
      'utf8',
    );

    expect(source).not.toContain('DesktopConversationStoreAdapter');
    expect(source).toContain('DesktopChatStreamCompactionRuntime');
    expect(source).not.toContain('DesktopConversationContinuityService');
    expect(runtimeSource).toContain('DesktopConversationContinuityService.replaceCompactedReplay');
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
    expect(payloadRuntimeSource).toContain('sourceRevisionId');
    expect(payloadRuntimeSource).not.toContain('rev-compaction-');
    expect(payloadRuntimeSource).toContain('toolSchemas');
    expect(payloadRuntimeSource).toContain('export const DesktopChatStreamEventPayloadRuntime = Object.freeze');
    expect(payloadRuntimeSource).toContain('resolveConversationStreamEventPayload');
    expect(payloadRuntimeSource).not.toContain('export function resolveConversationStreamEventPayload');
    expect(payloadRuntimeSource).not.toContain('export function buildCompactionDebugInfo');
    expect(compactionHookSource).toContain('DesktopChatStreamEventPayloadRuntime');
    expect(compactionHookSource).toContain('buildCompactionDebugInfo');
    expect(compactionHookSource).toContain('buildCompactedReplaySnapshot');
    expect(compactionHookSource).toContain('resolveCompactionErrorText');
    expect(compactionHookSource).toContain('resolveConversationStreamEventPayload');
    expect(compactionHookSource).toContain('DesktopChatStreamEventRuntime');
    expect(compactionHookSource).toContain('isCompactionStartedConversationStreamEvent');
    expect(compactionHookSource).toContain('isCompactionCompletedConversationStreamEvent');
    expect(compactionHookSource).toContain('isCompactionSkippedConversationStreamEvent');
    expect(compactionHookSource).toContain('isCompactionFailedConversationStreamEvent');
    expect(compactionHookSource).not.toContain('event.payload.error');
    expect(compactionHookSource).not.toContain('event.type === expectedType');
    expect(compactionHookSource).not.toContain("event.type === 'compaction_skipped'");
    expect(metadataHookSource).toContain('isSystemPromptConversationStreamEvent');
    expect(metadataHookSource).toContain('isUserMessageMetadataConversationStreamEvent');
    expect(metadataHookSource).toContain('isAssistantMessageConversationStreamEvent');
    expect(metadataHookSource).toContain('isToolSchemasMetadataConversationStreamEvent');
    expect(metadataHookSource).toContain('DesktopChatStreamEventRuntime');
    expect(metadataHookSource).toContain('DesktopChatStreamEventPayloadRuntime');
    expect(metadataHookSource).toContain('resolveToolSchemasMetadataPayload');
    expect(metadataHookSource).toContain('resolveConversationStreamEventPayload');
    expect(metadataHookSource).not.toContain('event.type === expectedType');
    expect(compactionHookSource).not.toContain('event.payload');
    expect(metadataHookSource).not.toContain('event.payload');
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
    expect(source).toContain('DesktopChatStreamEventPayloadRuntime');
    expect(source).toContain('buildTokenCountsFromPayload');
    expect(source).toContain('resolveTerminalErrorPayload');
    expect(source).toContain('resolveConversationStreamEventPayload');
    expect(source).not.toContain('event.payload');
    expect(source).not.toContain('prompt_tokens');
    expect(source).not.toContain('usage_source');
    expect(source).not.toContain('cache_status');
    expect(source).toContain('ConversationEvent');
    expect(payloadRuntimeSource).toContain('export const DesktopChatStreamEventPayloadRuntime = Object.freeze');
    expect(payloadRuntimeSource).toContain('prompt_tokens');
    expect(payloadRuntimeSource).toContain('usage_source');
    expect(payloadRuntimeSource).toContain('cache_status');
    expect(payloadRuntimeSource).not.toContain('export function buildTokenCountsFromPayload');
    expect(payloadRuntimeSource).not.toContain('export function resolveTerminalErrorPayload');
  });

  test('chat stream sub-handlers resolve SDK event identity through app runtime facade', async () => {
    const handlerRelativePaths = [
      'hooks/chatStream/useChatStreamCompactionHandlers.ts',
      'hooks/chatStream/useChatStreamCompletionHandler.ts',
      'hooks/chatStream/useChatStreamLocalUserHandler.ts',
      'hooks/chatStream/useChatStreamMetadataHandlers.ts',
      'hooks/chatStream/useChatStreamTerminalHandlers.ts',
    ];
    const helperNeedles = [
      'resolveConversationStreamEventIdentity',
      'resolveTurnCompletedStreamEventState',
    ];
    const runtimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatStreamEventRuntime.ts'),
      'utf8',
    );

    for (const relativePath of handlerRelativePaths) {
      const source = await fs.readFile(path.join(chatRoot, relativePath), 'utf8');
      expect(source).not.toContain('event.conversationRef');
      expect(source).not.toContain('event.turnRef');
      expect(source).not.toContain('event.payload');
      expect(source).toContain('DesktopChatStreamEventRuntime');
      expect(
        helperNeedles.some((needle) => source.includes(needle)),
      ).toBe(true);
      expect(source).not.toContain('resolveConversationStreamEventConversationRef');
      expect(source).not.toContain('resolveConversationStreamEventTurnRef');
      expect(source).not.toContain('resolveConversationStreamEventTurnRefForUpdate');
    }

    expect(runtimeSource).toContain('export const DesktopChatStreamEventRuntime = Object.freeze');
    expect(runtimeSource).toContain('resolveConversationStreamEventIdentity');
    expect(runtimeSource).toContain('resolveConversationStreamEventConversationRef');
    expect(runtimeSource).toContain('resolveConversationStreamEventTurnRef');
    expect(runtimeSource).toContain('function readExactIdentityString');
    expect(runtimeSource).toContain('value.length > 0 && value === value.trim()');
    expect(runtimeSource).not.toContain('\n  resolveConversationStreamEventConversationRef,');
    expect(runtimeSource).not.toContain('\n  resolveConversationStreamEventTurnRef,');
    expect(runtimeSource).not.toContain('resolveConversationStreamEventTurnRefForUpdate');
    expect(runtimeSource).toContain('resolveTurnCompletedStreamEventState');
    expect(runtimeSource).toContain('resolveWorkspaceThinkingSourceEventType');
    expect(runtimeSource).not.toContain('export function resolveConversationStreamEventConversationRef');
    expect(runtimeSource).not.toContain('export function resolveConversationStreamEventTurnRef');
  });

  test('chat stream compaction thinking source reads stay behind app runtime', async () => {
    const streamSource = await fs.readFile(
      path.join(chatRoot, 'hooks/useChatStream.ts'),
      'utf8',
    );

    expect(streamSource).toContain('resolveWorkspaceThinkingSourceEventType');
    expect(streamSource).toContain('getChatStreamWorkspaceReadModelFromChatStore');
    expect(streamSource).toContain('getChatStreamWorkspaceReadModel: getChatStreamWorkspaceReadModelFromChatStore');
    expect(streamSource).not.toContain('getProjectedWorkspaceReadModelFromChatStore');
    expect(streamSource).not.toContain('getWorkspaceStateFromChatStore');
    expect(streamSource).not.toContain('.thinkingSourceEventType');
  });

  test('chat stream backend ingress normalization stays behind the app runtime', async () => {
    const source = await fs.readFile(
      path.join(chatRoot, 'hooks/useChatStream.ts'),
      'utf8',
    );

    expect(source).toContain('desktopChatStreamIngressRuntime');
    expect(source).toContain('DesktopChatStreamIngressRuntime');
    expect(source).not.toContain('import {\n  handleConversationEventIngress');
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

  test('dashboard memory feature code routes through the memory app-runtime client', async () => {
    const dashboardRoot = path.resolve(
      __dirname,
      '../../frontend/src/renderer/features/dashboard',
    );
    const files = [
      path.join(dashboardRoot, 'components/sections/MemorySection.jsx'),
      path.join(dashboardRoot, 'components/sections/MemoryItem.jsx'),
      path.resolve(
        __dirname,
        '../../frontend/src/renderer/app/runtime/desktopMemoryPresentationRuntime.js',
      ),
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

  test('dashboard memory projection rules live in the app runtime facade', async () => {
    const dashboardRoot = path.resolve(
      __dirname,
      '../../frontend/src/renderer/features/dashboard',
    );
    const memorySectionSource = await fs.readFile(
      path.join(dashboardRoot, 'components/sections/MemorySection.jsx'),
      'utf8',
    );
    const runtimeSource = await fs.readFile(
      path.resolve(
        __dirname,
        '../../frontend/src/renderer/app/runtime/desktopMemoryPresentationRuntime.js',
      ),
      'utf8',
    );

    expect(memorySectionSource).toContain('desktopMemoryPresentationRuntime');
    expect(memorySectionSource).toContain('DesktopMemoryPresentationRuntime');
    expect(memorySectionSource).not.toContain('const MEMORY_TYPES = Object.freeze');
    expect(memorySectionSource).not.toContain('./memorySectionData');
    expect(memorySectionSource).not.toContain('./memorySectionState');
    expect(runtimeSource).toContain('DASHBOARD_MEMORY_TYPES');
    expect(runtimeSource).toContain('DesktopMemoryPresentationRuntime');
    expect(runtimeSource).toContain('getDashboardMemoryTypes');
    expect(runtimeSource).toContain('normalizeEpisodicMemoriesForDashboard');
    expect(runtimeSource).toContain('normalizeSemanticMemoriesForDashboard');
    expect(runtimeSource).not.toContain('export function normalizeEpisodicMemoriesForDashboard');
    expect(runtimeSource).not.toContain('export function normalizeSemanticMemoriesForDashboard');
    expect(runtimeSource).not.toContain('export function buildProceduralMemoriesForDashboard');
    expect(runtimeSource).not.toContain('export function getDashboardMemoryTypes');
    expect(runtimeSource).not.toContain('export function resolveDashboardMemoryTypeInfo');
    expect(runtimeSource).not.toContain('export function filterDashboardMemoriesByQuery');
    await expect(fs.stat(
      path.join(dashboardRoot, 'components/sections/memorySectionData.js'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.join(dashboardRoot, 'components/sections/memorySectionState.js'),
    )).rejects.toThrow();
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
    expect(sectionSource).not.toContain('payload.ok');
    expect(sectionSource).not.toContain('payload.errorMessage');
    expect(sectionSource).not.toContain('payload.registry');
    expect(sectionSource).not.toContain('registryError.kind');
    expect(sectionSource).not.toContain('registryError.id');
    expect(sectionSource).not.toContain('registryError.reason');
    expect(sectionSource).toContain('DesktopMcpRuntimeClient.listMcpServers');
    expect(sectionSource).toContain('DesktopMcpRuntimeClient.refreshMcpServers');
    expect(sectionSource).toContain('DesktopMcpRuntimeClient.setMcpServerEnabled');
    expect(sectionSource).toContain('DesktopMcpRuntimeClient.getMcpRegistryErrorPresentation');
    expect(sectionSource).toContain('DesktopMcpRuntimeClient.getEmptyMcpRegistry');
    expect(sectionSource).not.toContain('EMPTY_DESKTOP_MCP_REGISTRY');
    expect(clientSource).not.toContain('export const EMPTY_DESKTOP_MCP_REGISTRY');
    expect(clientSource).toContain('function normalizeDesktopMcpRegistry');
    expect(clientSource).toContain('function normalizeDesktopMcpEnablementResult');
    expect(clientSource).toContain('function resolveDesktopMcpEnablementRegistry');
    expect(clientSource).toContain('function getDesktopMcpRegistryErrorPresentation');
    expect(clientSource).not.toContain('export function normalizeDesktopMcpRegistry');
    expect(clientSource).not.toContain('export function normalizeDesktopMcpEnablementResult');
    expect(clientSource).not.toContain('export function resolveDesktopMcpEnablementRegistry');
    expect(clientSource).not.toContain('export function getDesktopMcpRegistryErrorPresentation');
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
    const runtimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatStreamEventRuntime.ts'),
      'utf8',
    );
    const trackingRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatStreamTrackingRuntime.ts'),
      'utf8',
    );
    const terminalHandoffRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatStreamTerminalHandoffRuntime.ts'),
      'utf8',
    );

    expect(source).toContain('desktopChatStreamEventRuntime');
    expect(source).toContain('DesktopChatStreamEventRuntime');
    expect(source).toContain('isAssistantMessageConversationStreamEvent');
    expect(source).toContain('isCompactionCompletedConversationStreamEvent');
    expect(source).toContain('isCompactionFailedConversationStreamEvent');
    expect(source).toContain('isCompactionStartedConversationStreamEvent');
    expect(source).toContain('isLocalUserMessageConversationStreamEvent');
    expect(source).toContain('isSupportedConversationStreamEvent');
    expect(source).toContain('isSystemPromptConversationStreamEvent');
    expect(source).toContain('isToolDisplayOnlyConversationStreamEvent');
    expect(source).toContain('isToolSchemasMetadataConversationStreamEvent');
    expect(source).toContain('isTurnErrorConversationStreamEvent');
    expect(source).toContain('isUserMessageMetadataConversationStreamEvent');
    expect(source).toContain('isUsageUpdatedConversationStreamEvent');
    expect(source).toContain('resolveConversationStreamEventIdentity');
    expect(source).toContain('shouldIgnoreConversationEventIdentityForStaleTurn');
    expect(source).not.toContain('shouldIgnoreConversationEventForStaleTurn');
    expect(source).not.toContain('resolveConversationStreamEventConversationRef');
    expect(source).not.toContain('event.conversationRef');
    expect(source).not.toContain('event.turnRef');
    expect(source).not.toContain('event.type ===');
    expect(source).not.toContain("event.type === 'compaction_started'");
    expect(source).not.toContain("event.type === 'compaction_applied'");
    expect(source).not.toContain("event.type === 'compaction_skipped'");
    expect(source).not.toContain("event.type === 'compaction_failed'");
    expect(source).not.toContain("event.type === 'system_prompt'");
    expect(source).not.toContain("event.type === 'user_message_metadata'");
    expect(source).not.toContain("event.type === 'assistant_message'");
    expect(source).not.toContain("event.type === 'tool_schemas_metadata'");
    expect(source).not.toContain("event.type !== 'turn_completed'");
    expect(source).not.toContain("event.type !== 'tool_call'");
    expect(source).not.toContain("event.type !== 'usage_updated'");
    expect(source).not.toContain("event.type === 'tool_call'");
    expect(source).not.toContain("event.type === 'tool_output'");
    expect(source).not.toContain("event.type === 'tool_bundle_call'");
    expect(source).not.toContain("event.type === 'tool_bundle_output'");
    expect(source).toContain('desktopChatStreamTrackingRuntime');
    expect(source).not.toContain('chatStreamEventRuntime');
    expect(source).not.toContain('chatStreamConversationGate');
    expect(source).not.toContain('chatStreamTurnGuard');
    expect(source).not.toContain('chatStreamTerminalHandoffGuard');
    expect(source).not.toContain('chatStreamTracking');
    expect(runtimeSource).toContain('DesktopChatStreamTrackingRuntime');
    expect(runtimeSource).toContain('DesktopChatStreamTerminalHandoffRuntime');
    expect(runtimeSource).toContain('export const DesktopChatStreamEventRuntime = Object.freeze');
    expect(runtimeSource).toContain('isAssistantMessageConversationStreamEvent');
    expect(runtimeSource).toContain('isCompactionCompletedConversationStreamEvent');
    expect(runtimeSource).toContain('isCompactionFailedConversationStreamEvent');
    expect(runtimeSource).toContain('isCompactionStartedConversationStreamEvent');
    expect(runtimeSource).toContain('isLocalUserMessageConversationStreamEvent');
    expect(runtimeSource).toContain('isSupportedConversationStreamEvent');
    expect(runtimeSource).toContain('isSystemPromptConversationStreamEvent');
    expect(runtimeSource).toContain('isToolDisplayOnlyConversationStreamEvent');
    expect(runtimeSource).toContain('isToolSchemasMetadataConversationStreamEvent');
    expect(runtimeSource).toContain('isTurnErrorConversationStreamEvent');
    expect(runtimeSource).toContain('isUserMessageMetadataConversationStreamEvent');
    expect(runtimeSource).toContain('isUsageUpdatedConversationStreamEvent');
    expect(runtimeSource).toContain('resolveConversationStreamEventConversationRef');
    expect(runtimeSource).toContain('resolveConversationStreamEventTurnRef');
    expect(runtimeSource).toContain('shouldIgnoreConversationEventIdentityForStaleTurn');
    expect(runtimeSource).not.toContain('shouldIgnoreConversationEventForStaleTurn');
    expect(runtimeSource).not.toContain('\n  resolveConversationStreamEventConversationRef,');
    expect(runtimeSource).not.toContain('\n  resolveConversationStreamEventTurnRef,');
    expect(runtimeSource).not.toContain('resolveConversationStreamEventTurnRefForUpdate');
    expect(runtimeSource).not.toContain('export function isSupportedConversationStreamEvent');
    expect(runtimeSource).not.toContain('export function isToolDisplayOnlyConversationStreamEvent');
    expect(runtimeSource).not.toContain('export function recordTrackingEvent');
    expect(runtimeSource).toContain("'user_message'");
    expect(runtimeSource).toContain("'compaction_started'");
    expect(runtimeSource).toContain("'compaction_applied'");
    expect(runtimeSource).toContain("'compaction_skipped'");
    expect(runtimeSource).toContain("'compaction_failed'");
    expect(runtimeSource).toContain("'system_prompt'");
    expect(runtimeSource).toContain("'user_message_metadata'");
    expect(runtimeSource).toContain("'assistant_message'");
    expect(runtimeSource).toContain("'tool_schemas_metadata'");
    expect(runtimeSource).toContain("'turn_error'");
    expect(runtimeSource).toContain("'turn_completed'");
    expect(runtimeSource).toContain("'usage_updated'");
    expect(runtimeSource).toContain("'tool_bundle_output'");
    expect(trackingRuntimeSource).toContain('export const DesktopChatStreamTrackingRuntime = Object.freeze');
    expect(trackingRuntimeSource).toContain('buildUpdateStreamTrackingStateUpdate');
    expect(trackingRuntimeSource).not.toContain('export function applyTrackingEvent');
    expect(terminalHandoffRuntimeSource).toContain('export const DesktopChatStreamTerminalHandoffRuntime = Object.freeze');
    expect(terminalHandoffRuntimeSource).toContain('pendingTurn');
    expect(terminalHandoffRuntimeSource).not.toContain('messages:');
    expect(terminalHandoffRuntimeSource).not.toContain('workspace.messages');
    expect(terminalHandoffRuntimeSource).not.toContain('lastMessage');
    expect(terminalHandoffRuntimeSource).not.toContain('isSending');
    expect(terminalHandoffRuntimeSource).toContain('turnRef.length > 0 && turnRef === turnRef.trim()');
    expect(terminalHandoffRuntimeSource).not.toContain('return typeof turnRef === \'string\' ? turnRef.trim() : \'\';');
    expect(terminalHandoffRuntimeSource).not.toContain('export function normalizeTurnRef');
    expect(terminalHandoffRuntimeSource).not.toContain('export function isAwaitingFirstChunkMismatch');
    expect(terminalHandoffRuntimeSource).not.toContain('export function hasTerminalPendingHandoff');
    expect(terminalHandoffRuntimeSource).not.toContain('export function shouldIgnoreForTerminalPendingHandoff');
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
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopSdkLiveTurnEffectsRuntime.ts'),
      'utf8',
    );
    const projectionStreamRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopConversationProjectionStreamRuntime.ts'),
      'utf8',
    );
    const traceRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopRendererTraceRuntime.ts'),
      'utf8',
    );
    const thinkingRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatStreamThinkingRuntime.ts'),
      'utf8',
    );

    expect(streamSource).not.toContain('assistant_delta');
    expect(streamSource).not.toContain('reasoning_delta');
    expect(projectionSource).toContain('DesktopConversationRuntimeEventClient.onCurrentTurnProjection');
    expect(projectionSource).toContain('applyCurrentTurnProjectionEvent');
    expect(projectionSource).not.toContain('desktopSdkLiveTurnEffectsRuntime');
    expect(projectionSource).not.toContain('DesktopSdkLiveTurnEffectsRuntime');
    expect(projectionSource).not.toContain('applySdkLiveTurnSideEffects');
    expect(projectionSource).not.toContain('logRendererCurrentTurnAppliedTrace');
    expect(projectionSource).not.toContain('logRendererLiveSurfaceTrace');
    expect(projectionSource).not.toContain("'renderer.current_turn.applied'");
    expect(projectionSource).not.toContain('overlayMode');
    expect(projectionSource).not.toContain('guardRef');
    expect(projectionSource).not.toContain('typingVisible');
    expect(projectionSource).not.toContain('overlayVisible');
    expect(projectionSource).not.toContain('hasVisibleContent');
    expect(projectionSource).not.toContain('entryCount');
    expect(projectionSource).not.toContain('assistantLength');
    expect(projectionSource).not.toContain('reasoningLength');
    expect(projectionSource).not.toContain('toolEventCount');
    expect(projectionSource).not.toContain('staleSideEffectsSkipped');
    expect(traceRuntimeSource).toContain('buildRendererCurrentTurnAppliedTracePayload');
    expect(traceRuntimeSource).toContain('logRendererCurrentTurnAppliedTrace');
    expect(traceRuntimeSource).toContain("'renderer.current_turn.applied'");
    expect(traceRuntimeSource).toContain('staleSideEffectsSkipped');
    expect(projectionStreamRuntimeSource).toContain('DesktopSdkLiveTurnEffectsRuntime');
    expect(projectionStreamRuntimeSource).toContain('applySdkLiveTurnSideEffects');
    expect(projectionStreamRuntimeSource).toContain('logRendererCurrentTurnAppliedTrace');
    expect(projectionStreamRuntimeSource).not.toContain('features/chat');
    expect(projectionSideEffectsSource).toContain('export const DesktopSdkLiveTurnEffectsRuntime = Object.freeze');
    expect(projectionSideEffectsSource).toContain('setThinkingStatus');
    expect(projectionSideEffectsSource).toContain('streaming-response');
    expect(projectionSideEffectsSource).toContain('entry.id === entry.id.trim()');
    expect(projectionSideEffectsSource).not.toContain("? entry.id.trim()");
    expect(projectionSideEffectsSource).not.toContain("return typeof entry.id === 'string' && entry.id.trim()");
    expect(projectionSideEffectsSource).toContain('desktopChatStreamThinkingRuntime');
    expect(projectionSideEffectsSource).toContain('DesktopChatStreamThinkingRuntime');
    expect(projectionSideEffectsSource).not.toContain('typingVisible');
    expect(projectionSideEffectsSource).not.toContain('overlayVisible');
    expect(projectionSideEffectsSource).not.toContain('assistantText');
    expect(projectionSideEffectsSource).not.toContain('reasoningText');
    expect(projectionSideEffectsSource).not.toContain('toolEvents');
    expect(projectionSideEffectsSource).not.toContain('toolEventIds');
    expect(projectionSideEffectsSource).not.toContain('import {\n  buildThinkingStatus');
    expect(projectionSideEffectsSource).not.toContain('export function createProjectionCursor');
    expect(projectionSideEffectsSource).not.toContain('export function buildProjectionCursorKey');
    expect(projectionSideEffectsSource).not.toContain('export function shouldAcceptCurrentTurnBeforeLocalSend');
    expect(projectionSideEffectsSource).not.toContain('export function applySdkLiveTurnSideEffects');
    expect(projectionSideEffectsSource).not.toContain('features/chat');
    expect(thinkingRuntimeSource).toContain('export const DesktopChatStreamThinkingRuntime = Object.freeze');
    expect(thinkingRuntimeSource).toContain('getGenericThinkingStatus');
    expect(thinkingRuntimeSource).toContain('isGenericThinkingStatus');
    expect(thinkingRuntimeSource).not.toContain('export function buildThinkingStatus');
    expect(thinkingRuntimeSource).not.toContain('export function getGenericThinkingStatus');
    expect(thinkingRuntimeSource).not.toContain('export function isGenericThinkingStatus');
    expect(thinkingRuntimeSource).not.toContain('export function getCompactionStartedThinkingStatus');
    expect(thinkingRuntimeSource).not.toContain('export function getCompactionCompletedThinkingStatus');
    expect(thinkingRuntimeSource).not.toContain('export function getCompactionFailedThinkingStatus');
    expect(thinkingRuntimeSource).not.toContain('export function resolveCompactionFailedThinkingStatus');
    expect(thinkingRuntimeSource).not.toContain('export const GENERIC_THINKING_STATUS');
    expect(thinkingRuntimeSource).not.toContain('export const COMPACTION_THINKING_STATUS');
    expect(thinkingRuntimeSource).not.toContain('export const COMPACTION_COMPLETED_THINKING_STATUS');
    expect(thinkingRuntimeSource).not.toContain('export const COMPACTION_FAILED_THINKING_STATUS');
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
    expect(ingressSource).toContain('resolveConversationStreamEventIdentity');
    expect(ingressSource).not.toContain('resolveConversationStreamEventConversationRef');
    expect(ingressSource).not.toContain('resolveConversationStreamEventTurnRef');
    expect(ingressSource).toContain('DesktopChatStreamEventPayloadRuntime');
    expect(ingressSource).toContain('resolveConversationStreamEventUserId');
    expect(ingressSource).toContain('export const DesktopChatStreamIngressRuntime = Object.freeze');
    expect(ingressSource).not.toContain('export function handleConversationEventIngress');
    expect(ingressSource).not.toContain('event.conversationRef');
    expect(ingressSource).not.toContain('event.turnRef');
    expect(ingressSource).not.toContain('event.payload');
    expect(ingressSource).not.toContain('normalizeBackendEventToConversationEvent');
    expect(eventClientSource).toContain('DESKTOP_RUNTIME_ON_CHANNELS.CONVERSATION_EVENT');
    expect(eventClientSource).toContain('hasSdkPresentation(projection.presentation)');
    expect(eventClientSource).not.toContain("&& typeof projection.assistantText === 'string'");
    expect(eventClientSource).not.toContain('&& Array.isArray(projection.toolEvents)');
    expect(eventClientSource).not.toContain('projection.toolEvents');
  });

  test('chat attachment image presentation builds artifact URLs through app runtime client', async () => {
    const resolvedAttachmentSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopAttachmentImageRuntime.js'),
      'utf8',
    );
    const replayActionsSource = await fs.readFile(
      path.join(chatRoot, 'hooks/useConversationReplayActions.js'),
      'utf8',
    );
    const replayRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopConversationReplayRuntime.js'),
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

    for (const source of [
      resolvedAttachmentSource,
      replayActionsSource,
      composerAttachmentSource,
      chatStreamEventPayloadSource,
    ]) {
      expect(source).not.toContain('infrastructure/services/screenshotMessageState');
      expect(source).not.toContain('infrastructure/services/ArtifactImageUtils');
    }
    expect(resolvedAttachmentSource).not.toContain('desktopMessageScreenshotRuntime');
    expect(resolvedAttachmentSource).toContain('export const DesktopAttachmentImageRuntime = Object.freeze');
    expect(resolvedAttachmentSource).not.toContain('useResolvedMessageScreenshotSrc');
    expect(resolvedAttachmentSource).toContain('readSdkImageAttachmentSource');
    expect(resolvedAttachmentSource).not.toContain('function isSdkImageAttachment');
    expect(resolvedAttachmentSource).toContain('DesktopArtifactRuntimeClient.inferArtifactRefFromUrl');
    expect(resolvedAttachmentSource).toContain('DesktopArtifactRuntimeClient.fetchArtifactImage');
    expect(resolvedAttachmentSource).not.toContain('artifactId.trim()');
    expect(replayActionsSource).not.toContain('DesktopArtifactRuntimeClient.resolveReplayScreenshotState');
    expect(composerAttachmentSource).toContain('DesktopArtifactRuntimeClient.resolveArtifactImageExtension');
    expect(chatStreamEventPayloadSource).not.toContain('buildRemoteScreenshotAttachment');
    expect(chatStreamEventPayloadSource).not.toContain('buildScreenshotAttachment');
    expect(artifactClientSource).toContain('DesktopRuntimeEndpointClient.buildArtifactUrl');
    expect(artifactClientSource).not.toContain('resolveReplayScreenshotState');
    expect(artifactClientSource).not.toContain('buildMessageScreenshotState');
    expect(artifactClientSource).not.toContain('resolveScreenshotAttachmentState');
    expect(artifactClientSource).not.toContain('buildRemoteScreenshotAttachment');
    expect(artifactClientSource).not.toContain('screenshotMessageState');
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
    expect(startupClientSource).toContain('getRendererEntrypointView');
    expect(startupClientSource).toContain('shouldSuppressWakewordOnStartup');
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
    expect(dashboardHookSource).toContain('DesktopLocalRuntimeStatusRuntimeClient.onReady');
    expect(dashboardHookSource).not.toContain('DesktopLocalRuntimeStatusRuntimeClient.subscribe');
    expect(dashboardHookSource).not.toContain('DesktopLocalRuntimeStatusRuntimeClient.getSnapshot');
    expect(dashboardHookSource).not.toContain('snapshot.ready');
    expect(dashboardHookSource).not.toContain('DESKTOP_RUNTIME_ON_CHANNELS.CONVERSATION_EVENT');
    expect(dashboardHookSource).not.toContain('infrastructure/runtime/localRuntimeStatusStore');
    expect(dashboardHookSource).not.toContain('IpcBridge.on');
    expect(eventClientSource).toContain('DESKTOP_RUNTIME_ON_CHANNELS.CONVERSATION_EVENT');
    expect(localRuntimeStatusClientSource).toContain('onReady');
    expect(localRuntimeStatusClientSource).toContain('function isLocalRuntimeStatusReady');
    expect(localRuntimeStatusClientSource).not.toContain('export function isLocalRuntimeStatusReady');
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
    const displayProjectionSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopConversationDisplayProjection.ts'),
      'utf8',
    );
    const sdkDisplayProjectionRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopSdkDisplayChatMessageProjectionRuntime.ts'),
      'utf8',
    );
    const legacySdkDisplayProjectionAdapterPath = path.resolve(
      __dirname,
      '../../frontend/src/renderer/infrastructure/transcript/sdkDisplayChatMessageProjection.ts',
    );
    const projectionStreamRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopConversationProjectionStreamRuntime.ts'),
      'utf8',
    );
    const replayRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopConversationReplayRuntime.js'),
      'utf8',
    );
    expect(projectionSource).not.toContain('DESKTOP_RUNTIME_ON_CHANNELS');
    expect(projectionSource).not.toContain('IpcBridge.on');
    expect(projectionSource).not.toContain('infrastructure/transcript/sdkDisplayChatMessageProjection');
    expect(projectionSource).toContain('desktopConversationProjectionStreamRuntime');
    expect(projectionSource).toContain('DesktopConversationProjectionStreamRuntime');
    expect(projectionSource).toContain('getCurrentTurnProjectionWorkspaceReadModelFromChatStore');
    expect(projectionSource).not.toContain('getProjectedWorkspaceReadModelFromChatStore');
    expect(projectionSource).not.toContain('projectWorkspaceReadModelState');
    expect(projectionSource).not.toContain('getWorkspaceState(conversationRef)');
    expect(projectionSource).toContain('getCurrentTurnProjectionWorkspaceReadModel: getCurrentTurnProjectionWorkspaceReadModelFromChatStore');
    expect(projectionSource).not.toContain('getWorkspaceState: useChatStore.getState().getWorkspaceState');
    expect(projectionSource).not.toContain('applyDisplayRowsProjectionEvent');
    expect(projectionSource).not.toContain('buildDisplayRowsProjection');
    expect(projectionSource).not.toContain('isSupersededTurn');
    expect(projectionSource).not.toContain('buildReplayProjectionTracePayload');
    expect(projectionSource).not.toContain('buildProjectionCursorKey');
    expect(projectionSource).not.toContain('shouldIgnoreConversationEventForStaleTurn');
    expect(projectionSource).not.toContain('desktopConversationDisplayProjection');
    expect(projectionSource).not.toContain('DesktopConversationDisplayProjection');
    expect(projectionSource).not.toContain('mergeRendererAnnotationsIntoSdkMessages');
    expect(projectionSource).not.toContain('buildChatMessagesFromSdkDisplayRows');
    expect(projectionSource).not.toContain('buildDisplayProjectionTraceSummary');
    expect(projectionSource).not.toContain('function normalizeTurnRef');
    expect(projectionSource).not.toContain('function withoutSupersededRows');
    expect(projectionSource).not.toContain('function mergeRendererAnnotations');
    expect(projectionSource).not.toContain('function pendingOptimisticUserMessages');
    expect(projectionSource).not.toContain('function isOptimisticUserMessage');
    expect(projectionSource).not.toContain("message.sender === 'user'");
    expect(projectionSource).not.toContain("sourceEventType === 'renderer-compose'");
    expect(projectionSource).not.toContain("sourceChannel === 'renderer-local'");
    expect(projectionSource).not.toContain('function isCurrentTurnProjection');
    expect(projectionSource).not.toContain('function isSdkDisplayRows');
    expect(projectionSource).not.toContain('payload && typeof payload');
    expect(projectionSource).toContain('DesktopConversationRuntimeEventClient.onPendingTurn');
    expect(projectionSource).toContain('DesktopConversationRuntimeEventClient.onCurrentTurnProjection');
    expect(projectionSource).not.toContain('DesktopConversationRuntimeEventClient.onDisplayRowsProjection');
    expect(projectionSource).not.toContain('if (!shouldApplyMessages)');
    expect(eventClientSource).toContain('DESKTOP_RUNTIME_ON_CHANNELS.PENDING_TURN');
    expect(eventClientSource).toContain('DESKTOP_RUNTIME_ON_CHANNELS.CURRENT_TURN');
    expect(eventClientSource).toContain('function normalizeCurrentTurnProjectionEvent');
    expect(eventClientSource).toContain('DesktopConversationViewWorkspaceRuntime');
    expect(eventClientSource).toContain('hasWorkspaceConversationView({ conversationView: source.view })');
    expect(eventClientSource).not.toContain('function isConversationView');
    expect(eventClientSource).not.toContain('export function normalizeCurrentTurnProjectionEvent');
    expect(eventClientSource).not.toContain('onCurrentTurn(listener');
    expect(eventClientSource).not.toContain('DESKTOP_RUNTIME_ON_CHANNELS.ROWS');
    expect(eventClientSource).not.toContain('function normalizeDisplayRowsProjectionEvent');
    expect(eventClientSource).not.toContain('export function normalizeDisplayRowsProjectionEvent');
    expect(eventClientSource).not.toContain('onDisplayRows');
    expect(displayProjectionSource).toContain('export const DesktopConversationDisplayProjection = Object.freeze');
    expect(displayProjectionSource).toContain('buildConversationViewTraceSummary');
    expect(displayProjectionSource).toContain('mergeRendererAnnotationsIntoSdkMessages');
    expect(displayProjectionSource).toContain('appendPendingBridgeUserMessages');
    expect(displayProjectionSource).toContain('pendingBridgeUserMessages');
    expect(displayProjectionSource).toContain('pendingTurnMatchesConversationView');
    expect(displayProjectionSource).toContain('viewPendingTurn');
    expect(displayProjectionSource).toContain('DesktopSdkDisplayChatMessageProjectionRuntime');
    expect(displayProjectionSource).toContain('DesktopConversationViewWorkspaceRuntime');
    expect(displayProjectionSource).toContain('const workspace = { conversationView: value }');
    expect(displayProjectionSource).toContain('hasWorkspaceConversationView(workspace)');
    expect(displayProjectionSource).toContain('function sdkConversationViewEnvelope');
    expect(displayProjectionSource).toContain('function displayRowsForConversationView(view: ConversationView)');
    expect(displayProjectionSource).toContain('const viewConversationRef = exactConversationRef(view.conversationRef);');
    expect(displayProjectionSource).toContain('exactConversationRef(row.conversationRef) === viewConversationRef');
    expect(displayProjectionSource).toContain('function exactTraceString(value: unknown)');
    expect(displayProjectionSource).toContain('liveTurnPhase: exactTraceString');
    expect(displayProjectionSource).toContain('sourceEventType: exactTraceString(latestMetadata?.sourceEventType)');
    expect(displayProjectionSource).toContain('textLength: resolveTraceTextLength(latestRecord.content)');
    expect(displayProjectionSource).toContain('const view = sdkConversationViewEnvelope(conversationView)');
    expect(displayProjectionSource).not.toContain('type ConversationViewTraceSource');
    expect(displayProjectionSource).not.toContain('displayRows?: unknown[] | null');
    expect(displayProjectionSource).not.toContain('exactTraceString(latestRecord.sender)');
    expect(displayProjectionSource).not.toContain('latestRecord.sourceEventType');
    expect(displayProjectionSource).not.toContain('latestRecord.content ?? latestRecord.text');
    expect(displayProjectionSource).not.toContain('function normalizeTraceString');
    expect(displayProjectionSource).not.toContain('value.trim() ? value.trim() : null');
    expect(displayProjectionSource).not.toContain('infrastructure/transcript/sdkDisplayChatMessageProjection');
    expect(displayProjectionSource).not.toContain('function isConversationView(value)');
    expect(displayProjectionSource).not.toContain('conversationView.displayRows');
    expect(sdkDisplayProjectionRuntimeSource).toContain('buildChatMessagesFromSdkDisplayRows');
    expect(sdkDisplayProjectionRuntimeSource).toContain('DesktopSdkDisplayChatMessageProjectionRuntime');
    await expect(fs.stat(legacySdkDisplayProjectionAdapterPath)).rejects.toThrow();
    expect(displayProjectionSource).not.toContain('isOptimisticUserMessage');
    expect(displayProjectionSource).not.toContain('pendingOptimisticUserMessages');
    expect(displayProjectionSource).not.toContain('renderer-compose');
    expect(displayProjectionSource).not.toContain('findPendingOptimisticUserMessage');
    expect(displayProjectionSource).not.toContain('currentMessage.id === pendingTurn?.userMessageId');
    expect(displayProjectionSource).not.toContain('rendererAnnotations.length > 0 ? rendererAnnotations : currentMessages');
    expect(displayProjectionSource).not.toContain('preserveRendererAnnotations');
    expect(displayProjectionSource).not.toContain('currentMessages');
    expect(displayProjectionSource).not.toContain('export function mergeRendererAnnotationsIntoSdkMessages');
    expect(displayProjectionSource).not.toContain('export {\n  buildChatMessagesFromSdkDisplayRows');
    expect(displayProjectionSource).not.toContain('buildDisplayProjectionTraceSummary,\n  buildChatMessagesFromSdkDisplayRows');
    expect(displayProjectionSource).not.toContain('buildDisplayProjectionTraceSummary,\n  mergeRendererAnnotationsIntoSdkMessages');
    expect(displayProjectionSource).not.toContain('features/chat');
    expect(projectionStreamRuntimeSource).toContain('DesktopConversationProjectionStreamRuntime');
    expect(projectionStreamRuntimeSource).toContain('applyCurrentTurnProjectionEvent');
    expect(projectionStreamRuntimeSource).not.toContain('applyDisplayRowsProjectionEvent');
    expect(projectionStreamRuntimeSource).not.toContain('buildDisplayRowsProjection');
    expect(projectionStreamRuntimeSource).not.toContain('shouldApplyMessages');
    expect(projectionStreamRuntimeSource).not.toContain('!workspace.conversationView');
    expect(projectionStreamRuntimeSource).not.toContain('if (!shouldApplyMessages)');
    expect(projectionStreamRuntimeSource).not.toContain('sdkMessages: []');
    expect(projectionStreamRuntimeSource).not.toContain('mergedMessages: []');
    expect(projectionStreamRuntimeSource).not.toContain('withoutSupersededRows');
    expect(projectionStreamRuntimeSource).not.toContain('supersededTurnRefs');
    expect(projectionStreamRuntimeSource).toContain('buildReplayProjectionTracePayload');
    expect(projectionStreamRuntimeSource).toContain('currentMatchesOldTurn');
    expect(projectionStreamRuntimeSource).toContain('turnRef.length > 0 && turnRef === turnRef.trim()');
    expect(projectionStreamRuntimeSource).not.toContain('turnRef.trim()\n    ? turnRef.trim()');
    expect(projectionStreamRuntimeSource).toContain('hasWorkspaceConversationView(workspace)');
    expect(projectionStreamRuntimeSource).toContain('ConversationView');
    expect(projectionStreamRuntimeSource).toContain('conversationView?: ConversationView | null');
    expect(projectionStreamRuntimeSource).not.toContain('type ConversationViewLike');
    expect(projectionStreamRuntimeSource).not.toContain('displayRows?: unknown[] | null');
    expect(projectionStreamRuntimeSource).not.toContain('function isConversationView');
    expect(projectionStreamRuntimeSource).toContain('buildConversationViewTraceSummary');
    expect(projectionStreamRuntimeSource).not.toContain('viewLiveTurn?.turnRef');
    expect(projectionStreamRuntimeSource).toContain('workspace.sdkLiveTurn?.turnRef');
    expect(projectionStreamRuntimeSource).not.toContain('workspace.currentTurnProjection');
    expect(projectionStreamRuntimeSource).not.toContain('workspace.conversationView.displayRows.length');
    expect(projectionStreamRuntimeSource).not.toContain('workspace.messageCount');
    expect(projectionStreamRuntimeSource).not.toContain('messages: ChatMessage[]');
    expect(projectionStreamRuntimeSource).not.toContain('workspace.messages');
    expect(projectionStreamRuntimeSource).toContain('streamPhase: hasConversationView ? currentTurnPhase : workspace.streamTracking?.phase ?? null');
    expect(projectionStreamRuntimeSource).toContain('DesktopConversationDisplayProjection');
    expect(projectionStreamRuntimeSource).not.toContain('features/chat');
    expect(replayRuntimeSource).not.toContain('buildReplayProjectionTracePayload');
    expect(replayRuntimeSource).not.toContain('getProjectedWorkspaceReadModel');
    expect(replayRuntimeSource).not.toContain('projectWorkspaceReadModelState');
    expect(replayRuntimeSource).not.toContain('.getState()');
    expect(replayRuntimeSource).not.toContain('Object.entries(tracePayload).filter');
    expect(replayRuntimeSource).not.toContain("key !== 'action' && key !== 'conversationRef'");
    expect(replayRuntimeSource).not.toContain('currentTurnProjection?.turnRef');
    expect(replayRuntimeSource).not.toContain('pendingTurn?.turnRef');
    expect(replayRuntimeSource).not.toContain('streamTracking?.activeTurnRef');
    expect(replayRuntimeSource).not.toContain('replayResult?.turnRef');
    expect(replayRuntimeSource).not.toContain('let replayResult');
  });

  test('dashboard conversation resume projects display rows through app runtime client', async () => {
    const dashboardShellSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/features/dashboard/components/DashboardShell.jsx'),
      'utf8',
    );
    const dashboardHookSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/features/dashboard/hooks/useDashboardConversations.js'),
      'utf8',
    );
    const displayProjectionSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopConversationDisplayProjection.ts'),
      'utf8',
    );
    const libraryClientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopConversationLibraryClient.js'),
      'utf8',
    );
    const dashboardLoadRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopDashboardConversationLoadRuntime.js'),
      'utf8',
    );

    expect(dashboardHookSource).not.toContain('infrastructure/transcript/sdkDisplayChatMessageProjection');
    expect(dashboardHookSource).not.toContain('desktopConversationDisplayProjection');
    expect(dashboardHookSource).not.toContain('DesktopConversationDisplayProjection');
    expect(dashboardHookSource).not.toContain('buildChatMessagesFromSdkDisplayRows');
    expect(dashboardHookSource).not.toContain('mergeRendererAnnotationsIntoSdkMessages');
    expect(dashboardHookSource).not.toContain('setChatMessages');
    expect(dashboardHookSource).not.toContain('hasCachedMessages');
    expect(dashboardHookSource).not.toContain('hasCachedConversationView');
    expect(dashboardHookSource).not.toContain('DesktopConversationViewWorkspaceRuntime');
    expect(dashboardHookSource).not.toContain('hasWorkspaceConversationView');
    expect(dashboardHookSource).toContain('applyDashboardConversationOpenWorkspaceReset');
    expect(dashboardHookSource).not.toContain('cachedWorkspace?.conversationView');
    expect(dashboardHookSource).not.toContain('getChatWorkspaceState');
    expect(dashboardHookSource).not.toContain('getWorkspaceState');
    expect(dashboardShellSource).not.toContain('getWorkspaceStateFromChatStore');
    expect(dashboardShellSource).not.toContain('getChatWorkspaceState:');
    expect(dashboardShellSource).not.toContain('(state) => state.getWorkspaceState');
    expect(dashboardLoadRuntimeSource).toContain('preserveConversationView: true');
    expect(dashboardLoadRuntimeSource).not.toContain('getWorkspaceState');
    expect(dashboardHookSource).toContain('DesktopConversationLibraryClient.loadConversationView');
    expect(dashboardHookSource).not.toContain('DesktopConversationLibraryClient.loadDisplayRows');
    expect(dashboardHookSource).toContain('setChatConversationView?.(conversationView, conversationRef)');
    expect(libraryClientSource).toContain('loadConversationView');
    expect(libraryClientSource).not.toContain('loadDisplayRows');
    expect(libraryClientSource).not.toContain('loadForDisplay');
    expect(libraryClientSource).toContain('function readExactIdentityString');
    expect(libraryClientSource).not.toContain('conversationRef: view.conversationRef || conversationRef');
    expect(libraryClientSource).not.toContain('function readSnapshotDisplayRows');
    expect(libraryClientSource).not.toContain('row?.conversationRef === normalizedConversationRef');
    expect(libraryClientSource).not.toContain('displayRows: readSnapshotDisplayRows');
    expect(displayProjectionSource).toContain('DesktopSdkDisplayChatMessageProjectionRuntime');
    expect(displayProjectionSource).not.toContain('infrastructure/transcript/sdkDisplayChatMessageProjection');
    expect(displayProjectionSource).toContain('export const DesktopConversationDisplayProjection = Object.freeze');
    expect(displayProjectionSource).toContain('mergeRendererAnnotationsIntoSdkMessages');
    expect(displayProjectionSource).not.toContain('export function mergeRendererAnnotationsIntoSdkMessages');
    expect(displayProjectionSource).not.toContain('buildDisplayProjectionTraceSummary');
    expect(displayProjectionSource).not.toContain('buildDisplayProjectionTraceSummary,\n  mergeRendererAnnotationsIntoSdkMessages');
    expect(displayProjectionSource).not.toContain('export {\n  buildChatMessagesFromSdkDisplayRows');
    expect(displayProjectionSource).not.toContain("sourceEventType === 'renderer-compose'");
    expect(displayProjectionSource).not.toContain("sourceChannel === 'renderer-local'");
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
    const markdownMessageRuntimeSource = await fs.readFile(files[0], 'utf8');
    const threadFindRuntimeSource = await fs.readFile(files[1], 'utf8');
    const markdownMessageSource = await fs.readFile(files[2], 'utf8');

    for (const file of files) {
      const source = await fs.readFile(file, 'utf8');
      expect(source).not.toContain('infrastructure/markdown');
      expect(source).not.toContain('infrastructure/llmOutputContract');
      expect(source).toContain('desktopMarkdownRuntimeClient');
    }
    expect(chatInterfaceSource).toContain('desktopThreadFindRuntime');
    expect(chatInterfaceSource).toContain('DesktopThreadFindRuntime');
    expect(chatInterfaceSource).not.toContain('utils/message/threadFindState');
    expect(markdownMessageRuntimeSource).toContain('export const DesktopMarkdownMessageRuntime = Object.freeze');
    expect(markdownMessageRuntimeSource).not.toContain('export function buildMarkdownRenderModel');
    expect(threadFindRuntimeSource).toContain('DesktopMarkdownMessageRuntime');
    expect(threadFindRuntimeSource).toContain('DesktopThreadFindRuntime');
    expect(threadFindRuntimeSource).toContain('message?.toolCallDisplayText');
    expect(threadFindRuntimeSource).not.toContain('modelFacingToolCall');
    expect(threadFindRuntimeSource).not.toContain('modelFacingToolOutput');
    expect(threadFindRuntimeSource).not.toContain('export function buildThreadFindState');
    expect(markdownMessageSource).toContain('DesktopMarkdownMessageRuntime');
    expect(threadFindRuntimeSource).not.toContain('import { buildMarkdownRenderModel }');
    expect(markdownMessageSource).not.toContain('import { buildMarkdownRenderModel }');
    expect(markdownClientSource).toContain('infrastructure/markdown');
    expect(markdownClientSource).toContain('infrastructure/llmOutputContract');
    expect(markdownClientSource).toContain('export const DesktopMarkdownRuntimeClient = Object.freeze');
    expect(markdownClientSource).not.toContain('export {');
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
    const toolCallMessageSource = await fs.readFile(
      path.join(chatRoot, 'components/message/content/ToolCallMessage.jsx'),
      'utf8',
    );
    const toolCallMessageStateSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/infrastructure/transcript/toolCallMessageState.js'),
      'utf8',
    );

    expect(sourceBadgeSource).toContain('DesktopMessageSourceTagRuntime.resolveMessageSourceBadgePresentation');
    expect(sourceBadgeSource).toContain('desktopMessageSourceTagRuntime');
    expect(sourceBadgeSource).not.toContain('desktopMessageTokenUsageRuntime');
    expect(sourceBadgeSource).not.toContain('sourceEventType');
    expect(sourceBadgeSource).not.toContain('sourceChannel');
    expect(thinkingDisplaySource).toContain('DesktopMessageSourceTagRuntime.resolveThinkingSourceBadgePresentation');
    expect(thinkingDisplaySource).toContain('desktopMessageSourceTagRuntime');
    expect(thinkingDisplaySource).not.toContain('desktopPresentationSourceChannels');
    expect(thinkingDisplaySource).not.toContain('resolveSourceTag');
    expect(thinkingDisplaySource).not.toContain('source_event=');
    expect(sourceBadgeSource).not.toContain('utils/message/sourceTags');
    expect(sourceBadgeSource).not.toContain('utils/message/messageTokenUsage');
    expect(thinkingDisplaySource).not.toContain('utils/message/sourceTags');
    expect(sourceTagRuntimeSource).toContain('desktopPresentationSourceChannels');
    expect(sourceTagRuntimeSource).toContain('desktopMessageTokenUsageRuntime');
    expect(sourceTagRuntimeSource).toContain('DesktopMessageTokenUsageRuntime.resolveMessageTokenUsageTag');
    expect(sourceTagRuntimeSource).toContain('DesktopMessageSourceTagRuntime');
    expect(sourceTagRuntimeSource).toContain('resolveMessageSourceBadgePresentation');
    expect(sourceTagRuntimeSource).toContain('resolveThinkingSourceBadgePresentation');
    expect(sourceTagRuntimeSource).not.toContain('export function resolveSourceTag');
    expect(sourceTagRuntimeSource).not.toContain('export function resolveMessageSourceBadgePresentation');
    expect(sourceTagRuntimeSource).not.toContain('export function resolveThinkingSourceBadgePresentation');
    expect(sourceTagRuntimeSource).not.toContain('features/chat');
    const messageShapeSource = await fs.readFile(
      path.join(chatRoot, 'components/message/messageShapePropType.js'),
      'utf8',
    );
    const messageContentSource = await fs.readFile(
      path.join(chatRoot, 'components/MessageContent.jsx'),
      'utf8',
    );
    const attachmentRendererRegistrySource = await fs.readFile(
      path.join(chatRoot, 'components/message/content/AttachmentRendererRegistry.jsx'),
      'utf8',
    );
    const chatBoxResponseTestUtilsSource = await fs.readFile(
      path.resolve(__dirname, './ChatBoxResponse.testUtils.jsx'),
      'utf8',
    );
    const messageTypeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatMessageTypes.ts'),
      'utf8',
    );
    expect(messageShapeSource).not.toContain('screenshotRef: PropTypes');
    expect(messageShapeSource).not.toContain('screenshotUrl: PropTypes');
    expect(messageShapeSource).not.toContain('screenshot: PropTypes');
    expect(messageContentSource).not.toContain('screenshotUrl: PropTypes');
    expect(messageContentSource).not.toContain('screenshotContentType: PropTypes');
    expect(messageContentSource).not.toContain('screenshot: PropTypes');
    expect(messageContentSource).not.toContain('modelFacingToolCall: PropTypes');
    expect(messageContentSource).not.toContain('modelFacingToolOutput: PropTypes');
    expect(messageContentSource).not.toContain('toolMetadata: PropTypes');
    expect(messageContentSource).not.toContain('toolName: PropTypes');
    expect(messageContentSource).not.toContain('executionTime: PropTypes');
    expect(messageContentSource).not.toContain('success: PropTypes');
    expect(toolCallMessageSource).toContain('message.toolCallDisplayText');
    expect(toolCallMessageSource).not.toContain('message.modelFacingToolCall');
    expect(toolCallMessageSource).not.toContain('modelFacingToolCall: PropTypes');
    expect(toolCallMessageStateSource).toContain('toolCallDisplayText: text');
    expect(toolCallMessageStateSource).not.toContain('modelFacingToolCall');
    expect(attachmentRendererRegistrySource).not.toContain('screenshotRef: PropTypes');
    expect(attachmentRendererRegistrySource).not.toContain('screenshotUrl: PropTypes');
    expect(attachmentRendererRegistrySource).not.toContain('function isExactNonEmptyString');
    expect(chatBoxResponseTestUtilsSource).not.toContain('screenshotRef: message.screenshotRef');
    expect(chatBoxResponseTestUtilsSource).not.toContain('screenshotUrl: message.screenshotUrl');
    expect(chatBoxResponseTestUtilsSource).not.toContain('screenshot: message.screenshot');
    expect(chatBoxResponseTestUtilsSource).not.toContain('screenshotContentType: message.screenshotContentType');
    expect(messageTypeSource).toContain('attachments?: SdkDisplayAttachment[] | null');
    expect(messageTypeSource).not.toContain('modelFacingToolCall?:');
    expect(messageTypeSource).not.toContain('modelFacingToolOutput?:');
    expect(messageTypeSource).not.toContain('toolMetadata?:');
    expect(messageTypeSource).not.toContain('toolName?:');
    expect(messageTypeSource).not.toContain('executionTime?:');
    expect(messageTypeSource).not.toContain('success?:');
    expect(messageTypeSource).not.toContain('attachmentFilenames?:');
    expect(messageTypeSource).not.toContain('screenshot?:');
    expect(messageTypeSource).not.toContain('screenshotRef?:');
    expect(messageTypeSource).not.toContain('screenshotUrl?:');
    expect(messageTypeSource).not.toContain('screenshotContentType?:');
    expect(messageTypeSource).not.toContain('screenshots?:');
    expect(tokenUsageRuntimeSource).toContain('tokens(provider)');
    expect(tokenUsageRuntimeSource).not.toContain('message?.attachments');
    expect(tokenUsageRuntimeSource).not.toContain("attachment.status === 'materializing'");
    expect(tokenUsageRuntimeSource).not.toContain("attachment.status === 'ready'");
    expect(tokenUsageRuntimeSource).not.toContain('countDisplayImageAttachments');
    expect(tokenUsageRuntimeSource).not.toContain('message?.screenshots');
    expect(tokenUsageRuntimeSource).not.toContain('countLegacyScreenshotAttachments');
    expect(tokenUsageRuntimeSource).not.toContain('screenshotRef');
    expect(tokenUsageRuntimeSource).not.toContain('screenshotUrl');
    expect(tokenUsageRuntimeSource).not.toContain('message?.screenshotRef');
    expect(tokenUsageRuntimeSource).not.toContain('message?.screenshotUrl');
    expect(tokenUsageRuntimeSource).not.toContain("attachment.kind === 'image'");
    expect(tokenUsageRuntimeSource).not.toContain('DesktopSdkDisplayAttachmentProjection');
    expect(tokenUsageRuntimeSource).not.toContain('readSdkDisplayAttachments');
    expect(tokenUsageRuntimeSource).not.toContain('screenshot: message?.screenshot');
    expect(tokenUsageRuntimeSource).not.toContain('modelFacingToolCall');
    expect(tokenUsageRuntimeSource).not.toContain('modelFacingToolOutput');
    expect(tokenUsageRuntimeSource).toContain('DesktopMessageTokenUsageRuntime');
    expect(tokenUsageRuntimeSource).not.toContain('export function resolveMessageTokenUsageTag');
    expect(tokenUsageRuntimeSource).not.toContain('features/chat');
    await expect(fs.stat(
      path.join(chatRoot, 'utils/message/sourceTags.js'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.join(chatRoot, 'utils/message/messageTokenUsage.js'),
    )).rejects.toThrow();
  });

  test('message row classes, content kinds, and attachment descriptors stay behind app runtime facades', async () => {
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
    const contentRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopMessageContentRuntime.js'),
      'utf8',
    );
    expect(messageItemSource).toContain('desktopMessageClassRuntime');
    expect(messageItemSource).toContain('DesktopMessageClassRuntime.buildMessageClassName');
    expect(messageItemSource).not.toContain('utils/message/messageListClasses');
    expect(messageContentSource).toContain('desktopMessageContentRuntime');
    expect(messageContentSource).toContain('DesktopMessageContentRuntime.resolveMessageContentPresentation');
    expect(messageContentSource).not.toContain('MESSAGE_CONTENT_RENDER_KIND');
    expect(messageContentSource).not.toContain("message.type === 'error'");
    expect(messageContentSource).not.toContain("message.type === 'tool-output'");
    expect(messageContentSource).not.toContain("message.type === 'tool-call'");
    expect(messageContentSource).not.toContain("message.type === 'tool-explanation'");
    expect(messageContentSource).not.toContain("message.type === 'search-source'");
    expect(messageContentSource).not.toContain("message.type === 'tool-actions-summary'");
    expect(messageContentSource).not.toContain("message.type === 'llm-text'");
    expect(messageContentSource).not.toContain('utils/message/messageScreenshots');
    expect(classRuntimeSource).toContain('DesktopMessageClassRuntime');
    expect(classRuntimeSource).toContain('hasVisualAttachment');
    expect(classRuntimeSource).not.toContain('DesktopMessageAttachmentPresentationRuntime');
    expect(classRuntimeSource).toContain('DesktopSdkDisplayAttachmentProjection');
    expect(classRuntimeSource).toContain('readSdkDisplayAttachments');
    expect(classRuntimeSource).not.toContain('hasVisibleSdkDisplayAttachments');
    expect(classRuntimeSource).not.toContain('message.attachments.length');
    expect(classRuntimeSource).toContain('message-has-attachment');
    expect(classRuntimeSource).not.toContain('message-has-screenshot');
    expect(classRuntimeSource).not.toContain('hasReadyDisplayImageAttachment');
    expect(classRuntimeSource).not.toContain('screenshotRef');
    expect(classRuntimeSource).not.toContain('screenshotUrl');
    expect(classRuntimeSource).not.toContain('message.screenshot');
    expect(classRuntimeSource).not.toContain('export function buildMessageClassName');
    expect(classRuntimeSource).not.toContain('features/chat');
    expect(contentRuntimeSource).toContain('DesktopMessageContentRuntime');
    expect(contentRuntimeSource).toContain('isUserMessageContentPresentation');
    expect(contentRuntimeSource).not.toContain('DesktopMessageAttachmentPresentationRuntime');
    expect(contentRuntimeSource).not.toContain('DesktopSdkDisplayAttachmentProjection');
    expect(contentRuntimeSource).not.toContain('readSdkDisplayAttachments');
    expect(contentRuntimeSource).not.toContain('hasVisibleSdkDisplayAttachments');
    expect(contentRuntimeSource).not.toContain('user-with-attachments');
    expect(contentRuntimeSource).toContain('isErrorMessageContentPresentation');
    expect(contentRuntimeSource).not.toContain('export function resolveMessageContentPresentation');
    expect(contentRuntimeSource).not.toContain('export function isErrorMessageContentPresentation');
    expect(contentRuntimeSource).not.toContain('export function isToolOutputMessageContentPresentation');
    expect(contentRuntimeSource).not.toContain('export function isAssistantResponseMessageContentPresentation');
    expect(contentRuntimeSource).not.toContain('export const MESSAGE_CONTENT_RENDER_KIND');
    expect(contentRuntimeSource).not.toContain('features/chat');
    expect(messageContentSource).toContain('isUserMessageContentPresentation');
    expect(messageContentSource).not.toContain('isUserAttachmentMessageContentPresentation');
    await expect(fs.stat(
      path.join(chatRoot, 'utils/message/messageListClasses.js'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.join(chatRoot, 'utils/message/messageScreenshots.js'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopMessageScreenshotRuntime.js'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopMessageAttachmentPresentationRuntime.js'),
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
      expect(source).toContain('DesktopMessageListRuntime');
      expect(source).not.toContain('utils/message/messageListState');
    }
    expect(messageListRuntimeSource).toContain('DesktopMessageListRuntime');
    expect(messageListRuntimeSource).toContain('resolveCompactionStatusText');
    expect(messageListRuntimeSource).toContain('scheduleActiveFindMatchScroll');
    expect(messageListRuntimeSource).toContain('scheduleMessageListScrollToBottom');
    expect(messageListRuntimeSource).toContain('clearScheduledMessageListScroll');
    expect(messageListRuntimeSource).toContain('observeMessageListResize');
    expect(messageListRuntimeSource).toContain('shouldAutoScrollForAgentLoopMessageUpdate');
    expect(messageListRuntimeSource).toContain('shouldAutoScrollForThinkingTextUpdate');
    expect(messageListRuntimeSource).not.toContain('export function isNearBottom');
    expect(messageListRuntimeSource).not.toContain('export function scrollToConversationSwitchTarget');
    expect(messageListRuntimeSource).not.toContain('export function shouldForceScrollForNewUserMessage');
    expect(messageListRuntimeSource).not.toContain('export function shouldAutoScrollForAgentLoopMessageUpdate');
    expect(messageListRuntimeSource).not.toContain('export function shouldAutoScrollForThinkingTextUpdate');
    expect(messageListRuntimeSource).not.toContain('export function shouldRenderAssistantActions');
    expect(messageListRuntimeSource).not.toContain('export function shouldRenderUserActions');
    expect(messageListRuntimeSource).not.toContain('export function resolveCompactionStatusText');
    expect(autoScrollSource).not.toContain("nextLastMessage.type === 'llm-text'");
    expect(messageListSource).toContain('DesktopMessageListRuntime.scheduleActiveFindMatchScroll');
    expect(messageListSource).not.toContain('window.requestAnimationFrame');
    expect(messageListSource).not.toContain('window.cancelAnimationFrame');
    expect(autoScrollSource).toContain('DesktopMessageListRuntime.scheduleMessageListScrollToBottom');
    expect(autoScrollSource).toContain('DesktopMessageListRuntime.clearScheduledMessageListScroll');
    expect(autoScrollSource).toContain('DesktopMessageListRuntime.observeMessageListResize');
    expect(autoScrollSource).not.toContain('window.requestAnimationFrame');
    expect(autoScrollSource).not.toContain('window.cancelAnimationFrame');
    expect(autoScrollSource).not.toContain('new ResizeObserver');
    expect(autoScrollSource).not.toContain('typeof ResizeObserver');
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
      expect(source).toContain('export const DesktopChatStreamMessageUpdateRuntime = Object.freeze');
      expect(source).not.toContain('export function buildToolSchemasUpdate');
      expect(source).not.toContain('export function findLastMessageIdBySender');
      expect(source).not.toContain('export function findLastAssistantLlmTextMessageId');
      expect(source).not.toContain('export function findFirstMessageIdBySender');
      expect(source).not.toContain('function findLastMessageIdBySender');
      expect(source).not.toContain('function findLastAssistantLlmTextMessageId');
      expect(source).not.toContain('function findFirstMessageIdBySender');
      expect(source).not.toContain('export function buildSystemPromptUpdate');
      expect(source).not.toContain('export function buildUserMessageFullUpdate');
      expect(source).not.toContain('export function buildAssistantMessageFullUpdate');
      expect(source).not.toContain('features/chat');
    }
    expect(chatMessageClientSource).toContain('infrastructure/transcript/toolCallMessageState');
    expect(chatMessageClientSource).toContain('infrastructure/transcript/toolCallChatMessageState');
    expect(chatMessageClientSource).not.toContain('infrastructure/transcript/toolOutputChatMessageState');
    expect(chatMessageClientSource).not.toContain('buildToolOutputChatMessageState');
    expect(chatMessageClientSource).toContain('infrastructure/transcript/toolSchemaShape');
    expect(chatMessageClientSource).toContain('infrastructure/text/incomingTextNormalization');
    expect(chatMessageClientSource).toContain('export const DesktopChatMessageRuntimeClient = Object.freeze');
    expect(chatMessageClientSource).not.toContain('export {');
    expect(currentTurnMessageSource).not.toContain('desktopChatMessageRuntimeClient');
    expect(currentTurnMessageSource).not.toContain('modelFacingToolCall: toolCallState');
    expect(currentTurnMessageSource).not.toContain('modelFacingToolCall');
    expect(currentTurnMessageSource).not.toContain('DesktopChatMessageRuntimeClient');
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
    const transparencySectionSource = await fs.readFile(
      path.join(chatRoot, 'components/message/TransparencySection.jsx'),
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
      expect(source).toContain('DesktopMessageTransparencyRuntime');
      expect(source).not.toContain('utils/message/messageTransparency');
    }
    expect(transparencySectionSource).toContain('desktopMessageTransparencyRuntime');
    expect(transparencySectionSource).toContain('DesktopMessageTransparencyRuntime');
    expect(transparencySectionSource).toContain(
      'DesktopMessageTransparencyRuntime.resolveTransparencySectionContentPresentation',
    );
    expect(transparencySectionSource).toContain(
      'DesktopMessageTransparencyRuntime.serializeTransparencySectionContent',
    );
    expect(transparencySectionSource).not.toContain("type === 'json'");
    expect(transparencySectionSource).not.toContain("type === 'system-prompt'");
    expect(transparencySectionSource).not.toContain("type === 'xml'");
    expect(transparencyRuntimeSource).toContain('desktopChatMessageRuntimeClient');
    expect(transparencyRuntimeSource).toContain('DesktopChatMessageRuntimeClient');
    expect(transparencyRuntimeSource).toContain('normalizeToolSchemaList');
    expect(transparencyRuntimeSource).toContain('DesktopMessageTransparencyRuntime');
    expect(transparencyRuntimeSource).toContain('resolveTransparencySectionContentPresentation');
    expect(transparencyRuntimeSource).not.toContain('export function resolveConversationToolSchemas');
    expect(transparencyRuntimeSource).not.toContain('export function buildTransparencySectionConfigs');
    expect(transparencyRuntimeSource).not.toContain('export function serializeTransparencySectionContent');
    expect(transparencyRuntimeSource).not.toContain('export function resolveTransparencySectionContentPresentation');
    expect(transparencyRuntimeSource).not.toContain('features/chat');
    await expect(fs.stat(
      path.join(chatRoot, 'utils/message/messageTransparency.js'),
    )).rejects.toThrow();
  });

  test('chat feature clipboard writes route through app runtime facade', async () => {
    const files = await listSourceFiles(chatRoot);
    const offenders: string[] = [];
    const copyHookSource = await fs.readFile(
      path.join(chatRoot, 'hooks/useCopyMessageAction.js'),
      'utf8',
    );
    const assistantActionsSource = await fs.readFile(
      path.join(chatRoot, 'components/message/AssistantMessageActions.jsx'),
      'utf8',
    );
    const transparencySectionSource = await fs.readFile(
      path.join(chatRoot, 'components/message/TransparencySection.jsx'),
      'utf8',
    );
    const clipboardRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopClipboardRuntime.js'),
      'utf8',
    );
    const messageActionRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopMessageActionRuntime.js'),
      'utf8',
    );

    for (const file of files) {
      const relativePath = path.relative(chatRoot, file);
      const source = await fs.readFile(file, 'utf8');
      if (source.includes('navigator.clipboard')) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
    expect(copyHookSource).toContain('DesktopClipboardRuntime.writeText');
    expect(copyHookSource).toContain('DesktopMessageActionRuntime.scheduleMessageActionTimer');
    expect(copyHookSource).toContain('DesktopMessageActionRuntime.clearMessageActionTimer');
    expect(copyHookSource).not.toContain('window.setTimeout');
    expect(copyHookSource).not.toContain('window.clearTimeout');
    expect(assistantActionsSource).toContain('DesktopMessageActionRuntime.scheduleMessageActionTimer');
    expect(assistantActionsSource).toContain('DesktopMessageActionRuntime.clearMessageActionTimer');
    expect(assistantActionsSource).not.toContain('window.setTimeout');
    expect(assistantActionsSource).not.toContain('window.clearTimeout');
    expect(transparencySectionSource).toContain('DesktopClipboardRuntime.writeText');
    expect(clipboardRuntimeSource).toContain('navigator?.clipboard');
    expect(clipboardRuntimeSource).not.toContain('features/chat');
    expect(messageActionRuntimeSource).toContain('setTimeout');
    expect(messageActionRuntimeSource).toContain('clearTimeout');
    expect(messageActionRuntimeSource).not.toContain('features/chat');
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
    expect(hookClientSource).toContain('export const DesktopRendererHooksRuntimeClient = Object.freeze');
    expect(hookClientSource).not.toContain('export {');
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
    const streamSource = await fs.readFile(
      path.join(chatRoot, 'hooks/useChatStream.ts'),
      'utf8',
    );
    const runtimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatStreamEventRuntime.ts'),
      'utf8',
    );

    expect(source).toContain('resolveTurnCompletedStreamEventState');
    expect(source).toContain('type ChatStreamWorkspaceReadModel');
    expect(runtimeSource).toContain('viewLiveTurnRef?: string | null');
    expect(runtimeSource).toContain('normalizeTurnRef(workspace?.viewLiveTurnRef)');
    expect(runtimeSource).toContain('normalizeTurnRef(workspace.viewLiveTurnRef)');
    expect(runtimeSource).not.toContain('conversationView?: {');
    expect(runtimeSource).not.toContain('resolveWorkspaceViewLiveTurnRef');
    expect(source).toContain('getChatStreamWorkspaceReadModel: (conversationRef?: string | null) => ChatStreamWorkspaceReadModel');
    expect(source).not.toContain('ChatWorkspaceReadModelState');
    expect(source).not.toContain('stores/chatStoreAdapters');
    expect(source).not.toContain('getWorkspaceStateFromChatStore');
    expect(streamSource).toContain('getChatStreamWorkspaceReadModel: getChatStreamWorkspaceReadModelFromChatStore');
    expect(streamSource).not.toContain('getProjectedWorkspaceReadModelFromChatStore');
    expect(streamSource).not.toContain('getWorkspaceStateFromChatStore');
    expect(source).not.toContain('isTurnCompletedConversationStreamEvent');
    expect(source).not.toContain('shouldRecordTerminalCompletionTracking');
    expect(source).not.toContain("event.type !== 'turn_completed'");
    expect(source).not.toContain('payload.rawEvent');
    expect(source).not.toContain('payload.sourceEvent');
    expect(source).not.toContain('rawConversationRef');
    expect(source).not.toContain('rawUserId');
    expect(source).not.toContain('resolveConversationStreamEventConversationRef');
    expect(source).not.toContain('event.conversationRef');
    expect(source).not.toContain('event.turnRef');
    expect(source).not.toContain('payload?.userId');
    expect(source).not.toContain('recordAssistantTranscriptMessage');
    expect(source).not.toContain('const workspace =');
    expect(source).not.toContain('workspace.isSending');
    expect(runtimeSource).toContain('resolveTurnCompletedStreamEventState');
    expect(runtimeSource).toContain('shouldRecordTerminalCompletionTracking');
    expect(runtimeSource).not.toContain('export function shouldRecordTerminalCompletionTracking');
  });

  test('chat stream terminal telemetry does not own live response phase', async () => {
    const source = await fs.readFile(
      path.join(chatRoot, 'hooks/chatStream/useChatStreamTerminalHandlers.ts'),
      'utf8',
    );
    const streamUpdaterSource = await fs.readFile(
      path.join(chatRoot, 'hooks/chatStream/useStreamMessageUpdaters.ts'),
      'utf8',
    );

    expect(source).not.toContain("recordTrackingEvent('streaming-complete'");
    expect(source).not.toContain('setIsSending(');
    expect(source).not.toContain('setThinkingStatus(');
    expect(source).not.toContain('setThinkingSourceEventType(');
    expect(source).not.toContain('rawEvent');
    expect(source).not.toContain('getWorkspaceState');
    expect(source).not.toContain('findLastAssistantLlmTextMessageId');
    expect(source).toContain('updateStreamTargetMessage');
    expect(source).toContain('buildLastAssistantLlmTextStreamTarget');
    expect(source).not.toContain("kind: 'last_assistant_llm_text'");
    expect(streamUpdaterSource).not.toContain('useChatStore');
    expect(streamUpdaterSource).not.toContain('getWorkspaceState');
    expect(streamUpdaterSource).not.toContain('findLastMessageIdBySender');
    expect(streamUpdaterSource).toContain('buildLastBySenderStreamTarget');
    expect(streamUpdaterSource).toContain('buildLastAssistantLlmTextStreamTarget');
    expect(streamUpdaterSource).not.toContain("kind: 'last_by_sender'");
    expect(streamUpdaterSource).not.toContain("kind: 'last_assistant_llm_text'");
    expect(streamUpdaterSource).toContain('updateStreamTargetMessage');
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
    const runtimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatStreamEventRuntime.ts'),
      'utf8',
    );

    expect(streamSource).not.toContain("if (event.type === 'local-user-message')");
    expect(streamSource).not.toContain("event.type !== 'user_message'");
    expect(runtimeSource).toContain("'user_message'");
    expect(handlerSource).not.toContain('LocalUserMessageEvent');
    expect(handlerSource).toContain('isLocalUserMessageConversationStreamEvent');
    expect(handlerSource).not.toContain("event.type !== 'user_message'");
    expect(handlerSource).not.toContain('event.payload?.text');
    expect(handlerSource).not.toContain('event.payload?.content');
    expect(handlerSource).not.toContain('event.payload');
    expect(handlerSource).not.toContain('function readString');
    expect(handlerSource).toContain('DesktopChatStreamEventPayloadRuntime');
    expect(handlerSource).toContain('resolveConversationStreamEventPayload');
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
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopSdkLiveTurnEffectsRuntime.ts'),
      'utf8',
    );

    expect(streamSource).not.toContain("event.type !== 'tool_progress'");
    expect(streamSource).not.toContain("event.type === 'tool_progress'");
    expect(projectionSource).toContain('applyCurrentTurnProjectionEvent');
    expect(projectionSource).not.toContain('DesktopSdkLiveTurnEffectsRuntime');
    expect(projectionSource).not.toContain('applySdkLiveTurnSideEffects');
    expect(projectionSideEffectsSource).toContain('export const DesktopSdkLiveTurnEffectsRuntime = Object.freeze');
    expect(projectionSideEffectsSource).toContain("entry.type === 'tool-progress'");
    expect(projectionSideEffectsSource).not.toContain("toolEvent.kind === 'tool_progress'");
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
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopSdkLiveTurnEffectsRuntime.ts'),
      'utf8',
    );
    const streamEventRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatStreamEventRuntime.ts'),
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
    expect(source).toContain('isToolDisplayOnlyConversationStreamEvent');
    expect(source).not.toContain("event.type === 'tool_call'");
    expect(source).not.toContain("event.type === 'tool_output'");
    expect(source).not.toContain("event.type === 'tool_bundle_call'");
    expect(source).not.toContain("event.type === 'tool_bundle_output'");
    expect(streamEventRuntimeSource).toContain('isToolDisplayOnlyConversationStreamEvent');
    expect(streamEventRuntimeSource).toContain("'tool_call'");
    expect(streamEventRuntimeSource).toContain("'tool_output'");
    expect(streamEventRuntimeSource).toContain("'tool_bundle_call'");
    expect(streamEventRuntimeSource).toContain("'tool_bundle_output'");
    expect(projectionSideEffectsSource).toContain("entry.type === 'tool-call'");
    expect(projectionSideEffectsSource).toContain("entry.type === 'tool-output'");
    expect(projectionSideEffectsSource).not.toContain("toolEvent.kind === 'tool_call'");
    expect(projectionSideEffectsSource).not.toContain("toolEvent.kind === 'tool_output'");
  });

  test('conversation replay dispatches intent through SDK revision commands', async () => {
    const source = await fs.readFile(
      path.join(chatRoot, 'hooks/useConversationReplayActions.js'),
      'utf8',
    );
    const chatInterfaceSource = await fs.readFile(
      path.join(chatRoot, 'components/ChatInterface.jsx'),
      'utf8',
    );
    const normalizedChatInterfaceSource = chatInterfaceSource.replace(/\r\n/g, '\n');
    const replayRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopConversationReplayRuntime.js'),
      'utf8',
    );
    const replayRuntimeTestSource = await fs.readFile(
      path.resolve(__dirname, '../../tests/frontend/DesktopConversationReplayRuntime.test.js'),
      'utf8',
    );
    const chatStoreAdaptersSource = await fs.readFile(
      path.join(chatRoot, 'stores/chatStoreAdapters.ts'),
      'utf8',
    );
    const chatInterfacePresentationRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatInterfacePresentationRuntime.js'),
      'utf8',
    );
    const continuityServiceSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopConversationContinuityService.ts'),
      'utf8',
    );
    const ipcSdkCommandHandlerSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc/ipc_agent_sdk_command_handlers.cjs'),
      'utf8',
    );
    const directWakeUpAgentAdapterSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc/ipc_direct_wake_up_agent_adapter.cjs'),
      'utf8',
    );
    const sdkConversationRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../packages/windie-sdk-js/src/runtime/ConversationRuntime.ts'),
      'utf8',
    );
    const sdkReplayCommandSource = sdkConversationRuntimeSource.slice(
      sdkConversationRuntimeSource.indexOf('  async editAndResend(input: EditAndResendInput)'),
      sdkConversationRuntimeSource.indexOf('  private shouldStopSupersededTurn'),
    );
    const cjsConversationRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../packages/windie-sdk-js/cjs/runtime/ConversationRuntime.js'),
      'utf8',
    );
    const cjsReplayCommandSource = cjsConversationRuntimeSource.slice(
      cjsConversationRuntimeSource.indexOf('    async editAndResend(input)'),
      cjsConversationRuntimeSource.indexOf('    shouldStopSupersededTurn'),
    );
    const transcriptRuntimeDocSource = await fs.readFile(
      path.resolve(__dirname, '../../docs/frontend/renderer/transcript_session_and_rehydrate_reference.md'),
      'utf8',
    );

    expect(source).not.toContain('DesktopConversationStoreAdapter');
    expect(source).toContain('desktopConversationReplayRuntime');
    expect(source).toContain('DesktopConversationReplayRuntime');
    expect(source).not.toContain('DesktopChatSendPreparationRuntime');
    expect(source).not.toContain("} from '../stores/chatStoreAdapters';");
    expect(source).not.toContain('getActiveConversationRefFromChatStore');
    expect(source).not.toContain('getProjectedWorkspaceReadModelFromChatStore');
    expect(source).not.toContain('replayUiContext');
    expect(source).not.toContain('useChatStore');
    expect(source).not.toContain('chatStore:');
    expect(source).not.toContain('useChatStore((state)');
    expect(source).not.toContain('buildDeferredQueryModelSelection');
    expect(source).not.toContain('utils/conversationReplayToolMessages');
    expect(source).not.toContain('DesktopConversationContinuityService.loadDisplayTimeline');
    expect(source).not.toContain('DesktopConversationContinuityService.editAndResend');
    expect(source).not.toContain('DesktopConversationContinuityService.retryTurn');
    expect(source).not.toContain('DesktopConversationContinuityService.replaceRows');
    expect(source).not.toContain('DesktopConversationContinuityService.prepareEditAndResend');
    expect(source).not.toContain('DesktopConversationContinuityService.prepareRetryTurn');
    expect(source).not.toContain('dispatchPreparedDesktopChatTurn');
    expect(source).not.toContain('editUserMessageReplayFromChatStore');
    expect(source).not.toContain('retryAssistantMessageReplayFromChatStore');
    expect(source).toContain('executeReplayAction');
    expect(source).toContain("action: 'edit_resend'");
    expect(source).toContain("action: 'retry'");
    expect(source).not.toContain('conversationView');
    expect(source).not.toContain('useChatStore((state)');
    expect(source).not.toContain('state.activeConversationRef');
    expect(source).not.toContain('state.addMessage');
    expect(source).not.toContain('executeReplayIntent');
    expect(source).not.toContain('buildReplayPendingPublication');
    expect(source).not.toContain('buildReplayPendingTurn');
    expect(source).not.toContain('buildPreparedReplayDesktopChatTurn');
    expect(source).not.toContain('DesktopPendingTurnRuntimeClient.setPending');
    expect(source).not.toContain('prepareReplayEditIntent');
    expect(source).not.toContain('prepareReplayRetryIntent');
    expect(source).not.toContain('executeReplayActionFromChatStore');
    expect(source).not.toContain('desktopRendererConfigRuntimeClient');
    expect(source).not.toContain('DesktopRendererConfigRuntimeClient');
    expect(source).not.toContain('config,');
    expect(source).not.toContain('config:');
    expect(replayRuntimeSource).not.toContain('readDeferredQueryModelSelection');
    expect(replayRuntimeSource).not.toContain('DesktopRendererConfigRuntimeClient');
    expect(replayRuntimeSource).not.toContain('config,');
    expect(replayRuntimeSource).not.toContain('config = null');
    expect(chatStoreAdaptersSource).not.toContain('editUserMessageReplayFromChatStore');
    expect(chatStoreAdaptersSource).not.toContain('retryAssistantMessageReplayFromChatStore');
    expect(chatStoreAdaptersSource).not.toContain('export function executeReplayActionFromChatStore');
    expect(chatStoreAdaptersSource).not.toContain('DesktopConversationReplayRuntime');
    expect(source).not.toContain('findReplayEditableUserMessageIndex');
    expect(source).not.toContain('resolveReplayRetryMessageIndexes');
    expect(source).not.toContain('buildReplayContextMessages');
    expect(source).not.toContain("message.sender === 'user'");
    expect(source).not.toContain("message.sender === 'assistant'");
    expect(source).not.toContain("messages[index]?.sender === 'user'");
    expect(source).not.toContain('buildReplayAttachmentPayload');
    expect(source).not.toContain('findTimelineRowIndex');
    expect(source).not.toContain('findTimelineRetryUserIndex');
    expect(source).not.toContain('display_timeline_loaded');
    expect(source).not.toContain('recordTranscriptUserMessage');
    expect(source).not.toContain('DesktopLiveTurnRuntimeClient.sendQuery');
    expect(source).not.toContain('DesktopLiveTurnRuntimeClient.editAndResend');
    expect(source).not.toContain('DesktopLiveTurnRuntimeClient.retryTurn');
    expect(source).not.toContain('replayFallbackMessages = []');
    expect(source).not.toContain('resolvedConversationView');
    expect(source).not.toContain('resolvedReplayFallbackMessages');
    expect(source).not.toContain('conversationView = null');
    expect(source).not.toContain('replayReadModel');
    expect(source).not.toContain('const replayMessages = replayReadModel?.messages');
    expect(source).not.toContain('const messages = Array.isArray(replayMessages)');
    expect(source).not.toContain('useMemo');
    expect(source).not.toContain('() => (conversationView ? [] : messages)');
    expect(normalizedChatInterfaceSource).not.toContain('() => (conversationView ? [] : messages)');
    expect(chatInterfacePresentationRuntimeSource).not.toContain('replayFallbackMessages');
    expect(normalizedChatInterfaceSource).toContain('useConversationReplayActions()');
    expect(normalizedChatInterfaceSource).not.toContain('replayReadModel');
    expect(normalizedChatInterfaceSource).not.toContain('useConversationReplayActions({\n    conversationView,');
    expect(normalizedChatInterfaceSource).not.toContain('useConversationReplayActions({\n    replayFallbackMessages,');
    expect(normalizedChatInterfaceSource).not.toContain('useConversationReplayActions({\n    conversationView,\n    messages,\n    setMessages,');
    expect(normalizedChatInterfaceSource).not.toContain('setThinkingSourceEventType,\n  })');
    expect(continuityServiceSource).not.toContain('loadForDisplay');
    expect(continuityServiceSource).not.toContain('loadDisplayRows');
    expect(replayRuntimeSource).not.toContain('buildPendingTurn');
    expect(replayRuntimeSource).not.toContain('function buildReplayPendingTurn');
    expect(replayRuntimeSource).not.toContain('DesktopPendingTurnBridgeRuntime');
    expect(replayRuntimeSource).not.toContain('initializeLocalConversationSession');
    expect(replayRuntimeSource).not.toContain('createConversationRef');
    expect(replayRuntimeSource).not.toContain('resolveReplayReadModel');
    expect(replayRuntimeSource).not.toContain('buildConversationViewChatMessages');
    expect(replayRuntimeSource).not.toContain('buildReplayPendingPublication');
    expect(replayRuntimeSource).toContain('executeReplayAction');
    expect(replayRuntimeSource).toContain('executeReplayIntent');
    expect(replayRuntimeSource).not.toContain('replayUiContext');
    expect(replayRuntimeSource).toContain('REPLAY_ACTION_INTENT_FIELDS');
    expect(replayRuntimeSource).toContain("'action'");
    expect(replayRuntimeSource).toContain("'editedText'");
    expect(replayRuntimeSource).toContain("'targetRowId'");
    expect(replayRuntimeSource).toContain('UnknownReplayActionField');
    expect(replayRuntimeSource).toContain('DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo');
    expect(replayRuntimeSource).toContain('DesktopConversationContinuityService.editAndResend');
    expect(replayRuntimeSource).toContain('DesktopConversationContinuityService.retryTurn');
    expect(replayRuntimeSource).not.toContain('storeConversationRef');
    expect(replayRuntimeSource).toContain('targetRowId');
    expect(replayRuntimeSource).toContain('messageId: targetRowId');
    expect(replayRuntimeSource).not.toContain('assistantMessageId');
    expect(replayRuntimeSource).not.toContain('userMessageId');
    expect(source).toContain('targetRowId');
    expect(source).not.toContain('assistantMessageId');
    expect(source).not.toContain('userMessageId');
    expect(replayRuntimeSource).not.toContain('targetUserMessageId');
    expect(replayRuntimeSource).not.toContain('chatStore');
    expect(replayRuntimeSource).not.toContain('.getState()');
    expect(replayRuntimeSource).not.toContain('activeConversationRef,');
    expect(replayRuntimeSource).not.toContain('sessionInfo = null');
    expect(replayRuntimeSource).toContain('const sessionInfo = DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo();');
    expect(replayRuntimeSource).not.toContain('const modelSelection = resolveReplayModelSelection();');
    expect(replayRuntimeSource).not.toContain('resolveReplayModelSelection');
    expect(replayRuntimeSource).not.toContain('model: modelSelection');
    expect(replayRuntimeSource).not.toContain('modelSelection,\n  sessionInfo');
    expect(replayRuntimeSource).not.toContain('modelSelection: resolveReplayModelSelection()');
    expect(replayRuntimeSource).not.toContain('sessionInfo: resolvedSessionInfo');
    expect(replayRuntimeSource).not.toContain('deferredQueryModelSelection');
    expect(replayRuntimeSource).not.toContain('DesktopSettingsRuntimeClient');
    expect(replayRuntimeSource).not.toContain('.setModel(');
    expect(replayRuntimeTestSource).not.toContain('createChatStore');
    expect(replayRuntimeTestSource).not.toContain('chatStoreBundle');
    expect(replayRuntimeTestSource).not.toContain('chatStore:');
    expect(replayRuntimeTestSource).not.toContain('messages:');
    expect(continuityServiceSource).not.toContain('type EditAndResendCommandInput = Omit<EditAndResendInput');
    expect(continuityServiceSource).not.toContain('type RetryTurnCommandInput = Omit<RetryTurnInput');
    expect(continuityServiceSource).not.toContain('input.payload');
    expect(continuityServiceSource).not.toContain('input.model');
    expect(continuityServiceSource).toContain("exactReplayCommandString(input.conversationRef, 'conversation reference')");
    expect(continuityServiceSource).toContain("exactReplayCommandString(input.messageId, 'message id')");
    expect(continuityServiceSource).toContain("exactRevisionCommandString(input.conversationRef, 'conversation reference')");
    expect(continuityServiceSource).toContain("exactRevisionCommandString(input.revisionId, 'revision id')");
    expect(continuityServiceSource).toContain("exactRevisionCommandString(input.sourceRevisionId, 'source revision id')");
    expect(continuityServiceSource).toContain("exactRevisionCommandString(conversationRef, 'conversation reference')");
    expect(continuityServiceSource).toContain('readExactConversationRef(DesktopTranscriptSessionRuntimeClient.getActiveConversationRef())');
    expect(continuityServiceSource).toContain("optionalExactRevisionCommandString(input.cutAfterRowId, 'cut row id')");
    expect(continuityServiceSource).toContain('const newConversationRef = optionalExactRevisionCommandString(');
    expect(continuityServiceSource).toContain('input.newConversationRef');
    expect(continuityServiceSource).toContain("'new conversation reference'");
    expect(continuityServiceSource).not.toContain('input.conversationRef.trim');
    expect(continuityServiceSource).not.toContain('input.messageId.trim');
    expect(continuityServiceSource).not.toContain('function optionalString(value: unknown)');
    expect(replayRuntimeSource).not.toContain('const replayTurnRef = crypto.randomUUID');
    expect(replayRuntimeSource).toContain('MissingConversationRef');
    expect(replayRuntimeSource).not.toContain('turnRef: replayTurnRef');
    expect(replayRuntimeSource).not.toContain('DesktopPendingTurnRuntimeClient');
    expect(replayRuntimeSource).not.toContain('buildReplayContextMessages');
    expect(replayRuntimeSource).not.toContain('resolveReplayToolMessageCorrelationId');
    expect(replayRuntimeSource).not.toContain('resolveToolCallCorrelationId');
    expect(replayRuntimeSource).not.toContain('resolveToolOutputCorrelationId');
    expect(replayRuntimeSource).not.toContain('resolveToolBundleCorrelationId');
    expect(replayRuntimeSource).not.toContain('buildPreparedReplayDesktopChatTurn');
    expect(replayRuntimeSource).not.toContain('findReplayEditableUserMessageIndex');
    expect(replayRuntimeSource).not.toContain('prepareReplayEditIntent');
    expect(replayRuntimeSource).not.toContain('prepareReplayRetryIntent');
    expect(replayRuntimeSource).toContain('readExactReplayTargetRowId');
    expect(replayRuntimeSource).toContain('MissingReplayTargetRowId');
    expect(replayRuntimeSource).toContain('targetRowId: null');
    expect(replayRuntimeSource).toContain('readExactReplayConversationRef');
    expect(replayRuntimeSource).not.toContain('resolveRendererConversationSessionSnapshot');
    expect(replayRuntimeSource).not.toContain('normalizeReplayMessageId');
    expect(replayRuntimeSource).not.toContain('messageId.trim()');
    expect(replayRuntimeSource).not.toContain('editedText.trim');
    expect(replayRuntimeSource).not.toContain('normalizedEditedText');
    expect(replayRuntimeSource).not.toContain('__desktopRuntimeReplayStep');
    expect(replayRuntimeSource).toContain('error.name === error.name.trim()');
    expect(replayRuntimeSource).not.toContain('return error.name.trim()');
    expect(replayRuntimeSource).toContain('replayAction: action');
    expect(replayRuntimeSource).not.toContain('resolveReplayRetryMessageIndexes');
    expect(replayRuntimeSource).toContain('DesktopConversationReplayRuntime');
    expect(replayRuntimeSource).not.toContain('export function findReplayEditableUserMessageIndex');
    expect(replayRuntimeSource).not.toContain('export function resolveReplayRetryMessageIndexes');
    expect(replayRuntimeSource).not.toContain('export function buildReplayPreparationPayload');
    expect(replayRuntimeSource).not.toContain('export function buildReplayPendingTurn');
    expect(replayRuntimeSource).not.toContain('  buildReplayMessagesWithPendingTurn,');
    expect(replayRuntimeSource).not.toContain('  buildReplayPendingTurn,');
    expect(replayRuntimeSource).not.toContain('  buildReplayPendingPublication,');
    expect(replayRuntimeSource).not.toContain('  executeReplayIntent,');
    expect(replayRuntimeSource).not.toContain('  prepareReplayEditIntent,');
    expect(replayRuntimeSource).not.toContain('  prepareReplayRetryIntent,');
    expect(replayRuntimeSource).not.toContain('  resolveReplayReadModel,');
    expect(replayRuntimeSource).not.toContain('  findReplayEditableUserMessageIndex,');
    expect(replayRuntimeSource).not.toContain('  resolveReplayRetryMessageIndexes,');
    expect(replayRuntimeSource).not.toContain('screenshot_ref');
    expect(replayRuntimeSource).not.toContain('screenshotRef');
    expect(replayRuntimeSource).not.toContain('attachmentFilenames');
    expect(replayRuntimeSource).not.toContain('features/chat');
    expect(ipcSdkCommandHandlerSource).not.toContain('buildReplayRuntimePayload');
    expect(ipcSdkCommandHandlerSource).not.toContain('traceReplayRuntimeSend');
    expect(ipcSdkCommandHandlerSource).not.toContain('payload: runtimePayload');
    expect(ipcSdkCommandHandlerSource).not.toContain('model: cloneJsonObject(payload.model)');
    expect(ipcSdkCommandHandlerSource).not.toContain('turnRef,\n        payload:');
    expect(ipcSdkCommandHandlerSource).toContain("messageId: requireExactCommandString(payload, 'messageId', 'message id')");
    expect(directWakeUpAgentAdapterSource).toContain('function resolveExactReplayConversationRef');
    expect(directWakeUpAgentAdapterSource).toContain("readExactReplayCommandString(options.messageId, 'message id')");
    expect(directWakeUpAgentAdapterSource).toContain('const displayConversationRef = resolveExactReplayConversationRef(options)');
    expect(directWakeUpAgentAdapterSource).not.toContain('messageId: options.messageId');
    expect(sdkConversationRuntimeSource).toMatch(/export type EditAndResendInput = \{\s+messageId: string;\s+text: string;\s+\};/);
    expect(sdkConversationRuntimeSource).toMatch(/export type RetryTurnInput = \{\s+messageId: string;\s+\};/);
    expect(sdkReplayCommandSource).not.toContain('const replayPayload = mergeReplayPayload');
    expect(sdkReplayCommandSource).not.toContain('input.payload');
    expect(sdkReplayCommandSource).not.toContain('input.model');
    expect(sdkReplayCommandSource).not.toContain('input.turnRef');
    expect(cjsConversationRuntimeSource).not.toContain('function mergeReplayPayload');
    expect(cjsReplayCommandSource).not.toContain('mergeReplayPayload');
    expect(cjsReplayCommandSource).not.toContain('input.payload');
    expect(cjsReplayCommandSource).not.toContain('input.model');
    expect(cjsReplayCommandSource).not.toContain('input.turnRef');
    expect(cjsReplayCommandSource).toContain('async retryTurn(input)');
    expect(cjsReplayCommandSource).not.toContain('async retryTurn(input = {})');
    expect(transcriptRuntimeDocSource).toContain('SDK replay commands own target-row selection');
    expect(transcriptRuntimeDocSource).not.toContain('DesktopConversationReplayRuntime owns replay row selection');
    expect(transcriptRuntimeDocSource).not.toContain('prepared\n  desktop-turn shaping');
    expect(continuityServiceSource).not.toContain('turnRef: input.turnRef');
    expect(continuityServiceSource).toContain('messageId: string;');
    expect(continuityServiceSource).toContain('text: string;');
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
    expect(source).toContain('export const DesktopManualCompactionRuntime = Object.freeze');
    expect(source).not.toContain('export async function runManualCompaction');
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
    const eventClientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopConversationRuntimeEventClient.ts'),
      'utf8',
    );
    const chatStoreSource = await fs.readFile(
      path.join(chatRoot, 'stores/chatStore.ts'),
      'utf8',
    );
    const chatStoreAdaptersSource = await fs.readFile(
      path.join(chatRoot, 'stores/chatStoreAdapters.ts'),
      'utf8',
    );
    const visibleLifecycleSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopVisibleTurnLifecycleRuntime.js'),
      'utf8',
    );
    const currentTurnWorkspaceRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopCurrentTurnWorkspaceRuntime.ts'),
      'utf8',
    );
    const pendingStateRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatPendingTurnStateRuntime.ts'),
      'utf8',
    );

    expect(offenders).toEqual([]);
    expect(clientSource).toContain('DESKTOP_RUNTIME_SEND_CHANNELS.PENDING_TURN');
    expect(clientSource).toContain('function resolveDesktopPendingTurnBroadcastAction');
    expect(clientSource).toContain('function normalizePendingTurn(value: unknown)');
    expect(clientSource).toContain('hasOnlyPendingTurnFields(source)');
    expect(clientSource).toContain('const PENDING_TURN_CLEAR_FIELDS = new Set');
    expect(clientSource).toContain('hasOnlyPendingTurnClearFields(source)');
    expect(clientSource).toContain('pendingTurn: normalizePendingTurn(source.pendingTurn)');
    expect(clientSource).not.toContain('export function resolveDesktopPendingTurnBroadcastAction');
    expect(clientSource).toContain('resolveBroadcastAction(payload');
    expect(clientSource).not.toContain("attachments?: ChatMessage['attachments']");
    expect(clientSource).not.toContain('attachmentFilenames?:');
    expect(clientSource).not.toContain('pendingTurn: source.pendingTurn');
    expect(clientSource).not.toContain("'attachments'");
    expect(clientSource).not.toContain("'screenshotRef'");
    expect(clientSource).not.toContain("'screenshot_refs'");
    expect(eventClientSource).toContain('DesktopPendingTurnRuntimeClient.resolveBroadcastAction(payload)');
    expect(eventClientSource).toContain('function exactOptionalString(value: unknown): string | null');
    expect(eventClientSource).toContain('value.length > 0 && value === value.trim()');
    expect(eventClientSource).toContain('const currentTurnConversationRef = exactOptionalString(currentTurn.conversationRef);');
    expect(eventClientSource).not.toContain('value.trim()\n    ? value.trim()');
    expect(eventClientSource).not.toContain('source.conversationRef.trim()');
    expect(eventClientSource).not.toContain('?? currentTurn.conversationRef');
    expect(chatStoreSource).not.toContain('DesktopPendingTurnBroadcastAction');
    expect(chatStoreAdaptersSource).toContain('DesktopPendingTurnBroadcastAction');
    expect(chatStoreSource).not.toContain('resolvePendingTurnForCurrentProjection');
    expect(chatStoreSource).not.toContain('resolvePendingTurnForSdkLiveTurn');
    expect(chatStoreSource).not.toContain('hasAuthoritativeSameTurnSdkReplacement');
    expect(currentTurnWorkspaceRuntimeSource).toContain('resolvePendingTurnForSdkLiveTurn');
    expect(currentTurnWorkspaceRuntimeSource).not.toContain('resolvePendingTurnForCurrentProjection');
    expect(currentTurnWorkspaceRuntimeSource).toContain('buildNoViewSdkLiveTurnWorkspaceMutation');
    expect(currentTurnWorkspaceRuntimeSource).toContain('DesktopConversationViewWorkspaceRuntime');
    expect(currentTurnWorkspaceRuntimeSource).toContain('hasWorkspaceConversationView(currentWorkspace)');
    expect(currentTurnWorkspaceRuntimeSource).not.toContain('function hasConversationView');
    expect(currentTurnWorkspaceRuntimeSource).not.toContain('hasConversationView(currentWorkspace.conversationView)');
    expect(currentTurnWorkspaceRuntimeSource).not.toContain('buildCurrentTurnWorkspaceMutation');
    expect(currentTurnWorkspaceRuntimeSource).not.toContain('buildSetCurrentTurnProjectionStateUpdate');
    expect(chatStoreSource).not.toContain('buildPendingTurnBroadcastStateUpdate');
    expect(chatStoreAdaptersSource).toContain('buildPendingTurnBroadcastStateUpdate');
    expect(chatStoreSource).not.toContain("action.kind === 'clear'");
    expect(chatStoreSource).not.toContain("source.type === 'clear'");
    expect(chatStoreSource).not.toContain('source.pendingTurn');
    expect(pendingStateRuntimeSource).toContain("action.kind === 'clear'");
    expect(visibleLifecycleSource).toContain('function hasAuthoritativeSameTurnSdkReplacement');
    expect(visibleLifecycleSource).not.toContain('hasAuthoritativeSameTurnSdkReplacement,');
  });

  test('desktop send transport rejects renderer display attachment lifecycle payloads', async () => {
    const transportSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopRuntimeTransport.ts'),
      'utf8',
    );

    expect(transportSource).toContain('rejectDisplayAttachmentLifecycleFields(payload');
    expect(transportSource).toContain("'attachments'");
    expect(transportSource).toContain("'display_attachments'");
    expect(transportSource).toContain("'displayAttachments'");
    expect(transportSource).toContain("'displayAttachmentId'");
    expect(transportSource).toContain("'previewSrc'");
    expect(transportSource).toContain('Send typed resources and let SDK projection own attachment lifecycle');
  });

  test('chat stop-turn state is owned by app runtime', async () => {
    const stopHandlerSource = await fs.readFile(
      path.join(chatRoot, 'hooks/useStopTurnHandler.js'),
      'utf8',
    );
    const chatInterfaceSource = await fs.readFile(
      path.join(chatRoot, 'components/ChatInterface.jsx'),
      'utf8',
    );
    const minimalPillSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/features/minimalChatPill/components/MinimalChatPill.jsx'),
      'utf8',
    );
    const chatStoreSource = await fs.readFile(
      path.join(chatRoot, 'stores/chatStore.ts'),
      'utf8',
    );
    const chatStoreAdaptersSource = await fs.readFile(
      path.join(chatRoot, 'stores/chatStoreAdapters.ts'),
      'utf8',
    );
    const chatInterfaceSelectorRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatInterfaceSelectorRuntime.ts'),
      'utf8',
    );
    const stopRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopStopTurnRuntime.js'),
      'utf8',
    );
    const stopTargetResolverSource = stopRuntimeSource.slice(
      stopRuntimeSource.indexOf('function resolveStopTurnTarget'),
      stopRuntimeSource.indexOf('export const DesktopStopTurnRuntime'),
    );
    const stopRuntimeExportSource = stopRuntimeSource.slice(
      stopRuntimeSource.indexOf('export const DesktopStopTurnRuntime'),
    );

    expect(stopHandlerSource).toContain('desktopStopTurnRuntime');
    expect(stopHandlerSource).toContain('DesktopStopTurnRuntime');
    expect(chatStoreSource).not.toContain('desktopStopTurnRuntime');
    expect(chatStoreSource).not.toContain('DesktopStopTurnRuntime');
    expect(chatStoreAdaptersSource).toContain('desktopStopTurnRuntime');
    expect(chatStoreAdaptersSource).toContain('DesktopStopTurnRuntime');
    expect(chatStoreSource).not.toContain('resolveStopTurnTarget');
    expect(chatInterfaceSelectorRuntimeSource).toContain('resolveStopTurnTarget');
    expect(chatInterfaceSelectorRuntimeSource).toContain('selectStableStopTurnTarget');
    expect(chatInterfaceSource).toContain('stopTurnTarget');
    expect(chatInterfaceSource).not.toContain('useStopTurnHandler({\n    enabled: canStop,\n    conversationView,');
    expect(chatInterfaceSource).not.toContain('useStopTurnHandler({\n    enabled: canStop,\n    pendingTurn,');
    expect(minimalPillSource).toContain('stopTurnTarget');
    expect(minimalPillSource).not.toContain('useStopTurnHandler({\n    enabled: stopAvailable,\n    conversationView,');
    expect(minimalPillSource).not.toContain('useStopTurnHandler({\n    enabled: stopAvailable,\n    pendingTurn,');
    expect(stopHandlerSource).not.toContain('resolveStopTurnTarget');
    expect(stopHandlerSource).not.toContain('conversationView = null');
    expect(stopHandlerSource).not.toContain('pendingTurn = null');
    expect(stopHandlerSource).not.toContain('sessionConversationRef');
    expect(stopHandlerSource).not.toContain('currentTurnProjection');
    expect(chatStoreSource).not.toContain('input?.currentTurnProjection');
    expect(stopHandlerSource).not.toContain('utils/state/stopQueryState');
    expect(stopHandlerSource).toContain('executeStopTurnExecutionPlan');
    expect(stopHandlerSource).not.toContain('buildStopTurnExecutionPlan');
    expect(stopHandlerSource).not.toContain('stopPlan.conversationRef');
    expect(stopHandlerSource).not.toContain('stopPlan.turnRef');
    expect(stopHandlerSource).not.toContain('acceptStoppedTurnInChatStore({');
    expect(stopHandlerSource).not.toContain('DesktopPendingTurnRuntimeClient.clear({');
    expect(stopHandlerSource).not.toContain('DesktopLiveTurnRuntimeClient.stop(');
    expect(stopHandlerSource).not.toContain('isStopTurnTargetFromPendingTurn');
    expect(stopHandlerSource).not.toContain("stopTarget.source === 'sdk-current-turn'");
    expect(stopHandlerSource).not.toContain("stopTarget.source === 'pending-turn'");
    expect(chatStoreSource).not.toContain('utils/state/stopQueryState');
    expect(stopRuntimeSource).toContain('DesktopStopTurnRuntime');
    expect(stopRuntimeSource).toContain('buildStopTurnExecutionPlan');
    expect(stopRuntimeSource).toContain('executeStopTurnExecutionPlan');
    expect(stopRuntimeSource).toContain('buildStoppedSdkLiveTurn');
    expect(stopRuntimeSource).toContain('doesSdkLiveTurnMatch');
    expect(stopRuntimeSource).toContain('function readExactNonEmptyRef(value)');
    expect(stopRuntimeSource).not.toContain('function normalizeRef(value)');
    expect(stopRuntimeSource).not.toContain('normalizeRef(conversationView.conversationRef)');
    expect(stopRuntimeSource).not.toContain('normalizeRef(conversationRef)');
    expect(stopRuntimeSource).toContain('DesktopConversationViewWorkspaceRuntime');
    expect(stopRuntimeSource).toContain('hasWorkspaceConversationView(currentWorkspace)');
    expect(stopRuntimeSource).toContain('function isSdkConversationView(conversationView)');
    expect(stopRuntimeSource).toContain('hasWorkspaceConversationView({ conversationView })');
    expect(stopRuntimeSource).toContain('function pendingTurnMatchesConversationView');
    expect(stopRuntimeSource).toContain('normalizedPendingTurn.conversationRef === viewConversationRef');
    expect(stopRuntimeSource).not.toContain('function hasConversationView');
    expect(stopRuntimeSource).not.toContain('hasConversationView(currentWorkspace.conversationView)');
    expect(stopTargetResolverSource).not.toContain("source: 'idle'");
    expect(stopTargetResolverSource).not.toContain('conversationRef = null');
    expect(stopRuntimeSource).toContain('const hasSdkConversationView = hasWorkspaceConversationView(currentWorkspace);');
    expect(stopRuntimeSource).toContain('const workspaceSdkLiveTurn = hasSdkConversationView');
    expect(stopRuntimeSource).toContain('readNoViewSdkLiveTurnStorage(currentWorkspace)');
    expect(stopRuntimeSource).toContain('buildNoViewSdkLiveTurnStorageUpdate(');
    expect(stopRuntimeSource).not.toContain('currentWorkspace.currentTurnProjection');
    expect(stopRuntimeSource).not.toContain('currentTurnProjection: hasWorkspaceConversationView ? null : nextSdkLiveTurn');
    expect(stopRuntimeSource).not.toContain('buildStoppedCurrentTurnProjection');
    expect(stopRuntimeSource).not.toContain('doesProjectionMatch');
    expect(stopRuntimeSource).not.toContain('currentTurnProjection = null');
    expect(stopRuntimeSource).toContain('delete nextPresentation.typingVisible');
    expect(stopRuntimeSource).toContain('delete nextPresentation.overlayVisible');
    expect(stopRuntimeSource).toContain('delete nextPresentation.hasVisibleContent');
    expect(stopRuntimeSource).not.toContain('typingVisible: false');
    expect(stopRuntimeSource).not.toContain('overlayVisible: hasVisibleContent');
    expect(stopRuntimeSource).not.toContain('presentation?.hasVisibleContent');
    expect(stopRuntimeSource).not.toContain('export function buildStopQueryTrackingPatch');
    expect(stopRuntimeSource).not.toContain('export function buildStoppedSdkLiveTurn');
    expect(stopRuntimeExportSource).toContain('buildAcceptStoppedTurnStateUpdate');
    expect(stopRuntimeExportSource).toContain('executeStopTurnExecutionPlan');
    expect(stopRuntimeExportSource).toContain('resolveStopTurnTarget');
    expect(stopRuntimeExportSource).not.toContain('buildStopQueryTrackingPatch,');
    expect(stopRuntimeExportSource).not.toContain('buildStopTurnExecutionPlan,');
    expect(stopRuntimeExportSource).not.toContain('buildStoppedTurnWorkspaceMutation,');
    expect(stopRuntimeExportSource).not.toContain('buildStoppedSdkLiveTurn,');
    expect(stopRuntimeSource).not.toContain('export function isStopTurnTargetFromCurrentTurn');
    expect(stopRuntimeSource).not.toContain('isStopTurnTargetFromConversationView');
    expect(stopRuntimeSource).not.toContain('export function isStopTurnTargetFromPendingTurn');
    expect(stopRuntimeSource).not.toContain('  isStopTurnTargetFromPendingTurn,');
    expect(stopRuntimeSource).not.toContain('export function resolveStopTurnTarget');
    expect(stopRuntimeSource).not.toContain('features/chat');
    expect(stopTargetResolverSource).not.toContain('currentTurnProjection');
    await expect(fs.stat(
      path.join(chatRoot, 'utils/state/stopQueryState.js'),
    )).rejects.toThrow();
  });

  test('visible turn lifecycle awaiting anchors do not scan raw messages', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopVisibleTurnLifecycleRuntime.js'),
      'utf8',
    );

    expect(source).toContain('presentationAnchor?.kind ===');
    expect(source).toContain('pendingTurn?.userMessageId');
    expect(source).not.toContain('messages.length - 1');
    expect(source).not.toContain("message?.sender === 'user'");
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
    const providerTraceRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatProviderTraceRuntime.js'),
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
    expect(source).toContain('export const DesktopRendererTraceRuntime = Object.freeze');
    expect(source).not.toContain('export function configureRendererTraceWorkspaceSnapshotResolver');
    expect(chatProviderSource).toContain('configureRendererTraceWorkspaceSnapshotResolver');
    expect(chatProviderSource).toContain('DesktopRendererTraceRuntime');
    expect(chatProviderSource).toContain('getChatProviderTraceWorkspaceSnapshotFromChatStore');
    expect(chatProviderSource).not.toContain('DesktopChatProviderTraceRuntime');
    expect(chatProviderSource).not.toContain('buildChatProviderTraceWorkspaceSnapshot');
    expect(chatProviderSource).not.toContain('getActiveConversationRefFromChatStore');
    expect(chatProviderSource).not.toContain('getProjectedWorkspaceReadModelFromChatStore');
    expect(chatProviderSource).not.toContain('useChatStore');
    expect(chatProviderSource).not.toContain('store.getWorkspaceState(conversationRef)');
    expect(chatProviderSource).not.toContain('projectWorkspaceReadModelState');
    expect(chatProviderSource).not.toContain('conversationView?.displayRows');
    expect(chatProviderSource).not.toContain('workspace.messages');
    expect(chatProviderSource).not.toContain('resolveLatestConversationViewRow');
    expect(chatProviderSource).not.toContain('isSending: workspace.isSending');
    expect(chatProviderSource).not.toContain('thinkingStatus: workspace.thinkingStatus');
    expect(chatProviderSource).not.toContain('phase: workspace.streamTracking.phase');
    expect(providerTraceRuntimeSource).toContain('export const DesktopChatProviderTraceRuntime = Object.freeze');
    expect(providerTraceRuntimeSource).toContain('buildChatProviderTraceWorkspaceSnapshot');
    expect(providerTraceRuntimeSource).toContain('conversationViewTraceSummary');
    expect(providerTraceRuntimeSource).not.toContain('DesktopConversationViewWorkspaceRuntime');
    expect(providerTraceRuntimeSource).not.toContain('hasWorkspaceConversationView');
    expect(providerTraceRuntimeSource).not.toContain('buildConversationViewTraceSummary');
    expect(providerTraceRuntimeSource).not.toContain('conversationView.displayRows');
    expect(providerTraceRuntimeSource).toContain('value.length > 0 && value === value.trim()');
    expect(providerTraceRuntimeSource).toContain('activeConversationRef: normalizeTraceString(activeConversationRef)');
    expect(providerTraceRuntimeSource).toContain('traceLastMessageFromReadModel(workspace?.lastMessage)');
    expect(providerTraceRuntimeSource).toContain('normalizeTraceString(workspace?.activeTurnRef)');
    expect(providerTraceRuntimeSource).toContain("typeof workspace?.messageCount === 'number'");
    expect(providerTraceRuntimeSource).not.toContain('workspace?.messages');
    expect(providerTraceRuntimeSource).not.toContain('streamTracking');
    expect(providerTraceRuntimeSource).not.toContain("value.trim() ? value.trim() : null");
    expect(providerTraceRuntimeSource).not.toContain("Boolean(workspace?.conversationView && typeof workspace.conversationView === 'object')");
    expect(providerTraceRuntimeSource).not.toContain('turnRef: lastMessage.turnRef || null');
    expect(providerTraceRuntimeSource).not.toContain('sourceEventType: lastMessage.sourceEventType || null');
    expect(providerTraceRuntimeSource).not.toContain('activeConversationRef,');
    expect(providerTraceRuntimeSource).not.toContain('conversationView?.displayRows');
    expect(providerTraceRuntimeSource).not.toContain('displayRows.length');
    expect(providerTraceRuntimeSource).not.toContain('return displayRows ? displayRows.length : messages.length');
    expect(providerTraceRuntimeSource).not.toContain('features/chat');
    const chatStoreAdaptersSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/features/chat/stores/chatStoreAdapters.ts'),
      'utf8',
    );
    expect(chatStoreAdaptersSource).toContain('getChatProviderTraceWorkspaceSnapshotFromChatStore');
    expect(chatStoreAdaptersSource).toContain('buildChatProviderTraceWorkspaceSnapshot');
    expect(chatStoreAdaptersSource).toContain('function buildChatProviderTraceWorkspaceReadModel');
    expect(chatStoreAdaptersSource).toContain('buildConversationViewTraceSummary(workspace.conversationView)');
    expect(chatStoreAdaptersSource).toContain('hasWorkspaceConversationView(workspace)');
    expect(chatStoreAdaptersSource).toContain('conversationViewTraceSummary: hasConversationView');
    expect(chatStoreAdaptersSource).toContain('workspace: buildChatProviderTraceWorkspaceReadModel(');
    expect(chatStoreAdaptersSource).toContain('const fallbackMessages = hasConversationView ? [] : workspace.messages;');
    expect(chatStoreAdaptersSource).toContain('const lastMessage = fallbackMessages[fallbackMessages.length - 1] ?? null;');
    expect(chatStoreAdaptersSource).toContain('messageCount: fallbackMessages.length');
    expect(chatStoreAdaptersSource).not.toContain('messageCount: workspace.messages.length');
    expect(chatStoreAdaptersSource).not.toContain('const lastMessage = workspace.messages[workspace.messages.length - 1] ?? null');
    expect(chatStoreAdaptersSource).toContain('function exactReadModelString(value: unknown): string | null');
    expect(chatStoreAdaptersSource).toContain('activeTurnRef: exactReadModelString(workspace.streamTracking.activeTurnRef)');
    expect(chatStoreAdaptersSource).toContain('turnRef: exactReadModelString(lastMessage.turnRef)');
    expect(chatStoreAdaptersSource).toContain('sourceEventType: exactReadModelString(lastMessage.sourceEventType)');
    expect(chatStoreAdaptersSource).not.toContain('activeTurnRef: workspace.streamTracking.activeTurnRef');
    expect(chatStoreAdaptersSource).not.toContain('turnRef: lastMessage.turnRef ?? null');
    expect(chatStoreAdaptersSource).not.toContain('sourceEventType: lastMessage.sourceEventType ?? null');
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
    const senderTestSource = await fs.readFile(
      path.resolve(__dirname, 'ChatMessageSender.test.tsx'),
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
    const liveTurnRuntimeClientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient.ts'),
      'utf8',
    );
    const stateRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatSendStateRuntime.ts'),
      'utf8',
    );
    const selectorRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatInterfaceSelectorRuntime.ts'),
      'utf8',
    );
    const traceRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopRendererTraceRuntime.ts'),
      'utf8',
    );

    expect(senderHookSource).toContain('desktopChatSendPayloadRuntime');
    expect(senderHookSource).toContain('DesktopChatSendPreparationRuntime');
    expect(senderHookSource).toContain('getChatSendReadModelFromChatStore');
    expect(senderHookSource).toContain('getSendReadModel: getChatSendReadModelFromChatStore');
    expect(senderHookSource).not.toContain('selectChatSendReadModel');
    expect(senderHookSource).not.toContain('useChatCommonActions');
    expect(senderHookSource).not.toContain('addMessage');
    expect(senderHookSource).not.toContain('DesktopRuntimeSkin');
    expect(senderHookSource).not.toContain('sendFailureMessage');
    expect(senderHookSource).not.toContain("type: 'error'");
    expect(senderHookSource).not.toContain('selectChatInterfaceState');
    expect(senderHookSource).not.toContain('getState().conversationView');
    expect(senderHookSource).not.toContain('getState().messages');
    expect(senderHookSource).not.toContain('preparedTurn.conversationRef');
    expect(senderHookSource).not.toContain('preparedTurn.turnRef');
    expect(selectorRuntimeSource).toContain('const surfaceState = projectDesktopChatSurfaceState({');
    expect(selectorRuntimeSource).toContain('hasPriorUserMessages({');
    expect(selectorRuntimeSource).toContain('hasPriorUserMessages: true');
    expect(selectorRuntimeSource).not.toContain('const messages = conversationView ? [] : activeWorkspace.messages;');
    expect(selectorRuntimeSource).not.toContain('hasConversationView(conversationView) ? emptyChatMessages : activeWorkspace.messages');
    expect(selectorRuntimeSource).not.toContain('messages: conversationView ? activeWorkspace.messages : emptyChatMessages');
    expect(sendPreparationSource).toContain('desktopChatSendPayloadRuntime');
    expect(sendPreparationSource).toContain('getSendReadModel');
    expect(sendPreparationSource).not.toContain('getConversationView');
    expect(sendPreparationSource).not.toContain('getMessages');
    expect(sendPreparationSource).not.toContain('desktopChatSendStateRuntime');
    expect(sendPreparationSource).not.toContain('displayRows');
    expect(sendPreparationSource).toContain('function exactNonEmptyString(value: unknown)');
    await expect(fs.stat(path.join(chatRoot, 'hooks/useChatCommonActions.ts'))).rejects.toThrow();
    expect(sendPreparationSource).toContain('sendReadModel.hasPriorUserMessages === true');
    expect(sendPreparationSource).toContain('export const DesktopChatSendPreparationRuntime = Object.freeze');
    expect(sendPreparationSource).not.toContain('export async function prepareDesktopChatSend');
    expect(sendPreparationSource).not.toContain('export async function dispatchPreparedDesktopChatTurn');
    expect(sendPreparationSource).toContain('DesktopPendingTurnRuntimeClient.clear');
    expect(sendPreparationSource).toContain('dependencies.clearPendingTurn');
    const preparedSendReturnSource = sendPreparationSource.slice(
      sendPreparationSource.indexOf('return {\n    conversationRef,'),
      sendPreparationSource.indexOf('async function dispatchPreparedDesktopChatTurn'),
    );
    expect(preparedSendReturnSource).not.toContain('sessionInfo:');
    expect(preparedSendReturnSource).not.toContain('timestamp,');
    expect(preparedSendReturnSource).not.toContain('turnRef: turnId');
    expect(sendPreparationSource).toContain('logRendererChatSendLifecycleTrace');
    expect(sendPreparationSource).not.toContain('logRendererChatPillTrace');
    expect(sendPreparationSource).not.toContain("source: 'renderer-send'");
    expect(sendPreparationSource).not.toContain('turn_id');
    expect(sendPreparationSource).not.toContain('include_query_screenshot');
    expect(sendPreparationSource).not.toContain('screenshotRef');
    expect(sendPreparationSource).not.toContain('screenshotRefs');
    expect(sendPreparationSource).not.toContain('screenshotUrl');
    expect(sendPreparationSource).not.toContain('readSdkDisplayAttachments');
    expect(sendPreparationSource).not.toContain('DesktopSdkDisplayAttachmentProjection');
    expect(sendPreparationSource).not.toContain('displayAttachmentId');
    expect(sendPreparationSource).not.toContain('previewSrc');
    expect(sendPreparationSource).not.toContain('attachments:');
    expect(sendPreparationSource).not.toContain('attachmentFilenames');
    expect(sendPreparationSource).not.toContain('{ attachmentFilenames, attachment_filenames');
    expect(sendPreparationSource).not.toContain('workspacePath: workspaceBinding.workspacePath || null');
    expect(sendPreparationSource).toContain('function optionalExactResourceField');
    expect(sendPreparationSource).toContain("...optionalExactResourceField('contentType', clipboardImage.contentType)");
    expect(sendPreparationSource).toContain("...optionalExactResourceField('filename', clipboardImage.filename)");
    expect(sendPreparationSource).not.toContain('contentType: clipboardImage.contentType ?? null');
    expect(sendPreparationSource).not.toContain('filename: clipboardImage.filename ?? null');
    expect(senderTestSource).toContain('function expectPendingBridgeUserMessage');
    expect(senderTestSource).not.toContain('function expectOptimisticUserMessage');
    expect(senderTestSource).not.toContain('attachments: null');
    expect(senderTestSource).not.toContain('attachments: unknown[] | null = null');
    expect(sendPreparationSource).not.toContain('chatMessageSenderPayloads');
    expect(sendPreparationSource).not.toContain('chatMessageSenderUtils');
    expect(traceRuntimeSource).toContain('buildRendererChatSendLifecycleTracePayload');
    expect(traceRuntimeSource).toContain('logRendererChatSendLifecycleTrace');
    expect(traceRuntimeSource).toContain('include_query_screenshot');
    expect(payloadRuntimeSource).toContain('export const DesktopChatSendPayloadRuntime = Object.freeze');
    expect(payloadRuntimeSource).toContain('ALLOWED_OUTGOING_PAYLOAD_FIELDS');
    expect(payloadRuntimeSource).toContain('hasUnsupportedOutgoingPayloadField');
    expect(payloadRuntimeSource).toContain('function exactNonEmptyString(value: unknown)');
    expect(payloadRuntimeSource).not.toContain('clipboardImage.base64.length > 0');
    expect(payloadRuntimeSource).not.toContain('readableFile.filePath.length > 0');
    expect(payloadRuntimeSource).not.toContain('readableFile.filename.length > 0');
    expect(payloadRuntimeSource).toContain("'clipboardImages'");
    expect(payloadRuntimeSource).toContain("'readableFiles'");
    expect(payloadRuntimeSource).not.toContain('REMOVED_RENDERER_ATTACHMENT_PAYLOAD_FIELDS');
    expect(payloadRuntimeSource).not.toContain('hasRemovedRendererAttachmentPayloadField');
    expect(payloadRuntimeSource).not.toContain("'attachmentFilenames'");
    expect(payloadRuntimeSource).not.toContain("'screenshotRef'");
    expect(payloadRuntimeSource).not.toContain("'screenshotRefs'");
    expect(payloadRuntimeSource).not.toContain("'screenshotUrl'");
    expect(payloadRuntimeSource).not.toContain("'displayAttachmentId'");
    expect(payloadRuntimeSource).not.toContain("'previewSrc'");
    expect(payloadRuntimeSource).not.toContain("'displayAttachments'");
    expect(payloadRuntimeSource).not.toContain('export function normalizeOutgoingPayload');
    expect(payloadRuntimeSource).not.toContain('export function normalizeAttachmentFilenames');
    expect(payloadRuntimeSource).not.toContain('normalizeAttachmentFilenames');
    expect(payloadRuntimeSource).not.toContain('features/chat');
    expect(liveTurnRuntimeClientSource).toContain('conversation.send resources must use typed SDK resource shapes');
    expect(liveTurnRuntimeClientSource).toContain('const normalizedResource = normalizeTurnInputResource(resource);');
    expect(liveTurnRuntimeClientSource).toContain('if (!normalizedResource)');
    expect(liveTurnRuntimeClientSource).toContain('throw new Error(INVALID_SEND_RESOURCES_ERROR)');
    expect(liveTurnRuntimeClientSource).not.toContain('.filter((resource): resource is TurnInputResource');
    expect(stateRuntimeSource).toContain('export const DesktopChatSendStateRuntime = Object.freeze');
    expect(stateRuntimeSource).toContain('hasPriorUserMessages');
    expect(stateRuntimeSource).toContain('DesktopConversationDisplayRowLookupRuntime');
    expect(stateRuntimeSource).toContain('DesktopConversationViewWorkspaceRuntime');
    expect(stateRuntimeSource).toContain('const workspace = { conversationView }');
    expect(stateRuntimeSource).toContain('hasWorkspaceConversationView(workspace)');
    expect(stateRuntimeSource).toContain('hasConversationViewUserDisplayRows(workspace.conversationView)');
    expect(stateRuntimeSource).not.toContain('function isConversationView');
    expect(stateRuntimeSource).not.toContain('row.role ===');
    expect(stateRuntimeSource).not.toContain('displayRows.some');
    expect(stateRuntimeSource).not.toContain('export function hasUserMessages');
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
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopAttachmentImageRuntime.js'),
      'utf8',
    );
    const userMessageSource = await fs.readFile(
      path.join(chatRoot, 'components/message/content/UserMessage.jsx'),
      'utf8',
    );
    const toolOutputSource = await fs.readFile(
      path.join(chatRoot, 'components/message/content/ToolOutputMessage.jsx'),
      'utf8',
    );
    const attachmentRegistrySource = await fs.readFile(
      path.join(chatRoot, 'components/message/content/AttachmentRendererRegistry.jsx'),
      'utf8',
    );
    const attachmentListSource = await fs.readFile(
      path.join(chatRoot, 'components/message/content/AttachmentList.jsx'),
      'utf8',
    );
    const clientSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopArtifactRuntimeClient.ts'),
      'utf8',
    );

    expect(resolverSource).not.toContain('FETCH_ARTIFACT_IMAGE');
    expect(resolverSource).not.toContain('IpcBridge.invoke');
    expect(resolverSource).toContain('DesktopAttachmentImageRuntime');
    expect(resolverSource).toContain('DesktopArtifactRuntimeClient.fetchArtifactImage');
    await expect(fs.stat(
      path.join(chatRoot, 'utils/message/useResolvedMessageScreenshots.js'),
    )).rejects.toThrow();
    expect(userMessageSource).not.toContain('SHOW_IMAGE_CONTEXT_MENU');
    expect(userMessageSource).not.toContain('IpcBridge.invoke');
    expect(userMessageSource).not.toContain('DesktopSdkDisplayAttachmentProjection');
    expect(userMessageSource).not.toContain('readSdkDisplayAttachments');
    expect(userMessageSource).not.toContain('displayAttachments');
    expect(userMessageSource).toContain('attachments={message.attachments}');
    expect(userMessageSource).not.toContain('Array.isArray(message.attachments)');
    expect(userMessageSource).toContain('AttachmentList');
    expect(userMessageSource).not.toContain('attachmentFilenames');
    expect(userMessageSource).not.toContain('user-file-attachments');
    expect(attachmentListSource).toContain('DesktopSdkDisplayAttachmentProjection');
    expect(attachmentListSource).toContain('readSdkDisplayAttachments(attachments)');
    expect(attachmentListSource).not.toContain('typeof attachment.id === \'string\'');
    expect(attachmentListSource).not.toContain('user-screenshot');
    expect(attachmentRegistrySource).toContain('DesktopArtifactRuntimeClient.showImageContextMenu');
    expect(attachmentRegistrySource).toContain('message-attachment-image');
    expect(attachmentRegistrySource).not.toContain('DesktopSdkDisplayAttachmentProjection');
    expect(attachmentRegistrySource).not.toContain('readSdkDisplayAttachments');
    expect(attachmentRegistrySource).not.toContain('function isExactNonEmptyString');
    expect(attachmentRegistrySource).toContain('src={attachment.previewSrc}');
    expect(attachmentRegistrySource).not.toContain('user-screenshot');
    expect(attachmentRegistrySource).not.toContain('lastVisibleSrc');
    expect(attachmentRegistrySource).not.toContain('useState');
    expect(attachmentRegistrySource).not.toContain('setLastVisibleSrc');
    expect(toolOutputSource).not.toContain('DesktopSdkDisplayAttachmentProjection');
    expect(toolOutputSource).not.toContain('readSdkDisplayAttachments');
    expect(toolOutputSource).not.toContain('displayAttachments');
    expect(toolOutputSource).toContain('attachments={message.attachments}');
    expect(toolOutputSource).toContain('tool-attachment-container');
    expect(toolOutputSource).not.toContain('tool-screenshot');
    expect(toolOutputSource).not.toContain('Screenshot After Action');
    expect(toolOutputSource).not.toContain('Array.isArray(message.attachments) ? message.attachments : []');
    expect(toolOutputSource).not.toContain('DesktopSdkToolDetailProjection');
    expect(toolOutputSource).not.toContain('sanitizeSdkToolDetailRecord(message.toolMetadata)');
    expect(toolOutputSource).not.toContain('fallbackToolMetadata');
    expect(toolOutputSource).not.toContain('tool_name: message.toolName');
    expect(toolOutputSource).not.toContain('execution_time: message.executionTime');
    expect(toolOutputSource).not.toContain('success: message.success');
    expect(toolOutputSource).not.toContain('message.modelFacingToolOutput');
    expect(toolOutputSource).not.toContain('modelFacingToolOutput: PropTypes');
    expect(toolOutputSource).toContain('text={message.text}');
    expect(toolOutputSource).not.toContain('toolName: PropTypes');
    expect(toolOutputSource).not.toContain('executionTime: PropTypes');
    expect(toolOutputSource).not.toContain('success: PropTypes');
    expect(toolOutputSource).not.toContain('metadata: message.toolMetadata || null');
    expect(toolOutputSource).toContain('AttachmentList');
    expect(attachmentListSource).toContain('headerText');
    expect(attachmentListSource).toContain('visibleAttachments.length === 0');
    expect(toolOutputSource).not.toContain('useResolvedMessageScreenshotSrc');
    await expect(fs.stat(
      path.resolve(__dirname, '../../frontend/src/renderer/infrastructure/transcript/toolOutputChatMessageState.ts'),
    )).rejects.toThrow();
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
    const loopRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatLoopUiRuntime.js'),
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
    expect(loopStateSource).not.toContain('payload.isConnected');
    expect(loopStateSource).not.toContain('hasConnectionState');
    expect(loopStateSource).not.toContain('CHAT_LOOP_MACHINE_EVENT');
    expect(loopStateSource).not.toContain('function reduceChatLoopMachineState');
    expect(loopStateSource).not.toContain('window.setTimeout');
    expect(loopStateSource).not.toContain('window.clearTimeout');
    expect(loopStateSource).toContain('reduceChatLoopTransportMachineState');
    expect(loopStateSource).toContain('createChatLoopTransportStatusEvent');
    expect(loopStateSource).toContain('scheduleChatLoopRecoveryWatchdog');
    expect(loopStateSource).toContain('DesktopChatLoopUiRuntime');
    expect(loopStateSource).toContain('DesktopClientSessionRuntimeClient.onObservedIpcTransportConnection');
    expect(loopStateSource).toContain('DesktopClientSessionRuntimeClient.loadObservedMainTransportConnection');
    expect(loopRuntimeSource).toContain('CHAT_LOOP_TRANSPORT_MACHINE_EVENT');
    expect(loopRuntimeSource).toContain('export const DesktopChatLoopUiRuntime = Object.freeze');
    expect(loopRuntimeSource).toContain('reduceChatLoopTransportMachineState');
    expect(loopRuntimeSource).toContain('scheduleChatLoopRecoveryWatchdog');
    expect(loopRuntimeSource).toContain('setTimeout');
    expect(loopRuntimeSource).toContain('clearTimeout');
    expect(loopRuntimeSource).not.toContain('export function reduceChatLoopTransportMachineState');
    expect(loopRuntimeSource).not.toContain('export function scheduleChatLoopRecoveryWatchdog');
    expect(loopRuntimeSource).not.toContain('export function resolveChatLoopUiState');
    expect(loopRuntimeSource).not.toContain('features/chat');
    expect(clientSource).toContain('INVOKE_CHANNELS.GET_CLIENT_USER_ID');
    expect(clientSource).toContain('ON_CHANNELS.IPC_STATUS');
    expect(clientSource).toContain('function normalizeDesktopTransportConnectionStatus');
    expect(clientSource).not.toContain('export function normalizeDesktopTransportConnectionStatus');
    expect(clientSource).toContain('function resolveObservedDesktopTransportConnection');
    expect(clientSource).not.toContain('export function resolveObservedDesktopTransportConnection');
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
    expect(dashboardShellSource).not.toContain('payload.target');
    expect(dashboardShellSource).not.toContain('typeof payload?.userId');
    expect(dashboardShellSource).not.toContain('payload?.userId');
    expect(dashboardShellSource).not.toContain('payload.userId');
    expect(dashboardShellSource).not.toContain('payload.userId.trim');
    expect(dashboardShellSource).toContain('DesktopClientSessionRuntimeClient.loadMainSessionUserId');
    expect(dashboardShellSource).toContain('DesktopWindowRuntimeClient.onMainWindowOpenTarget');
    expect(sessionClientSource).toContain('function normalizeDesktopClientSessionSnapshot');
    expect(sessionClientSource).not.toContain('export function normalizeDesktopClientSessionSnapshot');
    expect(sessionClientSource).toContain('function resolveDesktopClientSessionUserId');
    expect(sessionClientSource).not.toContain('export function resolveDesktopClientSessionUserId');
    expect(sessionClientSource).toContain('INVOKE_CHANNELS.GET_CLIENT_USER_ID');
    expect(windowClientSource).toContain('function resolveMainWindowOpenTarget');
    expect(windowClientSource).not.toContain('export function resolveMainWindowOpenTarget');
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
    const replayRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopConversationReplayRuntime.js'),
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
    const chatInterfaceBindingsRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatInterfaceBindingsRuntime.js'),
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
    expect(chatInterfaceSource).not.toContain('payload.workspace');
    expect(chatInterfaceSource).not.toContain('result.workspace');
    expect(chatInterfaceSource).not.toContain("'workspace_picker'");
    expect(chatInterfaceSource).not.toContain('infrastructure/audio/PlayerService');
    expect(replayActionsSource).not.toContain('infrastructure/workspace/conversationWorkspaceBinding');
    expect(newChatSessionSource).not.toContain('infrastructure/workspace/conversationWorkspaceBinding');
    expect(sendPreparationSource).not.toContain('infrastructure/workspace/conversationWorkspaceBinding');
    expect(dashboardHookSource).not.toContain('infrastructure/workspace/conversationWorkspaceBinding');
    expect(dashboardShellSource).not.toContain('infrastructure/workspace/conversationWorkspaceBinding');
    expect(chatInterfaceSource).toContain('DesktopWorkspaceRuntimeClient.onWorkspaceSelectionUpdated');
    expect(chatInterfaceSource).toContain('DesktopWorkspaceRuntimeClient.fetchActiveWorkspace');
    expect(chatInterfaceSource).toContain('DesktopWorkspaceRuntimeClient.requestGrantedActiveWorkspace');
    expect(workspaceClientSource).toContain('function normalizeWorkspaceAccessUpdatedPayload');
    expect(workspaceClientSource).not.toContain('export function normalizeWorkspaceAccessUpdatedPayload');
    expect(workspaceClientSource).toContain('onWorkspaceAccessUpdated');
    expect(workspaceClientSource).toContain('onWorkspaceSelectionUpdated');
    expect(workspaceClientSource).toContain('fetchActiveWorkspaceSelection');
    expect(workspaceClientSource).toContain('requestActiveWorkspaceSelection');
    expect(workspaceClientSource).toContain('isWorkspacePickerSelection');
    expect(chatInterfaceSource).toContain('DesktopAudioRuntimeClient.createAudioPlayer');
    expect(sendPreparationSource).not.toContain('infrastructure/workspace/workspaceAccess');
    expect(sendPreparationSource).toContain('DesktopWorkspaceRuntimeClient.fetchActiveWorkspaceSelection');
    expect(sendPreparationSource).toContain('DesktopWorkspaceRuntimeClient.setConversationWorkspaceBinding');
    expect(replayActionsSource).not.toContain('DesktopWorkspaceRuntimeClient.getConversationWorkspaceBinding');
    expect(replayActionsSource).not.toContain('desktopConversationSessionRuntime');
    expect(replayActionsSource).not.toContain('DesktopRuntimeSkin.desktopRuntimeSkin');
    expect(replayActionsSource).not.toContain('addMessageToChatStore');
    expect(replayActionsSource).not.toContain('failureMessages');
    expect(replayActionsSource).not.toContain('sendFailureMessage');
    expect(replayRuntimeSource).not.toContain('DesktopRuntimeSkin.desktopRuntimeSkin');
    expect(replayRuntimeSource).not.toContain('addMessage');
    expect(replayRuntimeSource).not.toContain('failureMessages');
    expect(replayRuntimeSource).not.toContain('renderer-replay');
    expect(replayRuntimeSource).not.toContain('DesktopWorkspaceRuntimeClient');
    expect(replayRuntimeSource).not.toContain('getConversationWorkspaceBinding');
    expect(replayRuntimeSource).not.toContain('workspace_path');
    expect(replayRuntimeSource).toContain('desktopConversationSessionRuntime');
    expect(replayActionsSource).not.toContain('utils/session/conversationRef');
    expect(newChatSessionSource).toContain('DesktopWorkspaceRuntimeClient.setConversationWorkspaceBinding');
    expect(newChatSessionSource).toContain('DesktopNewChatSessionRuntime');
    expect(newChatSessionSource).not.toContain('export const startNewChatSession');
    expect(newChatSessionSource).toContain('desktopConversationSessionRuntime');
    expect(newChatSessionSource).not.toContain('utils/session/conversationRef');
    expect(newChatSessionSource).not.toContain('features/chat');
    expect(sendPreparationSource).toContain('desktopConversationSessionRuntime');
    expect(sendPreparationSource).not.toContain('utils/session/conversationRef');
    expect(conversationSessionRuntimeSource).toContain('export const DesktopConversationSessionRuntime = Object.freeze');
    expect(conversationSessionRuntimeSource).toContain('createConversationRef');
    expect(conversationSessionRuntimeSource).not.toContain('export function createConversationRef');
    expect(conversationSessionRuntimeSource).not.toContain('export function ensureConversationRefForSend');
    expect(conversationSessionRuntimeSource).not.toContain('export function applyRendererConversationSelection');
    expect(conversationSessionRuntimeSource).not.toContain('features/chat');
    expect(dashboardHookSource).toContain('DesktopWorkspaceRuntimeClient.resolveConversationWorkspaceBinding');
    expect(dashboardShellSource).toContain('DesktopWorkspaceRuntimeClient.clearAllConversationWorkspaceBindings');
    expect(bindingsSource).not.toContain('AUDIO_CHUNK');
    expect(bindingsSource).not.toContain('IpcBridge.on');
    expect(bindingsSource).not.toContain('infrastructure/shortcuts/agentStopShortcut');
    expect(bindingsSource).not.toContain('window.addEventListener');
    expect(bindingsSource).not.toContain('window.removeEventListener');
    expect(chatInterfaceSource).not.toContain('window.addEventListener');
    expect(chatInterfaceSource).not.toContain('window.removeEventListener');
    expect(chatInterfaceSource).not.toContain('window.requestAnimationFrame');
    expect(chatInterfaceSource).not.toContain('window.cancelAnimationFrame');
    expect(bindingsSource).not.toContain('isAgentStopShortcutEvent');
    expect(chatInterfaceSource).toContain('DesktopNewChatSessionRuntime');
    expect(chatInterfaceSource).not.toContain('import { startNewChatSession');
    expect(bindingsSource).toContain('DesktopAudioRuntimeClient.onAudioChunk');
    expect(bindingsSource).toContain('DesktopChatInterfaceBindingsRuntime.subscribeToMenuDismiss');
    expect(bindingsSource).toContain('DesktopChatInterfaceBindingsRuntime.subscribeToStopShortcut');
    expect(bindingsSource).toContain('DesktopChatInterfaceBindingsRuntime.subscribeToFindShortcut');
    expect(chatInterfaceSource).toContain('DesktopChatInterfaceBindingsRuntime.subscribeToWindowFocus');
    expect(chatInterfaceSource).toContain('DesktopChatInterfaceBindingsRuntime.scheduleDeferredFocus');
    expect(chatInterfaceSource).toContain('DesktopChatInterfaceBindingsRuntime.focusAndSelectInput');
    expect(chatInterfaceSource).not.toContain('.focus()');
    expect(chatInterfaceSource).not.toContain('.select()');
    expect(chatInterfaceBindingsRuntimeSource).toContain('DesktopShortcutRuntimeClient.isAgentStopShortcutEvent');
    expect(chatInterfaceBindingsRuntimeSource).toContain('addEventListener');
    expect(chatInterfaceBindingsRuntimeSource).toContain('removeEventListener');
    expect(chatInterfaceBindingsRuntimeSource).toContain('requestAnimationFrame');
    expect(chatInterfaceBindingsRuntimeSource).toContain('focusAndSelectInput');
    expect(chatInterfaceBindingsRuntimeSource).not.toContain('features/chat');
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
    expect(appSource).toContain('DesktopWindowRuntimeClient.showMainWindowWithValues');
    expect(appSource).toContain('DesktopWindowRuntimeClient.showChatboxWithValues');
    expect(appSource).not.toContain('DesktopWindowRuntimeClient.showMainWindow({');
    expect(appSource).not.toContain('DesktopWindowRuntimeClient.showChatbox({');
    expect(controlsSource).not.toContain('INVOKE_CHANNELS');
    expect(controlsSource).not.toContain('IpcBridge.invoke');
    expect(controlsSource).toContain('DesktopWindowRuntimeClient.minimizeWindow');
    expect(controlsSource).toContain('DesktopWindowRuntimeClient.toggleMaximizeWindow');
    expect(controlsSource).toContain('DesktopWindowRuntimeClient.closeWindow');
    expect(controlsSource).toContain('DesktopWindowRuntimeClient.showMainWindowWithValues');
    expect(controlsSource).not.toContain('DesktopWindowRuntimeClient.showMainWindow(options)');
    expect(clientSource).toContain('INVOKE_CHANNELS.SHOW_MAIN_WINDOW');
    expect(clientSource).toContain('INVOKE_CHANNELS.SHOW_CHATBOX');
    expect(clientSource).toContain('function buildShowMainWindowOptions');
    expect(clientSource).not.toContain('export function buildShowMainWindowOptions');
    expect(clientSource).toContain('function buildShowChatboxOptions');
    expect(clientSource).not.toContain('export function buildShowChatboxOptions');
    expect(clientSource).toContain('function buildHideChatboxOptions');
    expect(clientSource).not.toContain('export function buildHideChatboxOptions');
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
    const interactionRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatboxInteractionRuntime.js'),
      'utf8',
    );

    for (const source of [pillSource, bindingsSource]) {
      expect(source).not.toContain('IpcBridge');
      expect(source).not.toContain('INVOKE_CHANNELS');
      expect(source).not.toContain('SEND_CHANNELS');
      expect(source).not.toContain('ON_CHANNELS');
      expect(source).not.toContain('chat/utils/state/chatBoxState');
    }
    expect(pillSource).toContain('desktopChatboxLayoutRuntime');
    expect(bindingsSource).toContain('desktopChatboxInteractionRuntime');
    expect(layoutRuntimeSource).toContain('resolveChatboxVisualAnchorHeight');
    expect(layoutRuntimeSource).toContain('resolveChatboxNativeFrameHeight');
    expect(layoutRuntimeSource).toContain('startChatboxDragFromWindow');
    expect(layoutRuntimeSource).toContain('DesktopChatboxLayoutRuntime');
    expect(layoutRuntimeSource).not.toContain('export function createChatboxDragState');
    expect(layoutRuntimeSource).not.toContain('export function resolveChatboxVisualAnchorHeight');
    expect(layoutRuntimeSource).not.toContain('export function resolveChatboxNativeFrameHeight');
    expect(layoutRuntimeSource).not.toContain('export function startChatboxDrag');
    expect(layoutRuntimeSource).not.toContain('export function startChatboxDragFromWindow');
    expect(layoutRuntimeSource).not.toContain('export function stopChatboxDrag');
    expect(layoutRuntimeSource).not.toContain('export function getChatboxDragTarget');
    expect(layoutRuntimeSource).not.toContain('export function getChatboxCloseBumpHeight');
    expect(layoutRuntimeSource).not.toContain('export const CHATBOX_VISUAL_ANCHOR_HEIGHT_COMPACT');
    expect(layoutRuntimeSource).not.toContain('export const CHATBOX_WINDOW_FRAME_HEIGHT_PADDING');
    expect(interactionRuntimeSource).toContain('DesktopChatboxLayoutRuntime');
    expect(interactionRuntimeSource).toContain('DesktopWindowRuntimeClient');
    expect(interactionRuntimeSource).toContain('isPointerInsideChatbox');
    expect(interactionRuntimeSource).toContain('subscribeToChatboxHitTestEvents');
    expect(interactionRuntimeSource).toContain('startChatboxCloseButtonAnchorSync');
    expect(interactionRuntimeSource).toContain('resolveChatboxCloseButtonAnchorCenterX');
    expect(interactionRuntimeSource).toContain('scheduleChatboxNativeFrameCollapse');
    expect(interactionRuntimeSource).toContain('clearChatboxNativeFrameCollapse');
    expect(interactionRuntimeSource).toContain('scheduleChatboxComposerHeightCommit');
    expect(interactionRuntimeSource).toContain('focusChatboxTextInputAtEnd');
    expect(interactionRuntimeSource).toContain('getBoundingClientRect');
    expect(interactionRuntimeSource).not.toContain('features/chat');
    expect(interactionRuntimeSource).not.toContain('features/minimalChatPill');
    expect(pillSource).toContain('DesktopChatboxLayoutRuntime.resolveChatboxNativeFrameHeight');
    expect(pillSource).toContain('DesktopChatboxLayoutRuntime.startChatboxDragFromWindow');
    expect(pillSource).toContain('DesktopChatboxInteractionRuntime.subscribeToChatboxHitTestEvents');
    expect(pillSource).toContain('DesktopChatboxInteractionRuntime.startChatboxCloseButtonAnchorSync');
    expect(pillSource).toContain('DesktopChatboxInteractionRuntime.scheduleChatboxNativeFrameCollapse');
    expect(pillSource).toContain('DesktopChatboxInteractionRuntime.clearChatboxNativeFrameCollapse');
    expect(pillSource).toContain('DesktopChatboxInteractionRuntime.scheduleChatboxComposerHeightCommit');
    expect(pillSource).toContain('DesktopChatboxInteractionRuntime.focusChatboxTextInputAtEnd');
    expect(pillSource).not.toContain("window.addEventListener('mousemove'");
    expect(pillSource).not.toContain("window.addEventListener('mouseleave'");
    expect(pillSource).not.toContain("window.addEventListener('resize'");
    expect(pillSource).not.toContain("window.removeEventListener('mousemove'");
    expect(pillSource).not.toContain("window.removeEventListener('mouseleave'");
    expect(pillSource).not.toContain("window.removeEventListener('resize'");
    expect(pillSource).not.toContain('new ResizeObserver');
    expect(pillSource).not.toContain('window.setTimeout');
    expect(pillSource).not.toContain('window.clearTimeout');
    expect(pillSource).not.toContain('window.requestAnimationFrame');
    expect(pillSource).not.toContain('window.screenX');
    expect(pillSource).not.toContain('window.screenY');
    expect(pillSource).not.toContain('setSelectionRange');
    expect(pillSource).not.toContain('.focus()');
    expect(pillSource).not.toContain('closeButtonAnchorFrameRef');
    expect(bindingsSource).toContain('DesktopChatboxInteractionRuntime.startChatboxVisualAnchorSync');
    expect(bindingsSource).toContain('DesktopChatboxInteractionRuntime.resetChatboxVisualAnchorHeight');
    expect(pillSource).not.toContain('CHATBOX_WINDOW_FRAME_HEIGHT_PADDING');
    expect(bindingsSource).not.toContain('CHATBOX_VISUAL_ANCHOR_HEIGHT_COMPACT');
    expect(pillSource).toContain('setChatboxVisualAnchorHeightValue');
    expect(bindingsSource).not.toContain('setChatboxVisualAnchorHeightValue');
    expect(pillSource).not.toContain('setChatboxVisualAnchorHeight({');
    expect(bindingsSource).not.toContain('payload.frameHeight');
    expect(pillSource).toContain('DesktopWindowRuntimeClient.activateChatboxTextEntryForReason');
    expect(pillSource).not.toContain('activateChatboxTextEntry({');
    expect(pillSource).toContain('DesktopWindowRuntimeClient.setChatboxHitTestActiveValue');
    expect(pillSource).not.toContain('setChatboxHitTestActive({');
    expect(pillSource).toContain('DesktopWindowRuntimeClient.showMainWindowWithValues');
    expect(pillSource).not.toContain('DesktopWindowRuntimeClient.showMainWindow({');
    expect(pillSource).toContain('DesktopWindowRuntimeClient.hideChatboxForReason');
    expect(pillSource).not.toContain('DesktopWindowRuntimeClient.hideChatbox({');
    expect(pillSource).toContain('DesktopWindowRuntimeClient.moveChatboxTo');
    expect(bindingsSource).toContain('DesktopWindowRuntimeClient.onChatboxFocus');
    expect(bindingsSource).toContain('DesktopWindowRuntimeClient.onWakewordSttTrigger');
    expect(clientSource).toContain('INVOKE_CHANNELS.SET_CHATBOX_VISUAL_ANCHOR_HEIGHT');
    expect(clientSource).toContain('function buildChatboxVisualAnchorHeightPayload');
    expect(clientSource).not.toContain('export function buildChatboxVisualAnchorHeightPayload');
    expect(clientSource).toContain('INVOKE_CHANNELS.ACTIVATE_CHATBOX_TEXT_ENTRY');
    expect(clientSource).toContain('function buildChatboxTextEntryActivationPayload');
    expect(clientSource).not.toContain('export function buildChatboxTextEntryActivationPayload');
    expect(clientSource).toContain('INVOKE_CHANNELS.SET_CHATBOX_HIT_TEST_ACTIVE');
    expect(clientSource).toContain('function buildChatboxHitTestPayload');
    expect(clientSource).not.toContain('export function buildChatboxHitTestPayload');
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
    expect(messageInputSource).toContain('DesktopAttachmentPresentationRuntime.resolveReadableFileTypeLabel');
    expect(previewRowSource).toContain('DesktopAttachmentPresentationRuntime.resolveReadableFileTypeLabel');
    expect(attachmentRuntimeSource).toContain('resolveReadableFileTypeLabel');
    expect(attachmentRuntimeSource).toContain('DesktopAttachmentPresentationRuntime');
    expect(attachmentRuntimeSource).not.toContain('export function resolveReadableFileTypeLabel');
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
    const messageInputSource = await fs.readFile(
      path.join(chatRoot, 'components/MessageInput.jsx'),
      'utf8',
    );
    const messageInputRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopMessageInputRuntime.js'),
      'utf8',
    );

    expect(composerDraftSource).toContain('desktopMessageInputRuntime');
    expect(composerDraftSource).toContain('DesktopMessageInputRuntime');
    expect(composerDraftSource).not.toContain('utils/message/messageInput');
    expect(messageInputSource).toContain('desktopMessageInputRuntime');
    expect(messageInputSource).toContain('DesktopMessageInputRuntime.focusTextInputAtEnd');
    expect(messageInputSource).not.toContain('setSelectionRange');
    expect(messageInputSource).not.toContain('.focus()');
    expect(messageInputRuntimeSource).toContain('export const DesktopMessageInputRuntime = Object.freeze');
    expect(messageInputRuntimeSource).toContain('focusTextInputAtEnd');
    expect(messageInputRuntimeSource).toContain('DesktopChatSendPayloadRuntime');
    expect(messageInputRuntimeSource).toContain('normalizeOutgoingPayload');
    expect(messageInputRuntimeSource).not.toContain('function normalizeClipboardImage');
    expect(messageInputRuntimeSource).not.toContain('function exactNonEmptyString(value)');
    expect(messageInputRuntimeSource).not.toContain('const base64 = exactNonEmptyString(clipboardImage.base64);');
    expect(messageInputRuntimeSource).not.toContain('filePath: exactNonEmptyString(readableFile.filePath)');
    expect(messageInputRuntimeSource).not.toContain('base64: clipboardImage.base64');
    expect(messageInputRuntimeSource).not.toContain('filePath: readableFile.filePath');
    expect(messageInputRuntimeSource).not.toContain('return clipboardImages.filter((image) => isClipboardImage(image))');
    expect(messageInputRuntimeSource).not.toContain('previewUrl: clipboardImage.previewUrl');
    expect(messageInputRuntimeSource).not.toContain('id: clipboardImage.id');
    expect(messageInputRuntimeSource).not.toContain('id: readableFile.id');
    expect(messageInputRuntimeSource).not.toContain('export function buildOutgoingMessage');
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
    expect(composerDraftSource).toContain('DesktopComposerAttachmentRuntime');
    expect(composerDraftSource).toContain('parseClipboardImagePasteEvent');
    expect(composerDraftSource).not.toContain('clipboardImageUtils');
    expect(composerDraftSource).not.toContain('fileAttachmentUtils');
    expect(composerDraftSource).not.toContain('clipboardData');
    expect(composerAttachmentSource).toContain('DesktopComposerAttachmentRuntime');
    expect(composerAttachmentSource).toContain('parseClipboardImagePasteEvent');
    expect(composerAttachmentSource).toContain('parseClipboardImageItems');
    expect(composerAttachmentSource).toContain('parseSelectedComposerFiles');
    expect(composerAttachmentSource).toContain('parseBase64ImageDataUrl');
    expect(composerAttachmentSource).not.toContain('export function readFileAsDataUrl');
    expect(composerAttachmentSource).not.toContain('export function parseBase64ImageDataUrl');
    expect(composerAttachmentSource).not.toContain('export async function parseClipboardImagePasteEvent');
    expect(composerAttachmentSource).not.toContain('export async function parseClipboardImageItems');
    expect(composerAttachmentSource).not.toContain('export async function parseSelectedComposerFiles');
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
    expect(transcriptionRuntimeSource).toContain('DesktopTranscriptionRegionRuntime');
    expect(transcriptionRuntimeSource).toContain('updateRegionAfterInputChange');
    expect(transcriptionRuntimeSource).toContain('readTextFromPasteEvent');
    expect(transcriptionRuntimeSource).toContain('updateRegionAfterPaste');
    expect(transcriptionRuntimeSource).toContain('scheduleCursorRestoreAfterPaste');
    expect(transcriptionRuntimeSource).toContain('setTimeout');
    expect(transcriptionRuntimeSource).not.toContain('export function updateRegionAfterInputChange');
    expect(transcriptionHookSource).toContain('scheduleCursorRestoreAfterPaste');
    expect(transcriptionHookSource).toContain('readTextFromPasteEvent');
    expect(transcriptionHookSource).not.toContain('clipboardData');
    expect(transcriptionHookSource).not.toContain('setTimeout(');
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
    const traceRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopRendererTraceRuntime.ts'),
      'utf8',
    );
    const responseViewRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopResponseOverlayViewRuntime.ts'),
      'utf8',
    );
    const layoutRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopResponseOverlayLayoutRuntime.js'),
      'utf8',
    );
    const interactionRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopResponseOverlayInteractionRuntime.js'),
      'utf8',
    );

    for (const source of [overlaySource, syncSource, viewModelSource]) {
      expect(source).not.toContain('IpcBridge');
      expect(source).not.toContain('INVOKE_CHANNELS');
      expect(source).not.toContain('ON_CHANNELS');
    }
    expect(overlaySource).toContain('desktopResponseOverlayLayoutRuntime');
    expect(syncSource).toContain('desktopResponseOverlayLayoutRuntime');
    expect(overlaySource).toContain('DesktopResponseOverlayLayoutRuntime');
    expect(syncSource).toContain('DesktopResponseOverlayLayoutRuntime');
    expect(syncSource).not.toContain('overlayFrameSize');
    expect(syncSource).not.toContain('responseOverlayLayoutMode');
    expect(syncSource).not.toContain('responseOverlayLayoutContract');
    expect(syncSource).not.toContain('logRendererResponseSurfaceTrace');
    expect(syncSource).not.toContain('logRendererLiveSurfaceTrace');
    expect(syncSource).toContain('logRendererResponseSurfaceSizeTrace');
    expect(syncSource).toContain('logRendererResponseOverlayLifecycleTrace');
    expect(syncSource).not.toContain("'response_overlay.renderer.size_report'");
    expect(syncSource).not.toContain("'renderer.response_overlay.mount'");
    expect(syncSource).not.toContain("'renderer.response_overlay.unmount'");
    expect(syncSource).not.toContain('thinkingTextLength');
    expect(syncSource).not.toContain('layout_mode');
    expect(syncSource).not.toContain('show_response');
    expect(syncSource).not.toContain('thinking_text_length');
    expect(syncSource).not.toContain('compact_hover');
    expect(syncSource).not.toContain('turn_ref');
    expect(syncSource).not.toContain('stale_guard_ref');
    expect(syncSource).not.toContain('overlayIntent?.conversationRef');
    expect(syncSource).not.toContain('overlayIntent?.turnRef');
    expect(syncSource).not.toContain('overlayIntent?.staleGuardRef');
    expect(syncSource).not.toContain('sizeIdentity.conversationRef');
    expect(syncSource).not.toContain('sizeIdentity.turnRef');
    expect(syncSource).not.toContain('sizeIdentity.staleGuardRef');
    expect(syncSource).not.toContain('overlayWindowGuardRef.current.conversationRef');
    expect(syncSource).not.toContain('overlayWindowGuardRef.current.turnRef');
    expect(syncSource).not.toContain('overlayWindowGuardRef.current.staleGuardRef');
    expect(syncSource).not.toContain('lastOverlayGuardRef');
    expect(syncSource).toContain('buildResponseOverlayWindowLifecycleTraceValues');
    expect(syncSource).toContain('buildResponseOverlayWindowSizeTraceValues');
    expect(syncSource).toContain('buildResponseOverlayWindowSizeValues');
    expect(syncSource).toContain('resolveResponseOverlayWindowGuardSnapshot');
    expect(syncSource).toContain('resolveResponseOverlayWindowSizeIdentity');
    expect(syncSource).not.toContain('payload?.visible');
    expect(syncSource).not.toContain('payload.visible');
    expect(syncSource).toContain('setResponseboxSizeValues');
    expect(syncSource).not.toContain('setResponseboxSize({');
    expect(overlaySource).not.toContain('currentTurnProjection');
    expect(overlaySource).not.toContain('resolveConversationToolSchemas(messages)');
    expect(overlaySource).not.toContain('messageCount: messages.length');
    expect(overlaySource).not.toContain('messages.length,');
    expect(overlaySource).toContain('resolveConversationToolSchemas(responseOverlayEntries)');
    expect(viewModelSource).toContain('resolveResponseOverlaySurfaceState');
    expect(viewModelSource).toContain('resolveResponseOverlayPresentationStateForSurfaceState');
    expect(viewModelSource).toContain('responseOverlaySurfaceState');
    expect(viewModelSource).not.toContain('surfacePresentationInput');
    expect(viewModelSource).not.toContain('const liveTurnPresentationInput');
    expect(viewModelSource).not.toContain('DesktopLiveTurnSurfaceRuntime');
    expect(viewModelSource).not.toContain('DesktopVisibleTurnLifecycleRuntime');
    expect(viewModelSource).not.toContain('resolveVisibleTurnLifecycle');
    expect(viewModelSource).not.toContain('resolveLiveTurnPresentationInput');
    expect(viewModelSource).not.toContain('...traceState');
    expect(viewModelSource).not.toContain('conversationView = null');
    expect(responseViewRuntimeSource).not.toContain('traceState');
    expect(responseViewRuntimeSource).not.toContain('projectionInput');
    expect(responseViewRuntimeSource).toContain('DesktopConversationViewWorkspaceRuntime');
    expect(responseViewRuntimeSource).toContain('hasWorkspaceConversationView({ conversationView })');
    expect(responseViewRuntimeSource).not.toContain('desktopConversationRuntimeContracts');
    expect(responseViewRuntimeSource).not.toContain('as ConversationView');
    expect(responseViewRuntimeSource).toContain('function conversationViewLiveTurnRef(conversationView: unknown)');
    expect(responseViewRuntimeSource).not.toContain('function isConversationView');
    expect(responseViewRuntimeSource).toContain('buildConversationViewTurnChatMessages');
    expect(responseViewRuntimeSource).not.toContain('buildChatMessagesFromSdkDisplayRows');
    expect(responseViewRuntimeSource).not.toContain('view.displayRows');
    expect(responseViewRuntimeSource).not.toContain('toolMetadata');
    expect(responseViewRuntimeSource).toContain('function exactIdentityString');
    expect(responseViewRuntimeSource).toContain('function exactToolIdentityField');
    expect(responseViewRuntimeSource).toContain('exactIdentityString(message.correlationId)');
    expect(responseViewRuntimeSource).toContain('exactUnknownIdentityString(overlayIntent?.turnRef)');
    expect(responseViewRuntimeSource).toContain('exactUnknownIdentityString(liveTurn.turnRef)');
    expect(responseViewRuntimeSource).toContain('exactUnknownIdentityString(responseOverlay.turnRef)');
    expect(responseViewRuntimeSource).toContain('turnRef: exactIdentityString(sizeIdentity?.turnRef)');
    expect(responseViewRuntimeSource).toContain('guardRef: exactIdentityString(dismissalTarget.guardRef)');
    expect(responseViewRuntimeSource).not.toContain('turnRef: normalizeString(dismissalTarget.turnRef)');
    expect(responseViewRuntimeSource).not.toContain('guardRef: normalizeString(dismissalTarget.guardRef)');
    expect(responseViewRuntimeSource).not.toContain('function stringField');
    expect(responseViewRuntimeSource).not.toContain('normalizeString(message.correlationId)');
    expect(responseViewRuntimeSource).not.toContain('normalizeUnknownString(liveTurn.turnRef)');
    expect(responseViewRuntimeSource).not.toContain('normalizeUnknownString(responseOverlay.turnRef)');
    expect(responseViewRuntimeSource).not.toContain('normalizeUnknownString(overlayIntent?.turnRef)');
    expect(responseViewRuntimeSource).not.toContain('turnRef: normalizeString(sizeIdentity?.turnRef)');
    expect(responseViewRuntimeSource).not.toContain('turnRef: normalizeString(guardSnapshot?.turnRef)');
    expect(responseViewRuntimeSource).toContain('const messages = conversationView');
    expect(responseViewRuntimeSource).toContain('const sdkLiveTurn = conversationView ? null : surfaceState.sdkLiveTurn ?? null;');
    expect(responseViewRuntimeSource).toContain('function isNoViewSdkLiveTurnResponseSource(source: unknown)');
    expect(responseViewRuntimeSource).toContain('if (!isNoViewSdkLiveTurnResponseSource(liveTurnPresentationInput.source))');
    expect(responseViewRuntimeSource).toContain('sdkLiveTurn: isNoViewSdkLiveTurnResponseSource(liveTurnPresentationInput.source)');
    expect(viewModelSource).not.toContain('currentTurnProjection');
    expect(viewModelSource).not.toContain('currentTurnProjection = null');
    expect(viewModelSource).not.toContain('pendingTurn = null');
    expect(viewModelSource).not.toContain('effectiveCurrentTurnProjection');
    expect(viewModelSource).toContain('buildDismissResponseOverlayAction');
    expect(viewModelSource).toContain('hideDismissedResponsebox');
    expect(viewModelSource).not.toContain('dismissalTarget.turnRef');
    expect(viewModelSource).not.toContain('dismissalTarget.guardRef');
    expect(viewModelSource).not.toContain('setResponseboxSizeValues');
    expect(viewModelSource).not.toContain('setResponseboxSize({');
    expect(clientSource).toContain('function normalizeResponseOverlayVisibilityPayload');
    expect(clientSource).not.toContain('export function normalizeResponseOverlayVisibilityPayload');
    expect(clientSource).toContain('function buildResponseboxSizePayload');
    expect(clientSource).not.toContain('export function buildResponseboxSizePayload');
    expect(clientSource).toContain('function buildResponseboxHitTestPayload');
    expect(clientSource).not.toContain('export function buildResponseboxHitTestPayload');
    expect(clientSource).toContain('normalizeResponseOverlayVisibilityPayload(payload).visible');
    expect(traceRuntimeSource).toContain('buildRendererResponseSurfaceSizeTracePayload');
    expect(traceRuntimeSource).toContain('buildRendererResponseSurfaceSizeLiveTracePayload');
    expect(traceRuntimeSource).toContain('logRendererResponseSurfaceSizeTrace');
    expect(traceRuntimeSource).toContain('logRendererResponseOverlayLifecycleTrace');
    expect(traceRuntimeSource).toContain(
      'phase: traceString(values.currentTurnPhase) || null',
    );
    expect(
      traceRuntimeSource.match(/const currentTurnProjection = values\.currentTurnProjection;/g) || [],
    ).toHaveLength(0);
    expect(traceRuntimeSource).not.toContain('values.currentTurnProjection');
    expect(traceRuntimeSource).not.toContain('projectionTurnRef');
    expect(layoutRuntimeSource).toContain('getRoundedFrameSize');
    expect(layoutRuntimeSource).toContain('getResponseOverlayAwaitingFrameHeight');
    expect(layoutRuntimeSource).toContain('getResponseOverlayFixedHeight');
    expect(layoutRuntimeSource).toContain('getHiddenResponseOverlayLayoutMode');
    expect(layoutRuntimeSource).toContain('isVisibleResponseOverlayLayoutMode');
    expect(layoutRuntimeSource).not.toContain('isAwaitingResponseOverlayLayoutMode');
    expect(layoutRuntimeSource).toContain('DesktopResponseOverlayLayoutRuntime');
    expect(layoutRuntimeSource).not.toContain('export function resolveResponseOverlayLayoutMode');
    expect(layoutRuntimeSource).not.toContain('export function isCompactHoverLayoutMode');
    expect(layoutRuntimeSource).not.toContain('export function isVisibleResponseOverlayLayoutMode');
    expect(layoutRuntimeSource).not.toContain('export function isAwaitingResponseOverlayLayoutMode');
    expect(layoutRuntimeSource).not.toContain('export function getHiddenResponseOverlayLayoutMode');
    expect(layoutRuntimeSource).not.toContain('export function getResponseOverlayAwaitingFrameHeight');
    expect(layoutRuntimeSource).not.toContain('export function getResponseOverlayFixedHeight');
    expect(layoutRuntimeSource).not.toContain('export function resolveResponseOverlayNativeMode');
    expect(layoutRuntimeSource).not.toContain('export function getRoundedFrameSize');
    expect(layoutRuntimeSource).not.toContain('export const RESPONSE_OVERLAY_LAYOUT_MODE');
    expect(layoutRuntimeSource).not.toContain('export const RESPONSE_OVERLAY_LAYOUT');
    expect(interactionRuntimeSource).toContain('DesktopResponseOverlayInteractionRuntime');
    expect(interactionRuntimeSource).toContain('addEventListener');
    expect(interactionRuntimeSource).toContain('removeEventListener');
    expect(interactionRuntimeSource).toContain('getBoundingClientRect');
    expect(interactionRuntimeSource).not.toContain('features/chat');
    expect(interactionRuntimeSource).not.toContain('features/minimalChatPill');
    expect(overlaySource).not.toContain('RESPONSE_OVERLAY_LAYOUT');
    expect(syncSource).not.toContain('RESPONSE_OVERLAY_LAYOUT_MODE');
    expect(syncSource).not.toContain('RESPONSE_OVERLAY_LAYOUT');
    expect(overlaySource).toContain('desktopResponseOverlayInteractionRuntime');
    expect(overlaySource).toContain(
      'DesktopResponseOverlayInteractionRuntime.subscribeToResponseboxHitTestEvents',
    );
    expect(overlaySource).not.toContain('window.addEventListener');
    expect(overlaySource).not.toContain('window.removeEventListener');
    expect(overlaySource).not.toContain('getBoundingClientRect');
    expect(overlaySource).toContain('DesktopResponseOverlayRuntimeClient.setResponseboxHitTestActiveValue');
    expect(overlaySource).not.toContain('setResponseboxHitTestActive({');
    expect(syncSource).toContain('DesktopResponseOverlayRuntimeClient.setResponseboxSize');
    expect(syncSource).toContain('DesktopResponseOverlayRuntimeClient.onResponseOverlayVisibility');
    expect(viewModelSource).toContain('DesktopResponseOverlayRuntimeClient.hideDismissedResponsebox');
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
    expect(controlSource).toContain('DesktopBrowserSessionRuntimeClient.useDesktopBrowserSessionControl');
    expect(controlSource).not.toContain('import { useDesktopBrowserSessionControl');
    expect(controlSource).toContain('presentation.');
    expect(controlSource).toContain('switchBrowserTabByStep');
    expect(controlSource).not.toContain('tabs.findIndex');
    expect(controlSource).not.toContain('tabs.length');
    expect(controlSource).not.toContain('currentTargetId');
    expect(controlSource).not.toContain('currentTabLabel');
    expect(browserClientSource).toContain('browserSessionStore');
    expect(browserClientSource).toContain('DesktopBrowserSessionRuntimeClient');
    expect(browserClientSource).not.toContain('export function useDesktopBrowserSessionControl');
    expect(browserClientSource).toContain('resolveBrowserSessionControlPresentation');
    expect(browserClientSource).toContain('resolveBrowserSessionCarouselTargetId');
    expect(browserClientSource).not.toContain('export function resolveBrowserSessionControlPresentation');
    expect(browserClientSource).not.toContain('export function resolveBrowserSessionCarouselTargetId');
    const browserSessionStoreSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/infrastructure/runtime/browserSessionStore.js'),
      'utf8',
    );
    expect(browserSessionStoreSource).toContain('app/runtime/desktopConversationRuntimeContracts');
    expect(browserSessionStoreSource).not.toContain('runtime/SdkRuntimeCommands');
    expect(browserSessionStoreSource).not.toContain('api/agentSdkClient');
    await expect(fs.stat(
      path.resolve(__dirname, '../../frontend/src/renderer/infrastructure/hooks/useBrowserSessionControl.js'),
    )).rejects.toThrow();
  });

  test('chat feature outside-dismiss UI bindings use app runtime browser adapter', async () => {
    const browserControlSource = await fs.readFile(
      path.join(chatRoot, 'components/ChatBrowserSessionControl.jsx'),
      'utf8',
    );
    const messageInputBindingsSource = await fs.readFile(
      path.join(chatRoot, 'hooks/useMessageInputUiBindings.js'),
      'utf8',
    );
    const dismissRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopDismissOnOutsideRuntime.js'),
      'utf8',
    );

    for (const source of [browserControlSource, messageInputBindingsSource]) {
      expect(source).toContain('DesktopDismissOnOutsideRuntime.subscribeToDismissOnOutside');
      expect(source).not.toContain('window.addEventListener');
      expect(source).not.toContain('window.removeEventListener');
    }
    expect(dismissRuntimeSource).toContain('addEventListener');
    expect(dismissRuntimeSource).toContain('removeEventListener');
    expect(dismissRuntimeSource).not.toContain('features/chat');
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
    const modelCardPresentationRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopModelCardPresentationRuntime.js'),
      'utf8',
    );
    const providerCredentialRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopProviderCredentialRuntime.js'),
      'utf8',
    );
    const apiKeysSectionSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/features/dashboard/components/sections/ApiKeysSection.jsx'),
      'utf8',
    );
    const configStorageSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopRendererConfigStorageRuntime.js'),
      'utf8',
    );

    expect(chatModelOptionsSource).toContain('desktopModelSelectionRuntime');
    expect(chatModelOptionsSource).toContain('DesktopModelSelectionRuntime');
    expect(chatModelOptionsSource).toContain('desktopRuntimeConfig');
    expect(chatModelOptionsSource).toContain('DesktopChatModelOptionsRuntime');
    expect(chatModelOptionsSource).not.toContain('export const getAvailableModelPool = getCurrentModels');
    expect(chatModelOptionsSource).not.toContain('export function formatProviderLabel');
    expect(chatModelOptionsSource).not.toContain('export function getAvailableModelPool');
    expect(chatModelOptionsSource).not.toContain('export function buildChatModelOptions');
    expect(chatModelOptionsSource).not.toContain('export function buildChatProviderOptions');
    expect(chatModelOptionsSource).not.toContain('export function resolveProviderModels');
    expect(chatModelOptionsSource).not.toContain('export function resolveSelectedModelOption');
    expect(chatModelOptionsSource).not.toContain('export function resolveSelectedReasoningMode');
    expect(chatModelOptionsSource).not.toContain('export function resolveModelIdForReasoningMode');
    expect(chatModelOptionsSource).not.toContain('features/chat');
    expect(chatModelOptionsSource).not.toContain('dashboard/utils/modelSelectionUtils');
    expect(chatInterfaceSource).toContain('desktopChatModelOptionsRuntime');
    expect(chatInterfaceSource).toContain('DesktopChatModelOptionsRuntime');
    expect(headerControlsSource).toContain('desktopChatModelOptionsRuntime');
    expect(headerControlsSource).toContain('DesktopChatModelOptionsRuntime');
    expect(modelsSectionSource).toContain('desktopModelSelectionRuntime');
    expect(modelsSectionSource).toContain('DesktopModelSelectionRuntime');
    expect(modelsSectionSource).toContain('scheduleModelResetWarningClear');
    expect(modelsSectionSource).toContain('clearModelResetWarningTimer');
    expect(modelsSectionSource).not.toContain('setTimeout(');
    expect(modelsSectionSource).not.toContain('clearTimeout(');
    expect(modelsSectionSource).toContain('desktopModelCardPresentationRuntime');
    expect(modelsSectionSource).toContain('DesktopModelCardPresentationRuntime');
    expect(modelsSectionSource).toContain('desktopProviderCredentialRuntime');
    expect(apiKeysSectionSource).toContain('desktopProviderCredentialRuntime');
    expect(modelRuntimeSource).toContain('DesktopModelSelectionRuntime');
    expect(modelRuntimeSource).toContain('scheduleModelResetWarningClear');
    expect(modelRuntimeSource).toContain('clearModelResetWarningTimer');
    expect(modelRuntimeSource).toContain('setTimeout');
    expect(modelRuntimeSource).toContain('clearTimeout');
    expect(modelRuntimeSource).not.toContain('export function getCurrentModels');
    expect(modelRuntimeSource).not.toContain('export function buildModelConfigUpdate');
    expect(modelRuntimeSource).not.toContain('export function evaluateModelSelection');
    expect(modelRuntimeSource).not.toContain('export function getFallbackModelSelection');
    expect(modelRuntimeSource).not.toContain('export function scheduleModelResetWarningClear');
    expect(modelRuntimeSource).not.toContain('export function clearModelResetWarningTimer');
    expect(modelCardPresentationRuntimeSource).toContain('desktopRuntimeConfig');
    expect(modelCardPresentationRuntimeSource).toContain('DesktopModelCardPresentationRuntime');
    expect(modelCardPresentationRuntimeSource).not.toContain('export function toModelCard');
    expect(modelCardPresentationRuntimeSource).not.toContain('export function normalizeProviderLabel');
    expect(modelCardPresentationRuntimeSource).not.toContain('export function toProviderCards');
    expect(modelCardPresentationRuntimeSource).not.toContain('features/dashboard');
    expect(providerCredentialRuntimeSource).toContain('desktopRuntimeConfig');
    expect(providerCredentialRuntimeSource).toContain('DesktopProviderCredentialRuntime');
    expect(providerCredentialRuntimeSource).toContain('normalizeProviderApiKeys');
    expect(providerCredentialRuntimeSource).not.toContain('export function getProviderApiKeySpecs');
    expect(providerCredentialRuntimeSource).not.toContain('export function normalizeProviderApiKeys');
    expect(providerCredentialRuntimeSource).not.toContain('export function stripProviderApiKeySecrets');
    expect(providerCredentialRuntimeSource).not.toContain('features/dashboard');
    expect(configStorageSource).toContain('desktopProviderCredentialRuntime');
    await expect(fs.stat(
      path.resolve(__dirname, '../../frontend/src/renderer/features/dashboard/utils/modelSelectionUtils.js'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.resolve(__dirname, '../../frontend/src/renderer/features/dashboard/components/sections/modelCardData.js'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.resolve(__dirname, '../../frontend/src/renderer/features/dashboard/components/sections/providerApiKeys.js'),
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
    expect(streamSource).toContain('DesktopModelThinkingRuntime');
    expect(streamSource).not.toContain('import { resolveThinkingCapabilities }');
    expect(streamSource).not.toContain('utils/modelThinkingCapabilities');
    expect(modelThinkingRuntimeSource).toContain('export const DesktopModelThinkingRuntime = Object.freeze');
    expect(modelThinkingRuntimeSource).not.toContain('export function resolveThinkingCapabilities');
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
    expect(newChatSessionSource).toContain('DesktopNewChatSessionRuntime');
    expect(newChatSessionSource).not.toContain('export const startNewChatSession');
    expect(newChatSessionSource).not.toContain('features/chat');
    expect(activeSessionRuntimeSource).toContain('DesktopActiveChatSessionRuntime');
    expect(activeSessionRuntimeSource).toContain('DesktopConversationSessionRuntime');
    expect(activeSessionRuntimeSource).toContain('resetActiveChatSession');
    expect(activeSessionRuntimeSource).not.toContain('export const resetActiveChatSession');
    expect(activeSessionRuntimeSource).toContain('applyRendererConversationSelection');
    expect(activeSessionRuntimeSource).toContain('DesktopTranscriptSessionRuntimeClient.updateTranscriptSession');
    expect(activeSessionRuntimeSource).toContain('function readExactConversationRef');
    expect(activeSessionRuntimeSource).toContain('const targetConversationRef = readExactConversationRef(conversationRef)');
    expect(activeSessionRuntimeSource).not.toContain('const targetConversationRef = conversationRef || null');
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
    const toolDetailProjectionSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopSdkToolDetailProjection.ts'),
      'utf8',
    );

    expect(source).toContain('toolCallDetails');
    expect(source).toContain('toolOutputDetails');
    expect(source).toContain('sanitizeSdkToolDetailRecord');
    expect(source).not.toContain('DesktopChatMessageRuntimeClient');
    expect(source).not.toContain('buildToolCallChatMessageState');
    expect(source).not.toContain('buildToolOutputChatMessageState');
    expect(source).not.toContain('toolName ? { toolName }');
    expect(source).not.toContain('const displayToolCallDetails = sanitizeSdkToolDetailRecord(toolCallDetails);');
    expect(source).not.toContain('const displayToolOutputDetails = sanitizeSdkToolDetailRecord(toolOutputDetails);');
    expect(source).not.toContain('toolCallDetails: displayToolCallDetails');
    expect(source).not.toContain('toolOutputDetails: displayToolOutputDetails');
    expect(source).toContain('const toolCallDetails = sanitizeSdkToolDetailRecord(asRecord(entry.toolCallDetails));');
    expect(source).toContain('const toolOutputDetails = sanitizeSdkToolDetailRecord(asRecord(entry.toolOutputDetails));');
    expect(source).toContain('...(toolOutputDetails ? { toolOutputDetails } : {})');
    expect(source).not.toContain('toolOutputDetails,');
    expect(source).not.toContain('toolMetadata: sanitizeSdkToolDetailRecord(asRecord(entry.toolMetadata))');
    expect(source).not.toContain('const toolMetadata = sanitizeSdkToolDetailRecord(asRecord(entry.toolMetadata));');
    expect(source).not.toContain('entry.toolMetadata');
    expect(source).not.toContain('toolMetadata: entry.toolMetadata || null');
    expect(source).not.toContain('toolMetadata: asRecord(entry.toolMetadata)');
    expect(source).toContain('function readExactSdkString(value)');
    expect(source).toContain('value.length > 0');
    expect(source).toContain('value === value.trim()');
    expect(source).toContain('const LIVE_PRESENTATION_ENTRY_TYPES = new Set');
    expect(source).toContain('LIVE_PRESENTATION_ENTRY_TYPES.has(type)');
    expect(source).toContain('return type && LIVE_PRESENTATION_ENTRY_TYPES.has(type)');
    expect(source).toContain('return null;');
    expect(source).not.toContain("type === 'tool-call' || type === 'tool-explanation'");
    expect(source).not.toContain("type === 'tool-progress' || type === 'search-source'");
    expect(source).toContain('!readExactSdkString(entry.id)');
    expect(source).not.toContain("typeof entry.id !== 'string'");
    expect(source).not.toContain("return typeof value === 'string' && value.trim() ? value.trim() : 'llm-text';");
    expect(source).not.toContain('sourceEventType: entry.sourceEventType || null');
    expect(source).not.toContain("thinkingSourceEventType: entry.sourceEventType || 'reasoning_delta'");
    expect(source).not.toContain("sourceEventType: entry.sourceEventType || 'tool_output'");
    expect(source).not.toContain('thinkingText: hasReasoning ? reasoningText : null');
    expect(source).toContain('...(hasReasoning ? { thinkingText: reasoningText } : {})');
    expect(source).not.toContain("|| 'reasoning_delta'");
    expect(source).not.toContain("|| 'tool_output'");
    expect(source).not.toContain('sourceEventType: readExactSdkString(entry.sourceEventType)');
    expect(source).toContain('function exactSdkStringProp(key, value)');
    expect(source).toContain("...exactSdkStringProp('sourceEventType', entry.sourceEventType)");
    expect(source).toContain("...(thinkingSourceEventType ? { thinkingSourceEventType } : {})");
    expect(source).toContain('...buildBaseMessageFields(entry, liveTurnContext)');
    expect(source).toContain("...exactSdkStringProp('turnRef', liveTurnContext?.turnRef)");
    expect(source).toContain("...exactSdkStringProp('modelId', entry.modelId)");
    expect(source).toContain("...exactSdkStringProp('modelProvider', entry.modelProvider)");
    expect(source).not.toContain('turnRef: readExactSdkString(liveTurnContext?.turnRef) || undefined');
    expect(source).not.toContain('modelId: readExactSdkString(entry.modelId)');
    expect(source).not.toContain('modelProvider: readExactSdkString(entry.modelProvider)');
    expect(source).not.toContain('const modelId = readExactSdkString(entry.modelId);');
    expect(source).not.toContain('const modelProvider = readExactSdkString(entry.modelProvider);');
    expect(source).not.toContain('modelId: entry.modelId || null');
    expect(source).not.toContain('modelProvider: entry.modelProvider || null');
    expect(source).not.toContain('...(entry.modelId ? { modelId: entry.modelId } : {})');
    expect(source).not.toContain('...(entry.modelProvider ? { modelProvider: entry.modelProvider } : {})');
    expect(source).toContain('readExactSdkString(message.sourceEventType)');
    expect(source).not.toContain('normalizeOptionalText(message.sourceEventType)');
    expect(source).not.toContain('sourceChannel: entry.sourceChannel || sdkCurrentTurnSourceChannel');
    expect(source).toContain('sourceChannel: liveTurnContext?.sourceChannel || sdkCurrentTurnSourceChannel');
    expect(source).not.toContain('turnRef: entry.turnRef || liveTurnContext?.turnRef || undefined');
    expect(source).not.toContain('turnRef: entry.turnRef || liveTurnContext?.turnRef || null');
    expect(source).not.toContain('readExactSdkString(entry.turnRef)');
    expect(source).not.toContain('toolEvents');
    expect(source).not.toContain('resolveLegacyToolEventKind');
    expect(source).not.toContain('LEGACY_TOOL_EVENT_KINDS');
    expect(source).not.toContain('id: toolEvent.id || index');
    expect(source).not.toContain('const turnRef = readExactSdkString(liveTurnContext?.turnRef);');
    expect(source).toContain("...exactSdkStringProp('turnRef', liveTurnContext?.turnRef)");
    expect(source).toContain('conversationRef: readExactSdkString(conversationView?.conversationRef)');
    expect(source).toContain('turnRef: readExactSdkString(conversationView?.liveTurn?.turnRef)');
    expect(source).not.toContain('conversationRef: conversationView?.conversationRef || null');
    expect(source).not.toContain('turnRef: conversationView?.liveTurn?.turnRef || null');
    expect(source).not.toContain('const displayToolDetails = sanitizeSdkToolDetailRecord(toolDetails);');
    expect(source).toContain('buildLegacyNoPresentationCurrentTurnMessages');
    expect(source).toContain('buildNoViewSdkLiveTurnMessages');
    expect(source).toContain('buildSdkLiveTurnMessages');
    expect(source).toContain('const noViewConversationRef = readExactSdkString(sdkLiveTurn?.conversationRef);');
    expect(source).toContain('const noViewTurnRef = readExactSdkString(sdkLiveTurn?.turnRef);');
    expect(source).toContain('if (!noViewConversationRef || !noViewTurnRef) {');
    expect(source).not.toContain('resolveNoViewSdkLiveTurnThinkingText');
    expect(source).not.toContain('  buildLegacyNoPresentationCurrentTurnMessages,');
    expect(source).not.toContain('buildCurrentTurnMessagesFromProjection');
    expect(source).not.toContain('|| entry.id');
    expect(source).not.toContain('entry.structuredPayload');
    expect(source).not.toContain('entry.payload');
    expect(source).not.toContain('buildToolCallMessageState');
    expect(source).not.toContain('buildToolBundleMessageState');
    expect(source).not.toContain('entry.toolArguments');
    expect(source).not.toContain('rawToolCallPreview');
    expect(source).not.toContain('rawArgumentsPreview');
    expect(source).not.toContain('parseError');
    expect(source).not.toContain('toolCallValidationFailed');
    expect(source).not.toContain('modelFacingToolCall: toolCallState');
    expect(source).not.toContain('modelFacingToolCall');
    expect(source).not.toContain('screenshotRef');
    expect(source).not.toContain('screenshotUrl');
    expect(toolDetailProjectionSource).toContain('sdkToolDetailDisplayStringKeys');
    expect(toolDetailProjectionSource).toContain("'toolName'");
    expect(toolDetailProjectionSource).toContain("'requestId'");
    expect(toolDetailProjectionSource).not.toContain('screenshotRef');
    expect(toolDetailProjectionSource).not.toContain('screenshot_ref');
    expect(toolDetailProjectionSource).not.toContain('modelFacingToolCall');
    expect(toolDetailProjectionSource).not.toContain('Object.entries(record)');
    expect(toolDetailProjectionSource).toContain('sanitizeSdkToolDetailRecord');
  });

  test('current-turn no-view fallback does not read raw tool events or backend-shaped payload details', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopCurrentTurnMessageRuntime.js'),
      'utf8',
    );

    expect(source).toContain('toolCallDetails');
    expect(source).toContain('toolOutputDetails');
    expect(source).toContain('buildLegacyNoPresentationCurrentTurnMessages');
    expect(source).toContain('buildNoViewSdkLiveTurnMessages');
    expect(source).not.toContain('toolEvents');
    expect(source).not.toContain('resolveNoViewSdkLiveTurnThinkingText');
    expect(source).not.toContain('  buildLegacyNoPresentationCurrentTurnMessages,');
    expect(source).not.toContain('formatProjectedToolOutputText');
    expect(source).not.toContain('stepResults');
    expect(source).not.toContain('step_results');
    expect(source).not.toContain('payload.output');
    expect(source).not.toContain('payload.error');
    expect(source).not.toContain('buildCurrentTurnMessagesFromProjection');
    expect(source).not.toContain('buildToolCallMessageState');
    expect(source).not.toContain('buildToolBundleMessageState');
    expect(source).not.toContain('toolEvent.toolArguments');
    expect(source).not.toContain('rawToolCallPreview');
    expect(source).not.toContain('rawArgumentsPreview');
    expect(source).not.toContain('parseError');
    expect(source).not.toContain('toolCallValidationFailed');
    expect(source).not.toContain('toolEvent.payload');
    expect(source).not.toContain('modelFacingToolCall: toolCallState');
    expect(source).not.toContain('modelFacingToolCall');
    expect(source).not.toContain('structuredPayload');
  });

  test('display-row chat projection consumes SDK source event metadata', async () => {
    const projectionRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopSdkDisplayChatMessageProjectionRuntime.ts'),
      'utf8',
    );
    const chatInterfaceSource = await fs.readFile(
      path.join(chatRoot, 'components/ChatInterface.jsx'),
      'utf8',
    );
    const chatStoreSource = await fs.readFile(
      path.join(chatRoot, 'stores/chatStore.ts'),
      'utf8',
    );
    const chatStoreAdaptersSource = await fs.readFile(
      path.join(chatRoot, 'stores/chatStoreAdapters.ts'),
      'utf8',
    );
    const chatWorkspaceStateRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatWorkspaceStateRuntime.ts'),
      'utf8',
    );
    const pendingBridgeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopPendingTurnBridgeRuntime.js'),
      'utf8',
    );
    const pendingStateRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatPendingTurnStateRuntime.ts'),
      'utf8',
    );
    const clearMessagesRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatClearMessagesRuntime.ts'),
      'utf8',
    );
    const trackingRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatStreamTrackingRuntime.ts'),
      'utf8',
    );
    const workspaceMessageRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatWorkspaceMessageRuntime.ts'),
      'utf8',
    );
    const workspaceFieldRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatWorkspaceFieldRuntime.ts'),
      'utf8',
    );
    const stopTurnRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopStopTurnRuntime.js'),
      'utf8',
    );
    const turnConversationRefRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatTurnConversationRefRuntime.ts'),
      'utf8',
    );
    const currentTurnWorkspaceRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopCurrentTurnWorkspaceRuntime.ts'),
      'utf8',
    );
    const conversationViewWorkspaceRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopConversationViewWorkspaceRuntime.ts'),
      'utf8',
    );
    const displayAttachmentProjectionSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopSdkDisplayAttachmentProjection.ts'),
      'utf8',
    );
    const attachmentRegistrySource = await fs.readFile(
      path.join(chatRoot, 'components/message/content/AttachmentRendererRegistry.jsx'),
      'utf8',
    );
    const currentTurnMessageRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopCurrentTurnMessageRuntime.js'),
      'utf8',
    );
    const threadPresentationRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopThreadPresentationRuntime.js'),
      'utf8',
    );
    const chatInterfacePresentationRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatInterfacePresentationRuntime.js'),
      'utf8',
    );
    const chatInterfaceSelectorRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatInterfaceSelectorRuntime.ts'),
      'utf8',
    );
    const chatSurfaceSelectorRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatSurfaceSelectorRuntime.ts'),
      'utf8',
    );
    const chatRevisionActionRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatRevisionActionRuntime.js'),
      'utf8',
    );
    const chatWorkspaceMessageRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopChatWorkspaceMessageRuntime.ts'),
      'utf8',
    );
    const conversationDisplayProjectionSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopConversationDisplayProjection.ts'),
      'utf8',
    );
    const conversationDisplayRowLookupSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopConversationDisplayRowLookupRuntime.ts'),
      'utf8',
    );
    const visibleLifecycleRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopVisibleTurnLifecycleRuntime.js'),
      'utf8',
    );
    const messageActionRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/renderer/app/runtime/desktopMessageActionRuntime.js'),
      'utf8',
    );
    const messageListSource = await fs.readFile(
      path.join(chatRoot, 'components/MessageList.jsx'),
      'utf8',
    );
    const messageItemSource = await fs.readFile(
      path.join(chatRoot, 'components/message/MessageItem.jsx'),
      'utf8',
    );
    const assistantMessageActionsSource = await fs.readFile(
      path.join(chatRoot, 'components/message/AssistantMessageActions.jsx'),
      'utf8',
    );
    const userMessageActionsSource = await fs.readFile(
      path.join(chatRoot, 'components/message/UserMessageActions.jsx'),
      'utf8',
    );
    const sourceChannelPath = path.join(chatRoot, 'utils/message/sourceChannels.js');

    expect(projectionRuntimeSource).toContain('sourceEventType');
    expect(projectionRuntimeSource).toContain('function rowSourceEventType(row: SdkDisplayRow): string | null');
    expect(projectionRuntimeSource).toContain('return exactNonEmptyString(row.metadata?.sourceEventType);');
    expect(projectionRuntimeSource).toContain('function rowSourceEventTypeProp(row: SdkDisplayRow)');
    expect(projectionRuntimeSource).toContain('return sourceEventType ? { sourceEventType } : {};');
    expect(projectionRuntimeSource).not.toContain('return row.type;');
    expect(projectionRuntimeSource).not.toContain('sourceEventType: rowSourceEventType(row)');
    expect(projectionRuntimeSource).toContain('withRowActions');
    expect(projectionRuntimeSource).toContain('function rowReplayActions(row: SdkDisplayRow)');
    expect(projectionRuntimeSource).toContain('const actions = rowReplayActions(row);');
    expect(projectionRuntimeSource).toContain('SDK_DISPLAY_ROW_ROLES');
    expect(projectionRuntimeSource).toContain('SDK_DISPLAY_ROW_TYPES');
    expect(projectionRuntimeSource).toContain('function readExactDisplayRowRole(value: unknown)');
    expect(projectionRuntimeSource).toContain('function readExactDisplayRowType(value: unknown)');
    expect(projectionRuntimeSource).toContain('function resolveDisplayRowKind(row: SdkDisplayRow)');
    expect(projectionRuntimeSource).toContain('const role = readExactDisplayRowRole(row.role);');
    expect(projectionRuntimeSource).toContain('const type = readExactDisplayRowType(row.type);');
    expect(projectionRuntimeSource).toContain("if (role === 'assistant' && (type === 'tool_call' || type === 'tool_bundle_call'))");
    expect(projectionRuntimeSource).toContain("if (role === 'tool' && (type === 'tool_output' || type === 'tool_bundle_output'))");
    const actionProjectionSource = projectionRuntimeSource.slice(
      projectionRuntimeSource.indexOf('function rowReplayActions'),
      projectionRuntimeSource.indexOf('function withRowActions'),
    );
    expect(actionProjectionSource).toContain('actionRecord.canEdit === true && editTargetRowId');
    expect(actionProjectionSource).toContain('actionRecord.canRetry === true && retryTargetRowId');
    expect(actionProjectionSource).not.toContain("rowKind === 'user' && actionRecord.canEdit");
    expect(actionProjectionSource).not.toContain("rowKind === 'assistant' && actionRecord.canRetry");
    expect(actionProjectionSource).not.toContain('resolveDisplayRowKind(row)');
    expect(projectionRuntimeSource).not.toContain('function isUserDisplayRow(row: SdkDisplayRow)');
    expect(projectionRuntimeSource).not.toContain("return row.type === 'user_message' && row.role === 'user';");
    expect(projectionRuntimeSource).not.toContain('function isAssistantDisplayRow(row: SdkDisplayRow)');
    expect(projectionRuntimeSource).not.toContain("return row.type === 'assistant_message' && row.role === 'assistant';");
    expect(projectionRuntimeSource).not.toContain('actions: row.actions');
    expect(projectionRuntimeSource).toContain('DesktopSdkDisplayChatMessageProjectionRuntime');
    expect(projectionRuntimeSource).not.toContain('optionalTrimmedString');
    expect(projectionRuntimeSource).not.toContain('editTargetRowId: row.actions');
    expect(projectionRuntimeSource).not.toContain('retryTargetRowId: row.actions');
    expect(projectionRuntimeSource).toContain('desktopChatMessageTypes');
    expect(projectionRuntimeSource).toContain('desktopPresentationSourceChannels');
    expect(projectionRuntimeSource).toContain('desktopSdkDisplayAttachmentProjection');
    expect(projectionRuntimeSource).toContain('desktopSdkToolDetailProjection');
    expect(projectionRuntimeSource).not.toContain('assistantTextChatMessageState');
    expect(projectionRuntimeSource).not.toContain('toolCallChatMessageState');
    expect(projectionRuntimeSource).not.toContain('toolOutputChatMessageState');
    expect(projectionRuntimeSource).toContain('sanitizeSdkToolDetailRecord(row.metadata?.toolCallDetails)');
    expect(projectionRuntimeSource).toContain('sanitizeSdkToolDetailRecord(row.metadata?.toolOutputDetails)');
    expect(projectionRuntimeSource).not.toContain('DisplayMessage');
    expect(projectionRuntimeSource).not.toContain('displayMessageFromSdkDisplayRow');
    expect(projectionRuntimeSource).not.toContain('function displayAttachmentsFromPayload');
    expect(projectionRuntimeSource).not.toContain('screenshot_refs');
    expect(projectionRuntimeSource).not.toContain('structuredPayload');
    expect(projectionRuntimeSource).not.toContain('recordPayloadFromRow');
    expect(projectionRuntimeSource).not.toContain('recordField');
    expect(projectionRuntimeSource).not.toContain('copyKeys');
    expect(projectionRuntimeSource).not.toContain('JSON.stringify');
    expect(projectionRuntimeSource).not.toContain('modelFacingToolCall');
    expect(projectionRuntimeSource).not.toContain('modelFacingToolOutput');
    expect(projectionRuntimeSource).not.toContain('reasoning_text');
    expect(projectionRuntimeSource).not.toContain("'web-search-progress'");
    expect(projectionRuntimeSource).not.toContain('fallbackToolCall');
    expect(projectionRuntimeSource).not.toContain("row.type === 'assistant_message' && row.isStreaming ? 'assistant_delta'");
    expect(projectionRuntimeSource).not.toContain("sourceEventType !== 'assistant_delta'");
    expect(projectionRuntimeSource).toContain('isComplete: !isSdkDisplayRowStreaming(row)');
    expect(projectionRuntimeSource).toContain('function exactNonEmptyString(value: unknown)');
    expect(projectionRuntimeSource).toContain('function rowId(row: SdkDisplayRow)');
    expect(projectionRuntimeSource).toContain('return exactNonEmptyString(row.id);');
    expect(projectionRuntimeSource).toContain('const id = rowId(row);');
    expect(projectionRuntimeSource).toContain('if (!id)');
    expect(projectionRuntimeSource).not.toContain('id: row.id');
    expect(projectionRuntimeSource).not.toContain("if (row.type === 'user_message')");
    expect(projectionRuntimeSource).not.toContain("if (row.type === 'assistant_message')");
    expect(projectionRuntimeSource).not.toContain("if (row.type === 'tool_output' || row.type === 'tool_bundle_output')");
    expect(projectionRuntimeSource).toContain('function rowTimestamp(row: SdkDisplayRow)');
    expect(projectionRuntimeSource).toContain('return exactNonEmptyString(row.metadata?.timestamp);');
    expect(projectionRuntimeSource).toContain('function rowTimestampProp(row: SdkDisplayRow)');
    expect(projectionRuntimeSource).toContain('return timestamp ? { timestamp } : {};');
    expect(projectionRuntimeSource).not.toContain('timestamp: rowTimestamp(row)');
    expect(projectionRuntimeSource).not.toContain("typeof row.metadata?.timestamp === 'string' ? row.metadata.timestamp : ''");
    expect(projectionRuntimeSource).toContain('return exactNonEmptyString(row.metadata?.displayCorrelationId);');
    expect(projectionRuntimeSource).toContain('function rowCorrelationIdProp(row: SdkDisplayRow)');
    expect(projectionRuntimeSource).toContain('return correlationId ? { correlationId } : {};');
    expect(projectionRuntimeSource).toContain('function rowTurnRef(row: SdkDisplayRow)');
    expect(projectionRuntimeSource).toContain('return exactNonEmptyString(row.turnRef);');
    expect(projectionRuntimeSource).toContain('function rowTurnRefProp(row: SdkDisplayRow)');
    expect(projectionRuntimeSource).toContain('return turnRef ? { turnRef } : {};');
    expect(projectionRuntimeSource).not.toContain('function rowToolName(row: SdkDisplayRow)');
    expect(projectionRuntimeSource).not.toContain('return exactNonEmptyString(row.metadata?.toolName);');
    expect(projectionRuntimeSource).toContain('function rowReasoningText(row: SdkDisplayRow)');
    expect(projectionRuntimeSource).toContain('return exactNonEmptyString(row.metadata?.reasoningText);');
    expect(projectionRuntimeSource).toContain('const thinkingText = rowReasoningText(row);');
    expect(projectionRuntimeSource).not.toContain("thinkingSourceEventType: 'reasoning_delta'");
    expect(projectionRuntimeSource).not.toContain("typeof reasoningText === 'string' && reasoningText.trim()");
    expect(projectionRuntimeSource).not.toContain('row.metadata?.displayCorrelationId ?? null');
    expect(projectionRuntimeSource).not.toContain('row.metadata?.displayCorrelationId ?? undefined');
    expect(projectionRuntimeSource).not.toContain('toolName: row.metadata?.toolName ?? null');
    expect(projectionRuntimeSource).not.toContain('toolName: row.metadata?.toolName ?? undefined');
    expect(projectionRuntimeSource).not.toContain('toolName: rowToolName');
    expect(currentTurnMessageRuntimeSource).not.toContain('toolName: resolveToolName');
    expect(projectionRuntimeSource).not.toContain('turnRef: rowTurnRef(row)');
    expect(projectionRuntimeSource).not.toContain('turnRef: rowTurnRef(row) ?? undefined');
    expect(projectionRuntimeSource).not.toContain('correlationId: rowCorrelationId(row) ?? undefined');
    expect(projectionRuntimeSource).not.toContain('turnRef: row.turnRef ?? null');
    expect(projectionRuntimeSource).not.toContain('turnRef: row.turnRef ?? undefined');
    expect(projectionRuntimeSource).toContain('row.metadata?.toolCallDetails');
    expect(projectionRuntimeSource).toContain('row.metadata?.toolOutputDetails');
    expect(projectionRuntimeSource).not.toContain('row.metadata?.toolCallDetails ?? row.metadata?.toolOutputDetails');
    expect(projectionRuntimeSource).not.toContain('toolMetadata');
    expect(projectionRuntimeSource).not.toContain('row.metadata?.success');
    expect(currentTurnMessageRuntimeSource).not.toContain('success: toolEvent.status');
    expect(currentTurnMessageRuntimeSource).not.toContain('executionTime:');
    expect(projectionRuntimeSource).not.toContain('recordFromUnknown(row.metadata?.toolCallDetails)');
    expect(projectionRuntimeSource).not.toContain('recordFromUnknown(row.metadata?.toolOutputDetails)');
    expect(projectionRuntimeSource).not.toContain('row.metadata?.requestId');
    expect(projectionRuntimeSource).not.toContain('row.metadata?.toolCallId');
    expect(projectionRuntimeSource).not.toContain('row.metadata?.bundleId');
    expect(projectionRuntimeSource).not.toContain('row.metadata?.correlationId');
    expect(projectionRuntimeSource).not.toContain('row.metadata?.requestId\n    ?? row.metadata?.bundleId');
    expect(projectionRuntimeSource).not.toContain('row.metadata?.toolCallId\n    ?? row.metadata?.correlationId');
    expect(projectionRuntimeSource).not.toContain('row.metadata?.requestId ?? row.metadata?.correlationId');
    expect(projectionRuntimeSource).not.toContain('row.metadata?.toolName\n      ?');
    expect(displayAttachmentProjectionSource).toContain('readSdkDisplayAttachments');
    expect(displayAttachmentProjectionSource).toContain('function sanitizeSdkDisplayAttachment');
    expect(displayAttachmentProjectionSource).toContain('function sanitizeImageAttachment');
    expect(displayAttachmentProjectionSource).toContain('function sanitizeScreenshotRequestAttachment');
    expect(displayAttachmentProjectionSource).toContain('value.flatMap((attachment) => sanitizeSdkDisplayAttachment(attachment) ?? [])');
    expect(displayAttachmentProjectionSource).not.toContain('function isDisplayableImageAttachment');
    expect(displayAttachmentProjectionSource).not.toContain('function isDisplayableScreenshotRequestAttachment');
    expect(displayAttachmentProjectionSource).not.toContain('function isReadyDisplayImageAttachment');
    expect(displayAttachmentProjectionSource).toContain('SDK_DISPLAY_ATTACHMENT_KINDS');
    expect(displayAttachmentProjectionSource).toContain('SDK_DISPLAY_ATTACHMENT_SOURCES');
    expect(displayAttachmentProjectionSource).toContain('SDK_DISPLAY_ATTACHMENT_STATUSES');
    expect(displayAttachmentProjectionSource).toContain('function readExactAttachmentKind(value: unknown)');
    expect(displayAttachmentProjectionSource).toContain('function readExactAttachmentSource(value: unknown)');
    expect(displayAttachmentProjectionSource).toContain('function readExactAttachmentStatus(value: unknown)');
    expect(displayAttachmentProjectionSource).toContain("status: 'ready'");
    expect(displayAttachmentProjectionSource).toContain("attachment.kind !== 'image' || attachment.status !== 'ready'");
    expect(displayAttachmentProjectionSource).toContain('artifactId: attachment.screenshotRef ?? null');
    expect(displayAttachmentProjectionSource).toContain('url: attachment.screenshotUrl ?? null');
    expect(displayAttachmentProjectionSource).not.toContain("&& record.status === 'ready'");
    expect(displayAttachmentProjectionSource).toContain('optionalExactString(record.previewSrc)');
    expect(displayAttachmentProjectionSource).toContain('optionalExactString(record.screenshotRef)');
    expect(displayAttachmentProjectionSource).toContain('optionalReadyImageUrl(record.screenshotUrl)');
    expect(displayAttachmentProjectionSource).toContain(".startsWith('data:')");
    expect(displayAttachmentProjectionSource).toContain('optionalExactString');
    expect(displayAttachmentProjectionSource).not.toContain('optionalTrimmedString');
    expect(displayAttachmentProjectionSource).not.toContain('countDisplayImageAttachments');
    expect(displayAttachmentProjectionSource).not.toContain('hasReadyDisplayImageAttachment');
    expect(displayAttachmentProjectionSource).not.toContain('summarizeSdkDisplayAttachments');
    expect(displayAttachmentProjectionSource).not.toContain('materializingPreviewCount');
    expect(displayAttachmentProjectionSource).not.toContain('pendingScreenshotRequestCount');
    expect(displayAttachmentProjectionSource).not.toContain('failedAttachmentCount');
    expect(displayAttachmentProjectionSource).not.toContain('screenshot_refs');
    expect(displayAttachmentProjectionSource).not.toContain('value.filter(isSdkDisplayAttachment)');
    expect(displayAttachmentProjectionSource).not.toContain('countLegacyScreenshotAttachments');
    expect(attachmentRegistrySource).toContain('function MaterializingImageAttachment');
    expect(attachmentRegistrySource).toContain('function ReadyImageAttachment');
    expect(attachmentRegistrySource).toContain("attachment.kind === 'image' && attachment.status === 'materializing'");
    expect(attachmentRegistrySource).toContain("attachment.kind === 'image' && attachment.status === 'ready'");
    expect(attachmentRegistrySource).not.toContain("attachment.status === 'materializing'\n    ? attachment.previewSrc");
    expect(currentTurnMessageRuntimeSource).toContain('readSdkDisplayAttachments');
    expect(currentTurnMessageRuntimeSource).toContain('readSdkDisplayAttachments(entry.attachments)');
    expect(currentTurnMessageRuntimeSource).not.toContain('toolEvent.attachments');
    expect(currentTurnMessageRuntimeSource).not.toContain('readSdkDisplayAttachments(toolEvent');
    expect(currentTurnMessageRuntimeSource).not.toContain('attachments: [],');
    expect(currentTurnMessageRuntimeSource).not.toContain('modelFacingToolOutput');
    expect(currentTurnMessageRuntimeSource).toContain('function resolveEntryCorrelationId(entry)');
    expect(currentTurnMessageRuntimeSource).toContain('function resolveToolName(value)');
    expect(currentTurnMessageRuntimeSource).not.toContain('toolEvents');
    expect(currentTurnMessageRuntimeSource).not.toContain('function resolveToolEventCorrelationId(toolEvent)');
    expect(currentTurnMessageRuntimeSource).toContain('const liveConversationRef = readExactSdkString(conversationRef);');
    expect(currentTurnMessageRuntimeSource).toContain('if (!liveConversationRef) {');
    expect(currentTurnMessageRuntimeSource).toContain('const liveTurnRef = readExactSdkString(turnRef);');
    expect(currentTurnMessageRuntimeSource).toContain('if (!liveTurnRef) {');
    expect(currentTurnMessageRuntimeSource).not.toContain("liveTurnRef || 'turn'");
    expect(currentTurnMessageRuntimeSource).toContain('readExactSdkString(entry.requestId)');
    expect(currentTurnMessageRuntimeSource).not.toContain('readExactSdkString(toolEvent.requestId)');
    expect(currentTurnMessageRuntimeSource).not.toContain('readExactSdkString(toolEvent.bundleId)');
    expect(currentTurnMessageRuntimeSource).not.toContain('normalizeOptionalText(entry.requestId)');
    expect(currentTurnMessageRuntimeSource).not.toContain('normalizeOptionalText(entry.toolName)');
    expect(currentTurnMessageRuntimeSource).not.toContain('readString(toolEvent.toolName)');
    expect(currentTurnMessageRuntimeSource).not.toContain('readString(toolEvent.requestId)');
    expect(currentTurnMessageRuntimeSource).not.toContain('const toolEventKind = resolveLegacyToolEventKind(toolEventRecord?.kind);');
    expect(currentTurnMessageRuntimeSource).not.toContain('if (!toolEventRecord || !toolEventId || !toolEventKind)');
    expect(currentTurnMessageRuntimeSource).not.toContain('kind: toolEventKind');
    expect(currentTurnMessageRuntimeSource).not.toContain('function resolveLiveTurnIdentity');
    expect(currentTurnMessageRuntimeSource).not.toContain("resolveLiveTurnIdentity(conversationRef, 'conversation')");
    expect(currentTurnMessageRuntimeSource).not.toContain('const baseId = `${conversationRef ||');
    expect(currentTurnMessageRuntimeSource).not.toContain('turnRef: turnRef || undefined');
    expect(currentTurnMessageRuntimeSource).not.toContain('function normalizeDisplayAttachments');
    expect(threadPresentationRuntimeSource).toContain('function toolMessageIdentity(message)');
    expect(threadPresentationRuntimeSource).toContain('function readExactRef(value)');
    expect(threadPresentationRuntimeSource).not.toContain('function normalizeRef(value)');
    expect(threadPresentationRuntimeSource).not.toContain('identityFromToolRecord(asRecord(message?.toolMetadata))');
    expect(threadPresentationRuntimeSource).toContain('const value = readExactRef(record?.[key]);');
    expect(threadPresentationRuntimeSource).toContain('return readExactRef(message?.correlationId)');
    expect(threadPresentationRuntimeSource).toContain('const liveId = readExactRef(liveMessage?.id);');
    expect(threadPresentationRuntimeSource).toContain('const projectionConversationRef = readExactRef(projectionConversationRefValue)');
    expect(threadPresentationRuntimeSource).toContain('const projectionConversationRefValue = hasConversationView');
    expect(threadPresentationRuntimeSource).not.toContain('conversationView?.conversationRef || sdkLiveTurn?.conversationRef');
    expect(threadPresentationRuntimeSource).not.toContain('rawProjectionConversationRef');
    expect(threadPresentationRuntimeSource).toContain('const normalizedActiveConversationRef = readExactRef(activeConversationRef)');
    expect(threadPresentationRuntimeSource).toContain('const liveTurnRef = readExactRef(liveMessages[0]?.turnRef)');
    expect(threadPresentationRuntimeSource).toContain('if (readExactRef(messages[index]?.turnRef) === liveTurnRef)');
    expect(threadPresentationRuntimeSource).not.toContain('const liveId = normalizeRef(liveMessage?.id);');
    expect(threadPresentationRuntimeSource).not.toContain('return normalizeRef(message?.correlationId)');
    expect(threadPresentationRuntimeSource).toContain('const leftTurnRef = readExactRef(left);');
    expect(threadPresentationRuntimeSource).toContain('const rightTurnRef = readExactRef(right);');
    expect(threadPresentationRuntimeSource).not.toContain('const leftTurnRef = normalizeRef(left);');
    expect(threadPresentationRuntimeSource).not.toContain('const rightTurnRef = normalizeRef(right);');
    expect(threadPresentationRuntimeSource).not.toContain('function resolveToolName');
    expect(threadPresentationRuntimeSource).not.toContain('resolveToolName(message)');
    expect(chatInterfaceSource).toContain('DesktopChatRevisionActionRuntime');
    expect(chatInterfaceSource).toContain('applyConversationViewToChatStore');
    expect(chatInterfaceSource).not.toContain('DesktopChatInterfacePresentationRuntime');
    expect(chatInterfaceSource).not.toContain('DesktopConversationContinuityService');
    expect(chatInterfaceSource).not.toContain('buildChatInterfacePresentationState');
    expect(chatInterfaceSource).not.toContain('resolveConversationViewStoreRef');
    expect(chatStoreSource).not.toContain('buildChatInterfacePresentationState');
    expect(chatStoreSource).not.toContain('selectStableReplayReadModel');
    expect(chatInterfaceSelectorRuntimeSource).toContain('buildChatInterfacePresentationState');
    expect(chatInterfaceSelectorRuntimeSource).not.toContain('selectStableReplayReadModel');
    expect(chatInterfaceSelectorRuntimeSource).toContain('selectStableChatSendReadModel');
    expect(chatInterfaceSelectorRuntimeSource).not.toContain('latestConversationView');
    expect(chatInterfaceSelectorRuntimeSource).not.toContain('CurrentTurnProjection');
    expect(chatInterfaceSelectorRuntimeSource).not.toContain('ConversationView');
    expect(chatInterfaceSelectorRuntimeSource).not.toContain('as CurrentTurnProjection');
    expect(chatInterfaceSelectorRuntimeSource).not.toContain('as ConversationView');
    expect(chatSurfaceSelectorRuntimeSource).not.toContain('latestConversationView');
    expect(chatInterfaceSource).not.toContain('buildRevisionCheckoutCommand');
    expect(chatInterfaceSource).not.toContain('buildRevisionForkCommand');
    expect(chatInterfaceSource).toContain('markActiveRevisionFromCheckoutResult');
    expect(chatInterfaceSource).not.toContain('markActiveRevisionInList');
    expect(chatInterfaceSource).not.toContain('result?.revisionId');
    expect(chatInterfaceSource).not.toContain('revision.revisionId === command.input.revisionId');
    expect(chatInterfaceSource).not.toContain('newConversationRef');
    expect(chatInterfaceSource).not.toContain('setMessages(projection.messages');
    expect(chatInterfaceSource).not.toContain('buildConversationViewStoreProjection');
    expect(chatInterfaceSource).not.toContain('buildConversationViewChatMessages');
    expect(chatInterfaceSource).not.toContain('buildThreadPresentationMessages');
    expect(chatInterfaceSource).not.toContain('function normalizeRevisionId');
    expect(chatInterfaceSource).toContain('buildRevisionMenuItems');
    expect(chatInterfaceSource).not.toContain('function buildForkConversationRef');
    expect(chatInterfaceSource).not.toContain('conversationView?.actions?.canEdit');
    expect(chatInterfaceSource).not.toContain('conversationView?.actions?.canRetry');
    const headerControlsSource = await fs.readFile(
      path.join(chatRoot, 'components/ChatInterfaceHeaderControls.jsx'),
      'utf8',
    );
    expect(headerControlsSource).toContain('revisionMenuItems');
    expect(headerControlsSource).not.toContain('shortRevisionId');
    expect(headerControlsSource).not.toContain('revisionOperationLabel');
    expect(headerControlsSource).not.toContain('checkoutActionId');
    expect(headerControlsSource).not.toContain('forkActionId');
    expect(headerControlsSource).not.toContain('revisionActionId');
    expect(headerControlsSource).not.toContain('activeRevisionId');
    expect(headerControlsSource).not.toContain('item.revisionId');
    expect(headerControlsSource).not.toContain('item.revision');
    expect(headerControlsSource).toContain('item.checkoutCommand');
    expect(headerControlsSource).toContain('item.forkCommand');
    expect(chatInterfacePresentationRuntimeSource).toContain('buildThreadPresentationMessages');
    expect(threadPresentationRuntimeSource).not.toContain('modelFacingToolCall');
    expect(chatInterfacePresentationRuntimeSource).toContain('DesktopConversationDisplayProjection');
    expect(chatInterfacePresentationRuntimeSource).toContain('buildConversationViewChatMessages');
    expect(chatInterfacePresentationRuntimeSource).toContain('buildPendingBridgeChatMessages');
    expect(chatInterfacePresentationRuntimeSource).toContain('DesktopConversationViewWorkspaceRuntime');
    expect(chatInterfacePresentationRuntimeSource).toContain('hasWorkspaceConversationView({ conversationView })');
    expect(chatInterfacePresentationRuntimeSource).not.toContain('hasWorkspaceConversationView({ conversationView: view })');
    expect(conversationViewWorkspaceRuntimeSource).toContain('resolveConversationViewStoreRef');
    expect(threadPresentationRuntimeSource).toContain('selectVisibleConversationViewLiveMessages');
    expect(threadPresentationRuntimeSource).toContain('selectVisibleCurrentTurnMessages');
    expect(threadPresentationRuntimeSource).toContain('const visibleLiveMessages = hasConversationView');
    expect(threadPresentationRuntimeSource).not.toContain('useSdkViewAuthority');
    expect(chatInterfacePresentationRuntimeSource).toContain('allowPendingBridgeMessages: hasConversationView');
    expect(threadPresentationRuntimeSource).toContain('allowPendingBridgeMessages = false');
    expect(chatInterfacePresentationRuntimeSource).not.toContain('DesktopPendingTurnBridgeRuntime');
    expect(chatInterfacePresentationRuntimeSource).not.toContain('buildPendingTurnUserMessage');
    expect(chatInterfacePresentationRuntimeSource).not.toContain('function buildNoViewPendingBridgeMessages');
    expect(chatInterfacePresentationRuntimeSource).not.toContain('function isObjectRecord(value)');
    expect(chatInterfacePresentationRuntimeSource).not.toContain('function isConversationView(value)');
    expect(chatInterfacePresentationRuntimeSource).not.toContain('readExactIdentityString(value.conversationRef)');
    expect(chatInterfacePresentationRuntimeSource).not.toContain('Array.isArray(value.displayRows)');
    expect(chatInterfacePresentationRuntimeSource).not.toContain('isObjectRecord(value.liveTurn)');
    expect(chatInterfacePresentationRuntimeSource).not.toContain('isObjectRecord(value.surfaces)');
    expect(chatInterfacePresentationRuntimeSource).not.toContain('isObjectRecord(value.actions)');
    expect(chatInterfacePresentationRuntimeSource).toContain('const effectiveConversationView = hasConversationView ? conversationView : null');
    expect(chatInterfacePresentationRuntimeSource).toContain('const effectiveSdkLiveTurn = hasConversationView ? null : sdkLiveTurn');
    expect(chatInterfacePresentationRuntimeSource).toContain('const effectiveMessages = hasConversationView ? null : messages');
    expect(chatInterfacePresentationRuntimeSource).toContain('chatInterfacePresentationCache.conversationView === effectiveConversationView');
    expect(chatInterfacePresentationRuntimeSource).toContain('chatInterfacePresentationCache.messages === effectiveMessages');
    expect(chatInterfacePresentationRuntimeSource).toContain('buildSdkLiveTurnCacheKey');
    expect(chatInterfacePresentationRuntimeSource).toContain(
      'const conversationRef = readExactIdentityString(liveTurn.conversationRef);',
    );
    expect(chatInterfacePresentationRuntimeSource).toContain(
      'const turnRef = readExactIdentityString(liveTurn.turnRef);',
    );
    expect(chatInterfacePresentationRuntimeSource).toContain(
      'const phase = readExactIdentityString(liveTurn.phase);',
    );
    expect(chatInterfacePresentationRuntimeSource).not.toContain('conversationRef: liveTurn.conversationRef ?? null');
    expect(chatInterfacePresentationRuntimeSource).not.toContain('turnRef: liveTurn.turnRef ?? null');
    expect(chatInterfacePresentationRuntimeSource).not.toContain('phase: liveTurn.phase ?? null');
    expect(chatInterfacePresentationRuntimeSource).toContain('sdkLiveTurnPresentationEntries');
    expect(chatInterfacePresentationRuntimeSource).toContain('sdkLiveTurnLegacyNoPresentation');
    expect(chatInterfacePresentationRuntimeSource).not.toContain('liveTurn.assistantText');
    expect(chatInterfacePresentationRuntimeSource).not.toContain('liveTurn.reasoningText');
    expect(chatInterfacePresentationRuntimeSource).not.toContain('liveTurn.toolEvents');
    expect(chatInterfacePresentationRuntimeSource).not.toContain('liveTurn.lastError');
    expect(chatInterfacePresentationRuntimeSource).not.toContain('sdkLiveTurnAssistantText');
    expect(chatInterfacePresentationRuntimeSource).not.toContain('sdkLiveTurnReasoningText');
    expect(chatInterfacePresentationRuntimeSource).not.toContain('sdkLiveTurnToolEvents');
    expect(chatInterfacePresentationRuntimeSource).toContain('sdkLiveTurn: effectiveSdkLiveTurn');
    expect(chatInterfacePresentationRuntimeSource).toContain('conversationView: effectiveConversationView');
    expect(chatInterfacePresentationRuntimeSource).not.toContain('currentTurnProjection = null');
    expect(chatInterfacePresentationRuntimeSource).not.toContain('selectRendererMessageAnnotations');
    expect(chatInterfacePresentationRuntimeSource).toContain('rendererAnnotations = []');
    expect(chatInterfacePresentationRuntimeSource).toContain('rendererAnnotations,');
    expect(chatInterfaceSelectorRuntimeSource).not.toContain('selectRendererMessageAnnotations(interfaceState.messages');
    expect(chatSurfaceSelectorRuntimeSource).not.toContain('selectRendererMessageAnnotations(activeWorkspace.messages)');
    expect(chatSurfaceSelectorRuntimeSource).not.toContain('DesktopConversationDisplayProjection');
    expect(chatSurfaceSelectorRuntimeSource).not.toContain('hasSdkConversationView');
    expect(chatSurfaceSelectorRuntimeSource).not.toContain('function hasConversationView');
    expect(chatSurfaceSelectorRuntimeSource).not.toContain('DesktopConversationViewWorkspaceRuntime');
    expect(chatSurfaceSelectorRuntimeSource).not.toContain('hasWorkspaceConversationView');
    expect(chatSurfaceSelectorRuntimeSource).not.toContain('emptyChatMessages');
    expect(chatSurfaceSelectorRuntimeSource).not.toContain('activeWorkspace.currentTurnProjection ?? null');
    expect(chatSurfaceSelectorRuntimeSource).not.toContain('currentTurnProjection');
    expect(chatSurfaceSelectorRuntimeSource).not.toContain('conversationView ? emptySurfaceMessages');
    expect(chatSurfaceSelectorRuntimeSource).toContain('const messages = activeWorkspace.messages;');
    expect(chatSurfaceSelectorRuntimeSource).toContain('const sdkLiveTurn = activeWorkspace.sdkLiveTurn ?? null;');
    expect(chatSurfaceSelectorRuntimeSource).toContain('sdkLiveTurn,');
    expect(chatSurfaceSelectorRuntimeSource).toContain('activeWorkspace.rendererAnnotations');
    expect(chatSurfaceSelectorRuntimeSource).toContain('messages: surfaceState.messages');
    expect(chatSurfaceSelectorRuntimeSource).toContain('rendererAnnotations: projectedRendererAnnotations');
    expect(chatSurfaceSelectorRuntimeSource).not.toContain('const hasConversationView = Boolean(surfaceState.conversationView);');
    expect(chatSurfaceSelectorRuntimeSource).toContain('thinkingStatus: activeWorkspace.thinkingStatus');
    expect(chatSurfaceSelectorRuntimeSource).toContain(
      'thinkingSourceEventType: activeWorkspace.thinkingSourceEventType ?? null',
    );
    expect(chatSurfaceSelectorRuntimeSource).toContain(
      'compactionDebugInfo: activeWorkspace.compactionDebugInfo ?? null',
    );
    expect(chatSurfaceSelectorRuntimeSource).toContain(
      'tokenCounts: activeWorkspace.tokenCounts ?? null',
    );
    expect(chatInterfaceSelectorRuntimeSource).not.toContain('conversationView\n    ? emptyChatMessages\n    : interfaceState.messages');
    expect(chatInterfaceSelectorRuntimeSource).not.toContain('messages: conversationView ?');
    expect(chatInterfaceSelectorRuntimeSource).toContain('messages: presentationMessages');
    expect(chatInterfacePresentationRuntimeSource).not.toContain('currentMessages: messages');
    expect(chatInterfacePresentationRuntimeSource).not.toContain('resolveConversationViewStoreRef');
    expect(conversationViewWorkspaceRuntimeSource).toContain('resolveConversationViewStoreRef');
    expect(conversationViewWorkspaceRuntimeSource).toContain('const viewConversationRef = exactNonEmptyString(view.conversationRef);');
    expect(chatStoreAdaptersSource).toContain('applyConversationViewToChatStore');
    expect(chatStoreAdaptersSource).toContain('resolveConversationViewStoreRef({');
    expect(chatInterfacePresentationRuntimeSource).not.toContain('targetConversationRef || view.conversationRef || activeConversationRef');
    expect(chatInterfacePresentationRuntimeSource).not.toContain('buildConversationViewStoreProjection');
    expect(chatInterfacePresentationRuntimeSource).not.toContain('canEditMessages');
    expect(chatInterfacePresentationRuntimeSource).not.toContain('canRetryMessages');
    expect(chatInterfacePresentationRuntimeSource).not.toContain('conversationView?.actions?.canEdit');
    expect(chatInterfacePresentationRuntimeSource).not.toContain('conversationView?.actions?.canRetry');
    expect(chatInterfaceSource).not.toContain('canEditMessages');
    expect(chatInterfaceSource).not.toContain('canRetryMessages');
    expect(messageListSource).not.toContain('canEditMessages');
    expect(messageListSource).not.toContain('canRetryMessages');
    expect(chatInterfacePresentationRuntimeSource).not.toContain('features/chat');
    expect(messageListSource).toContain('resolveMessageReplayActions(msg)');
    expect(messageListSource).not.toContain("messageActionFlag(msg, 'canRetry'");
    expect(messageListSource).not.toContain("messageActionFlag(msg, 'canEdit'");
    expect(messageListSource).not.toContain('messageActionFallback');
    expect(messageListSource).not.toContain("messageActionTargetId(msg, 'retryTargetRowId')");
    expect(messageListSource).not.toContain("messageActionTargetId(msg, 'editTargetRowId')");
    expect(messageListSource).toContain('assistantRetryTargetRowId={retryTargetRowId}');
    expect(messageListSource).toContain('userEditTargetRowId={editTargetRowId}');
    expect(messageActionRuntimeSource).toContain('resolveMessageReplayActions');
    expect(messageActionRuntimeSource).toContain('resolveReplayTargetRowId');
    expect(messageActionRuntimeSource).toContain("messageActionFlag(message, 'canRetry')");
    expect(messageActionRuntimeSource).toContain("messageActionFlag(message, 'canEdit')");
    expect(messageActionRuntimeSource).toContain('value === value.trim()');
    expect(messageActionRuntimeSource).toContain('canRetryMessage: messageActionFlag(message, \'canRetry\') && Boolean(retryTargetRowId)');
    expect(messageActionRuntimeSource).toContain('canEditMessage: messageActionFlag(message, \'canEdit\') && Boolean(editTargetRowId)');
    expect(messageActionRuntimeSource).not.toContain('? value.trim() : null');
    expect(messageActionRuntimeSource).not.toContain("messageActionTargetId(message, 'retryTargetRowId') || message?.id");
    expect(messageActionRuntimeSource).not.toContain("messageActionTargetId(message, 'editTargetRowId') || message?.id");
    expect(messageListSource).not.toContain('editTargetMessageId || messageId');
    expect(messageListSource).not.toContain('editingUserReplayTargetMessageId || editingUserMessageId');
    expect(messageListSource).not.toContain('editingUserReplayTargetMessageId');
    expect(messageListSource).not.toContain('editingUserDraft.trim');
    expect(messageListSource).not.toContain('normalizedText');
    expect(messageItemSource).not.toContain('assistantRetryTargetMessageId');
    expect(messageItemSource).not.toContain('userEditTargetMessageId');
    expect(messageItemSource).toContain('canRetryMessage');
    expect(messageItemSource).toContain('canEditMessage');
    expect(messageItemSource).toContain('canTryAgain={canRetryMessage}');
    expect(messageItemSource).toContain('canEdit={canEditMessage}');
    expect(assistantMessageActionsSource).toContain('DesktopMessageActionRuntime.resolveReplayTargetRowId(retryTargetRowId)');
    expect(userMessageActionsSource).toContain('DesktopMessageActionRuntime.resolveReplayTargetRowId(editTargetRowId)');
    expect(assistantMessageActionsSource).not.toContain('!retryTargetRowId');
    expect(userMessageActionsSource).not.toContain('!editTargetRowId');
    expect(chatRevisionActionRuntimeSource).toContain('buildRevisionCheckoutCommand');
    expect(chatRevisionActionRuntimeSource).toContain('DesktopConversationContinuityService.listRevisions');
    expect(chatRevisionActionRuntimeSource).toContain('DesktopConversationContinuityService.checkoutRevision');
    expect(chatRevisionActionRuntimeSource).toContain('DesktopConversationContinuityService.forkConversation');
    expect(chatRevisionActionRuntimeSource).toContain('markActiveRevisionInList');
    expect(chatRevisionActionRuntimeSource).toContain('markActiveRevisionFromCheckoutResult');
    expect(chatRevisionActionRuntimeSource).toContain('buildRevisionForkCommand');
    expect(chatRevisionActionRuntimeSource).toContain('function normalizeRevisionId');
    expect(chatRevisionActionRuntimeSource).toContain('revisionId.length > 0 && revisionId === revisionId.trim()');
    expect(chatRevisionActionRuntimeSource).toContain('conversationRef.length > 0');
    expect(chatRevisionActionRuntimeSource).toContain('conversationRef === conversationRef.trim()');
    expect(chatRevisionActionRuntimeSource).not.toContain('revisionId.trim() ? revisionId.trim() : null');
    expect(chatRevisionActionRuntimeSource).not.toContain('conversationRef.trim()\n    ? conversationRef.trim()');
    expect(chatRevisionActionRuntimeSource).not.toContain('buildForkConversationRef');
    expect(chatRevisionActionRuntimeSource).not.toContain('newConversationRef');
    expect(chatRevisionActionRuntimeSource).not.toContain('features/chat');
    expect(chatInterfacePresentationRuntimeSource).toContain(
      'activeRevisionId: hasConversationView\n      ? readExactIdentityString(effectiveConversationView?.revisionId)\n      : null',
    );
    expect(chatInterfacePresentationRuntimeSource).not.toContain(
      'effectiveConversationView?.revisionId || null',
    );
    expect(chatInterfaceSource).not.toContain('buildChatMessagesFromSdkDisplayRows');
    expect(chatInterfaceSource).not.toContain('mergeRendererAnnotationsIntoSdkMessages');
    expect(projectionRuntimeSource).toContain('packages/windie-sdk-js/src/conversation/types.js');
    expect(projectionRuntimeSource).not.toContain("packages/windie-sdk-js/src';");
    expect(projectionRuntimeSource).not.toContain('features/chat');
    expect(projectionRuntimeSource).not.toContain('rawEventType');
    expect(projectionRuntimeSource).not.toContain('metadata.raw');
    expect(projectionRuntimeSource).not.toContain('payload.raw');
    expect(chatStoreSource).not.toContain('desktopChatMessageTypes');
    expect(chatStoreSource).not.toContain('export type { ChatMessage, TokenCounts }');
    expect(chatStoreSource).toContain('createInitialWorkspaceRecord');
    expect(chatStoreSource).toContain('desktopChatWorkspaceStateRuntime');
    expect(chatStoreSource).not.toContain('./chatWorkspaceState');
    expect(chatStoreSource).toContain('selectActiveWorkspaceReadModelState');
    expect(chatStoreSource).not.toContain('selectActiveWorkspaceState(state)');
    expect(chatStoreSource).toContain('buildActiveConversationWorkspaceUpdate');
    expect(chatStoreSource).not.toContain('buildWorkspaceUpdate');
    expect(chatStoreSource).not.toContain('getWorkspaceState:');
    expect(chatStoreSource).not.toContain('readWorkspaceState');
    expect(chatStoreSource).not.toContain('resolveWorkspaceKey');
    expect(chatStoreSource).not.toContain('resolveWorkspaceMutationTarget');
    expect(chatStoreSource).not.toContain('function getProjectedWorkspaceFields');
    expect(chatStoreSource).not.toContain('messages: ChatMessage[];');
    expect(chatStoreSource).not.toContain('isSending: boolean;');
    expect(chatStoreSource).not.toContain('export interface StreamTracking');
    expect(chatStoreSource).not.toContain('currentTurnProjection: CurrentTurnProjection | null;');
    expect(chatStoreSource).not.toContain('conversationView: ConversationView | null;');
    expect(chatStoreSource).not.toContain('pendingTurn: PendingTurn | null;');
    expect(chatStoreSource).not.toContain('export interface PendingTurn');
    expect(chatStoreSource).not.toContain('DesktopPendingTurnState');
    expect(chatStoreSource).not.toContain('turnConversationRefs:');
    expect(chatStoreSource).not.toContain('function buildWorkspaceUpdate');
    expect(chatStoreSource).not.toContain('function resolveWorkspaceMutationTarget');
    expect(chatStoreSource).not.toContain('DesktopChatPendingTurnStateRuntime');
    expect(chatStoreSource).not.toContain('DesktopChatClearMessagesRuntime');
    expect(chatStoreSource).not.toContain('buildClearMessagesStateUpdate');
    expect(chatStoreSource).not.toContain('clearMessagesInChatStore');
    expect(chatStoreSource).not.toContain('clearMessages:');
    expect(chatStoreSource).not.toContain('DesktopChatWorkspaceMessageRuntime');
    expect(chatStoreSource).not.toContain('buildAddMessageStateUpdate');
    expect(chatStoreSource).not.toContain('buildUpdateMessageStateUpdate');
    expect(chatStoreSource).not.toContain('buildUpdateStreamTargetMessageStateUpdate');
    expect(chatStoreSource).not.toContain('buildSetMessagesStateUpdate');
    expect(chatStoreSource).not.toContain('addMessageToChatStore');
    expect(chatStoreSource).not.toContain('updateMessageInChatStore');
    expect(chatStoreSource).not.toContain('updateStreamTargetMessageInChatStore');
    expect(chatStoreSource).not.toContain('setMessagesInChatStore');
    expect(chatStoreSource).not.toContain('addMessage:');
    expect(chatStoreSource).not.toContain('updateMessage:');
    expect(chatStoreSource).not.toContain('updateStreamTargetMessage:');
    expect(chatStoreSource).not.toContain('setMessages:');
    expect(chatStoreSource).not.toContain('existingMessageIndex');
    expect(chatStoreSource).not.toContain('currentWorkspace.messages.findIndex');
    expect(chatStoreSource).not.toContain('DesktopChatStreamTrackingRuntime');
    expect(chatStoreSource).toContain('StreamTracking');
    expect(chatStoreSource).not.toContain('buildUpdateStreamTrackingStateUpdate');
    expect(chatStoreSource).not.toContain('updateStreamTrackingInChatStore');
    expect(chatStoreSource).not.toContain('updateStreamTracking:');
    expect(chatStoreSource).not.toContain('DesktopChatWorkspaceFieldRuntime');
    expect(chatStoreSource).not.toContain('buildSetWorkspaceFieldStateUpdate');
    expect(chatStoreSource).not.toContain('setIsSendingInChatStore');
    expect(chatStoreSource).not.toContain('setThinkingStatusInChatStore');
    expect(chatStoreSource).not.toContain('setThinkingSourceEventTypeInChatStore');
    expect(chatStoreSource).not.toContain('setCompactionDebugInfoInChatStore');
    expect(chatStoreSource).not.toContain('setTokenCountsInChatStore');
    expect(chatStoreSource).not.toContain('setIsSending:');
    expect(chatStoreSource).not.toContain('setThinkingStatus:');
    expect(chatStoreSource).not.toContain('setThinkingSourceEventType:');
    expect(chatStoreSource).not.toContain('setCompactionDebugInfo:');
    expect(chatStoreSource).not.toContain('setTokenCounts:');
    expect(chatStoreSource).toContain('DesktopResponseOverlayViewRuntime');
    expect(chatStoreSource).toContain('buildDismissResponseOverlayEntryStateUpdate');
    expect(chatStoreSource).toContain('isResponseOverlayEntryDismissedInState');
    expect(chatStoreSource).not.toContain('buildResponseOverlayDismissalKey');
    expect(chatStoreSource).not.toContain('const dismissalKey =');
    expect(chatStoreSource).not.toContain('[dismissalKey]');
    expect(chatStoreSource).not.toContain('DesktopCurrentTurnWorkspaceRuntime');
    expect(chatStoreSource).not.toContain('buildSetNoViewSdkLiveTurnStateUpdate');
    expect(chatStoreSource).not.toContain('setNoViewSdkLiveTurnInChatStore');
    expect(chatStoreSource).not.toContain('setNoViewSdkLiveTurn:');
    expect(chatStoreSource).not.toContain('buildNoViewSdkLiveTurnWorkspaceMutation');
    expect(chatStoreSource).not.toContain('buildCurrentTurnWorkspaceMutation');
    expect(chatStoreSource).not.toContain('DesktopConversationViewWorkspaceRuntime');
    expect(chatStoreSource).not.toContain('buildSetConversationViewStateUpdate');
    expect(chatStoreSource).not.toContain('setConversationViewInChatStore');
    expect(chatStoreSource).not.toContain('setConversationView:');
    expect(chatStoreSource).not.toContain('buildSetLatestConversationViewStateUpdate');
    expect(chatStoreSource).not.toContain('setLatestConversationView');
    expect(chatStoreSource).not.toContain('latestConversationView');
    expect(chatStoreSource).not.toContain('buildConversationViewWorkspaceMutation');
    expect(chatStoreSource).not.toContain('buildAcceptStoppedTurnStateUpdate');
    expect(chatStoreSource).not.toContain('acceptStoppedTurnInChatStore');
    expect(chatStoreSource).not.toContain('acceptStoppedTurn:');
    expect(chatStoreSource).not.toContain('buildStoppedTurnWorkspaceMutation');
    expect(chatStoreSource).not.toContain('normalizeConversationRef(input?.conversationRef)');
    expect(chatStoreSource).not.toContain('normalizeTurnRef(input?.turnRef)');
    expect(chatStoreSource).not.toContain('DesktopChatCurrentTurnStateRuntime');
    expect(chatStoreSource).not.toContain('doesCurrentTurnProjectionMatch');
    expect(chatStoreSource).not.toContain('buildAcceptPendingTurnStateUpdate');
    expect(chatStoreSource).not.toContain('acceptPendingTurnInChatStore');
    expect(chatStoreSource).not.toContain('acceptPendingTurn:');
    expect(chatStoreSource).not.toContain('buildAcceptReplayPendingTurnStateUpdate');
    expect(chatStoreSource).not.toContain('buildClearPendingTurnStateUpdate');
    expect(chatStoreSource).not.toContain('clearPendingTurnInChatStore');
    expect(chatStoreSource).not.toContain('clearPendingTurn:');
    expect(chatStoreSource).not.toContain('buildPendingTurnBroadcastStateUpdate');
    expect(chatStoreSource).not.toContain('applyPendingTurnBroadcastToChatStore');
    expect(chatStoreSource).not.toContain('applyPendingTurnBroadcast:');
    expect(chatStoreSource).not.toContain('buildPendingTurnWorkspaceMutation');
    expect(chatStoreSource).not.toContain('buildPendingTurnClearWorkspaceMutation');
    expect(chatStoreAdaptersSource).toContain('Chat store adapter functions');
    expect(chatStoreAdaptersSource).toContain('useChatStore');
    expect(chatStoreAdaptersSource).not.toContain('export function getWorkspaceStateFromChatStore');
    expect(chatStoreAdaptersSource).not.toContain('export function getProjectedWorkspaceReadModelFromChatStore');
    expect(chatStoreAdaptersSource).toContain('function getProjectedWorkspaceReadModelFromChatStore');
    expect(chatStoreAdaptersSource).toContain('ChatWorkspaceReadModelState');
    expect(chatStoreAdaptersSource).toContain('): ChatStreamWorkspaceReadModel');
    expect(chatStoreAdaptersSource).toContain('): CurrentTurnProjectionWorkspaceReadModel');
    expect(chatStoreAdaptersSource).toContain('function buildChatStreamWorkspaceReadModel');
    expect(chatStoreAdaptersSource).toContain('function buildCurrentTurnProjectionWorkspaceReadModel');
    expect(chatStoreAdaptersSource).toContain('return buildChatStreamWorkspaceReadModel(');
    expect(chatStoreAdaptersSource).toContain('return buildCurrentTurnProjectionWorkspaceReadModel(');
    const chatStreamReadModelSource = chatStoreAdaptersSource.slice(
      chatStoreAdaptersSource.indexOf('function buildChatStreamWorkspaceReadModel'),
      chatStoreAdaptersSource.indexOf('function buildCurrentTurnProjectionWorkspaceReadModel'),
    );
    expect(chatStreamReadModelSource).toContain('turnRef: exactReadModelString(workspace.pendingTurn.turnRef)');
    expect(chatStreamReadModelSource).toContain('thinkingSourceEventType: exactReadModelString(workspace.thinkingSourceEventType)');
    expect(chatStreamReadModelSource).toContain('viewLiveTurnRef: readConversationViewLiveTurnRef(workspace.conversationView)');
    expect(chatStreamReadModelSource).not.toContain('turnRef: workspace.pendingTurn.turnRef');
    expect(chatStreamReadModelSource).not.toContain('thinkingSourceEventType: workspace.thinkingSourceEventType');
    expect(chatStreamReadModelSource).not.toContain('workspace.conversationView?.liveTurn?.turnRef');
    expect(conversationViewWorkspaceRuntimeSource).toContain('function readConversationViewLiveTurnRef');
    expect(conversationViewWorkspaceRuntimeSource).toContain('return isConversationView(conversationView)');
    expect(chatStreamReadModelSource).not.toContain('conversationView:');
    expect(chatStreamReadModelSource).not.toContain('liveTurn: {');
    const currentTurnReadModelSource = chatStoreAdaptersSource.slice(
      chatStoreAdaptersSource.indexOf('function buildCurrentTurnProjectionWorkspaceReadModel'),
      chatStoreAdaptersSource.indexOf('function buildChatProviderTraceWorkspaceReadModel'),
    );
    expect(currentTurnReadModelSource).toContain('turnRef: exactReadModelString(workspace.pendingTurn.turnRef)');
    expect(currentTurnReadModelSource).toContain('phase: exactReadModelString(workspace.sdkLiveTurn.phase)');
    expect(currentTurnReadModelSource).toContain('turnRef: exactReadModelString(workspace.sdkLiveTurn.turnRef)');
    expect(currentTurnReadModelSource).not.toContain('turnRef: workspace.pendingTurn.turnRef');
    expect(currentTurnReadModelSource).not.toContain('phase: workspace.sdkLiveTurn.phase');
    expect(currentTurnReadModelSource).not.toContain('turnRef: workspace.sdkLiveTurn.turnRef');
    expect(currentTurnReadModelSource).not.toContain('messageCount');
    expect(currentTurnReadModelSource).not.toContain('workspace.messages');
    expect(chatStoreAdaptersSource).toContain('ChatStreamWorkspaceReadModel');
    expect(chatStoreAdaptersSource).toContain('CurrentTurnProjectionWorkspaceReadModel');
    expect(chatStoreAdaptersSource).toContain('getChatStreamWorkspaceReadModelFromChatStore');
    expect(chatStoreAdaptersSource).toContain('getCurrentTurnProjectionWorkspaceReadModelFromChatStore');
    expect(chatStoreAdaptersSource).toContain('function readWorkspaceStateFromChatStore');
    expect(chatStoreAdaptersSource).toContain('readWorkspaceState(state, workspaceRef)');
    expect(chatStoreAdaptersSource).toContain('resolveWorkspaceKey(conversationRef, state.activeConversationRef)');
    expect(chatStoreAdaptersSource).toContain('buildWorkspaceUpdate');
    expect(chatStoreAdaptersSource).toContain('resolveWorkspaceMutationTarget');
    expect(chatStoreAdaptersSource).toContain('DesktopChatPendingTurnStateRuntime');
    expect(chatStoreAdaptersSource).toContain('DesktopChatClearMessagesRuntime');
    expect(chatStoreAdaptersSource).toContain('DesktopChatWorkspaceMessageRuntime');
    expect(chatStoreAdaptersSource).toContain('DesktopChatStreamTrackingRuntime');
    expect(chatStoreAdaptersSource).toContain('DesktopChatWorkspaceFieldRuntime');
    expect(chatStoreAdaptersSource).toContain('DesktopCurrentTurnWorkspaceRuntime');
    expect(chatStoreAdaptersSource).toContain('DesktopConversationViewWorkspaceRuntime');
    expect(chatStoreAdaptersSource).toContain('buildAcceptStoppedTurnStateUpdate');
    expect(chatStoreAdaptersSource).toContain('addMessageToChatStore');
    expect(chatStoreAdaptersSource).toContain('updateMessageInChatStore');
    expect(chatStoreAdaptersSource).toContain('updateStreamTargetMessageInChatStore');
    expect(chatStoreAdaptersSource).toContain('setMessagesInChatStore');
    expect(chatStoreAdaptersSource).toContain('clearMessagesInChatStore');
    expect(chatStoreAdaptersSource).toContain('acceptPendingTurnInChatStore');
    expect(chatStoreAdaptersSource).toContain('clearPendingTurnInChatStore');
    expect(chatStoreAdaptersSource).toContain('acceptStoppedTurnInChatStore');
    expect(chatStoreAdaptersSource).not.toContain('editUserMessageReplayFromChatStore');
    expect(chatStoreAdaptersSource).not.toContain('retryAssistantMessageReplayFromChatStore');
    expect(chatStoreAdaptersSource).not.toContain('executeReplayActionFromChatStore');
    expect(chatStoreAdaptersSource).not.toContain('desktopConversationRuntimeContracts');
    expect(chatStoreAdaptersSource).toContain('sdkLiveTurn: unknown | null');
    expect(chatStoreAdaptersSource).toContain('conversationView: unknown | null');
    expect(chatStoreAdaptersSource).not.toContain('view as ConversationView');
    expect(currentTurnWorkspaceRuntimeSource).toContain('function normalizeNoViewSdkLiveTurn');
    expect(conversationViewWorkspaceRuntimeSource).toContain('function normalizeConversationView');
    expect(chatStoreAdaptersSource).toContain('setNoViewSdkLiveTurnInChatStore');
    expect(chatStoreAdaptersSource).toContain('setConversationViewInChatStore');
    expect(chatStoreAdaptersSource).toContain('updateStreamTrackingInChatStore');
    expect(chatStoreAdaptersSource).toContain('setIsSendingInChatStore');
    expect(chatStoreAdaptersSource).toContain('setThinkingStatusInChatStore');
    expect(chatStoreAdaptersSource).toContain('setThinkingSourceEventTypeInChatStore');
    expect(chatStoreAdaptersSource).toContain('setCompactionDebugInfoInChatStore');
    expect(chatStoreAdaptersSource).toContain('setTokenCountsInChatStore');
    expect(chatStoreAdaptersSource).toContain('applyPendingTurnBroadcastToChatStore');
    expect(chatWorkspaceMessageRuntimeSource).toContain("Pick<ChatMessage, 'feedback'>");
    expect(chatWorkspaceMessageRuntimeSource).toContain('rendererAnnotations: updateRendererAnnotations');
    expect(chatWorkspaceMessageRuntimeSource).not.toContain("text: ''");
    expect(chatWorkspaceMessageRuntimeSource).not.toContain("'fullAssistantMessage'");
    expect(chatWorkspaceMessageRuntimeSource).not.toContain("'fullUserMessage'");
    expect(chatWorkspaceMessageRuntimeSource).not.toContain("'systemPrompt'");
    expect(chatWorkspaceMessageRuntimeSource).not.toContain("'tokenCounts'");
    expect(chatWorkspaceMessageRuntimeSource).not.toContain("'toolSchemas'");
    expect(conversationDisplayProjectionSource).not.toContain('annotation?.systemPrompt');
    expect(conversationDisplayProjectionSource).not.toContain('annotation?.toolSchemas');
    expect(conversationDisplayProjectionSource).not.toContain('annotation?.fullUserMessage');
    expect(conversationDisplayProjectionSource).not.toContain('annotation?.fullAssistantMessage');
    expect(conversationDisplayProjectionSource).not.toContain('annotation?.tokenCounts');
    expect(conversationDisplayProjectionSource).not.toContain('selectRendererMessageAnnotations');
    expect(conversationDisplayProjectionSource).not.toContain('emptyRendererMessageAnnotations');
    expect(conversationDisplayProjectionSource).not.toContain('hasRendererMessageAnnotations');
    expect(conversationDisplayProjectionSource).toContain('findConversationViewUserDisplayRowForTurn');
    expect(conversationDisplayProjectionSource).toContain('findConversationViewUserDisplayRowForTurn(view, pendingTurnRef)');
    expect(conversationDisplayProjectionSource).toContain('sdkConversationViewEnvelope(conversationView)');
    expect(conversationDisplayProjectionSource).not.toContain('sdkUserTurnRefs');
    expect(conversationDisplayProjectionSource).not.toContain('projectedUserTurns');
    expect(conversationDisplayProjectionSource).toContain('DesktopConversationDisplayRowLookupRuntime');
    expect(conversationDisplayProjectionSource).not.toContain('hasConversationViewUserDisplayRows');
    expect(conversationDisplayRowLookupSource).toContain('findConversationViewUserDisplayRowForTurn');
    expect(conversationDisplayRowLookupSource).toContain('hasConversationViewUserDisplayRows');
    expect(conversationDisplayRowLookupSource).toContain('ConversationView display-row lookup');
    expect(conversationDisplayRowLookupSource).toContain('exactNonEmptyString');
    expect(conversationDisplayRowLookupSource).toContain('function exactConversationRef');
    expect(conversationDisplayRowLookupSource).toContain('const viewConversationRef = exactConversationRef(conversationView?.conversationRef);');
    expect(conversationDisplayRowLookupSource).toContain('exactConversationRef(source.conversationRef) === viewConversationRef');
    expect(conversationDisplayRowLookupSource).toContain("source.role === 'user'");
    expect(conversationDisplayRowLookupSource).toContain('conversationView?.displayRows');
    expect(conversationDisplayRowLookupSource).not.toContain('conversationView as { displayRows?: unknown[] | null }');
    expect(conversationDisplayRowLookupSource).toContain("source.type === 'user_message'");
    expect(conversationDisplayRowLookupSource).not.toContain("source.role === 'user'\n        ||");
    expect(conversationDisplayRowLookupSource).not.toContain('value.trim() ? value.trim()');
    expect(conversationDisplayProjectionSource).not.toContain('function normalizeTurnRef');
    expect(conversationViewWorkspaceRuntimeSource).toContain('findConversationViewUserDisplayRowForTurn');
    expect(conversationViewWorkspaceRuntimeSource).toContain('DesktopConversationDisplayRowLookupRuntime');
    expect(conversationViewWorkspaceRuntimeSource).not.toContain('const hasSameTurnUserDisplayRow = displayRows.some');
    expect(visibleLifecycleRuntimeSource).toContain('findConversationViewUserDisplayRowForTurn');
    expect(visibleLifecycleRuntimeSource).toContain('DesktopConversationDisplayRowLookupRuntime');
    expect(visibleLifecycleRuntimeSource).toContain('DesktopConversationViewWorkspaceRuntime');
    expect(visibleLifecycleRuntimeSource).toContain('hasWorkspaceConversationView({ conversationView })');
    expect(visibleLifecycleRuntimeSource).toContain('function readExactIdentityString');
    expect(visibleLifecycleRuntimeSource).toContain('function readExactLifecycleString');
    expect(visibleLifecycleRuntimeSource).toContain('return readExactIdentityString(value);');
    expect(visibleLifecycleRuntimeSource).toContain('return readExactLifecycleString(sdkLiveTurn?.phase);');
    expect(visibleLifecycleRuntimeSource).toContain('readExactLifecycleString(presentation.lastError)');
    expect(visibleLifecycleRuntimeSource).toContain(
      'readExactLifecycleString(sdkLiveTurn?.presentation?.lastError)',
    );
    expect(visibleLifecycleRuntimeSource).toContain(
      'const responseOverlayMode = readExactLifecycleString(conversationView?.surfaces?.responseOverlay?.mode);',
    );
    expect(visibleLifecycleRuntimeSource).toContain('readExactIdentityString(presentationAnchor.rowId)');
    expect(visibleLifecycleRuntimeSource).toContain("status: 'idle'");
    expect(visibleLifecycleRuntimeSource).toContain("source: 'conversation-view'");
    expect(visibleLifecycleRuntimeSource).not.toContain('turnRef: normalizeTurnRef(conversationView.liveTurn?.turnRef)');
    expect(visibleLifecycleRuntimeSource).not.toContain('return normalizeString(sdkLiveTurn?.phase);');
    expect(visibleLifecycleRuntimeSource).not.toContain('normalizeString(presentation.lastError)');
    expect(visibleLifecycleRuntimeSource).not.toContain('normalizeString(sdkLiveTurn?.presentation?.lastError)');
    expect(visibleLifecycleRuntimeSource).not.toContain(
      'const responseOverlayMode = normalizeString(conversationView?.surfaces?.responseOverlay?.mode);',
    );
    expect(visibleLifecycleRuntimeSource).not.toContain('DesktopConversationDisplayProjection');
    expect(visibleLifecycleRuntimeSource).not.toContain('function isConversationView');
    expect(visibleLifecycleRuntimeSource).not.toContain('function isConversationViewUserDisplayRow');
    expect(visibleLifecycleRuntimeSource).not.toContain('conversationView.displayRows.length - 1');
    expect(chatStoreSource).not.toContain('DesktopPendingTurnBridgeRuntime');
    expect(chatStoreSource).not.toContain('buildPendingTurnUserMessage');
    expect(chatStoreSource).not.toContain('function normalizePendingTurn');
    expect(chatStoreSource).not.toContain('doesPendingTurnMatch');
    expect(chatStoreSource).not.toContain('function doesCurrentTurnProjectionMatch');
    expect(chatStoreSource).not.toContain('input?.currentTurnProjection');
    expect(chatStoreSource).not.toContain('function addSupersededTurnRef');
    expect(chatStoreSource).not.toContain('function removeSupersededTurnRef');
    expect(chatStoreSource).not.toContain('function normalizeTurnRef');
    expect(chatStoreSource).not.toContain('function mergeTurnConversationRefs');
    expect(chatStoreSource).not.toContain('registerRendererTurnConversationRef');
    expect(chatStoreSource).not.toContain('resolveRendererConversationRefForTurn');
    expect(chatStoreSource).not.toContain('registerTurnConversationRef:');
    expect(chatStoreSource).not.toContain('resolveConversationRefForTurn:');
    expect(chatStoreSource).not.toContain('resolvePendingTurnForCurrentProjection');
    expect(chatStoreSource).not.toContain('resolvePendingTurnForSdkLiveTurn');
    expect(chatStoreSource).not.toContain('shouldUpdateLatestView');
    expect(chatStoreSource).not.toContain('Object.keys(latestUpdate)');
    expect(chatWorkspaceStateRuntimeSource).toContain('buildActiveConversationWorkspaceUpdate');
    expect(chatWorkspaceStateRuntimeSource).toContain('DesktopChatWorkspaceStateRuntime');
    expect(chatWorkspaceStateRuntimeSource).not.toContain('getProjectedWorkspaceFields');
    expect(chatWorkspaceStateRuntimeSource).toContain('buildWorkspaceUpdate');
    expect(chatWorkspaceStateRuntimeSource).toContain('resolveWorkspaceMutationTarget');
    expect(chatWorkspaceStateRuntimeSource).toContain('projectWorkspaceReadModelState');
    expect(chatWorkspaceStateRuntimeSource).toContain('export type ChatWorkspaceReadModelState = Pick<');
    expect(chatWorkspaceStateRuntimeSource).toContain('ChatWorkspaceState,');
    expect(chatWorkspaceStateRuntimeSource).toContain("| 'pendingTurn'");
    expect(chatWorkspaceStateRuntimeSource).not.toContain('...workspace,\n    messages: hasConversationView');
    expect(chatWorkspaceStateRuntimeSource).toContain('selectActiveWorkspaceReadModelState');
    expect(chatWorkspaceStateRuntimeSource).not.toContain('function isActiveWorkspaceRef');
    expect(chatWorkspaceStateRuntimeSource).not.toContain('isActiveWorkspaceRef,');
    expect(chatWorkspaceStateRuntimeSource).not.toContain('export function selectActiveWorkspaceState');
    expect(chatWorkspaceStateRuntimeSource).not.toContain('selectActiveWorkspaceState,');
    expect(chatWorkspaceStateRuntimeSource).not.toContain('selectRendererMessageAnnotations(workspace.messages)');
    expect(chatWorkspaceStateRuntimeSource).toContain('readRendererAnnotations(workspace)');
    expect(chatWorkspaceStateRuntimeSource).toContain('readNoViewSdkLiveTurnStorage');
    expect(chatWorkspaceStateRuntimeSource).toContain('buildNoViewSdkLiveTurnStorageUpdate');
    expect(chatWorkspaceStateRuntimeSource).toContain('sdkLiveTurn: null');
    expect(chatWorkspaceStateRuntimeSource).toContain('thinkingStatus: hasConversationView ? null : workspace.thinkingStatus');
    expect(chatWorkspaceStateRuntimeSource).toContain('thinkingSourceEventType: hasConversationView ? null : workspace.thinkingSourceEventType');
    expect(chatWorkspaceStateRuntimeSource).toContain('compactionDebugInfo: hasConversationView ? null : workspace.compactionDebugInfo');
    expect(chatWorkspaceStateRuntimeSource).toContain('tokenCounts: hasConversationView ? null : workspace.tokenCounts');
    expect(chatWorkspaceStateRuntimeSource).toContain('streamTracking: hasConversationView ? emptyStreamTracking : workspace.streamTracking');
    expect(chatWorkspaceStateRuntimeSource).not.toContain('currentTurnProjection: CurrentTurnProjection | null;');
    expect(chatWorkspaceStateRuntimeSource).not.toContain("Omit<ChatWorkspaceState, 'currentTurnProjection'>");
    expect(chatWorkspaceStateRuntimeSource).not.toContain('workspaceWithoutNoViewSdkLiveTurn');
    expect(chatWorkspaceStateRuntimeSource).not.toContain('currentTurnProjection: null');
    expect(chatWorkspaceStateRuntimeSource).not.toContain('buildActiveWorkspaceSnapshot');
    expect(chatWorkspaceStateRuntimeSource).not.toContain('doesWorkspaceMatch');
    expect(chatWorkspaceStateRuntimeSource).not.toContain('activeWorkspaceSnapshot');
    expect(chatWorkspaceStateRuntimeSource).not.toContain('messages?: ChatMessage[];');
    expect(chatWorkspaceStateRuntimeSource).not.toContain('conversationView?: ConversationView | null;');
    expect(chatWorkspaceStateRuntimeSource).not.toContain('pendingTurn?: PendingTurn | null;');
    expect(chatWorkspaceStateRuntimeSource).not.toContain("from './chatStore'");
    expect(chatWorkspaceStateRuntimeSource).toContain('desktopChatMessageTypes');
    expect(chatWorkspaceStateRuntimeSource).not.toContain('export function createInitialStreamTracking');
    expect(chatWorkspaceStateRuntimeSource).toContain('CompactionDebugInfo');
    expect(chatWorkspaceStateRuntimeSource).not.toContain('replacementHistoryPreview: Array');
    expect(chatWorkspaceStateRuntimeSource).toContain('DesktopChatStreamTrackingRuntime');
    expect(chatWorkspaceStateRuntimeSource).toContain('DesktopConversationViewWorkspaceRuntime');
    expect(chatWorkspaceStateRuntimeSource).toContain('hasWorkspaceConversationView(workspace)');
    expect(chatWorkspaceStateRuntimeSource).toContain('conversationView: hasConversationView ? workspace.conversationView : null');
    expect(chatWorkspaceStateRuntimeSource).not.toContain('Boolean(workspace.conversationView)');
    expect(conversationViewWorkspaceRuntimeSource).toContain('buildConversationViewWorkspaceMutation');
    expect(conversationViewWorkspaceRuntimeSource).toContain('buildSetConversationViewStateUpdate');
    expect(conversationViewWorkspaceRuntimeSource).toContain('hasWorkspaceConversationView');
    expect(conversationViewWorkspaceRuntimeSource).toContain('function exactNonEmptyString');
    expect(conversationViewWorkspaceRuntimeSource).toContain('value === value.trim()');
    expect(conversationViewWorkspaceRuntimeSource).toContain('const conversationRef = exactNonEmptyString(source.conversationRef);');
    expect(conversationViewWorkspaceRuntimeSource).toContain('const turnRef = exactNonEmptyString(source.turnRef);');
    expect(conversationViewWorkspaceRuntimeSource).toContain('const id = exactNonEmptyString(source.id);');
    expect(conversationViewWorkspaceRuntimeSource).toContain('const conversationRef = exactNonEmptyString(conversationView.conversationRef);');
    expect(conversationViewWorkspaceRuntimeSource).toContain('exactNonEmptyString(liveTurn?.turnRef)');
    expect(conversationViewWorkspaceRuntimeSource).toContain('exactNonEmptyString(responseOverlay?.turnRef)');
    expect(conversationViewWorkspaceRuntimeSource).toContain('const phase = exactNonEmptyString(liveTurn?.phase);');
    expect(conversationViewWorkspaceRuntimeSource).toContain('function isObjectRecord');
    expect(conversationViewWorkspaceRuntimeSource).toContain('Array.isArray(source.displayRows)');
    expect(conversationViewWorkspaceRuntimeSource).toContain('isObjectRecord(source.liveTurn)');
    expect(conversationViewWorkspaceRuntimeSource).toContain('isObjectRecord(source.surfaces)');
    expect(conversationViewWorkspaceRuntimeSource).toContain('isObjectRecord(source.actions)');
    expect(conversationViewWorkspaceRuntimeSource).not.toContain("typeof source.conversationRef === 'string'");
    expect(conversationViewWorkspaceRuntimeSource).not.toContain('function normalizeString(value: unknown)');
    expect(conversationViewWorkspaceRuntimeSource).not.toContain('buildSetLatestConversationViewStateUpdate');
    expect(conversationViewWorkspaceRuntimeSource).not.toContain('hasLatestConversationViewUpdate');
    expect(conversationViewWorkspaceRuntimeSource).not.toContain('latestConversationView');
    expect(conversationViewWorkspaceRuntimeSource).toContain('shouldClearPendingTurnForConversationView');
    expect(conversationViewWorkspaceRuntimeSource).toContain('pendingTurn: null');
    expect(conversationViewWorkspaceRuntimeSource).not.toContain('features/chat');
    expect(pendingStateRuntimeSource).toContain('normalizePendingTurn');
    expect(pendingStateRuntimeSource).toContain('doesPendingTurnMatch');
    expect(pendingStateRuntimeSource).toContain('readExactIdentityString');
    expect(pendingStateRuntimeSource).toContain('buildAcceptPendingTurnStateUpdate');
    expect(pendingStateRuntimeSource).not.toContain('buildAcceptReplayPendingTurnStateUpdate');
    expect(pendingStateRuntimeSource).toContain('buildClearPendingTurnStateUpdate');
    expect(pendingStateRuntimeSource).toContain('buildPendingTurnBroadcastStateUpdate');
    expect(pendingStateRuntimeSource).toContain('buildPendingTurnWorkspaceMutation');
    expect(pendingStateRuntimeSource).toContain('buildPendingTurnClearWorkspaceMutation');
    expect(pendingStateRuntimeSource).toContain('buildPendingTurnUserMessage');
    expect(pendingStateRuntimeSource).toContain('const nextMessages = currentWorkspace.messages');
    expect(pendingStateRuntimeSource).not.toContain('mergePendingTurnMessage');
    expect(pendingStateRuntimeSource).not.toContain('const shouldPreserveViewReadModel = preserveConversationView');
    expect(pendingStateRuntimeSource).not.toContain('&& hasConversationView(currentWorkspace.conversationView)');
    expect(pendingStateRuntimeSource).not.toContain('? currentWorkspace.messages');
    expect(pendingStateRuntimeSource).not.toContain('currentWorkspace.messages.find((message)');
    expect(pendingStateRuntimeSource).toContain('buildNoViewSdkLiveTurnStorageUpdate(currentWorkspace, null)');
    expect(pendingStateRuntimeSource).not.toContain('currentTurnProjection: null');
    expect(pendingStateRuntimeSource).not.toContain('currentTurnProjection: unknown');
    expect(pendingStateRuntimeSource).not.toContain('attachmentFilenames');
    expect(pendingStateRuntimeSource).not.toContain('addSupersededTurnRef');
    expect(pendingStateRuntimeSource).not.toContain('removeSupersededTurnRef');
    expect(pendingStateRuntimeSource).not.toContain('normalizeConversationRef');
    expect(pendingStateRuntimeSource).not.toContain('normalizeTurnRef');
    expect(clearMessagesRuntimeSource).toContain('buildClearMessagesStateUpdate');
    expect(clearMessagesRuntimeSource).toContain('createInitialStreamTracking');
    expect(clearMessagesRuntimeSource).toContain('buildNoViewSdkLiveTurnStorageUpdate(currentWorkspace, null)');
    expect(clearMessagesRuntimeSource).not.toContain('currentTurnProjection: null');
    expect(clearMessagesRuntimeSource).not.toContain('currentTurnProjection: unknown');
    expect(clearMessagesRuntimeSource).not.toContain('features/chat');
    expect(trackingRuntimeSource).toContain('createInitialStreamTracking');
    expect(workspaceMessageRuntimeSource).toContain('buildAddMessageStateUpdate');
    expect(workspaceMessageRuntimeSource).toContain('buildUpdateMessageStateUpdate');
    expect(workspaceMessageRuntimeSource).toContain('buildUpdateStreamTargetMessageStateUpdate');
    expect(workspaceMessageRuntimeSource).toContain('buildSetMessagesStateUpdate');
    expect(workspaceMessageRuntimeSource).toContain('existingMessageIndex');
    expect(workspaceMessageRuntimeSource).toContain('DesktopConversationViewWorkspaceRuntime');
    expect(workspaceMessageRuntimeSource).toContain('hasWorkspaceConversationView(currentWorkspace)');
    expect(workspaceMessageRuntimeSource).not.toContain('function hasConversationView');
    expect(workspaceMessageRuntimeSource).not.toContain('hasConversationView(currentWorkspace.conversationView)');
    expect(workspaceMessageRuntimeSource).toContain('selectRendererAnnotationUpdates');
    expect(workspaceMessageRuntimeSource).toContain('function exactAnnotationRowId');
    expect(workspaceMessageRuntimeSource).toContain('const annotationRowId = exactAnnotationRowId(id);');
    expect(workspaceMessageRuntimeSource).toContain('!annotationUpdates || !annotationRowId');
    expect(workspaceMessageRuntimeSource).toContain('annotationRowId,');
    expect(workspaceMessageRuntimeSource).toContain('recordTurnConversationRefs');
    expect(workspaceMessageRuntimeSource).not.toContain('turnConversationRefs:');
    expect(workspaceMessageRuntimeSource).not.toContain('features/chat');
    expect(workspaceFieldRuntimeSource).toContain('buildSetWorkspaceFieldStateUpdate');
    expect(workspaceFieldRuntimeSource).not.toContain('features/chat');
    expect(stopTurnRuntimeSource).toContain('buildStoppedTurnWorkspaceMutation');
    expect(stopTurnRuntimeSource).toContain('buildAcceptStoppedTurnStateUpdate');
    expect(stopTurnRuntimeSource).not.toContain('features/chat');
    expect(turnConversationRefRuntimeSource).toContain('normalizeTurnRef');
    expect(turnConversationRefRuntimeSource).toContain(
      'turnRef.length > 0 && turnRef === turnRef.trim()',
    );
    expect(turnConversationRefRuntimeSource).toContain(
      'conversationRef.length > 0 && conversationRef === conversationRef.trim()',
    );
    expect(turnConversationRefRuntimeSource).not.toContain(
      'const normalizedTurnRef = turnRef.trim()',
    );
    expect(turnConversationRefRuntimeSource).not.toContain(
      'const normalizedConversationRef = conversationRef.trim()',
    );
    expect(turnConversationRefRuntimeSource).toContain('mergeTurnConversationRefs');
    expect(turnConversationRefRuntimeSource).toContain('registerTurnConversationRef');
    expect(turnConversationRefRuntimeSource).toContain('registerRendererTurnConversationRef');
    expect(turnConversationRefRuntimeSource).toContain('resolveRendererConversationRefForTurn');
    expect(turnConversationRefRuntimeSource).not.toContain('buildRegisterTurnConversationRefStateUpdate');
    expect(turnConversationRefRuntimeSource).toContain('resolveConversationRefForTurn');
    expect(turnConversationRefRuntimeSource).not.toContain('features/chat');
    expect(currentTurnWorkspaceRuntimeSource).toContain('buildNoViewSdkLiveTurnWorkspaceMutation');
    expect(currentTurnWorkspaceRuntimeSource).not.toContain('buildCurrentTurnWorkspaceMutation');
    expect(currentTurnWorkspaceRuntimeSource).toContain('buildSetNoViewSdkLiveTurnStateUpdate');
    expect(currentTurnWorkspaceRuntimeSource).toContain('resolvePendingTurnForSdkLiveTurn');
    expect(currentTurnWorkspaceRuntimeSource).toContain('readNoViewSdkLiveTurnStorage(currentWorkspace)');
    expect(currentTurnWorkspaceRuntimeSource).toContain('buildNoViewSdkLiveTurnStorageUpdate(currentWorkspace');
    expect(currentTurnWorkspaceRuntimeSource).toContain('hasWorkspaceConversationView(currentWorkspace)');
    expect(currentTurnWorkspaceRuntimeSource).not.toContain('function hasConversationView');
    expect(currentTurnWorkspaceRuntimeSource).not.toContain('hasConversationView(currentWorkspace.conversationView)');
    expect(currentTurnWorkspaceRuntimeSource).not.toContain('currentWorkspace.currentTurnProjection');
    expect(currentTurnWorkspaceRuntimeSource).not.toContain('resolvePendingTurnForCurrentProjection');
    expect(currentTurnWorkspaceRuntimeSource).not.toContain('features/chat');
    expect(chatStoreSource).not.toContain("sourceEventType: 'renderer-compose'");
    expect(pendingBridgeSource).toContain("sourceEventType: 'renderer-compose'");
    expect(pendingBridgeSource).toContain('hasOnlyPendingTurnBridgeFields');
    expect(pendingBridgeSource).toContain('pendingTurnBridgeFields');
    expect(pendingBridgeSource).not.toContain('attachments: null');
    expect(pendingBridgeSource).not.toContain('attachmentFilenames');
    expect(pendingBridgeSource).not.toContain('readSdkDisplayAttachments');
    expect(pendingBridgeSource).not.toContain('screenshotRef');
    expect(pendingBridgeSource).not.toContain('screenshot_refs');
    expect(pendingBridgeSource).not.toContain('kind:');
    expect(pendingBridgeSource).not.toContain('status:');
    expect(chatStoreSource).not.toContain('export interface ChatMessage');
    expect(chatStoreSource).not.toContain('SdkCurrentTurnProjection');
    expect(chatStoreSource).not.toContain('DEFAULT_CHAT_WORKSPACE_REF');
    await expect(fs.stat(sourceChannelPath)).rejects.toThrow();
  });
});
