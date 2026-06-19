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

describe('renderer app runtime boundary', () => {
  test('renderer skin and SDK facade use desktop-runtime UI wording', async () => {
    const skinSource = await fs.readFile(
      path.join(appRoot, 'skin/windieDesktopSkin.js'),
      'utf8',
    );
    const sdkFacadeSource = await fs.readFile(
      path.join(rendererRoot, 'infrastructure/api/agentSdkClient.ts'),
      'utf8',
    );

    expect(skinSource).toContain('generic desktop runtime UI');
    expect(skinSource).not.toContain('generic desktop agent UI');
    expect(sdkFacadeSource).toContain('desktop runtime UI');
    expect(sdkFacadeSource).not.toContain('desktop agent UI');
  });

  test('frontend architecture docs describe renderer skin facades with desktop-runtime wording', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../../docs/architecture/frontend_architecture.md'),
      'utf8',
    );

    expect(source).toContain('active desktop-runtime skin');
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

    expect(audioRuntimeSource).toContain('extractDesktopAudioChunkPayload');
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
    expect(layoutRuntimeSource).toContain('CHATBOX_WINDOW_FRAME_HEIGHT_PADDING');
    expect(layoutRuntimeSource).toContain('createChatboxDragState');
    expect(layoutRuntimeSource).toContain('getChatboxDragTarget');
    expect(layoutRuntimeSource).not.toContain('features/chat');
    expect(layoutRuntimeSource).not.toContain('features/minimalChatPill');
    expect(pillSource).toContain('desktopChatboxLayoutRuntime');
    expect(bindingsSource).toContain('desktopChatboxLayoutRuntime');
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
    expect(attachmentRuntimeSource).not.toContain('features/chat');
    expect(messageInputSource).toContain('desktopAttachmentPresentationRuntime');
    expect(previewRowSource).toContain('desktopAttachmentPresentationRuntime');
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

  test('response overlay phase contract stays behind the app runtime facade', async () => {
    const phaseRuntimeSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopResponseOverlayPhaseRuntime.js'),
      'utf8',
    );
    const streamPhaseSource = await fs.readFile(
      path.join(rendererRoot, 'features/chat/utils/state/streamPhaseState.js'),
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
    expect(liveSurfaceSource).not.toContain('features/chat');
    expect(liveSurfaceSource).not.toContain('features/minimalChatPill');
    expect(streamPhaseSource).toContain('desktopResponseOverlayPhaseRuntime');
    expect(liveSurfaceSource).toContain('desktopResponseOverlayPhaseRuntime');
    expect(chatSurfaceControllerSource).toContain('desktopLiveTurnSurfaceRuntime');
    expect(streamPhaseSource).not.toContain('responseOverlayPhaseContract');
    expect(liveSurfaceSource).not.toContain('responseOverlayPhaseContract');
    await expect(fs.stat(
      path.join(rendererRoot, 'features/chat/utils/overlay/responseOverlayPhaseContract.js'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.join(rendererRoot, 'features/chat/utils/state/liveTurnSurfaceState.js'),
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
    const presentationPipelineSource = await fs.readFile(
      path.join(rendererRoot, 'features/chat/utils/message/messagePresentationPipeline.js'),
      'utf8',
    );

    expect(currentTurnMessageSource).toContain('desktopChatMessageRuntimeClient');
    expect(currentTurnMessageSource).toContain('desktopPresentationSourceChannels');
    expect(currentTurnMessageSource).toContain('desktopArtifactRuntimeClient');
    expect(currentTurnMessageSource).not.toContain('features/chat');
    expect(currentTurnMessageSource).not.toContain('features/minimalChatPill');
    expect(overlayViewModelSource).toContain('desktopCurrentTurnMessageRuntime');
    expect(chatInterfaceSource).toContain('desktopCurrentTurnMessageRuntime');
    expect(presentationPipelineSource).toContain('desktopCurrentTurnMessageRuntime');
    await expect(fs.stat(
      path.join(rendererRoot, 'features/chat/utils/state/chatBoxResponseState.js'),
    )).rejects.toThrow();
    await expect(fs.stat(
      path.join(rendererRoot, 'features/chat/utils/message/liveTurnPresentationMessages.js'),
    )).rejects.toThrow();
  });

  test('overlay turn lifecycle contract stays behind the app runtime facade', async () => {
    const lifecycleRuntimeSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopOverlayTurnLifecycleRuntime.js'),
      'utf8',
    );
    const lifecycleStateSource = await fs.readFile(
      path.join(rendererRoot, 'features/chat/utils/state/overlayTurnLifecycleState.js'),
      'utf8',
    );
    const responseViewRuntimeSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopResponseOverlayViewRuntime.ts'),
      'utf8',
    );
    const overlayViewModelSource = await fs.readFile(
      path.join(rendererRoot, 'features/minimalChatPill/hooks/useResponseOverlayViewModel.js'),
      'utf8',
    );

    expect(lifecycleRuntimeSource).toContain('overlay_turn_lifecycle_contract.json');
    expect(lifecycleRuntimeSource).not.toContain('features/chat');
    expect(lifecycleStateSource).toContain('desktopOverlayTurnLifecycleRuntime');
    expect(responseViewRuntimeSource).toContain('desktopOverlayTurnLifecycleRuntime');
    expect(overlayViewModelSource).toContain('desktopOverlayTurnLifecycleRuntime');
    expect(lifecycleStateSource).not.toContain('overlayTurnLifecycleContract');
    expect(responseViewRuntimeSource).not.toContain('overlayTurnLifecycleContract');
    expect(overlayViewModelSource).not.toContain('overlayTurnLifecycleContract');
    await expect(fs.stat(
      path.join(rendererRoot, 'features/chat/utils/overlay/overlayTurnLifecycleContract.js'),
    )).rejects.toThrow();
  });

  test('response overlay view contract stays behind the app runtime facade', async () => {
    const responseViewRuntimeSource = await fs.readFile(
      path.join(appRoot, 'runtime/desktopResponseOverlayViewRuntime.ts'),
      'utf8',
    );
    const chatPillFlowSource = await fs.readFile(
      path.join(rendererRoot, 'features/chat/utils/chatPill/chatPillSessionFlow.ts'),
      'utf8',
    );

    expect(responseViewRuntimeSource).toContain('resolveResponseOverlayViewContract');
    expect(responseViewRuntimeSource).toContain('desktopResponseOverlayLayoutRuntime');
    expect(responseViewRuntimeSource).toContain('desktopOverlayTurnLifecycleRuntime');
    expect(responseViewRuntimeSource).not.toContain('features/chat');
    expect(chatPillFlowSource).toContain('desktopResponseOverlayViewRuntime');
    expect(chatPillFlowSource).not.toContain('responseOverlayViewContract');
    await expect(fs.stat(
      path.join(rendererRoot, 'features/chat/utils/overlay/responseOverlayViewContract.ts'),
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

    expect(source).toContain('## Renderer App-Runtime Client Inventory');
    expect(source).toContain('Real SDK-command boundary');
    expect(source).toContain('Real desktop-host adapter boundary');
    expect(source).toContain('State/rule facade');
    expect(source).toContain('Presentation contract/helper facade');
    expect(source).toContain('Forwarding/helper facade with current boundary value');
    expect(source).toContain('Removed migration shims');
    expect(source).toContain('Do not delete a helper merely because it forwards');
    expect(source.match(/`desktopWorkspaceRuntimeClient\.ts` owns/g) || []).toHaveLength(1);
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

  test('chat stream stale-turn guard uses generic runtime packet wording', async () => {
    const source = await fs.readFile(
      path.join(appRoot, 'runtime/desktopChatStreamEventRuntime.ts'),
      'utf8',
    );

    expect(source).toContain('runtime packets can re-anchor stream state');
    expect(source).not.toContain('backend packets can re-anchor stream state');
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
      path.join(rendererRoot, 'features/chat/utils/session/newChatSession.ts'),
      'utf8',
    );

    expect(resetRuntimeSource).toContain('applyRendererConversationSelection');
    expect(resetRuntimeSource).toContain('DesktopTranscriptSessionRuntimeClient');
    expect(resetRuntimeSource).not.toContain('features/chat');
    expect(dashboardShellSource).toContain('desktopActiveChatSessionRuntime');
    expect(dashboardConversationSource).toContain('desktopActiveChatSessionRuntime');
    expect(newChatSessionSource).toContain('desktopActiveChatSessionRuntime');
    expect(dashboardShellSource).not.toContain('chat/utils/session/resetActiveChatSession');
    expect(dashboardConversationSource).not.toContain('chat/utils/session/resetActiveChatSession');
    await expect(fs.stat(
      path.join(rendererRoot, 'features/chat/utils/session/resetActiveChatSession.ts'),
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
    expect(grantEffectsSource).not.toContain('features/permissions');
    expect(onboardingActionsSource).toContain('desktopPermissionGrantEffectsRuntime');
    expect(browserSettingsSource).toContain('desktopPermissionGrantEffectsRuntime');
    expect(onboardingActionsSource).not.toContain('permissions/utils/permissionGrantEffects');
    expect(browserSettingsSource).not.toContain('permissions/utils/permissionGrantEffects');
    await expect(fs.stat(
      path.join(rendererRoot, 'features/permissions/utils/permissionGrantEffects.js'),
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

  test('renderer feature modules read app provider state through runtime facades', async () => {
    const featureRoot = path.join(rendererRoot, 'features');
    const files = await listSourceFiles(featureRoot);
    const offenders: string[] = [];
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
    ];

    for (const file of files) {
      const relativePath = normalizeRelativePath(path.relative(featureRoot, file));
      const source = await fs.readFile(file, 'utf8');
      if (forbiddenProviderNeedles.some((needle) => source.includes(needle))) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
    expect(runtimeClientSource).toContain('useDesktopRendererConfigContext');
    expect(runtimeClientSource).toContain('useAppConfigContext');
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
