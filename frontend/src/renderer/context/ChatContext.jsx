import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
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
  const [tokenCounts, setTokenCounts] = useState(null);
  
  // Track pending tool calls to map results back to tool names
  const pendingToolCalls = useRef({});
  // Track hidden tool calls (e.g. background screenshots) to avoid UI updates
  const hiddenToolCalls = useRef(new Set());
  
  // Audio player for TTS
  const { enqueueAudio, stopPlayback } = useAudioPlayer();

  const streamingHandlers = useStreamingMessages(setMessages, setIsSending, setThinkingStatus);

  // Listen for tool results from Python sidecar
  useEffect(() => {
    const removeToolResultListener = window.ipc.on('tool-result', async (message) => {
      console.log('[ChatContext] Received tool-result:', message);
      
      // Filter out internal service messages that might have leaked through
      if (message.id === 'system' || message.id === 'init' || (message.id && (message.id.startsWith('state-') || message.id.startsWith('memory-')))) {
        console.log('[ChatContext] Ignoring internal tool result:', message.id);
        return;
      }
      
      // Handle tool-result if it's a hidden tool call (e.g. background screenshot)
      if (hiddenToolCalls.current.has(message.id)) {
        console.log('[ChatContext] Processing hidden tool result:', message.id);
        hiddenToolCalls.current.delete(message.id);
        
        // Only send to backend, don't update UI or pending calls
        const toolResult = {
          type: 'tool-result',
          payload: {
            request_id: message.id,
            success: message.payload?.success || false,
            data: message.payload?.data,
            error: message.payload?.error,
          }
        };
        window.ipc.send('to-backend', toolResult);
        return;
      }

      // When frontend tool execution completes:
      // 1. Send result back to backend
      if (message.type === 'response' && message.payload) {
        
        // Get tool name from pending calls
        const toolName = pendingToolCalls.current[message.id] || 'unknown';
        
        // Cleanup pending call
        if (pendingToolCalls.current[message.id]) {
            delete pendingToolCalls.current[message.id];
        }

        // Send to backend
        const toolResult = {
          type: 'tool-result',
          payload: {
            request_id: message.id,
            success: message.payload.success,
            data: message.payload.data,
            error: message.payload.error,
          }
        };
        window.ipc.send('to-backend', toolResult);
      }
    });

    const removeToolErrorListener = window.ipc.on('tool-error', (message) => {
      console.error('[ChatContext] Received tool-error:', message);
      
      // Handle hidden tool error
      if (hiddenToolCalls.current.has(message.id)) {
          console.log('[ChatContext] Processing hidden tool error:', message.id);
          hiddenToolCalls.current.delete(message.id);
          
          const toolResult = {
              type: 'tool-result',
              payload: {
                  request_id: message.id,
                  success: false,
                  error: message.payload?.error || 'Unknown error during hidden tool execution',
              }
          };
          window.ipc.send('to-backend', toolResult);
          return;
      }

      // Handle tool error locally
      streamingHandlers.handleError({
        payload: {
          message: `Tool execution failed: ${message.payload?.error || 'Unknown error'}`
        }
      });
      
      // Cleanup pending call
      if (pendingToolCalls.current[message.id]) {
          delete pendingToolCalls.current[message.id];
      }
    });

    return () => {
      removeToolResultListener();
      removeToolErrorListener();
    };
  }, []);

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
          // Execute tool on frontend when tool-call is received
          if (data.payload && data.payload.tool_name && data.payload.parameters) {
            // Use request_id from payload if available (for remote tools), otherwise use event id
            const requestId = data.payload.request_id || data.id || crypto.randomUUID();
            
            // Track tool name for result handling
            pendingToolCalls.current[requestId] = data.payload.tool_name;
            
            // Execute tool via IPC to Python sidecar
            window.ipc.invoke('execute-tool', {
              toolName: data.payload.tool_name,
              args: data.payload.parameters,
              requestId: requestId
            }).then(result => {
                if (!result.success) {
                    console.error('[ChatContext] Failed to execute tool (runner returned failure):', result.error);
                    // Cleanup on error
                    delete pendingToolCalls.current[requestId];
                }
            }).catch(err => {
              console.error('[ChatContext] Failed to execute tool (IPC error):', err);
              // Cleanup on error
              delete pendingToolCalls.current[requestId];
            });
          }
          break;
        case 'tool-output':
          // Filter out placeholder messages for remote tools to avoid duplicates
          // The real output will be handled locally by the tool-result listener
          if (data.payload && data.payload.output && data.payload.output.includes('executing on frontend')) {
            console.log('[ChatContext] Skipping placeholder tool output:', data.payload.output);
            break;
          }
          streamingHandlers.handleToolOutput(data);
          break;
        case 'system-prompt':
          streamingHandlers.handleSystemPrompt(data);
          break;
        case 'user-message-full':
          streamingHandlers.handleUserMessageFull(data);
          break;
        case 'assistant-message-full':
          streamingHandlers.handleAssistantMessageFull(data);
          break;
        case 'token-count':
          setTokenCounts(data.payload);
          break;
        case 'tool-schemas':
          streamingHandlers.handleToolSchemas(data);
          break;
        case 'memory-store':
          // Handle memory storage request from backend
          if (data.payload) {
            const { user_query, assistant_response, memory_type, user_id, session_id } = data.payload;
            console.log('[ChatContext] Received memory store request:', memory_type);
            
            // Store memory via IPC to Python sidecar
            window.ipc.invoke('store-memory', {
              userQuery: user_query,
              assistantResponse: assistant_response,
              memoryType: memory_type,
              userId: user_id || 'default_user',
              sessionId: session_id || null
            }).catch(err => {
              console.error('[ChatContext] Failed to store memory:', err);
            });
          }
          break;
        case 'request-screenshot':
           // Handle hidden screenshot request from backend
           if (data.payload && data.payload.request_id) {
               const requestId = data.payload.request_id;
               console.log('[ChatContext] Received hidden screenshot request:', requestId);
               
               // Mark as hidden
               hiddenToolCalls.current.add(requestId);
               
               // Execute screenshot tool
               window.ipc.invoke('execute-tool', {
                   toolName: 'screenshot',
                   args: { 
                       explanation: 'Background screenshot for coordinate calculation', 
                       expectation: 'Current screen state' 
                   },
                   requestId: requestId
               }).catch(err => {
                   console.error('[ChatContext] Failed to execute hidden screenshot:', err);
                   hiddenToolCalls.current.delete(requestId);
               });
           }
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

  const sendMessage = useCallback(async (text) => {
    stopPlayback();
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), text, sender: 'user' }]);
    setIsSending(true);
    setThinkingStatus(null);
    await ApiClient.sendQuery(text);
  }, [stopPlayback]);

  const value = {
    messages,
    isSending,
    thinkingStatus,
    tokenCounts,
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

