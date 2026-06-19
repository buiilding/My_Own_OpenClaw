/**
 * Handles use chat stream metadata handlers events for the renderer UI.
 */

import { useCallback } from 'react';
import type { ConversationEvent } from '../../../../app/runtime/desktopConversationRuntimeContracts';
import {
  isAssistantMessageConversationStreamEvent,
  isSystemPromptConversationStreamEvent,
  isToolSchemasMetadataConversationStreamEvent,
  isUserMessageMetadataConversationStreamEvent,
  resolveConversationStreamEventConversationRef,
  resolveConversationStreamEventTurnRef,
  resolveConversationStreamEventTurnRefForUpdate,
} from '../../../../app/runtime/desktopChatStreamEventRuntime';
import {
  resolveToolSchemasMetadataPayload,
} from '../../../../app/runtime/desktopChatStreamEventPayloadRuntime';
import {
  buildAssistantMessageFullUpdate,
  buildSystemPromptUpdate,
  buildToolSchemasUpdate,
  buildUserMessageFullUpdate,
} from '../../../../app/runtime/desktopChatStreamMessageUpdateRuntime';
import type {
  StreamTrackingEventType,
  StreamTrackingOptions,
} from '../../../../app/runtime/desktopChatStreamTrackingRuntime';
import type { ChatMessage } from '../../stores/chatStore';

type ShouldIgnoreForStaleTurn = (
  event: { turnRef?: string | null },
  conversationRef?: string | null,
) => boolean;

type RecordTrackingEvent = (
  eventType: StreamTrackingEventType,
  turnRef: string | null | undefined,
  options?: StreamTrackingOptions,
  conversationRef?: string | null,
) => void;

type UpdateLastMessageBySender = (
  sender: ChatMessage['sender'],
  updates: Partial<ChatMessage>,
  turnRef?: string,
  conversationRef?: string | null,
) => void;

type UpdateLastAssistantLlmTextMessage = (
  updates: Partial<ChatMessage>,
  turnRef?: string,
  conversationRef?: string | null,
) => void;

export function useChatStreamMetadataHandlers({
  shouldIgnoreForStaleTurn,
  updateLastMessageBySender,
  updateLastAssistantLlmTextMessage,
  recordTrackingEvent,
}: {
  shouldIgnoreForStaleTurn: ShouldIgnoreForStaleTurn;
  updateLastMessageBySender: UpdateLastMessageBySender;
  updateLastAssistantLlmTextMessage: UpdateLastAssistantLlmTextMessage;
  recordTrackingEvent: RecordTrackingEvent;
}) {
  const handleSystemPrompt = useCallback((event: ConversationEvent) => {
    if (!isSystemPromptConversationStreamEvent(event)) {
      return;
    }
    const conversationRef = resolveConversationStreamEventConversationRef(event);
    const turnRef = resolveConversationStreamEventTurnRef(event);
    if (shouldIgnoreForStaleTurn(event, conversationRef)) {
      return;
    }
    updateLastMessageBySender('user', {
      systemPrompt: buildSystemPromptUpdate(event.payload),
    }, resolveConversationStreamEventTurnRefForUpdate(event), conversationRef);
    recordTrackingEvent('system-prompt', turnRef, {}, conversationRef);
  }, [recordTrackingEvent, shouldIgnoreForStaleTurn, updateLastMessageBySender]);

  const handleUserMessageFull = useCallback((event: ConversationEvent) => {
    if (!isUserMessageMetadataConversationStreamEvent(event)) {
      return;
    }
    const conversationRef = resolveConversationStreamEventConversationRef(event);
    const turnRef = resolveConversationStreamEventTurnRef(event);
    if (shouldIgnoreForStaleTurn(event, conversationRef)) {
      return;
    }
    updateLastMessageBySender('user', {
      fullUserMessage: buildUserMessageFullUpdate(event.payload),
    }, resolveConversationStreamEventTurnRefForUpdate(event), conversationRef);
    recordTrackingEvent('user-message-full', turnRef, {}, conversationRef);
  }, [recordTrackingEvent, shouldIgnoreForStaleTurn, updateLastMessageBySender]);

  const handleAssistantMessageFull = useCallback((event: ConversationEvent) => {
    if (!isAssistantMessageConversationStreamEvent(event)) {
      return;
    }
    const conversationRef = resolveConversationStreamEventConversationRef(event);
    const turnRef = resolveConversationStreamEventTurnRef(event);
    if (shouldIgnoreForStaleTurn(event, conversationRef)) {
      return;
    }
    updateLastAssistantLlmTextMessage({
      fullAssistantMessage: buildAssistantMessageFullUpdate(event.payload),
    }, resolveConversationStreamEventTurnRefForUpdate(event), conversationRef);
    recordTrackingEvent('assistant-message-full', turnRef, {}, conversationRef);
  }, [recordTrackingEvent, shouldIgnoreForStaleTurn, updateLastAssistantLlmTextMessage]);

  const handleToolSchemas = useCallback((event: ConversationEvent) => {
    if (!isToolSchemasMetadataConversationStreamEvent(event)) {
      return;
    }
    const conversationRef = resolveConversationStreamEventConversationRef(event);
    const turnRef = resolveConversationStreamEventTurnRef(event);
    if (shouldIgnoreForStaleTurn(event, conversationRef)) {
      return;
    }
    updateLastMessageBySender('user', {
      ...buildToolSchemasUpdate(resolveToolSchemasMetadataPayload(event.payload)),
    }, resolveConversationStreamEventTurnRefForUpdate(event), conversationRef);
    recordTrackingEvent('tool-schemas', turnRef, {}, conversationRef);
  }, [recordTrackingEvent, shouldIgnoreForStaleTurn, updateLastMessageBySender]);

  return {
    handleSystemPrompt,
    handleUserMessageFull,
    handleAssistantMessageFull,
    handleToolSchemas,
  };
}
