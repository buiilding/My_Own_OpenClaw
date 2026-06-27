/**
 * Provides the use stream message updaters module for the renderer UI.
 */

import { useCallback } from 'react';
import type {
  ChatMessage,
} from '../../../../app/runtime/desktopChatMessageTypes';
import {
  DesktopChatStreamMessageUpdateRuntime,
} from '../../../../app/runtime/desktopChatStreamMessageUpdateRuntime';

const {
  buildLastAssistantLlmTextStreamTarget,
  buildLastBySenderStreamTarget,
} = DesktopChatStreamMessageUpdateRuntime;

type StreamEventIdentity = Parameters<typeof buildLastBySenderStreamTarget>[1];

type UpdateStreamTargetMessage = (
  target: ReturnType<typeof buildLastBySenderStreamTarget>
    | ReturnType<typeof buildLastAssistantLlmTextStreamTarget>,
  updates: Partial<ChatMessage>,
  conversationRef?: string | null,
) => void;

export function useStreamMessageUpdaters(
  updateStreamTargetMessage: UpdateStreamTargetMessage,
) {
  const updateLastMessageBySender = useCallback((
    sender: ChatMessage['sender'],
    updates: Partial<ChatMessage>,
    eventIdentity?: StreamEventIdentity | null,
    conversationRef?: string | null,
  ) => {
    updateStreamTargetMessage(
      buildLastBySenderStreamTarget(sender, eventIdentity),
      updates,
      conversationRef,
    );
  }, [updateStreamTargetMessage]);

  const updateLastAssistantLlmTextMessage = useCallback((
    updates: Partial<ChatMessage>,
    eventIdentity?: StreamEventIdentity | null,
    conversationRef?: string | null,
  ) => {
    updateStreamTargetMessage(
      buildLastAssistantLlmTextStreamTarget(eventIdentity),
      updates,
      conversationRef,
    );
  }, [updateStreamTargetMessage]);

  return {
    updateLastMessageBySender,
    updateLastAssistantLlmTextMessage,
  };
}
