import { useCallback, useEffect, useMemo } from 'react';
import { IpcBridge, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import type { ConversationEvent } from '../../../infrastructure/api/windieSdkClient';
import {
  useChatStore,
} from '../stores/chatStore';
import { useAppConfigContext } from '../../../app/providers/AppContextHooks';
import { resolveThinkingCapabilities } from '../utils/modelThinkingCapabilities';
import { normalizePersistedThinkingStatus } from '../utils/chatStream/chatStreamThinkingStatus';
import { type TranscriptModelContext } from '../utils/chatStream/chatStreamTypes';
import { useChatCommonActions } from './useChatCommonActions';
import { useStreamMessageUpdaters } from './chatStream/useStreamMessageUpdaters';
import { useChatStreamToolHandlers } from './chatStream/useChatStreamToolHandlers';
import { useLatestRef } from '../../../infrastructure/hooks/useLatestRef';
import { useChatStreamTerminalHandlers } from './chatStream/useChatStreamTerminalHandlers';
import { useChatStreamLocalUserHandler } from './chatStream/useChatStreamLocalUserHandler';
import { useChatStreamCompactionHandlers } from './chatStream/useChatStreamCompactionHandlers';
import { useChatStreamMetadataHandlers } from './chatStream/useChatStreamMetadataHandlers';
import { useChatStreamCompletionHandler } from './chatStream/useChatStreamCompletionHandler';
import { useChatStreamTextHandlers } from './chatStream/useChatStreamTextHandlers';
import {
  handleBackendStreamIngress,
} from '../../../app/runtime/desktopChatStreamIngressRuntime';
import {
  recordTrackingEvent as recordTrackingEventRuntime,
  shouldIgnoreConversationEventForStaleTurn,
} from '../../../app/runtime/desktopChatStreamEventRuntime';
import {
  type StreamTrackingEventType,
  type StreamTrackingOptions,
} from '../../../app/runtime/desktopChatStreamTrackingRuntime';
import { logRendererStreamTrace } from '../utils/chatStream/chatStreamDebugTrace';

export function useChatStream(enableTranscript: boolean = true) {
  const {
    addMessage,
    updateMessage,
    setIsSending,
    setThinkingStatus,
    setThinkingSourceEventType,
  } = useChatCommonActions();
  const setCompactionDebugInfo = useChatStore((state) => state.setCompactionDebugInfo);
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

  const recordTrackingEvent = useCallback((
    eventType: StreamTrackingEventType,
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
  const shouldIgnoreSdkEventForStaleTurn = useCallback((
    event: { turnRef?: string | null },
    conversationRef?: string | null,
  ): boolean => shouldIgnoreConversationEventForStaleTurn(event, conversationRef, {
    getWorkspaceState: useChatStore.getState().getWorkspaceState,
  }), []);

  const shouldRenderRawLiveMessages = useCallback((
    event: { turnRef?: string | null },
    conversationRef?: string | null,
  ): boolean => {
    const projection = useChatStore.getState().getWorkspaceState(conversationRef).currentTurnProjection;
    if (!projection || projection.phase === 'idle') {
      return true;
    }
    if (!projection.turnRef || !event.turnRef) {
      return true;
    }
    return projection.turnRef !== event.turnRef;
  }, []);

  const {
    updateLastMessageBySender,
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
    handleAssistantDelta,
  } = useChatStreamTextHandlers({
    addMessage,
    updateMessage,
    setIsSending,
    setThinkingStatus,
    setThinkingSourceEventType,
    modelContextRef,
    renderLiveMessages: shouldRenderRawLiveMessages,
    recordTrackingEvent,
  });

  const {
    handleContextCompactionStarted,
    handleContextCompactionCompleted,
    handleContextCompactionFailed,
  } = useChatStreamCompactionHandlers({
    shouldIgnoreForStaleTurn: shouldIgnoreSdkEventForStaleTurn,
    setThinkingStatus,
    setThinkingSourceEventType,
    getThinkingSourceEventType: (conversationRef?: string | null) => (
      useChatStore.getState().getWorkspaceState(conversationRef).thinkingSourceEventType
    ),
    setCompactionDebugInfo,
    recordTrackingEvent,
  });

  const {
    handleToolCall,
    handleToolOutput,
    handleToolBundle,
    handleWebSearchProgress,
  } = useChatStreamToolHandlers({
    enableTranscript,
    addMessage,
    setIsSending,
    setThinkingStatus,
    setThinkingSourceEventType,
    modelContextRef,
    renderLiveMessages: shouldRenderRawLiveMessages,
    recordTrackingEvent,
  });

  const {
    handleSystemPrompt,
    handleUserMessageFull,
    handleAssistantMessageFull,
    handleToolSchemas,
  } = useChatStreamMetadataHandlers({
    shouldIgnoreForStaleTurn: shouldIgnoreSdkEventForStaleTurn,
    updateLastMessageBySender,
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
    renderLiveMessages: shouldRenderRawLiveMessages,
  });

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
    renderLiveMessages: shouldRenderRawLiveMessages,
  });

  const dispatchConversationEvent = useCallback((
    event: ConversationEvent | null,
    conversationRef: string | null,
  ): boolean => {
    if (!event) {
      return false;
    }
    if (
      event.type !== 'assistant_delta'
      && event.type !== 'user_message'
      && event.type !== 'reasoning_delta'
      && event.type !== 'turn_completed'
      && event.type !== 'tool_call'
      && event.type !== 'tool_progress'
      && event.type !== 'tool_output'
      && event.type !== 'tool_bundle_call'
      && event.type !== 'compaction_started'
      && event.type !== 'compaction_applied'
      && event.type !== 'compaction_skipped'
      && event.type !== 'compaction_failed'
      && event.type !== 'system_prompt'
      && event.type !== 'user_message_metadata'
      && event.type !== 'assistant_message'
      && event.type !== 'tool_schemas_metadata'
      && event.type !== 'turn_error'
      && event.type !== 'usage_updated'
      && event.type !== 'memory_stored'
    ) {
      return false;
    }
    if (shouldIgnoreSdkEventForStaleTurn(event, conversationRef)) {
      return true;
    }
    if (event.type === 'user_message') {
      handleLocalUserMessage(event, event.conversationRef);
      return true;
    }
    if (event.type === 'assistant_delta') {
      handleAssistantDelta(event, event.conversationRef);
      return true;
    }
    if (event.type === 'reasoning_delta') {
      handleLlmThoughtText(event, event.conversationRef);
      return true;
    }
    if (event.type === 'tool_call') {
      handleToolCall(event, event.conversationRef);
      return true;
    }
    if (event.type === 'tool_progress') {
      handleWebSearchProgress(event, event.conversationRef);
      return true;
    }
    if (event.type === 'tool_output') {
      handleToolOutput(event, event.conversationRef);
      return true;
    }
    if (event.type === 'tool_bundle_call') {
      handleToolBundle(event, event.conversationRef);
      return true;
    }
    if (event.type === 'compaction_started') {
      handleContextCompactionStarted(event);
      return true;
    }
    if (event.type === 'compaction_applied' || event.type === 'compaction_skipped') {
      handleContextCompactionCompleted(event);
      return true;
    }
    if (event.type === 'compaction_failed') {
      handleContextCompactionFailed(event);
      return true;
    }
    if (event.type === 'system_prompt') {
      handleSystemPrompt(event);
      return true;
    }
    if (event.type === 'user_message_metadata') {
      handleUserMessageFull(event);
      return true;
    }
    if (event.type === 'assistant_message') {
      handleAssistantMessageFull(event);
      return true;
    }
    if (event.type === 'tool_schemas_metadata') {
      handleToolSchemas(event);
      return true;
    }
    if (event.type === 'turn_error') {
      handleError(event, event.conversationRef);
      return true;
    }
    if (event.type === 'usage_updated') {
      handleTokenCount(event, event.conversationRef);
      return true;
    }
    if (event.type === 'memory_stored') {
      handleMemoryStore(event, event.conversationRef);
      return true;
    }
    processStreamingComplete(event, event.conversationRef);
    return true;
  }, [
    handleAssistantDelta,
    handleAssistantMessageFull,
    handleContextCompactionCompleted,
    handleContextCompactionFailed,
    handleContextCompactionStarted,
    handleError,
    handleLocalUserMessage,
    handleLlmThoughtText,
    handleMemoryStore,
    handleSystemPrompt,
    handleTokenCount,
    handleToolBundle,
    handleToolCall,
    handleWebSearchProgress,
    handleToolOutput,
    handleToolSchemas,
    handleUserMessageFull,
    processStreamingComplete,
    shouldRenderRawLiveMessages,
    shouldIgnoreSdkEventForStaleTurn,
  ]);

  useEffect(() => {
    const removeListener = IpcBridge.on(ON_CHANNELS.FROM_BACKEND, (data: unknown) => {
      handleBackendStreamIngress(data, {
        resolveConversationRefForTurn: useChatStore.getState().resolveConversationRefForTurn,
        getActiveConversationRef: () => useChatStore.getState().activeConversationRef,
        setActiveConversationRef,
        registerTurnConversationRef,
        enableTranscript,
        dispatchConversationEvent,
        logTrace: logRendererStreamTrace,
      });
    });

    return removeListener;
  }, [
    enableTranscript,
    dispatchConversationEvent,
    registerTurnConversationRef,
    setActiveConversationRef,
  ]);
}
