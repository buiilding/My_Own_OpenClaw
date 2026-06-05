import { IpcBridge, INVOKE_CHANNELS } from '../../../../infrastructure/ipc/bridge';
import { buildDeferredQueryModelSelection } from '../../../../app/providers/appConfigBackendSync';
import { DesktopLiveTurnRuntimeClient } from '../../../../app/runtime/desktopLiveTurnRuntimeClient';
import { DesktopSettingsRuntimeClient } from '../../../../app/runtime/desktopSettingsRuntimeClient';
import { DesktopTranscriptSessionRuntimeClient } from '../../../../app/runtime/desktopTranscriptSessionRuntimeClient';
import type { WindieModelSelection } from '../../../../infrastructure/api/windieSdkClient';
import { normalizeArtifactImageContentType } from '../../../../infrastructure/services/ArtifactImageUtils';
import { fetchActiveWorkspaceSelection } from '../../../../infrastructure/workspace/workspaceAccess';
import {
  getConversationWorkspaceBinding,
  setConversationWorkspaceBinding,
  workspaceSelectionToBinding,
} from '../../../../infrastructure/workspace/conversationWorkspaceBinding';
import { logUserSentMessage } from '../../../../infrastructure/interaction/frontendInteractionLogger';
import type { ChatSendSurface } from '../../policies/messageSendUiPolicy';
import {
  ensureConversationRefForSend,
  hydrateConversationSessionFromMainSnapshot,
} from '../../session/conversationSessionRuntime';
import {
  ensureConversationInferenceSessionHydrated,
  markConversationInferenceSessionLocalOnly,
  markConversationInferenceSessionUnknown,
} from '../../session/conversationInferenceSessionRuntime';
import type { ChatMessage } from '../../stores/chatStore';
import { useChatStore } from '../../stores/chatStore';
import { logRendererChatPillTrace } from '../chatStream/chatStreamDebugTrace';
import {
  normalizeAttachmentFilenames,
  normalizeOutgoingPayload,
  type OutgoingUserMessagePayload,
} from './chatMessageSenderPayloads';
import {
  buildReadableFileAttachmentContext,
  type ReadableFileAttachmentFailure,
} from './readableFileAttachmentContext';
import {
  buildPendingUserMessage,
  hasUserMessages,
} from './chatMessageSenderUtils';
import { resolveQueryScreenshotArtifacts } from './queryScreenshotPipeline';
import { createConversationRef } from '../session/conversationRef';

type AppConfigLike = Record<string, unknown> | null | undefined;

type SendLifecycle = {
  shouldCaptureQueryScreenshot: boolean;
  shouldReturnToChatboxOnSend: boolean;
  surfaceReason: string;
};

type WorkspaceBinding = {
  workspacePath?: string | null;
};

type PrepareDesktopChatSendDependencies = {
  addMessage: (message: ChatMessage, conversationRef?: string | null) => void;
  updateMessage: (
    id: string,
    patch: Partial<ChatMessage>,
    conversationRef?: string | null,
  ) => void;
  setIsSending: (isSending: boolean, conversationRef?: string | null) => void;
  setThinkingStatus: (status: string | null, conversationRef?: string | null) => void;
  setChatActiveConversationRef: (conversationRef: string | null) => void;
  stopPlayback?: () => void;
};

export type PreparedDesktopChatTurn = {
  attachmentContext: string | null;
  attachmentFilenames: string[] | null;
  captureMeta: Record<string, unknown> | null;
  conversationRef: string;
  deferredQueryModelSelection: ReturnType<typeof buildDeferredQueryModelSelection>;
  model: WindieModelSelection | null;
  screenshot: string | null;
  screenshotRef: string | null;
  screenshotRefs: string[] | null;
  screenshotUrl: string | null;
  sendLifecycle: SendLifecycle;
  sessionInfo: ReturnType<typeof DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo>;
  text: string;
  timestamp: string;
  turnId: string;
  turnRef: string | null;
  workspacePath: string | null;
};

export function buildReadableAttachmentFailureMessage(
  failures: ReadableFileAttachmentFailure[],
): string {
  const filenames = failures
    .map((failure) => failure.filename)
    .filter((filename) => typeof filename === 'string' && filename.trim().length > 0);
  const listedFiles = filenames.length > 0 ? filenames.join(', ') : 'the selected file';
  return `Your message wasn't sent because WindieOS couldn't read ${listedFiles}. Remove the failed attachment or try again.`;
}

