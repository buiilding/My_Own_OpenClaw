/**
 * Provides the use stream message updaters module for the renderer UI.
 */

import { useCallback } from 'react';
import {
  useChatStore,
  type ChatMessage,
} from '../../stores/chatStore';
import {
  findFirstMessageIdBySender,
  findLastAssistantLlmTextMessageId,
  findLastMessageIdBySender,
} from '../../../../app/runtime/desktopChatStreamMessageUpdateRuntime';

export function useStreamMessageUpdaters(
  updateMessage: (
    id: string,
    updates: Partial<ChatMessage>,
    conversationRef?: string | null,
  ) => void,
) {
  const updateLastMessageBySender = useCallback((
    sender: ChatMessage['sender'],
    updates: Partial<ChatMessage>,
    turnRef?: string,
    conversationRef?: string | null,
  ) => {
    const workspaceMessages = useChatStore.getState().getWorkspaceState(conversationRef).messages;
    const scopedMessageId = findLastMessageIdBySender(
      workspaceMessages,
      sender,
      turnRef,
    );
    if (scopedMessageId) {
      updateMessage(scopedMessageId, updates, conversationRef);
    }
  }, [updateMessage]);

  const updateFirstMessageBySender = useCallback((
    sender: ChatMessage['sender'],
    updates: Partial<ChatMessage>,
    conversationRef?: string | null,
  ) => {
    const messageId = findFirstMessageIdBySender(
      useChatStore.getState().getWorkspaceState(conversationRef).messages,
      sender,
    );
    if (messageId) {
      updateMessage(messageId, updates, conversationRef);
    }
  }, [updateMessage]);

  const updateLastAssistantLlmTextMessage = useCallback((
    updates: Partial<ChatMessage>,
    turnRef?: string,
    conversationRef?: string | null,
  ) => {
    const messageId = findLastAssistantLlmTextMessageId(
      useChatStore.getState().getWorkspaceState(conversationRef).messages,
      turnRef,
    );
    if (messageId) {
      updateMessage(messageId, updates, conversationRef);
    }
  }, [updateMessage]);

  return {
    updateLastMessageBySender,
    updateFirstMessageBySender,
    updateLastAssistantLlmTextMessage,
  };
}
