/**
 * useChatStream Hook.
 * Handles streaming message responses from backend.
 * Manages LLM thoughts, streaming chunks, and completion states.
 */

import { useCallback, useEffect, useMemo } from 'react';
import { IpcBridge, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import {
  useChatStore,
  type ChatMessage,
} from '../stores/chatStore';
import { useAppConfigContext } from '../../../app/providers/AppContextHooks';
import {
  getActiveConversationRef,
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
  type ContextCompactionStartedEvent,
  type ContextCompactionCompletedEvent,
  type ContextCompactionFailedEvent,
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
  resolveModelFacingToolCall,
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
  buildUserMessageFullUpdate,
  findStreamingCompleteAssistantMessage,
  resolveStreamingResponseAction,
} from '../utils/chatStreamMessageUpdates';
import {
  applyTrackingEvent,
  type StreamTrackingOptions,
} from '../utils/chatStreamTracking';
import {
  resolveEventConversationRef,
  shouldIgnoreEventForActiveConversation,
} from '../utils/chatStreamConversationGate';
import { useChatCommonActions } from './useChatCommonActions';
import { useStreamMessageUpdaters } from './useStreamMessageUpdaters';
import { useLatestRef } from '../../../infrastructure/hooks/useLatestRef';

type TranscriptModelContext = {
  modelId: string | null;
  modelProvider: string | null;
  supportsThinking: boolean;
  supportsThinkingTextStream: boolean;
};

const COMPACTION_THINKING_STATUS = 'Compacting conversation history...';
const GENERIC_THINKING_STATUS = 'Thinking...';

type ModelCapabilityDescriptor = {
  id?: string;
  provider?: string;
  supports_thinking?: boolean;
  supports_thinking_text_stream?: boolean;
};

function resolveThinkingCapabilities(
  modelId: string | null | undefined,
  modelProvider: string | null | undefined,
  availableModels: { local?: unknown[]; online?: unknown[] } | null | undefined,
): { supportsThinking: boolean; supportsThinkingTextStream: boolean } {
  const normalizedModelId = typeof modelId === 'string' ? modelId : '';
  const normalizedProvider = typeof modelProvider === 'string' ? modelProvider : '';
  const localModels = Array.isArray(availableModels?.local) ? availableModels.local : [];
  const onlineModels = Array.isArray(availableModels?.online) ? availableModels.online : [];
  const allModels = [...localModels, ...onlineModels] as ModelCapabilityDescriptor[];
  const selectedModel = allModels.find(
    (model) => model?.id === normalizedModelId && model?.provider === normalizedProvider,
  ) || allModels.find((model) => model?.id === normalizedModelId);

  const inferredGeminiThinkingModel = (
    normalizedProvider === 'gemini'
    && normalizedModelId.toLowerCase().startsWith('gemini-')
  );
  const supportsThinking = typeof selectedModel?.supports_thinking === 'boolean'
    ? selectedModel.supports_thinking
    : inferredGeminiThinkingModel;

  const supportsThinkingTextStream = (
    typeof selectedModel?.supports_thinking_text_stream === 'boolean'
      ? selectedModel.supports_thinking_text_stream
      : normalizedProvider !== 'gemini'
  );

  return {
    supportsThinking,
    supportsThinkingTextStream: supportsThinking ? supportsThinkingTextStream : false,
  };
}

/**
 * Custom hook for managing streaming message responses.
 * Handles LLM thoughts, streaming chunks, and completion states.
 */
export function useChatStream(enableTranscript: boolean = true) {
  const { addMessage, updateMessage, setIsSending, setThinkingStatus } = useChatCommonActions();
  const setTokenCounts = useChatStore((state) => state.setTokenCounts);
  const updateStreamTracking = useChatStore((state) => state.updateStreamTracking);
  const { config, availableModels } = useAppConfigContext();
  const modelCapabilities = useMemo(() => resolveThinkingCapabilities(
    config?.selected_model_id || null,
    config?.model_provider || null,
    availableModels,
  ), [availableModels, config?.model_provider, config?.selected_model_id]);
  const modelContextRef = useLatestRef<TranscriptModelContext>({
    modelId: config?.selected_model_id || null,
    modelProvider: config?.model_provider || null,
    supportsThinking: modelCapabilities.supportsThinking,
    supportsThinkingTextStream: modelCapabilities.supportsThinkingTextStream,
  });

  const recordTrackingEvent = useCallback((
    eventType: BackendEventType,
    turnRef: string | null | undefined,
    options: StreamTrackingOptions = {},
  ) => {
    const now = new Date().toISOString();
    updateStreamTracking((current) => applyTrackingEvent(current, eventType, turnRef, now, options));
  }, [updateStreamTracking]);

  const {
    updateLastMessageBySender,
    updateFirstMessageBySender,
    updateLastAssistantLlmTextMessage,
  } = useStreamMessageUpdaters(updateMessage);

  const handleLlmThought = useCallback((event: LlmThoughtEvent) => {
    const currentStatus = useChatStore.getState().thinkingStatus;
    const payload = event.payload as { status?: string; content?: string } | undefined;
    const thoughtChunk =
      typeof payload?.status === 'string'
        ? payload.status
        : typeof payload?.content === 'string'
          ? payload.content
          : undefined;
    const nextBaseStatus = currentStatus === GENERIC_THINKING_STATUS ? null : currentStatus;
    setThinkingStatus(buildThinkingStatus(nextBaseStatus, thoughtChunk));
    recordTrackingEvent('llm-thought', event.turn_ref);
  }, [setThinkingStatus, recordTrackingEvent]);

  const handleStreamingResponse = useCallback((event: StreamingResponseEvent) => {
    setIsSending(false);
    const modelContext = modelContextRef.current;
    const modelMetadata = {
      modelId: modelContext.modelId,
      modelProvider: modelContext.modelProvider,
    };

    const action = resolveStreamingResponseAction(
      useChatStore.getState().messages,
      event.payload?.text,
      event.turn_ref,
    );
    if (action.type === 'append') {
      updateMessage(action.messageId, {
        text: action.nextText,
        type: 'llm-text',
        ...modelMetadata,
      });
    } else {
      const newMessage: ChatMessage = {
        id: crypto.randomUUID(),
        text: action.text,
        sender: 'assistant',
        isComplete: false,
        type: 'llm-text',
        turnRef: action.turnRef,
        ...modelMetadata,
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
    modelContextRef,
    recordTrackingEvent,
  ]);

  const handleContextCompactionStarted = useCallback((event: ContextCompactionStartedEvent) => {
    setThinkingStatus(COMPACTION_THINKING_STATUS);
    recordTrackingEvent('context-compaction-started', event.turn_ref);
  }, [setThinkingStatus, recordTrackingEvent]);

  const handleContextCompactionCompleted = useCallback((event: ContextCompactionCompletedEvent) => {
    if (useChatStore.getState().thinkingStatus === COMPACTION_THINKING_STATUS) {
      setThinkingStatus(null);
    }
    recordTrackingEvent('context-compaction-completed', event.turn_ref);
  }, [setThinkingStatus, recordTrackingEvent]);

  const handleContextCompactionFailed = useCallback((event: ContextCompactionFailedEvent) => {
    if (useChatStore.getState().thinkingStatus === COMPACTION_THINKING_STATUS) {
      setThinkingStatus(null);
    }
    recordTrackingEvent('context-compaction-failed', event.turn_ref);
  }, [setThinkingStatus, recordTrackingEvent]);

  const handleToolCall = useCallback((event: ToolCallEvent) => {
    setThinkingStatus(null);
    const modelFacingToolCall = resolveModelFacingToolCall(event.payload);
    const formattedText = formatToolCallPayload(event.payload);
    const modelContext = modelContextRef.current;

    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      text: formattedText,
      sender: 'assistant',
      type: 'tool-call',
      modelFacingToolCall,
      toolCallDetails: (
        event.payload && typeof event.payload === 'object'
          ? { ...event.payload }
          : null
      ),
      turnRef: event.turn_ref,
      modelId: modelContext.modelId,
      modelProvider: modelContext.modelProvider,
    };
    addMessage(newMessage);

    recordTrackingEvent('tool-call', event.turn_ref, { toolCall: true });

    const correlationId = event.payload?.correlation_id || event.payload?.request_id;

    if (enableTranscript) {
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
  }, [addMessage, enableTranscript, modelContextRef, setThinkingStatus, recordTrackingEvent]);

  const handleToolOutput = useCallback((event: ToolOutputEvent) => {
    setThinkingStatus(null);
    const outputText = formatToolOutputText(event.payload);
    const { screenshotRef, screenshotUrl } = buildScreenshotAttachment(event.payload?.screenshot_ref);
    const modelContext = modelContextRef.current;

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
      modelFacingToolOutput: outputText,
      toolOutputDetails: (
        event.payload && typeof event.payload === 'object'
          ? { ...event.payload }
          : null
      ),
      turnRef: event.turn_ref,
      modelId: modelContext.modelId,
      modelProvider: modelContext.modelProvider,
    };

    addMessage(newMessage);
    recordTrackingEvent('tool-output', event.turn_ref, { toolOutput: true });

    const correlationId = resolveToolOutputCorrelationId(event.payload, event.id) || undefined;

    if (enableTranscript) {
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
  }, [addMessage, enableTranscript, modelContextRef, setThinkingStatus, recordTrackingEvent]);

  const handleToolBundle = useCallback((event: ToolBundleEvent) => {
    setThinkingStatus(null);
    const formattedText = formatToolBundlePayload(event.payload);
    const modelContext = modelContextRef.current;

    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      text: formattedText,
      sender: 'assistant',
      type: 'tool-call',
      toolCallDetails: (
        event.payload && typeof event.payload === 'object'
          ? { ...event.payload }
          : null
      ),
      turnRef: event.turn_ref,
      modelId: modelContext.modelId,
      modelProvider: modelContext.modelProvider,
    };
    addMessage(newMessage);

    recordTrackingEvent('tool-bundle', event.turn_ref, { phase: 'tool-call', toolCall: true });

    if (enableTranscript) {
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
  }, [addMessage, enableTranscript, modelContextRef, setThinkingStatus, recordTrackingEvent]);

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
    const modelContext = modelContextRef.current;
    if (modelContext.supportsThinking && !modelContext.supportsThinkingTextStream) {
      setThinkingStatus(GENERIC_THINKING_STATUS);
    } else {
      setThinkingStatus(null);
    }

    recordTrackingEvent('local-user-message', event.turn_ref, {
      phase: 'awaiting-first-chunk',
      resetForTurn: true,
    });
  }, [addMessage, modelContextRef, recordTrackingEvent, setThinkingStatus]);

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
    modelContextRef,
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
    const modelContext = modelContextRef.current;
    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      text: errorText,
      sender: 'assistant',
      type: 'error',
      turnRef: event.turn_ref,
      modelId: modelContext.modelId,
      modelProvider: modelContext.modelProvider,
    };
    addMessage(newMessage);

    recordTrackingEvent('error', event.turn_ref, {
      phase: 'error',
      errorText,
    });

    if (enableTranscript) {
      recordAssistantMessage(errorText, {
        messageType: 'error',
        conversationRef: event.conversation_ref,
        userId: event.user_id,
        modelId: modelContext.modelId,
        modelProvider: modelContext.modelProvider,
      });
    }
  }, [addMessage, enableTranscript, modelContextRef, setIsSending, setThinkingStatus, recordTrackingEvent]);

  const handlers = useMemo<Record<BackendEventType, (event: BackendEvent) => void>>(() => ({
    'llm-thought': event => handleLlmThought(event as LlmThoughtEvent),
    'streaming-response': event => handleStreamingResponse(event as StreamingResponseEvent),
    'streaming-complete': event => handleStreamingComplete(event as StreamingCompleteEvent),
    'context-compaction-started': event => handleContextCompactionStarted(event as ContextCompactionStartedEvent),
    'context-compaction-completed': event => handleContextCompactionCompleted(event as ContextCompactionCompletedEvent),
    'context-compaction-failed': event => handleContextCompactionFailed(event as ContextCompactionFailedEvent),
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
    handleContextCompactionStarted,
    handleContextCompactionCompleted,
    handleContextCompactionFailed,
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
      const { streamTracking } = useChatStore.getState();
      if (shouldIgnoreEventForActiveConversation(data, getActiveConversationRef(), streamTracking)) {
        return;
      }
      if (enableTranscript) {
        updateTranscriptSession(resolveEventConversationRef(data) ?? undefined, data.user_id);
      }
      const handler = handlers[data.type];
      if (handler) {
        handler(data);
      }
    });

    return removeListener;
  }, [enableTranscript, handlers]);
}
