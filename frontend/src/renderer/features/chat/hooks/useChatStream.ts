/**
 * useChatStream Hook.
 * Handles streaming message responses from backend.
 * Manages LLM thoughts, streaming chunks, and completion states.
 */

import { useCallback, useEffect } from 'react';
import { IpcBridge, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { useChatStore, type ChatMessage } from '../stores/chatStore';

/**
 * Custom hook for managing streaming message responses.
 * Handles LLM thoughts, streaming chunks, and completion states.
 */
export function useChatStream() {
  const {
    addMessage,
    updateMessage,
    setIsSending,
    setThinkingStatus,
    setTokenCounts,
  } = useChatStore();

  const handleLlmThought = useCallback((data: any) => {
    // Accumulate thinking tokens for display
    const newChunk = data.payload?.status || '';
    const currentStatus = useChatStore.getState().thinkingStatus || '';
    const updated = currentStatus + newChunk;
    // Keep last 5000 characters to show substantial thinking content
    const finalStatus = updated.length > 5000 ? updated.slice(-5000) : updated;
    setThinkingStatus(finalStatus);
  }, [setThinkingStatus]);

  const handleStreamingResponse = useCallback((data: any) => {
    setIsSending(false); // We've got the first chunk, so we're not "sending" anymore
    // Don't clear thinking status - keep it visible so users can see reasoning tokens

    // Get current messages from store (not from dependency)
    const messages = useChatStore.getState().messages;
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.sender === 'assistant' && !lastMessage.isComplete && lastMessage.type === 'llm-text') {
      // Append chunk to the last message if it's a streaming LLM text message
      updateMessage(lastMessage.id, {
        text: lastMessage.text + (data.payload?.text || ''),
        type: 'llm-text',
      });
    } else {
      // This is the first chunk, create a new message object
      const newMessage: ChatMessage = {
        id: crypto.randomUUID(),
        text: data.payload?.text || '',
        sender: 'assistant',
        isComplete: false,
        type: 'llm-text', // Default to LLM text for streaming chunks
      };
      addMessage(newMessage);
    }
  }, [addMessage, updateMessage, setIsSending]);

  const handleToolCall = useCallback((data: any) => {
    // Format tool call as pretty-printed JSON
    let formattedText: string;
    
    if (data.payload?.raw_call) {
      try {
        // Parse the raw_call JSON string and reformat with indentation
        const parsed = JSON.parse(data.payload.raw_call);
        formattedText = JSON.stringify(parsed, null, 2);
      } catch (e) {
        // If parsing fails, use raw_call as-is
        formattedText = data.payload.raw_call;
      }
    } else {
      // Fallback: construct from tool_name and parameters
      formattedText = JSON.stringify({
        name: data.payload?.tool_name,
        args: data.payload?.parameters
      }, null, 2);
    }
    
    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      text: formattedText,
      sender: 'assistant',
      type: 'tool-call',
    };
    addMessage(newMessage);
  }, [addMessage]);

  const handleToolOutput = useCallback((data: any) => {
    const outputText = data.payload?.error
      ? `Error: ${data.payload.error}`
      : (data.payload?.output || 'No output');

    // Always generate a unique ID for React keys
    const messageId = crypto.randomUUID();
    const newMessage: ChatMessage = {
      id: messageId,
      text: outputText,
      sender: 'assistant',
      type: 'tool-output',
      screenshot: data.payload?.screenshot,
      toolMetadata: data.payload?.metadata,
      toolName: data.payload?.tool_name,
      executionTime: data.payload?.execution_time,
      success: data.payload?.success,
      correlationId: data.id || data.payload?.request_id,
    };
    
    addMessage(newMessage);
  }, [addMessage]);

  const handleSystemPrompt = useCallback((data: any) => {
    // Store system prompt data - will be linked to last user message
    // Find the last user message and attach system prompt to it
    const messages = useChatStore.getState().messages;
    const lastUserMessageIndex = messages.findLastIndex(msg => msg.sender === 'user');
    if (lastUserMessageIndex >= 0) {
      const lastUserMessage = messages[lastUserMessageIndex];
      updateMessage(lastUserMessage.id, {
        systemPrompt: {
          content: data.payload?.content || '',
          toolSchemas: data.payload?.tool_schemas,
        },
      });
    }
  }, [updateMessage]);

  const handleUserMessageFull = useCallback((data: any) => {
    // Update the last user message with full transparency data
    const messages = useChatStore.getState().messages;
    const lastUserMessageIndex = messages.findLastIndex(msg => msg.sender === 'user');
    if (lastUserMessageIndex >= 0) {
      const lastUserMessage = messages[lastUserMessageIndex];
      updateMessage(lastUserMessage.id, {
        fullUserMessage: {
          content: data.payload?.content || '',
          metadata: data.payload?.metadata,
        },
      });
    }
  }, [updateMessage]);

  const handleAssistantMessageFull = useCallback((data: any) => {
    // Update the last assistant message with full transparency data
    const messages = useChatStore.getState().messages;
    const lastAssistantMessageIndex = messages.findLastIndex(msg => msg.sender === 'assistant');
    if (lastAssistantMessageIndex >= 0) {
      const lastAssistantMessage = messages[lastAssistantMessageIndex];
      updateMessage(lastAssistantMessage.id, {
        fullAssistantMessage: {
          content: data.payload?.content || '',
        },
      });
    }
  }, [updateMessage]);

  const handleToolSchemas = useCallback((data: any) => {
    // Store tool schemas data - attach only to the first user message
    const messages = useChatStore.getState().messages;
    const firstUserMessage = messages.find(msg => msg.sender === 'user');
    if (firstUserMessage) {
      updateMessage(firstUserMessage.id, {
        toolSchemas: data.payload?.tool_schemas,
      });
    }
  }, [updateMessage]);

  const handleStreamingComplete = useCallback(() => {
    // Don't clear thinking status - keep it visible so users can review reasoning tokens
    setIsSending(false); // Always unblock UI when streaming completes
    
    const messages = useChatStore.getState().messages;
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.sender === 'assistant') {
      updateMessage(lastMessage.id, { isComplete: true });
    }
  }, [updateMessage, setIsSending]);

  const handleError = useCallback((data: any) => {
    // Display error message and unblock UI
    setIsSending(false);
    setThinkingStatus(''); // Clear thinking status on error
    const errorText = data.payload?.content || data.payload?.message || 'An error occurred';
    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      text: errorText,
      sender: 'assistant',
      type: 'error',
    };
    addMessage(newMessage);
  }, [addMessage, setIsSending, setThinkingStatus]);

  // Set up IPC event listeners
  useEffect(() => {
    const removeListener = IpcBridge.on(ON_CHANNELS.FROM_BACKEND, (data: any) => {
      switch (data.type) {
        case 'llm-thought':
          handleLlmThought(data);
          break;
        case 'streaming-response':
          handleStreamingResponse(data);
          break;
        case 'streaming-complete':
          handleStreamingComplete();
          break;
        case 'tool-call':
          handleToolCall(data);
          break;
        case 'tool-output':
          // Backend only emits tool-output for backend-side failures
          // Normal tool outputs are displayed by useToolRunner
          handleToolOutput(data);
          break;
        case 'system-prompt':
          handleSystemPrompt(data);
          break;
        case 'user-message-full':
          handleUserMessageFull(data);
          break;
        case 'assistant-message-full':
          handleAssistantMessageFull(data);
          break;
        case 'token-count':
          setTokenCounts(data.payload);
          break;
        case 'tool-schemas':
          handleToolSchemas(data);
          break;
        case 'error':
          // Filter out settings errors which are handled by AppContext
          if (!data.payload?.message?.includes('Failed to update settings')) {
            handleError(data);
          }
          break;
        default:
          break;
      }
    });

    return removeListener;
  }, [
    handleLlmThought,
    handleStreamingResponse,
    handleStreamingComplete,
    handleToolCall,
    handleToolOutput,
    handleSystemPrompt,
    handleUserMessageFull,
    handleAssistantMessageFull,
    handleToolSchemas,
    handleError,
    setTokenCounts,
  ]);
}
