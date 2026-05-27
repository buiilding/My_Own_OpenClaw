import { useCallback } from 'react';
import {
  useChatStore,
  type TokenCounts,
} from '../../stores/chatStore';
import {
  resolveErrorText,
  shouldIgnoreStreamError,
} from '../../utils/chatStream/chatStreamEventUtils';
import type { TrackEventFn } from './chatStreamHandlerTypes';
import { findLastAssistantLlmTextMessageId } from '../../utils/chatStream/chatStreamMessageUpdates';
import type { ConversationEvent } from '../../../../infrastructure/api/windieSdkClient';
import { recordAssistantTranscriptMessage } from '../../utils/chatStream/chatStreamTranscriptPersistence';
import type { TranscriptModelContext } from '../../utils/chatStream/chatStreamTypes';

type UseChatStreamTerminalHandlersDeps = {
  enableTranscript: boolean;
  modelContextRef: { current: TranscriptModelContext };
  recordTrackingEvent: TrackEventFn<'token-count' | 'memory-store' | 'error'>;
};

function terminalPayloadWithoutRawEvent(event: ConversationEvent): Record<string, unknown> {
  const { rawEvent: _rawEvent, ...payload } = event.payload ?? {};
  return payload;
}

function usagePayloadFromEvent(event: ConversationEvent): Record<string, unknown> {
  const { rawEvent: _rawEvent, userId: _userId, ...payload } = event.payload ?? {};
  return payload;
}

export function useChatStreamTerminalHandlers({
  enableTranscript,
  modelContextRef,
  recordTrackingEvent,
}: UseChatStreamTerminalHandlersDeps) {
  const setTokenCounts = useChatStore((state) => state.setTokenCounts);
  const updateMessage = useChatStore((state) => state.updateMessage);

  const handleTokenCount = useCallback((event: ConversationEvent, conversationRef?: string | null) => {
    const tokenCounts = usagePayloadFromEvent(event) as TokenCounts;
    const workspace = useChatStore.getState().getWorkspaceState(conversationRef);
    setTokenCounts(tokenCounts, conversationRef);
    const assistantMessageId = findLastAssistantLlmTextMessageId(
      workspace.messages,
      event.turnRef || undefined,
    );
    if (assistantMessageId) {
      updateMessage(assistantMessageId, {
        tokenCounts,
      }, conversationRef);
    }
    recordTrackingEvent('token-count', event.turnRef, undefined, conversationRef);
  }, [
    setTokenCounts,
    updateMessage,
    recordTrackingEvent,
  ]);

  const handleMemoryStore = useCallback((event: ConversationEvent, conversationRef?: string | null) => {
    recordTrackingEvent('memory-store', event.turnRef, undefined, conversationRef);
  }, [
    recordTrackingEvent,
  ]);

  const handleError = useCallback((event: ConversationEvent, _conversationRef?: string | null) => {
    const errorPayload = terminalPayloadWithoutRawEvent(event);
    if (shouldIgnoreStreamError(errorPayload)) {
      return;
    }
    const errorText = resolveErrorText(errorPayload);
    const modelContext = modelContextRef.current;

    if (enableTranscript) {
      recordAssistantTranscriptMessage({
        text: errorText,
        messageType: 'error',
        conversationRef: event.conversationRef,
        userId: typeof errorPayload.userId === 'string' ? errorPayload.userId : undefined,
        modelContext,
      });
    }
  }, [
    enableTranscript,
    modelContextRef,
  ]);

  return {
    handleError,
    handleMemoryStore,
    handleTokenCount,
  };
}
