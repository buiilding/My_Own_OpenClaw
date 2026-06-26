/**
 * Handles use chat stream local user events for the renderer UI.
 */

import { useCallback } from 'react';
import type { ConversationEvent } from '../../../../app/runtime/desktopConversationRuntimeContracts';
import { DesktopChatStreamEventRuntime } from '../../../../app/runtime/desktopChatStreamEventRuntime';
import { DesktopChatStreamThinkingRuntime } from '../../../../app/runtime/desktopChatStreamThinkingRuntime';
import { DesktopChatStreamEventPayloadRuntime } from '../../../../app/runtime/desktopChatStreamEventPayloadRuntime';
import type { TrackEventFn } from './chatStreamHandlerTypes';
import { type TranscriptModelContext } from '../../../../app/runtime/desktopChatStreamModelContextRuntime';

const { getGenericThinkingStatus } = DesktopChatStreamThinkingRuntime;
const {
  isLocalUserMessageConversationStreamEvent,
  resolveConversationStreamEventIdentity,
} = DesktopChatStreamEventRuntime;
const {
  resolveConversationStreamEventPayload,
  resolveLocalUserMessageText,
} = DesktopChatStreamEventPayloadRuntime;

type UseChatStreamLocalUserHandlerDeps = {
  modelContextRef: { current: TranscriptModelContext };
  recordTrackingEvent: TrackEventFn<'local-user-message'>;
  setIsSending: (value: boolean, conversationRef?: string | null) => void;
  setThinkingSourceEventType: (value: string | null, conversationRef?: string | null) => void;
  setThinkingStatus: (value: string | null, conversationRef?: string | null) => void;
};

export function useChatStreamLocalUserHandler({
  modelContextRef,
  recordTrackingEvent,
  setIsSending,
  setThinkingSourceEventType,
  setThinkingStatus,
}: UseChatStreamLocalUserHandlerDeps) {
  return useCallback((event: ConversationEvent, conversationRef?: string | null) => {
    if (!isLocalUserMessageConversationStreamEvent(event)) {
      return;
    }
    const text = resolveLocalUserMessageText(resolveConversationStreamEventPayload(event));
    if (!text) {
      return;
    }
    setIsSending(true, conversationRef);
    const modelContext = modelContextRef.current;
    if (modelContext.supportsThinking && !modelContext.supportsThinkingTextStream) {
      setThinkingStatus(getGenericThinkingStatus(), conversationRef);
      setThinkingSourceEventType('local-user-message', conversationRef);
    } else {
      setThinkingStatus(null, conversationRef);
      setThinkingSourceEventType(null, conversationRef);
    }

    const eventIdentity = resolveConversationStreamEventIdentity(event, conversationRef);
    recordTrackingEvent('local-user-message', eventIdentity.turnRef, {
      phase: 'awaiting-first-chunk',
      resetForTurn: true,
    }, eventIdentity.conversationRef);
  }, [
    modelContextRef,
    recordTrackingEvent,
    setIsSending,
    setThinkingSourceEventType,
    setThinkingStatus,
  ]);
}
