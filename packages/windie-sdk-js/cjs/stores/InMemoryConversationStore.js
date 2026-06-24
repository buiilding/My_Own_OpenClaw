"use strict";
/**
 * Stores and retrieves in memory conversation state for the TypeScript SDK runtime.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryConversationStore = void 0;
const metadata_js_1 = require("../conversation/metadata.js");
const conversationProjections_js_1 = require("../projections/conversationProjections.js");
const compactedReplayEvents_js_1 = require("./compactedReplayEvents.js");
const modelHistoryPayload_js_1 = require("../runtime/modelHistoryPayload.js");
const displayTimelineStoreProjection_js_1 = require("./displayTimelineStoreProjection.js");
function lastTextEvent(events) {
    return [...events].reverse().find(event => {
        if (event.type === 'user_message' || event.type === 'assistant_message') {
            return typeof event.payload.text === 'string' || typeof event.payload.content === 'string';
        }
        return false;
    });
}
function eventText(event) {
    if (!event) {
        return null;
    }
    if (typeof event.payload.text === 'string') {
        return event.payload.text;
    }
    if (typeof event.payload.content === 'string') {
        return event.payload.content;
    }
    return null;
}
function revisionOperationFromModelHistory(checkpoint) {
    return checkpoint.rows.some(row => row.messageType === 'context_compaction')
        ? 'compact'
        : 'send';
}
class InMemoryConversationStore {
    constructor() {
        this.eventsByConversation = new Map();
        this.eventIdsByConversation = new Map();
        this.revisionsByConversation = new Map();
        this.replayByConversation = new Map();
        this.modelHistoryByConversation = new Map();
        this.displayTimelineByConversation = new Map();
    }
    async appendEvent(event) {
        await this.appendEvents([event]);
    }
    async appendEvents(events) {
        for (const event of events) {
            const knownIds = this.eventIdsByConversation.get(event.conversationRef) ?? new Set();
            if (knownIds.has(event.eventId)) {
                continue;
            }
            knownIds.add(event.eventId);
            this.eventIdsByConversation.set(event.conversationRef, knownIds);
            const existing = this.eventsByConversation.get(event.conversationRef) ?? [];
            existing.push(event);
            this.eventsByConversation.set(event.conversationRef, existing);
            this.revisionsByConversation.set(event.conversationRef, {
                ...this.revisionsByConversation.get(event.conversationRef),
                conversationRef: event.conversationRef,
                revisionId: event.revisionId,
                operation: this.revisionsByConversation.get(event.conversationRef)?.operation ?? 'send',
                createdAt: this.revisionsByConversation.get(event.conversationRef)?.createdAt ?? event.timestamp,
                updatedAt: event.timestamp,
                active: true,
            });
        }
    }
    async replaceCompactedReplay(snapshot) {
        if (!snapshot.complete || snapshot.entryCount !== snapshot.entries.length) {
            return;
        }
        this.replayByConversation.set(snapshot.conversationRef, {
            ...snapshot,
            active: true,
        });
    }
    async loadEvents(conversationRef) {
        return [...(this.eventsByConversation.get(conversationRef) ?? [])];
    }
    async loadForDisplay(conversationRef) {
        const events = await this.loadEvents(conversationRef);
        const timeline = await this.loadDisplayTimeline({ conversationRef });
        if (!timeline) {
            return (0, conversationProjections_js_1.buildDisplayConversation)(events);
        }
        return (0, displayTimelineStoreProjection_js_1.displayConversationFromTimeline)(timeline, events);
    }
    async loadDisplayRows(conversationRef) {
        const events = await this.loadEvents(conversationRef);
        const timeline = await this.loadDisplayTimeline({ conversationRef });
        if (!timeline) {
            return (0, conversationProjections_js_1.buildDisplayRows)(events);
        }
        return (0, displayTimelineStoreProjection_js_1.displayRowsFromTimeline)(timeline, events);
    }
    async replaceDisplayTimeline(checkpoint) {
        const existing = this.displayTimelineByConversation.get(checkpoint.conversationRef) ?? [];
        const next = [
            ...existing.filter(entry => entry.revisionId !== checkpoint.revisionId),
            {
                ...checkpoint,
                rows: [...checkpoint.rows],
            },
        ];
        this.displayTimelineByConversation.set(checkpoint.conversationRef, next);
        this.revisionsByConversation.set(checkpoint.conversationRef, {
            conversationRef: checkpoint.conversationRef,
            revisionId: checkpoint.revisionId,
            parentRevisionId: checkpoint.baseRevisionId ?? null,
            operation: checkpoint.reason === 'user_edit' ? 'edit' : checkpoint.reason ?? 'send',
            displayTimelineId: checkpoint.revisionId,
            createdAt: checkpoint.createdAt,
            updatedAt: checkpoint.createdAt,
            active: true,
        });
    }
    async loadDisplayTimeline(input) {
        const checkpoints = this.displayTimelineByConversation.get(input.conversationRef) ?? [];
        if (!input.revisionId) {
            const activeRevisionId = this.revisionsByConversation.get(input.conversationRef)?.displayTimelineId
                ?? this.revisionsByConversation.get(input.conversationRef)?.revisionId
                ?? null;
            const active = activeRevisionId
                ? checkpoints.find(checkpoint => checkpoint.revisionId === activeRevisionId)
                : null;
            if (active) {
                return { ...active, rows: [...active.rows] };
            }
        }
        const candidates = input.revisionId
            ? checkpoints.filter(checkpoint => checkpoint.revisionId === input.revisionId)
            : checkpoints;
        const latest = [...candidates].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
        return latest ? { ...latest, rows: [...latest.rows] } : null;
    }
    async loadForRehydrate(conversationRef) {
        const activeRevisionId = this.revisionsByConversation.get(conversationRef)?.revisionId ?? null;
        const modelHistoryCheckpoint = await this.loadModelHistory({
            conversationRef,
            revisionId: activeRevisionId,
        });
        const modelHistorySnapshot = modelHistoryCheckpoint
            ? (0, modelHistoryPayload_js_1.rehydrateSnapshotFromModelHistoryCheckpoint)(modelHistoryCheckpoint)
            : null;
        if (modelHistorySnapshot) {
            return modelHistorySnapshot;
        }
        const compactedReplay = await this.loadCompactedReplay(conversationRef);
        if (compactedReplay?.complete
            && compactedReplay.active !== false
            && compactedReplay.entryCount === compactedReplay.entries.length) {
            return {
                conversationRef,
                revisionId: compactedReplay.sourceRevisionId,
                messages: compactedReplay.entries,
                replayGenerationId: compactedReplay.generationId,
            };
        }
        return (0, conversationProjections_js_1.buildRehydrateSnapshot)(await this.loadEvents(conversationRef));
    }
    async replaceModelHistory(checkpoint) {
        const existing = this.modelHistoryByConversation.get(checkpoint.conversationRef) ?? [];
        const next = [
            ...existing.filter(entry => !(entry.revisionId === checkpoint.revisionId
                && entry.checkpointId === checkpoint.checkpointId)),
            {
                ...checkpoint,
                rows: [...checkpoint.rows],
            },
        ];
        this.modelHistoryByConversation.set(checkpoint.conversationRef, next);
        const existingRevision = this.revisionsByConversation.get(checkpoint.conversationRef);
        const modelHistoryOperation = revisionOperationFromModelHistory(checkpoint);
        this.revisionsByConversation.set(checkpoint.conversationRef, {
            ...existingRevision,
            conversationRef: checkpoint.conversationRef,
            revisionId: checkpoint.revisionId,
            operation: modelHistoryOperation === 'send'
                && existingRevision?.operation
                && existingRevision.operation !== 'send'
                ? existingRevision.operation
                : modelHistoryOperation,
            modelHistoryCheckpointId: checkpoint.checkpointId,
            createdAt: existingRevision?.createdAt ?? checkpoint.createdAt,
            updatedAt: checkpoint.createdAt,
            active: true,
        });
    }
    async loadModelHistory(input) {
        const checkpoints = this.modelHistoryByConversation.get(input.conversationRef) ?? [];
        const candidates = input.revisionId
            ? checkpoints.filter(checkpoint => checkpoint.revisionId === input.revisionId)
            : checkpoints;
        const latest = [...candidates].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
        return latest ? { ...latest, rows: [...latest.rows] } : null;
    }
    async listMetadata(options = {}) {
        const metadataByConversation = new Map();
        Array.from(this.eventsByConversation.entries()).forEach(([conversationRef, events]) => {
            const revision = this.revisionsByConversation.get(conversationRef);
            const lastEvent = [...events].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0];
            const latestDisplayTimeline = [...(this.displayTimelineByConversation.get(conversationRef) ?? [])]
                .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null;
            const firstDisplayUserRow = latestDisplayTimeline?.rows.find(row => row.role === 'user') ?? null;
            const lastDisplayTextRow = latestDisplayTimeline
                ? [...latestDisplayTimeline.rows].reverse().find(row => typeof row.content === 'string') ?? null
                : null;
            const eventUpdatedAt = revision?.updatedAt ?? lastEvent?.timestamp ?? new Date(0).toISOString();
            const displayIsCurrent = latestDisplayTimeline
                ? Date.parse(latestDisplayTimeline.createdAt) >= Date.parse(eventUpdatedAt)
                : false;
            const eventLastMessage = eventText(lastTextEvent(events));
            const displayLastMessage = typeof lastDisplayTextRow?.content === 'string'
                ? lastDisplayTextRow.content
                : null;
            metadataByConversation.set(conversationRef, {
                conversationRef,
                revisionId: displayIsCurrent
                    ? latestDisplayTimeline?.revisionId ?? revision?.revisionId ?? lastEvent?.revisionId ?? 'rev-missing'
                    : revision?.revisionId ?? lastEvent?.revisionId ?? latestDisplayTimeline?.revisionId ?? 'rev-missing',
                title: (typeof firstDisplayUserRow?.content === 'string' ? firstDisplayUserRow.content : null)
                    ?? eventText(events.find(event => event.type === 'user_message'))
                    ?? conversationRef,
                lastMessage: displayIsCurrent
                    ? displayLastMessage ?? eventLastMessage
                    : eventLastMessage ?? displayLastMessage,
                updatedAt: displayIsCurrent ? latestDisplayTimeline?.createdAt ?? eventUpdatedAt : eventUpdatedAt,
                eventCount: events.length,
            });
        });
        Array.from(this.displayTimelineByConversation.entries()).forEach(([conversationRef, checkpoints]) => {
            if (metadataByConversation.has(conversationRef)) {
                return;
            }
            const latest = [...checkpoints].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
            if (!latest) {
                return;
            }
            const firstUserRow = latest.rows.find(row => row.role === 'user');
            const lastTextRow = [...latest.rows].reverse().find(row => typeof row.content === 'string');
            metadataByConversation.set(conversationRef, {
                conversationRef,
                revisionId: latest.revisionId,
                title: typeof firstUserRow?.content === 'string' ? firstUserRow.content : conversationRef,
                lastMessage: typeof lastTextRow?.content === 'string' ? lastTextRow.content : null,
                updatedAt: latest.createdAt,
                eventCount: 0,
            });
        });
        const metadata = Array.from(metadataByConversation.values())
            .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
        return (0, metadata_js_1.applyConversationMetadataPagination)(metadata, options);
    }
    async searchMetadata(options) {
        return (0, metadata_js_1.searchConversationMetadata)(await this.listMetadata(), options);
    }
    async deleteConversation(conversationRef) {
        this.eventsByConversation.delete(conversationRef);
        this.eventIdsByConversation.delete(conversationRef);
        this.revisionsByConversation.delete(conversationRef);
        this.replayByConversation.delete(conversationRef);
        this.modelHistoryByConversation.delete(conversationRef);
        this.displayTimelineByConversation.delete(conversationRef);
    }
    async clearConversations() {
        this.eventsByConversation.clear();
        this.eventIdsByConversation.clear();
        this.revisionsByConversation.clear();
        this.replayByConversation.clear();
        this.modelHistoryByConversation.clear();
        this.displayTimelineByConversation.clear();
    }
    async getRevision(conversationRef) {
        const revision = this.revisionsByConversation.get(conversationRef);
        if (revision) {
            return revision;
        }
        return {
            conversationRef,
            revisionId: 'rev-empty',
            updatedAt: new Date(0).toISOString(),
        };
    }
    async listRevisions(options) {
        const revisions = new Map();
        const activeRevision = this.revisionsByConversation.get(options.conversationRef) ?? null;
        if (activeRevision) {
            revisions.set(activeRevision.revisionId, activeRevision);
        }
        for (const checkpoint of this.displayTimelineByConversation.get(options.conversationRef) ?? []) {
            revisions.set(checkpoint.revisionId, {
                ...revisions.get(checkpoint.revisionId),
                conversationRef: options.conversationRef,
                revisionId: checkpoint.revisionId,
                parentRevisionId: checkpoint.baseRevisionId ?? revisions.get(checkpoint.revisionId)?.parentRevisionId ?? null,
                operation: checkpoint.reason === 'user_edit' ? 'edit' : checkpoint.reason ?? revisions.get(checkpoint.revisionId)?.operation ?? 'send',
                displayTimelineId: checkpoint.revisionId,
                createdAt: revisions.get(checkpoint.revisionId)?.createdAt ?? checkpoint.createdAt,
                updatedAt: revisions.get(checkpoint.revisionId)?.updatedAt ?? checkpoint.createdAt,
                active: activeRevision?.revisionId === checkpoint.revisionId,
            });
        }
        for (const checkpoint of this.modelHistoryByConversation.get(options.conversationRef) ?? []) {
            revisions.set(checkpoint.revisionId, {
                ...revisions.get(checkpoint.revisionId),
                conversationRef: options.conversationRef,
                revisionId: checkpoint.revisionId,
                operation: revisions.get(checkpoint.revisionId)?.operation ?? revisionOperationFromModelHistory(checkpoint),
                modelHistoryCheckpointId: checkpoint.checkpointId,
                createdAt: revisions.get(checkpoint.revisionId)?.createdAt ?? checkpoint.createdAt,
                updatedAt: checkpoint.createdAt,
                active: activeRevision?.revisionId === checkpoint.revisionId,
            });
        }
        const sorted = Array.from(revisions.values())
            .sort((a, b) => {
            if (a.active && !b.active) {
                return -1;
            }
            if (!a.active && b.active) {
                return 1;
            }
            return Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
                || b.revisionId.localeCompare(a.revisionId);
        });
        return typeof options.limit === 'number' && options.limit > 0
            ? sorted.slice(0, options.limit)
            : sorted;
    }
    async loadCompactedReplay(conversationRef) {
        return this.replayByConversation.get(conversationRef)
            ?? (0, compactedReplayEvents_js_1.latestCompactedReplayFromEvents)(await this.loadEvents(conversationRef));
    }
}
exports.InMemoryConversationStore = InMemoryConversationStore;
