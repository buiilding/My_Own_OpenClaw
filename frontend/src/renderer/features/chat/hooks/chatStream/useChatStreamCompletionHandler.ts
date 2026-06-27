/**
 * Handles use chat stream completion events for the renderer UI.
 */

import { useCallback } from 'react';
import type { ConversationEvent } from '../../../../app/runtime/desktopConversationRuntimeContracts';
import {
  DesktopChatStreamEventRuntime,
  type ChatStreamWorkspaceReadModel,
} from '../../../../app/runtime/desktopChatStreamEventRuntime';

const {
  resolveTurnCompletedStreamEventState,
} = DesktopChatStreamEventRuntime;

type UseChatStreamCompletionHandlerOptions = {
  getWorkspaceState: (conversationRef?: string | null) => ChatStreamWorkspaceReadModel;
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
  getWorkspaceState,
  recordTrackingEvent,
  setIsSending,
  setThinkingStatus,
  setThinkingSourceEventType,
}: UseChatStreamCompletionHandlerOptions) => {
  return useCallback((event: ConversationEvent, conversationRef: string | null) => {
    const completionState = resolveTurnCompletedStreamEventState(
      event,
      conversationRef,
      {
        getWorkspaceState,
      },
    );
    if (!completionState) {
      return;
    }
    const {
      conversationRef: resolvedConversationRef,
      shouldRecordTerminalTracking,
      turnRef,
    } = completionState;
    setIsSending(false, resolvedConversationRef);
    setThinkingStatus(null, resolvedConversationRef);
    setThinkingSourceEventType(null, resolvedConversationRef);
    if (shouldRecordTerminalTracking) {
      recordTrackingEvent('streaming-complete', turnRef, {
        phase: 'complete',
      }, resolvedConversationRef);
    }
  }, [
    getWorkspaceState,
    recordTrackingEvent,
    setIsSending,
    setThinkingSourceEventType,
    setThinkingStatus,
  ]);
};
