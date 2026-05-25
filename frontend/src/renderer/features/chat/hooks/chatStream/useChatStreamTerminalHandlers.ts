import { useCallback } from 'react';
import {
  useChatStore,
  type ChatMessage,
  type TokenCounts,
} from '../../stores/chatStore';
import {
  resolveErrorText,
  shouldIgnoreStreamError,
} from '../../utils/chatStream/chatStreamEventUtils';
import type { ChatStreamThinkingStateDeps } from './chatStreamHandlerTypes';
import { findLastAssistantLlmTextMessageId } from '../../utils/chatStream/chatStreamMessageUpdates';
import type { ConversationEvent } from '../../../../infrastructure/api/windieSdkClient';
import { recordAssistantTranscriptMessage } from '../../utils/chatStream/chatStreamTranscriptPersistence';
import { replaceCurrentTurnMessagesWithProjection } from '../../utils/state/chatBoxResponseState';

type UseChatStreamTerminalHandlersDeps = ChatStreamThinkingStateDeps<
  'streaming-complete' | 'token-count' | 'memory-store' | 'error'
> & {
  enableTranscript: boolean;
  renderLiveMessages?: boolean | ((event: ConversationEvent, conversationRef?: string | null) => boolean);
};

function terminalPayloadWithoutRawEvent(event: ConversationEvent): Record<string, unknown> {
  const { rawEvent: _rawEvent, ...payload } = event.payload ?? {};
  return payload;
}

function shouldRenderLiveMessage(
  option: UseChatStreamTerminalHandlersDeps['renderLiveMessages'],
  event: ConversationEvent,
  conversationRef?: string | null,
): boolean {
  return typeof option === 'function' ? option(event, conversationRef) : option !== false;
}

export function useChatStreamTerminalHandlers({
  addMessage,
  enableTranscript,
  modelContextRef,
  recordTrackingEvent,
  setIsSending,
  setThinkingSourceEventType,
  setThinkingStatus,
  renderLiveMessages = true,
}: UseChatStreamTerminalHandlersDeps) {
  const setTokenCounts = useChatStore((state) => state.setTokenCounts);
  const updateMessage = useChatStore((state) => state.updateMessage);

  const handleTokenCount = useCallback((event: ConversationEvent, conversationRef?: string | null) => {
    const tokenCounts = terminalPayloadWithoutRawEvent(event) as TokenCounts;
    const workspace = useChatStore.getState().getWorkspaceState(conversationRef);
    const shouldFinalizePendingStream = (
      workspace.isSending === true
      && workspace.streamTracking.phase !== 'complete'
      && workspace.streamTracking.phase !== 'error'
    );
    if (shouldFinalizePendingStream) {
      setIsSending(false, conversationRef);
      setThinkingStatus(null, conversationRef);
      setThinkingSourceEventType(null, conversationRef);
      recordTrackingEvent('streaming-complete', event.turnRef, { phase: 'complete' }, conversationRef);
    }
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
    setIsSending,
    setThinkingSourceEventType,
    setThinkingStatus,
  ]);

  const handleMemoryStore = useCallback((event: ConversationEvent, conversationRef?: string | null) => {
    const workspace = useChatStore.getState().getWorkspaceState(conversationRef);
    const shouldFinalizePendingStream = (
      workspace.isSending === true
      && workspace.streamTracking.phase === 'awaiting-first-chunk'
    );
    if (shouldFinalizePendingStream) {
      setIsSending(false, conversationRef);
      setThinkingStatus(null, conversationRef);
      setThinkingSourceEventType(null, conversationRef);
      recordTrackingEvent('streaming-complete', event.turnRef, { phase: 'complete' }, conversationRef);
    }
    recordTrackingEvent('memory-store', event.turnRef, undefined, conversationRef);
  }, [
    recordTrackingEvent,
    setIsSending,
    setThinkingSourceEventType,
    setThinkingStatus,
  ]);

  const handleError = useCallback((event: ConversationEvent, conversationRef?: string | null) => {
    const errorPayload = terminalPayloadWithoutRawEvent(event);
    if (shouldIgnoreStreamError(errorPayload)) {
      return;
    }
    setIsSending(false, conversationRef);
    setThinkingStatus('', conversationRef);
    setThinkingSourceEventType(null, conversationRef);
    const errorText = resolveErrorText(errorPayload);
    const modelContext = modelContextRef.current;
    if (shouldRenderLiveMessage(renderLiveMessages, event, conversationRef)) {
      const newMessage: ChatMessage = {
        id: crypto.randomUUID(),
        text: errorText,
        sender: 'assistant',
        type: 'error',
        sourceEventType: 'error',
        sourceChannel: 'from-backend',
        turnRef: event.turnRef ?? undefined,
        modelId: modelContext.modelId,
        modelProvider: modelContext.modelProvider,
      };
      addMessage(newMessage, conversationRef);
    } else {
      const workspace = useChatStore.getState().getWorkspaceState(conversationRef);
      const nextMessages = replaceCurrentTurnMessagesWithProjection(
        workspace.messages,
        workspace.currentTurnProjection,
      );
      if (nextMessages !== workspace.messages) {
        useChatStore.getState().setMessages(nextMessages, conversationRef);
      }
    }

    recordTrackingEvent('error', event.turnRef, {
      phase: 'error',
      errorText,
    }, conversationRef);

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
    addMessage,
    enableTranscript,
    modelContextRef,
    renderLiveMessages,
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
