/**
 * Handles use chat stream terminal handlers events for the renderer UI.
 */

import { useCallback } from 'react';
import {
  useChatStore,
  type TokenCounts,
} from '../../stores/chatStore';
import {
  resolveErrorText,
  shouldIgnoreStreamError,
} from '../../../../app/runtime/desktopChatStreamEventPayloadRuntime';
import type { TrackEventFn } from './chatStreamHandlerTypes';
import { findLastAssistantLlmTextMessageId } from '../../utils/chatStream/chatStreamMessageUpdates';
import type { ConversationEvent } from '../../../../app/runtime/desktopConversationRuntimeContracts';

type UseChatStreamTerminalHandlersDeps = {
  recordTrackingEvent: TrackEventFn<'token-count' | 'error'>;
};

type TerminalErrorPayload = {
  message?: unknown;
  content?: unknown;
};

const USAGE_SOURCE_VALUES = new Set(['provider', 'estimated']);
const CACHE_STATUS_VALUES = new Set(['hit', 'miss', 'unknown']);

function finiteNumberField(payload: Record<string, unknown>, key: string): number | undefined {
  const value = payload[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function nullableNumberField(payload: Record<string, unknown>, key: string): number | null | undefined {
  if (payload[key] === null) {
    return null;
  }
  return finiteNumberField(payload, key);
}

function booleanField(payload: Record<string, unknown>, key: string): boolean | null | undefined {
  if (payload[key] === null) {
    return null;
  }
  return typeof payload[key] === 'boolean' ? payload[key] as boolean : undefined;
}

function usagePayloadFromEvent(event: ConversationEvent): TokenCounts {
  const payload = event.payload ?? {};
  const tokenCounts: TokenCounts = {};
  const promptTokens = finiteNumberField(payload, 'prompt_tokens');
  const visibleOutputTokens = finiteNumberField(payload, 'visible_output_tokens');
  const thinkingTokens = nullableNumberField(payload, 'thinking_tokens');
  const outputTokensTotal = finiteNumberField(payload, 'output_tokens_total');
  const totalTokens = finiteNumberField(payload, 'total_tokens');
  const conversationTokens = finiteNumberField(payload, 'conversation_tokens');
  const cachedTokens = nullableNumberField(payload, 'cached_tokens');
  const cacheHit = booleanField(payload, 'cache_hit');
  const usageSource = typeof payload.usage_source === 'string' && USAGE_SOURCE_VALUES.has(payload.usage_source)
    ? payload.usage_source as TokenCounts['usage_source']
    : undefined;
  const cacheStatus = typeof payload.cache_status === 'string' && CACHE_STATUS_VALUES.has(payload.cache_status)
    ? payload.cache_status as TokenCounts['cache_status']
    : undefined;

  if (promptTokens !== undefined) {
    tokenCounts.prompt_tokens = promptTokens;
  }
  if (visibleOutputTokens !== undefined) {
    tokenCounts.visible_output_tokens = visibleOutputTokens;
  }
  if (thinkingTokens !== undefined) {
    tokenCounts.thinking_tokens = thinkingTokens;
  }
  if (outputTokensTotal !== undefined) {
    tokenCounts.output_tokens_total = outputTokensTotal;
  }
  if (totalTokens !== undefined) {
    tokenCounts.total_tokens = totalTokens;
  }
  if (conversationTokens !== undefined) {
    tokenCounts.conversation_tokens = conversationTokens;
  }
  if (usageSource !== undefined) {
    tokenCounts.usage_source = usageSource;
  }
  if (cachedTokens !== undefined) {
    tokenCounts.cached_tokens = cachedTokens;
  }
  if (cacheHit !== undefined) {
    tokenCounts.cache_hit = cacheHit;
  }
  if (cacheStatus !== undefined) {
    tokenCounts.cache_status = cacheStatus;
  }

  return tokenCounts;
}

function terminalErrorPayloadFromEvent(event: ConversationEvent): TerminalErrorPayload {
  const payload = event.payload ?? {};
  return {
    message: payload.message,
    content: payload.content,
  };
}

export function useChatStreamTerminalHandlers({
  recordTrackingEvent,
}: UseChatStreamTerminalHandlersDeps) {
  const setTokenCounts = useChatStore((state) => state.setTokenCounts);
  const updateMessage = useChatStore((state) => state.updateMessage);

  const handleTokenCount = useCallback((event: ConversationEvent, conversationRef?: string | null) => {
    const tokenCounts = usagePayloadFromEvent(event);
    const workspace = useChatStore.getState().getWorkspaceState(conversationRef);
    setTokenCounts(tokenCounts, conversationRef);
    const assistantMessageId = findLastAssistantLlmTextMessageId(
      workspace.messages,
      event.turnRef || undefined,
    );
    if (assistantMessageId) {
      updateMessage(assistantMessageId, {
        tokenCounts,
      }, conversationRef);
    }
    recordTrackingEvent('token-count', event.turnRef, undefined, conversationRef);
  }, [
    setTokenCounts,
    updateMessage,
    recordTrackingEvent,
  ]);

  const handleError = useCallback((event: ConversationEvent, conversationRef?: string | null) => {
    const errorPayload = terminalErrorPayloadFromEvent(event);
    if (shouldIgnoreStreamError(errorPayload)) {
      return;
    }
    const errorText = resolveErrorText(errorPayload);
    recordTrackingEvent('error', event.turnRef, { errorText }, conversationRef ?? event.conversationRef);
  }, [recordTrackingEvent]);

  return {
    handleError,
    handleTokenCount,
  };
}
