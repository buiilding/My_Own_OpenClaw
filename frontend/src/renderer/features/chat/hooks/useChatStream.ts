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
  updateTranscriptSession,
} from '../../../infrastructure/transcript/TranscriptWriter';
import type { TranscriptTransparencyData } from '../../../infrastructure/transcript/types';
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
  type MemoryStoreEvent,
  type TokenCountEvent,
  type ToolSchemasEvent,
  type LocalUserMessageEvent,
  type ErrorEvent,
  isBackendEvent,
} from '../../../types/backendEvents';
import {
  buildThinkingStatus,
} from '../utils/chatStreamFormatting';
import {
  buildScreenshotAttachment,
  buildScreenshotAttachments,
  resolveErrorText,
  shouldIgnoreStreamError,
} from '../utils/chatStreamEventUtils';
import {
  buildAssistantMessageFullUpdate,
  buildSystemPromptUpdate,
  buildUserMessageFullUpdate,
  findLastAssistantLlmTextMessageId,
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
import { resolveThinkingCapabilities } from '../utils/modelThinkingCapabilities';
import {
  COMPACTION_THINKING_STATUS,
  COMPACTION_COMPLETED_NO_CHANGES_THINKING_STATUS,
  COMPACTION_COMPLETED_THINKING_STATUS,
  COMPACTION_FAILED_THINKING_STATUS,
  GENERIC_THINKING_STATUS,
  normalizePersistedThinkingStatus,
} from '../utils/chatStreamThinkingStatus';
import { type TranscriptModelContext } from '../utils/chatStreamTypes';
import { useChatCommonActions } from './useChatCommonActions';
import { useStreamMessageUpdaters } from './useStreamMessageUpdaters';
import { useChatStreamToolHandlers } from './useChatStreamToolHandlers';
import { useLatestRef } from '../../../infrastructure/hooks/useLatestRef';

export function useChatStream(enableTranscript: boolean = true) {
  const {
    addMessage,
    updateMessage,
    setIsSending,
    setThinkingStatus,
    setThinkingSourceEventType,
  } = useChatCommonActions();
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

  const persistThinkingForTurn = useCallback((turnRef?: string) => {
    const state = useChatStore.getState();
    const thinkingText = normalizePersistedThinkingStatus(state.thinkingStatus);
    if (!thinkingText) {
      return;
    }
    updateLastAssistantLlmTextMessage({
      thinkingText,
      thinkingSourceEventType: state.thinkingSourceEventType || 'llm-thought',
    }, turnRef);
  }, [updateLastAssistantLlmTextMessage]);

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
    const nextThinkingStatus = buildThinkingStatus(nextBaseStatus, thoughtChunk);
    setThinkingStatus(nextThinkingStatus);
    setThinkingSourceEventType('llm-thought');

    const modelContext = modelContextRef.current;
    const modelMetadata = {
      modelId: modelContext.modelId,
      modelProvider: modelContext.modelProvider,
    };
    const turnRef = event.turn_ref || undefined;
    const messages = useChatStore.getState().messages;
    const assistantMessageId = findLastAssistantLlmTextMessageId(messages, turnRef);
    if (assistantMessageId) {
      const assistantMessage = messages.find((message) => message.id === assistantMessageId);
      const nextMessageThinkingText = buildThinkingStatus(
        typeof assistantMessage?.thinkingText === 'string' ? assistantMessage.thinkingText : null,
        thoughtChunk,
      );
      updateMessage(assistantMessageId, {
        thinkingText: nextMessageThinkingText,
        thinkingSourceEventType: 'llm-thought',
        ...modelMetadata,
      });
    } else if (nextThinkingStatus.trim()) {
      const placeholderAssistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        text: '',
        sender: 'assistant',
        isComplete: false,
        type: 'llm-text',
        sourceEventType: 'streaming-response',
        sourceChannel: 'from-backend',
        turnRef,
        thinkingText: nextThinkingStatus,
        thinkingSourceEventType: 'llm-thought',
        ...modelMetadata,
      };
      addMessage(placeholderAssistantMessage);
    }

    recordTrackingEvent('llm-thought', event.turn_ref);
  }, [
    addMessage,
    modelContextRef,
    recordTrackingEvent,
    setThinkingSourceEventType,
    setThinkingStatus,
    updateMessage,
  ]);

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
        sourceEventType: 'streaming-response',
        sourceChannel: 'from-backend',
        ...modelMetadata,
      });
    } else {
      const newMessage: ChatMessage = {
        id: crypto.randomUUID(),
        text: action.text,
        sender: 'assistant',
        isComplete: false,
        type: 'llm-text',
        sourceEventType: 'streaming-response',
        sourceChannel: 'from-backend',
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
    setThinkingSourceEventType('context-compaction-started');
    recordTrackingEvent('context-compaction-started', event.turn_ref);
  }, [setThinkingSourceEventType, setThinkingStatus, recordTrackingEvent]);

  const handleContextCompactionCompleted = useCallback((event: ContextCompactionCompletedEvent) => {
    const skippedReason = (
      typeof event.payload?.skipped_reason === 'string'
        ? event.payload.skipped_reason.trim()
        : ''
    );
    setThinkingStatus(
      skippedReason
        ? COMPACTION_COMPLETED_NO_CHANGES_THINKING_STATUS
        : COMPACTION_COMPLETED_THINKING_STATUS,
    );
    setThinkingSourceEventType('context-compaction-completed');
    recordTrackingEvent('context-compaction-completed', event.turn_ref);
  }, [recordTrackingEvent, setThinkingSourceEventType, setThinkingStatus]);

  const handleContextCompactionFailed = useCallback((event: ContextCompactionFailedEvent) => {
    const errorText = (
      typeof event.payload?.error === 'string'
        ? event.payload.error.trim()
        : ''
    );
    setThinkingStatus(errorText || COMPACTION_FAILED_THINKING_STATUS);
    setThinkingSourceEventType('context-compaction-failed');
    recordTrackingEvent('context-compaction-failed', event.turn_ref);
  }, [recordTrackingEvent, setThinkingSourceEventType, setThinkingStatus]);

  const {
    handleToolCall,
    handleToolOutput,
    handleToolBundle,
  } = useChatStreamToolHandlers({
    enableTranscript,
    addMessage,
    setThinkingStatus,
    setThinkingSourceEventType,
    modelContextRef,
    recordTrackingEvent,
  });

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
    const screenshotAttachments = buildScreenshotAttachments(
      event.payload?.screenshot_refs || [event.payload?.screenshot_ref],
      event.payload?.screenshot_url,
    );
    const firstScreenshotAttachment = screenshotAttachments[0] || buildScreenshotAttachment(
      event.payload?.screenshot_ref,
      event.payload?.screenshot_url,
    );
    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      text,
      sender: 'user',
      sourceEventType: 'local-user-message',
      sourceChannel: 'from-backend',
      screenshotRef: firstScreenshotAttachment.screenshotRef,
      screenshotUrl: firstScreenshotAttachment.screenshotUrl,
      screenshots: screenshotAttachments.length > 0
        ? screenshotAttachments.map((attachment) => ({
          screenshotRef: attachment.screenshotRef,
          screenshotUrl: attachment.screenshotUrl,
        }))
        : null,
      timestamp: event.payload?.timestamp,
      turnRef: event.turn_ref,
    };
    addMessage(newMessage);
    const modelContext = modelContextRef.current;
    if (modelContext.supportsThinking && !modelContext.supportsThinkingTextStream) {
      setThinkingStatus(GENERIC_THINKING_STATUS);
      setThinkingSourceEventType('local-user-message');
    } else {
      setThinkingStatus(null);
      setThinkingSourceEventType(null);
    }

    recordTrackingEvent('local-user-message', event.turn_ref, {
      phase: 'awaiting-first-chunk',
      resetForTurn: true,
    });
  }, [
    addMessage,
    modelContextRef,
    recordTrackingEvent,
    setThinkingSourceEventType,
    setThinkingStatus,
  ]);

  const handleStreamingComplete = useCallback((event: StreamingCompleteEvent) => {
    setIsSending(false);
    persistThinkingForTurn(event.turn_ref || undefined);
    setThinkingStatus(null);
    setThinkingSourceEventType(null);

    const currentMessages = useChatStore.getState().messages;
    const lastMessage = findStreamingCompleteAssistantMessage(
      currentMessages,
      event.turn_ref,
    );
    if (lastMessage && lastMessage.sender === 'assistant') {
      updateMessage(lastMessage.id, { isComplete: true });
      if (lastMessage.text && enableTranscript) {
        const userMessageForTurn = (
          currentMessages
            .slice()
            .reverse()
            .find((message) => (
              message.sender === 'user'
              && (!event.turn_ref || message.turnRef === event.turn_ref)
            ))
          || currentMessages
            .slice()
            .reverse()
            .find((message) => message.sender === 'user')
          || null
        );
        const transparency: TranscriptTransparencyData = {};
        const systemPromptContent = (
          typeof userMessageForTurn?.systemPrompt?.content === 'string'
            ? userMessageForTurn.systemPrompt.content.trim()
            : ''
        );
        if (systemPromptContent) {
          transparency.systemPrompt = systemPromptContent;
        }
        const toolSchemas = (
          Array.isArray(userMessageForTurn?.toolSchemas)
            ? userMessageForTurn.toolSchemas
            : Array.isArray(userMessageForTurn?.systemPrompt?.toolSchemas)
              ? userMessageForTurn.systemPrompt.toolSchemas
              : null
        );
        if (Array.isArray(toolSchemas) && toolSchemas.length > 0) {
          transparency.toolSchemas = toolSchemas;
        }
        const fullUserContent = (
          typeof userMessageForTurn?.fullUserMessage?.content === 'string'
            ? userMessageForTurn.fullUserMessage.content.trim()
            : ''
        );
        const fullUserMetadata = (
          userMessageForTurn?.fullUserMessage?.metadata
          && typeof userMessageForTurn.fullUserMessage.metadata === 'object'
          && !Array.isArray(userMessageForTurn.fullUserMessage.metadata)
        )
          ? userMessageForTurn.fullUserMessage.metadata as Record<string, unknown>
          : null;
        if (fullUserContent || fullUserMetadata) {
          transparency.fullUserMessage = {
            content: fullUserContent || undefined,
            metadata: fullUserMetadata || undefined,
          };
        }
        const fullAssistantContent = (
          typeof lastMessage.fullAssistantMessage?.content === 'string'
            ? lastMessage.fullAssistantMessage.content.trim()
            : ''
        );
        if (fullAssistantContent) {
          transparency.fullAssistantMessage = {
            content: fullAssistantContent,
          };
        }
        const normalizedTransparency = Object.keys(transparency).length > 0
          ? transparency
          : undefined;
        const modelContext = modelContextRef.current;
        recordAssistantMessage(lastMessage.text, {
          messageType: lastMessage.type || 'llm-text',
          conversationRef: event.conversation_ref,
          userId: event.user_id,
          modelId: modelContext.modelId,
          modelProvider: modelContext.modelProvider,
          transparency: normalizedTransparency,
        });
      }
    }

    recordTrackingEvent('streaming-complete', event.turn_ref, { phase: 'complete' });
  }, [
    enableTranscript,
    persistThinkingForTurn,
    setIsSending,
    setThinkingSourceEventType,
    setThinkingStatus,
    updateMessage,
    modelContextRef,
    recordTrackingEvent,
  ]);

  const handleTokenCount = useCallback((event: TokenCountEvent) => {
    setTokenCounts(event.payload ?? null);
    recordTrackingEvent('token-count', event.turn_ref);
  }, [setTokenCounts, recordTrackingEvent]);

  const handleMemoryStore = useCallback((event: MemoryStoreEvent) => {
    recordTrackingEvent('memory-store', event.turn_ref);
  }, [recordTrackingEvent]);

  const handleError = useCallback((event: ErrorEvent) => {
    setIsSending(false);
    setThinkingStatus('');
    setThinkingSourceEventType(null);
    const errorText = resolveErrorText(event.payload);
    const modelContext = modelContextRef.current;
    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      text: errorText,
      sender: 'assistant',
      type: 'error',
      sourceEventType: 'error',
      sourceChannel: 'from-backend',
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
  }, [
    addMessage,
    enableTranscript,
    modelContextRef,
    setIsSending,
    setThinkingSourceEventType,
    setThinkingStatus,
    recordTrackingEvent,
  ]);

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
    'memory-store': event => handleMemoryStore(event as MemoryStoreEvent),
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
    handleMemoryStore,
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
