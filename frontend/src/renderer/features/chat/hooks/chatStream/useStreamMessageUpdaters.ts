/**
 * Provides the use stream message updaters module for the renderer UI.
 */

import { useCallback } from 'react';
import type {
  ChatMessage,
} from '../../stores/chatStore';

type UpdateStreamTargetMessage = (
  target: {
    kind: 'last_by_sender';
    sender: ChatMessage['sender'];
    turnRef?: string | null;
  } | {
    kind: 'last_assistant_llm_text';
    turnRef?: string | null;
  },
  updates: Partial<ChatMessage>,
  conversationRef?: string | null,
) => void;

export function useStreamMessageUpdaters(
  updateStreamTargetMessage: UpdateStreamTargetMessage,
) {
  const updateLastMessageBySender = useCallback((
    sender: ChatMessage['sender'],
    updates: Partial<ChatMessage>,
    turnRef?: string,
    conversationRef?: string | null,
  ) => {
    updateStreamTargetMessage({
      kind: 'last_by_sender',
      sender,
      turnRef,
    }, updates, conversationRef);
  }, [updateStreamTargetMessage]);

  const updateLastAssistantLlmTextMessage = useCallback((
    updates: Partial<ChatMessage>,
    turnRef?: string,
    conversationRef?: string | null,
  ) => {
    updateStreamTargetMessage({
      kind: 'last_assistant_llm_text',
      turnRef,
    }, updates, conversationRef);
  }, [updateStreamTargetMessage]);

  return {
    updateLastMessageBySender,
    updateLastAssistantLlmTextMessage,
  };
}
