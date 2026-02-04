/**
 * useChatStream Hook.
 * Handles streaming message responses from backend.
 * Manages LLM thoughts, streaming chunks, and completion states.
 */

import { useCallback, useEffect, useMemo } from 'react';
import { IpcBridge, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { useChatStore, type ChatMessage } from '../stores/chatStore';
import {
  type BackendEvent,
  type BackendEventType,
  type LlmThoughtEvent,
  type StreamingResponseEvent,
  type ToolCallEvent,
  type ToolOutputEvent,
  type SystemPromptEvent,
  type UserMessageFullEvent,
  type AssistantMessageFullEvent,
  type TokenCountEvent,
  type ToolSchemasEvent,
  type ErrorEvent,
  isBackendEvent,
} from '../../../types/backendEvents';

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

  const updateLastMessageBySender = useCallback((sender: ChatMessage['sender'], updates: Partial<ChatMessage>) => {
    const messages = useChatStore.getState().messages;
    const lastIndex = messages.findLastIndex(msg => msg.sender === sender);
    if (lastIndex >= 0) {
      updateMessage(messages[lastIndex].id, updates);
    }
  }, [updateMessage]);

  const updateFirstMessageBySender = useCallback((sender: ChatMessage['sender'], updates: Partial<ChatMessage>) => {
    const messages = useChatStore.getState().messages;
    const firstMessage = messages.find(msg => msg.sender === sender);
    if (firstMessage) {
      updateMessage(firstMessage.id, updates);
    }
  }, [updateMessage]);

  const handleLlmThought = useCallback((event: LlmThoughtEvent) => {
    const newChunk = event.payload?.status || '';
    const currentStatus = useChatStore.getState().thinkingStatus || '';
    const updated = currentStatus + newChunk;
    const finalStatus = updated.length > 5000 ? updated.slice(-5000) : updated;
    setThinkingStatus(finalStatus);
  }, [setThinkingStatus]);

  const handleStreamingResponse = useCallback((event: StreamingResponseEvent) => {
    setIsSending(false);
    setThinkingStatus(null);

    const messages = useChatStore.getState().messages;
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.sender === 'assistant' && !lastMessage.isComplete && lastMessage.type === 'llm-text') {
      updateMessage(lastMessage.id, {
        text: lastMessage.text + (event.payload?.text || ''),
        type: 'llm-text',
      });
    } else {
      const newMessage: ChatMessage = {
        id: crypto.randomUUID(),
        text: event.payload?.text || '',
        sender: 'assistant',
        isComplete: false,
        type: 'llm-text',
      };
      addMessage(newMessage);
    }
  }, [addMessage, updateMessage, setIsSending, setThinkingStatus]);

  const handleToolCall = useCallback((event: ToolCallEvent) => {
    setThinkingStatus(null);
    let formattedText: string;

    if (event.payload?.raw_call) {
      try {
        const parsed = JSON.parse(event.payload.raw_call);
        formattedText = JSON.stringify(parsed, null, 2);
      } catch (e) {
        formattedText = event.payload.raw_call;
      }
    } else {
      formattedText = JSON.stringify({
        name: event.payload?.tool_name,
        args: event.payload?.parameters
      }, null, 2);
    }

    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      text: formattedText,
      sender: 'assistant',
      type: 'tool-call',
    };
    addMessage(newMessage);
  }, [addMessage, setThinkingStatus]);

  const handleToolOutput = useCallback((event: ToolOutputEvent) => {
    setThinkingStatus(null);
    const outputText = event.payload?.error
      ? `Error: ${event.payload.error}`
      : (event.payload?.output || 'No output');

    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      text: outputText,
      sender: 'assistant',
      type: 'tool-output',
      screenshot: event.payload?.screenshot,
      toolMetadata: event.payload?.metadata,
      toolName: event.payload?.tool_name,
      executionTime: event.payload?.execution_time,
      success: event.payload?.success,
      correlationId: event.id || event.payload?.request_id,
    };

    addMessage(newMessage);
  }, [addMessage, setThinkingStatus]);

  const handleSystemPrompt = useCallback((event: SystemPromptEvent) => {
    updateLastMessageBySender('user', {
      systemPrompt: {
        content: event.payload?.content || '',
        toolSchemas: event.payload?.tool_schemas,
      },
    });
  }, [updateLastMessageBySender]);

  const handleUserMessageFull = useCallback((event: UserMessageFullEvent) => {
    updateLastMessageBySender('user', {
      fullUserMessage: {
        content: event.payload?.content || '',
        metadata: event.payload?.metadata,
      },
    });
  }, [updateLastMessageBySender]);

  const handleAssistantMessageFull = useCallback((event: AssistantMessageFullEvent) => {
    updateLastMessageBySender('assistant', {
      fullAssistantMessage: {
        content: event.payload?.content || '',
      },
    });
  }, [updateLastMessageBySender]);

  const handleToolSchemas = useCallback((event: ToolSchemasEvent) => {
    updateFirstMessageBySender('user', {
      toolSchemas: event.payload?.tool_schemas,
    });
  }, [updateFirstMessageBySender]);

  const handleStreamingComplete = useCallback(() => {
    setIsSending(false);
    setThinkingStatus(null);

    const messages = useChatStore.getState().messages;
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.sender === 'assistant') {
      updateMessage(lastMessage.id, { isComplete: true });
    }
  }, [updateMessage, setIsSending, setThinkingStatus]);

  const handleTokenCount = useCallback((event: TokenCountEvent) => {
    setTokenCounts(event.payload ?? null);
  }, [setTokenCounts]);

  const handleError = useCallback((event: ErrorEvent) => {
    setIsSending(false);
    setThinkingStatus('');
    const errorText = event.payload?.content || event.payload?.message || 'An error occurred';
    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      text: errorText,
      sender: 'assistant',
      type: 'error',
    };
    addMessage(newMessage);
  }, [addMessage, setIsSending, setThinkingStatus]);

  const handlers = useMemo<Record<BackendEventType, (event: BackendEvent) => void>>(() => ({
    'llm-thought': event => handleLlmThought(event as LlmThoughtEvent),
    'streaming-response': event => handleStreamingResponse(event as StreamingResponseEvent),
    'streaming-complete': () => handleStreamingComplete(),
    'tool-call': event => handleToolCall(event as ToolCallEvent),
    'tool-output': event => handleToolOutput(event as ToolOutputEvent),
    'system-prompt': event => handleSystemPrompt(event as SystemPromptEvent),
    'user-message-full': event => handleUserMessageFull(event as UserMessageFullEvent),
    'assistant-message-full': event => handleAssistantMessageFull(event as AssistantMessageFullEvent),
    'token-count': event => handleTokenCount(event as TokenCountEvent),
    'tool-schemas': event => handleToolSchemas(event as ToolSchemasEvent),
    'error': event => {
      const errorEvent = event as ErrorEvent;
      if (!errorEvent.payload?.message?.includes('Failed to update settings')) {
        handleError(errorEvent);
      }
    },
  }), [
    handleLlmThought,
    handleStreamingResponse,
    handleStreamingComplete,
    handleToolCall,
    handleToolOutput,
    handleSystemPrompt,
    handleUserMessageFull,
    handleAssistantMessageFull,
    handleTokenCount,
    handleToolSchemas,
    handleError,
  ]);

  useEffect(() => {
    const removeListener = IpcBridge.on(ON_CHANNELS.FROM_BACKEND, (data: unknown) => {
      if (!isBackendEvent(data)) {
        return;
      }
      const handler = handlers[data.type];
      if (handler) {
        handler(data);
      }
    });

    return removeListener;
  }, [handlers]);
}
