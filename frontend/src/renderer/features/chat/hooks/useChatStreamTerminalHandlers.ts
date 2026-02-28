import { useCallback } from 'react';
import { recordAssistantMessage } from '../../../infrastructure/transcript/TranscriptWriter';
import {
  useChatStore,
  type ChatMessage,
} from '../stores/chatStore';
import type {
  ErrorEvent,
  MemoryStoreEvent,
  TokenCountEvent,
} from '../../../types/backendEvents';
import { resolveErrorText } from '../utils/chatStreamEventUtils';
import { type TranscriptModelContext } from '../utils/chatStreamTypes';

type TrackEventFn = (
  eventType: 'token-count' | 'memory-store' | 'error',
  turnRef: string | null | undefined,
  options?: Record<string, unknown>,
) => void;

type UseChatStreamTerminalHandlersDeps = {
  addMessage: (message: ChatMessage) => void;
  enableTranscript: boolean;
  modelContextRef: { current: TranscriptModelContext };
  recordTrackingEvent: TrackEventFn;
  setIsSending: (value: boolean) => void;
  setThinkingSourceEventType: (value: string | null) => void;
  setThinkingStatus: (value: string | null) => void;
};

export function useChatStreamTerminalHandlers({
  addMessage,
  enableTranscript,
  modelContextRef,
  recordTrackingEvent,
  setIsSending,
  setThinkingSourceEventType,
  setThinkingStatus,
}: UseChatStreamTerminalHandlersDeps) {
  const setTokenCounts = useChatStore((state) => state.setTokenCounts);

  const handleTokenCount = useCallback((event: TokenCountEvent) => {
    setTokenCounts(event.payload ?? null);
    recordTrackingEvent('token-count', event.turn_ref);
  }, [setTokenCounts, recordTrackingEvent]);

  const handleMemoryStore = useCallback((event: MemoryStoreEvent) => {
    recordTrackingEvent('memory-store', event.turn_ref);
  }, [recordTrackingEvent]);

  const handleError = useCallback((event: ErrorEvent) => {
    setIsSending(false);
    setThinkingStatus('');
    setThinkingSourceEventType(null);
    const errorText = resolveErrorText(event.payload);
    const modelContext = modelContextRef.current;
    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      text: errorText,
      sender: 'assistant',
      type: 'error',
      sourceEventType: 'error',
      sourceChannel: 'from-backend',
      turnRef: event.turn_ref,
      modelId: modelContext.modelId,
      modelProvider: modelContext.modelProvider,
    };
    addMessage(newMessage);

    recordTrackingEvent('error', event.turn_ref, {
      phase: 'error',
      errorText,
    });

    if (enableTranscript) {
      recordAssistantMessage(errorText, {
        messageType: 'error',
        conversationRef: event.conversation_ref,
        userId: event.user_id,
        modelId: modelContext.modelId,
        modelProvider: modelContext.modelProvider,
      });
    }
  }, [
    addMessage,
    enableTranscript,
    modelContextRef,
    setIsSending,
    setThinkingSourceEventType,
    setThinkingStatus,
    recordTrackingEvent,
  ]);

  return {
    handleError,
    handleMemoryStore,
    handleTokenCount,
  };
}