async function hydrateSessionFromMainSnapshot(
  setChatActiveConversationRef: (conversationRef: string | null) => void,
): Promise<string | null> {
  const snapshot = await hydrateConversationSessionFromMainSnapshot({
    loadMainSessionSnapshot: () => IpcBridge.invoke(INVOKE_CHANNELS.GET_CLIENT_USER_ID),
    setTranscriptConversationRef: DesktopTranscriptSessionRuntimeClient.setActiveConversationRef,
    setChatConversationRef: setChatActiveConversationRef,
    updateTranscriptSession: DesktopTranscriptSessionRuntimeClient.updateTranscriptSession,
    markConversationInferenceSessionUnknown,
    onError: (error) => {
      console.warn('[useChatMessageSender] Failed to load startup session snapshot:', error);
    },
  });
  return snapshot.conversationRef;
}

async function ensureConversationRef(
  setChatActiveConversationRef: (conversationRef: string | null) => void,
): Promise<string> {
  return ensureConversationRefForSend({
    transcriptConversationRef: DesktopTranscriptSessionRuntimeClient.getActiveConversationRef(),
    storeConversationRef: useChatStore.getState().activeConversationRef,
    setTranscriptConversationRef: DesktopTranscriptSessionRuntimeClient.setActiveConversationRef,
    setChatConversationRef: setChatActiveConversationRef,
    hydrateMainSessionSnapshot: async () => {
      const conversationRef = await hydrateSessionFromMainSnapshot(setChatActiveConversationRef);
      return {
        conversationRef,
        userId: DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo().userId,
      };
    },
    createConversationRef,
    markConversationInferenceSessionLocalOnly,
  });
}

async function ensureConversationWorkspaceBinding(conversationRef: string): Promise<WorkspaceBinding> {
  const existingBinding = getConversationWorkspaceBinding(conversationRef);
  if (existingBinding.workspacePath) {
    return existingBinding;
  }

  try {
    const selection = await fetchActiveWorkspaceSelection();
    return setConversationWorkspaceBinding(
      conversationRef,
      workspaceSelectionToBinding(selection.workspace),
    );
  } catch (_error) {
    return setConversationWorkspaceBinding(conversationRef, null);
  }
}

async function runSendSurfacePreflight({
  senderSurface,
  shouldReturnToChatboxOnSend,
}: {
  senderSurface: ChatSendSurface;
  shouldReturnToChatboxOnSend: boolean;
}): Promise<void> {
  if (senderSurface === 'overlay-chatbox') {
    try {
      await IpcBridge.invoke(INVOKE_CHANNELS.PRIME_RESPONSE_OVERLAY_AWAITING);
    } catch (error) {
      console.warn('[useChatMessageSender] Failed to prime response overlay awaiting state:', error);
    }
  }

  if (shouldReturnToChatboxOnSend) {
    try {
      await IpcBridge.invoke(INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false });
    } catch (error) {
      console.warn('[useChatMessageSender] Failed to show chatbox:', error);
    }
  }
}

