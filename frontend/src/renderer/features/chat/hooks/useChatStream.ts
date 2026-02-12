/**
 * useChatStream Hook.
 * Handles streaming message responses from backend.
 * Manages LLM thoughts, streaming chunks, and completion states.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { IpcBridge, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import {
  useChatStore,
  type ChatMessage,
  type StreamPhase,
  type StreamTracking,
} from '../stores/chatStore';
import { useAppConfigContext } from '../../../app/providers/AppContextHooks';
import {
  recordAssistantMessage,
  recordToolMessage,
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
import {
  buildAssistantMessageFullUpdate,
  buildSystemPromptUpdate,
  findLastAssistantLlmTextMessageId,
  buildUserMessageFullUpdate,
  findFirstMessageIdBySender,
  findLastMessageIdBySender,
  findStreamingCompleteAssistantMessage,
  resolveStreamingResponseAction,
} from '../utils/chatStreamMessageUpdates';

type TranscriptModelContext = {
  modelId: string | null;
  modelProvider: string | null;
};

type StreamTrackingOptions = {
  phase?: StreamPhase;
  chunkSize?: number;
  toolCall?: boolean;
  toolOutput?: boolean;
  errorText?: string | null;
  resetForTurn?: boolean;
};

function createTrackingForNewTurn(
  eventType: BackendEventType,
  now: string,
  turnRef: string | null,
): StreamTracking {
  return {
    activeTurnRef: turnRef,
    phase: 'awaiting-first-chunk',
    startedAt: now,
    firstChunkAt: null,
    completedAt: null,
    lastEventAt: now,
    lastEventType: eventType,
    eventCount: 1,
    chunkCount: 0,
    toolCallCount: 0,
    toolOutputCount: 0,
    lastChunkSize: 0,
    lastError: null,
  };
}

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
  const updateStreamTracking = useChatStore((state) => state.updateStreamTracking);
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

  const recordTrackingEvent = useCallback((
    eventType: BackendEventType,
    turnRef: string | null | undefined,
    options: StreamTrackingOptions = {},
  ) => {
    const now = new Date().toISOString();
    updateStreamTracking((current) => {
      const resolvedTurnRef = turnRef ?? current.activeTurnRef;
      const base = options.resetForTurn
        ? createTrackingForNewTurn(eventType, now, resolvedTurnRef ?? null)
        : {
          ...current,
          activeTurnRef: resolvedTurnRef ?? current.activeTurnRef,
          lastEventAt: now,
          lastEventType: eventType,
          eventCount: current.eventCount + 1,
        };

      const next: StreamTracking = {
        ...base,
      };

      if (options.phase) {
        next.phase = options.phase;
      }

      if (eventType === 'streaming-response') {
        next.chunkCount += 1;
        next.lastChunkSize = options.chunkSize ?? 0;
        if (!next.firstChunkAt) {
          next.firstChunkAt = now;
        }
        if (!options.phase) {
          next.phase = 'streaming';
        }
      }

      if (options.toolCall) {
        next.toolCallCount += 1;
        if (!options.phase) {
          next.phase = 'tool-call';
        }
      }

      if (options.toolOutput) {
        next.toolOutputCount += 1;
        if (!options.phase) {
          next.phase = 'tool-output';
        }
      }

      if (options.errorText !== undefined) {
        next.lastError = options.errorText;
        next.phase = options.phase ?? 'error';
        next.completedAt = now;
      }

      if (next.phase === 'complete' && !next.completedAt) {
        next.completedAt = now;
      }

      return next;
    });
  }, [updateStreamTracking]);

  const updateLastMessageBySender = useCallback((
    sender: ChatMessage['sender'],
    updates: Partial<ChatMessage>,
    turnRef?: string,
  ) => {
    const messageId = findLastMessageIdBySender(
      useChatStore.getState().messages,
      sender,
      turnRef,
    );
    if (messageId) {
      updateMessage(messageId, updates);
    }
  }, [updateMessage]);

  const updateFirstMessageBySender = useCallback((sender: ChatMessage['sender'], updates: Partial<ChatMessage>) => {
    const messageId = findFirstMessageIdBySender(useChatStore.getState().messages, sender);
    if (messageId) {
      updateMessage(messageId, updates);
    }
  }, [updateMessage]);

  const updateLastAssistantLlmTextMessage = useCallback((
    updates: Partial<ChatMessage>,
    turnRef?: string,
  ) => {
    const messageId = findLastAssistantLlmTextMessageId(
      useChatStore.getState().messages,
      turnRef,
    );
    if (messageId) {
      updateMessage(messageId, updates);
    }
  }, [updateMessage]);

  const handleLlmThought = useCallback((event: LlmThoughtEvent) => {
    const currentStatus = useChatStore.getState().thinkingStatus;
    setThinkingStatus(buildThinkingStatus(currentStatus, event.payload?.status));
    recordTrackingEvent('llm-thought', event.turn_ref);
  }, [setThinkingStatus, recordTrackingEvent]);

  const handleStreamingResponse = useCallback((event: StreamingResponseEvent) => {
    setIsSending(false);
    setThinkingStatus(null);

    const action = resolveStreamingResponseAction(
      useChatStore.getState().messages,
      event.payload?.text,
      event.turn_ref,
    );
    if (action.type === 'append') {
      updateMessage(action.messageId, {
        text: action.nextText,
        type: 'llm-text',
      });
    } else {
      const newMessage: ChatMessage = {
        id: crypto.randomUUID(),
        text: action.text,
        sender: 'assistant',
        isComplete: false,
        type: 'llm-text',
        turnRef: action.turnRef,
      };
      addMessage(newMessage);
    }

    recordTrackingEvent('streaming-response', event.turn_ref, {
      phase: 'streaming',
      chunkSize: (event.payload?.text || '').length,
    });
  }, [
    addMessage,
    updateMessage,
    setIsSending,
    setThinkingStatus,
    recordTrackingEvent,
  ]);

  const handleToolCall = useCallback((event: ToolCallEvent) => {
    setThinkingStatus(null);
    const formattedText = formatToolCallPayload(event.payload);

    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      text: formattedText,
      sender: 'assistant',
      type: 'tool-call',
      turnRef: event.turn_ref,
    };
    addMessage(newMessage);

    recordTrackingEvent('tool-call', event.turn_ref, { toolCall: true });

    const correlationId = event.payload?.correlation_id || event.payload?.request_id;

    if (enableTranscript) {
      const modelContext = modelContextRef.current;
      recordToolMessage(formattedText, {
        messageType: 'tool-call',
        toolName: event.payload?.tool_name,
        correlationId,
        conversationRef: event.conversation_ref,
        userId: event.user_id,
        modelId: modelContext.modelId,
        modelProvider: modelContext.modelProvider,
      });
    }
  }, [addMessage, enableTranscript, setThinkingStatus, recordTrackingEvent]);

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
      turnRef: event.turn_ref,
    };

    addMessage(newMessage);
    recordTrackingEvent('tool-output', event.turn_ref, { toolOutput: true });

    const correlationId = resolveToolOutputCorrelationId(event.payload, event.id) || undefined;

    if (enableTranscript) {
      const modelContext = modelContextRef.current;
      recordToolMessage(outputText, {
        messageType: 'tool-output',
        toolName: event.payload?.tool_name,
        correlationId,
        conversationRef: event.conversation_ref,
        userId: event.user_id,
        screenshotRef,
        modelId: modelContext.modelId,
        modelProvider: modelContext.modelProvider,
      });
    }
  }, [addMessage, enableTranscript, setThinkingStatus, recordTrackingEvent]);

  const handleToolBundle = useCallback((event: ToolBundleEvent) => {
    setThinkingStatus(null);
    const formattedText = formatToolBundlePayload(event.payload);

    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      text: formattedText,
      sender: 'assistant',
      type: 'tool-call',
      turnRef: event.turn_ref,
    };
    addMessage(newMessage);

    recordTrackingEvent('tool-bundle', event.turn_ref, { phase: 'tool-call', toolCall: true });

    if (enableTranscript) {
      const modelContext = modelContextRef.current;
      recordToolMessage(formattedText, {
        messageType: 'tool-call',
        toolName: 'tool-bundle',
        correlationId: event.payload?.bundle_id,
        conversationRef: event.conversation_ref,
        userId: event.user_id,
        modelId: modelContext.modelId,
        modelProvider: modelContext.modelProvider,
      });
    }
  }, [addMessage, enableTranscript, setThinkingStatus, recordTrackingEvent]);

  const handleSystemPrompt = useCallback((event: SystemPromptEvent) => {
    updateLastMessageBySender('user', {
      systemPrompt: buildSystemPromptUpdate(event.payload),
    }, event.turn_ref || undefined);
    recordTrackingEvent('system-prompt', event.turn_ref);
  }, [updateLastMessageBySender, recordTrackingEvent]);

  const handleUserMessageFull = useCallback((event: UserMessageFullEvent) => {
    updateLastMessageBySender('user', {
      fullUserMessage: buildUserMessageFullUpdate(event.payload),
    }, event.turn_ref || undefined);
    recordTrackingEvent('user-message-full', event.turn_ref);
  }, [updateLastMessageBySender, recordTrackingEvent]);

  const handleAssistantMessageFull = useCallback((event: AssistantMessageFullEvent) => {
    updateLastAssistantLlmTextMessage({
      fullAssistantMessage: buildAssistantMessageFullUpdate(event.payload),
    }, event.turn_ref || undefined);
    recordTrackingEvent('assistant-message-full', event.turn_ref);
  }, [updateLastAssistantLlmTextMessage, recordTrackingEvent]);

  const handleToolSchemas = useCallback((event: ToolSchemasEvent) => {
    updateFirstMessageBySender('user', {
      toolSchemas: event.payload?.tool_schemas,
    });
    recordTrackingEvent('tool-schemas', event.turn_ref);
  }, [updateFirstMessageBySender, recordTrackingEvent]);

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
      turnRef: event.turn_ref,
    };
    addMessage(newMessage);

    recordTrackingEvent('local-user-message', event.turn_ref, {
      phase: 'awaiting-first-chunk',
      resetForTurn: true,
    });
  }, [addMessage, recordTrackingEvent]);

  const handleStreamingComplete = useCallback((event: StreamingCompleteEvent) => {
    setIsSending(false);
    setThinkingStatus(null);

    const lastMessage = findStreamingCompleteAssistantMessage(
      useChatStore.getState().messages,
      event.turn_ref,
    );
    if (lastMessage && lastMessage.sender === 'assistant') {
      updateMessage(lastMessage.id, { isComplete: true });
      if (lastMessage.text && enableTranscript) {
        const modelContext = modelContextRef.current;
        recordAssistantMessage(lastMessage.text, {
          messageType: lastMessage.type || 'llm-text',
          conversationRef: event.conversation_ref,
          userId: event.user_id,
          modelId: modelContext.modelId,
          modelProvider: modelContext.modelProvider,
        });
      }
    }

    recordTrackingEvent('streaming-complete', event.turn_ref, { phase: 'complete' });
  }, [
    enableTranscript,
    setIsSending,
    setThinkingStatus,
    updateMessage,
    recordTrackingEvent,
  ]);

  const handleTokenCount = useCallback((event: TokenCountEvent) => {
    setTokenCounts(event.payload ?? null);
    recordTrackingEvent('token-count', event.turn_ref);
  }, [setTokenCounts, recordTrackingEvent]);

  const handleError = useCallback((event: ErrorEvent) => {
    setIsSending(false);
    setThinkingStatus('');
    const errorText = resolveErrorText(event.payload);
    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      text: errorText,
      sender: 'assistant',
      type: 'error',
      turnRef: event.turn_ref,
    };
    addMessage(newMessage);

    recordTrackingEvent('error', event.turn_ref, {
      phase: 'error',
      errorText,
    });

    if (enableTranscript) {
      const modelContext = modelContextRef.current;
      recordAssistantMessage(errorText, {
        messageType: 'error',
        conversationRef: event.conversation_ref,
        userId: event.user_id,
        modelId: modelContext.modelId,
        modelProvider: modelContext.modelProvider,
      });
    }
  }, [addMessage, enableTranscript, setIsSending, setThinkingStatus, recordTrackingEvent]);

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
        updateTranscriptSession(data.conversation_ref ?? null, data.user_id ?? null);
      }
      const handler = handlers[data.type];
      if (handler) {
        handler(data);
      }
    });

    return removeListener;
  }, [enableTranscript, handlers]);
}
