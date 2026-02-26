import { useCallback } from 'react';
import {
  useChatStore,
  type ChatMessage,
} from '../stores/chatStore';
import {
  findFirstMessageIdBySender,
  findLastAssistantLlmTextMessageId,
  findLastMessageIdBySender,
} from '../utils/chatStreamMessageUpdates';

export function useStreamMessageUpdaters(
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void,
) {
  const updateLastMessageBySender = useCallback((
    sender: ChatMessage['sender'],
    updates: Partial<ChatMessage>,
    turnRef?: string,
  ) => {
    const scopedMessageId = findLastMessageIdBySender(
      useChatStore.getState().messages,
      sender,
      turnRef,
    );
    const fallbackMessageId = turnRef
      ? findLastMessageIdBySender(
        useChatStore.getState().messages,
        sender,
      )
      : null;
    const messageId = scopedMessageId || fallbackMessageId;
    if (messageId) {
      updateMessage(messageId, updates);
    }
  }, [updateMessage]);

  const updateFirstMessageBySender = useCallback((
    sender: ChatMessage['sender'],
    updates: Partial<ChatMessage>,
  ) => {
    const messageId = findFirstMessageIdBySender(useChatStore.getState().messages, sender);
    if (messageId) {
      updateMessage(messageId, updates);
    }
  }, [updateMessage]);

  const updateLastAssistantLlmTextMessage = useCallback((
    updates: Partial<ChatMessage>,
    turnRef?: string,
  ) => {
    const messageId = findLastAssistantLlmTextMessageId(
      useChatStore.getState().messages,
      turnRef,
    );
    if (messageId) {
      updateMessage(messageId, updates);
    }
  }, [updateMessage]);

  return {
    updateLastMessageBySender,
    updateFirstMessageBySender,
    updateLastAssistantLlmTextMessage,
  };
}
