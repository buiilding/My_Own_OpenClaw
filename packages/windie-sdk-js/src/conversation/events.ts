/**
 * Provides the events module for the TypeScript SDK runtime.
 */

import type {
  ConversationEvent,
  ConversationEventSource,
  ConversationEventType,
  JsonRecord,
} from './types.js';

export type CreateConversationEventInput<TPayload extends JsonRecord = JsonRecord> = {
  type: ConversationEventType;
  conversationRef: string;
  revisionId?: string;
  turnRef?: string | null;
  source?: ConversationEventSource;
  payload?: TPayload;
  eventId?: string;
  timestamp?: string;
};

export function createRuntimeId(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createConversationEvent<TPayload extends JsonRecord = JsonRecord>({
  type,
  conversationRef,
  revisionId,
  turnRef = null,
  source = 'sdk',
  payload,
  eventId,
  timestamp,
}: CreateConversationEventInput<TPayload>): ConversationEvent<TPayload> {
  return {
    eventId: eventId ?? createRuntimeId('evt'),
    type,
    conversationRef,
    turnRef,
    revisionId: revisionId ?? createRuntimeId('rev'),
    timestamp: timestamp ?? new Date().toISOString(),
    source,
    payload: payload ?? ({} as TPayload),
  };
}

export function createInitialRevisionId(): string {
  return createRuntimeId('rev');
}
