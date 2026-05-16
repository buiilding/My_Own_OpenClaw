import { useCallback } from 'react';
import { useChatStore, type ChatMessage } from '../../stores/chatStore';
import type { TranscriptTransparencyData } from '../../../../infrastructure/transcript/types';
import type { StreamingCompleteEvent } from '../../../../types/backendEvents';
import { findStreamingCompleteAssistantMessage } from '../../utils/chatStream/chatStreamMessageUpdates';
import { buildAssistantTranscriptTransparency } from '../../utils/chatStream/chatStreamTransparency';
import type { TranscriptModelContext } from '../../utils/chatStream/chatStreamTypes';
import type { StreamTrackingOptions } from '../../utils/chatStream/chatStreamTracking';
import { normalizeIncomingText } from '../../../../infrastructure/text/incomingTextNormalization';
import { buildAssistantTextChatMessageState } from '../../../../infrastructure/transcript/assistantTextChatMessageState';
import { DesktopConversationRuntimeClient } from '../../session/desktopConversationRuntimeClient';

type UseChatStreamCompletionHandlerOptions = {
  addMessage: (message: ChatMessage, conversationRef?: string | null) => void;
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
  addMessage,
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
    const completionText = normalizeIncomingText(event.payload?.final_response)
      || normalizeIncomingText(lastMessage?.fullAssistantMessage?.content);
    const modelContext = modelContextRef.current;
    if (lastMessage && lastMessage.sender === 'assistant' && !lastMessage.isComplete) {
      const nextText = lastMessage.text || completionText;
      updateMessage(lastMessage.id, {
        text: nextText,
        isComplete: true,
        type: 'llm-text',
        sourceEventType: lastMessage.sourceEventType || 'streaming-complete',
        sourceChannel: lastMessage.sourceChannel || 'from-backend',
        modelId: lastMessage.modelId || modelContext.modelId,
        modelProvider: lastMessage.modelProvider || modelContext.modelProvider,
      }, conversationRef);
      if (nextText && enableTranscript) {
        const normalizedTransparency: TranscriptTransparencyData | undefined = (
          buildAssistantTranscriptTransparency(currentMessages, lastMessage, event.turn_ref || undefined)
        );
        DesktopConversationRuntimeClient.recordAssistantMessage(nextText, {
          messageType: lastMessage.type || 'llm-text',
          conversationRef: conversationRef || event.conversation_ref,
          userId: event.user_id,
          modelId: modelContext.modelId,
          modelProvider: modelContext.modelProvider,
          transparency: normalizedTransparency,
        });
      }
    } else if (completionText) {
      const newMessage: ChatMessage = buildAssistantTextChatMessageState({
        text: completionText,
        isComplete: true,
        sourceEventType: 'streaming-complete',
        sourceChannel: 'from-backend',
        turnRef: event.turn_ref || undefined,
        modelId: modelContext.modelId,
        modelProvider: modelContext.modelProvider,
      }) as ChatMessage;
      addMessage(newMessage, conversationRef);
      if (enableTranscript) {
        DesktopConversationRuntimeClient.recordAssistantMessage(completionText, {
          messageType: 'llm-text',
          conversationRef: conversationRef || event.conversation_ref,
          userId: event.user_id,
          modelId: modelContext.modelId,
          modelProvider: modelContext.modelProvider,
          transparency: undefined,
        });
      }
    }

    recordTrackingEvent('streaming-complete', event.turn_ref, { phase: 'complete' }, conversationRef);
  }, [
    addMessage,
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
