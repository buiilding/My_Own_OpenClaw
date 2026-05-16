import { useCallback } from 'react';
import {
  useChatStore,
  type ChatMessage,
} from '../../stores/chatStore';
import type {
  ErrorEvent,
  MemoryStoreEvent,
  TokenCountEvent,
} from '../../../../types/backendEvents';
import { resolveErrorText } from '../../utils/chatStream/chatStreamEventUtils';
import type { ChatStreamThinkingStateDeps } from './chatStreamHandlerTypes';
import { findLastAssistantLlmTextMessageId } from '../../utils/chatStream/chatStreamMessageUpdates';
import { DesktopConversationRuntimeClient } from '../../session/desktopConversationRuntimeClient';

type UseChatStreamTerminalHandlersDeps = ChatStreamThinkingStateDeps<
  'streaming-complete' | 'token-count' | 'memory-store' | 'error'
> & {
  enableTranscript: boolean;
};

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

  const handleError = useCallback((event: ErrorEvent, conversationRef?: string | null) => {
    setIsSending(false, conversationRef);
    setThinkingStatus('', conversationRef);
    setThinkingSourceEventType(null, conversationRef);
    const errorText = resolveErrorText(event.payload);
    const modelContext = modelContextRef.current;
    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      text: errorText,
      sender: 'assistant',
      type: 'error',
      sourceEventType: 'error',
      sourceChannel: 'from-backend',
      turnRef: event.turn_ref,
      modelId: modelContext.modelId,
      modelProvider: modelContext.modelProvider,
    };
    addMessage(newMessage, conversationRef);

    recordTrackingEvent('error', event.turn_ref, {
      phase: 'error',
      errorText,
    }, conversationRef);

    if (enableTranscript) {
      DesktopConversationRuntimeClient.recordAssistantMessage(errorText, {
        messageType: 'error',
        conversationRef: event.conversation_ref,
        userId: event.user_id,
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
