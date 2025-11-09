import { useState, useCallback } from 'react';

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
    setThinkingStatus((prevStatus) => {
      const updated = (prevStatus || '') + data.payload.status;
      return updated.length > 1000 ? updated.slice(-1000) : updated;
    });
  }, [setThinkingStatus]);

  const handleStreamingResponse = useCallback((data) => {
    setIsSending(false); // We've got the first chunk, so we're not "sending" anymore
    setThinkingStatus(null); // Hide thinking status when response starts

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
  }, [setIsSending, setThinkingStatus, setMessages]);

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

    const newMessage = {
      id: crypto.randomUUID(),
      text: outputText,
      sender: 'assistant',
      type: 'tool-output',
      screenshot: data.payload.screenshot, // Include screenshot data if available
    };
    setMessages((prevMessages) => [...prevMessages, newMessage]);
  }, [setMessages]);

  const handleStreamingComplete = useCallback(() => {
    setThinkingStatus(null);
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
  }, [setThinkingStatus, setMessages]);

  return {
    handlePongResponse,
    handleLlmThought,
    handleStreamingResponse,
    handleStreamingComplete,
    handleToolCall,
    handleToolOutput,
  };
}
