/**
 * Handles use chat stream completion events for the renderer UI.
 */

import { useCallback } from 'react';
import { useChatStore } from '../../stores/chatStore';
import type { ConversationEvent } from '../../../../app/runtime/desktopConversationRuntimeContracts';
import { DesktopChatStreamEventRuntime } from '../../../../app/runtime/desktopChatStreamEventRuntime';

const {
  isTurnCompletedConversationStreamEvent,
  resolveConversationStreamEventConversationRef,
  resolveConversationStreamEventTurnRef,
  shouldRecordTerminalCompletionTracking,
} = DesktopChatStreamEventRuntime;

type UseChatStreamCompletionHandlerOptions = {
  recordTrackingEvent: (
    eventType: string,
    turnRef: string | null | undefined,
    options?: { phase?: 'complete' },
    conversationRef?: string | null,
  ) => void;
  setIsSending: (isSending: boolean, conversationRef?: string | null) => void;
  setThinkingStatus: (status: string | null, conversationRef?: string | null) => void;
  setThinkingSourceEventType: (
    sourceEventType: string | null,
    conversationRef?: string | null,
  ) => void;
};

export const useChatStreamCompletionHandler = ({
  recordTrackingEvent,
  setIsSending,
  setThinkingStatus,
  setThinkingSourceEventType,
}: UseChatStreamCompletionHandlerOptions) => {
  return useCallback((event: ConversationEvent, conversationRef: string | null) => {
    if (!isTurnCompletedConversationStreamEvent(event)) {
      return;
    }
    const resolvedConversationRef = conversationRef ?? resolveConversationStreamEventConversationRef(event);
    const workspace = useChatStore.getState().getWorkspaceState(resolvedConversationRef);
    const eventTurnRef = resolveConversationStreamEventTurnRef(event);
    const shouldRecordTerminalTracking = shouldRecordTerminalCompletionTracking(
      workspace,
      eventTurnRef,
    );
    setIsSending(false, resolvedConversationRef);
    setThinkingStatus(null, resolvedConversationRef);
    setThinkingSourceEventType(null, resolvedConversationRef);
    if (shouldRecordTerminalTracking) {
      recordTrackingEvent('streaming-complete', eventTurnRef, {
        phase: 'complete',
      }, resolvedConversationRef);
    }
  }, [
    recordTrackingEvent,
    setIsSending,
    setThinkingSourceEventType,
    setThinkingStatus,
  ]);
};
