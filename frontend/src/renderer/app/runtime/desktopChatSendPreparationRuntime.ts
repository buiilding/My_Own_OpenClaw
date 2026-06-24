/**
 * Prepares renderer chat sends for SDK live-turn dispatch.
 */

import { DesktopRendererConfigRuntimeClient } from './desktopRendererConfigRuntimeClient';
import { DesktopInteractionRuntimeClient } from './desktopInteractionRuntimeClient';
import { DesktopLiveTurnRuntimeClient } from './desktopLiveTurnRuntimeClient';
import { DesktopPendingTurnRuntimeClient } from './desktopPendingTurnRuntimeClient';
import { DesktopSettingsRuntimeClient } from './desktopSettingsRuntimeClient';
import { DesktopTranscriptSessionRuntimeClient } from './desktopTranscriptSessionRuntimeClient';
import { DesktopWorkspaceRuntimeClient } from './desktopWorkspaceRuntimeClient';
import { DesktopWindowRuntimeClient } from './desktopWindowRuntimeClient';
import type { AgentModelSelection, TurnInputResource } from './desktopConversationRuntimeContracts';
import type { ChatMessage } from './desktopChatMessageTypes';
import type { ChatSendSurface } from './desktopMessageSendUiRuntime';
import {
  DesktopConversationSessionRuntime,
} from './desktopConversationSessionRuntime';
import {
  DesktopChatSendPayloadRuntime,
  type ClipboardImagePayload,
  type OutgoingUserMessagePayload,
  type ReadableFilePayload,
} from './desktopChatSendPayloadRuntime';
import { DesktopChatSendStateRuntime } from './desktopChatSendStateRuntime';
import { DesktopRendererTraceRuntime } from './desktopRendererTraceRuntime';

const {
  normalizeAttachmentFilenames,
  normalizeOutgoingPayload,
} = DesktopChatSendPayloadRuntime;
const {
  hasUserMessages,
} = DesktopChatSendStateRuntime;
const {
  createConversationRef,
  ensureConversationRefForSend,
  resolveRendererConversationSessionSnapshot,
} = DesktopConversationSessionRuntime;
const {
  logRendererChatSendLifecycleTrace,
} = DesktopRendererTraceRuntime;

type AppConfigLike = Record<string, unknown> | null | undefined;

type SendLifecycle = {
  shouldCaptureQueryScreenshot: boolean;
  shouldReturnToChatboxOnSend: boolean;
  surfaceReason: string;
};

type WorkspaceBinding = {
  workspacePath?: string | null;
};

type ChatSendMessageSnapshot = {
  sender?: string | null;
};

type PendingDesktopChatTurn = {
  conversationRef: string;
  turnRef: string;
  userMessageId: string;
  text: string;
  timestamp: string;
  attachmentFilenames: string[] | null;
  attachments: ChatMessage['attachments'];
};

type PrepareDesktopChatSendDependencies = {
  acceptPendingTurn: (pendingTurn: PendingDesktopChatTurn) => void;
  getActiveConversationRef: () => string | null | undefined;
  getMessages: () => ChatSendMessageSnapshot[];
  setChatActiveConversationRef: (conversationRef: string | null) => void;
  stopPlayback?: () => void;
};

