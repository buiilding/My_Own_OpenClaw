import type {
  AssistantMessageFullEvent,
  BackendEvent,
  BackendEventType,
  SystemPromptEvent,
  ToolSchemasEvent,
  UserMessageFullEvent,
} from '../../../../types/backendEvents';
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
  const handleSystemPrompt = useTurnScopedBackendEventHandler<SystemPromptEvent>({
    resolveTargetConversationRef,
    shouldIgnoreForStaleTurn,
    onEvent: (event, conversationRef) => {
      updateLastMessageBySender('user', {
        systemPrompt: buildSystemPromptUpdate(event.payload),
      }, event.turn_ref || undefined, conversationRef);
      recordTrackingEvent('system-prompt', event.turn_ref, {}, conversationRef);
    },
  });

  const handleUserMessageFull = useTurnScopedBackendEventHandler<UserMessageFullEvent>({
    resolveTargetConversationRef,
    shouldIgnoreForStaleTurn,
    onEvent: (event, conversationRef) => {
      updateLastMessageBySender('user', {
        fullUserMessage: buildUserMessageFullUpdate(event.payload),
      }, event.turn_ref || undefined, conversationRef);
      recordTrackingEvent('user-message-full', event.turn_ref, {}, conversationRef);
    },
  });

  const handleAssistantMessageFull = useTurnScopedBackendEventHandler<AssistantMessageFullEvent>({
    resolveTargetConversationRef,
    shouldIgnoreForStaleTurn,
    onEvent: (event, conversationRef) => {
      updateLastAssistantLlmTextMessage({
        fullAssistantMessage: buildAssistantMessageFullUpdate(event.payload),
      }, event.turn_ref || undefined, conversationRef);
      recordTrackingEvent('assistant-message-full', event.turn_ref, {}, conversationRef);
    },
  });

  const handleToolSchemas = useTurnScopedBackendEventHandler<ToolSchemasEvent>({
    resolveTargetConversationRef,
    shouldIgnoreForStaleTurn,
    onEvent: (event, conversationRef) => {
      updateLastMessageBySender('user', {
        ...buildToolSchemasUpdate(event.payload),
      }, event.turn_ref || undefined, conversationRef);
      recordTrackingEvent('tool-schemas', event.turn_ref, {}, conversationRef);
    },
  });

  return {
    handleSystemPrompt,
    handleUserMessageFull,
    handleAssistantMessageFull,
    handleToolSchemas,
  };
}
