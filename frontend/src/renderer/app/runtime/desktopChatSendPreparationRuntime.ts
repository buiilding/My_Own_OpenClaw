/**
 * Prepares renderer chat sends for SDK live-turn dispatch.
 */

import { buildDeferredQueryModelSelection } from './desktopRendererConfigRuntimeClient';
import { DesktopInteractionRuntimeClient } from './desktopInteractionRuntimeClient';
import { DesktopLiveTurnRuntimeClient } from './desktopLiveTurnRuntimeClient';
import { DesktopPendingTurnRuntimeClient } from './desktopPendingTurnRuntimeClient';
import { DesktopSettingsRuntimeClient } from './desktopSettingsRuntimeClient';
import { DesktopTranscriptSessionRuntimeClient } from './desktopTranscriptSessionRuntimeClient';
import { DesktopWorkspaceRuntimeClient } from './desktopWorkspaceRuntimeClient';
import { DesktopWindowRuntimeClient } from './desktopWindowRuntimeClient';
import type { AgentModelSelection, TurnInputResource } from './desktopConversationRuntimeContracts';
import type { ChatSendSurface } from './desktopMessageSendUiRuntime';
import {
  createConversationRef,
  ensureConversationRefForSend,
  resolveRendererConversationSessionSnapshot,
} from './desktopConversationSessionRuntime';
import {
  normalizeAttachmentFilenames,
  normalizeOutgoingPayload,
  type ClipboardImagePayload,
  type OutgoingUserMessagePayload,
  type ReadableFilePayload,
} from './desktopChatSendPayloadRuntime';
import {
  hasUserMessages,
} from './desktopChatSendStateRuntime';
import { logRendererChatPillTrace } from './desktopRendererTraceRuntime';

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
  deferredQueryModelSelection: ReturnType<typeof buildDeferredQueryModelSelection>;
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
  attachmentFilenames,
  conversationRef,
  dependencies,
  text,
  timestamp,
  turnId,
}: {
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
  };
  dependencies.acceptPendingTurn(pendingTurn);
  DesktopPendingTurnRuntimeClient.setPending(pendingTurn);
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

  const hadUserMessages = hasUserMessages(dependencies.getMessages());
  const turnId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const conversationRef = await resolveImmediateConversationRef(dependencies);
  acceptPendingTurn({
    attachmentFilenames,
    conversationRef,
    dependencies,
    text,
    timestamp,
    turnId,
  });
  const workspaceBinding = await ensureConversationWorkspaceBinding(conversationRef);
  const sessionInfo = DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo();

  logRendererChatPillTrace({
    source: 'renderer-send',
    action: 'send-start',
    turn_id: turnId,
    include_query_screenshot: sendLifecycle.shouldCaptureQueryScreenshot,
    reason: sendLifecycle.surfaceReason,
  }, conversationRef);

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
    ? { attachment_filenames: attachmentFilenames }
    : null;

  return {
    attachmentFilenames: attachmentFilenames.length > 0 ? attachmentFilenames : null,
    conversationRef,
    deferredQueryModelSelection: buildDeferredQueryModelSelection(config),
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
