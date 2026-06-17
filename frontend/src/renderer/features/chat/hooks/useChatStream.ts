/**
 * Provides the use chat stream module for the renderer UI.
 */

import { useCallback, useEffect, useMemo } from 'react';
import { IpcBridge, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import type { ConversationEvent } from '../../../infrastructure/api/windieSdkClient';
import {
  useChatStore,
} from '../stores/chatStore';
import { useAppConfigContext } from '../../../app/providers/AppConfigContext';
import { resolveThinkingCapabilities } from '../utils/modelThinkingCapabilities';
import { type TranscriptModelContext } from '../utils/chatStream/chatStreamTypes';
import { useChatCommonActions } from './useChatCommonActions';
import { useStreamMessageUpdaters } from './chatStream/useStreamMessageUpdaters';
import { useLatestRef } from '../../../infrastructure/hooks/useLatestRef';
import { useChatStreamTerminalHandlers } from './chatStream/useChatStreamTerminalHandlers';
import { useChatStreamLocalUserHandler } from './chatStream/useChatStreamLocalUserHandler';
import { useChatStreamCompactionHandlers } from './chatStream/useChatStreamCompactionHandlers';
import { useChatStreamMetadataHandlers } from './chatStream/useChatStreamMetadataHandlers';
import { useChatStreamCompletionHandler } from './chatStream/useChatStreamCompletionHandler';
import {
  handleConversationEventIngress,
} from '../../../app/runtime/desktopChatStreamIngressRuntime';
import {
  recordTrackingEvent as recordTrackingEventRuntime,
  shouldIgnoreConversationEventForStaleTurn,
} from '../../../app/runtime/desktopChatStreamEventRuntime';
import {
  type StreamTrackingEventType,
  type StreamTrackingOptions,
} from '../../../app/runtime/desktopChatStreamTrackingRuntime';

export function useChatStream(enableTranscript: boolean = true) {
  const {
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

  const {
    updateLastMessageBySender,
    updateLastAssistantLlmTextMessage,
  } = useStreamMessageUpdaters(updateMessage);

  const {
    handleContextCompactionStarted,
    handleContextCompactionCompleted,
    handleContextCompactionFailed,
  } = useChatStreamCompactionHandlers({
    setThinkingStatus,
    setThinkingSourceEventType,
    getThinkingSourceEventType: (conversationRef?: string | null) => (
      useChatStore.getState().getWorkspaceState(conversationRef).thinkingSourceEventType
    ),
    setCompactionDebugInfo,
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
    modelContextRef,
    recordTrackingEvent,
    setIsSending,
    setThinkingSourceEventType,
    setThinkingStatus,
  });

  const processStreamingComplete = useChatStreamCompletionHandler({
    recordTrackingEvent,
    setIsSending,
    setThinkingSourceEventType,
    setThinkingStatus,
  });

  const {
    handleError,
    handleTokenCount,
  } = useChatStreamTerminalHandlers({
    recordTrackingEvent,
  });

  const dispatchConversationEvent = useCallback((
    event: ConversationEvent | null,
    conversationRef: string | null,
  ): boolean => {
    if (!event) {
      return false;
    }
    if (
      event.type !== 'user_message'
      && event.type !== 'turn_completed'
      && event.type !== 'tool_call'
      && event.type !== 'tool_output'
      && event.type !== 'tool_bundle_call'
      && event.type !== 'tool_bundle_output'
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
    if (
      event.type === 'tool_call'
      || event.type === 'tool_output'
      || event.type === 'tool_bundle_call'
      || event.type === 'tool_bundle_output'
    ) {
      // Tool display state is owned by the SDK current-turn projection listener.
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
    processStreamingComplete(event, event.conversationRef);
    return true;
  }, [
    handleAssistantMessageFull,
    handleContextCompactionCompleted,
    handleContextCompactionFailed,
    handleContextCompactionStarted,
    handleError,
    handleLocalUserMessage,
    handleSystemPrompt,
    handleTokenCount,
    handleToolSchemas,
    handleUserMessageFull,
    processStreamingComplete,
    shouldIgnoreSdkEventForStaleTurn,
  ]);

  useEffect(() => {
    const removeListener = IpcBridge.on(ON_CHANNELS.WINDIE_CONVERSATION_EVENT, (data: unknown) => {
      handleConversationEventIngress(data as ConversationEvent, {
        getActiveConversationRef: () => useChatStore.getState().activeConversationRef,
        setActiveConversationRef,
        registerTurnConversationRef,
        enableTranscript,
        dispatchConversationEvent,
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
