import { useCallback } from 'react';
import { recordAssistantMessage } from '../../../../infrastructure/transcript/TranscriptWriter';
import {
  useChatStore,
  type ChatMessage,
} from '../../stores/chatStore';
import type {
  ErrorEvent,
  MemoryStoreEvent,
  TokenCountEvent,
} from '../../../../types/backendEvents';
import { resolveErrorText } from '../../utils/chatStream/chatStreamEventUtils';
import type { ChatStreamThinkingStateDeps } from './chatStreamHandlerTypes';

type UseChatStreamTerminalHandlersDeps = ChatStreamThinkingStateDeps<
  'token-count' | 'memory-store' | 'error'
> & {
  enableTranscript: boolean;
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

  const handleTokenCount = useCallback((event: TokenCountEvent, conversationRef?: string | null) => {
    setTokenCounts(event.payload ?? null, conversationRef);
    recordTrackingEvent('token-count', event.turn_ref, undefined, conversationRef);
  }, [setTokenCounts, recordTrackingEvent]);

  const handleMemoryStore = useCallback((event: MemoryStoreEvent, conversationRef?: string | null) => {
    recordTrackingEvent('memory-store', event.turn_ref, undefined, conversationRef);
  }, [recordTrackingEvent]);

  const handleError = useCallback((event: ErrorEvent, conversationRef?: string | null) => {
    setIsSending(false, conversationRef);
    setThinkingStatus('', conversationRef);
    setThinkingSourceEventType(null, conversationRef);
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
    addMessage(newMessage, conversationRef);

    recordTrackingEvent('error', event.turn_ref, {
      phase: 'error',
      errorText,
    }, conversationRef);

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
