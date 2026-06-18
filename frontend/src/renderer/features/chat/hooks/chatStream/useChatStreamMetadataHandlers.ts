/**
 * Handles use chat stream metadata handlers events for the renderer UI.
 */

import { useCallback } from 'react';
import type { ConversationEvent } from '../../../../app/runtime/desktopConversationRuntimeContracts';
import {
  buildAssistantMessageFullUpdate,
  buildSystemPromptUpdate,
  buildToolSchemasUpdate,
  buildUserMessageFullUpdate,
} from '../../utils/chatStream/chatStreamMessageUpdates';
import type {
  StreamTrackingEventType,
  StreamTrackingOptions,
} from '../../../../app/runtime/desktopChatStreamTrackingRuntime';
import type { ChatMessage } from '../../stores/chatStore';

type MetadataEventType =
  | 'system_prompt'
  | 'user_message_metadata'
  | 'assistant_message'
  | 'tool_schemas_metadata';

type MetadataConversationEvent = ConversationEvent & {
  type: MetadataEventType;
};

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

function isMetadataEvent(
  event: ConversationEvent,
  expectedType: MetadataEventType,
): event is MetadataConversationEvent {
  return event.type === expectedType;
}

function turnRefForUpdate(event: ConversationEvent): string | undefined {
  return typeof event.turnRef === 'string' && event.turnRef.trim()
    ? event.turnRef
    : undefined;
}

function toolSchemasPayload(event: MetadataConversationEvent) {
  return {
    ...event.payload,
    tool_schemas: event.payload.tool_schemas ?? event.payload.toolSchemas,
  };
}

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
    if (!isMetadataEvent(event, 'system_prompt')) {
      return;
    }
    const conversationRef = event.conversationRef;
    if (shouldIgnoreForStaleTurn({ turnRef: event.turnRef }, conversationRef)) {
      return;
    }
    updateLastMessageBySender('user', {
      systemPrompt: buildSystemPromptUpdate(event.payload),
    }, turnRefForUpdate(event), conversationRef);
    recordTrackingEvent('system-prompt', event.turnRef, {}, conversationRef);
  }, [recordTrackingEvent, shouldIgnoreForStaleTurn, updateLastMessageBySender]);

  const handleUserMessageFull = useCallback((event: ConversationEvent) => {
    if (!isMetadataEvent(event, 'user_message_metadata')) {
      return;
    }
    const conversationRef = event.conversationRef;
    if (shouldIgnoreForStaleTurn({ turnRef: event.turnRef }, conversationRef)) {
      return;
    }
    updateLastMessageBySender('user', {
      fullUserMessage: buildUserMessageFullUpdate(event.payload),
    }, turnRefForUpdate(event), conversationRef);
    recordTrackingEvent('user-message-full', event.turnRef, {}, conversationRef);
  }, [recordTrackingEvent, shouldIgnoreForStaleTurn, updateLastMessageBySender]);

  const handleAssistantMessageFull = useCallback((event: ConversationEvent) => {
    if (!isMetadataEvent(event, 'assistant_message')) {
      return;
    }
    const conversationRef = event.conversationRef;
    if (shouldIgnoreForStaleTurn({ turnRef: event.turnRef }, conversationRef)) {
      return;
    }
    updateLastAssistantLlmTextMessage({
      fullAssistantMessage: buildAssistantMessageFullUpdate(event.payload),
    }, turnRefForUpdate(event), conversationRef);
    recordTrackingEvent('assistant-message-full', event.turnRef, {}, conversationRef);
  }, [recordTrackingEvent, shouldIgnoreForStaleTurn, updateLastAssistantLlmTextMessage]);

  const handleToolSchemas = useCallback((event: ConversationEvent) => {
    if (!isMetadataEvent(event, 'tool_schemas_metadata')) {
      return;
    }
    const conversationRef = event.conversationRef;
    if (shouldIgnoreForStaleTurn({ turnRef: event.turnRef }, conversationRef)) {
      return;
    }
    updateLastMessageBySender('user', {
      ...buildToolSchemasUpdate(toolSchemasPayload(event)),
    }, turnRefForUpdate(event), conversationRef);
    recordTrackingEvent('tool-schemas', event.turnRef, {}, conversationRef);
  }, [recordTrackingEvent, shouldIgnoreForStaleTurn, updateLastMessageBySender]);

  return {
    handleSystemPrompt,
    handleUserMessageFull,
    handleAssistantMessageFull,
    handleToolSchemas,
  };
}