type PreparedDesktopChatTurn = {
  attachmentFilenames: string[] | null;
  conversationRef: string;
  deferredQueryModelSelection: ReturnType<
    typeof DesktopRendererConfigRuntimeClient.buildDeferredQueryModelSelection
  >;
  metadata: Record<string, unknown> | null;
  model: AgentModelSelection | null;
  resources: TurnInputResource[];
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

function buildTurnInputResources({
  readableFiles,
  clipboardImages,
  attachmentFilenames,
  shouldCaptureQueryScreenshot,
  isFirstUserMessage,
  surfaceReason,
  workspacePath,
  turnId,
}: {
  readableFiles: ReadableFilePayload[];
  clipboardImages: ClipboardImagePayload[];
  attachmentFilenames: string[];
  shouldCaptureQueryScreenshot: boolean;
  isFirstUserMessage: boolean;
  surfaceReason: string;
  workspacePath?: string | null;
  turnId: string;
}): TurnInputResource[] {
  const resources: TurnInputResource[] = [];
  let visualIndex = 0;
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
      displayAttachmentId: `${turnId}:attachment:${visualIndex.toString().padStart(3, '0')}`,
      base64: clipboardImage.base64,
      contentType: clipboardImage.contentType ?? null,
      filename: clipboardImage.filename ?? null,
      required: true,
    });
    visualIndex += 1;
  }
  if (shouldCaptureQueryScreenshot) {
    resources.push({
      kind: 'query_screenshot_request',
      displayAttachmentId: `${turnId}:attachment:${visualIndex.toString().padStart(3, '0')}`,
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

async function ensureConversationWorkspaceBinding(conversationRef: string): Promise<WorkspaceBinding> {
  const existingBinding = DesktopWorkspaceRuntimeClient.getConversationWorkspaceBinding(conversationRef);
  if (existingBinding.workspacePath) {
    return existingBinding;
  }

  try {
    const selection = await DesktopWorkspaceRuntimeClient.fetchActiveWorkspaceSelection();
    return DesktopWorkspaceRuntimeClient.setConversationWorkspaceBinding(
      conversationRef,
      DesktopWorkspaceRuntimeClient.workspaceSelectionToBinding(selection.workspace),
    );
  } catch (_error) {
    return DesktopWorkspaceRuntimeClient.setConversationWorkspaceBinding(conversationRef, null);
  }
}

async function resolveImmediateConversationRef(
  dependencies: Pick<PrepareDesktopChatSendDependencies, 'getActiveConversationRef' | 'setChatActiveConversationRef'>,
): Promise<string> {
  const sessionInfo = DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo();
  const transcriptConversationRef = DesktopTranscriptSessionRuntimeClient.getActiveConversationRef();
  const storeConversationRef = dependencies.getActiveConversationRef();
  const sessionSnapshot = resolveRendererConversationSessionSnapshot({
    transcriptConversationRef,
    storeConversationRef,
    userId: sessionInfo.userId,
  });
  const conversationRef = await ensureConversationRefForSend({
    transcriptConversationRef,
    storeConversationRef,
    setTranscriptConversationRef: DesktopTranscriptSessionRuntimeClient.setActiveConversationRef,
    setChatConversationRef: dependencies.setChatActiveConversationRef,
    hydrateMainSessionSnapshot: async () => ({ conversationRef: null, userId: sessionSnapshot.userId }),
    createConversationRef,
  });
  DesktopTranscriptSessionRuntimeClient.updateTranscriptSession(
    conversationRef,
    sessionSnapshot.userId,
  );
  return conversationRef;
}

function acceptPendingTurn({
  attachments,
  attachmentFilenames,
  conversationRef,
  dependencies,
  text,
  timestamp,
  turnId,
}: {
  attachments: ChatMessage['attachments'];
  attachmentFilenames: string[];
  conversationRef: string;
  dependencies: Pick<PrepareDesktopChatSendDependencies, 'acceptPendingTurn'>;
  text: string;
  timestamp: string;
  turnId: string;
}): void {
  const pendingTurn = {
    conversationRef,
    turnRef: turnId,
    userMessageId: `${turnId}-sdk-evt-000002-user_message`,
    text,
    timestamp,
    attachmentFilenames: attachmentFilenames.length > 0 ? attachmentFilenames : null,
    attachments,
  };
  dependencies.acceptPendingTurn(pendingTurn);
  DesktopPendingTurnRuntimeClient.setPending(pendingTurn);
}

function buildOptimisticDisplayAttachments({
  clipboardImages,
  shouldCaptureQueryScreenshot,
  turnId,
}: {
  clipboardImages: ClipboardImagePayload[];
  shouldCaptureQueryScreenshot: boolean;
  turnId: string;
}): ChatMessage['attachments'] {
  const attachments: NonNullable<ChatMessage['attachments']> = [];
  let visualIndex = 0;
  for (const clipboardImage of clipboardImages) {
    if (typeof clipboardImage.base64 !== 'string' || clipboardImage.base64.length === 0) {
      continue;
    }
    const contentType = clipboardImage.contentType ?? 'image/png';
    attachments.push({
      id: `${turnId}:attachment:${visualIndex.toString().padStart(3, '0')}`,
      kind: 'image',
      source: 'user_included',
      status: 'materializing',
      ...(clipboardImage.filename ? { filename: clipboardImage.filename } : {}),
      contentType,
      previewSrc: `data:${contentType};base64,${clipboardImage.base64}`,
    });
    visualIndex += 1;
  }
  if (shouldCaptureQueryScreenshot) {
    attachments.push({
      id: `${turnId}:attachment:${visualIndex.toString().padStart(3, '0')}`,
      kind: 'screenshot_request',
      source: 'camera_button',
      status: 'pending_capture',
    });
  }
  return attachments.length > 0 ? attachments : null;
}

async function runSendSurfaceWindowPolicy({
  shouldReturnToChatboxOnSend,
}: {
  shouldReturnToChatboxOnSend: boolean;
}): Promise<void> {
  if (shouldReturnToChatboxOnSend) {
    try {
      await DesktopWindowRuntimeClient.showChatboxWithValues(false);
    } catch (error) {
      console.warn('[useChatMessageSender] Failed to show chatbox:', error);
    }
  }
}

async function prepareDesktopChatSend({
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

  const hadUserMessages = hasUserMessages(dependencies.getMessages());
  const turnId = crypto.randomUUID();
  const optimisticAttachments = buildOptimisticDisplayAttachments({
    clipboardImages,
    shouldCaptureQueryScreenshot: sendLifecycle.shouldCaptureQueryScreenshot,
    turnId,
  });
  const timestamp = new Date().toISOString();
  const conversationRef = await resolveImmediateConversationRef(dependencies);
  acceptPendingTurn({
    attachments: optimisticAttachments,
    attachmentFilenames,
    conversationRef,
    dependencies,
    text,
    timestamp,
    turnId,
  });
  const workspaceBinding = await ensureConversationWorkspaceBinding(conversationRef);
  const sessionInfo = DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo();

  logRendererChatSendLifecycleTrace({
    action: 'send-start',
    conversationRef,
    turnId,
    includeQueryScreenshot: sendLifecycle.shouldCaptureQueryScreenshot,
    reason: sendLifecycle.surfaceReason,
  });

  DesktopInteractionRuntimeClient.logUserSentMessage({
    conversationRef,
    senderSurface,
    messageText: text,
    textLength: text.length,
    attachmentCount: attachmentFilenames.length,
    imageCount: clipboardImages.length,
    readableFileCount: readableFiles.length,
  });

  await runSendSurfaceWindowPolicy({
    shouldReturnToChatboxOnSend: sendLifecycle.shouldReturnToChatboxOnSend,
  });

  logRendererChatSendLifecycleTrace({
    action: 'screenshot-decision',
    conversationRef,
    turnId,
    includeQueryScreenshot: sendLifecycle.shouldCaptureQueryScreenshot,
    reason: sendLifecycle.surfaceReason,
  });

  const resources = buildTurnInputResources({
    readableFiles,
    clipboardImages,
    shouldCaptureQueryScreenshot: sendLifecycle.shouldCaptureQueryScreenshot,
    isFirstUserMessage: !hadUserMessages,
    surfaceReason: sendLifecycle.surfaceReason,
    attachmentFilenames,
    workspacePath: workspaceBinding.workspacePath || null,
    turnId,
  });
  const metadata = attachmentFilenames.length > 0
    ? { attachment_filenames: attachmentFilenames }
    : null;

  return {
    attachmentFilenames: attachmentFilenames.length > 0 ? attachmentFilenames : null,
    conversationRef,
    deferredQueryModelSelection: DesktopRendererConfigRuntimeClient
      .buildDeferredQueryModelSelection(config),
    metadata,
    model: null,
    resources,
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

async function dispatchPreparedDesktopChatTurn(
  preparedTurn: PreparedDesktopChatTurn,
): Promise<void> {
  if (preparedTurn.deferredQueryModelSelection) {
    await DesktopSettingsRuntimeClient.setModel(preparedTurn.deferredQueryModelSelection);
  }
  await DesktopLiveTurnRuntimeClient.sendQuery({
    text: preparedTurn.text,
    conversationRef: preparedTurn.conversationRef,
    screenshotRef: preparedTurn.screenshotRef,
    screenshotUrl: preparedTurn.screenshotUrl,
    screenshotRefs: preparedTurn.screenshotRefs,
    attachmentFilenames: preparedTurn.attachmentFilenames,
    workspacePath: preparedTurn.workspacePath,
    resources: preparedTurn.resources,
    metadata: preparedTurn.metadata,
    model: preparedTurn.model,
    turnRef: preparedTurn.turnRef,
  });
  logRendererChatSendLifecycleTrace({
    action: 'query-dispatched',
    conversationRef: preparedTurn.conversationRef,
    turnId: preparedTurn.turnId,
    includeQueryScreenshot: preparedTurn.sendLifecycle.shouldCaptureQueryScreenshot,
    reason: preparedTurn.sendLifecycle.surfaceReason,
  });
}

export const DesktopChatSendPreparationRuntime = Object.freeze({
  prepareDesktopChatSend,
  dispatchPreparedDesktopChatTurn,
});
