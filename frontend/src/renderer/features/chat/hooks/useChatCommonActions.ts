/**
 * Provides the use chat common actions module for the renderer UI.
 */

import { useChatStore } from '../stores/chatStore';

export function useChatCommonActions() {
  const addMessage = useChatStore((state) => state.addMessage);
  const updateStreamTargetMessage = useChatStore((state) => state.updateStreamTargetMessage);
  const setIsSending = useChatStore((state) => state.setIsSending);
  const setThinkingStatus = useChatStore((state) => state.setThinkingStatus);
  const setThinkingSourceEventType = useChatStore((state) => state.setThinkingSourceEventType);

  return {
    addMessage,
    updateStreamTargetMessage,
    setIsSending,
    setThinkingStatus,
    setThinkingSourceEventType,
  };
}
