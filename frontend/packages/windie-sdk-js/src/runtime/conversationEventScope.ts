/**
 * Provides the conversation event scope module for the TypeScript SDK runtime.
 */

import type { ConversationEvent } from '../conversation/types.js';

export type ConversationEventScope = 'turn_stream' | 'conversation_control';

const CONVERSATION_CONTROL_EVENT_TYPES = new Set<ConversationEvent['type']>([
  'compaction_started',
  'compaction_skipped',
  'compaction_applied',
  'compaction_failed',
]);

function sourceEventType(event: ConversationEvent): string | null {
  const value = event.payload.sourceEventType;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function getConversationEventScope(event: ConversationEvent): ConversationEventScope {
  if (CONVERSATION_CONTROL_EVENT_TYPES.has(event.type)) {
    return 'conversation_control';
  }
  const sourceType = sourceEventType(event);
  if (
    event.type === 'runtime_error'
    && sourceType
    && (sourceType.startsWith('compaction_') || sourceType.startsWith('context-compaction-'))
  ) {
    return 'conversation_control';
  }
  return 'turn_stream';
}

export function isConversationControlEvent(event: ConversationEvent): boolean {
  return getConversationEventScope(event) === 'conversation_control';
}

export function shouldEventUpdateActiveTurnRef(event: ConversationEvent): boolean {
  return resolveActiveTurnRef(null, event) !== null;
}

const ACTIVE_TURN_CLAIM_EVENT_TYPES = new Set<ConversationEvent['type']>([
  'turn_started',
  'user_message',
]);

const ACTIVE_TURN_CONTINUATION_EVENT_TYPES = new Set<ConversationEvent['type']>([
  'assistant_delta',
  'reasoning_delta',
  'assistant_message',
  'system_prompt',
  'user_message_metadata',
  'tool_schemas_metadata',
  'usage_updated',
  'tool_call',
  'tool_progress',
  'tool_output',
  'tool_bundle_call',
  'tool_bundle_output',
  'turn_completed',
  'turn_error',
  'turn_stopped',
]);

export function resolveActiveTurnRef(
  activeTurnRef: string | null,
  event: ConversationEvent,
): string | null {
  const turnRef = typeof event.turnRef === 'string' && event.turnRef.trim()
    ? event.turnRef.trim()
    : null;
  if (!turnRef || getConversationEventScope(event) !== 'turn_stream') {
    return activeTurnRef;
  }
  if (ACTIVE_TURN_CLAIM_EVENT_TYPES.has(event.type)) {
    return turnRef;
  }
  if (ACTIVE_TURN_CONTINUATION_EVENT_TYPES.has(event.type)) {
    return !activeTurnRef || activeTurnRef === turnRef ? turnRef : activeTurnRef;
  }
  return activeTurnRef;
}
