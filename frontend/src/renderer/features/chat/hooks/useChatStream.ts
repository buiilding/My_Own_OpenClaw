import { useCallback, useEffect, useMemo } from 'react';
import { IpcBridge, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import {
  useChatStore,
} from '../stores/chatStore';
import { useAppConfigContext } from '../../../app/providers/AppContextHooks';
import {
  getActiveConversationRef,
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
  type LocalUserMessageEvent,
  type MemoryStoreEvent,
  type TokenCountEvent,
  type ErrorEvent,
  isBackendEvent,
} from '../../../types/backendEvents';
import {
  type StreamTrackingOptions,
} from '../utils/chatStream/chatStreamTracking';
import { resolveThinkingCapabilities } from '../utils/modelThinkingCapabilities';
import { normalizePersistedThinkingStatus } from '../utils/chatStream/chatStreamThinkingStatus';
import { type TranscriptModelContext } from '../utils/chatStream/chatStreamTypes';
import { useChatCommonActions } from './useChatCommonActions';
import { useStreamMessageUpdaters } from './chatStream/useStreamMessageUpdaters';
import { useChatStreamToolHandlers } from './chatStream/useChatStreamToolHandlers';
import { useLatestRef } from '../../../infrastructure/hooks/useLatestRef';
import { useChatStreamTerminalHandlers } from './chatStream/useChatStreamTerminalHandlers';
import { buildChatStreamHandlerMap } from '../utils/chatStream/chatStreamHandlerMap';
import { useChatStreamLocalUserHandler } from './chatStream/useChatStreamLocalUserHandler';
import { useChatStreamCompactionHandlers } from './chatStream/useChatStreamCompactionHandlers';
import { useChatStreamMetadataHandlers } from './chatStream/useChatStreamMetadataHandlers';
import { useTurnScopedBackendEventHandler } from './chatStream/useTurnScopedBackendEventHandler';
import { useChatStreamCompletionHandler } from './chatStream/useChatStreamCompletionHandler';
import { useChatStreamTextHandlers } from './chatStream/useChatStreamTextHandlers';
import { ingestBackendEvent } from '../utils/chatStream/chatStreamBackendIngress';
import {
  recordTrackingEvent as recordTrackingEventRuntime,
  resolveTargetConversationRef as resolveTargetConversationRefRuntime,
  shouldIgnoreForStaleTurn as shouldIgnoreForStaleTurnRuntime,
  syncActiveConversationProjection as syncActiveConversationProjectionRuntime,
} from '../utils/chatStream/chatStreamEventRuntime';

function isRendererStreamTraceEnabled() {
  if (typeof window === 'undefined') {
    return false;
  }
  const search = typeof window.location?.search === 'string' ? window.location.search : '';
  return search.includes('dev_ui=1');
}

function getRendererTraceView() {
  if (typeof window === 'undefined') {
    return 'unknown';
  }
  const params = new URLSearchParams(window.location.search || '');
  return params.get('view') || 'main';
}

function summarizeWorkspaceForTrace(conversationRef: string | null) {
  const store = useChatStore.getState();
  const workspace = store.getWorkspaceState(conversationRef);
  const lastMessage = workspace.messages[workspace.messages.length - 1] || null;
  return {
    activeConversationRef: store.activeConversationRef,
    workspaceMessageCount: workspace.messages.length,
    isSending: workspace.isSending,
    thinkingStatus: workspace.thinkingStatus,
    phase: workspace.streamTracking.phase,
    activeTurnRef: workspace.streamTracking.activeTurnRef,
    lastMessage: lastMessage ? {
      sender: lastMessage.sender,
      type: lastMessage.type || null,
      textLength: typeof lastMessage.text === 'string' ? lastMessage.text.length : 0,
      turnRef: lastMessage.turnRef || null,
      sourceEventType: lastMessage.sourceEventType || null,
    } : null,
  };
}

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

  const {
    handleLlmThought: handleLlmThoughtText,
    handleStreamingResponse: handleStreamingResponseText,
  } = useChatStreamTextHandlers({
    addMessage,
    updateMessage,
    setIsSending,
    setThinkingStatus,
    setThinkingSourceEventType,
    modelContextRef,
    recordTrackingEvent,
  });

  const handleLlmThought = useTurnScopedBackendEventHandler<LlmThoughtEvent>({
    resolveTargetConversationRef,
    shouldIgnoreForStaleTurn,
    onEvent: handleLlmThoughtText,
  });

  const handleStreamingResponse = useTurnScopedBackendEventHandler<StreamingResponseEvent>({
    resolveTargetConversationRef,
    shouldIgnoreForStaleTurn,
    onEvent: handleStreamingResponseText,
  });

  const {
    handleContextCompactionStarted,
    handleContextCompactionCompleted,
    handleContextCompactionFailed,
  } = useChatStreamCompactionHandlers({
    resolveTargetConversationRef,
    shouldIgnoreForStaleTurn,
    setThinkingStatus,
    setThinkingSourceEventType,
    recordTrackingEvent,
  });

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

  const {
    handleSystemPrompt,
    handleUserMessageFull,
    handleAssistantMessageFull,
    handleToolSchemas,
  } = useChatStreamMetadataHandlers({
    resolveTargetConversationRef,
    shouldIgnoreForStaleTurn,
    updateLastMessageBySender,
    updateFirstMessageBySender,
    updateLastAssistantLlmTextMessage,
    recordTrackingEvent,
  });

  const handleLocalUserMessage = useChatStreamLocalUserHandler({
    addMessage,
    modelContextRef,
    recordTrackingEvent,
    setIsSending,
    setThinkingSourceEventType,
    setThinkingStatus,
  });

  const handleToolCallEvent = useTurnScopedBackendEventHandler<ToolCallEvent>({
    resolveTargetConversationRef,
    shouldIgnoreForStaleTurn,
    onEvent: handleToolCall,
  });

  const handleToolOutputEvent = useTurnScopedBackendEventHandler<ToolOutputEvent>({
    resolveTargetConversationRef,
    shouldIgnoreForStaleTurn,
    onEvent: handleToolOutput,
  });

  const handleToolBundleEvent = useTurnScopedBackendEventHandler<ToolBundleEvent>({
    resolveTargetConversationRef,
    shouldIgnoreForStaleTurn,
    onEvent: handleToolBundle,
  });

  const handleLocalUserMessageEvent = useTurnScopedBackendEventHandler<LocalUserMessageEvent>({
    resolveTargetConversationRef,
    shouldIgnoreForStaleTurn,
    onEvent: handleLocalUserMessage,
    skipStaleTurnGate: true,
  });

  const processStreamingComplete = useChatStreamCompletionHandler({
    addMessage,
    enableTranscript,
    modelContextRef,
    recordTrackingEvent,
    setIsSending,
    setThinkingStatus,
    setThinkingSourceEventType,
    updateMessage,
    persistThinkingForTurn,
  });

  const handleStreamingComplete = useCallback((event: StreamingCompleteEvent) => {
    const conversationRef = resolveTargetConversationRef(event);
    if (shouldIgnoreForStaleTurn(event, conversationRef)) {
      return;
    }
    processStreamingComplete(event, conversationRef);
  }, [
    processStreamingComplete,
    resolveTargetConversationRef,
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

  const handleMemoryStoreEvent = useTurnScopedBackendEventHandler<MemoryStoreEvent>({
    resolveTargetConversationRef,
    shouldIgnoreForStaleTurn,
    onEvent: handleMemoryStore,
  });

  const handleTokenCountEvent = useTurnScopedBackendEventHandler<TokenCountEvent>({
    resolveTargetConversationRef,
    shouldIgnoreForStaleTurn,
    onEvent: handleTokenCount,
  });

  const handleErrorEvent = useTurnScopedBackendEventHandler<ErrorEvent>({
    resolveTargetConversationRef,
    shouldIgnoreForStaleTurn,
    onEvent: handleError,
  });

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
      const traceEnabled = isRendererStreamTraceEnabled();
      if (traceEnabled) {
        console.log('[StreamTrace][renderer][before]', {
          view: getRendererTraceView(),
          eventType: data.type,
          turnRef: data.turn_ref || null,
          conversationRef,
          ...summarizeWorkspaceForTrace(conversationRef),
        });
      }
      ingestBackendEvent(data, conversationRef, {
        syncActiveConversationProjection,
        registerTurnConversationRef,
        enableTranscript,
        dispatchEvent: (event) => {
          const handler = handlers[event.type];
          if (handler) {
            handler(event);
          }
        },
      });
      if (traceEnabled) {
        console.log('[StreamTrace][renderer][after]', {
          view: getRendererTraceView(),
          eventType: data.type,
          turnRef: data.turn_ref || null,
          conversationRef,
          ...summarizeWorkspaceForTrace(conversationRef),
        });
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
