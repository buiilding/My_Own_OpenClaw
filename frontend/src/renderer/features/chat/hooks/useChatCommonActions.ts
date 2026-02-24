import { useChatStore } from '../stores/chatStore';

export function useChatCommonActions() {
  const addMessage = useChatStore((state) => state.addMessage);
  const updateMessage = useChatStore((state) => state.updateMessage);
  const setIsSending = useChatStore((state) => state.setIsSending);
  const setThinkingStatus = useChatStore((state) => state.setThinkingStatus);

  return {
    addMessage,
    updateMessage,
    setIsSending,
    setThinkingStatus,
  };
}
