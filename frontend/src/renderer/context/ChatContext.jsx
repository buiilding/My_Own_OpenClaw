import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ApiClient } from '../api/client';
import { useStreamingMessages } from '../hooks/useStreamingMessages';
import { useAudioPlayer } from '../hooks/useAudioPlayer';

const ChatContext = createContext();

export function ChatProvider({ children }) {
  const [messages, setMessages] = useState([{
    id: crypto.randomUUID(),
    text: 'Hello! How can I help you today?',
    sender: 'assistant',
  }]);
  const [isSending, setIsSending] = useState(false);
  const [thinkingStatus, setThinkingStatus] = useState(null);
  
  // Audio player for TTS
  const { enqueueAudio, stopPlayback } = useAudioPlayer();

  const streamingHandlers = useStreamingMessages(setMessages, setIsSending, setThinkingStatus);

  // Listen for chat-related backend events
  useEffect(() => {
    const removeListener = window.ipc.on('from-backend', (data) => {
      switch (data.type) {
        case 'pong':
        case 'response':
          streamingHandlers.handlePongResponse(data);
          break;
        case 'llm-thought':
          streamingHandlers.handleLlmThought(data);
          break;
        case 'streaming-response':
          streamingHandlers.handleStreamingResponse(data);
          break;
        case 'streaming-complete':
          streamingHandlers.handleStreamingComplete();
          break;
        case 'tool-call':
          streamingHandlers.handleToolCall(data);
          break;
        case 'tool-output':
          streamingHandlers.handleToolOutput(data);
          break;
        case 'wakeword-activated':
           // Handle wakeword activation logging
           console.log('[MessageHandling] Wakeword activated:', data.payload);
           break;
        case 'wakeword-greeting':
           // Handle greeting
           const greetingText = data.payload?.text || "Hello! I'm listening.";
           setMessages((prev) => [
             ...prev,
             {
               id: crypto.randomUUID(),
               text: greetingText,
               sender: 'assistant',
               timestamp: new Date().toISOString()
             }
           ]);
           break;
        case 'audio-chunk':
           enqueueAudio(data.payload);
           break;
        case 'error':
           // General errors or streaming errors
           // Filter out settings errors which are handled by AppContext
           if (!data.payload.message?.includes('Failed to update settings')) {
              streamingHandlers.handleError(data);
           }
           break;
        default:
          break;
      }
    });
    return removeListener;
  }, [streamingHandlers, enqueueAudio]);

  const sendMessage = useCallback((text) => {
    stopPlayback();
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), text, sender: 'user' }]);
    setIsSending(true);
    setThinkingStatus(null);
    ApiClient.sendQuery(text);
  }, [stopPlayback]);

  const value = {
    messages,
    isSending,
    thinkingStatus,
    sendMessage,
    stopPlayback
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

