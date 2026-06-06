import { IpcBridge, INVOKE_CHANNELS } from '../../../../infrastructure/ipc/bridge';
import { buildDeferredQueryModelSelection } from '../../../../app/providers/appConfigBackendSync';
import { DesktopLiveTurnRuntimeClient } from '../../../../app/runtime/desktopLiveTurnRuntimeClient';
import { DesktopSettingsRuntimeClient } from '../../../../app/runtime/desktopSettingsRuntimeClient';
import { DesktopTranscriptSessionRuntimeClient } from '../../../../app/runtime/desktopTranscriptSessionRuntimeClient';
import type { TurnInputResource, WindieModelSelection } from '../../../../infrastructure/api/windieSdkClient';
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
import { useChatStore } from '../../stores/chatStore';
import { logRendererChatPillTrace } from '../chatStream/chatStreamDebugTrace';
import {
  normalizeAttachmentFilenames,
  normalizeOutgoingPayload,
  type ClipboardImagePayload,
  type OutgoingUserMessagePayload,
  type ReadableFilePayload,
} from './chatMessageSenderPayloads';
import {
  hasUserMessages,
} from './chatMessageSenderUtils';
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
  setChatActiveConversationRef: (conversationRef: string | null) => void;
  stopPlayback?: () => void;
};

export type PreparedDesktopChatTurn = {
  attachmentFilenames: string[] | null;
  conversationRef: string;
  deferredQueryModelSelection: ReturnType<typeof buildDeferredQueryModelSelection>;
  metadata: Record<string, unknown> | null;
  model: WindieModelSelection | null;
  resources: TurnInputResource[];
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

function buildTurnInputResources({
  readableFiles,
  clipboardImages,
  attachmentFilenames,
  shouldCaptureQueryScreenshot,
  isFirstUserMessage,
  surfaceReason,
  workspacePath,
}: {
  readableFiles: ReadableFilePayload[];
  clipboardImages: ClipboardImagePayload[];
  attachmentFilenames: string[];
  shouldCaptureQueryScreenshot: boolean;
  isFirstUserMessage: boolean;
  surfaceReason: string;
  workspacePath?: string | null;
}): TurnInputResource[] {
  const resources: TurnInputResource[] = [];
  for (const readableFile of readableFiles) {
    resources.push({
      kind: 'readable_file',
      filePath: readableFile.filePath,
      filename: readableFile.filename,
      required: true,
    });
  }
  for (const clipboardImage of clipboardImages) {
    resources.push({
      kind: 'clipboard_image',
      base64: clipboardImage.base64,
      contentType: clipboardImage.contentType ?? null,
      filename: clipboardImage.filename ?? null,
      required: true,
    });
  }
  if (shouldCaptureQueryScreenshot && clipboardImages.length === 0) {
    resources.push({
      kind: 'query_screenshot_request',
      isFirstUserMessage,
      reason: surfaceReason,
      required: false,
    });
  }
  if (workspacePath) {
    resources.push({
      kind: 'workspace',
      workspacePath,
      required: false,
    });
  }
  return resources.length > 0 || attachmentFilenames.length > 0 ? resources : [];
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

  const turnId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  logRendererChatPillTrace({
    source: 'renderer-send',
    action: 'send-start',
    turn_id: turnId,
    include_query_screenshot: sendLifecycle.shouldCaptureQueryScreenshot,
    reason: sendLifecycle.surfaceReason,
  }, conversationRef);

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

  logRendererChatPillTrace({
    source: 'renderer-send',
    action: 'screenshot-decision',
    turn_id: turnId,
    include_query_screenshot: sendLifecycle.shouldCaptureQueryScreenshot,
    reason: sendLifecycle.surfaceReason,
  }, conversationRef);

  const resources = buildTurnInputResources({
    readableFiles,
    clipboardImages,
    shouldCaptureQueryScreenshot: sendLifecycle.shouldCaptureQueryScreenshot,
    isFirstUserMessage: !hadUserMessages,
    surfaceReason: sendLifecycle.surfaceReason,
    attachmentFilenames,
    workspacePath: workspaceBinding.workspacePath || null,
  });
  const metadata = attachmentFilenames.length > 0
    ? { attachmentFilenames, attachment_filenames: attachmentFilenames }
    : null;

  return {
    attachmentFilenames: attachmentFilenames.length > 0 ? attachmentFilenames : null,
    conversationRef,
    deferredQueryModelSelection: buildDeferredQueryModelSelection(config),
    metadata,
    model: null,
    resources,
    screenshot: null,
    screenshotRef: null,
    screenshotRefs: null,
    screenshotUrl: null,
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
    attachmentFilenames: preparedTurn.attachmentFilenames,
    screenshot: preparedTurn.screenshot,
    workspacePath: preparedTurn.workspacePath,
    resources: preparedTurn.resources,
    metadata: preparedTurn.metadata,
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
