import { useCallback } from 'react';
import { useChatStore, type ChatMessage } from '../../stores/chatStore';
import type { ConversationEvent } from '../../../../infrastructure/api/windieSdkClient';
import { buildThinkingStatus } from '../../utils/chatStream/chatStreamFormatting';
import {
  findLastAssistantLlmTextMessageId,
  resolveStreamingResponseAction,
} from '../../utils/chatStream/chatStreamMessageUpdates';
import { GENERIC_THINKING_STATUS } from '../../utils/chatStream/chatStreamThinkingStatus';
import type { TranscriptModelContext } from '../../utils/chatStream/chatStreamTypes';
import { buildAssistantTextChatMessageState } from '../../../../infrastructure/transcript/assistantTextChatMessageState';

type UseChatStreamTextHandlersOptions = {
  addMessage: (message: ChatMessage, conversationRef?: string | null) => void;
  updateMessage: (messageId: string, updates: Partial<ChatMessage>, conversationRef?: string | null) => void;
  setIsSending: (isSending: boolean, conversationRef?: string | null) => void;
  setThinkingStatus: (status: string | null, conversationRef?: string | null) => void;
  setThinkingSourceEventType: (eventType: string | null, conversationRef?: string | null) => void;
  modelContextRef: { current: TranscriptModelContext };
  renderLiveMessages?: boolean | ((event: ConversationEvent, conversationRef?: string | null) => boolean);
  recordTrackingEvent: (
    eventType: 'llm-thought' | 'streaming-response',
    turnRef: string | null | undefined,
    options: Record<string, unknown>,
    conversationRef?: string | null,
  ) => void;
};

function shouldRenderLiveMessage(
  option: UseChatStreamTextHandlersOptions['renderLiveMessages'],
  event: ConversationEvent,
  conversationRef?: string | null,
): boolean {
  return typeof option === 'function' ? option(event, conversationRef) : option !== false;
}

export const useChatStreamTextHandlers = ({
  addMessage,
  updateMessage,
  setIsSending,
  setThinkingStatus,
  setThinkingSourceEventType,
  modelContextRef,
  renderLiveMessages = true,
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

    if (!shouldRenderLiveMessage(renderLiveMessages, event, conversationRef)) {
      recordTrackingEvent('llm-thought', event.turnRef, {}, conversationRef);
      return;
    }

    const modelContext = modelContextRef.current;
    const modelMetadata = {
      modelId: modelContext.modelId,
      modelProvider: modelContext.modelProvider,
    };
    const turnRef = event.turnRef || undefined;
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
      const placeholderAssistantMessage: ChatMessage = buildAssistantTextChatMessageState({
        text: '',
        isComplete: false,
        sourceEventType: 'streaming-response',
        sourceChannel: 'from-backend',
        turnRef,
        modelId: modelContext.modelId,
        modelProvider: modelContext.modelProvider,
        thinkingText: nextThinkingStatus,
        thinkingSourceEventType: 'llm-thought',
      }) as ChatMessage;
      addMessage(placeholderAssistantMessage, conversationRef);
    }

    recordTrackingEvent('llm-thought', event.turnRef, {}, conversationRef);
  }, [
    addMessage,
    modelContextRef,
    recordTrackingEvent,
    renderLiveMessages,
    setThinkingSourceEventType,
    setThinkingStatus,
    updateMessage,
  ]);

  const handleAssistantDelta = useCallback((event: ConversationEvent, conversationRef: string | null) => {
    setIsSending(false, conversationRef);
    if (!shouldRenderLiveMessage(renderLiveMessages, event, conversationRef)) {
      recordTrackingEvent('streaming-response', event.turnRef, {
        phase: 'streaming',
        chunkSize: (typeof event.payload?.text === 'string' ? event.payload.text : '').length,
      }, conversationRef);
      return;
    }
    const modelContext = modelContextRef.current;
    const modelMetadata = {
      modelId: modelContext.modelId,
      modelProvider: modelContext.modelProvider,
    };

    const action = resolveStreamingResponseAction(
      useChatStore.getState().getWorkspaceState(conversationRef).messages,
      typeof event.payload?.text === 'string' ? event.payload.text : '',
      event.turnRef,
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
      const newMessage: ChatMessage = buildAssistantTextChatMessageState({
        text: action.text,
        isComplete: false,
        sourceEventType: 'streaming-response',
        sourceChannel: 'from-backend',
        turnRef: action.turnRef,
        modelId: modelContext.modelId,
        modelProvider: modelContext.modelProvider,
      }) as ChatMessage;
      addMessage(newMessage, conversationRef);
    }

    recordTrackingEvent('streaming-response', event.turnRef, {
      phase: 'streaming',
      chunkSize: (typeof event.payload?.text === 'string' ? event.payload.text : '').length,
    }, conversationRef);
  }, [
    addMessage,
    modelContextRef,
    recordTrackingEvent,
    renderLiveMessages,
    setIsSending,
    updateMessage,
  ]);

  return {
    handleLlmThought,
    handleAssistantDelta,
  };
};
