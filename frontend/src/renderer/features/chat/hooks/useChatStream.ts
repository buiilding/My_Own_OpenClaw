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
  type SystemPromptEvent,
  type UserMessageFullEvent,
  type AssistantMessageFullEvent,
  type ToolSchemasEvent,
  type ToolCallEvent,
  type ToolOutputEvent,
  type ToolBundleEvent,
  type LocalUserMessageEvent,
  type MemoryStoreEvent,
  type TokenCountEvent,
  type ErrorEvent,
  isBackendEvent,
} from '../../../types/backendEvents';
import {
  buildThinkingStatus,
} from '../utils/chatStreamFormatting';
import {
  buildAssistantMessageFullUpdate,
  buildSystemPromptUpdate,
  buildUserMessageFullUpdate,
  findLastAssistantLlmTextMessageId,
  findStreamingCompleteAssistantMessage,
  resolveStreamingResponseAction,
} from '../utils/chatStreamMessageUpdates';
import {
  type StreamTrackingOptions,
} from '../utils/chatStreamTracking';
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
import { useChatStreamTerminalHandlers } from './useChatStreamTerminalHandlers';
import { buildChatStreamHandlerMap } from '../utils/chatStreamHandlerMap';
import { useChatStreamLocalUserHandler } from './useChatStreamLocalUserHandler';
import { buildAssistantTranscriptTransparency } from '../utils/chatStreamTransparency';
import {
  recordTrackingEvent as recordTrackingEventRuntime,
  resolveTargetConversationRef as resolveTargetConversationRefRuntime,
  shouldIgnoreForStaleTurn as shouldIgnoreForStaleTurnRuntime,
  syncActiveConversationProjection as syncActiveConversationProjectionRuntime,
} from '../utils/chatStreamEventRuntime';

