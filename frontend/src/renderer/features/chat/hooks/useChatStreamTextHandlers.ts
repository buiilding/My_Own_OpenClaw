import { useCallback } from 'react';
import { useChatStore, type ChatMessage } from '../stores/chatStore';
import type { LlmThoughtEvent, StreamingResponseEvent } from '../../../types/backendEvents';
import { buildThinkingStatus } from '../utils/chatStream/chatStreamFormatting';
import {
  findLastAssistantLlmTextMessageId,
  resolveStreamingResponseAction,
} from '../utils/chatStream/chatStreamMessageUpdates';
import { GENERIC_THINKING_STATUS } from '../utils/chatStream/chatStreamThinkingStatus';
import type { TranscriptModelContext } from '../utils/chatStream/chatStreamTypes';

type UseChatStreamTextHandlersOptions = {
  addMessage: (message: ChatMessage, conversationRef?: string | null) => void;
  updateMessage: (messageId: string, updates: Partial<ChatMessage>, conversationRef?: string | null) => void;
  setIsSending: (isSending: boolean, conversationRef?: string | null) => void;
  setThinkingStatus: (status: string | null, conversationRef?: string | null) => void;
  setThinkingSourceEventType: (eventType: string | null, conversationRef?: string | null) => void;
  modelContextRef: { current: TranscriptModelContext };
  recordTrackingEvent: (
    eventType: 'llm-thought' | 'streaming-response',
    turnRef: string | null | undefined,
    options: Record<string, unknown>,
    conversationRef?: string | null,
  ) => void;
};

export const useChatStreamTextHandlers = ({
  addMessage,
  updateMessage,
  setIsSending,
  setThinkingStatus,
  setThinkingSourceEventType,
  modelContextRef,
  recordTrackingEvent,
}: UseChatStreamTextHandlersOptions) => {
  const handleLlmThought = useCallback((event: LlmThoughtEvent, conversationRef: string | null) => {
    const workspace = useChatStore.getState().getWorkspaceState(conversationRef);
    const currentStatus = workspace.thinkingStatus;
    const payload = event.payload as { status?: string; content?: string } | undefined;
    const thoughtChunk =
      typeof payload?.status === 'string'
        ? payload.status
        : typeof payload?.content === 'string'
          ? payload.content
          : undefined;
    const nextBaseStatus = currentStatus === GENERIC_THINKING_STATUS ? null : currentStatus;
    const nextThinkingStatus = buildThinkingStatus(nextBaseStatus, thoughtChunk);
    setThinkingStatus(nextThinkingStatus, conversationRef);
    setThinkingSourceEventType('llm-thought', conversationRef);

    const modelContext = modelContextRef.current;
    const modelMetadata = {
      modelId: modelContext.modelId,
      modelProvider: modelContext.modelProvider,
    };
    const turnRef = event.turn_ref || undefined;
    const messages = useChatStore.getState().getWorkspaceState(conversationRef).messages;
    const assistantMessageId = findLastAssistantLlmTextMessageId(messages, turnRef);
    if (assistantMessageId) {
      const assistantMessage = messages.find((message) => message.id === assistantMessageId);
      const nextMessageThinkingText = buildThinkingStatus(
        typeof assistantMessage?.thinkingText === 'string' ? assistantMessage.thinkingText : null,
        thoughtChunk,
      );
      updateMessage(assistantMessageId, {
        thinkingText: nextMessageThinkingText,
        thinkingSourceEventType: 'llm-thought',
        ...modelMetadata,
      }, conversationRef);
    } else if (nextThinkingStatus.trim()) {
      const placeholderAssistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        text: '',
        sender: 'assistant',
        isComplete: false,
        type: 'llm-text',
        sourceEventType: 'streaming-response',
        sourceChannel: 'from-backend',
        turnRef,
        thinkingText: nextThinkingStatus,
        thinkingSourceEventType: 'llm-thought',
        ...modelMetadata,
      };
      addMessage(placeholderAssistantMessage, conversationRef);
    }

    recordTrackingEvent('llm-thought', event.turn_ref, {}, conversationRef);
  }, [
    addMessage,
    modelContextRef,
    recordTrackingEvent,
    setThinkingSourceEventType,
    setThinkingStatus,
    updateMessage,
  ]);

  const handleStreamingResponse = useCallback((event: StreamingResponseEvent, conversationRef: string | null) => {
    setIsSending(false, conversationRef);
    const modelContext = modelContextRef.current;
    const modelMetadata = {
      modelId: modelContext.modelId,
      modelProvider: modelContext.modelProvider,
    };

    const action = resolveStreamingResponseAction(
      useChatStore.getState().getWorkspaceState(conversationRef).messages,
      event.payload?.text,
      event.turn_ref,
    );
    if (action.type === 'append') {
      updateMessage(action.messageId, {
        text: action.nextText,
        type: 'llm-text',
        sourceEventType: 'streaming-response',
        sourceChannel: 'from-backend',
        ...modelMetadata,
      }, conversationRef);
    } else {
      const newMessage: ChatMessage = {
        id: crypto.randomUUID(),
        text: action.text,
        sender: 'assistant',
        isComplete: false,
        type: 'llm-text',
        sourceEventType: 'streaming-response',
        sourceChannel: 'from-backend',
        turnRef: action.turnRef,
        ...modelMetadata,
      };
      addMessage(newMessage, conversationRef);
    }

    recordTrackingEvent('streaming-response', event.turn_ref, {
      phase: 'streaming',
      chunkSize: (event.payload?.text || '').length,
    }, conversationRef);
  }, [
    addMessage,
    modelContextRef,
    recordTrackingEvent,
    setIsSending,
    updateMessage,
  ]);

  return {
    handleLlmThought,
    handleStreamingResponse,
  };
};
