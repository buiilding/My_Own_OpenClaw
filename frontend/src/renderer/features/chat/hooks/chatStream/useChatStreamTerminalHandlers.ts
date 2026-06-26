/**
 * Handles use chat stream terminal handlers events for the renderer UI.
 */

import { useCallback } from 'react';
import {
  type ChatMessage,
} from '../../../../app/runtime/desktopChatMessageTypes';
import {
  setTokenCountsInChatStore,
} from '../../stores/chatStoreAdapters';
import { DesktopChatStreamEventPayloadRuntime } from '../../../../app/runtime/desktopChatStreamEventPayloadRuntime';
import type { TrackEventFn } from './chatStreamHandlerTypes';
import type { ConversationEvent } from '../../../../app/runtime/desktopConversationRuntimeContracts';
import { DesktopChatStreamEventRuntime } from '../../../../app/runtime/desktopChatStreamEventRuntime';

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

type UpdateStreamTargetMessage = (
  target: {
    kind: 'last_assistant_llm_text';
    turnRef?: string | null;
  },
  updates: Partial<ChatMessage>,
  conversationRef?: string | null,
) => void;

type UseChatStreamTerminalHandlersDeps = {
  recordTrackingEvent: TrackEventFn<'token-count' | 'error'>;
  updateStreamTargetMessage: UpdateStreamTargetMessage;
};

export function useChatStreamTerminalHandlers({
  recordTrackingEvent,
  updateStreamTargetMessage,
}: UseChatStreamTerminalHandlersDeps) {
  const handleTokenCount = useCallback((event: ConversationEvent, conversationRef?: string | null) => {
    const eventConversationRef = conversationRef ?? resolveConversationStreamEventConversationRef(event);
    const turnRef = resolveConversationStreamEventTurnRef(event);
    const tokenCounts = buildTokenCountsFromPayload(resolveConversationStreamEventPayload(event));
    setTokenCountsInChatStore(tokenCounts, eventConversationRef);
    updateStreamTargetMessage({
      kind: 'last_assistant_llm_text',
      turnRef: resolveConversationStreamEventTurnRefForUpdate(event),
    }, {
      tokenCounts,
    }, eventConversationRef);
    recordTrackingEvent('token-count', turnRef, undefined, eventConversationRef);
  }, [
    updateStreamTargetMessage,
    recordTrackingEvent,
  ]);

  const handleError = useCallback((event: ConversationEvent, conversationRef?: string | null) => {
    const errorPayload = resolveTerminalErrorPayload(resolveConversationStreamEventPayload(event));
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
