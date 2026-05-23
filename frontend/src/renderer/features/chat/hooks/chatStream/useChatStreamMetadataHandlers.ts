import { useCallback } from 'react';
import type {
  AssistantMessageFullEvent,
  BackendEvent,
  BackendEventType,
  SystemPromptEvent,
  ToolSchemasEvent,
  UserMessageFullEvent,
} from '../../../../types/backendEvents';
import type { ConversationEvent } from '../../../../infrastructure/api/windieSdkClient';
import {
  buildAssistantMessageFullUpdate,
  buildSystemPromptUpdate,
  buildToolSchemasUpdate,
  buildUserMessageFullUpdate,
} from '../../utils/chatStream/chatStreamMessageUpdates';
import type { StreamTrackingOptions } from '../../utils/chatStream/chatStreamTracking';
import type { ChatMessage } from '../../stores/chatStore';
import { useTurnScopedBackendEventHandler } from './useTurnScopedBackendEventHandler';

type ResolveTargetConversationRef = (event: BackendEvent) => string | null;
type MetadataBackendEvent =
  | SystemPromptEvent
  | UserMessageFullEvent
  | AssistantMessageFullEvent
  | ToolSchemasEvent;
type MetadataStreamEvent = MetadataBackendEvent | ConversationEvent;

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

type UpdateLastAssistantLlmTextMessage = (
  updates: Partial<ChatMessage>,
  turnRef?: string,
  conversationRef?: string | null,
) => void;

function unwrapMetadataBackendEvent<TEvent extends MetadataBackendEvent>(
  event: MetadataStreamEvent,
  expectedType: TEvent['type'],
): TEvent | null {
  if ('turn_ref' in event && event.type === expectedType) {
    return event as TEvent;
  }
  const rawEvent = event.payload?.rawEvent;
  if (
    rawEvent
    && typeof rawEvent === 'object'
    && !Array.isArray(rawEvent)
    && (rawEvent as { type?: unknown }).type === expectedType
  ) {
    return rawEvent as TEvent;
  }
  return null;
}

export function useChatStreamMetadataHandlers({
  resolveTargetConversationRef,
  shouldIgnoreForStaleTurn,
  updateLastMessageBySender,
  updateLastAssistantLlmTextMessage,
  recordTrackingEvent,
}: {
  resolveTargetConversationRef: ResolveTargetConversationRef;
  shouldIgnoreForStaleTurn: ShouldIgnoreForStaleTurn;
  updateLastMessageBySender: UpdateLastMessageBySender;
  updateLastAssistantLlmTextMessage: UpdateLastAssistantLlmTextMessage;
  recordTrackingEvent: RecordTrackingEvent;
}) {
  const handleSystemPromptEvent = useTurnScopedBackendEventHandler<SystemPromptEvent>({
    resolveTargetConversationRef,
    shouldIgnoreForStaleTurn,
    onEvent: (event, conversationRef) => {
      updateLastMessageBySender('user', {
        systemPrompt: buildSystemPromptUpdate(event.payload),
      }, event.turn_ref || undefined, conversationRef);
      recordTrackingEvent('system-prompt', event.turn_ref, {}, conversationRef);
    },
  });

  const handleUserMessageFullEvent = useTurnScopedBackendEventHandler<UserMessageFullEvent>({
    resolveTargetConversationRef,
    shouldIgnoreForStaleTurn,
    onEvent: (event, conversationRef) => {
      updateLastMessageBySender('user', {
        fullUserMessage: buildUserMessageFullUpdate(event.payload),
      }, event.turn_ref || undefined, conversationRef);
      recordTrackingEvent('user-message-full', event.turn_ref, {}, conversationRef);
    },
  });

  const handleAssistantMessageFullEvent = useTurnScopedBackendEventHandler<AssistantMessageFullEvent>({
    resolveTargetConversationRef,
    shouldIgnoreForStaleTurn,
    onEvent: (event, conversationRef) => {
      updateLastAssistantLlmTextMessage({
        fullAssistantMessage: buildAssistantMessageFullUpdate(event.payload),
      }, event.turn_ref || undefined, conversationRef);
      recordTrackingEvent('assistant-message-full', event.turn_ref, {}, conversationRef);
    },
  });

  const handleToolSchemasEvent = useTurnScopedBackendEventHandler<ToolSchemasEvent>({
    resolveTargetConversationRef,
    shouldIgnoreForStaleTurn,
    onEvent: (event, conversationRef) => {
      updateLastMessageBySender('user', {
        ...buildToolSchemasUpdate(event.payload),
      }, event.turn_ref || undefined, conversationRef);
      recordTrackingEvent('tool-schemas', event.turn_ref, {}, conversationRef);
    },
  });

  const handleSystemPrompt = useCallback((event: SystemPromptEvent | ConversationEvent) => {
    const backendEvent = unwrapMetadataBackendEvent<SystemPromptEvent>(event, 'system-prompt');
    if (backendEvent) {
      handleSystemPromptEvent(backendEvent);
    }
  }, [handleSystemPromptEvent]);

  const handleUserMessageFull = useCallback((event: UserMessageFullEvent | ConversationEvent) => {
    const backendEvent = unwrapMetadataBackendEvent<UserMessageFullEvent>(event, 'user-message-full');
    if (backendEvent) {
      handleUserMessageFullEvent(backendEvent);
    }
  }, [handleUserMessageFullEvent]);

  const handleAssistantMessageFull = useCallback((event: AssistantMessageFullEvent | ConversationEvent) => {
    const backendEvent = unwrapMetadataBackendEvent<AssistantMessageFullEvent>(event, 'assistant-message-full');
    if (backendEvent) {
      handleAssistantMessageFullEvent(backendEvent);
    }
  }, [handleAssistantMessageFullEvent]);

  const handleToolSchemas = useCallback((event: ToolSchemasEvent | ConversationEvent) => {
    const backendEvent = unwrapMetadataBackendEvent<ToolSchemasEvent>(event, 'tool-schemas');
    if (backendEvent) {
      handleToolSchemasEvent(backendEvent);
    }
  }, [handleToolSchemasEvent]);

  return {
    handleSystemPrompt,
    handleUserMessageFull,
    handleAssistantMessageFull,
    handleToolSchemas,
  };
}
