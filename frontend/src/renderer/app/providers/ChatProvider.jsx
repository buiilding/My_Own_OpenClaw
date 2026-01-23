import React, { createContext, useContext } from 'react';
import { useChatStream } from '../../features/chat/hooks/useChatStream';
import { useToolRunner } from '../../features/chat/hooks/useToolRunner';
import { useChatStore } from '../../features/chat/stores/chatStore';

const ChatContext = createContext();

/**
 * ChatProvider - Thin wrapper that sets up chat hooks and provides store access.
 * No business logic - just composition.
 */
export function ChatProvider({ children }) {
  // Set up streaming and tool execution hooks
  useChatStream();
  useToolRunner();

  // Get store values
  const messages = useChatStore((state) => state.messages);
  const isSending = useChatStore((state) => state.isSending);
  const thinkingStatus = useChatStore((state) => state.thinkingStatus);
  const tokenCounts = useChatStore((state) => state.tokenCounts);

  const value = {
    messages,
    isSending,
    thinkingStatus,
    tokenCounts,
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
}

export const useChatContext = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChatContext must be used within a ChatProvider');
  }
  return context;
};
