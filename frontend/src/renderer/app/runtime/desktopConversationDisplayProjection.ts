/**
 * Coordinates SDK display-row projection for renderer chat consumers.
 */

import type { ChatMessage } from './desktopChatMessageTypes';
import type { ConversationView } from './desktopConversationRuntimeContracts';
import {
  buildChatMessagesFromSdkDisplayRows,
} from '../../infrastructure/transcript/sdkDisplayChatMessageProjection';
import {
  DesktopSdkDisplayAttachmentProjection,
} from './desktopSdkDisplayAttachmentProjection';
import {
  DesktopPendingTurnBridgeRuntime,
} from './desktopPendingTurnBridgeRuntime';

const {
  countDisplayImageAttachments,
  summarizeSdkDisplayAttachments,
} = DesktopSdkDisplayAttachmentProjection;
const {
  buildPendingTurnUserMessage,
} = DesktopPendingTurnBridgeRuntime;

type DisplayProjectionTraceInput = {
  mergedMessages?: ChatMessage[];
  rows?: unknown[];
  sdkMessages?: ChatMessage[];
};

type PendingTurnLike = {
  attachmentFilenames?: string[] | null;
  conversationRef?: string | null;
  timestamp?: string | null;
  turnRef?: string | null;
  userMessageId?: string | null;
  text?: string | null;
} | null | undefined;

type MergeRendererAnnotationsOptions = {
  pendingTurn?: PendingTurnLike;
};

type RendererMessageAnnotation = {
  feedback?: ChatMessage['feedback'];
  fullAssistantMessage?: ChatMessage['fullAssistantMessage'];
  fullUserMessage?: ChatMessage['fullUserMessage'];
  id: string;
  systemPrompt?: ChatMessage['systemPrompt'];
  tokenCounts?: ChatMessage['tokenCounts'];
  toolSchemas?: ChatMessage['toolSchemas'];
};

type BuildConversationViewMessagesInput = {
  conversationView?: ConversationView | null;
  pendingTurn?: PendingTurnLike;
  preserveRendererAnnotations?: boolean;
  rendererAnnotations?: RendererMessageAnnotation[];
};

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeTurnRef(turnRef: string | null | undefined): string | null {
  return typeof turnRef === 'string' && turnRef.trim()
    ? turnRef.trim()
    : null;
}

function sdkUserTurnRefs(messages: ChatMessage[]): Set<string> {
  const turnRefs = new Set<string>();
  for (const message of messages) {
    if (message.sender !== 'user') {
      continue;
    }
    const turnRef = normalizeTurnRef(message.turnRef);
    if (turnRef) {
      turnRefs.add(turnRef);
    }
  }
  return turnRefs;
}

function pendingBridgeUserMessages(
  sdkMessages: ChatMessage[],
  pendingTurn: PendingTurnLike,
): ChatMessage[] {
  const sdkMessageIds = new Set(sdkMessages.map((message) => message.id));
  const projectedUserTurns = sdkUserTurnRefs(sdkMessages);
  const pendingMessage = buildPendingTurnUserMessage(pendingTurn) as ChatMessage | null;
  const pendingTurnRef = normalizeTurnRef(pendingMessage?.turnRef);
  if (
    pendingMessage
    && pendingTurnRef
    && !sdkMessageIds.has(pendingMessage.id)
    && !projectedUserTurns.has(pendingTurnRef)
  ) {
    return [pendingMessage];
  }
  return [];
}

function mergePendingBridgeUserMessages(
  sdkMessages: ChatMessage[],
  pendingMessages: ChatMessage[],
): ChatMessage[] {
  if (pendingMessages.length === 0) {
    return sdkMessages;
  }
  const merged = [...sdkMessages];
  for (const pendingMessage of pendingMessages) {
    const turnRef = normalizeTurnRef(pendingMessage.turnRef);
    const sameTurnIndex = turnRef
      ? merged.findIndex((message) => normalizeTurnRef(message.turnRef) === turnRef)
      : -1;
    if (sameTurnIndex >= 0) {
      merged.splice(sameTurnIndex, 0, pendingMessage);
    } else {
      merged.push(pendingMessage);
    }
  }
  return merged;
}

