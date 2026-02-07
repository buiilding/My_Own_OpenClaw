/**
 * useChatStream Hook.
 * Handles streaming message responses from backend.
 * Manages LLM thoughts, streaming chunks, and completion states.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { IpcBridge, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { useChatStore, type ChatMessage } from '../stores/chatStore';
import { useAppConfigContext } from '../../../app/providers/AppContextHooks';
import {
  recordAssistantMessage,
  recordToolMessage,
  recordUserMessage,
  updateTranscriptSession,
} from '../../../infrastructure/transcript/TranscriptWriter';
import {
  type BackendEvent,
  type BackendEventType,
  type LlmThoughtEvent,
  type StreamingCompleteEvent,
  type StreamingResponseEvent,
  type ToolCallEvent,
  type ToolOutputEvent,
  type ToolBundleEvent,
  type SystemPromptEvent,
  type UserMessageFullEvent,
  type AssistantMessageFullEvent,
  type TokenCountEvent,
  type ToolSchemasEvent,
  type LocalUserMessageEvent,
  type ErrorEvent,
  isBackendEvent,
} from '../../../types/backendEvents';
import {
  buildThinkingStatus,
  formatToolBundlePayload,
  formatToolCallPayload,
  formatToolOutputText,
} from '../utils/chatStreamFormatting';
import {
  buildScreenshotAttachment,
  resolveErrorText,
  resolveToolOutputCorrelationId,
  shouldIgnoreStreamError,
} from '../utils/chatStreamEventUtils';

type TranscriptModelContext = {
  modelId: string | null;
  modelProvider: string | null;
};

/**
 * Custom hook for managing streaming message responses.
 * Handles LLM thoughts, streaming chunks, and completion states.
 */
