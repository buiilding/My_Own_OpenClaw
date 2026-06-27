/**
 * Provides the compacted replay events module for the TypeScript SDK runtime.
 */

import type {
  CompactedReplaySnapshot,
  ConversationEvent,
} from '../conversation/types.js';

function normalizeRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeReplayEntries(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => Boolean(normalizeRecord(entry)))
    : [];
}

function compactedReplayFromEvent(event: ConversationEvent): CompactedReplaySnapshot | null {
  if (event.type !== 'compaction_applied') {
    return null;
  }
  const entries = normalizeReplayEntries(event.payload.entries);
  const replacementHistoryEntries = entries.length > 0
    ? entries
    : normalizeReplayEntries(event.payload.replacementHistoryEntries);
  if (replacementHistoryEntries.length === 0) {
    return null;
  }
  const generationId = normalizeString(event.payload.generationId)
    ?? event.eventId;
  return {
    generationId,
    conversationRef: event.conversationRef,
    sourceRevisionId: normalizeString(event.payload.sourceRevisionId)
      ?? event.revisionId,
    sourceTurnRef: normalizeString(event.payload.sourceTurnRef)
      ?? normalizeString(event.payload.operationRef)
      ?? event.turnRef
      ?? null,
    createdAt: normalizeString(event.payload.createdAt)
      ?? event.timestamp,
    entries: replacementHistoryEntries,
    entryCount: Number(event.payload.entryCount ?? replacementHistoryEntries.length),
    complete: event.payload.complete !== false,
    active: event.payload.active !== false,
  };
}

export function latestCompactedReplayFromEvents(
  events: ConversationEvent[],
): CompactedReplaySnapshot | null {
  return [...events].reverse().map(compactedReplayFromEvent).find(Boolean) ?? null;
}
