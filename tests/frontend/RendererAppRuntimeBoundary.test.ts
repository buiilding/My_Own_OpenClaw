/**
 * Covers renderer app runtime boundary. behavior in the frontend test suite.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const appRoot = path.resolve(__dirname, '../../frontend/src/renderer/app');
const rendererRoot = path.resolve(__dirname, '../../frontend/src/renderer');
const allowedRelativePaths = new Set<string>();
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

async function collectSourceNeedleOffenders(
  root: string,
  forbiddenNeedles: string[],
): Promise<string[]> {
  const files = await listSourceFiles(root);
  const offenders: string[] = [];

  for (const file of files) {
    const relativePath = normalizeRelativePath(path.relative(root, file));
    const source = await fs.readFile(file, 'utf8');
    for (const needle of forbiddenNeedles) {
      if (source.includes(needle)) {
        offenders.push(`${relativePath} -> ${needle}`);
      }
    }
  }

  return offenders;
}

describe('renderer app runtime boundary', () => {
  test('renderer skin and app runtime contracts use generic chat desktop UI wording', async () => {
    const skinSource = await fs.readFile(
      path.join(appRoot, 'skin/windieDesktopSkin.js'),
      'utf8',
    );
    const contractsSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopConversationRuntimeContracts.ts'),
      'utf8',
    );

    expect(skinSource).toContain('generic chat desktop UI');
    expect(skinSource).not.toContain('generic desktop runtime UI');
    expect(skinSource).not.toContain('generic desktop agent UI');
    expect(contractsSource).toContain('renderer feature clients');
    expect(contractsSource).not.toContain('infrastructure/api/agentSdkClient');
  });

  test('app runtime helper comments use renderer app-runtime labels', async () => {
    const offenders = await collectSourceNeedleOffenders(path.join(appRoot, 'runtime'), [
      'renderer runtime clients',
      'renderer runtime consumers',
      'for the renderer runtime',
      'desktop live turn runtime client',
      'desktop transcript session runtime client',
    ]);

    expect(offenders).toEqual([]);
  });

  test('app runtime SDK consumers route through the conversation contracts facade', async () => {
    const files = await listSourceFiles(path.join(appRoot, 'runtime'));
    const offenders: string[] = [];

    for (const file of files) {
      const relativePath = normalizeRelativePath(path.relative(appRoot, file));
      if (relativePath === 'runtime/desktopConversationRuntimeContracts.ts') {
        continue;
      }
      const source = await fs.readFile(file, 'utf8');
      if (source.includes('infrastructure/api/agentSdkClient')) {
        offenders.push(relativePath);
      }
    }

    const contractsSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopConversationRuntimeContracts.ts'),
      'utf8',
    );

    expect(offenders).toEqual([]);
    expect(contractsSource).toContain("packages/windie-sdk-js/src");
    expect(contractsSource).not.toContain("export * from '../../../../../packages/windie-sdk-js/src';");
    expect(contractsSource).not.toContain('infrastructure/api/agentSdkClient');
  });

  test('renderer transcript SDK adapters import narrow SDK owner contracts', async () => {
    const displayProjectionSource = await fs.readFile(
      path.join(rendererRoot, 'infrastructure/transcript/sdkDisplayChatMessageProjection.ts'),
      'utf8',
    );
    const conversationStoreSource = await fs.readFile(
      path.join(rendererRoot, 'infrastructure/transcript/desktopConversationStore.ts'),
      'utf8',
    );

    expect(displayProjectionSource).toContain('packages/windie-sdk-js/src/conversation/types.js');
    expect(displayProjectionSource).not.toContain("packages/windie-sdk-js/src';");
    expect(conversationStoreSource).toContain('packages/windie-sdk-js/src/conversation/types.js');
    expect(conversationStoreSource).toContain('packages/windie-sdk-js/src/projections/conversationProjections.js');
    expect(conversationStoreSource).toContain('packages/windie-sdk-js/src/runtime/SdkRuntimeCommands.js');
    expect(conversationStoreSource).not.toContain("packages/windie-sdk-js/src';");
  });

  test('frontend architecture docs describe renderer skin facades with chat desktop UI wording', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../../docs/architecture/frontend_architecture.md'),
      'utf8',
    );

    expect(source).toContain('active chat desktop UI skin');
    expect(source).not.toContain('active desktop-runtime skin');
    expect(source).not.toContain(`active desktop-${'agent'} skin`);
  });

  test('frontend architecture docs route session rules through app runtime', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../../docs/architecture/frontend_architecture.md'),
      'utf8',
    );

    expect(source).toContain('renderer/app/runtime/desktopConversationSessionRuntime.ts');
    expect(source).not.toContain('renderer/features/chat/session/conversationSessionRuntime.ts');
  });

  test('audio chunk payload parsing stays behind the app runtime audio client', async () => {
    const audioRuntimeSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopAudioRuntimeClient.ts'),
      'utf8',
    );
    const chatBindingsSource = await fs.readFile(
      path.join(rendererRoot, 'features/chat/hooks/useChatInterfaceBindings.js'),
      'utf8',
    );

    expect(audioRuntimeSource).toContain('function extractDesktopAudioChunkPayload');
    expect(audioRuntimeSource).not.toContain('export function extractDesktopAudioChunkPayload');
    expect(audioRuntimeSource).toContain('ON_CHANNELS.AUDIO_CHUNK');
    expect(chatBindingsSource).toContain('DesktopAudioRuntimeClient.onAudioChunk');
    expect(chatBindingsSource).not.toContain('audioChunkEvents');
    expect(chatBindingsSource).not.toContain('extractAudioChunkPayload');
    expect(chatBindingsSource).not.toContain("event.type !== 'audio-chunk'");
  });

  test('chatbox layout and drag rules stay behind the app runtime facade', async () => {
    const layoutRuntimeSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopChatboxLayoutRuntime.js'),
      'utf8',
    );
    const pillSource = await fs.readFile(
      path.join(rendererRoot, 'features/minimalChatPill/components/MinimalChatPill.jsx'),
      'utf8',
    );
    const bindingsSource = await fs.readFile(
      path.join(rendererRoot, 'features/minimalChatPill/hooks/useMinimalChatPillBindings.js'),
      'utf8',
    );

    expect(layoutRuntimeSource).toContain('resolveChatboxVisualAnchorHeight');
    expect(layoutRuntimeSource).toContain('resolveChatboxNativeFrameHeight');
    expect(layoutRuntimeSource).toContain('DesktopChatboxLayoutRuntime');
    expect(layoutRuntimeSource).not.toContain('export function createChatboxDragState');
    expect(layoutRuntimeSource).not.toContain('export function resolveChatboxVisualAnchorHeight');
    expect(layoutRuntimeSource).not.toContain('export function resolveChatboxNativeFrameHeight');
    expect(layoutRuntimeSource).not.toContain('export function startChatboxDrag');
    expect(layoutRuntimeSource).not.toContain('export function stopChatboxDrag');
    expect(layoutRuntimeSource).not.toContain('export function getChatboxDragTarget');
    expect(layoutRuntimeSource).not.toContain('export function getChatboxCloseBumpHeight');
    expect(layoutRuntimeSource).not.toContain('export const CHATBOX_WINDOW_FRAME_HEIGHT_PADDING');
    expect(layoutRuntimeSource).not.toContain('export const CHATBOX_VISUAL_ANCHOR_HEIGHT_COMPACT');
    expect(layoutRuntimeSource).toContain('createChatboxDragState');
    expect(layoutRuntimeSource).toContain('getChatboxDragTarget');
    expect(layoutRuntimeSource).not.toContain('features/chat');
    expect(layoutRuntimeSource).not.toContain('features/minimalChatPill');
    expect(pillSource).toContain('desktopChatboxLayoutRuntime');
    expect(bindingsSource).toContain('desktopChatboxLayoutRuntime');
    expect(pillSource).toContain('DesktopChatboxLayoutRuntime.resolveChatboxNativeFrameHeight');
    expect(bindingsSource).toContain('DesktopChatboxLayoutRuntime.resolveChatboxVisualAnchorHeight');
    expect(pillSource).not.toContain('CHATBOX_WINDOW_FRAME_HEIGHT_PADDING');
    expect(bindingsSource).not.toContain('CHATBOX_VISUAL_ANCHOR_HEIGHT_COMPACT');
    expect(pillSource).not.toContain('minimalChatPillLayout');
    expect(pillSource).not.toContain('chat/utils/state/chatBoxState');
    expect(bindingsSource).not.toContain('chat/utils/state/chatBoxState');
    await expect(fs.stat(
      path.join(rendererRoot, 'features/chat/utils/state/chatBoxState.js'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.join(rendererRoot, 'features/minimalChatPill/utils/minimalChatPillLayout.js'),
    )).rejects.toThrow();
  });

  test('attachment preview labels stay behind the app runtime facade', async () => {
    const attachmentRuntimeSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopAttachmentPresentationRuntime.js'),
      'utf8',
    );
    const messageInputSource = await fs.readFile(
      path.join(rendererRoot, 'features/chat/components/MessageInput.jsx'),
      'utf8',
    );
    const previewRowSource = await fs.readFile(
      path.join(rendererRoot, 'features/minimalChatPill/components/AttachmentPreviewRow.jsx'),
      'utf8',
    );

    expect(attachmentRuntimeSource).toContain('resolveReadableFileTypeLabel');
    expect(attachmentRuntimeSource).toContain('DesktopAttachmentPresentationRuntime');
    expect(attachmentRuntimeSource).not.toContain('export function resolveReadableFileTypeLabel');
    expect(attachmentRuntimeSource).not.toContain('features/chat');
    expect(messageInputSource).toContain('desktopAttachmentPresentationRuntime');
    expect(previewRowSource).toContain('desktopAttachmentPresentationRuntime');
    expect(messageInputSource).toContain('DesktopAttachmentPresentationRuntime.resolveReadableFileTypeLabel');
    expect(previewRowSource).toContain('DesktopAttachmentPresentationRuntime.resolveReadableFileTypeLabel');
    expect(messageInputSource).not.toContain('utils/composerAttachmentPresentation');
    expect(previewRowSource).not.toContain('chat/utils/composerAttachmentPresentation');
    await expect(fs.stat(
      path.join(rendererRoot, 'features/chat/utils/composerAttachmentPresentation.js'),
    )).rejects.toThrow();
  });

  test('dev UI flag stays behind the app runtime facade', async () => {
    const devUiRuntimeSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopDevUiRuntime.js'),
      'utf8',
    );
    const chatInterfaceSource = await fs.readFile(
      path.join(rendererRoot, 'features/chat/components/ChatInterface.jsx'),
      'utf8',
    );
    const chatSurfaceControllerSource = await fs.readFile(
      path.join(rendererRoot, 'features/chat/hooks/useChatSurfaceController.js'),
      'utf8',
    );
    const minimalPillSource = await fs.readFile(
      path.join(rendererRoot, 'features/minimalChatPill/components/MinimalChatPill.jsx'),
      'utf8',
    );

    expect(devUiRuntimeSource).toContain('dev_ui');
    expect(devUiRuntimeSource).not.toContain('features/chat');
    expect(chatInterfaceSource).toContain('desktopDevUiRuntime');
    expect(minimalPillSource).toContain('desktopDevUiRuntime');
    expect(chatInterfaceSource).not.toContain('utils/devUiFlag');
    expect(minimalPillSource).not.toContain('chat/utils/devUiFlag');
    await expect(fs.stat(
      path.join(rendererRoot, 'features/chat/utils/devUiFlag.js'),
    )).rejects.toThrow();
  });

  test('chat pill state trace payload shaping stays behind the app runtime facade', async () => {
    const traceRuntimeSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopRendererTraceRuntime.ts'),
      'utf8',
    );
    const minimalPillSource = await fs.readFile(
      path.join(rendererRoot, 'features/minimalChatPill/components/MinimalChatPill.jsx'),
      'utf8',
    );

    expect(traceRuntimeSource).toContain('buildRendererChatPillStateTracePayload');
    expect(traceRuntimeSource).toContain('logRendererChatPillStateTrace');
    expect(traceRuntimeSource).toContain('buildRendererChatPillResetTracePayload');
    expect(traceRuntimeSource).toContain('logRendererChatPillResetTrace');
    expect(traceRuntimeSource).toContain('buildRendererChatPillLifecycleTracePayload');
    expect(traceRuntimeSource).toContain('logRendererChatPillLifecycleTrace');
    expect(traceRuntimeSource).toContain('buildRendererChatPillHitTestTracePayload');
    expect(traceRuntimeSource).toContain('logRendererChatPillHitTestTrace');
    expect(traceRuntimeSource).toContain('conversation_ref');
    expect(traceRuntimeSource).toContain('current_turn_phase');
    expect(minimalPillSource).toContain('logRendererChatPillResetTrace');
    expect(minimalPillSource).toContain('logRendererChatPillLifecycleTrace');
    expect(minimalPillSource).toContain('logRendererChatPillHitTestTrace');
    expect(minimalPillSource).toContain('logRendererChatPillStateTrace');
    expect(minimalPillSource).not.toContain("logRendererLiveSurfaceTrace");
    expect(minimalPillSource).not.toContain("'turn_surface.reset'");
    expect(minimalPillSource).not.toContain("'renderer.chat_pill.mount'");
    expect(minimalPillSource).not.toContain("'renderer.chat_pill.unmount'");
    expect(minimalPillSource).not.toContain("'chat_pill.hit_test.set'");
    expect(minimalPillSource).not.toContain('renderer-normal-hit-test-request');
    expect(minimalPillSource).not.toContain('ignoreMouseEvents');
    expect(minimalPillSource).not.toContain('conversation_ref');
    expect(minimalPillSource).not.toContain('current_turn_phase');
    expect(minimalPillSource).not.toContain('live_turn_phase');
    expect(minimalPillSource).not.toContain('message_count');
  });

  test('response overlay trace payload shaping stays behind the app runtime facade', async () => {
    const traceRuntimeSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopRendererTraceRuntime.ts'),
      'utf8',
    );
    const responseOverlaySource = await fs.readFile(
      path.join(rendererRoot, 'features/minimalChatPill/components/MinimalResponseOverlay.jsx'),
      'utf8',
    );
    const responseOverlayViewModelSource = await fs.readFile(
      path.join(rendererRoot, 'features/minimalChatPill/hooks/useResponseOverlayViewModel.js'),
      'utf8',
    );

    expect(traceRuntimeSource).toContain('buildRendererResponseOverlayStateTracePayload');
    expect(traceRuntimeSource).toContain('logRendererResponseOverlayStateTrace');
    expect(traceRuntimeSource).toContain('buildRendererResponseOverlayHitTestTracePayload');
    expect(traceRuntimeSource).toContain('logRendererResponseOverlayHitTestTrace');
    expect(traceRuntimeSource).toContain('buildRendererResponseOverlayTypingRenderedTracePayload');
    expect(traceRuntimeSource).toContain('logRendererResponseOverlayTypingRenderedTrace');
    expect(traceRuntimeSource).toContain('buildRendererResponseSurfaceSnapshotTracePayload');
    expect(traceRuntimeSource).toContain('logRendererResponseSurfaceSnapshotTrace');
    expect(traceRuntimeSource).toContain('buildRendererResponseSurfaceRenderTracePayload');
    expect(traceRuntimeSource).toContain('logRendererResponseSurfaceRenderTrace');
    expect(traceRuntimeSource).toContain('buildRendererOverlayViewModelTracePayload');
    expect(traceRuntimeSource).toContain('buildRendererOverlayTypingTraceEvent');
    expect(traceRuntimeSource).toContain('buildRendererOverlayIntentTraceEvent');
    expect(traceRuntimeSource).toContain('logRendererOverlayViewModelTrace');
    expect(traceRuntimeSource).toContain('logRendererOverlayViewModelResolvedTrace');
    expect(responseOverlaySource).toContain('logRendererResponseOverlayStateTrace');
    expect(responseOverlaySource).toContain('logRendererResponseOverlayHitTestTrace');
    expect(responseOverlaySource).toContain('logRendererResponseOverlayTypingRenderedTrace');
    expect(responseOverlaySource).toContain('logRendererResponseSurfaceSnapshotTrace');
    expect(responseOverlaySource).toContain('logRendererResponseSurfaceRenderTrace');
    expect(responseOverlaySource).not.toContain("logRendererLiveSurfaceTrace");
    expect(responseOverlaySource).not.toContain("logRendererResponseSurfaceTrace");
    expect(responseOverlaySource).not.toContain("'response_overlay.hit_test.set'");
    expect(responseOverlaySource).not.toContain("'typing.rendered.show'");
    expect(responseOverlaySource).not.toContain("'typing.rendered.hide'");
    expect(responseOverlaySource).not.toContain('awaiting-indicator-rendered');
    expect(responseOverlaySource).not.toContain('awaiting-indicator-not-rendered');
    expect(responseOverlaySource).not.toContain('ignoreMouseEvents');
    expect(responseOverlayViewModelSource).toContain('buildRendererOverlayViewModelTracePayload');
    expect(responseOverlayViewModelSource).toContain('logRendererOverlayViewModelTrace');
    expect(responseOverlayViewModelSource).toContain('logRendererOverlayViewModelResolvedTrace');
    expect(responseOverlaySource).not.toContain('turn_id');
    expect(responseOverlaySource).not.toContain('is_visible');
    expect(responseOverlaySource).not.toContain('show_awaiting_reply');
    expect(responseOverlaySource).not.toContain('response_layout_mode');
    expect(responseOverlaySource).not.toContain('visible_response_id');
    expect(responseOverlaySource).not.toContain('response_entry_count');
    expect(responseOverlaySource).not.toContain('active_response_text_length');
    expect(responseOverlaySource).not.toContain('thinking_text_length');
    expect(responseOverlaySource).not.toContain('is_sending');
    expect(responseOverlaySource).not.toContain('message_count');
    expect(responseOverlaySource).not.toContain('overlayPhase');
    expect(responseOverlaySource).not.toContain('activeResponseType');
    expect(responseOverlayViewModelSource).not.toContain("logRendererLiveSurfaceTrace");
    expect(responseOverlayViewModelSource).not.toContain("'renderer.overlay_view_model.resolved'");
    expect(responseOverlayViewModelSource).not.toContain("'typing.show'");
    expect(responseOverlayViewModelSource).not.toContain("'response_overlay.intent.show_awaiting'");
    expect(responseOverlayViewModelSource).not.toContain("renderer-view-model-awaiting");
  });

  test('response overlay phase contract stays behind the app runtime facade', async () => {
    const phaseRuntimeSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopResponseOverlayPhaseRuntime.js'),
      'utf8',
    );
    const streamPhaseSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopStreamPhaseRuntime.js'),
      'utf8',
    );
    const liveSurfaceSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopLiveTurnSurfaceRuntime.js'),
      'utf8',
    );
    const chatSurfaceControllerSource = await fs.readFile(
      path.join(rendererRoot, 'features/chat/hooks/useChatSurfaceController.js'),
      'utf8',
    );

    expect(phaseRuntimeSource).toContain('response_overlay_phase_contract.json');
    expect(phaseRuntimeSource).not.toContain('features/chat');
    expect(phaseRuntimeSource).not.toContain('export const RESPONSE_OVERLAY_PHASE');
    expect(phaseRuntimeSource).not.toContain('export const RESPONSE_OVERLAY_PREFLIGHT_GUARD_REF');
    expect(phaseRuntimeSource).toContain('export const DesktopResponseOverlayPhaseRuntime = Object.freeze');
    expect(phaseRuntimeSource).toContain('getResponseOverlayPhaseValues');
    expect(phaseRuntimeSource).toContain('getResponseOverlayPreflightGuardRef');
    expect(phaseRuntimeSource).toContain('isStreamingResponseOverlayPhase');
    expect(phaseRuntimeSource).not.toContain('export function getResponseOverlayPhaseValues');
    expect(phaseRuntimeSource).not.toContain('export function getResponseOverlayPreflightGuardRef');
    expect(phaseRuntimeSource).not.toContain('export function isStreamingResponseOverlayPhase');
    expect(streamPhaseSource).not.toContain('features/chat');
    expect(streamPhaseSource).toContain('export const DesktopStreamPhaseRuntime = Object.freeze');
    expect(streamPhaseSource).not.toContain('export function isOverlayAwaitingReplyPhase');
    expect(liveSurfaceSource).not.toContain('features/chat');
    expect(liveSurfaceSource).not.toContain('features/minimalChatPill');
    expect(streamPhaseSource).not.toContain('RESPONSE_OVERLAY_PHASE.');
    expect(liveSurfaceSource).not.toContain('RESPONSE_OVERLAY_PHASE.');
    expect(liveSurfaceSource).not.toContain('RESPONSE_OVERLAY_PREFLIGHT_GUARD_REF');
    expect(streamPhaseSource).toContain('desktopResponseOverlayPhaseRuntime');
    expect(liveSurfaceSource).toContain('desktopResponseOverlayPhaseRuntime');
    expect(streamPhaseSource).toContain('DesktopResponseOverlayPhaseRuntime');
    expect(liveSurfaceSource).toContain('DesktopResponseOverlayPhaseRuntime');
    expect(chatSurfaceControllerSource).toContain('desktopLiveTurnSurfaceRuntime');
    expect(streamPhaseSource).not.toContain('responseOverlayPhaseContract');
    expect(liveSurfaceSource).not.toContain('responseOverlayPhaseContract');
    await expect(fs.stat(
      path.join(rendererRoot, 'features/chat/utils/overlay/responseOverlayPhaseContract.js'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.join(rendererRoot, 'features/chat/utils/state/liveTurnSurfaceState.js'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.join(rendererRoot, 'features/chat/utils/state/streamPhaseState.js'),
    )).rejects.toThrow();
  });

  test('current-turn message projection stays behind the app runtime facade', async () => {
    const currentTurnMessageSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopCurrentTurnMessageRuntime.js'),
      'utf8',
    );
    const overlayViewModelSource = await fs.readFile(
      path.join(rendererRoot, 'features/minimalChatPill/hooks/useResponseOverlayViewModel.js'),
      'utf8',
    );
    const chatInterfaceSource = await fs.readFile(
      path.join(rendererRoot, 'features/chat/components/ChatInterface.jsx'),
      'utf8',
    );
    const chatSurfaceControllerSource = await fs.readFile(
      path.join(rendererRoot, 'features/chat/hooks/useChatSurfaceController.js'),
      'utf8',
    );
    const threadPresentationSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopThreadPresentationRuntime.js'),
      'utf8',
    );
    const currentTurnPresentationSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopCurrentTurnPresentationRuntime.js'),
      'utf8',
    );
    const presentationSourceChannelsSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopPresentationSourceChannels.js'),
      'utf8',
    );

    expect(currentTurnMessageSource).toContain('desktopChatMessageRuntimeClient');
    expect(currentTurnMessageSource).toContain('desktopPresentationSourceChannels');
    expect(currentTurnMessageSource).toContain('desktopArtifactRuntimeClient');
    expect(currentTurnMessageSource).toContain('isVisibleResponseOverlayMessage');
    expect(currentTurnMessageSource).toContain('isResponseOverlayProgressMessage');
    expect(currentTurnMessageSource).toContain('isResponseOverlaySourceTaggedMessage');
    expect(currentTurnMessageSource).not.toContain('features/chat');
    expect(currentTurnMessageSource).not.toContain('features/minimalChatPill');
    expect(threadPresentationSource).toContain('desktopCurrentTurnMessageRuntime');
    expect(threadPresentationSource).toContain('desktopPresentationSourceChannels');
    expect(threadPresentationSource).toContain('DesktopPresentationSourceChannels');
    expect(threadPresentationSource).not.toContain('import { isSdkCurrentTurnSourceChannel }');
    expect(threadPresentationSource).not.toContain('features/chat');
    expect(threadPresentationSource).not.toContain('features/minimalChatPill');
    expect(presentationSourceChannelsSource).toContain('export const DesktopPresentationSourceChannels = Object.freeze');
    expect(presentationSourceChannelsSource).toContain('getSdkConversationEventSourceChannel');
    expect(presentationSourceChannelsSource).toContain('getSdkCurrentTurnSourceChannel');
    expect(presentationSourceChannelsSource).toContain('getSdkDisplayRowsSourceChannel');
    expect(presentationSourceChannelsSource).toContain('isSdkCurrentTurnSourceChannel');
    expect(presentationSourceChannelsSource).not.toContain('export function getSdkConversationEventSourceChannel');
    expect(presentationSourceChannelsSource).not.toContain('export function getSdkCurrentTurnSourceChannel');
    expect(presentationSourceChannelsSource).not.toContain('export function getSdkDisplayRowsSourceChannel');
    expect(presentationSourceChannelsSource).not.toContain('export function isSdkCurrentTurnSourceChannel');
    expect(presentationSourceChannelsSource).not.toContain('export const SDK_CONVERSATION_EVENT_SOURCE_CHANNEL');
    expect(presentationSourceChannelsSource).not.toContain('export const SDK_CURRENT_TURN_SOURCE_CHANNEL');
    expect(presentationSourceChannelsSource).not.toContain('export const SDK_DISPLAY_ROWS_SOURCE_CHANNEL');
    expect(currentTurnPresentationSource).toContain('desktopChatLoopUiRuntime');
    expect(currentTurnPresentationSource).toContain('DesktopChatLoopUiRuntime');
    expect(currentTurnPresentationSource).toContain('desktopOverlayTurnLifecycleRuntime');
    expect(currentTurnPresentationSource).toContain('export const DesktopCurrentTurnPresentationRuntime = Object.freeze');
    expect(currentTurnPresentationSource).toContain('resolveSdkCurrentTurnPresentationState');
    expect(currentTurnPresentationSource).toContain('resolveResponseOverlayDismissalTarget');
    expect(currentTurnPresentationSource).toContain('resolveSdkOverlayIntent');
    expect(currentTurnPresentationSource).not.toContain('export function findLatestVisibleAssistantReply');
    expect(currentTurnPresentationSource).not.toContain('export function resolveCurrentTurnPresentationState');
    expect(currentTurnPresentationSource).not.toContain('export function resolveSdkCurrentTurnPresentationState');
    expect(currentTurnPresentationSource).not.toContain('export function resolveResponseOverlayDismissalTarget');
    expect(currentTurnPresentationSource).not.toContain('export const VISIBLE_ASSISTANT_REPLY_TYPE_SET');
    expect(currentTurnPresentationSource).not.toContain('features/chat');
    expect(currentTurnPresentationSource).not.toContain('features/minimalChatPill');
    expect(overlayViewModelSource).toContain('DesktopCurrentTurnPresentationRuntime');
    expect(overlayViewModelSource).toContain('resolveSdkCurrentTurnPresentationState');
    expect(overlayViewModelSource).toContain('resolveResponseOverlayDismissalTarget');
    expect(overlayViewModelSource).toContain('desktopCurrentTurnMessageRuntime');
    expect(overlayViewModelSource).toContain('isVisibleResponseOverlayMessage');
    expect(overlayViewModelSource).toContain('isResponseOverlayProgressMessage');
    expect(overlayViewModelSource).toContain('isResponseOverlaySourceTaggedMessage');
    expect(overlayViewModelSource).not.toContain('function buildSdkCurrentTurnPresentationState');
    expect(overlayViewModelSource).not.toContain('function resolveSdkOverlayLifecycle');
    expect(overlayViewModelSource).not.toContain('resolveSdkOverlayIntent');
    expect(overlayViewModelSource).not.toContain('const guardRef = (');
    expect(overlayViewModelSource).not.toContain("message.type === 'tool-call'");
    expect(overlayViewModelSource).not.toContain("message.type === 'tool-output'");
    expect(overlayViewModelSource).not.toContain("message.type === 'search-source'");
    expect(overlayViewModelSource).not.toContain("message.type === 'tool-explanation'");
    expect(overlayViewModelSource).not.toContain("entry.type === 'tool-call'");
    expect(overlayViewModelSource).not.toContain("entry.type === 'tool-output'");
    expect(overlayViewModelSource).not.toContain("entry.type === 'search-source'");
    expect(overlayViewModelSource).not.toContain("entry.type === 'tool-explanation'");
    expect(chatInterfaceSource).toContain('useChatSurfaceController');
    expect(chatSurfaceControllerSource).toContain('useCurrentTurnPresentationState');
    expect(chatSurfaceControllerSource).toContain('DesktopCurrentTurnPresentationRuntime');
    expect(chatSurfaceControllerSource).toContain('resolveSdkCurrentTurnPresentationState');
    expect(chatInterfaceSource).toContain('desktopThreadPresentationRuntime');
    expect(chatInterfaceSource).not.toContain('VISIBLE_ASSISTANT_REPLY_TYPE_SET');
    expect(chatInterfaceSource).not.toContain('allowedTypes:');
    expect(chatSurfaceControllerSource).not.toContain('allowedTypes');
    expect(chatSurfaceControllerSource).not.toContain('function buildSdkCurrentTurnPresentationState');
    expect(chatSurfaceControllerSource).not.toContain('function resolveSdkAwaitingDotTargetMessageId');
    expect(chatInterfaceSource).not.toContain('desktopCurrentTurnMessageRuntime');
    await expect(fs.stat(
      path.join(rendererRoot, 'features/chat/utils/state/chatBoxResponseState.js'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.join(rendererRoot, 'features/chat/utils/message/liveTurnPresentationMessages.js'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.join(rendererRoot, 'features/chat/utils/message/messagePresentationPipeline.js'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.join(rendererRoot, 'features/chat/utils/state/chatTurnPresentationState.js'),
    )).rejects.toThrow();
  });

  test('overlay turn lifecycle contract stays behind the app runtime facade', async () => {
    const lifecycleRuntimeSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopOverlayTurnLifecycleRuntime.js'),
      'utf8',
    );
    const chatLoopUiStateSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopChatLoopUiRuntime.js'),
      'utf8',
    );
    const overlayLifecycleHookSource = await fs.readFile(
      path.join(rendererRoot, 'features/chat/hooks/useOverlayTurnLifecycle.js'),
      'utf8',
    );
    const responseViewRuntimeSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopResponseOverlayViewRuntime.ts'),
      'utf8',
    );
    const currentTurnPresentationSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopCurrentTurnPresentationRuntime.js'),
      'utf8',
    );
    const overlayViewModelSource = await fs.readFile(
      path.join(rendererRoot, 'features/minimalChatPill/hooks/useResponseOverlayViewModel.js'),
      'utf8',
    );

    expect(lifecycleRuntimeSource).toContain('overlay_turn_lifecycle_contract.json');
    expect(lifecycleRuntimeSource).not.toContain('features/chat');
    expect(lifecycleRuntimeSource).not.toContain('export const OVERLAY_TURN_LIFECYCLE');
    expect(lifecycleRuntimeSource).toContain('export const DesktopOverlayTurnLifecycleRuntime = Object.freeze');
    expect(lifecycleRuntimeSource).toContain('resolveOverlayTurnLifecycle');
    expect(lifecycleRuntimeSource).toContain('getIdleOverlayTurnLifecycle');
    expect(lifecycleRuntimeSource).toContain('isOverlayTurnLifecycleActive');
    expect(lifecycleRuntimeSource).toContain('isOverlayTurnLifecycleBusy');
    expect(lifecycleRuntimeSource).not.toContain('export function resolveOverlayTurnLifecycle');
    expect(lifecycleRuntimeSource).not.toContain('export function getIdleOverlayTurnLifecycle');
    expect(lifecycleRuntimeSource).not.toContain('export function isOverlayTurnLifecycleBusy');
    expect(chatLoopUiStateSource).not.toContain('OVERLAY_TURN_LIFECYCLE');
    expect(chatLoopUiStateSource).not.toContain('features/chat');
    expect(chatLoopUiStateSource).toContain('desktopOverlayTurnLifecycleRuntime');
    expect(chatLoopUiStateSource).toContain('desktopStreamPhaseRuntime');
    expect(chatLoopUiStateSource).toContain('DesktopStreamPhaseRuntime');
    expect(overlayLifecycleHookSource).toContain('desktopOverlayTurnLifecycleRuntime');
    expect(responseViewRuntimeSource).toContain('desktopOverlayTurnLifecycleRuntime');
    expect(currentTurnPresentationSource).toContain('desktopOverlayTurnLifecycleRuntime');
    expect(chatLoopUiStateSource).toContain('DesktopOverlayTurnLifecycleRuntime');
    expect(overlayLifecycleHookSource).toContain('DesktopOverlayTurnLifecycleRuntime');
    expect(responseViewRuntimeSource).toContain('DesktopOverlayTurnLifecycleRuntime');
    expect(responseViewRuntimeSource).toContain('DesktopResponseOverlayViewRuntime');
    expect(currentTurnPresentationSource).toContain('DesktopOverlayTurnLifecycleRuntime');
    expect(overlayViewModelSource).not.toContain('desktopOverlayTurnLifecycleRuntime');
    expect(responseViewRuntimeSource).not.toContain('overlayTurnLifecycleContract');
    expect(overlayViewModelSource).not.toContain('overlayTurnLifecycleContract');
    await expect(fs.stat(
      path.join(rendererRoot, 'features/chat/utils/overlay/overlayTurnLifecycleContract.js'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.join(rendererRoot, 'features/chat/utils/state/overlayTurnLifecycleState.js'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.join(rendererRoot, 'features/chat/utils/state/chatLoopUiState.js'),
    )).rejects.toThrow();
  });

  test('response overlay view contract stays behind the app runtime facade', async () => {
    const responseViewRuntimeSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopResponseOverlayViewRuntime.ts'),
      'utf8',
    );
    const chatPillFlowSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopChatPillSessionRuntime.ts'),
      'utf8',
    );
    const messageSendRuntimeSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopMessageSendUiRuntime.ts'),
      'utf8',
    );

    expect(responseViewRuntimeSource).toContain('export const DesktopResponseOverlayViewRuntime = Object.freeze');
    expect(responseViewRuntimeSource).not.toContain('export function resolveResponseOverlayViewContract');
    expect(responseViewRuntimeSource).toContain('desktopResponseOverlayLayoutRuntime');
    expect(responseViewRuntimeSource).toContain(
      'DesktopResponseOverlayLayoutRuntime.isVisibleResponseOverlayLayoutMode',
    );
    expect(responseViewRuntimeSource).not.toContain('RESPONSE_OVERLAY_LAYOUT_MODE');
    expect(responseViewRuntimeSource).toContain('desktopOverlayTurnLifecycleRuntime');
    expect(responseViewRuntimeSource).not.toContain('features/chat');
    expect(chatPillFlowSource).toContain('desktopResponseOverlayViewRuntime');
    expect(chatPillFlowSource).toContain('desktopMessageSendUiRuntime');
    expect(chatPillFlowSource).toContain('export const DesktopChatPillSessionRuntime = Object.freeze');
    expect(chatPillFlowSource).not.toContain('export function resolveChatPillSendLifecycle');
    expect(chatPillFlowSource).not.toContain('export function resolveChatPillViewIntent');
    expect(chatPillFlowSource).not.toContain('features/chat');
    expect(messageSendRuntimeSource).toContain('export const DesktopMessageSendUiRuntime = Object.freeze');
    expect(messageSendRuntimeSource).not.toContain('export function resolveMessageSendUiBehavior');
    expect(messageSendRuntimeSource).not.toContain('features/chat');
    expect(chatPillFlowSource).not.toContain('responseOverlayViewContract');
    await expect(fs.stat(
      path.join(rendererRoot, 'features/chat/utils/overlay/responseOverlayViewContract.ts'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.join(rendererRoot, 'features/chat/utils/chatPill/chatPillSessionFlow.ts'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.join(rendererRoot, 'features/chat/policies/messageSendUiPolicy.ts'),
    )).rejects.toThrow();
  });

  test('renderer transport docs classify app-runtime clients before cleanup', async () => {
    const source = await fs.readFile(
      path.resolve(
        __dirname,
        '../../docs/frontend/renderer/desktop_runtime_transport_command_contract_reference.md',
      ),
      'utf8',
    );
    const rendererStateWorkflowSource = await fs.readFile(
      path.resolve(
        __dirname,
        '../../docs/frontend/renderer/renderer_state_change_workflow.md',
      ),
      'utf8',
    );
    const clientSessionRuntimeSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopClientSessionRuntimeClient.ts'),
      'utf8',
    );

    expect(source).toContain('## Renderer App-Runtime Client Inventory');
    expect(source).toContain('Real SDK-command boundary');
    expect(source).toContain('Real Electron-host adapter boundary');
    expect(source).not.toContain('Real desktop-host adapter boundary');
    expect(source).toContain('State/rule facade');
    expect(source).toContain('Presentation contract/helper facade');
    expect(source).toContain('Forwarding/helper facade with current boundary value');
    expect(source).toContain('Removed forwarding-only adapter');
    expect(source).toContain('Removed migration shims');
    expect(source).toContain('desktopStreamPhaseRuntime.js');
    expect(source).not.toContain('desktopStreamPhaseRuntime.ts');
    expect(source).toContain('desktopStorageRuntimeClient.js');
    expect(source).toContain('Do not delete a helper merely because it forwards');
    expect(source.match(/`desktopWorkspaceRuntimeClient\.ts` owns/g) || []).toHaveLength(1);
    expect(rendererStateWorkflowSource).toContain('dispatch through desktop app-runtime facades and SDK-shaped command clients');
    expect(rendererStateWorkflowSource).toContain('fix the local-runtime/main bridge');
    expect(rendererStateWorkflowSource).not.toContain('dispatch to existing IPC/backend clients');
    expect(rendererStateWorkflowSource).not.toContain('fix the sidecar/main bridge');
    expect(clientSessionRuntimeSource).toContain('Coordinates renderer client-session and transport snapshot commands.');
    expect(clientSessionRuntimeSource).not.toContain('Coordinates desktop client session');
    await expect(fs.stat(
      path.resolve(
        __dirname,
        '../../frontend/src/renderer/app/runtime/desktopStorageRuntimeClient.js',
      ),
    )).rejects.toThrow();
  });

  test('desktop new-chat event wiring stays behind app runtime helper', async () => {
    const chatEventsSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopChatEvents.js'),
      'utf8',
    );
    const dashboardShellSource = await fs.readFile(
      path.join(rendererRoot, 'features/dashboard/components/DashboardShell.jsx'),
      'utf8',
    );
    const chatBindingsSource = await fs.readFile(
      path.join(rendererRoot, 'features/chat/hooks/useChatInterfaceBindings.js'),
      'utf8',
    );

    expect(chatEventsSource).toContain('dispatchDesktopRuntimeNewChatEvent');
    expect(chatEventsSource).toContain('subscribeDesktopRuntimeNewChatEvent');
    expect(chatEventsSource).toContain('DESKTOP_RUNTIME_NEW_CHAT_EVENT');
    expect(chatEventsSource).not.toContain('export const DESKTOP_RUNTIME_NEW_CHAT_EVENT');
    expect(dashboardShellSource).toContain('dispatchDesktopRuntimeNewChatEvent');
    expect(dashboardShellSource).not.toContain('new Event(DESKTOP_RUNTIME_NEW_CHAT_EVENT)');
    expect(chatBindingsSource).toContain('subscribeDesktopRuntimeNewChatEvent');
    expect(chatBindingsSource).not.toContain('window.addEventListener(DESKTOP_RUNTIME_NEW_CHAT_EVENT');
    expect(chatBindingsSource).not.toContain('window.removeEventListener(DESKTOP_RUNTIME_NEW_CHAT_EVENT');
  });

  test('dashboard layout resize pulse stays behind app runtime helper', async () => {
    const dashboardLayoutSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopDashboardLayoutRuntime.js'),
      'utf8',
    );
    const dashboardShellSource = await fs.readFile(
      path.join(rendererRoot, 'features/dashboard/components/DashboardShell.jsx'),
      'utf8',
    );

    expect(dashboardLayoutSource).toContain('requestDashboardLayoutPass');
    expect(dashboardLayoutSource).toContain("new Event('resize')");
    expect(dashboardLayoutSource).toContain('requestAnimationFrame');
    expect(dashboardShellSource).toContain('desktopDashboardLayoutRuntime');
    expect(dashboardShellSource).not.toContain("window.dispatchEvent(new Event('resize'))");
    expect(dashboardShellSource).not.toContain('window.requestAnimationFrame');
  });

  test('conversation library facade uses SDK-shaped commands for user-facing conversation actions', async () => {
    const source = await fs.readFile(
      path.join(appRoot, 'runtime/desktopConversationLibraryClient.js'),
      'utf8',
    );

    expect(source).toContain('invokeAgentSdkCommand');
    expect(source).toContain('SDK_RUNTIME_COMMANDS.CONVERSATIONS_LIST');
    expect(source).toContain('SDK_RUNTIME_COMMANDS.CONVERSATIONS_SEARCH');
    expect(source).toContain('SDK_RUNTIME_COMMANDS.CONVERSATIONS_DELETE');
    expect(source).toContain('SDK_RUNTIME_COMMANDS.CONVERSATION_LOAD_DISPLAY');
    expect(source).not.toContain("'conversation.load'");
    expect(source).not.toContain("'conversation.loadRehydrate'");
    expect(source).not.toContain('DesktopConversationStoreAdapter');
    expect(source).not.toContain('INVOKE_CHANNELS.LIST_CHAT_CONVERSATIONS');
    expect(source).not.toContain('INVOKE_CHANNELS.GET_CHAT_EVENTS');
    expect(source).toContain('TRANSIENT_METADATA_LIST_ERROR_PATTERNS');
    expect(source).toContain('timed out waiting for local runtime');
    expect(source).not.toContain("message.includes('local backend not ready')");
    expect(source).not.toContain('sidecar daemon request failed');
    expect(source).not.toContain('timed out waiting for sidecar daemon');
    expect(source).not.toContain("message.includes('sidecar daemon request failed')");
    expect(source).not.toContain("message.includes('timed out waiting for sidecar daemon')");
  });

  test('dashboard recent-conversation load rules stay behind app runtime facade', async () => {
    const runtimeSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopDashboardConversationLoadRuntime.js'),
      'utf8',
    );
    const dashboardHookSource = await fs.readFile(
      path.join(rendererRoot, 'features/dashboard/hooks/useDashboardConversations.js'),
      'utf8',
    );
    const continuityServiceSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopConversationContinuityService.ts'),
      'utf8',
    );

    expect(runtimeSource).toContain('normalizeRecentConversations');
    expect(runtimeSource).toContain('metadataListToDashboardConversations');
    expect(runtimeSource).toContain('metadataToDashboardConversation');
    expect(runtimeSource).toContain('shouldRetryRecentConversationsLoad');
    expect(runtimeSource).toContain('resolveRecentConversationEventAction');
    expect(runtimeSource).toContain('shouldContinueTitleVisibilityPoll');
    expect(runtimeSource).toContain('getDashboardConversationRef');
    expect(runtimeSource).toContain('renameDashboardConversationInList');
    expect(runtimeSource).toContain('removeDashboardConversationFromList');
    expect(runtimeSource).toContain('togglePinnedConversationRef');
    expect(runtimeSource).toContain('TITLE_VISIBILITY_POLL_DELAY_MS');
    expect(runtimeSource).toContain("'user_message'");
    expect(runtimeSource).toContain("'assistant_message'");
    expect(runtimeSource).not.toContain('features/dashboard');
    expect(dashboardHookSource).toContain('desktopDashboardConversationLoadRuntime');
    expect(dashboardHookSource).toContain('metadataListToDashboardConversations');
    expect(dashboardHookSource).toContain('resolveRecentConversationEventAction');
    expect(dashboardHookSource).toContain('shouldContinueTitleVisibilityPoll');
    expect(dashboardHookSource).toContain('getDashboardConversationRef');
    expect(dashboardHookSource).toContain('renameDashboardConversationInList');
    expect(dashboardHookSource).toContain('removeDashboardConversationFromList');
    expect(dashboardHookSource).toContain('togglePinnedConversationRef');
    expect(dashboardHookSource).not.toContain('conversation_id: metadata');
    expect(dashboardHookSource).not.toContain('workspace_path: metadata');
    expect(dashboardHookSource).not.toContain('conversation?.conversation_id');
    expect(dashboardHookSource).not.toContain('item?.conversation_id');
    expect(dashboardHookSource).not.toContain('conversation?.title');
    expect(dashboardHookSource).not.toContain('conversation?.conversation_id === conversationRef');
    expect(dashboardHookSource).not.toContain('const maxAttempts = 240');
    expect(dashboardHookSource).not.toContain('const delayMs = 1250');
    expect(dashboardHookSource).not.toContain("eventType === 'user_message'");
    expect(dashboardHookSource).not.toContain("eventType !== 'assistant_message'");
    expect(dashboardHookSource).not.toContain("'assistant_message'");
    expect(dashboardHookSource).not.toContain('utils/dashboardConversationLoad');
    expect(continuityServiceSource).toContain('metadataListToDashboardConversations');
    expect(continuityServiceSource).not.toContain('function metadataToDashboardConversation');
    expect(continuityServiceSource).not.toContain('conversation_id: metadata');
    expect(continuityServiceSource).not.toContain('workspace_path: metadata');
    await expect(fs.stat(
      path.join(rendererRoot, 'features/dashboard/utils/dashboardConversationLoad.js'),
    )).rejects.toThrow();
  });

  test('dashboard conversation grouping rules stay behind app runtime facade', async () => {
    const runtimeSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopDashboardConversationGroupRuntime.js'),
      'utf8',
    );
    const dashboardHookSource = await fs.readFile(
      path.join(rendererRoot, 'features/dashboard/hooks/useDashboardConversations.js'),
      'utf8',
    );
    const searchModalSource = await fs.readFile(
      path.join(rendererRoot, 'features/dashboard/components/SearchChatsModal.jsx'),
      'utf8',
    );

    expect(runtimeSource).toContain('buildConversationGroups');
    expect(runtimeSource).toContain('buildWorkspaceConversationGroups');
    expect(runtimeSource).toContain('getDashboardConversationGroupDescriptors');
    expect(runtimeSource).toContain('getDashboardSearchSnippetDisplayText');
    expect(runtimeSource).toContain("key: 'previous7Days'");
    expect(runtimeSource).not.toContain('features/dashboard');
    expect(dashboardHookSource).toContain('desktopDashboardConversationGroupRuntime');
    expect(dashboardHookSource).not.toContain('utils/conversationGroups');
    expect(searchModalSource).toContain('desktopDashboardConversationGroupRuntime');
    expect(searchModalSource).toContain('getDashboardConversationGroupDescriptors');
    expect(searchModalSource).toContain('getDashboardSearchSnippetDisplayText');
    expect(searchModalSource).not.toContain('GROUP_LABELS');
    expect(searchModalSource).not.toContain('GROUP_ORDER');
    expect(searchModalSource).not.toContain("previous7Days: 'Previous 7 days'");
    expect(searchModalSource).not.toContain('startsWith(prefix');
    expect(searchModalSource).not.toContain('matchedRole ?');
    await expect(fs.stat(
      path.join(rendererRoot, 'features/dashboard/utils/conversationGroups.js'),
    )).rejects.toThrow();
  });

  test('dashboard sidebar navigation descriptors are owned by app runtime', async () => {
    const navigationRuntimeSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopDashboardNavigationRuntime.js'),
      'utf8',
    );
    const sidebarNavigationSource = await fs.readFile(
      path.join(rendererRoot, 'features/dashboard/components/sidebar/DashboardSidebarNavigation.jsx'),
      'utf8',
    );

    expect(navigationRuntimeSource).toContain('getDashboardPrimaryNavItems');
    expect(navigationRuntimeSource).toContain('getDashboardPanelNavItems');
    expect(navigationRuntimeSource).toContain('resolveDashboardNavigationLabel');
    expect(navigationRuntimeSource).toContain('hiddenWhenCollapsed');
    expect(navigationRuntimeSource).not.toContain('features/dashboard');
    expect(sidebarNavigationSource).toContain('desktopDashboardNavigationRuntime');
    expect(sidebarNavigationSource).toContain('getDashboardPrimaryNavItems');
    expect(sidebarNavigationSource).toContain('getDashboardPanelNavItems');
    expect(sidebarNavigationSource).not.toContain('PRIMARY_NAV_ITEMS');
    expect(sidebarNavigationSource).not.toContain('PRODUCT_NAV_ITEMS');
    expect(sidebarNavigationSource).not.toContain("item.id !== 'new-chat'");
  });

  test('chat stream stale-turn guard uses generic runtime packet wording', async () => {
    const source = await fs.readFile(
      path.join(appRoot, 'runtime/desktopChatStreamEventRuntime.ts'),
      'utf8',
    );
    const turnGuardRuntimeSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopChatStreamTurnGuardRuntime.ts'),
      'utf8',
    );

    expect(source).toContain('runtime packets can re-anchor stream state');
    expect(source).not.toContain('backend packets can re-anchor stream state');
    expect(source).toContain('DesktopChatStreamTurnGuardRuntime');
    expect(turnGuardRuntimeSource).toContain('export const DesktopChatStreamTurnGuardRuntime = Object.freeze');
    expect(turnGuardRuntimeSource).not.toContain('export function isStaleTurnForActiveStream');
  });

  test('live-turn and agent runtime transport facades use SDK-shaped command invoke for SDK runtime commands', async () => {
    const liveTurnSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopLiveTurnRuntimeClient.ts'),
      'utf8',
    );
    const agentRuntimeTransportSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopRuntimeTransport.ts'),
      'utf8',
    );

    expect(liveTurnSource).toContain('invokeAgentSdkCommand');
    expect(liveTurnSource).toContain('SDK_RUNTIME_COMMANDS.CONVERSATION_SEND');
    expect(liveTurnSource).toContain('SDK_RUNTIME_COMMANDS.CONVERSATION_STOP');
    expect(liveTurnSource).not.toContain('WINDIE_SEND');
    expect(liveTurnSource).not.toContain('WINDIE_STOP');

    expect(agentRuntimeTransportSource).toContain('invokeAgentSdkCommand');
    expect(agentRuntimeTransportSource).toContain('SDK_RUNTIME_COMMANDS.CONVERSATION_SEND');
    expect(agentRuntimeTransportSource).toContain('SDK_RUNTIME_COMMANDS.CONVERSATION_STOP');
    expect(agentRuntimeTransportSource).toContain('SDK_RUNTIME_COMMANDS.CONVERSATION_REHYDRATE');
    expect(agentRuntimeTransportSource).toContain('SDK_RUNTIME_COMMANDS.CONVERSATION_COMPACT');
    expect(agentRuntimeTransportSource).toContain('SDK_RUNTIME_COMMANDS.SETTINGS_UPDATE');
    expect(agentRuntimeTransportSource).toContain('SDK_RUNTIME_COMMANDS.MODELS_LIST');
    expect(agentRuntimeTransportSource).toContain('SDK_RUNTIME_COMMANDS.WAKEWORD_DETECTED');
    expect(agentRuntimeTransportSource).toContain('AgentRuntimeTransport');
    expect(agentRuntimeTransportSource).not.toContain('BackendTransport');
    expect(agentRuntimeTransportSource).not.toContain('WINDIE_SEND');
    expect(agentRuntimeTransportSource).not.toContain('WINDIE_STOP');
    expect(agentRuntimeTransportSource).not.toContain('WINDIE_REHYDRATE');
    expect(agentRuntimeTransportSource).not.toContain('WINDIE_COMPACT_HISTORY');
  });

  test('SDK command invoke client resolves the generic agent SDK bridge', async () => {
    const source = await fs.readFile(
      path.join(appRoot, 'runtime/agentSdkCommandInvokeClient.ts'),
      'utf8',
    );

    expect(source).toContain('getAgentSdkCommandBridge');
    expect(source).toContain('type AgentSdkCommandBridge');
    expect(source).toContain('window.agentSdk ?? null');
    expect(source).not.toContain('window.desktopAgent');
    expect(source).not.toContain('window.windie');
    expect(source).toContain('DESKTOP_RUNTIME_INVOKE_CHANNELS.INVOKE');
    expect(source).not.toContain('INVOKE_CHANNELS.WINDIE_INVOKE');
    expect(source).not.toContain('getDesktopAgentCommandBridge');
    expect(source).not.toContain('DesktopAgentCommandBridge');
  });

  test('renderer app startup installs interaction logging through app runtime client', async () => {
    const mainSource = await fs.readFile(
      path.join(appRoot, 'main.jsx'),
      'utf8',
    );
    const clientSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopInteractionRuntimeClient.ts'),
      'utf8',
    );

    expect(mainSource).toContain('DesktopInteractionRuntimeClient.installInteractionLogger');
    expect(mainSource).not.toContain('infrastructure/interaction/rendererInteractionLogger');
    expect(mainSource).not.toContain('installRendererInteractionLogger');
    expect(clientSource).toContain('installRendererInteractionLogger()');
    expect(clientSource).toContain('logUserSentMessage(details)');
  });

  test('app providers read latest-ref helper through renderer hooks runtime client', async () => {
    const providerFiles = [
      'providers/AppProvider.jsx',
      'providers/AppConfigProvider.jsx',
    ];
    const hookClientSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopRendererHooksRuntimeClient.ts'),
      'utf8',
    );

    for (const providerFile of providerFiles) {
      const source = await fs.readFile(path.join(appRoot, providerFile), 'utf8');
      expect(source).toContain('desktopRendererHooksRuntimeClient');
      expect(source).not.toContain('infrastructure/hooks/useLatestRef');
    }
    expect(hookClientSource).toContain('infrastructure/hooks/useLatestRef');
  });

  test('app provider code routes desktop transport through runtime clients', async () => {
    const files = await listSourceFiles(path.join(appRoot, 'providers'));
    const offenders: string[] = [];
    const forbiddenTransportNeedles = [
      'infrastructure/ipc',
      'IpcBridge',
      'INVOKE_CHANNELS',
      'ON_CHANNELS',
      'SEND_CHANNELS',
      'window.ipc',
      'window.agentSdk',
      'invokeAgentSdkCommand',
    ];

    for (const file of files) {
      const relativePath = normalizeRelativePath(path.relative(appRoot, file));
      const source = await fs.readFile(file, 'utf8');
      if (forbiddenTransportNeedles.some((needle) => source.includes(needle))) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
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

  test('app config provider binds transcript users through transcript runtime client', async () => {
    const providerSource = await fs.readFile(
      path.join(appRoot, 'providers/AppConfigProvider.jsx'),
      'utf8',
    );
    const transcriptClientSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopTranscriptSessionRuntimeClient.ts'),
      'utf8',
    );
    const sessionClientSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopConversationSessionRuntimeClient.ts'),
      'utf8',
    );

    expect(providerSource).toContain('DesktopTranscriptSessionRuntimeClient.bindTranscriptUser');
    expect(providerSource).not.toContain('features/chat/session/conversationSessionRuntime');
    expect(providerSource).not.toContain('applyTranscriptSessionUserBinding');
    expect(transcriptClientSource).toContain('DesktopConversationSessionRuntimeClient.bindTranscriptUser');
    expect(transcriptClientSource).not.toContain('features/chat/session/conversationSessionRuntime');
    expect(sessionClientSource).toContain('applyTranscriptSessionUserBinding');
    expect(sessionClientSource).toContain('./desktopConversationSessionRuntime');
    expect(sessionClientSource).not.toContain('features/chat/session/conversationSessionRuntime');
  });

  test('transcript session sync parsing stays private to the transcript runtime', async () => {
    const transcriptRuntimeSource = await fs.readFile(
      path.join(rendererRoot, 'infrastructure/transcript/transcriptSessionRuntime.ts'),
      'utf8',
    );

    expect(transcriptRuntimeSource).toContain('const extractTranscriptSessionSyncPayload');
    expect(transcriptRuntimeSource).not.toContain('export const extractTranscriptSessionSyncPayload');
    await expect(fs.stat(
      path.join(rendererRoot, 'infrastructure/transcript/sessionSyncPayload.ts'),
    )).rejects.toThrow();
  });

  test('chat provider reads transcript session info through app runtime client', async () => {
    const providerSource = await fs.readFile(
      path.join(appRoot, 'providers/ChatProvider.jsx'),
      'utf8',
    );
    const sessionInfoClientSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopTranscriptSessionInfoRuntimeClient.js'),
      'utf8',
    );

    expect(providerSource).toContain('useDesktopTranscriptSessionInfo');
    expect(providerSource).toContain('runtime/desktopTranscriptSessionInfoRuntimeClient');
    expect(providerSource).not.toContain('features/dashboard/hooks/useTranscriptSessionInfo');
    expect(sessionInfoClientSource).toContain('useSyncExternalStore');
    expect(sessionInfoClientSource).toContain(
      'DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo',
    );
  });

  test('renderer conversation session info projection stays behind app runtime', async () => {
    const sessionRuntimeSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopConversationSessionRuntime.ts'),
      'utf8',
    );
    const sessionInfoHookSource = await fs.readFile(
      path.join(rendererRoot, 'features/chat/session/useRendererConversationSessionInfo.js'),
      'utf8',
    );

    expect(sessionRuntimeSource).toContain('resolveCurrentRendererConversationSessionInfo');
    expect(sessionRuntimeSource).toContain('EMPTY_MAIN_SESSION_SNAPSHOT');
    expect(sessionRuntimeSource).not.toContain('features/chat');
    expect(sessionInfoHookSource).toContain('resolveCurrentRendererConversationSessionInfo');
    expect(sessionInfoHookSource).not.toContain('EMPTY_RENDERER_SESSION_INFO');
    expect(sessionInfoHookSource).not.toContain('resolveRendererConversationSessionSnapshot');
    expect(sessionInfoHookSource).not.toContain('conversationRef: null');
  });

  test('chat stream ingress projects conversation sessions through runtime client', async () => {
    const ingressSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopChatStreamIngressRuntime.ts'),
      'utf8',
    );
    const sessionClientSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopConversationSessionRuntimeClient.ts'),
      'utf8',
    );

    expect(ingressSource).toContain('DesktopConversationSessionRuntimeClient.applyEventChatConversationProjection');
    expect(ingressSource).not.toContain('features/chat/session/conversationSessionRuntime');
    expect(sessionClientSource).toContain('applyEventChatConversationProjection');
    expect(sessionClientSource).not.toContain('features/chat/session/conversationSessionRuntime');
  });

  test('active chat-session reset is owned by app runtime', async () => {
    const resetRuntimeSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopActiveChatSessionRuntime.ts'),
      'utf8',
    );
    const dashboardShellSource = await fs.readFile(
      path.join(rendererRoot, 'features/dashboard/components/DashboardShell.jsx'),
      'utf8',
    );
    const dashboardConversationSource = await fs.readFile(
      path.join(rendererRoot, 'features/dashboard/hooks/useDashboardConversations.js'),
      'utf8',
    );
    const newChatSessionSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopNewChatSessionRuntime.ts'),
      'utf8',
    );

    expect(resetRuntimeSource).toContain('applyRendererConversationSelection');
    expect(resetRuntimeSource).toContain('DesktopTranscriptSessionRuntimeClient');
    expect(resetRuntimeSource).not.toContain('features/chat');
    expect(dashboardShellSource).toContain('desktopActiveChatSessionRuntime');
    expect(dashboardConversationSource).toContain('desktopActiveChatSessionRuntime');
    expect(newChatSessionSource).toContain('desktopActiveChatSessionRuntime');
    expect(newChatSessionSource).not.toContain('features/chat');
    expect(dashboardShellSource).not.toContain('chat/utils/session/resetActiveChatSession');
    expect(dashboardConversationSource).not.toContain('chat/utils/session/resetActiveChatSession');
    await expect(fs.stat(
      path.join(rendererRoot, 'features/chat/utils/session/resetActiveChatSession.ts'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.join(rendererRoot, 'features/chat/utils/session/newChatSession.ts'),
    )).rejects.toThrow();
  });

  test('permission grant effects are owned by app runtime', async () => {
    const grantEffectsSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopPermissionGrantEffectsRuntime.js'),
      'utf8',
    );
    const onboardingActionsSource = await fs.readFile(
      path.join(rendererRoot, 'features/onboarding/hooks/useOnboardingPermissionActions.js'),
      'utf8',
    );
    const browserSettingsSource = await fs.readFile(
      path.join(rendererRoot, 'features/dashboard/components/sections/settings/BrowserSettingsTab.jsx'),
      'utf8',
    );

    expect(grantEffectsSource).toContain('browser_automation_enabled');
    expect(grantEffectsSource).toContain('shouldPollPermissionGrantByInterval');
    expect(grantEffectsSource).toContain('shouldWatchExternalPermissionGrantCompletion');
    expect(grantEffectsSource).not.toContain('features/permissions');
    expect(onboardingActionsSource).toContain('desktopPermissionGrantEffectsRuntime');
    expect(onboardingActionsSource).toContain('shouldPollPermissionGrantByInterval');
    expect(onboardingActionsSource).toContain('shouldWatchExternalPermissionGrantCompletion');
    expect(onboardingActionsSource).not.toContain('status?.details');
    expect(onboardingActionsSource).not.toContain('status?.granted');
    expect(onboardingActionsSource).not.toContain('status?.status');
    expect(browserSettingsSource).toContain('desktopPermissionGrantEffectsRuntime');
    expect(onboardingActionsSource).not.toContain('permissions/utils/permissionGrantEffects');
    expect(browserSettingsSource).not.toContain('permissions/utils/permissionGrantEffects');
    await expect(fs.stat(
      path.join(rendererRoot, 'features/permissions/utils/permissionGrantEffects.js'),
    )).rejects.toThrow();
  });

  test('permission presentation rules are owned by app runtime', async () => {
    const presentationRuntimeSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopPermissionPresentationRuntime.js'),
      'utf8',
    );
    const badgeSource = await fs.readFile(
      path.join(rendererRoot, 'features/permissions/components/PermissionStatusBadge.jsx'),
      'utf8',
    );
    const onboardingSlideSource = await fs.readFile(
      path.join(rendererRoot, 'features/onboarding/components/PermissionOnboardingSlide.jsx'),
      'utf8',
    );
    const onboardingActionsSource = await fs.readFile(
      path.join(rendererRoot, 'features/onboarding/hooks/useOnboardingPermissionActions.js'),
      'utf8',
    );
    const browserSettingsSource = await fs.readFile(
      path.join(rendererRoot, 'features/dashboard/components/sections/settings/BrowserSettingsTab.jsx'),
      'utf8',
    );

    expect(presentationRuntimeSource).toContain('getPermissionPill');
    expect(presentationRuntimeSource).toContain('isPermissionGrantedStatus');
    expect(presentationRuntimeSource).toContain('getPermissionStatusDetailsPresentation');
    expect(presentationRuntimeSource).toContain('getPermissionManifestEntry');
    expect(presentationRuntimeSource).not.toContain('features/permissions');
    expect(badgeSource).toContain('desktopPermissionPresentationRuntime');
    expect(onboardingSlideSource).toContain('desktopPermissionPresentationRuntime');
    expect(onboardingActionsSource).toContain('desktopPermissionPresentationRuntime');
    expect(onboardingSlideSource).toContain('getPermissionStatusDetailsPresentation');
    expect(browserSettingsSource).toContain('getPermissionStatusDetailsPresentation');
    expect(browserSettingsSource).toContain('getPermissionManifestEntry');
    expect(onboardingSlideSource).not.toContain('status?.reason');
    expect(onboardingSlideSource).not.toContain('status?.status');
    expect(browserSettingsSource).not.toContain('permissions.find');
    expect(browserSettingsSource).not.toContain('permission?.permission_id');
    expect(browserSettingsSource).not.toContain('effectiveStatus?.reason');
    expect(browserSettingsSource).not.toContain('effectiveStatus?.details');
    expect(onboardingSlideSource).not.toContain('permissions/utils/permissionPresentation');
    expect(onboardingSlideSource).not.toContain('permissions/utils/permissionStatus');
    expect(onboardingActionsSource).not.toContain('permissions/utils/permissionStatus');
    await expect(fs.stat(
      path.join(rendererRoot, 'features/permissions/utils/permissionPresentation.js'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.join(rendererRoot, 'features/permissions/utils/permissionStatus.js'),
    )).rejects.toThrow();
  });

  test('permission command result envelopes stay behind the app runtime client', async () => {
    const clientSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopPermissionRuntimeClient.ts'),
      'utf8',
    );
    const storeSource = await fs.readFile(
      path.join(rendererRoot, 'features/permissions/stores/permissionStore.js'),
      'utf8',
    );

    expect(clientSource).toContain('function resolvePermissionManifestResult');
    expect(clientSource).not.toContain('export function resolvePermissionManifestResult');
    expect(clientSource).toContain('function resolvePermissionStatusResult');
    expect(clientSource).not.toContain('export function resolvePermissionStatusResult');
    expect(clientSource).toContain('function resolvePermissionStatusesResult');
    expect(clientSource).not.toContain('export function resolvePermissionStatusesResult');
    expect(clientSource).toContain('function mapPermissionStatusesByPermissionId');
    expect(clientSource).not.toContain('export function mapPermissionStatusesByPermissionId');
    expect(storeSource).toContain('DesktopPermissionRuntimeClient.listPermissionManifest');
    expect(storeSource).toContain('DesktopPermissionRuntimeClient.runPermissionProbeStatus');
    expect(storeSource).toContain('DesktopPermissionRuntimeClient.requestPermissionStatus');
    expect(storeSource).toContain('DesktopPermissionRuntimeClient.checkPermissionStatuses');
    expect(storeSource).toContain('DesktopPermissionRuntimeClient.mapPermissionStatusesByPermissionId');
    expect(storeSource).not.toContain('mapPermissionStatusesByPermissionId,');
    expect(storeSource).not.toContain('result?.success');
    expect(storeSource).not.toContain('result.data');
    expect(storeSource).not.toContain('result?.data');
  });

  test('debug tool-ghost timing is owned by app runtime', async () => {
    const runtimeSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopToolGhostRuntime.ts'),
      'utf8',
    );
    const debugAppSource = await fs.readFile(
      path.join(appRoot, 'ToolGhostDebugApp.jsx'),
      'utf8',
    );

    expect(runtimeSource).toContain('export const DesktopToolGhostRuntime = Object.freeze');
    expect(runtimeSource).not.toContain('export function getToolGhostClickSyncDelayMs');
    expect(runtimeSource).not.toContain('export const TOOL_GHOST_CLICK_SYNC_DELAY_MS');
    expect(runtimeSource).not.toContain('features/chat');
    expect(debugAppSource).toContain('desktopToolGhostRuntime');
    expect(debugAppSource).toContain('DesktopToolGhostRuntime');
    expect(debugAppSource).not.toContain('import { TOOL_GHOST_CLICK_SYNC_DELAY_MS }');
    expect(debugAppSource).not.toContain('features/chat/constants/toolGhostRuntime');
    await expect(fs.stat(
      path.join(rendererRoot, 'features/chat/constants/toolGhostRuntime.ts'),
    )).rejects.toThrow();
  });

  test('onboarding slide-state rules are owned by app runtime', async () => {
    const slideRuntimeSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopOnboardingSlideRuntime.js'),
      'utf8',
    );
    const slideshowSource = await fs.readFile(
      path.join(rendererRoot, 'features/onboarding/components/DesktopOnboardingSlideshow.jsx'),
      'utf8',
    );

    expect(slideRuntimeSource).toContain('buildOnboardingSlideState');
    expect(slideRuntimeSource).not.toContain('features/onboarding');
    expect(slideshowSource).toContain('desktopOnboardingSlideRuntime');
    expect(slideshowSource).not.toContain('utils/onboardingSlides');
    await expect(fs.stat(
      path.join(rendererRoot, 'features/onboarding/utils/onboardingSlides.js'),
    )).rejects.toThrow();
  });

  test('settings tab descriptors are owned by app runtime', async () => {
    const settingsTabRuntimeSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopSettingsTabRuntime.js'),
      'utf8',
    );
    const settingsSectionSource = await fs.readFile(
      path.join(rendererRoot, 'features/dashboard/components/sections/SettingsSection.jsx'),
      'utf8',
    );

    expect(settingsTabRuntimeSource).toContain('getSettingsTabDescriptors');
    expect(settingsTabRuntimeSource).toContain('resolveSettingsTabLabel');
    expect(settingsTabRuntimeSource).not.toContain('features/dashboard');
    expect(settingsSectionSource).toContain('desktopSettingsTabRuntime');
    expect(settingsSectionSource).toContain('getSettingsTabDescriptors');
    expect(settingsSectionSource).toContain('resolveSettingsTabLabel');
    expect(settingsSectionSource).not.toContain('SETTINGS_TABS = Object.freeze');
  });

  test('chat surface selector projection stays behind app runtime facade', async () => {
    const selectorRuntimeSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopChatSurfaceSelectorRuntime.ts'),
      'utf8',
    );
    const chatStoreSource = await fs.readFile(
      path.join(rendererRoot, 'features/chat/stores/chatStore.ts'),
      'utf8',
    );
    const chatInterfaceSource = await fs.readFile(
      path.join(rendererRoot, 'features/chat/components/ChatInterface.jsx'),
      'utf8',
    );
    const responseOverlaySource = await fs.readFile(
      path.join(rendererRoot, 'features/minimalChatPill/components/MinimalResponseOverlay.jsx'),
      'utf8',
    );

    expect(selectorRuntimeSource).toContain('projectDesktopChatInterfaceState');
    expect(selectorRuntimeSource).toContain('projectDesktopLiveTurnSurfaceState');
    expect(selectorRuntimeSource).toContain('export const DesktopChatSurfaceSelectorRuntime = Object.freeze');
    expect(selectorRuntimeSource).not.toContain('export function projectDesktopChatInterfaceState');
    expect(selectorRuntimeSource).not.toContain('export function projectDesktopLiveTurnSurfaceState');
    expect(selectorRuntimeSource).not.toContain('features/chat');
    expect(chatStoreSource).toContain('desktopChatSurfaceSelectorRuntime');
    expect(chatStoreSource).toContain('DesktopChatSurfaceSelectorRuntime');
    expect(chatStoreSource).toContain('selectActiveWorkspaceState');
    expect(chatInterfaceSource).toContain('selectChatInterfaceState');
    expect(responseOverlaySource).toContain('selectLiveTurnSurfaceState');
    expect(chatInterfaceSource).not.toContain('utils/chatSelectors');
    expect(responseOverlaySource).not.toContain('chat/utils/chatSelectors');
    await expect(fs.stat(
      path.join(rendererRoot, 'features/chat/utils/chatSelectors.js'),
    )).rejects.toThrow();
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

  test('app runtime modules do not import renderer skin copy', async () => {
    const files = await listSourceFiles(path.join(appRoot, 'runtime'));
    const offenders: string[] = [];
    const forbiddenSkinNeedles = [
      'desktopRuntimeSkin',
      'windieDesktopSkin',
      '../skin/desktopRuntimeSkin',
      '../skin/windieDesktopSkin',
    ];

    for (const file of files) {
      const relativePath = normalizeRelativePath(path.relative(appRoot, file));
      const source = await fs.readFile(file, 'utf8');
      if (forbiddenSkinNeedles.some((needle) => source.includes(needle))) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
  });

  test('renderer feature modules stay behind app runtime facades for provider and transport state', async () => {
    const featureRoot = path.join(rendererRoot, 'features');
    const runtimeClientSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopRendererConfigRuntimeClient.js'),
      'utf8',
    );
    const forbiddenProviderNeedles = [
      'app/providers/',
      'app/providers/AppConfigContext',
      'app/providers/AppStatusContext',
      'app/providers/ChatContext',
      'app/providers/AppProvider',
      'app/providers/AppConfigProvider',
      'app/providers/AppStatusProvider',
      'app/providers/ChatProvider',
      'useAppConfigContext',
      'useAppStatusContext',
      'infrastructure/',
      'IpcBridge',
      'INVOKE_CHANNELS',
      'ON_CHANNELS',
      'SEND_CHANNELS',
      'window.ipc',
      'types/backendEvents',
      'events/backendEvents',
      'normalizeBackendEventToConversationEvent',
      'subscribeRawBackendEvents',
      'ON_CHANNELS.FROM_BACKEND',
      'WINDIE_FROM_BACKEND',
      'from-backend',
    ];

    await expect(collectSourceNeedleOffenders(featureRoot, forbiddenProviderNeedles))
      .resolves.toEqual([]);
    expect(runtimeClientSource).toContain('useDesktopRendererConfigContext');
    expect(runtimeClientSource).toContain('useAppConfigContext');
    expect(runtimeClientSource).toContain('DesktopRendererConfigRuntimeClient');
    expect(runtimeClientSource).not.toContain('export function buildDeferredQueryModelSelection');
  });

  test('renderer app and feature code does not call SDK-owned transport/internal IPC channels', async () => {
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

  test('renderer IPC channel module validates shape without duplicating product wire values', async () => {
    const source = await fs.readFile(
      path.join(rendererRoot, 'infrastructure/ipc/channels.ts'),
      'utf8',
    );
    const sharedRegistry = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/shared/ipcChannels.json'),
      'utf8',
    );

    expect(source).toContain('EXPECTED_SHARED_CHANNEL_KEYS');
    expect(source).toContain('must be a non-empty string');
    expect(source).not.toContain('EXPECTED_SHARED_CHANNEL_REGISTRY =');
    expect(source).not.toContain('windie:');
    expect(sharedRegistry).toContain('windie:invoke');
    expect(sharedRegistry).toContain('windie:current-turn');
  });
});
