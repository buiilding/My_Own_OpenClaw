import { useCallback } from 'react';
import type {
  AssistantMessageFullEvent,
  BackendEvent,
  BackendEventType,
  SystemPromptEvent,
  ToolSchemasEvent,
  UserMessageFullEvent,
} from '../../../types/backendEvents';
import {
  buildAssistantMessageFullUpdate,
  buildSystemPromptUpdate,
  buildUserMessageFullUpdate,
} from '../utils/chatStream/chatStreamMessageUpdates';
import type { StreamTrackingOptions } from '../utils/chatStream/chatStreamTracking';
import type { ChatMessage } from '../stores/chatStore';

type ResolveTargetConversationRef = (event: BackendEvent) => string | null;

type ShouldIgnoreForStaleTurn = (
  event: BackendEvent,
  conversationRef?: string | null,
) => boolean;

type RecordTrackingEvent = (
  eventType: BackendEventType,
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

type UpdateFirstMessageBySender = (
  sender: ChatMessage['sender'],
  updates: Partial<ChatMessage>,
  conversationRef?: string | null,
) => void;

type UpdateLastAssistantLlmTextMessage = (
  updates: Partial<ChatMessage>,
  turnRef?: string,
  conversationRef?: string | null,
) => void;

export function useChatStreamMetadataHandlers({
  resolveTargetConversationRef,
  shouldIgnoreForStaleTurn,
  updateLastMessageBySender,
  updateFirstMessageBySender,
  updateLastAssistantLlmTextMessage,
  recordTrackingEvent,
}: {
  resolveTargetConversationRef: ResolveTargetConversationRef;
  shouldIgnoreForStaleTurn: ShouldIgnoreForStaleTurn;
  updateLastMessageBySender: UpdateLastMessageBySender;
  updateFirstMessageBySender: UpdateFirstMessageBySender;
  updateLastAssistantLlmTextMessage: UpdateLastAssistantLlmTextMessage;
  recordTrackingEvent: RecordTrackingEvent;
}) {
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
    recordTrackingEvent,
    resolveTargetConversationRef,
    shouldIgnoreForStaleTurn,
    updateLastMessageBySender,
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
    recordTrackingEvent,
    resolveTargetConversationRef,
    shouldIgnoreForStaleTurn,
    updateLastMessageBySender,
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
    recordTrackingEvent,
    resolveTargetConversationRef,
    shouldIgnoreForStaleTurn,
    updateLastAssistantLlmTextMessage,
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
    recordTrackingEvent,
    resolveTargetConversationRef,
    shouldIgnoreForStaleTurn,
    updateFirstMessageBySender,
  ]);

  return {
    handleSystemPrompt,
    handleUserMessageFull,
    handleAssistantMessageFull,
    handleToolSchemas,
  };
}
