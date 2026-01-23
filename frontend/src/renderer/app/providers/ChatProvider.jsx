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

  // No need to subscribe to store here - components can subscribe directly
  // This avoids double subscriptions and improves performance
  return (
    <ChatContext.Provider value={null}>
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
