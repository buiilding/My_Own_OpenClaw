import { useCallback } from 'react';
import { useChatStore, type ChatMessage } from '../../stores/chatStore';
import type { ConversationEvent } from '../../../../infrastructure/api/windieSdkClient';
import type { TranscriptTransparencyData } from '../../../../infrastructure/transcript/types';
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
  return useCallback((event: ConversationEvent, conversationRef: string | null) => {
    const rawEvent = event.payload?.rawEvent && typeof event.payload.rawEvent === 'object'
      ? event.payload.rawEvent as { conversation_ref?: unknown; user_id?: unknown }
      : {};
    const rawConversationRef = typeof rawEvent.conversation_ref === 'string'
      ? rawEvent.conversation_ref
      : undefined;
    const rawUserId = typeof rawEvent.user_id === 'string'
      ? rawEvent.user_id
      : undefined;
    const workspace = useChatStore.getState().getWorkspaceState(conversationRef);
    setIsSending(false, conversationRef);
    persistThinkingForTurn(event.turnRef || undefined, conversationRef);
    setThinkingStatus(null, conversationRef);
    setThinkingSourceEventType(null, conversationRef);

    const currentMessages = workspace.messages;
    const lastMessage = findStreamingCompleteAssistantMessage(
      currentMessages,
      event.turnRef,
    );
    const completionText = normalizeIncomingText(event.payload?.finalResponse)
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
          buildAssistantTranscriptTransparency(currentMessages, lastMessage, event.turnRef || undefined)
        );
        DesktopConversationRuntimeClient.recordAssistantMessage(nextText, {
          messageType: lastMessage.type || 'llm-text',
          conversationRef: conversationRef || rawConversationRef,
          userId: rawUserId,
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
        turnRef: event.turnRef || undefined,
        modelId: modelContext.modelId,
        modelProvider: modelContext.modelProvider,
      }) as ChatMessage;
      addMessage(newMessage, conversationRef);
      if (enableTranscript) {
        DesktopConversationRuntimeClient.recordAssistantMessage(completionText, {
          messageType: 'llm-text',
          conversationRef: conversationRef || rawConversationRef,
          userId: rawUserId,
          modelId: modelContext.modelId,
          modelProvider: modelContext.modelProvider,
          transparency: undefined,
        });
      }
    }

    recordTrackingEvent('streaming-complete', event.turnRef, { phase: 'complete' }, conversationRef);
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
