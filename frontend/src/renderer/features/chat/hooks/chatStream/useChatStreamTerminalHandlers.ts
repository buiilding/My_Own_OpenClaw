import { useCallback } from 'react';
import {
  useChatStore,
  type ChatMessage,
} from '../../stores/chatStore';
import type {
  BackendEvent,
  ErrorEvent,
  MemoryStoreEvent,
  TokenCountEvent,
} from '../../../../types/backendEvents';
import {
  resolveErrorText,
  shouldIgnoreStreamError,
} from '../../utils/chatStream/chatStreamEventUtils';
import type { ChatStreamThinkingStateDeps } from './chatStreamHandlerTypes';
import { findLastAssistantLlmTextMessageId } from '../../utils/chatStream/chatStreamMessageUpdates';
import { DesktopConversationRuntimeClient } from '../../session/desktopConversationRuntimeClient';
import type { ConversationEvent } from '../../../../infrastructure/api/windieSdkClient';

type UseChatStreamTerminalHandlersDeps = ChatStreamThinkingStateDeps<
  'streaming-complete' | 'token-count' | 'memory-store' | 'error'
> & {
  enableTranscript: boolean;
};

function unwrapErrorBackendEvent(event: ErrorEvent | ConversationEvent): ErrorEvent {
  if ('conversation_ref' in event || 'user_id' in event || event.type === 'error') {
    return event as ErrorEvent;
  }
  const rawEvent = event.payload?.rawEvent;
  if (
    rawEvent
    && typeof rawEvent === 'object'
    && !Array.isArray(rawEvent)
    && (rawEvent as { type?: unknown }).type === 'error'
  ) {
    return rawEvent as ErrorEvent;
  }
  return {
    type: 'error',
    conversation_ref: event.conversationRef,
    turn_ref: event.turnRef ?? undefined,
    payload: {
      message: typeof event.payload?.message === 'string'
        ? event.payload.message
        : 'Backend error',
    },
  } as BackendEvent as ErrorEvent;
}

export function useChatStreamTerminalHandlers({
  addMessage,
  enableTranscript,
  modelContextRef,
  recordTrackingEvent,
  setIsSending,
  setThinkingSourceEventType,
  setThinkingStatus,
}: UseChatStreamTerminalHandlersDeps) {
  const setTokenCounts = useChatStore((state) => state.setTokenCounts);
  const updateMessage = useChatStore((state) => state.updateMessage);

  const handleTokenCount = useCallback((event: TokenCountEvent, conversationRef?: string | null) => {
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
      recordTrackingEvent('streaming-complete', event.turn_ref, { phase: 'complete' }, conversationRef);
    }
    setTokenCounts(event.payload ?? null, conversationRef);
    const assistantMessageId = findLastAssistantLlmTextMessageId(
      workspace.messages,
      event.turn_ref || undefined,
    );
    if (assistantMessageId && event.payload) {
      updateMessage(assistantMessageId, {
        tokenCounts: event.payload,
      }, conversationRef);
    }
    recordTrackingEvent('token-count', event.turn_ref, undefined, conversationRef);
  }, [
    setTokenCounts,
    updateMessage,
    recordTrackingEvent,
    setIsSending,
    setThinkingSourceEventType,
    setThinkingStatus,
  ]);

  const handleMemoryStore = useCallback((event: MemoryStoreEvent, conversationRef?: string | null) => {
    const workspace = useChatStore.getState().getWorkspaceState(conversationRef);
    const shouldFinalizePendingStream = (
      workspace.isSending === true
      && workspace.streamTracking.phase === 'awaiting-first-chunk'
    );
    if (shouldFinalizePendingStream) {
      setIsSending(false, conversationRef);
      setThinkingStatus(null, conversationRef);
      setThinkingSourceEventType(null, conversationRef);
      recordTrackingEvent('streaming-complete', event.turn_ref, { phase: 'complete' }, conversationRef);
    }
    recordTrackingEvent('memory-store', event.turn_ref, undefined, conversationRef);
  }, [
    recordTrackingEvent,
    setIsSending,
    setThinkingSourceEventType,
    setThinkingStatus,
  ]);

  const handleError = useCallback((event: ErrorEvent | ConversationEvent, conversationRef?: string | null) => {
    const backendEvent = unwrapErrorBackendEvent(event);
    if (shouldIgnoreStreamError(backendEvent.payload)) {
      return;
    }
    setIsSending(false, conversationRef);
    setThinkingStatus('', conversationRef);
    setThinkingSourceEventType(null, conversationRef);
    const errorText = resolveErrorText(backendEvent.payload);
    const modelContext = modelContextRef.current;
    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      text: errorText,
      sender: 'assistant',
      type: 'error',
      sourceEventType: 'error',
      sourceChannel: 'from-backend',
      turnRef: backendEvent.turn_ref,
      modelId: modelContext.modelId,
      modelProvider: modelContext.modelProvider,
    };
    addMessage(newMessage, conversationRef);

    recordTrackingEvent('error', backendEvent.turn_ref, {
      phase: 'error',
      errorText,
    }, conversationRef);

    if (enableTranscript) {
      DesktopConversationRuntimeClient.recordAssistantMessage(errorText, {
        messageType: 'error',
        conversationRef: backendEvent.conversation_ref,
        userId: backendEvent.user_id,
        modelId: modelContext.modelId,
        modelProvider: modelContext.modelProvider,
      });
    }
  }, [
    addMessage,
    enableTranscript,
    modelContextRef,
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
