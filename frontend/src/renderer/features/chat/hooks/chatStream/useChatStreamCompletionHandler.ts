import { useCallback } from 'react';
import { useChatStore } from '../../stores/chatStore';
import type { ConversationEvent } from '../../../../infrastructure/api/windieSdkClient';
import type { TranscriptTransparencyData } from '../../../../infrastructure/transcript/types';
import { findStreamingCompleteAssistantMessage } from '../../utils/chatStream/chatStreamMessageUpdates';
import { buildAssistantTranscriptTransparency } from '../../utils/chatStream/chatStreamTransparency';
import type { TranscriptModelContext } from '../../utils/chatStream/chatStreamTypes';
import { normalizeIncomingText } from '../../../../infrastructure/text/incomingTextNormalization';
import { recordAssistantTranscriptMessage } from '../../utils/chatStream/chatStreamTranscriptPersistence';

type UseChatStreamCompletionHandlerOptions = {
  enableTranscript: boolean;
  modelContextRef: { current: TranscriptModelContext };
};

export const useChatStreamCompletionHandler = ({
  enableTranscript,
  modelContextRef,
}: UseChatStreamCompletionHandlerOptions) => {
  return useCallback((event: ConversationEvent, conversationRef: string | null) => {
    const userId = typeof event.payload?.userId === 'string'
      ? event.payload.userId
      : undefined;
    const workspace = useChatStore.getState().getWorkspaceState(conversationRef);
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
    const transparency: TranscriptTransparencyData | undefined = lastMessage
      ? buildAssistantTranscriptTransparency(currentMessages, lastMessage, event.turnRef || undefined)
      : undefined;

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

  }, [
    enableTranscript,
    modelContextRef,
  ]);
};
