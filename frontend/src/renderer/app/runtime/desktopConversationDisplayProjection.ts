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

function stringArrayFromUnknown(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
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
  const usersWithImagesByTurn = new Map<string, ChatMessage>();
  const optimisticUsersByTurn = new Map<string, ChatMessage>();
  for (const message of currentMessages) {
    const turnRef = normalizeTurnRef(message.turnRef);
    if (message.sender === 'user' && turnRef && countMessageImages(message) > 0) {
      usersWithImagesByTurn.set(turnRef, message);
      if (isOptimisticUserMessage(message)) {
        optimisticUsersByTurn.set(turnRef, message);
      }
    }
  }
  const mergedSdkMessages = sdkMessages.map((message) => {
    const current = currentById.get(message.id);
    const turnRef = normalizeTurnRef(message.turnRef);
    const currentImageUser = (
      current?.sender === 'user'
      && countMessageImages(current) > 0
    )
      ? current
      : (turnRef ? usersWithImagesByTurn.get(turnRef) : undefined);
    const fallbackImageUser = currentImageUser
      ?? (turnRef ? optimisticUsersByTurn.get(turnRef) : undefined);
    const rendererScreenshots = (
      message.sender === 'user'
      && countMessageImages(message) === 0
      && fallbackImageUser
      && countMessageImages(fallbackImageUser) > 0
    )
      ? {
        ...(fallbackImageUser.screenshot ? { screenshot: fallbackImageUser.screenshot } : {}),
        ...(fallbackImageUser.screenshotRef ? { screenshotRef: fallbackImageUser.screenshotRef } : {}),
        ...(fallbackImageUser.screenshotUrl ? { screenshotUrl: fallbackImageUser.screenshotUrl } : {}),
        ...(fallbackImageUser.screenshotContentType
          ? { screenshotContentType: fallbackImageUser.screenshotContentType }
          : {}),
        ...(fallbackImageUser.screenshots ? { screenshots: fallbackImageUser.screenshots } : {}),
        ...(fallbackImageUser.attachmentFilenames && !message.attachmentFilenames
          ? { attachmentFilenames: fallbackImageUser.attachmentFilenames }
          : {}),
      }
      : {};
    return {
      ...message,
      ...rendererScreenshots,
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
  if (Array.isArray(message.screenshots) && message.screenshots.length > 0) {
    return message.screenshots.filter((attachment) => (
      Boolean(attachment?.screenshot)
      || Boolean(attachment?.screenshotRef)
      || Boolean(attachment?.screenshotUrl)
    )).length;
  }
  return (
    message.screenshot
    || message.screenshotRef
    || message.screenshotUrl
  ) ? 1 : 0;
}

function countSdkRowImages(row: unknown): number {
  const record = recordFromUnknown(row);
  const metadata = recordFromUnknown(record?.metadata);
  if (!metadata) {
    return 0;
  }
  const screenshotRefs = stringArrayFromUnknown(metadata.screenshotRefs);
  if (screenshotRefs.length > 0) {
    return screenshotRefs.length;
  }
  return (
    metadata.screenshot
    || metadata.screenshotRef
    || metadata.screenshotUrl
  ) ? 1 : 0;
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
  const sdkMessageSummary = summarizeUserMessageImages(sdkMessages);
  const mergedMessageSummary = summarizeUserMessageImages(mergedMessages);
  return {
    rowCount: rows.length,
    sdkMessageCount: sdkMessages.length,
    currentMessageCount: currentMessages.length,
    mergedMessageCount: mergedMessages.length,
    currentOptimisticUserCount: currentMessages.filter(isOptimisticUserMessage).length,
    ...sdkRowSummary,
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
