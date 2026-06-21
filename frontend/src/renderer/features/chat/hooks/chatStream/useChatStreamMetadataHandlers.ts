/**
 * Handles use chat stream metadata handlers events for the renderer UI.
 */

import { useCallback } from 'react';
import type { ConversationEvent } from '../../../../app/runtime/desktopConversationRuntimeContracts';
import { DesktopChatStreamEventRuntime } from '../../../../app/runtime/desktopChatStreamEventRuntime';
import {
  resolveConversationStreamEventPayload,
  resolveToolSchemasMetadataPayload,
} from '../../../../app/runtime/desktopChatStreamEventPayloadRuntime';
import {
  DesktopChatStreamMessageUpdateRuntime,
} from '../../../../app/runtime/desktopChatStreamMessageUpdateRuntime';
import type {
  StreamTrackingEventType,
  StreamTrackingOptions,
} from '../../../../app/runtime/desktopChatStreamTrackingRuntime';
import type { ChatMessage } from '../../stores/chatStore';

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
  resolveConversationStreamEventConversationRef,
  resolveConversationStreamEventTurnRef,
  resolveConversationStreamEventTurnRefForUpdate,
} = DesktopChatStreamEventRuntime;

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
    const payload = resolveConversationStreamEventPayload(event);
    updateLastMessageBySender('user', {
      systemPrompt: buildSystemPromptUpdate(payload),
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
    const payload = resolveConversationStreamEventPayload(event);
    updateLastMessageBySender('user', {
      fullUserMessage: buildUserMessageFullUpdate(payload),
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
    const payload = resolveConversationStreamEventPayload(event);
    updateLastAssistantLlmTextMessage({
      fullAssistantMessage: buildAssistantMessageFullUpdate(payload),
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
    const payload = resolveConversationStreamEventPayload(event);
    updateLastMessageBySender('user', {
      ...buildToolSchemasUpdate(resolveToolSchemasMetadataPayload(payload)),
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
