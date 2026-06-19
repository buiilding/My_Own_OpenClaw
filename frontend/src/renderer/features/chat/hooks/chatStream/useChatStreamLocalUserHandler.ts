/**
 * Handles use chat stream local user events for the renderer UI.
 */

import { useCallback } from 'react';
import type { ConversationEvent } from '../../../../app/runtime/desktopConversationRuntimeContracts';
import { GENERIC_THINKING_STATUS } from '../../../../app/runtime/desktopChatStreamThinkingRuntime';
import type { TrackEventFn } from './chatStreamHandlerTypes';
import { type TranscriptModelContext } from '../../../../app/runtime/desktopChatStreamModelContextRuntime';

type UseChatStreamLocalUserHandlerDeps = {
  modelContextRef: { current: TranscriptModelContext };
  recordTrackingEvent: TrackEventFn<'local-user-message'>;
  setIsSending: (value: boolean, conversationRef?: string | null) => void;
  setThinkingSourceEventType: (value: string | null, conversationRef?: string | null) => void;
  setThinkingStatus: (value: string | null, conversationRef?: string | null) => void;
};

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function useChatStreamLocalUserHandler({
  modelContextRef,
  recordTrackingEvent,
  setIsSending,
  setThinkingSourceEventType,
  setThinkingStatus,
}: UseChatStreamLocalUserHandlerDeps) {
  return useCallback((event: ConversationEvent, conversationRef?: string | null) => {
    if (event.type !== 'user_message') {
      return;
    }
    const text = readString(event.payload?.text) ?? readString(event.payload?.content);
    if (!text) {
      return;
    }
    setIsSending(true, conversationRef);
    const modelContext = modelContextRef.current;
    if (modelContext.supportsThinking && !modelContext.supportsThinkingTextStream) {
      setThinkingStatus(GENERIC_THINKING_STATUS, conversationRef);
      setThinkingSourceEventType('local-user-message', conversationRef);
    } else {
      setThinkingStatus(null, conversationRef);
      setThinkingSourceEventType(null, conversationRef);
    }

    recordTrackingEvent('local-user-message', event.turnRef, {
      phase: 'awaiting-first-chunk',
      resetForTurn: true,
    }, conversationRef);
  }, [
    modelContextRef,
    recordTrackingEvent,
    setIsSending,
    setThinkingSourceEventType,
    setThinkingStatus,
  ]);
}
