/**
 * Handles use chat stream metadata handlers events for the renderer UI.
 */

import { useCallback } from 'react';
import type { ConversationEvent } from '../../../../app/runtime/desktopConversationRuntimeContracts';
import { DesktopChatStreamEventRuntime } from '../../../../app/runtime/desktopChatStreamEventRuntime';
import { DesktopChatStreamEventPayloadRuntime } from '../../../../app/runtime/desktopChatStreamEventPayloadRuntime';
import {
  DesktopChatStreamMessageUpdateRuntime,
} from '../../../../app/runtime/desktopChatStreamMessageUpdateRuntime';
import type {
  StreamTrackingEventType,
  StreamTrackingOptions,
} from '../../../../app/runtime/desktopChatStreamTrackingRuntime';
import type { ChatMessage } from '../../../../app/runtime/desktopChatMessageTypes';

const {
  buildAssistantMessageFullUpdate,
  buildSystemPromptUpdate,
  buildToolSchemasUpdate,
  buildUserMessageFullUpdate,
} = DesktopChatStreamMessageUpdateRuntime;
const {
  isAssistantMessageConversationStreamEvent,
  isSystemPromptConversationStreamEvent,
  isToolSchemasMetadataConversationStreamEvent,
  isUserMessageMetadataConversationStreamEvent,
  resolveConversationStreamEventIdentity,
} = DesktopChatStreamEventRuntime;
const {
  resolveConversationStreamEventPayload,
  resolveToolSchemasMetadataPayload,
} = DesktopChatStreamEventPayloadRuntime;

type StreamEventIdentity = ReturnType<typeof resolveConversationStreamEventIdentity>;

type ShouldIgnoreForStaleTurn = (
  eventIdentity: StreamEventIdentity,
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
  eventIdentity?: StreamEventIdentity | null,
  conversationRef?: string | null,
) => void;

type UpdateLastAssistantLlmTextMessage = (
  updates: Partial<ChatMessage>,
  eventIdentity?: StreamEventIdentity | null,
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
    const eventIdentity = resolveConversationStreamEventIdentity(event);
    const conversationRef = eventIdentity.conversationRef;
    if (shouldIgnoreForStaleTurn(eventIdentity, conversationRef)) {
      return;
    }
    const payload = resolveConversationStreamEventPayload(event);
    updateLastMessageBySender('user', {
      systemPrompt: buildSystemPromptUpdate(payload),
    }, eventIdentity, eventIdentity.conversationRef);
    recordTrackingEvent('system-prompt', eventIdentity.turnRef, {}, eventIdentity.conversationRef);
  }, [recordTrackingEvent, shouldIgnoreForStaleTurn, updateLastMessageBySender]);

  const handleUserMessageFull = useCallback((event: ConversationEvent) => {
    if (!isUserMessageMetadataConversationStreamEvent(event)) {
      return;
    }
    const eventIdentity = resolveConversationStreamEventIdentity(event);
    const conversationRef = eventIdentity.conversationRef;
    if (shouldIgnoreForStaleTurn(eventIdentity, conversationRef)) {
      return;
    }
    const payload = resolveConversationStreamEventPayload(event);
    updateLastMessageBySender('user', {
      fullUserMessage: buildUserMessageFullUpdate(payload),
    }, eventIdentity, conversationRef);
    recordTrackingEvent('user-message-full', eventIdentity.turnRef, {}, conversationRef);
  }, [recordTrackingEvent, shouldIgnoreForStaleTurn, updateLastMessageBySender]);

  const handleAssistantMessageFull = useCallback((event: ConversationEvent) => {
    if (!isAssistantMessageConversationStreamEvent(event)) {
      return;
    }
    const eventIdentity = resolveConversationStreamEventIdentity(event);
    const conversationRef = eventIdentity.conversationRef;
    if (shouldIgnoreForStaleTurn(eventIdentity, conversationRef)) {
      return;
    }
    const payload = resolveConversationStreamEventPayload(event);
    updateLastAssistantLlmTextMessage({
      fullAssistantMessage: buildAssistantMessageFullUpdate(payload),
    }, eventIdentity, conversationRef);
    recordTrackingEvent('assistant-message-full', eventIdentity.turnRef, {}, conversationRef);
  }, [recordTrackingEvent, shouldIgnoreForStaleTurn, updateLastAssistantLlmTextMessage]);

  const handleToolSchemas = useCallback((event: ConversationEvent) => {
    if (!isToolSchemasMetadataConversationStreamEvent(event)) {
      return;
    }
    const eventIdentity = resolveConversationStreamEventIdentity(event);
    const conversationRef = eventIdentity.conversationRef;
    if (shouldIgnoreForStaleTurn(eventIdentity, conversationRef)) {
      return;
    }
    const payload = resolveConversationStreamEventPayload(event);
    updateLastMessageBySender('user', {
      ...buildToolSchemasUpdate(resolveToolSchemasMetadataPayload(payload)),
    }, eventIdentity, conversationRef);
    recordTrackingEvent('tool-schemas', eventIdentity.turnRef, {}, conversationRef);
  }, [recordTrackingEvent, shouldIgnoreForStaleTurn, updateLastMessageBySender]);

  return {
    handleSystemPrompt,
    handleUserMessageFull,
    handleAssistantMessageFull,
    handleToolSchemas,
  };
}
