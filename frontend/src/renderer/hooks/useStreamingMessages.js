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
      if (lastMessage && lastMessage.sender === 'assistant' && !lastMessage.isComplete) {
        // Append chunk to the last message by creating a new object
        return [
          ...prevMessages.slice(0, -1),
          { ...lastMessage, text: lastMessage.text + data.payload.text },
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
          },
        ];
      }
    });
  }, [setIsSending, setThinkingStatus, setMessages]);

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
  };
}
