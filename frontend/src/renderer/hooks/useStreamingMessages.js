import { useState, useCallback, useMemo } from 'react';

/**
 * Custom hook for managing streaming message responses.
 * Handles LLM thoughts, streaming chunks, and completion states.
 *
 * @param {Function} setMessages - Function to update messages state
 * @param {Function} setIsSending - Function to update sending state
 * @param {Function} setThinkingStatus - Function to update thinking status
 * @returns {Object} - Object containing message handlers
 */
export function useStreamingMessages(setMessages, setIsSending, setThinkingStatus) {
  const handlePongResponse = useCallback((data) => {
    const newMessage = {
      id: crypto.randomUUID(),
      text: data.payload.text || JSON.stringify(data.payload),
      sender: 'assistant',
      type: 'llm-text',
    };
    setMessages((prevMessages) => [...prevMessages, newMessage]);
    setIsSending(false);
  }, [setMessages, setIsSending]);

  const handleLlmThought = useCallback((data) => {
    // Accumulate thinking tokens for display
    setThinkingStatus((prevStatus) => {
      const newChunk = data.payload.status || '';
      const updated = (prevStatus || '') + newChunk;
      // Keep last 5000 characters to show substantial thinking content
      return updated.length > 5000 ? updated.slice(-5000) : updated;
    });
  }, [setThinkingStatus]);

  const handleStreamingResponse = useCallback((data) => {
    setIsSending(false); // We've got the first chunk, so we're not "sending" anymore
    // Don't clear thinking status - keep it visible so users can see reasoning tokens

    setMessages((prevMessages) => {
      const lastMessage = prevMessages[prevMessages.length - 1];
      if (lastMessage && lastMessage.sender === 'assistant' && !lastMessage.isComplete && lastMessage.type === 'llm-text') {
        // Append chunk to the last message if it's a streaming LLM text message
        return [
          ...prevMessages.slice(0, -1),
          {
            ...lastMessage,
            text: lastMessage.text + data.payload.text,
            type: 'llm-text',
          },
        ];
      } else {
        // This is the first chunk, create a new message object
        return [
          ...prevMessages,
          {
            id: crypto.randomUUID(),
            text: data.payload.text,
            sender: 'assistant',
            isComplete: false,
            type: 'llm-text', // Default to LLM text for streaming chunks
          },
        ];
      }
    });
  }, [setIsSending, setMessages]);

  const handleToolCall = useCallback((data) => {
    const newMessage = {
      id: crypto.randomUUID(),
      text: data.payload.raw_call || JSON.stringify({
        name: data.payload.tool_name,
        args: data.payload.parameters
      }, null, 2),
      sender: 'assistant',
      type: 'tool-call',
    };
    setMessages((prevMessages) => [...prevMessages, newMessage]);
  }, [setMessages]);

  const handleToolOutput = useCallback((data) => {
    const outputText = data.payload.error
      ? `Error: ${data.payload.error}`
      : (data.payload.output || 'No output');

    // Always generate a unique ID for React keys
    // data.id might be reused or duplicated, so we can't rely on it for uniqueness
    const messageId = crypto.randomUUID();
    const newMessage = {
      id: messageId, // Always unique for React keys
      text: outputText,
      sender: 'assistant',
      type: 'tool-output',
      screenshot: data.payload.screenshot, // Include screenshot data if available
      toolMetadata: data.payload.metadata, // Include enhanced metadata
      toolName: data.payload.tool_name,
      executionTime: data.payload.execution_time,
      success: data.payload.success,
      correlationId: data.id || data.payload?.request_id, // Store correlation ID separately if needed
    };
    
    // Safeguard: Check for duplicate IDs (shouldn't happen with UUID, but defensive)
    setMessages((prevMessages) => {
      const exists = prevMessages.some(msg => msg.id === messageId);
      if (exists) {
        console.warn('[useStreamingMessages] Duplicate message ID detected, generating new one:', messageId);
        newMessage.id = crypto.randomUUID();
      }
      return [...prevMessages, newMessage];
    });
  }, [setMessages]);

  const handleSystemPrompt = useCallback((data) => {
    // Store system prompt data - will be linked to last user message
    // If no user message exists yet, store it temporarily and attach on next user message
    setMessages((prevMessages) => {
      const updatedMessages = [...prevMessages];
      // Find the last user message and attach system prompt to it
      let found = false;
      for (let i = updatedMessages.length - 1; i >= 0; i--) {
        if (updatedMessages[i].sender === 'user') {
          updatedMessages[i] = {
            ...updatedMessages[i],
            systemPrompt: {
              content: data.payload.content,
              toolSchemas: data.payload.tool_schemas,
            },
          };
          found = true;
          break;
        }
      }
      // If no user message found, store as a special message that will be merged
      if (!found) {
        // Store temporarily - will be attached when user message arrives
        // For now, we'll attach it to the next user message that gets added
        return updatedMessages;
      }
      return updatedMessages;
    });
  }, [setMessages]);

  const handleUserMessageFull = useCallback((data) => {
    // Update the last user message with full transparency data
    setMessages((prevMessages) => {
      const updatedMessages = [...prevMessages];
      // Find the last user message
      for (let i = updatedMessages.length - 1; i >= 0; i--) {
        if (updatedMessages[i].sender === 'user') {
          updatedMessages[i] = {
            ...updatedMessages[i],
            fullUserMessage: {
              content: data.payload.content,
              metadata: data.payload.metadata,
            },
          };
          break;
        }
      }
      return updatedMessages;
    });
  }, [setMessages]);

  const handleAssistantMessageFull = useCallback((data) => {
    // Update the last assistant message with full transparency data
    // This could be streaming or complete
    setMessages((prevMessages) => {
      const updatedMessages = [...prevMessages];
      // Find the last assistant message (could be streaming)
      for (let i = updatedMessages.length - 1; i >= 0; i--) {
        if (updatedMessages[i].sender === 'assistant') {
          updatedMessages[i] = {
            ...updatedMessages[i],
            fullAssistantMessage: {
              content: data.payload.content,
            },
          };
          break;
        }
      }
      return updatedMessages;
    });
  }, [setMessages]);

  const handleToolSchemas = useCallback((data) => {
    // Store tool schemas data - attach only to the first user message
    setMessages((prevMessages) => {
      const updatedMessages = [...prevMessages];
      // Find the first user message and attach tool schemas to it
      // Tool schemas should only be displayed for the initial message
      for (let i = 0; i < updatedMessages.length; i++) {
        if (updatedMessages[i].sender === 'user') {
          updatedMessages[i] = {
            ...updatedMessages[i],
            toolSchemas: data.payload.tool_schemas,
          };
          break; // Only attach to the first user message
        }
      }
      return updatedMessages;
    });
  }, [setMessages]);

  const handleStreamingComplete = useCallback(() => {
    // Don't clear thinking status - keep it visible so users can review reasoning tokens
    // Thinking status will be cleared when a new query starts (in App.jsx handleSendMessage)
    setIsSending(false); // Always unblock UI when streaming completes
    setMessages((prevMessages) => {
      const lastMessage = prevMessages[prevMessages.length - 1];
      if (lastMessage && lastMessage.sender === 'assistant') {
        return [
          ...prevMessages.slice(0, -1),
          { ...lastMessage, isComplete: true },
        ];
      }
      return prevMessages;
    });
  }, [setMessages, setIsSending]);

  const handleError = useCallback((data) => {
    // Display error message and unblock UI
    setIsSending(false);
    setThinkingStatus(''); // Clear thinking status on error
    const errorText = data.payload?.content || data.payload?.message || 'An error occurred';
    const newMessage = {
      id: crypto.randomUUID(),
      text: errorText,
      sender: 'assistant',
      type: 'error',
    };
    setMessages((prevMessages) => [...prevMessages, newMessage]);
  }, [setMessages, setIsSending, setThinkingStatus]);

  return useMemo(() => ({
    handlePongResponse,
    handleLlmThought,
    handleStreamingResponse,
    handleStreamingComplete,
    handleToolCall,
    handleToolOutput,
    handleError,
    handleSystemPrompt,
    handleUserMessageFull,
    handleAssistantMessageFull,
    handleToolSchemas,
  }), [
    handlePongResponse,
    handleLlmThought,
    handleStreamingResponse,
    handleStreamingComplete,
    handleToolCall,
    handleToolOutput,
    handleError,
    handleSystemPrompt,
    handleUserMessageFull,
    handleAssistantMessageFull,
    handleToolSchemas,
  ]);
}