export function useChatStream(enableTranscript: boolean = true) {
  const {
    addMessage,
    updateMessage,
    setIsSending,
    setThinkingStatus,
    setThinkingSourceEventType,
  } = useChatCommonActions();
  const updateStreamTracking = useChatStore((state) => state.updateStreamTracking);
  const setActiveConversationRef = useChatStore((state) => state.setActiveConversationRef);
  const registerTurnConversationRef = useChatStore((state) => state.registerTurnConversationRef);
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

  const resolveTargetConversationRef = useCallback(
    (event: BackendEvent): string | null => resolveTargetConversationRefRuntime(
      event,
      getActiveConversationRef(),
    ),
    [],
  );

  const syncActiveConversationProjection = useCallback((
    event: BackendEvent,
    conversationRef: string | null,
  ) => syncActiveConversationProjectionRuntime(event, conversationRef, setActiveConversationRef), [
    setActiveConversationRef,
  ]);

  const recordTrackingEvent = useCallback((
    eventType: BackendEventType,
    turnRef: string | null | undefined,
    options: StreamTrackingOptions = {},
    conversationRef?: string | null,
  ) => recordTrackingEventRuntime(
    updateStreamTracking,
    eventType,
    turnRef,
    options,
    conversationRef,
  ), [updateStreamTracking]);

  // Active-turn gating is shared across most handlers so late events from older turns
  // never mutate the current workspace stream state.
  const shouldIgnoreForStaleTurn = useCallback((
    event: BackendEvent,
    conversationRef?: string | null,
  ): boolean => shouldIgnoreForStaleTurnRuntime(event, conversationRef), []);

  const {
    updateLastMessageBySender,
    updateFirstMessageBySender,
    updateLastAssistantLlmTextMessage,
  } = useStreamMessageUpdaters(updateMessage);

  const persistThinkingForTurn = useCallback((
    turnRef?: string,
    conversationRef?: string | null,
  ) => {
    const workspace = useChatStore.getState().getWorkspaceState(conversationRef);
    const thinkingText = normalizePersistedThinkingStatus(workspace.thinkingStatus);
    if (!thinkingText) {
      return;
    }
    updateLastAssistantLlmTextMessage({
      thinkingText,
      thinkingSourceEventType: workspace.thinkingSourceEventType || 'llm-thought',
    }, turnRef, conversationRef);
  }, [updateLastAssistantLlmTextMessage]);

  const handleLlmThought = useCallback((event: LlmThoughtEvent) => {
    const conversationRef = resolveTargetConversationRef(event);
    if (shouldIgnoreForStaleTurn(event, conversationRef)) {
      return;
    }
    const workspace = useChatStore.getState().getWorkspaceState(conversationRef);
    const currentStatus = workspace.thinkingStatus;
    const payload = event.payload as { status?: string; content?: string } | undefined;
    const thoughtChunk =
      typeof payload?.status === 'string'
        ? payload.status
        : typeof payload?.content === 'string'
          ? payload.content
          : undefined;
    const nextBaseStatus = currentStatus === GENERIC_THINKING_STATUS ? null : currentStatus;
    const nextThinkingStatus = buildThinkingStatus(nextBaseStatus, thoughtChunk);
    setThinkingStatus(nextThinkingStatus, conversationRef);
    setThinkingSourceEventType('llm-thought', conversationRef);

    const modelContext = modelContextRef.current;
    const modelMetadata = {
      modelId: modelContext.modelId,
      modelProvider: modelContext.modelProvider,
    };
    const turnRef = event.turn_ref || undefined;
    const messages = useChatStore.getState().getWorkspaceState(conversationRef).messages;
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
      }, conversationRef);
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
      addMessage(placeholderAssistantMessage, conversationRef);
    }

    recordTrackingEvent('llm-thought', event.turn_ref, {}, conversationRef);
  }, [
    addMessage,
    modelContextRef,
    resolveTargetConversationRef,
    recordTrackingEvent,
    setThinkingSourceEventType,
    setThinkingStatus,
    shouldIgnoreForStaleTurn,
    updateMessage,
  ]);

  const handleStreamingResponse = useCallback((event: StreamingResponseEvent) => {
    const conversationRef = resolveTargetConversationRef(event);
    if (shouldIgnoreForStaleTurn(event, conversationRef)) {
      return;
    }
    setIsSending(false, conversationRef);
    const modelContext = modelContextRef.current;
    const modelMetadata = {
      modelId: modelContext.modelId,
      modelProvider: modelContext.modelProvider,
    };

    const action = resolveStreamingResponseAction(
      useChatStore.getState().getWorkspaceState(conversationRef).messages,
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
      }, conversationRef);
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
      addMessage(newMessage, conversationRef);
    }

    recordTrackingEvent('streaming-response', event.turn_ref, {
      phase: 'streaming',
      chunkSize: (event.payload?.text || '').length,
    }, conversationRef);
  }, [
    addMessage,
    updateMessage,
    setIsSending,
    modelContextRef,
    resolveTargetConversationRef,
    recordTrackingEvent,
    shouldIgnoreForStaleTurn,
  ]);

  const handleContextCompactionStarted = useCallback((event: ContextCompactionStartedEvent) => {
    const conversationRef = resolveTargetConversationRef(event);
    if (shouldIgnoreForStaleTurn(event, conversationRef)) {
      return;
    }
    setThinkingStatus(COMPACTION_THINKING_STATUS, conversationRef);
    setThinkingSourceEventType('context-compaction-started', conversationRef);
    recordTrackingEvent('context-compaction-started', event.turn_ref, {}, conversationRef);
  }, [
    resolveTargetConversationRef,
    setThinkingSourceEventType,
    setThinkingStatus,
    recordTrackingEvent,
    shouldIgnoreForStaleTurn,
  ]);

  const handleContextCompactionCompleted = useCallback((event: ContextCompactionCompletedEvent) => {
    const conversationRef = resolveTargetConversationRef(event);
    if (shouldIgnoreForStaleTurn(event, conversationRef)) {
      return;
    }
    const skippedReason = (
      typeof event.payload?.skipped_reason === 'string'
        ? event.payload.skipped_reason.trim()
        : ''
    );
    setThinkingStatus(
      skippedReason
        ? COMPACTION_COMPLETED_NO_CHANGES_THINKING_STATUS
        : COMPACTION_COMPLETED_THINKING_STATUS,
      conversationRef,
    );
    setThinkingSourceEventType('context-compaction-completed', conversationRef);
    recordTrackingEvent('context-compaction-completed', event.turn_ref, {}, conversationRef);
  }, [
    recordTrackingEvent,
    resolveTargetConversationRef,
    setThinkingSourceEventType,
    setThinkingStatus,
    shouldIgnoreForStaleTurn,
  ]);

  const handleContextCompactionFailed = useCallback((event: ContextCompactionFailedEvent) => {
    const conversationRef = resolveTargetConversationRef(event);
    if (shouldIgnoreForStaleTurn(event, conversationRef)) {
      return;
    }
    const errorText = (
      typeof event.payload?.error === 'string'
        ? event.payload.error.trim()
        : ''
    );
    setThinkingStatus(errorText || COMPACTION_FAILED_THINKING_STATUS, conversationRef);
    setThinkingSourceEventType('context-compaction-failed', conversationRef);
    recordTrackingEvent('context-compaction-failed', event.turn_ref, {}, conversationRef);
  }, [
    recordTrackingEvent,
    resolveTargetConversationRef,
    setThinkingSourceEventType,
    setThinkingStatus,
    shouldIgnoreForStaleTurn,
  ]);

  const {
    handleToolCall,
    handleToolOutput,
    handleToolBundle,
  } = useChatStreamToolHandlers({
    enableTranscript,
    addMessage,
    setIsSending,
    setThinkingStatus,
    setThinkingSourceEventType,
    modelContextRef,
    recordTrackingEvent,
  });

  const handleSystemPrompt = useCallback((event: SystemPromptEvent) => {
    const conversationRef = resolveTargetConversationRef(event);
    if (shouldIgnoreForStaleTurn(event, conversationRef)) {
      return;
    }
    updateLastMessageBySender('user', {
      systemPrompt: buildSystemPromptUpdate(event.payload),
    }, event.turn_ref || undefined, conversationRef);
    recordTrackingEvent('system-prompt', event.turn_ref, {}, conversationRef);
  }, [
    resolveTargetConversationRef,
    updateLastMessageBySender,
    recordTrackingEvent,
    shouldIgnoreForStaleTurn,
  ]);

  const handleUserMessageFull = useCallback((event: UserMessageFullEvent) => {
    const conversationRef = resolveTargetConversationRef(event);
    if (shouldIgnoreForStaleTurn(event, conversationRef)) {
      return;
    }
    updateLastMessageBySender('user', {
      fullUserMessage: buildUserMessageFullUpdate(event.payload),
    }, event.turn_ref || undefined, conversationRef);
    recordTrackingEvent('user-message-full', event.turn_ref, {}, conversationRef);
  }, [
    resolveTargetConversationRef,
    updateLastMessageBySender,
    recordTrackingEvent,
    shouldIgnoreForStaleTurn,
  ]);

  const handleAssistantMessageFull = useCallback((event: AssistantMessageFullEvent) => {
    const conversationRef = resolveTargetConversationRef(event);
    if (shouldIgnoreForStaleTurn(event, conversationRef)) {
      return;
    }
    updateLastAssistantLlmTextMessage({
      fullAssistantMessage: buildAssistantMessageFullUpdate(event.payload),
    }, event.turn_ref || undefined, conversationRef);
    recordTrackingEvent('assistant-message-full', event.turn_ref, {}, conversationRef);
  }, [
    resolveTargetConversationRef,
    updateLastAssistantLlmTextMessage,
    recordTrackingEvent,
    shouldIgnoreForStaleTurn,
  ]);

  const handleToolSchemas = useCallback((event: ToolSchemasEvent) => {
    const conversationRef = resolveTargetConversationRef(event);
    if (shouldIgnoreForStaleTurn(event, conversationRef)) {
      return;
    }
    updateFirstMessageBySender('user', {
      toolSchemas: event.payload?.tool_schemas,
    }, conversationRef);
    recordTrackingEvent('tool-schemas', event.turn_ref, {}, conversationRef);
  }, [
    resolveTargetConversationRef,
    updateFirstMessageBySender,
    recordTrackingEvent,
    shouldIgnoreForStaleTurn,
  ]);

  const handleLocalUserMessage = useChatStreamLocalUserHandler({
    addMessage,
    modelContextRef,
    recordTrackingEvent,
    setIsSending,
    setThinkingSourceEventType,
    setThinkingStatus,
  });

  const handleToolCallEvent = useCallback((event: ToolCallEvent) => {
    const conversationRef = resolveTargetConversationRef(event);
    if (shouldIgnoreForStaleTurn(event, conversationRef)) {
      return;
    }
    handleToolCall(event, conversationRef);
  }, [handleToolCall, resolveTargetConversationRef, shouldIgnoreForStaleTurn]);

  const handleToolOutputEvent = useCallback((event: ToolOutputEvent) => {
    const conversationRef = resolveTargetConversationRef(event);
    if (shouldIgnoreForStaleTurn(event, conversationRef)) {
      return;
    }
    handleToolOutput(event, conversationRef);
  }, [handleToolOutput, resolveTargetConversationRef, shouldIgnoreForStaleTurn]);

  const handleToolBundleEvent = useCallback((event: ToolBundleEvent) => {
    const conversationRef = resolveTargetConversationRef(event);
    if (shouldIgnoreForStaleTurn(event, conversationRef)) {
      return;
    }
    handleToolBundle(event, conversationRef);
  }, [handleToolBundle, resolveTargetConversationRef, shouldIgnoreForStaleTurn]);

  const handleLocalUserMessageEvent = useCallback((event: LocalUserMessageEvent) => {
    const conversationRef = resolveTargetConversationRef(event);
    handleLocalUserMessage(event, conversationRef);
  }, [handleLocalUserMessage, resolveTargetConversationRef]);

  const handleStreamingComplete = useCallback((event: StreamingCompleteEvent) => {
    const conversationRef = resolveTargetConversationRef(event);
    if (shouldIgnoreForStaleTurn(event, conversationRef)) {
      return;
    }
    const workspace = useChatStore.getState().getWorkspaceState(conversationRef);
    setIsSending(false, conversationRef);
    persistThinkingForTurn(event.turn_ref || undefined, conversationRef);
    setThinkingStatus(null, conversationRef);
    setThinkingSourceEventType(null, conversationRef);

    const currentMessages = workspace.messages;
    const lastMessage = findStreamingCompleteAssistantMessage(
      currentMessages,
      event.turn_ref,
    );
    if (lastMessage && lastMessage.sender === 'assistant' && !lastMessage.isComplete) {
      updateMessage(lastMessage.id, { isComplete: true }, conversationRef);
      if (lastMessage.text && enableTranscript) {
        const normalizedTransparency: TranscriptTransparencyData | undefined = (
          buildAssistantTranscriptTransparency(currentMessages, lastMessage, event.turn_ref || undefined)
        );
        const modelContext = modelContextRef.current;
        recordAssistantMessage(lastMessage.text, {
          messageType: lastMessage.type || 'llm-text',
          conversationRef: conversationRef || event.conversation_ref,
          userId: event.user_id,
          modelId: modelContext.modelId,
          modelProvider: modelContext.modelProvider,
          transparency: normalizedTransparency,
        });
      }
    }

    recordTrackingEvent('streaming-complete', event.turn_ref, { phase: 'complete' }, conversationRef);
  }, [
    enableTranscript,
    persistThinkingForTurn,
    resolveTargetConversationRef,
    setIsSending,
    setThinkingSourceEventType,
    setThinkingStatus,
    updateMessage,
    modelContextRef,
    recordTrackingEvent,
    shouldIgnoreForStaleTurn,
  ]);

  const {
    handleError,
    handleMemoryStore,
    handleTokenCount,
  } = useChatStreamTerminalHandlers({
    addMessage,
    enableTranscript,
    modelContextRef,
    recordTrackingEvent,
    setIsSending,
    setThinkingSourceEventType,
    setThinkingStatus,
  });

  const handleMemoryStoreEvent = useCallback((event: MemoryStoreEvent) => {
    const conversationRef = resolveTargetConversationRef(event);
    if (shouldIgnoreForStaleTurn(event, conversationRef)) {
      return;
    }
    handleMemoryStore(event, conversationRef);
  }, [handleMemoryStore, resolveTargetConversationRef, shouldIgnoreForStaleTurn]);

  const handleTokenCountEvent = useCallback((event: TokenCountEvent) => {
    const conversationRef = resolveTargetConversationRef(event);
    if (shouldIgnoreForStaleTurn(event, conversationRef)) {
      return;
    }
    handleTokenCount(event, conversationRef);
  }, [handleTokenCount, resolveTargetConversationRef, shouldIgnoreForStaleTurn]);

  const handleErrorEvent = useCallback((event: ErrorEvent) => {
    const conversationRef = resolveTargetConversationRef(event);
    if (shouldIgnoreForStaleTurn(event, conversationRef)) {
      return;
    }
    handleError(event, conversationRef);
  }, [handleError, resolveTargetConversationRef, shouldIgnoreForStaleTurn]);

  const handlers = useMemo<Record<BackendEventType, (event: BackendEvent) => void>>(() => buildChatStreamHandlerMap({
    handleLlmThought,
    handleStreamingResponse,
    handleStreamingComplete,
    handleContextCompactionStarted,
    handleContextCompactionCompleted,
    handleContextCompactionFailed,
    handleToolCall: handleToolCallEvent,
    handleToolOutput: handleToolOutputEvent,
    handleToolBundle: handleToolBundleEvent,
    handleSystemPrompt,
    handleLocalUserMessage: handleLocalUserMessageEvent,
    handleUserMessageFull,
    handleAssistantMessageFull,
    handleMemoryStore: handleMemoryStoreEvent,
    handleTokenCount: handleTokenCountEvent,
    handleToolSchemas,
    handleError: handleErrorEvent,
  }), [
    handleLlmThought,
    handleStreamingResponse,
    handleStreamingComplete,
    handleContextCompactionStarted,
    handleContextCompactionCompleted,
    handleContextCompactionFailed,
    handleToolCallEvent,
    handleToolOutputEvent,
    handleToolBundleEvent,
    handleSystemPrompt,
    handleLocalUserMessageEvent,
    handleUserMessageFull,
    handleAssistantMessageFull,
    handleMemoryStoreEvent,
    handleTokenCountEvent,
    handleToolSchemas,
    handleErrorEvent,
  ]);

  useEffect(() => {
    const removeListener = IpcBridge.on(ON_CHANNELS.FROM_BACKEND, (data: unknown) => {
      if (!isBackendEvent(data)) {
        return;
      }
      const conversationRef = resolveTargetConversationRef(data);
      syncActiveConversationProjection(data, conversationRef);
      if (conversationRef && data.turn_ref) {
        registerTurnConversationRef(data.turn_ref, conversationRef);
      }
      if (enableTranscript) {
        const activeConversationRef = getActiveConversationRef();
        updateTranscriptSession(activeConversationRef || conversationRef || undefined, data.user_id);
      }
      const handler = handlers[data.type];
      if (handler) {
        handler(data);
      }
    });

    return removeListener;
  }, [
    enableTranscript,
    handlers,
    registerTurnConversationRef,
    resolveTargetConversationRef,
    syncActiveConversationProjection,
  ]);
}
