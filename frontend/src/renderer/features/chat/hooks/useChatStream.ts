/**
 * Provides the use chat stream module for the renderer UI.
 */

import { useCallback, useEffect, useMemo } from 'react';
import type { ConversationEvent } from '../../../app/runtime/desktopConversationRuntimeContracts';
import {
  useChatStore,
} from '../stores/chatStore';
import { DesktopRendererConfigRuntimeClient } from '../../../app/runtime/desktopRendererConfigRuntimeClient';
import { DesktopModelThinkingRuntime } from '../../../app/runtime/desktopModelThinkingRuntime';
import { type TranscriptModelContext } from '../../../app/runtime/desktopChatStreamModelContextRuntime';
import { useChatCommonActions } from './useChatCommonActions';
import { useStreamMessageUpdaters } from './chatStream/useStreamMessageUpdaters';
import { DesktopRendererHooksRuntimeClient } from '../../../app/runtime/desktopRendererHooksRuntimeClient';
import { useChatStreamTerminalHandlers } from './chatStream/useChatStreamTerminalHandlers';
import { useChatStreamLocalUserHandler } from './chatStream/useChatStreamLocalUserHandler';
import { useChatStreamCompactionHandlers } from './chatStream/useChatStreamCompactionHandlers';
import { useChatStreamMetadataHandlers } from './chatStream/useChatStreamMetadataHandlers';
import { useChatStreamCompletionHandler } from './chatStream/useChatStreamCompletionHandler';
import {
  DesktopChatStreamIngressRuntime,
} from '../../../app/runtime/desktopChatStreamIngressRuntime';
import { DesktopConversationRuntimeEventClient } from '../../../app/runtime/desktopConversationRuntimeEventClient';
import {
  DesktopChatStreamEventRuntime,
} from '../../../app/runtime/desktopChatStreamEventRuntime';
import {
  type StreamTrackingEventType,
  type StreamTrackingOptions,
} from '../../../app/runtime/desktopChatStreamTrackingRuntime';

const {
  handleConversationEventIngress,
} = DesktopChatStreamIngressRuntime;
const {
  useLatestRef,
} = DesktopRendererHooksRuntimeClient;
const {
  isAssistantMessageConversationStreamEvent,
  isCompactionCompletedConversationStreamEvent,
  isCompactionFailedConversationStreamEvent,
  isCompactionStartedConversationStreamEvent,
  isLocalUserMessageConversationStreamEvent,
  isSupportedConversationStreamEvent,
  isSystemPromptConversationStreamEvent,
  isToolDisplayOnlyConversationStreamEvent,
  isToolSchemasMetadataConversationStreamEvent,
  isTurnErrorConversationStreamEvent,
  isUserMessageMetadataConversationStreamEvent,
  isUsageUpdatedConversationStreamEvent,
  recordTrackingEvent: recordTrackingEventRuntime,
  resolveConversationStreamEventConversationRef,
  shouldIgnoreConversationEventForStaleTurn,
} = DesktopChatStreamEventRuntime;

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
  const { config, availableModels } = DesktopRendererConfigRuntimeClient.useDesktopRendererConfigContext();
  const modelCapabilities = useMemo(() => DesktopModelThinkingRuntime.resolveThinkingCapabilities(
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
    if (!isSupportedConversationStreamEvent(event)) {
      return false;
    }
    if (shouldIgnoreSdkEventForStaleTurn(event, conversationRef)) {
      return true;
    }
    const eventConversationRef = resolveConversationStreamEventConversationRef(event) ?? conversationRef;
    if (isLocalUserMessageConversationStreamEvent(event)) {
      handleLocalUserMessage(event, eventConversationRef);
      return true;
    }
    if (isToolDisplayOnlyConversationStreamEvent(event)) {
      // Tool display state is owned by the SDK current-turn projection listener.
      return true;
    }
    if (isCompactionStartedConversationStreamEvent(event)) {
      handleContextCompactionStarted(event);
      return true;
    }
    if (isCompactionCompletedConversationStreamEvent(event)) {
      handleContextCompactionCompleted(event);
      return true;
    }
    if (isCompactionFailedConversationStreamEvent(event)) {
      handleContextCompactionFailed(event);
      return true;
    }
    if (isSystemPromptConversationStreamEvent(event)) {
      handleSystemPrompt(event);
      return true;
    }
    if (isUserMessageMetadataConversationStreamEvent(event)) {
      handleUserMessageFull(event);
      return true;
    }
    if (isAssistantMessageConversationStreamEvent(event)) {
      handleAssistantMessageFull(event);
      return true;
    }
    if (isToolSchemasMetadataConversationStreamEvent(event)) {
      handleToolSchemas(event);
      return true;
    }
    if (isTurnErrorConversationStreamEvent(event)) {
      handleError(event, eventConversationRef);
      return true;
    }
    if (isUsageUpdatedConversationStreamEvent(event)) {
      handleTokenCount(event, eventConversationRef);
      return true;
    }
    processStreamingComplete(event, eventConversationRef);
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
    const removeListener = DesktopConversationRuntimeEventClient.onConversationEvent((data: unknown) => {
      handleConversationEventIngress(data as ConversationEvent, {
        getActiveConversationRef: () => useChatStore.getState().activeConversationRef,
        setActiveConversationRef,
        registerTurnConversationRef,
        enableTranscript,
        dispatchConversationEvent,
      });
    });

    return () => {
      removeListener?.();
    };
  }, [
    enableTranscript,
    dispatchConversationEvent,
    registerTurnConversationRef,
    setActiveConversationRef,
  ]);
}
