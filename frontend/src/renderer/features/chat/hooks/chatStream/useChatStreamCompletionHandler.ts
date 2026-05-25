import { useCallback } from 'react';
import { useChatStore } from '../../stores/chatStore';
import type { ConversationEvent } from '../../../../infrastructure/api/windieSdkClient';
import type { TranscriptTransparencyData } from '../../../../infrastructure/transcript/types';
import { findStreamingCompleteAssistantMessage } from '../../utils/chatStream/chatStreamMessageUpdates';
import { buildAssistantTranscriptTransparency } from '../../utils/chatStream/chatStreamTransparency';
import type { TranscriptModelContext } from '../../utils/chatStream/chatStreamTypes';
import type { StreamTrackingOptions } from '../../../../app/runtime/desktopChatStreamTrackingRuntime';
import { normalizeIncomingText } from '../../../../infrastructure/text/incomingTextNormalization';
import { recordAssistantTranscriptMessage } from '../../utils/chatStream/chatStreamTranscriptPersistence';
import { replaceCurrentTurnMessagesWithProjection } from '../../utils/state/chatBoxResponseState';

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
};

export const useChatStreamCompletionHandler = ({
  enableTranscript,
  modelContextRef,
  recordTrackingEvent,
  setIsSending,
  setThinkingStatus,
  setThinkingSourceEventType,
}: UseChatStreamCompletionHandlerOptions) => {
  return useCallback((event: ConversationEvent, conversationRef: string | null) => {
    const userId = typeof event.payload?.userId === 'string'
      ? event.payload.userId
      : undefined;
    const workspace = useChatStore.getState().getWorkspaceState(conversationRef);
    const alreadyCompleted = (
      workspace.streamTracking.phase === 'complete'
      && workspace.streamTracking.activeTurnRef === event.turnRef
    );
    setIsSending(false, conversationRef);
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
    const transcriptText = normalizeIncomingText(lastMessage?.text) || completionText || projectedCompletionText;
    const transparency: TranscriptTransparencyData | undefined = lastMessage
      ? buildAssistantTranscriptTransparency(currentMessages, lastMessage, event.turnRef || undefined)
      : undefined;

    const nextMessages = replaceCurrentTurnMessagesWithProjection(
      currentMessages,
      currentTurnProjection,
    );
    if (nextMessages !== currentMessages) {
      useChatStore.getState().setMessages(nextMessages, conversationRef);
    }
    if (transcriptText && enableTranscript && !alreadyCompleted) {
      recordAssistantTranscriptMessage({
        text: transcriptText,
        messageType: 'llm-text',
        conversationRef: event.conversationRef,
        userId,
        modelContext,
        transparency,
      });
    }

    recordTrackingEvent('streaming-complete', event.turnRef, { phase: 'complete' }, conversationRef);
  }, [
    enableTranscript,
    modelContextRef,
    recordTrackingEvent,
    setIsSending,
    setThinkingSourceEventType,
    setThinkingStatus,
  ]);
};
