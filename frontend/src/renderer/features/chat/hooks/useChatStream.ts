/**
 * Provides the use chat stream module for the renderer UI.
 */

import { useCallback, useEffect, useMemo } from 'react';
import type { ConversationEvent } from '../../../app/runtime/desktopConversationRuntimeContracts';
import {
  useChatStore,
} from '../stores/chatStore';
import {
  getActiveConversationRefFromChatStore,
  getWorkspaceStateFromChatStore,
  setCompactionDebugInfoInChatStore,
  setIsSendingInChatStore,
  setThinkingSourceEventTypeInChatStore,
  setThinkingStatusInChatStore,
  updateStreamTrackingInChatStore,
  updateStreamTargetMessageInChatStore,
} from '../stores/chatStoreAdapters';
import { DesktopRendererConfigRuntimeClient } from '../../../app/runtime/desktopRendererConfigRuntimeClient';
import { DesktopModelThinkingRuntime } from '../../../app/runtime/desktopModelThinkingRuntime';
import { type TranscriptModelContext } from '../../../app/runtime/desktopChatStreamModelContextRuntime';
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
  DesktopChatTurnConversationRefRuntime,
} from '../../../app/runtime/desktopChatTurnConversationRefRuntime';
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
  resolveConversationStreamEventIdentity,
  resolveWorkspaceThinkingSourceEventType,
  shouldIgnoreConversationEventIdentityForStaleTurn,
} = DesktopChatStreamEventRuntime;
const {
  registerRendererTurnConversationRef,
} = DesktopChatTurnConversationRefRuntime;

export function useChatStream(enableTranscript: boolean = true) {
  const setActiveConversationRef = useChatStore((state) => state.setActiveConversationRef);
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
    updateStreamTrackingInChatStore,
    eventType,
    turnRef,
    options,
    conversationRef,
  ), []);

  // Active-turn gating is shared across most handlers so late events from older turns
  // never mutate the current workspace stream state.
  const shouldIgnoreSdkEventIdentityForStaleTurn = useCallback((
    eventIdentity: ReturnType<typeof resolveConversationStreamEventIdentity>,
    conversationRef?: string | null,
  ): boolean => shouldIgnoreConversationEventIdentityForStaleTurn(eventIdentity, conversationRef, {
    getWorkspaceState: getWorkspaceStateFromChatStore,
  }), []);

  const {
    updateLastMessageBySender,
    updateLastAssistantLlmTextMessage,
  } = useStreamMessageUpdaters(updateStreamTargetMessageInChatStore);

  const {
    handleContextCompactionStarted,
    handleContextCompactionCompleted,
    handleContextCompactionFailed,
  } = useChatStreamCompactionHandlers({
    setThinkingStatus: setThinkingStatusInChatStore,
    setThinkingSourceEventType: setThinkingSourceEventTypeInChatStore,
    getThinkingSourceEventType: (conversationRef?: string | null) => (
      resolveWorkspaceThinkingSourceEventType(conversationRef, {
        getWorkspaceState: getWorkspaceStateFromChatStore,
      })
    ),
    setCompactionDebugInfo: setCompactionDebugInfoInChatStore,
    recordTrackingEvent,
  });

  const {
    handleSystemPrompt,
    handleUserMessageFull,
    handleAssistantMessageFull,
    handleToolSchemas,
  } = useChatStreamMetadataHandlers({
    shouldIgnoreForStaleTurn: shouldIgnoreSdkEventIdentityForStaleTurn,
    updateLastMessageBySender,
    updateLastAssistantLlmTextMessage,
    recordTrackingEvent,
  });

  const handleLocalUserMessage = useChatStreamLocalUserHandler({
    modelContextRef,
    recordTrackingEvent,
    setIsSending: setIsSendingInChatStore,
    setThinkingSourceEventType: setThinkingSourceEventTypeInChatStore,
    setThinkingStatus: setThinkingStatusInChatStore,
  });

  const processStreamingComplete = useChatStreamCompletionHandler({
    recordTrackingEvent,
    setIsSending: setIsSendingInChatStore,
    setThinkingSourceEventType: setThinkingSourceEventTypeInChatStore,
    setThinkingStatus: setThinkingStatusInChatStore,
  });

  const {
    handleError,
    handleTokenCount,
  } = useChatStreamTerminalHandlers({
    recordTrackingEvent,
    updateStreamTargetMessage: updateStreamTargetMessageInChatStore,
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
    const eventIdentity = resolveConversationStreamEventIdentity(
      event,
      conversationRef,
    );
    if (shouldIgnoreSdkEventIdentityForStaleTurn(eventIdentity, eventIdentity.conversationRef)) {
      return true;
    }
    const resolvedEventConversationRef = eventIdentity.conversationRef;
    if (isLocalUserMessageConversationStreamEvent(event)) {
      handleLocalUserMessage(event, resolvedEventConversationRef);
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
      handleError(event, resolvedEventConversationRef);
      return true;
    }
    if (isUsageUpdatedConversationStreamEvent(event)) {
      handleTokenCount(event, resolvedEventConversationRef);
      return true;
    }
    processStreamingComplete(event, resolvedEventConversationRef);
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
    shouldIgnoreSdkEventIdentityForStaleTurn,
  ]);

  useEffect(() => {
    const removeListener = DesktopConversationRuntimeEventClient.onConversationEvent((data: unknown) => {
      handleConversationEventIngress(data as ConversationEvent, {
        getActiveConversationRef: getActiveConversationRefFromChatStore,
        setActiveConversationRef,
        registerTurnConversationRef: registerRendererTurnConversationRef,
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
    setActiveConversationRef,
  ]);
}
