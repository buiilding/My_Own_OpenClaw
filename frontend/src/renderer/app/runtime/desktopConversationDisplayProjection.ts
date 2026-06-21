/**
 * Coordinates SDK display-row projection for renderer chat consumers.
 */

import type { ChatMessage } from './desktopChatMessageTypes';
import {
  buildChatMessagesFromSdkDisplayRows,
} from '../../infrastructure/transcript/sdkDisplayChatMessageProjection';

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
    if (!current) {
      return message;
    }
    return {
      ...message,
      ...(current.systemPrompt ? { systemPrompt: current.systemPrompt } : {}),
      ...(current.toolSchemas ? { toolSchemas: current.toolSchemas } : {}),
      ...(current.fullUserMessage ? { fullUserMessage: current.fullUserMessage } : {}),
      ...(current.fullAssistantMessage ? { fullAssistantMessage: current.fullAssistantMessage } : {}),
      ...(current.feedback ? { feedback: current.feedback } : {}),
      ...(current.tokenCounts ? { tokenCounts: current.tokenCounts } : {}),
    };
  });
  return mergePendingOptimisticUserMessages(
    mergedSdkMessages,
    pendingOptimisticUserMessages(mergedSdkMessages, currentMessages),
  );
}

export const DesktopConversationDisplayProjection = Object.freeze({
  buildChatMessagesFromSdkDisplayRows,
  mergeRendererAnnotationsIntoSdkMessages,
});
