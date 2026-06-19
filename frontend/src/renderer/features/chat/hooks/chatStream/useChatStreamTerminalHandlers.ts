/**
 * Handles use chat stream terminal handlers events for the renderer UI.
 */

import { useCallback } from 'react';
import { useChatStore } from '../../stores/chatStore';
import {
  buildTokenCountsFromPayload,
  resolveErrorText,
  resolveTerminalErrorPayload,
  shouldIgnoreStreamError,
} from '../../../../app/runtime/desktopChatStreamEventPayloadRuntime';
import type { TrackEventFn } from './chatStreamHandlerTypes';
import { findLastAssistantLlmTextMessageId } from '../../../../app/runtime/desktopChatStreamMessageUpdateRuntime';
import type { ConversationEvent } from '../../../../app/runtime/desktopConversationRuntimeContracts';

type UseChatStreamTerminalHandlersDeps = {
  recordTrackingEvent: TrackEventFn<'token-count' | 'error'>;
};

export function useChatStreamTerminalHandlers({
  recordTrackingEvent,
}: UseChatStreamTerminalHandlersDeps) {
  const setTokenCounts = useChatStore((state) => state.setTokenCounts);
  const updateMessage = useChatStore((state) => state.updateMessage);

  const handleTokenCount = useCallback((event: ConversationEvent, conversationRef?: string | null) => {
    const tokenCounts = buildTokenCountsFromPayload(event.payload);
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
    const errorPayload = resolveTerminalErrorPayload(event.payload);
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
