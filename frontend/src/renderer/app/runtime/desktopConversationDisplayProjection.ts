/**
 * Coordinates SDK display-row projection for renderer chat consumers.
 */

import type { ChatMessage } from './desktopChatMessageTypes';
import {
  buildChatMessagesFromSdkDisplayRows,
} from '../../infrastructure/transcript/sdkDisplayChatMessageProjection';

type DisplayProjectionTraceInput = {
  currentMessages?: ChatMessage[];
  mergedMessages?: ChatMessage[];
  rows?: unknown[];
  sdkMessages?: ChatMessage[];
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

function isOptimisticUserMessage(message: ChatMessage): boolean {
  return message.sender === 'user'
    && normalizeTurnRef(message.turnRef) !== null
    && message.sourceEventType === 'renderer-compose'
    && message.sourceChannel === 'renderer-local';
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

function pendingOptimisticUserMessages(
  sdkMessages: ChatMessage[],
  currentMessages: ChatMessage[],
): ChatMessage[] {
  const sdkMessageIds = new Set(sdkMessages.map((message) => message.id));
  const projectedUserTurns = sdkUserTurnRefs(sdkMessages);
  return currentMessages.filter((message) => {
    const turnRef = normalizeTurnRef(message.turnRef);
    return isOptimisticUserMessage(message)
      && turnRef !== null
      && !sdkMessageIds.has(message.id)
      && !projectedUserTurns.has(turnRef);
  });
}

function mergePendingOptimisticUserMessages(
  sdkMessages: ChatMessage[],
  optimisticMessages: ChatMessage[],
): ChatMessage[] {
  if (optimisticMessages.length === 0) {
    return sdkMessages;
  }
  const merged = [...sdkMessages];
  for (const optimisticMessage of optimisticMessages) {
    const turnRef = normalizeTurnRef(optimisticMessage.turnRef);
    const sameTurnIndex = turnRef
      ? merged.findIndex((message) => normalizeTurnRef(message.turnRef) === turnRef)
      : -1;
    if (sameTurnIndex >= 0) {
      merged.splice(sameTurnIndex, 0, optimisticMessage);
    } else {
      merged.push(optimisticMessage);
    }
  }
  return merged;
}

function mergeRendererAnnotationsIntoSdkMessages(
  sdkMessages: ChatMessage[],
  currentMessages: ChatMessage[],
): ChatMessage[] {
  if (currentMessages.length === 0) {
    return sdkMessages;
  }
  const currentById = new Map(currentMessages.map((message) => [message.id, message]));
  const mergedSdkMessages = sdkMessages.map((message) => {
    const current = currentById.get(message.id);
    return {
      ...message,
      ...(current?.systemPrompt ? { systemPrompt: current.systemPrompt } : {}),
      ...(current?.toolSchemas ? { toolSchemas: current.toolSchemas } : {}),
      ...(current?.fullUserMessage ? { fullUserMessage: current.fullUserMessage } : {}),
      ...(current?.fullAssistantMessage ? { fullAssistantMessage: current.fullAssistantMessage } : {}),
      ...(current?.feedback ? { feedback: current.feedback } : {}),
      ...(current?.tokenCounts ? { tokenCounts: current.tokenCounts } : {}),
    };
  });
  return mergePendingOptimisticUserMessages(
    mergedSdkMessages,
    pendingOptimisticUserMessages(mergedSdkMessages, currentMessages),
  );
}

function countMessageImages(message: ChatMessage): number {
  if (Array.isArray(message.attachments) && message.attachments.length > 0) {
    return message.attachments.filter((attachment) => (
      attachment.kind === 'image'
      && (
        attachment.status === 'materializing'
        || attachment.status === 'ready'
      )
    )).length;
  }
  return 0;
}

function countSdkRowImages(row: unknown): number {
  const record = recordFromUnknown(row);
  const metadata = recordFromUnknown(record?.metadata);
  if (!metadata) {
    return 0;
  }
  const attachments = Array.isArray(metadata.attachments) ? metadata.attachments : [];
  if (attachments.length > 0) {
    return attachments.filter((attachment) => {
      const attachmentRecord = recordFromUnknown(attachment);
      return attachmentRecord?.kind === 'image'
        && (
          attachmentRecord.status === 'materializing'
          || attachmentRecord.status === 'ready'
        );
    }).length;
  }
  return 0;
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
    const attachments = Array.isArray(metadata?.attachments) ? metadata.attachments : [];
    for (const attachment of attachments) {
      const attachmentRecord = recordFromUnknown(attachment);
      if (!attachmentRecord) {
        continue;
      }
      userAttachmentCount += 1;
      if (typeof attachmentRecord.source === 'string') {
        sources.add(attachmentRecord.source);
      }
      if (typeof attachmentRecord.status === 'string') {
        statuses.add(attachmentRecord.status);
      }
      if (attachmentRecord.status === 'ready' && attachmentRecord.kind === 'image') {
        readyArtifactCount += 1;
      } else if (attachmentRecord.status === 'materializing') {
        materializingPreviewCount += 1;
      } else if (
        attachmentRecord.status === 'pending_capture'
        && attachmentRecord.kind === 'screenshot_request'
      ) {
        pendingScreenshotRequestCount += 1;
      } else if (attachmentRecord.status === 'failed') {
        failedAttachmentCount += 1;
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
  currentMessages = [],
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
    currentMessageCount: currentMessages.length,
    mergedMessageCount: mergedMessages.length,
    currentOptimisticUserCount: currentMessages.filter(isOptimisticUserMessage).length,
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
  buildDisplayProjectionTraceSummary,
  buildChatMessagesFromSdkDisplayRows,
  mergeRendererAnnotationsIntoSdkMessages,
});
