/**
 * Prepares renderer chat sends for SDK live-turn dispatch.
 */

import { DesktopRendererConfigRuntimeClient } from './desktopRendererConfigRuntimeClient';
import { DesktopInteractionRuntimeClient } from './desktopInteractionRuntimeClient';
import { DesktopLiveTurnRuntimeClient } from './desktopLiveTurnRuntimeClient';
import { DesktopPendingTurnRuntimeClient } from './desktopPendingTurnRuntimeClient';
import { DesktopPendingTurnBridgeRuntime } from './desktopPendingTurnBridgeRuntime';
import { DesktopSettingsRuntimeClient } from './desktopSettingsRuntimeClient';
import { DesktopTranscriptSessionRuntimeClient } from './desktopTranscriptSessionRuntimeClient';
import { DesktopWorkspaceRuntimeClient } from './desktopWorkspaceRuntimeClient';
import { DesktopWindowRuntimeClient } from './desktopWindowRuntimeClient';
import type { AgentModelSelection, TurnInputResource } from './desktopConversationRuntimeContracts';
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
import { DesktopRendererTraceRuntime } from './desktopRendererTraceRuntime';

const {
  normalizeOutgoingPayload,
} = DesktopChatSendPayloadRuntime;
const {
  buildPendingTurn,
} = DesktopPendingTurnBridgeRuntime;
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

type ChatSendReadModel = {
  hasPriorUserMessages: boolean;
};

type PendingDesktopChatTurn = {
  conversationRef: string;
  turnRef: string;
  userMessageId: string;
  text: string;
  timestamp: string;
};

type PrepareDesktopChatSendDependencies = {
  acceptPendingTurn: (pendingTurn: PendingDesktopChatTurn) => void;
  getActiveConversationRef: () => string | null | undefined;
  getSendReadModel: () => ChatSendReadModel;
  setChatActiveConversationRef: (conversationRef: string | null) => void;
  stopPlayback?: () => void;
};

type DispatchPreparedDesktopChatTurnDependencies = {
  clearPendingTurn: (input: {
    conversationRef?: string | null;
    turnRef?: string | null;
  }) => void;
};

type PreparedDesktopChatTurn = {
  conversationRef: string;
  deferredQueryModelSelection: ReturnType<
    typeof DesktopRendererConfigRuntimeClient.buildDeferredQueryModelSelection
  >;
  model: AgentModelSelection | null;
  resources: TurnInputResource[];
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
  shouldCaptureQueryScreenshot,
  isFirstUserMessage,
  surfaceReason,
  workspacePath,
}: {
  readableFiles: ReadableFilePayload[];
  clipboardImages: ClipboardImagePayload[];
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
  if (shouldCaptureQueryScreenshot) {
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
  return resources;
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
  conversationRef,
  dependencies,
  text,
  timestamp,
  turnId,
}: {
  conversationRef: string;
  dependencies: Pick<PrepareDesktopChatSendDependencies, 'acceptPendingTurn'>;
  text: string;
  timestamp: string;
  turnId: string;
}): void {
  const pendingTurn = buildPendingTurn({
    conversationRef,
    turnRef: turnId,
    text,
    timestamp,
  });
  if (!pendingTurn) {
    return;
  }
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

  dependencies.stopPlayback?.();

  const sendReadModel = dependencies.getSendReadModel();
  const hadUserMessages = sendReadModel.hasPriorUserMessages === true;
  const turnId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const conversationRef = await resolveImmediateConversationRef(dependencies);
  acceptPendingTurn({
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
    attachmentCount: clipboardImages.length + readableFiles.length,
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
    workspacePath: workspaceBinding.workspacePath || null,
  });

  return {
    conversationRef,
    deferredQueryModelSelection: DesktopRendererConfigRuntimeClient
      .buildDeferredQueryModelSelection(config),
    model: null,
    resources,
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
  dependencies: DispatchPreparedDesktopChatTurnDependencies,
): Promise<void> {
  try {
    if (preparedTurn.deferredQueryModelSelection) {
      await DesktopSettingsRuntimeClient.setModel(preparedTurn.deferredQueryModelSelection);
    }
    await DesktopLiveTurnRuntimeClient.sendQuery({
      text: preparedTurn.text,
      conversationRef: preparedTurn.conversationRef,
      workspacePath: preparedTurn.workspacePath,
      resources: preparedTurn.resources,
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
  } catch (error) {
    dependencies.clearPendingTurn({
      conversationRef: preparedTurn.conversationRef,
      turnRef: preparedTurn.turnRef,
    });
    DesktopPendingTurnRuntimeClient.clear({
      conversationRef: preparedTurn.conversationRef,
      turnRef: preparedTurn.turnRef,
    });
    throw error;
  }
}

export const DesktopChatSendPreparationRuntime = Object.freeze({
  prepareDesktopChatSend,
  dispatchPreparedDesktopChatTurn,
});