export function useChatStream(enableTranscript: boolean = true) {
  const addMessage = useChatStore((state) => state.addMessage);
  const updateMessage = useChatStore((state) => state.updateMessage);
  const setIsSending = useChatStore((state) => state.setIsSending);
  const setThinkingStatus = useChatStore((state) => state.setThinkingStatus);
  const setTokenCounts = useChatStore((state) => state.setTokenCounts);
  const { config } = useAppConfigContext();
  const modelId = config?.selected_model_id || null;
  const modelProvider = config?.model_provider || null;
  const modelContextRef = useRef<TranscriptModelContext>({
    modelId,
    modelProvider,
  });

  useEffect(() => {
    modelContextRef.current = {
      modelId,
      modelProvider,
    };
  }, [modelId, modelProvider]);

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
    const currentStatus = useChatStore.getState().thinkingStatus;
    setThinkingStatus(buildThinkingStatus(currentStatus, event.payload?.status));
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
    const formattedText = formatToolCallPayload(event.payload);

    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      text: formattedText,
      sender: 'assistant',
      type: 'tool-call',
    };
    addMessage(newMessage);

    const correlationId = event.payload?.correlation_id || event.payload?.request_id;

    if (enableTranscript) {
      const modelContext = modelContextRef.current;
      recordToolMessage(formattedText, {
        messageType: 'tool-call',
        toolName: event.payload?.tool_name,
        correlationId,
        sessionId: event.session_id,
        userId: event.user_id,
        modelId: modelContext.modelId,
        modelProvider: modelContext.modelProvider,
      });
    }
  }, [addMessage, enableTranscript, setThinkingStatus]);

  const handleToolOutput = useCallback((event: ToolOutputEvent) => {
    setThinkingStatus(null);
    const outputText = formatToolOutputText(event.payload);
    const { screenshotRef, screenshotUrl } = buildScreenshotAttachment(event.payload?.screenshot_ref);

    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      text: outputText,
      sender: 'assistant',
      type: 'tool-output',
      screenshotRef,
      screenshotUrl,
      toolMetadata: event.payload?.metadata,
      toolName: event.payload?.tool_name,
      executionTime: event.payload?.execution_time,
      success: event.payload?.success,
      correlationId: resolveToolOutputCorrelationId(event.payload, event.id),
    };

    addMessage(newMessage);
    const correlationId = resolveToolOutputCorrelationId(event.payload, event.id) || undefined;

    if (enableTranscript) {
      const modelContext = modelContextRef.current;
      recordToolMessage(outputText, {
        messageType: 'tool-output',
        toolName: event.payload?.tool_name,
        correlationId,
        sessionId: event.session_id,
        userId: event.user_id,
        screenshotRef,
        modelId: modelContext.modelId,
        modelProvider: modelContext.modelProvider,
      });
    }
  }, [addMessage, enableTranscript, setThinkingStatus]);

  const handleToolBundle = useCallback((event: ToolBundleEvent) => {
    setThinkingStatus(null);
    const formattedText = formatToolBundlePayload(event.payload);

    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      text: formattedText,
      sender: 'assistant',
      type: 'tool-call',
    };
    addMessage(newMessage);

    if (enableTranscript) {
      const modelContext = modelContextRef.current;
      recordToolMessage(formattedText, {
        messageType: 'tool-call',
        toolName: 'tool-bundle',
        correlationId: event.payload?.bundle_id,
        sessionId: event.session_id,
        userId: event.user_id,
        modelId: modelContext.modelId,
        modelProvider: modelContext.modelProvider,
      });
    }
  }, [addMessage, enableTranscript, setThinkingStatus]);

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

  const handleLocalUserMessage = useCallback((event: LocalUserMessageEvent) => {
    const text = event.payload?.text;
    if (!text) {
      return;
    }
    const { screenshotRef, screenshotUrl } = buildScreenshotAttachment(
      event.payload?.screenshot_ref,
      event.payload?.screenshot_url,
    );
    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      text,
      sender: 'user',
      screenshotRef,
      screenshotUrl,
      timestamp: event.payload?.timestamp,
    };
    addMessage(newMessage);

    if (enableTranscript) {
      const modelContext = modelContextRef.current;
      recordUserMessage(text, {
        timestamp: event.payload?.timestamp,
        sessionId: event.payload?.session_id ?? event.session_id ?? null,
        userId: event.payload?.user_id ?? event.user_id ?? null,
        screenshotRef,
        modelId: modelContext.modelId,
        modelProvider: modelContext.modelProvider,
      });
    }
  }, [addMessage, enableTranscript]);

  const handleStreamingComplete = useCallback((event: StreamingCompleteEvent) => {
    setIsSending(false);
    setThinkingStatus(null);

    const messages = useChatStore.getState().messages;
    const lastMessage = messages.findLast(
      (message) => message.sender === 'assistant' && (!message.type || message.type === 'llm-text')
    );
    if (lastMessage && lastMessage.sender === 'assistant') {
      updateMessage(lastMessage.id, { isComplete: true });
      if (lastMessage.text && enableTranscript) {
        const modelContext = modelContextRef.current;
        recordAssistantMessage(lastMessage.text, {
          messageType: lastMessage.type || 'llm-text',
          sessionId: event.session_id,
          userId: event.user_id,
          modelId: modelContext.modelId,
          modelProvider: modelContext.modelProvider,
        });
      }
    }
  }, [enableTranscript, setIsSending, setThinkingStatus, updateMessage]);

  const handleTokenCount = useCallback((event: TokenCountEvent) => {
    setTokenCounts(event.payload ?? null);
  }, [setTokenCounts]);

  const handleError = useCallback((event: ErrorEvent) => {
    setIsSending(false);
    setThinkingStatus('');
    const errorText = resolveErrorText(event.payload);
    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      text: errorText,
      sender: 'assistant',
      type: 'error',
    };
    addMessage(newMessage);

    if (enableTranscript) {
      const modelContext = modelContextRef.current;
      recordAssistantMessage(errorText, {
        messageType: 'error',
        sessionId: event.session_id,
        userId: event.user_id,
        modelId: modelContext.modelId,
        modelProvider: modelContext.modelProvider,
      });
    }
  }, [addMessage, enableTranscript, setIsSending, setThinkingStatus]);

  const handlers = useMemo<Record<BackendEventType, (event: BackendEvent) => void>>(() => ({
    'llm-thought': event => handleLlmThought(event as LlmThoughtEvent),
    'streaming-response': event => handleStreamingResponse(event as StreamingResponseEvent),
    'streaming-complete': event => handleStreamingComplete(event as StreamingCompleteEvent),
    'tool-call': event => handleToolCall(event as ToolCallEvent),
    'tool-output': event => handleToolOutput(event as ToolOutputEvent),
    'tool-bundle': event => handleToolBundle(event as ToolBundleEvent),
    'system-prompt': event => handleSystemPrompt(event as SystemPromptEvent),
    'local-user-message': event => handleLocalUserMessage(event as LocalUserMessageEvent),
    'user-message-full': event => handleUserMessageFull(event as UserMessageFullEvent),
    'assistant-message-full': event => handleAssistantMessageFull(event as AssistantMessageFullEvent),
    'token-count': event => handleTokenCount(event as TokenCountEvent),
    'tool-schemas': event => handleToolSchemas(event as ToolSchemasEvent),
    'error': event => {
      const errorEvent = event as ErrorEvent;
      if (!shouldIgnoreStreamError(errorEvent.payload)) {
        handleError(errorEvent);
      }
    },
  }), [
    handleLlmThought,
    handleStreamingResponse,
    handleStreamingComplete,
    handleToolCall,
    handleToolOutput,
    handleToolBundle,
    handleSystemPrompt,
    handleLocalUserMessage,
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
      if (enableTranscript) {
        updateTranscriptSession(data.session_id ?? null, data.user_id ?? null);
      }
      const handler = handlers[data.type];
      if (handler) {
        handler(data);
      }
    });

    return removeListener;
  }, [enableTranscript, handlers]);
}
