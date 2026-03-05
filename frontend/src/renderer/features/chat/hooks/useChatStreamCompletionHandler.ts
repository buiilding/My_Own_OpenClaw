import { useCallback } from 'react';
import { useChatStore } from '../stores/chatStore';
import { recordAssistantMessage } from '../../../infrastructure/transcript/TranscriptWriter';
import type { TranscriptTransparencyData } from '../../../infrastructure/transcript/types';
import type { StreamingCompleteEvent } from '../../../types/backendEvents';
import { findStreamingCompleteAssistantMessage } from '../utils/chatStream/chatStreamMessageUpdates';
import { buildAssistantTranscriptTransparency } from '../utils/chatStream/chatStreamTransparency';
import type { TranscriptModelContext } from '../utils/chatStream/chatStreamTypes';
import type { StreamTrackingOptions } from '../utils/chatStream/chatStreamTracking';

type UseChatStreamCompletionHandlerOptions = {
  enableTranscript: boolean;
  modelContextRef: { current: TranscriptModelContext };
  recordTrackingEvent: (
    eventType: 'streaming-complete',
    turnRef: string | null | undefined,
    options: StreamTrackingOptions,
    conversationRef?: string | null,
  ) => void;
  setIsSending: (isSending: boolean, conversationRef?: string | null) => void;
  setThinkingStatus: (status: string | null, conversationRef?: string | null) => void;
  setThinkingSourceEventType: (eventType: string | null, conversationRef?: string | null) => void;
  updateMessage: (messageId: string, updates: Record<string, unknown>, conversationRef?: string | null) => void;
  persistThinkingForTurn: (turnRef?: string, conversationRef?: string | null) => void;
};

export const useChatStreamCompletionHandler = ({
  enableTranscript,
  modelContextRef,
  recordTrackingEvent,
  setIsSending,
  setThinkingStatus,
  setThinkingSourceEventType,
  updateMessage,
  persistThinkingForTurn,
}: UseChatStreamCompletionHandlerOptions) => {
  return useCallback((event: StreamingCompleteEvent, conversationRef: string | null) => {
    const workspace = useChatStore.getState().getWorkspaceState(conversationRef);
    setIsSending(false, conversationRef);
    persistThinkingForTurn(event.turn_ref || undefined, conversationRef);
    setThinkingStatus(null, conversationRef);
    setThinkingSourceEventType(null, conversationRef);

    const currentMessages = workspace.messages;
    const lastMessage = findStreamingCompleteAssistantMessage(
      currentMessages,
      event.turn_ref,
    );
    if (lastMessage && lastMessage.sender === 'assistant' && !lastMessage.isComplete) {
      updateMessage(lastMessage.id, { isComplete: true }, conversationRef);
      if (lastMessage.text && enableTranscript) {
        const normalizedTransparency: TranscriptTransparencyData | undefined = (
          buildAssistantTranscriptTransparency(currentMessages, lastMessage, event.turn_ref || undefined)
        );
        const modelContext = modelContextRef.current;
        recordAssistantMessage(lastMessage.text, {
          messageType: lastMessage.type || 'llm-text',
          conversationRef: conversationRef || event.conversation_ref,
          userId: event.user_id,
          modelId: modelContext.modelId,
          modelProvider: modelContext.modelProvider,
          transparency: normalizedTransparency,
        });
      }
    }

    recordTrackingEvent('streaming-complete', event.turn_ref, { phase: 'complete' }, conversationRef);
  }, [
    enableTranscript,
    modelContextRef,
    persistThinkingForTurn,
    recordTrackingEvent,
    setIsSending,
    setThinkingSourceEventType,
    setThinkingStatus,
    updateMessage,
  ]);
};
