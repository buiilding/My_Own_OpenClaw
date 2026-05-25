import { useCallback } from 'react';
import { useChatStore, type ChatMessage } from '../../stores/chatStore';
import type { ConversationEvent } from '../../../../infrastructure/api/windieSdkClient';
import type { TranscriptTransparencyData } from '../../../../infrastructure/transcript/types';
import { findStreamingCompleteAssistantMessage } from '../../utils/chatStream/chatStreamMessageUpdates';
import { buildAssistantTranscriptTransparency } from '../../utils/chatStream/chatStreamTransparency';
import type { TranscriptModelContext } from '../../utils/chatStream/chatStreamTypes';
import type { StreamTrackingOptions } from '../../../../app/runtime/desktopChatStreamTrackingRuntime';
import { normalizeIncomingText } from '../../../../infrastructure/text/incomingTextNormalization';
import { buildAssistantTextChatMessageState } from '../../../../infrastructure/transcript/assistantTextChatMessageState';
import { recordAssistantTranscriptMessage } from '../../utils/chatStream/chatStreamTranscriptPersistence';
import { replaceCurrentTurnMessagesWithProjection } from '../../utils/state/chatBoxResponseState';

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
  renderLiveMessages?: boolean | ((event: ConversationEvent, conversationRef?: string | null) => boolean);
};

function shouldRenderLiveMessage(
  option: UseChatStreamCompletionHandlerOptions['renderLiveMessages'],
  event: ConversationEvent,
  conversationRef?: string | null,
): boolean {
  return typeof option === 'function' ? option(event, conversationRef) : option !== false;
}

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
  renderLiveMessages = true,
}: UseChatStreamCompletionHandlerOptions) => {
  return useCallback((event: ConversationEvent, conversationRef: string | null) => {
    const shouldRenderLiveMessages = shouldRenderLiveMessage(renderLiveMessages, event, conversationRef);
    const userId = typeof event.payload?.userId === 'string'
      ? event.payload.userId
      : undefined;
    const workspace = useChatStore.getState().getWorkspaceState(conversationRef);
    setIsSending(false, conversationRef);
    if (shouldRenderLiveMessages) {
      persistThinkingForTurn(event.turnRef || undefined, conversationRef);
    }
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
    const currentTurnProjection = workspace.currentTurnProjection;
    const projectedCompletionText = (
      currentTurnProjection?.turnRef === event.turnRef
        ? normalizeIncomingText(currentTurnProjection.assistantText)
        : ''
    );
    const transcriptText = completionText || projectedCompletionText;

    if (!shouldRenderLiveMessages) {
      const nextMessages = replaceCurrentTurnMessagesWithProjection(
        currentMessages,
        currentTurnProjection,
      );
      if (nextMessages !== currentMessages) {
        useChatStore.getState().setMessages(nextMessages, conversationRef);
      }
      if (transcriptText && enableTranscript) {
        recordAssistantTranscriptMessage({
          text: transcriptText,
          messageType: 'llm-text',
          conversationRef: event.conversationRef,
          userId,
          modelContext,
          transparency: undefined,
        });
      }
    } else if (lastMessage && lastMessage.sender === 'assistant' && !lastMessage.isComplete) {
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
        recordAssistantTranscriptMessage({
          text: nextText,
          messageType: lastMessage.type || 'llm-text',
          conversationRef: event.conversationRef,
          userId,
          modelContext,
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
        recordAssistantTranscriptMessage({
          text: completionText,
          messageType: 'llm-text',
          conversationRef: event.conversationRef,
          userId,
          modelContext,
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
    renderLiveMessages,
    setIsSending,
    setThinkingSourceEventType,
    setThinkingStatus,
    updateMessage,
  ]);
};
