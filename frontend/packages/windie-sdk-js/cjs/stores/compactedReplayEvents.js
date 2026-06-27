"use strict";
/**
 * Provides the compacted replay events module for the TypeScript SDK runtime.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.latestCompactedReplayFromEvents = latestCompactedReplayFromEvents;
function normalizeRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : null;
}
function normalizeString(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function normalizeReplayEntries(value) {
    return Array.isArray(value)
        ? value.filter((entry) => Boolean(normalizeRecord(entry)))
        : [];
}
function compactedReplayFromEvent(event) {
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
function latestCompactedReplayFromEvents(events) {
    return [...events].reverse().map(compactedReplayFromEvent).find(Boolean) ?? null;
}
