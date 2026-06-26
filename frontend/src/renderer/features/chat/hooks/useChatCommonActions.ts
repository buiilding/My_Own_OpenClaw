/**
 * Provides the use chat common actions module for the renderer UI.
 */

import {
  addMessageToChatStore,
  setIsSendingInChatStore,
  setThinkingSourceEventTypeInChatStore,
  setThinkingStatusInChatStore,
  updateStreamTargetMessageInChatStore,
} from '../stores/chatStoreAdapters';

export function useChatCommonActions() {
  return {
    addMessage: addMessageToChatStore,
    updateStreamTargetMessage: updateStreamTargetMessageInChatStore,
    setIsSending: setIsSendingInChatStore,
    setThinkingStatus: setThinkingStatusInChatStore,
    setThinkingSourceEventType: setThinkingSourceEventTypeInChatStore,
  };
}
