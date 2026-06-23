/**
 * Handles use chat stream terminal handlers events for the renderer UI.
 */

import { useCallback } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { DesktopChatStreamEventPayloadRuntime } from '../../../../app/runtime/desktopChatStreamEventPayloadRuntime';
import type { TrackEventFn } from './chatStreamHandlerTypes';
import { DesktopChatStreamMessageUpdateRuntime } from '../../../../app/runtime/desktopChatStreamMessageUpdateRuntime';
import type { ConversationEvent } from '../../../../app/runtime/desktopConversationRuntimeContracts';
import { DesktopChatStreamEventRuntime } from '../../../../app/runtime/desktopChatStreamEventRuntime';

const {
  findLastAssistantLlmTextMessageId,
} = DesktopChatStreamMessageUpdateRuntime;
const {
  buildTokenCountsFromPayload,
  resolveConversationStreamEventPayload,
  resolveErrorText,
  resolveTerminalErrorPayload,
  shouldIgnoreStreamError,
} = DesktopChatStreamEventPayloadRuntime;
const {
  resolveConversationStreamEventConversationRef,
  resolveConversationStreamEventTurnRef,
  resolveConversationStreamEventTurnRefForUpdate,
} = DesktopChatStreamEventRuntime;

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
    const tokenCounts = buildTokenCountsFromPayload(resolveConversationStreamEventPayload(event));
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
    const errorPayload = resolveTerminalErrorPayload(resolveConversationStreamEventPayload(event));
    if (shouldIgnoreStreamError(errorPayload)) {
      return;
    }
    const errorText = resolveErrorText(errorPayload);
    const eventConversationRef = conversationRef ?? resolveConversationStreamEventConversationRef(event);
    const eventTurnRef = resolveConversationStreamEventTurnRef(event);
    useChatStore.getState().clearPendingTurn({
      conversationRef: eventConversationRef,
      turnRef: eventTurnRef,
    });
    useChatStore.getState().setThinkingStatus('', eventConversationRef);
    useChatStore.getState().setThinkingSourceEventType(null, eventConversationRef);
    recordTrackingEvent(
      'error',
      eventTurnRef,
      { errorText },
      eventConversationRef,
    );
  }, [recordTrackingEvent]);

  return {
    handleError,
    handleTokenCount,
  };
}
