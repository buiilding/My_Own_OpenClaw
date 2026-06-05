import { useCallback } from 'react';
import { useChatStore } from '../../stores/chatStore';
import type { ConversationEvent } from '../../../../infrastructure/api/windieSdkClient';
import { findStreamingCompleteAssistantMessage } from '../../utils/chatStream/chatStreamMessageUpdates';
import type { TranscriptModelContext } from '../../utils/chatStream/chatStreamTypes';
import { normalizeIncomingText } from '../../../../infrastructure/text/incomingTextNormalization';
import {
  buildMaterializedCurrentTurnMessage,
  upsertMaterializedCurrentTurnMessage,
} from '../../utils/chatStream/currentTurnMessageMaterialization';

type UseChatStreamCompletionHandlerOptions = {
  modelContextRef: { current: TranscriptModelContext };
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
  modelContextRef,
  recordTrackingEvent,
  setIsSending,
  setThinkingStatus,
  setThinkingSourceEventType,
}: UseChatStreamCompletionHandlerOptions) => {
  return useCallback((event: ConversationEvent, conversationRef: string | null) => {
    if (event.type !== 'turn_completed') {
      return;
    }
    const resolvedConversationRef = conversationRef ?? event.conversationRef;
    const workspace = useChatStore.getState().getWorkspaceState(resolvedConversationRef);
    const shouldRecordTerminalTracking = (
      workspace.streamTracking?.phase !== 'complete'
      || workspace.isSending === true
      || workspace.thinkingStatus !== null
      || workspace.thinkingSourceEventType !== null
    );
    setIsSending(false, resolvedConversationRef);
    setThinkingStatus(null, resolvedConversationRef);
    setThinkingSourceEventType(null, resolvedConversationRef);
    if (shouldRecordTerminalTracking) {
      recordTrackingEvent('streaming-complete', event.turnRef, {
        phase: 'complete',
      }, resolvedConversationRef);
    }

    const currentMessages = workspace.messages;
    const lastMessage = findStreamingCompleteAssistantMessage(
      currentMessages,
      event.turnRef,
    );
    const alreadyCompleted = lastMessage?.isComplete === true;
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
    const materializedMessage = buildMaterializedCurrentTurnMessage({
      conversationRef: conversationRef ?? event.conversationRef,
      turnRef: event.turnRef,
      currentTurnProjection,
      fallbackText: transcriptText,
      previousMessage: lastMessage,
      modelContext,
    });

    if (materializedMessage && !alreadyCompleted) {
      const nextMessages = upsertMaterializedCurrentTurnMessage({
        messages: currentMessages,
        message: materializedMessage,
        replaceMessageId: lastMessage?.id,
      });
      if (nextMessages !== currentMessages) {
        useChatStore.getState().setMessages(nextMessages, resolvedConversationRef);
      }
    }

  }, [
    modelContextRef,
    recordTrackingEvent,
    setIsSending,
    setThinkingSourceEventType,
    setThinkingStatus,
  ]);
};
