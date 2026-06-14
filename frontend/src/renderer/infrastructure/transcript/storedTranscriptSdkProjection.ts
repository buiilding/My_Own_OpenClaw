/**
 * Stores and retrieves stored transcript sdk projection state for the renderer UI.
 */

import {
  buildRehydrateSnapshot,
  createConversationEvent,
  type ConversationEvent,
} from '../api/windieSdkClient';
import {
  buildRehydrateMessagePayload,
} from './rehydrateMessageState';
import {
  resolveStoredTranscriptMemoryState,
} from './storedTranscriptMemoryState';

type StoredTranscriptEntry = Record<string, unknown>;

type StoredTranscriptProjectionOptions = {
  conversationRef: string;
  revisionId?: string;
};

function resolveEventType(entry: StoredTranscriptEntry): ConversationEvent['type'] {
  const normalized = resolveStoredTranscriptMemoryState(entry);
  if (normalized.role === 'user') {
    return 'user_message';
  }
  if (normalized.role === 'tool' || normalized.normalizedMessageType === 'tool-output') {
    return 'tool_output';
  }
  if (normalized.normalizedMessageType === 'tool-call') {
    return 'tool_call';
  }
  if (normalized.normalizedMessageType === 'tool-bundle') {
    return 'tool_bundle_call';
  }
  return 'assistant_message';
}

function buildStructuredPayload(entry: StoredTranscriptEntry): Record<string, unknown> {
  const normalized = resolveStoredTranscriptMemoryState(entry);
  return buildRehydrateMessagePayload({
    role: normalized.role || 'assistant',
    messageType: normalized.messageType,
    rawContent: normalized.rawContent,
    timestamp: normalized.timestamp,
    correlationId: normalized.correlationId,
    transparency: normalized.transparency,
    screenshotAttachment: normalized.screenshotAttachment,
    structuredPayload: normalized.structuredToolPayload,
    fallbackToolName: normalized.toolName,
    fallbackToolCallId: normalized.toolCallId || normalized.correlationId,
  });
}

export function buildConversationEventsFromStoredTranscript(
  entries: StoredTranscriptEntry[],
  options: StoredTranscriptProjectionOptions,
): ConversationEvent[] {
  const revisionId = options.revisionId || `rev-stored-${options.conversationRef}`;
  return entries.map((entry, index) => {
    const normalized = resolveStoredTranscriptMemoryState(entry);
    const structuredPayload = buildStructuredPayload(entry);
    return createConversationEvent({
      eventId: typeof entry.id === 'string' && entry.id.trim()
        ? entry.id
        : `stored-${options.conversationRef}-${index}`,
      type: resolveEventType(entry),
      conversationRef: options.conversationRef,
      revisionId,
      timestamp: normalized.timestamp || undefined,
      source: 'sdk',
      payload: {
        text: normalized.rawContent,
        content: normalized.rawContent,
        role: normalized.role,
        messageType: normalized.messageType,
        correlationId: normalized.correlationId || null,
        requestId: normalized.correlationId || null,
        toolName: normalized.toolName || null,
        toolCallId: normalized.toolCallId || normalized.correlationId || null,
        screenshotRef: normalized.screenshotAttachment.screenshotRef || null,
        screenshot: normalized.screenshotAttachment.screenshot || null,
        structuredPayload,
      },
    });
  });
}

export function buildStoredTranscriptRehydrateMessages(
  entries: StoredTranscriptEntry[],
  options: StoredTranscriptProjectionOptions,
): Array<Record<string, unknown>> {
  return buildRehydrateSnapshot(
    buildConversationEventsFromStoredTranscript(entries, options),
  ).messages;
}
