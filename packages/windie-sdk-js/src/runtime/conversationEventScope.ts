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
  return Boolean(event.turnRef) && getConversationEventScope(event) === 'turn_stream';
}