function mergeRendererAnnotationsIntoSdkMessages(
  sdkMessages: ChatMessage[],
  rendererAnnotations: Array<ChatMessage | RendererMessageAnnotation>,
  options: MergeRendererAnnotationsOptions = {},
): ChatMessage[] {
  if (rendererAnnotations.length === 0 && !options.pendingTurn) {
    return sdkMessages;
  }
  const annotationsById = new Map(rendererAnnotations.map((message) => [message.id, message]));
  const mergedSdkMessages = sdkMessages.map((message) => {
    const annotation = annotationsById.get(message.id);
    return {
      ...message,
      ...(annotation?.systemPrompt ? { systemPrompt: annotation.systemPrompt } : {}),
      ...(annotation?.toolSchemas ? { toolSchemas: annotation.toolSchemas } : {}),
      ...(annotation?.fullUserMessage ? { fullUserMessage: annotation.fullUserMessage } : {}),
      ...(annotation?.fullAssistantMessage ? { fullAssistantMessage: annotation.fullAssistantMessage } : {}),
      ...(annotation?.feedback ? { feedback: annotation.feedback } : {}),
      ...(annotation?.tokenCounts ? { tokenCounts: annotation.tokenCounts } : {}),
    };
  });
  return mergePendingBridgeUserMessages(
    mergedSdkMessages,
    pendingBridgeUserMessages(mergedSdkMessages, options.pendingTurn),
  );
}

function hasRendererMessageAnnotations(message: ChatMessage): boolean {
  return Boolean(
    message.systemPrompt
      || message.toolSchemas
      || message.fullUserMessage
      || message.fullAssistantMessage
      || message.feedback
      || message.tokenCounts,
  );
}

function selectRendererMessageAnnotations(messages: ChatMessage[] = []): RendererMessageAnnotation[] {
  return messages.flatMap((message) => {
    if (typeof message.id !== 'string' || !message.id || !hasRendererMessageAnnotations(message)) {
      return [];
    }
    return [{
      id: message.id,
      ...(message.systemPrompt ? { systemPrompt: message.systemPrompt } : {}),
      ...(message.toolSchemas ? { toolSchemas: message.toolSchemas } : {}),
      ...(message.fullUserMessage ? { fullUserMessage: message.fullUserMessage } : {}),
      ...(message.fullAssistantMessage ? { fullAssistantMessage: message.fullAssistantMessage } : {}),
      ...(message.feedback ? { feedback: message.feedback } : {}),
      ...(message.tokenCounts ? { tokenCounts: message.tokenCounts } : {}),
    }];
  });
}

function buildConversationViewChatMessages({
  conversationView = null,
  pendingTurn = null,
  preserveRendererAnnotations = false,
  rendererAnnotations = [],
}: BuildConversationViewMessagesInput): ChatMessage[] {
  if (!conversationView || typeof conversationView !== 'object') {
    return [];
  }
  const displayRows = Array.isArray(conversationView.displayRows)
    ? conversationView.displayRows
    : [];
  const sdkMessages = buildChatMessagesFromSdkDisplayRows(displayRows);
  if (!preserveRendererAnnotations) {
    return sdkMessages;
  }
  return mergeRendererAnnotationsIntoSdkMessages(
    sdkMessages,
    rendererAnnotations,
    { pendingTurn },
  );
}

function countMessageImages(message: ChatMessage): number {
  return countDisplayImageAttachments(message.attachments);
}

function countSdkRowImages(row: unknown): number {
  const record = recordFromUnknown(row);
  const metadata = recordFromUnknown(record?.metadata);
  if (!metadata) {
    return 0;
  }
  return countDisplayImageAttachments(metadata.attachments);
}

