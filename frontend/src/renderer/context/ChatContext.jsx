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
  
  // Track hidden tool calls (e.g. background screenshots) to avoid UI updates
  const hiddenToolCalls = useRef(new Set());
  
  // Bundling state (minimal - only during bundle execution)
  const isBundling = useRef(false);
  const toolBundle = useRef([]);
  const bundleCorrelationId = useRef(null);

  // Audio player for TTS
  const { enqueueAudio, stopPlayback } = useAudioPlayer();

  const streamingHandlers = useStreamingMessages(setMessages, setIsSending, setThinkingStatus);

  // Stateless tool execution (for individual tools)
  const executeTool = useCallback(async (toolName, args, correlationId, skipAutoCapture = false) => {
    try {
      const result = await window.ipc.invoke('execute-tool', {
        toolName,
        args,
        skipAutoCapture
      });
      
      // Send result immediately to backend
      window.ipc.send('to-backend', {
        type: 'tool-result',
        payload: {
          correlation_id: correlationId,
          success: result.success,
          data: result.data,
          error: result.error,
        }
      });
      
      return result;
    } catch (error) {
      console.error(`[ChatContext] Tool execution failed: ${error.message}`);
      // Send error result to backend
      window.ipc.send('to-backend', {
        type: 'tool-result',
        payload: {
          correlation_id: correlationId,
          success: false,
          error: error.message,
        }
      });
      throw error;
    }
  }, []);

  // Execute a bundle of tools sequentially
  const executeToolBundle = useCallback(async (bundle, correlationId) => {
    const results = [];
    console.log('[ChatContext] Executing bundle of size:', bundle.length);
    console.log('[ChatContext] Bundle correlation ID:', correlationId);
    
    try {
      // Execute all tools sequentially with skipAutoCapture
      for (let i = 0; i < bundle.length; i++) {
        const tool = bundle[i];
        
        try {
          console.log(`[ChatContext] Executing bundled tool ${i+1}/${bundle.length}: ${tool.toolName}`);
          
          // Execute tool with skipAutoCapture (no system state, no screenshot)
          const result = await window.ipc.invoke('execute-tool', {
            toolName: tool.toolName,
            args: tool.args,
            skipAutoCapture: true
          });
          
          results.push({
            tool_name: tool.toolName,
            correlation_id: tool.correlationId,
            success: result.success,
            data: result.data,
            error: result.error
          });
        } catch (err) {
          console.error('[ChatContext] Bundle tool execution failed:', err);
          results.push({
            tool_name: tool.toolName,
            correlation_id: tool.correlationId,
            success: false,
            error: err.message
          });
        }
      }
      
      // Check if any tool in bundle is a computer-use tool
      const hasComputerUseTool = bundle.some(tool => {
        const computerUseTools = ['mouse_control', 'keyboard_control', 'scroll_control', 'screenshot'];
        return computerUseTools.includes(tool.toolName);
      });
      
      // Get system state and screenshot ONCE at bundle end
      let systemState = null;
      let screenshot = null;
      
      if (hasComputerUseTool) {
        console.log('[ChatContext] Getting system state and screenshot (computer-use tool detected)...');
        await new Promise(r => setTimeout(r, 2000)); // 2s delay for UI to update
        
        try {
          // Get system state and screenshot in parallel
          const [stateResult, screenshotResult] = await Promise.all([
            window.ipc.invoke('get-system-state'),
            window.ipc.invoke('execute-tool', {
              toolName: 'screenshot',
              args: {
                explanation: 'Bundle end screenshot',
                expectation: 'State after bundle'
              },
              skipAutoCapture: false // Don't skip for final screenshot
            })
          ]);
          
          systemState = stateResult;
          screenshot = screenshotResult.success ? screenshotResult.data?.screenshot : null;
        } catch (err) {
          console.error('[ChatContext] Failed to get system state/screenshot:', err);
        }
      } else {
        console.log('[ChatContext] Skipping system state/screenshot (no computer-use tools in bundle)');
      }
      
      // Send bundled result (ONLY ONCE)
      console.log('[ChatContext] Sending bundled result');
      window.ipc.send('to-backend', {
        type: 'tool-result',
        payload: {
          correlation_id: correlationId,
          success: true,
          data: {
            bundled: true,
            tools: results,
            system_state: systemState,
            screenshot: screenshot
          }
        }
      });
    } catch (error) {
      console.error('[ChatContext] Bundle execution failed:', error);
      // Send error result
      window.ipc.send('to-backend', {
        type: 'tool-result',
        payload: {
          correlation_id: correlationId,
          success: false,
          error: error.message
        }
      });
    }
  }, []);

  // No event listeners needed - using stateless request/response pattern

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
        case 'bundle_start':
          console.log('[ChatContext] Bundle start received - entering bundle mode');
          isBundling.current = true;
          toolBundle.current = [];
          bundleCorrelationId.current = data.payload?.correlation_id || `bundle-${crypto.randomUUID()}`;
          break;
        case 'bundle_end':
          console.log('[ChatContext] Bundle end received - executing bundle with', toolBundle.current.length, 'tools');
          isBundling.current = false;
          const bundleToExecute = [...toolBundle.current]; // Copy array before clearing
          const correlationId = bundleCorrelationId.current;
          toolBundle.current = [];
          bundleCorrelationId.current = null;
          executeToolBundle(bundleToExecute, correlationId);
          break;
        case 'tool-call':
          streamingHandlers.handleToolCall(data);
          // Execute tool on frontend when tool-call is received
          if (data.payload && data.payload.tool_name && data.payload.parameters) {
            const correlationId = data.payload.correlation_id || data.payload.request_id || data.id || crypto.randomUUID();
            
            if (isBundling.current) {
                // Add to bundle
                console.log('[ChatContext] Adding tool to bundle:', data.payload.tool_name);
                toolBundle.current.push({
                    toolName: data.payload.tool_name,
                    args: data.payload.parameters,
                    correlationId: correlationId
                });
            } else {
                // Execute immediately (stateless)
                executeTool(
                  data.payload.tool_name,
                  data.payload.parameters,
                  correlationId,
                  false // Don't skip auto-capture for individual tools
                ).catch(err => {
                  console.error('[ChatContext] Failed to execute tool:', err);
                });
            }
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
           if (data.payload && data.payload.correlation_id) {
               const correlationId = data.payload.correlation_id;
               console.log('[ChatContext] Received hidden screenshot request:', correlationId);
               
               // Mark as hidden
               hiddenToolCalls.current.add(correlationId);
               
               // Execute screenshot tool (stateless)
               window.ipc.invoke('execute-tool', {
                   toolName: 'screenshot',
                   args: { 
                       explanation: 'Background screenshot for coordinate calculation', 
                       expectation: 'Current screen state' 
                   },
                   skipAutoCapture: false
               }).then(result => {
                   // Send result to backend
                   window.ipc.send('to-backend', {
                       type: 'tool-result',
                       payload: {
                           correlation_id: correlationId,
                           success: result.success,
                           data: result.data,
                           error: result.error,
                       }
                   });
                   hiddenToolCalls.current.delete(correlationId);
               }).catch(err => {
                   console.error('[ChatContext] Failed to execute hidden screenshot:', err);
                   window.ipc.send('to-backend', {
                       type: 'tool-result',
                       payload: {
                           correlation_id: correlationId,
                           success: false,
                           error: err.message,
                       }
                   });
                   hiddenToolCalls.current.delete(correlationId);
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
  }, [streamingHandlers, enqueueAudio, executeToolBundle, executeTool]);

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
