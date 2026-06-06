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
import type { TranscriptModelContext } from '../../utils/chatStream/chatStreamTypes';
import {
  buildMaterializedCurrentTurnMessage,
  upsertMaterializedCurrentTurnProjectionMessages,
} from '../../utils/chatStream/currentTurnMessageMaterialization';

type UseChatStreamTerminalHandlersDeps = {
  modelContextRef: { current: TranscriptModelContext };
  recordTrackingEvent: TrackEventFn<'token-count' | 'error'>;
};

function terminalPayloadWithoutRawEvent(event: ConversationEvent): Record<string, unknown> {
  const { rawEvent: _rawEvent, ...payload } = event.payload ?? {};
  return payload;
}

function usagePayloadFromEvent(event: ConversationEvent): Record<string, unknown> {
  const {
    rawEvent: _rawEvent,
    userId: _userId,
    backendSequence: _backendSequence,
    ...payload
  } = event.payload ?? {};
  return payload;
}

export function useChatStreamTerminalHandlers({
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

  const handleError = useCallback((event: ConversationEvent, _conversationRef?: string | null) => {
    const errorPayload = terminalPayloadWithoutRawEvent(event);
    if (shouldIgnoreStreamError(errorPayload)) {
      return;
    }
    const errorText = resolveErrorText(errorPayload);
    const modelContext = modelContextRef.current;
    const workspace = useChatStore.getState().getWorkspaceState(event.conversationRef);
    const currentMessages = workspace.messages;
    const currentTurnProjection = workspace.currentTurnProjection;
    const materializedMessage = buildMaterializedCurrentTurnMessage({
      conversationRef: event.conversationRef,
      turnRef: event.turnRef,
      currentTurnProjection,
      fallbackText: errorText,
      modelContext,
      type: 'error',
    });

    if (materializedMessage) {
      const nextMessages = upsertMaterializedCurrentTurnProjectionMessages({
        messages: currentMessages,
        currentTurnProjection,
        assistantMessage: materializedMessage,
        turnRef: event.turnRef,
      });
      if (nextMessages !== currentMessages) {
        useChatStore.getState().setMessages(nextMessages, event.conversationRef);
      }
    }

  }, [
    modelContextRef,
  ]);

  return {
    handleError,
    handleTokenCount,
  };
}
