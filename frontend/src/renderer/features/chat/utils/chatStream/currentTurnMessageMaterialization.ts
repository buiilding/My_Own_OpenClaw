import type { ChatMessage, SdkCurrentTurnProjection } from '../../stores/chatStore';
import type { TranscriptModelContext } from './chatStreamTypes';
import { normalizeIncomingText } from '../../../../infrastructure/text/incomingTextNormalization';

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
    sourceChannel: 'conversation-runtime-updated',
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
