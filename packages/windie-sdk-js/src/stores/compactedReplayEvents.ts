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

export function compactedReplayFromEvent(event: ConversationEvent): CompactedReplaySnapshot | null {
  if (event.type !== 'compaction_applied') {
    return null;
  }
  const entries = normalizeReplayEntries(event.payload.entries);
  const replacementHistoryEntries = entries.length > 0
    ? entries
    : normalizeReplayEntries(event.payload.replacementHistoryEntries ?? event.payload.replacement_history_entries);
  const generationId = normalizeString(event.payload.generationId)
    ?? normalizeString(event.payload.generation_id)
    ?? event.eventId;
  return {
    generationId,
    conversationRef: event.conversationRef,
    sourceRevisionId: normalizeString(event.payload.sourceRevisionId)
      ?? normalizeString(event.payload.source_revision_id)
      ?? event.revisionId,
    sourceTurnRef: normalizeString(event.payload.sourceTurnRef)
      ?? normalizeString(event.payload.source_turn_ref)
      ?? normalizeString(event.payload.operationRef)
      ?? event.turnRef
      ?? null,
    createdAt: normalizeString(event.payload.createdAt)
      ?? normalizeString(event.payload.created_at)
      ?? event.timestamp,
    entries: replacementHistoryEntries,
    entryCount: Number(event.payload.entryCount ?? event.payload.entry_count ?? replacementHistoryEntries.length),
    complete: event.payload.complete !== false,
    active: event.payload.active !== false,
  };
}

export function latestCompactedReplayFromEvents(
  events: ConversationEvent[],
): CompactedReplaySnapshot | null {
  return [...events].reverse().map(compactedReplayFromEvent).find(Boolean) ?? null;
}
