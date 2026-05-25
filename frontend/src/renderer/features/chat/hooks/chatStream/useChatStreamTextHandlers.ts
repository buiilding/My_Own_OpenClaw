import { useCallback } from 'react';
import { useChatStore } from '../../stores/chatStore';
import type { ConversationEvent } from '../../../../infrastructure/api/windieSdkClient';
import { buildThinkingStatus } from '../../utils/chatStream/chatStreamFormatting';
import { GENERIC_THINKING_STATUS } from '../../utils/chatStream/chatStreamThinkingStatus';

type UseChatStreamTextHandlersOptions = {
  setIsSending: (isSending: boolean, conversationRef?: string | null) => void;
  setThinkingStatus: (status: string | null, conversationRef?: string | null) => void;
  setThinkingSourceEventType: (eventType: string | null, conversationRef?: string | null) => void;
  recordTrackingEvent: (
    eventType: 'llm-thought' | 'streaming-response',
    turnRef: string | null | undefined,
    options: Record<string, unknown>,
    conversationRef?: string | null,
  ) => void;
};

export const useChatStreamTextHandlers = ({
  setIsSending,
  setThinkingStatus,
  setThinkingSourceEventType,
  recordTrackingEvent,
}: UseChatStreamTextHandlersOptions) => {
  const handleLlmThought = useCallback((event: ConversationEvent, conversationRef: string | null) => {
    const workspace = useChatStore.getState().getWorkspaceState(conversationRef);
    const currentStatus = workspace.thinkingStatus;
    const thoughtChunk = typeof event.payload?.text === 'string'
      ? event.payload.text
      : undefined;
    const nextBaseStatus = currentStatus === GENERIC_THINKING_STATUS ? null : currentStatus;
    const nextThinkingStatus = buildThinkingStatus(nextBaseStatus, thoughtChunk);
    setThinkingStatus(nextThinkingStatus, conversationRef);
    setThinkingSourceEventType('llm-thought', conversationRef);

    recordTrackingEvent('llm-thought', event.turnRef, {}, conversationRef);
  }, [
    recordTrackingEvent,
    setThinkingSourceEventType,
    setThinkingStatus,
  ]);

  const handleAssistantDelta = useCallback((event: ConversationEvent, conversationRef: string | null) => {
    setIsSending(false, conversationRef);
    recordTrackingEvent('streaming-response', event.turnRef, {
      phase: 'streaming',
      chunkSize: (typeof event.payload?.text === 'string' ? event.payload.text : '').length,
    }, conversationRef);
  }, [
    recordTrackingEvent,
    setIsSending,
  ]);

  return {
    handleLlmThought,
    handleAssistantDelta,
  };
};
