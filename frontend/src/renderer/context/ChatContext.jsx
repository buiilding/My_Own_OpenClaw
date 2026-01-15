import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { ApiClient } from '../api/client';
import { useStreamingMessages } from '../hooks/useStreamingMessages';
import { useAudioPlayer } from '../hooks/useAudioPlayer';

const ChatContext = createContext();

/**
 * Format system state as sequential XML (minimal) for tool output
 */
function formatSequentialStateXml(state) {
  if (!state) {
    const fallbackTime = new Date().toISOString();
    return `<system_context>
    <os_state>
        <active_window>Unknown</active_window>
        <mouse_position>Unknown</mouse_position>
        <time>${fallbackTime}</time>
        <clipboard_preview><empty></clipboard_preview>
    </os_state>
</system_context>`;
  }
  
  return `<system_context>
    <os_state>
        <active_window>${state.active_window || 'Unknown'}</active_window>
        <mouse_position>${state.mouse_position || 'Unknown'}</mouse_position>
        <time>${state.time || new Date().toISOString()}</time>
        <clipboard_preview>${state.clipboard || '<empty>'}</clipboard_preview>
    </os_state>
</system_context>`;
}

/**
 * Format complete tool output message with system context XML for backend history
 */
function formatToolOutputMessage(toolName, result, systemState) {
  const parts = [`${toolName} output:`];
  
  if (result.success) {
    // Extract content from result
    let content = 'No output';
    if (result.data) {
      if (typeof result.data === 'string') {
        content = result.data;
      } else if (result.data.llm_content) {
        content = result.data.llm_content;
      } else if (result.data.output) {
        content = result.data.output;
      } else if (result.data.message) {
        content = result.data.message;
      } else if (result.data.result) {
        content = result.data.result;
      } else {
        // Exclude screenshot from text content
        const { screenshot, system_state, ...textData } = result.data;
        if (Object.keys(textData).length > 0) {
          content = JSON.stringify(textData, null, 2);
        }
      }
    }
    parts.push(content);
    parts.push('status: successful');
  } else {
    parts.push(`error: ${result.error || 'Unknown error'}`);
    parts.push('status: failed');
  }
  
  // Add system context XML
  const systemContextXml = formatSequentialStateXml(systemState);
  parts.push(systemContextXml);
  
  // Add screenshot indicator if screenshot is present
  if (result.data?.screenshot) {
    parts.push(`State of the screen after ${toolName} was executed:`);
  }
  
  return parts.join('\n');
}

/**
 * Format combined bundled tool output message with system context XML
 * Combines multiple tool outputs into a single message
 */