function summarizeSdkRowAttachments(rows: unknown[]): Record<string, unknown> {
  let userAttachmentCount = 0;
  let readyArtifactCount = 0;
  let materializingPreviewCount = 0;
  let pendingScreenshotRequestCount = 0;
  let failedAttachmentCount = 0;
  const sources = new Set<string>();
  const statuses = new Set<string>();
  for (const row of rows) {
    const record = recordFromUnknown(row);
    if (record?.role !== 'user' && record?.type !== 'user_message') {
      continue;
    }
    const metadata = recordFromUnknown(record?.metadata);
    const attachmentSummary = summarizeSdkDisplayAttachments(metadata?.attachments);
    userAttachmentCount += Number(attachmentSummary.userAttachmentCount) || 0;
    readyArtifactCount += Number(attachmentSummary.readyArtifactCount) || 0;
    materializingPreviewCount += Number(attachmentSummary.materializingPreviewCount) || 0;
    pendingScreenshotRequestCount += Number(attachmentSummary.pendingScreenshotRequestCount) || 0;
    failedAttachmentCount += Number(attachmentSummary.failedAttachmentCount) || 0;
    const attachmentSources = Array.isArray(attachmentSummary.attachmentSources)
      ? attachmentSummary.attachmentSources
      : [];
    const attachmentStatuses = Array.isArray(attachmentSummary.attachmentStatuses)
      ? attachmentSummary.attachmentStatuses
      : [];
    for (const source of attachmentSources) {
      if (typeof source === 'string') {
        sources.add(source);
      }
    }
    for (const status of attachmentStatuses) {
      if (typeof status === 'string') {
        statuses.add(status);
      }
    }
  }
  return {
    userAttachmentCount,
    attachmentSources: Array.from(sources).sort(),
    attachmentStatuses: Array.from(statuses).sort(),
    readyArtifactCount,
    materializingPreviewCount,
    pendingScreenshotRequestCount,
    failedAttachmentCount,
  };
}

function summarizeUserMessageImages(messages: ChatMessage[]): {
  userImageCount: number;
  userMessageCount: number;
  userMessagesWithImages: number;
} {
  let userImageCount = 0;
  let userMessageCount = 0;
  let userMessagesWithImages = 0;
  for (const message of messages) {
    if (message.sender !== 'user') {
      continue;
    }
    userMessageCount += 1;
    const imageCount = countMessageImages(message);
    userImageCount += imageCount;
    if (imageCount > 0) {
      userMessagesWithImages += 1;
    }
  }
  return {
    userImageCount,
    userMessageCount,
    userMessagesWithImages,
  };
}

function summarizeSdkUserRows(rows: unknown[]): {
  sdkUserImageCount: number;
  sdkUserRowCount: number;
  sdkUserRowsWithImages: number;
} {
  let sdkUserImageCount = 0;
  let sdkUserRowCount = 0;
  let sdkUserRowsWithImages = 0;
  for (const row of rows) {
    const record = recordFromUnknown(row);
    if (record?.role !== 'user' && record?.type !== 'user_message') {
      continue;
    }
    sdkUserRowCount += 1;
    const imageCount = countSdkRowImages(row);
    sdkUserImageCount += imageCount;
    if (imageCount > 0) {
      sdkUserRowsWithImages += 1;
    }
  }
  return {
    sdkUserImageCount,
    sdkUserRowCount,
    sdkUserRowsWithImages,
  };
}

function buildDisplayProjectionTraceSummary({
  mergedMessages = [],
  rows = [],
  sdkMessages = [],
}: DisplayProjectionTraceInput): Record<string, unknown> {
  const sdkRowSummary = summarizeSdkUserRows(rows);
  const sdkAttachmentSummary = summarizeSdkRowAttachments(rows);
  const sdkMessageSummary = summarizeUserMessageImages(sdkMessages);
  const mergedMessageSummary = summarizeUserMessageImages(mergedMessages);
  return {
    rowCount: rows.length,
    sdkMessageCount: sdkMessages.length,
    mergedMessageCount: mergedMessages.length,
    ...sdkRowSummary,
    ...sdkAttachmentSummary,
    sdkProjectedUserImageCount: sdkMessageSummary.userImageCount,
    sdkProjectedUserMessageCount: sdkMessageSummary.userMessageCount,
    sdkProjectedUserMessagesWithImages: sdkMessageSummary.userMessagesWithImages,
    mergedUserImageCount: mergedMessageSummary.userImageCount,
    mergedUserMessageCount: mergedMessageSummary.userMessageCount,
    mergedUserMessagesWithImages: mergedMessageSummary.userMessagesWithImages,
  };
}

export const DesktopConversationDisplayProjection = Object.freeze({
  buildConversationViewChatMessages,
  buildDisplayProjectionTraceSummary,
  selectRendererMessageAnnotations,
});
