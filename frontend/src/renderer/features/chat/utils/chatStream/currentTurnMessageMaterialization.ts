import type { ChatMessage, SdkCurrentTurnProjection } from '../../stores/chatStore';
import type { TranscriptModelContext } from './chatStreamTypes';
import { normalizeIncomingText } from '../../../../infrastructure/text/incomingTextNormalization';
import {
  buildCurrentTurnMessagesFromProjection,
} from '../state/chatBoxResponseState';

type BuildMaterializedCurrentTurnMessageOptions = {
  conversationRef?: string | null;
  turnRef?: string | null;
  currentTurnProjection?: SdkCurrentTurnProjection | null;
  fallbackText?: unknown;
  previousMessage?: ChatMessage | null;
  modelContext: TranscriptModelContext;
  type?: 'llm-text' | 'error';
};

type UpsertMaterializedCurrentTurnMessageOptions = {
  messages: ChatMessage[];
  message: ChatMessage;
  replaceMessageId?: string | null;
};

type UpsertMaterializedCurrentTurnProjectionMessagesOptions = {
  messages: ChatMessage[];
  currentTurnProjection?: SdkCurrentTurnProjection | null;
  assistantMessage?: ChatMessage | null;
  replaceMessageId?: string | null;
  turnRef?: string | null;
};

function normalizeRef(value: unknown): string {
  return normalizeIncomingText(value).trim();
}

function resolveConversationRef(
  conversationRef: string | null | undefined,
  currentTurnProjection: SdkCurrentTurnProjection | null | undefined,
): string {
  return normalizeRef(currentTurnProjection?.conversationRef)
    || normalizeRef(conversationRef)
    || 'conversation';
}

function resolveTurnRef(
  turnRef: string | null | undefined,
  currentTurnProjection: SdkCurrentTurnProjection | null | undefined,
): string {
  return normalizeRef(currentTurnProjection?.turnRef)
    || normalizeRef(turnRef)
    || 'turn';
}

function resolveMessageText({
  currentTurnProjection,
  fallbackText,
  previousMessage,
  type,
}: Pick<
  BuildMaterializedCurrentTurnMessageOptions,
  'currentTurnProjection' | 'fallbackText' | 'previousMessage' | 'type'
>): string {
  if (type === 'error') {
    return normalizeIncomingText(currentTurnProjection?.lastError)
      || normalizeIncomingText(fallbackText);
  }
  return normalizeIncomingText(currentTurnProjection?.assistantText)
    || normalizeIncomingText(fallbackText)
    || normalizeIncomingText(previousMessage?.text)
    || normalizeIncomingText(previousMessage?.fullAssistantMessage?.content);
}

export function buildMaterializedCurrentTurnMessage({
  conversationRef,
  turnRef,
  currentTurnProjection,
  fallbackText,
  previousMessage,
  modelContext,
  type = 'llm-text',
}: BuildMaterializedCurrentTurnMessageOptions): ChatMessage | null {
  const text = resolveMessageText({
    currentTurnProjection,
    fallbackText,
    previousMessage,
    type,
  });
  if (!text) {
    return null;
  }

  const resolvedConversationRef = resolveConversationRef(conversationRef, currentTurnProjection);
  const resolvedTurnRef = resolveTurnRef(turnRef, currentTurnProjection);
  const thinkingText = normalizeIncomingText(currentTurnProjection?.reasoningText)
    || previousMessage?.thinkingText
    || null;

  return {
    ...previousMessage,
    id: `${resolvedConversationRef}:${resolvedTurnRef}:${type === 'error' ? 'error' : 'assistant'}`,
    text,
    sender: 'assistant',
    type,
    sourceEventType: type === 'error' ? 'runtime_error' : 'assistant_delta',
    sourceChannel: 'windie:current-turn',
    turnRef: resolvedTurnRef,
    isComplete: true,
    modelId: previousMessage?.modelId ?? modelContext.modelId ?? null,
    modelProvider: previousMessage?.modelProvider ?? modelContext.modelProvider ?? null,
    thinkingText,
    thinkingSourceEventType: thinkingText ? 'reasoning_delta' : previousMessage?.thinkingSourceEventType ?? null,
  };
}

export function upsertMaterializedCurrentTurnMessage({
  messages,
  message,
  replaceMessageId,
}: UpsertMaterializedCurrentTurnMessageOptions): ChatMessage[] {
  const existingCanonicalIndex = messages.findIndex((candidate) => candidate.id === message.id);
  if (existingCanonicalIndex !== -1) {
    return messages.map((candidate, index) => (
      index === existingCanonicalIndex ? { ...candidate, ...message } : candidate
    ));
  }

  if (replaceMessageId) {
    const replaceIndex = messages.findIndex((candidate) => candidate.id === replaceMessageId);
    if (replaceIndex !== -1) {
      return messages.map((candidate, index) => (
        index === replaceIndex ? message : candidate
      ));
    }
  }

  return [...messages, message];
}

function isRenderableProjectedMessage(message: ChatMessage | null | undefined): message is ChatMessage {
  return Boolean(
    message
    && message.sender !== 'user'
    && message.sourceChannel === 'windie:current-turn'
    && message.sourceEventType !== 'sdk-current-turn',
  );
}

function resolveInsertionIndex(messages: ChatMessage[], turnRef?: string | null): number {
  const normalizedTurnRef = normalizeRef(turnRef);
  if (normalizedTurnRef) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.sender === 'user' && normalizeRef(message.turnRef) === normalizedTurnRef) {
        return index + 1;
      }
    }
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.sender === 'user') {
      return index + 1;
    }
  }
  return messages.length;
}

function mergeAssistantMessage(
  projectedMessages: ChatMessage[],
  assistantMessage?: ChatMessage | null,
): ChatMessage[] {
  if (!assistantMessage) {
    return projectedMessages;
  }
  let replaced = false;
  const nextMessages = projectedMessages.map((message) => {
    if (!replaced && (message.type === 'llm-text' || message.type === 'error')) {
      replaced = true;
      return assistantMessage;
    }
    return message;
  });
  if (!replaced) {
    nextMessages.push(assistantMessage);
  }
  return nextMessages;
}

export function upsertMaterializedCurrentTurnProjectionMessages({
  messages,
  currentTurnProjection,
  assistantMessage,
  replaceMessageId,
  turnRef,
}: UpsertMaterializedCurrentTurnProjectionMessagesOptions): ChatMessage[] {
  const projectedMessages = mergeAssistantMessage(
    (buildCurrentTurnMessagesFromProjection(currentTurnProjection) as ChatMessage[])
      .filter(isRenderableProjectedMessage),
    assistantMessage,
  );
  if (projectedMessages.length === 0) {
    return messages;
  }

  const projectedIds = new Set(projectedMessages.map((message) => message.id).filter(Boolean));
  const baseMessages = messages.filter((message) => {
    if (message.id && projectedIds.has(message.id)) {
      return false;
    }
    return !(replaceMessageId && message.id === replaceMessageId);
  });
  const insertionIndex = resolveInsertionIndex(
    baseMessages,
    turnRef ?? currentTurnProjection?.turnRef ?? assistantMessage?.turnRef ?? null,
  );

  return [
    ...baseMessages.slice(0, insertionIndex),
    ...projectedMessages,
    ...baseMessages.slice(insertionIndex),
  ];
}