function formatBundledToolOutputMessage(tools, systemState, screenshot) {
  const parts = ['Bundled tool execution output:'];
  
  // Add each tool's output
  for (const tool of tools) {
    const toolName = tool.tool_name || 'unknown';
    const toolResult = tool._rawResult || { success: tool.success, error: tool.error, data: tool.data };
    
    parts.push(`\n${toolName} output:`);
    
    if (toolResult.success) {
      // Extract content from result (matching formatToolOutputMessage logic)
      let content = 'No output';
      if (toolResult.data) {
        if (typeof toolResult.data === 'string') {
          content = toolResult.data;
        } else if (toolResult.data.llm_content) {
          content = toolResult.data.llm_content;
        } else if (toolResult.data.message) {
          content = toolResult.data.message;
        } else if (toolResult.data.output) {
          content = toolResult.data.output;
        } else if (toolResult.data.result) {
          content = toolResult.data.result;
        } else {
          // Exclude screenshot from text content
          const { screenshot: _, system_state: __, ...textData } = toolResult.data;
          if (Object.keys(textData).length > 0) {
            content = JSON.stringify(textData, null, 2);
          }
        }
      }
      parts.push(content);
      parts.push('status: successful');
    } else {
      parts.push(`error: ${toolResult.error || 'Unknown error'}`);
      parts.push('status: failed');
    }
  }
  
  // Add single system context XML (shared across all tools in bundle)
  const systemContextXml = formatSequentialStateXml(systemState);
  parts.push('\n' + systemContextXml);
  
  // Add screenshot indicator if screenshot is present
  if (screenshot) {
    parts.push('\nState of the screen after bundled tools were executed:');
  }
  
  return parts.join('\n');
}

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

  // Helper function to display tool result immediately in UI
  // Uses pre-formatted llm_content (includes system context XML)
  const displayToolResult = useCallback((toolName, result, correlationId, executionTime = null, formattedMessage = null) => {
    // Skip display for hidden tool calls (e.g., background screenshots)
    if (hiddenToolCalls.current.has(correlationId)) {
      return;
    }

    // Use formatted message if provided, otherwise extract from result
    let outputText = formattedMessage;
    if (!outputText) {
      // Fallback: extract from result.data.llm_content or other fields
      if (result.data?.llm_content) {
        outputText = result.data.llm_content;
      } else if (result.error) {
        outputText = `Error: ${result.error}`;
      } else if (result.data) {
        // Try different common output field names
        if (typeof result.data === 'string') {
          outputText = result.data;
        } else if (result.data.output) {
          outputText = result.data.output;
        } else if (result.data.result) {
          outputText = result.data.result;
        } else if (result.data.message) {
          outputText = result.data.message;
        } else {
          // Fallback to JSON stringify for complex objects
          outputText = JSON.stringify(result.data, null, 2);
        }
      } else {
        outputText = 'No output';
      }
    }

    // Extract screenshot if available
    const screenshot = result.data?.screenshot || null;

    // Create tool output message
    const toolOutputMessage = {
      id: crypto.randomUUID(),
      text: outputText,
      sender: 'assistant',
      type: 'tool-output',
      screenshot: screenshot,
      toolMetadata: result.data?.metadata || null,
      toolName: toolName,
      executionTime: executionTime,
      success: result.success,
      correlationId: correlationId,
    };

    // Add to messages immediately
    setMessages((prevMessages) => [...prevMessages, toolOutputMessage]);
  }, [setMessages]);

  // Stateless tool execution (for individual tools)
  const executeTool = useCallback(async (toolName, args, correlationId, skipAutoCapture = false) => {
    const startTime = performance.now();
    const shortId = correlationId ? correlationId.substring(0, 15) : 'unknown';
    console.log(`[Timing] Tool execution started: ${toolName} (request_id=${shortId})`);
    try {
      const result = await window.ipc.invoke('execute-tool', {
        toolName,
        args,
        skipAutoCapture
      });
      
      const executionTime = (performance.now() - startTime) / 1000; // Convert to seconds
      const shortId = correlationId ? correlationId.substring(0, 15) : 'unknown';
      console.log(`[Timing] Tool execution completed: ${toolName} took ${executionTime.toFixed(3)}s (request_id=${shortId})`);
      
      // Format complete message with system context XML (used for both display and backend)
      const formattedMessage = formatToolOutputMessage(
        toolName,
        result,
        result.data?.system_state
      );
      
      // Display formatted message in UI (includes system context XML)
      displayToolResult(toolName, result, correlationId, executionTime, formattedMessage);
      
      // Send result to backend for history storage only
      const payloadData = {
        ...result.data,
        llm_content: formattedMessage,
        is_preformatted: true,
      };
      
      window.ipc.send('to-backend', {
        type: 'tool-result',
        payload: {
          request_id: correlationId,
          success: result.success,
          data: payloadData,
          error: result.error,
        }
      });
      
      return result;
    } catch (error) {
      const executionTime = (performance.now() - startTime) / 1000;
      console.error(`[ChatContext] Tool execution failed: ${error.message}`);
      
      // Format error message with system context XML (used for both display and backend)
      const errorFormattedMessage = formatToolOutputMessage(
        toolName,
        { success: false, error: error.message, data: null },
        null // No system state for errors
      );
      
      // Display formatted error message in UI (includes system context XML)
      displayToolResult(toolName, { success: false, error: error.message, data: null }, correlationId, executionTime, errorFormattedMessage);
      
      // Send error result to backend
      window.ipc.send('to-backend', {
        type: 'tool-result',
        payload: {
          request_id: correlationId,
          success: false,
          error: error.message,
          data: {
            llm_content: errorFormattedMessage,
            is_preformatted: true,
          },
        }
      });
      throw error;
    }
  }, [displayToolResult]);

  // Execute a bundle of tools sequentially
  const executeToolBundle = useCallback(async (bundle, correlationId) => {
    const bundleStartTime = performance.now();
    const results = [];
    console.log(`[Timing] Bundle execution started: ${bundle.length} tools (bundle_id=${correlationId})`);
    console.log('[ChatContext] Executing bundle of size:', bundle.length);
    console.log('[ChatContext] Bundle correlation ID:', correlationId);
    
    try {
      // Execute all tools sequentially with skipAutoCapture
      for (let i = 0; i < bundle.length; i++) {
        const tool = bundle[i];
        const toolStartTime = performance.now();
        
        try {
          console.log(`[ChatContext] Executing bundled tool ${i+1}/${bundle.length}: ${tool.toolName}`);
          
          // Execute tool with skipAutoCapture (no system state, no screenshot)
          const result = await window.ipc.invoke('execute-tool', {
            toolName: tool.toolName,
            args: tool.args,
            skipAutoCapture: true
          });
          
          const toolExecutionTime = (performance.now() - toolStartTime) / 1000;
          const shortId = tool.correlationId ? tool.correlationId.substring(0, 15) : 'unknown';
          console.log(`[Timing] Bundled tool execution: ${tool.toolName} took ${toolExecutionTime.toFixed(3)}s (request_id=${shortId})`);
          
          // Store raw result (will format with system_state at bundle end and display then)
          results.push({
            tool_name: tool.toolName,
            request_id: tool.correlationId,
            success: result.success,
            data: result.data,
            error: result.error,
            executionTime: toolExecutionTime,
            _rawResult: result // Store raw result for formatting later
          });

          // No delay needed here - the keyboard tool handles timing internally
          // The lock is released after typing completes, allowing the next operation to proceed
        } catch (err) {
          const toolExecutionTime = (performance.now() - toolStartTime) / 1000;
          console.error('[ChatContext] Bundle tool execution failed:', err);
          
          // Store raw error result (will format with system_state at bundle end and display then)
          results.push({
            tool_name: tool.toolName,
            request_id: tool.correlationId,
            success: false,
            error: err.message,
            executionTime: toolExecutionTime,
            _rawResult: { success: false, error: err.message, data: null }
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
      
      // Format combined bundled message for display and backend
      const combinedFormattedMessage = formatBundledToolOutputMessage(
        results.map(r => ({
          tool_name: r.tool_name,
          _rawResult: r._rawResult,
          success: r.success,
          error: r.error,
          data: r.data
        })),
        systemState,
        screenshot
      );
      
      // Display single combined output in UI
      const combinedResult = {
        success: results.every(r => r.success),
        error: results.find(r => r.error)?.error || null,
        data: {
          screenshot: screenshot,
          bundled: true,
          tool_count: results.length,
          tools: results.map(r => ({
            tool_name: r.tool_name,
            success: r.success,
            error: r.error
          }))
        }
      };
      
      displayToolResult(
        `bundled_tools (${results.length} tools)`,
        combinedResult,
        correlationId,
        (performance.now() - bundleStartTime) / 1000,
        combinedFormattedMessage
      );
      
      // Format individual tools for backend (still needed for orchestrator to match request_ids)
      const formattedTools = results.map(toolResult => {
        // Include bundle screenshot in tool result data if present
        const toolDataWithScreenshot = screenshot && toolResult.data
          ? { ...toolResult.data, screenshot: screenshot }
          : toolResult.data;
        
        return {
          tool_name: toolResult.tool_name,
          request_id: toolResult.request_id,
          success: toolResult.success,
          data: {
            ...toolDataWithScreenshot,
            // Individual tool llm_content for orchestrator matching
            llm_content: formatToolOutputMessage(
              toolResult.tool_name,
              toolResult._rawResult || { success: toolResult.success, error: toolResult.error, data: toolDataWithScreenshot },
              systemState
            ),
            is_preformatted: true,
          },
          error: toolResult.error
        };
      });
      
      // Send bundled result (ONLY ONCE) with combined message
      const bundleTotalTime = (performance.now() - bundleStartTime) / 1000;
      console.log(`[Timing] Bundle execution completed: ${bundle.length} tools took ${bundleTotalTime.toFixed(3)}s (bundle_id=${correlationId})`);
      console.log('[ChatContext] Sending bundled result');
      window.ipc.send('to-backend', {
        type: 'tool-result',
        payload: {
          request_id: correlationId,
          success: true,
          data: {
            bundled: true,
            tools: formattedTools, // Individual tools for orchestrator matching
            combined_llm_content: combinedFormattedMessage, // Combined message for history
            system_state: systemState,
            screenshot: screenshot
          }
        }
      });
    } catch (error) {
      const bundleTotalTime = (performance.now() - bundleStartTime) / 1000;
      console.error(`[Timing] Bundle execution failed after ${bundleTotalTime.toFixed(3)}s:`, error);
      console.error('[ChatContext] Bundle execution failed:', error);
      // Send error result
      window.ipc.send('to-backend', {
        type: 'tool-result',
        payload: {
          request_id: correlationId,
          success: false,
          error: error.message
        }
      });
    }
  }, []);

  // No event listeners needed - using stateless request/response pattern

  // Store callbacks in refs to prevent useEffect re-runs
  const executeToolRef = useRef(executeTool);
  const executeToolBundleRef = useRef(executeToolBundle);
  const displayToolResultRef = useRef(displayToolResult);
  
  // Update refs when callbacks change
  useEffect(() => {
    executeToolRef.current = executeTool;
    executeToolBundleRef.current = executeToolBundle;
    displayToolResultRef.current = displayToolResult;
  }, [executeTool, executeToolBundle, displayToolResult]);

  // Listen for chat-related backend events
  // Use refs in the handler to avoid dependency on changing function identities
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
          executeToolBundleRef.current(bundleToExecute, correlationId);
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
                // Execute immediately (stateless) - use ref to avoid stale closure
                executeToolRef.current(
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
          // Backend only emits tool-output for backend-side failures (e.g., coordinate resolution)
          // Normal tool outputs are displayed immediately by frontend after execution
          // This event is only for failures that never reached frontend execution
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
           const requestId = data.payload?.request_id || data.payload?.correlation_id;
           if (requestId) {
               console.log('[ChatContext] Received hidden screenshot request:', requestId);
               
               // Mark as hidden
               hiddenToolCalls.current.add(requestId);
               
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
                          request_id: requestId,
                          success: result.success,
                          data: result.data,
                          error: result.error,
                      }
                  });
                   hiddenToolCalls.current.delete(requestId);
               }).catch(err => {
                   console.error('[ChatContext] Failed to execute hidden screenshot:', err);
                  window.ipc.send('to-backend', {
                      type: 'tool-result',
                      payload: {
                          request_id: requestId,
                          success: false,
                          error: err.message,
                      }
                  });
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
  }, [streamingHandlers, enqueueAudio]); // Removed executeTool, executeToolBundle, displayToolResult - using refs instead

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
