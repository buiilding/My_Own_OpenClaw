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
import {
  resolveConversationStreamEventConversationRef,
  resolveConversationStreamEventTurnRef,
  resolveConversationStreamEventTurnRefForUpdate,
} from '../../../../app/runtime/desktopChatStreamEventRuntime';

type UseChatStreamTerminalHandlersDeps = {
  recordTrackingEvent: TrackEventFn<'token-count' | 'error'>;
};

export function useChatStreamTerminalHandlers({
  recordTrackingEvent,
}: UseChatStreamTerminalHandlersDeps) {
  const setTokenCounts = useChatStore((state) => state.setTokenCounts);
  const updateMessage = useChatStore((state) => state.updateMessage);

  const handleTokenCount = useCallback((event: ConversationEvent, conversationRef?: string | null) => {
    const eventConversationRef = conversationRef ?? resolveConversationStreamEventConversationRef(event);
    const turnRef = resolveConversationStreamEventTurnRef(event);
    const tokenCounts = buildTokenCountsFromPayload(event.payload);
    const workspace = useChatStore.getState().getWorkspaceState(eventConversationRef);
    setTokenCounts(tokenCounts, eventConversationRef);
    const assistantMessageId = findLastAssistantLlmTextMessageId(
      workspace.messages,
      resolveConversationStreamEventTurnRefForUpdate(event),
    );
    if (assistantMessageId) {
      updateMessage(assistantMessageId, {
        tokenCounts,
      }, eventConversationRef);
    }
    recordTrackingEvent('token-count', turnRef, undefined, eventConversationRef);
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
    recordTrackingEvent(
      'error',
      resolveConversationStreamEventTurnRef(event),
      { errorText },
      conversationRef ?? resolveConversationStreamEventConversationRef(event),
    );
  }, [recordTrackingEvent]);

  return {
    handleError,
    handleTokenCount,
  };
}
