/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext } from 'react';

const EMPTY_CHAT_CONTEXT = Object.freeze({});
const ChatContext = createContext(undefined);

export function useChatContext() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChatContext must be used within a ChatProvider');
  }
  return context;
}

export { ChatContext, EMPTY_CHAT_CONTEXT };
