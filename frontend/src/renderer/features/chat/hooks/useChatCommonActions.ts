/**
 * Provides the use chat common actions module for the renderer UI.
 */

import {
  setIsSendingInChatStore,
  setThinkingSourceEventTypeInChatStore,
  setThinkingStatusInChatStore,
  useChatStore,
} from '../stores/chatStore';

export function useChatCommonActions() {
  const addMessage = useChatStore((state) => state.addMessage);
  const updateStreamTargetMessage = useChatStore((state) => state.updateStreamTargetMessage);

  return {
    addMessage,
    updateStreamTargetMessage,
    setIsSending: setIsSendingInChatStore,
    setThinkingStatus: setThinkingStatusInChatStore,
    setThinkingSourceEventType: setThinkingSourceEventTypeInChatStore,
  };
}
