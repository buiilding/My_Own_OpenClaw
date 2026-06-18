/**
 * Handles use chat stream completion events for the renderer UI.
 */

import { useCallback } from 'react';
import { useChatStore } from '../../stores/chatStore';
import type { ConversationEvent } from '../../../../app/runtime/desktopConversationRuntimeContracts';

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
    if (event.type !== 'turn_completed') {
      return;
    }
    const resolvedConversationRef = conversationRef ?? event.conversationRef;
    const workspace = useChatStore.getState().getWorkspaceState(resolvedConversationRef);
    const shouldRecordTerminalTracking = (
      workspace.streamTracking?.phase !== 'complete'
      || workspace.isSending === true
      || workspace.thinkingStatus !== null
      || workspace.thinkingSourceEventType !== null
    );
    setIsSending(false, resolvedConversationRef);
    setThinkingStatus(null, resolvedConversationRef);
    setThinkingSourceEventType(null, resolvedConversationRef);
    if (shouldRecordTerminalTracking) {
      recordTrackingEvent('streaming-complete', event.turnRef, {
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
