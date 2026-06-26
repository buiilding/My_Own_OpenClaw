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
import {
  DesktopChatStreamMessageUpdateRuntime,
} from '../../../../app/runtime/desktopChatStreamMessageUpdateRuntime';

const {
  buildTokenCountsFromPayload,
  resolveConversationStreamEventPayload,
  resolveErrorText,
  resolveTerminalErrorPayload,
  shouldIgnoreStreamError,
} = DesktopChatStreamEventPayloadRuntime;
const {
  resolveConversationStreamEventIdentity,
} = DesktopChatStreamEventRuntime;
const {
  buildLastAssistantLlmTextStreamTarget,
} = DesktopChatStreamMessageUpdateRuntime;

type UpdateStreamTargetMessage = (
  target: ReturnType<typeof buildLastAssistantLlmTextStreamTarget>,
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
    const eventIdentity = resolveConversationStreamEventIdentity(event, conversationRef);
    const tokenCounts = buildTokenCountsFromPayload(resolveConversationStreamEventPayload(event));
    setTokenCountsInChatStore(tokenCounts, eventIdentity.conversationRef);
    updateStreamTargetMessage(buildLastAssistantLlmTextStreamTarget(eventIdentity), {
      tokenCounts,
    }, eventIdentity.conversationRef);
    recordTrackingEvent('token-count', eventIdentity.turnRef, undefined, eventIdentity.conversationRef);
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
    const eventIdentity = resolveConversationStreamEventIdentity(event, conversationRef);
    recordTrackingEvent(
      'error',
      eventIdentity.turnRef,
      { errorText },
      eventIdentity.conversationRef,
    );
  }, [recordTrackingEvent]);

  return {
    handleError,
    handleTokenCount,
  };
}
