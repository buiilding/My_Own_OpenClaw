/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext } from 'react';

const ChatContext = createContext();

export function useChatContext() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChatContext must be used within a ChatProvider');
  }
  return context;
}

export { ChatContext };