export async function prepareDesktopChatSend({
  payload,
  config,
  dependencies,
  senderSurface,
  sendLifecycle,
}: {
  payload: OutgoingUserMessagePayload;
  config: AppConfigLike;
  dependencies: PrepareDesktopChatSendDependencies;
  senderSurface: ChatSendSurface;
  sendLifecycle: SendLifecycle;
}): Promise<PreparedDesktopChatTurn | null> {
  const normalizedPayload = normalizeOutgoingPayload(payload);
  if (!normalizedPayload) {
    return null;
  }

  const text = normalizedPayload.text;
  const clipboardImages = normalizedPayload.clipboardImages;
  const readableFiles = normalizedPayload.readableFiles;
  const firstClipboardImage = clipboardImages[0] || null;
  const attachmentFilenames = normalizeAttachmentFilenames(clipboardImages, readableFiles);

  dependencies.stopPlayback?.();

  const hadUserMessages = hasUserMessages(useChatStore.getState().messages);
  const conversationRef = await ensureConversationRef(dependencies.setChatActiveConversationRef);
  const workspaceBinding = await ensureConversationWorkspaceBinding(conversationRef);
  const sessionInfo = DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo();
  await ensureConversationInferenceSessionHydrated({
    conversationRef,
    userId: sessionInfo.userId,
  });

  const attachmentContextResult = await buildReadableFileAttachmentContext(readableFiles);
  if (attachmentContextResult.failures.length > 0) {
    const failureMessage = buildReadableAttachmentFailureMessage(attachmentContextResult.failures);
    dependencies.addMessage({
      id: crypto.randomUUID(),
      text: failureMessage,
      sender: 'assistant',
      type: 'error',
      sourceEventType: 'renderer-compose',
      sourceChannel: 'renderer-local',
      isComplete: true,
    }, conversationRef);
    throw new Error(failureMessage);
  }

  const attachmentContext = attachmentContextResult.context;
  const turnId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const userMessageScreenshotContentType = firstClipboardImage
    ? normalizeArtifactImageContentType(firstClipboardImage.contentType)
    : null;
  const userMessageScreenshots = clipboardImages.map((clipboardImage) => ({
    screenshot: clipboardImage.base64,
    screenshotContentType: normalizeArtifactImageContentType(clipboardImage.contentType),
    screenshotRef: null,
    screenshotUrl: null,
  }));

  logRendererChatPillTrace({
    source: 'renderer-send',
    action: 'send-start',
    turn_id: turnId,
    include_query_screenshot: sendLifecycle.shouldCaptureQueryScreenshot,
    reason: sendLifecycle.surfaceReason,
  }, conversationRef);

  dependencies.addMessage({
    ...buildPendingUserMessage(turnId, text),
    turnRef: turnId,
    sourceEventType: 'renderer-compose',
    sourceChannel: 'renderer-local',
    screenshot: firstClipboardImage?.base64 || null,
    screenshotContentType: userMessageScreenshotContentType,
    screenshots: userMessageScreenshots.length > 0 ? userMessageScreenshots : null,
    attachmentFilenames: attachmentFilenames.length > 0 ? attachmentFilenames : null,
    timestamp,
  }, conversationRef);
  dependencies.setIsSending(true, conversationRef);
  dependencies.setThinkingStatus(null, conversationRef);

  logUserSentMessage({
    conversationRef,
    senderSurface,
    messageText: text,
    textLength: text.length,
    attachmentCount: attachmentFilenames.length,
    imageCount: clipboardImages.length,
    readableFileCount: readableFiles.length,
  });

  await runSendSurfacePreflight({
    senderSurface,
    shouldReturnToChatboxOnSend: sendLifecycle.shouldReturnToChatboxOnSend,
  });

  const {
    captureMeta,
    uploadedScreenshotEntries,
    screenshotRef,
    screenshotUrl,
    screenshotRefs,
  } = await resolveQueryScreenshotArtifacts({
    clipboardImages,
    shouldCaptureQueryScreenshot: sendLifecycle.shouldCaptureQueryScreenshot,
    isFirstUserMessage: !hadUserMessages,
    traceContext: {
      conversationRef,
      turnId,
      surfaceReason: sendLifecycle.surfaceReason,
    },
  });

  dependencies.updateMessage(turnId, {
    screenshotRef,
    screenshotUrl,
    screenshots: uploadedScreenshotEntries.length > 0 ? uploadedScreenshotEntries : null,
  }, conversationRef);

  return {
    attachmentContext,
    attachmentFilenames: attachmentFilenames.length > 0 ? attachmentFilenames : null,
    captureMeta,
    conversationRef,
    deferredQueryModelSelection: buildDeferredQueryModelSelection(config),
    model: null,
    screenshot: null,
    screenshotRef,
    screenshotRefs: screenshotRefs.length > 0 ? screenshotRefs : null,
    screenshotUrl,
    sendLifecycle,
    sessionInfo,
    text,
    timestamp,
    turnId,
    turnRef: turnId,
    workspacePath: workspaceBinding.workspacePath || null,
  };
}

export async function dispatchPreparedDesktopChatTurn(
  preparedTurn: PreparedDesktopChatTurn,
): Promise<void> {
  if (preparedTurn.deferredQueryModelSelection) {
    DesktopSettingsRuntimeClient.setModel(preparedTurn.deferredQueryModelSelection);
  }
  await DesktopLiveTurnRuntimeClient.sendQuery({
    text: preparedTurn.text,
    conversationRef: preparedTurn.conversationRef,
    screenshotRef: preparedTurn.screenshotRef,
    screenshotUrl: preparedTurn.screenshotUrl,
    screenshotRefs: preparedTurn.screenshotRefs,
    captureMeta: preparedTurn.captureMeta,
    attachmentContext: preparedTurn.attachmentContext,
    attachmentFilenames: preparedTurn.attachmentFilenames,
    screenshot: preparedTurn.screenshot,
    workspacePath: preparedTurn.workspacePath,
    model: preparedTurn.model,
    turnRef: preparedTurn.turnRef,
  });
  logRendererChatPillTrace({
    source: 'renderer-send',
    action: 'query-dispatched',
    turn_id: preparedTurn.turnId,
    include_query_screenshot: preparedTurn.sendLifecycle.shouldCaptureQueryScreenshot,
    reason: preparedTurn.sendLifecycle.surfaceReason,
  }, preparedTurn.conversationRef);
}
