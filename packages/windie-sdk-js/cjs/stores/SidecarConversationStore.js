"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SidecarConversationStore = void 0;
const metadata_js_1 = require("../conversation/metadata.js");
const conversationProjections_js_1 = require("../projections/conversationProjections.js");
const CHAT_EVENT_RECORD_KIND = 'chat_event';
function normalizeRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : null;
}
function parseJsonRecord(value) {
    const record = normalizeRecord(value);
    if (record) {
        return record;
    }
    if (typeof value !== 'string' || !value.trim()) {
        return null;
    }
    try {
        return normalizeRecord(JSON.parse(value));
    }
    catch {
        return null;
    }
}
function normalizeString(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function normalizeConversationEvent(candidate) {
    const event = normalizeRecord(candidate);
    if (!event) {
        return null;
    }
    if (typeof event.eventId !== 'string'
        || typeof event.type !== 'string'
        || typeof event.conversationRef !== 'string'
        || typeof event.revisionId !== 'string'
        || typeof event.timestamp !== 'string'
        || typeof event.source !== 'string') {
        return null;
    }
    return {
        eventId: event.eventId,
        type: event.type,
        conversationRef: event.conversationRef,
        turnRef: typeof event.turnRef === 'string' ? event.turnRef : null,
        revisionId: event.revisionId,
        timestamp: event.timestamp,
        source: event.source,
        payload: normalizeRecord(event.payload) ?? {},
    };
}
function storedEventFromRow(row) {
    return normalizeConversationEvent(parseJsonRecord(row.event_payload)
        ?? parseJsonRecord(row.eventPayload)
        ?? parseJsonRecord(row.metadata)?.windie_sdk_conversation_event
        ?? parseJsonRecord(row.metadata)?.windieSdkConversationEvent);
}
function textFromEvent(event) {
    for (const key of ['text', 'content', 'finalResponse', 'final_response', 'error']) {
        const value = event.payload[key];
        if (typeof value === 'string' && value.trim()) {
            return value;
        }
    }
    return `[sdk event: ${event.type}]`;
}
function roleFromEvent(event) {
    if (event.type === 'user_message') {
        return 'user';
    }
    if (event.type === 'tool_output' || event.type === 'tool_bundle_output') {
        return 'tool';
    }
    return 'assistant';
}
function compactedReplayFromEvent(event) {
    if (event.type !== 'compaction_applied') {
        return null;
    }
    const entries = Array.isArray(event.payload.entries) ? event.payload.entries : [];
    const generationId = normalizeString(event.payload.generationId) ?? event.eventId;
    return {
        generationId,
        conversationRef: event.conversationRef,
        sourceRevisionId: normalizeString(event.payload.sourceRevisionId) ?? event.revisionId,
        sourceTurnRef: normalizeString(event.payload.sourceTurnRef) ?? event.turnRef ?? null,
        createdAt: normalizeString(event.payload.createdAt) ?? event.timestamp,
        entries: entries.filter((entry) => Boolean(normalizeRecord(entry))),
        entryCount: Number(event.payload.entryCount ?? entries.length),
        complete: event.payload.complete !== false,
        active: event.payload.active !== false,
    };
}
function metadataFromRow(row) {
    const conversationRef = normalizeString(row.conversation_id)
        ?? normalizeString(row.conversationId)
        ?? normalizeString(row.conversation_ref)
        ?? normalizeString(row.conversationRef);
    if (!conversationRef) {
        return null;
    }
    return {
        conversationRef,
        revisionId: normalizeString(row.revision_id) ?? normalizeString(row.revisionId) ?? `rev-stored-${conversationRef}`,
        title: normalizeString(row.title) ?? conversationRef,
        lastMessage: normalizeString(row.last_message) ?? normalizeString(row.lastMessage),
        updatedAt: normalizeString(row.last_timestamp)
            ?? normalizeString(row.updatedAt)
            ?? normalizeString(row.timestamp)
            ?? new Date(0).toISOString(),
        eventCount: Number(row.entry_count ?? row.eventCount ?? 0) || 0,
        workspacePath: normalizeString(row.workspace_path) ?? normalizeString(row.workspacePath),
        workspaceName: normalizeString(row.workspace_name) ?? normalizeString(row.workspaceName),
        snippet: normalizeString(row.snippet),
        matchedRole: normalizeString(row.matched_role) ?? normalizeString(row.matchedRole),
    };
}
class SidecarConversationStore {
    constructor(options) {
        this.options = options;
        this.pageSize = options.pageSize ?? 1000;
        this.maxPages = options.maxPages ?? 250;
    }
    async appendEvent(event) {
        await this.appendEvents([event]);
    }
    async appendEvents(events) {
        for (const event of events) {
            await this.call('store_chat_event', this.buildEventWriteParams(event));
        }
    }
    async rewriteConversation(plan) {
        const rewriteEvent = plan.preservedEvents[plan.preservedEvents.length - 1] ?? null;
        if ((plan.reason === 'edit_resend' || plan.reason === 'retry')
            && rewriteEvent?.type === 'conversation_rewritten') {
            await this.call('rewrite_chat_conversation_after_event', {
                user_id: this.options.userId,
                conversation_id: plan.conversationRef,
                record_kind: CHAT_EVENT_RECORD_KIND,
                cut_after_event_id: plan.cutAfterEventId ?? null,
                revision_id: plan.newRevisionId,
                revision_updated_at: new Date().toISOString(),
                event: this.buildEventWriteParams(rewriteEvent),
            });
            return;
        }
        await this.call('replace_chat_conversation', {
            user_id: this.options.userId,
            conversation_id: plan.conversationRef,
            record_kind: CHAT_EVENT_RECORD_KIND,
            revision_id: plan.newRevisionId,
            revision_updated_at: new Date().toISOString(),
            events: plan.preservedEvents.map((event, index) => (this.buildEventWriteParams(event, index + 1))),
        });
    }
    async replaceCompactedReplay(snapshot) {
        if (!snapshot.complete || snapshot.entryCount !== snapshot.entries.length) {
            return;
        }
        await this.appendEvent({
            eventId: `compaction-${snapshot.generationId}`,
            type: 'compaction_applied',
            conversationRef: snapshot.conversationRef,
            revisionId: snapshot.sourceRevisionId,
            turnRef: snapshot.sourceTurnRef ?? null,
            timestamp: snapshot.createdAt,
            source: 'sdk',
            payload: {
                ...snapshot,
                active: true,
            },
        });
    }
    async loadEvents(conversationRef) {
        const rows = [];
        let afterMessageIndex = null;
        for (let page = 0; page < this.maxPages; page += 1) {
            const result = await this.call('get_chat_events', {
                user_id: this.options.userId,
                conversation_id: conversationRef,
                record_kind: CHAT_EVENT_RECORD_KIND,
                limit: this.pageSize,
                after_message_index: afterMessageIndex,
            });
            const data = normalizeRecord(result.data) ?? {};
            const entries = Array.isArray(data.events) ? data.events : [];
            if (entries.length === 0) {
                break;
            }
            rows.push(...entries.filter((entry) => Boolean(normalizeRecord(entry))));
            if (entries.length < this.pageSize) {
                break;
            }
            const last = normalizeRecord(entries[entries.length - 1]);
            const nextIndex = Number(last?.message_index);
            if (!Number.isFinite(nextIndex) || nextIndex === afterMessageIndex) {
                break;
            }
            afterMessageIndex = nextIndex;
        }
        return rows.map(storedEventFromRow).filter((event) => Boolean(event));
    }
    async loadForDisplay(conversationRef) {
        return (0, conversationProjections_js_1.buildDisplayConversation)(await this.loadEvents(conversationRef));
    }
    async loadDisplayRows(conversationRef) {
        return (0, conversationProjections_js_1.buildDisplayRows)(await this.loadEvents(conversationRef));
    }
    async loadForRehydrate(conversationRef) {
        const events = await this.loadEvents(conversationRef);
        const replay = [...events].reverse().map(compactedReplayFromEvent).find(Boolean);
        if (replay?.complete && replay.active !== false && replay.entryCount === replay.entries.length) {
            return {
                conversationRef,
                revisionId: replay.sourceRevisionId,
                messages: replay.entries,
                replayGenerationId: replay.generationId,
            };
        }
        return (0, conversationProjections_js_1.buildRehydrateSnapshot)(events);
    }
    async listMetadata(options = {}) {
        const result = await this.call('list_chat_conversations', {
            user_id: this.options.userId,
            record_kind: CHAT_EVENT_RECORD_KIND,
            limit: options.cursor ? undefined : options.limit,
        });
        const data = normalizeRecord(result.data) ?? {};
        const metadata = (Array.isArray(data.conversations) ? data.conversations : [])
            .map(row => metadataFromRow(normalizeRecord(row) ?? {}))
            .filter((entry) => Boolean(entry))
            .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
        return (0, metadata_js_1.applyConversationMetadataPagination)(metadata, options);
    }
    async searchMetadata(options) {
        const result = await this.call('search_chat_conversations', {
            user_id: this.options.userId,
            record_kind: CHAT_EVENT_RECORD_KIND,
            query: options.query,
            limit: options.cursor ? undefined : options.limit,
        });
        const data = normalizeRecord(result.data) ?? {};
        const metadata = (Array.isArray(data.conversations) ? data.conversations : [])
            .map(row => metadataFromRow(normalizeRecord(row) ?? {}))
            .filter((entry) => Boolean(entry));
        return (0, metadata_js_1.searchConversationMetadata)(metadata, options);
    }
    async deleteConversation(conversationRef) {
        await this.call('delete_chat_conversation', {
            user_id: this.options.userId,
            conversation_id: conversationRef,
            record_kind: CHAT_EVENT_RECORD_KIND,
        });
    }
    async getRevision(conversationRef) {
        const result = await this.call('get_chat_conversation_revision', {
            user_id: this.options.userId,
            conversation_id: conversationRef,
            record_kind: CHAT_EVENT_RECORD_KIND,
        });
        const revision = normalizeRecord(result.data) ?? {};
        const revisionId = normalizeString(revision.revision_id) ?? normalizeString(revision.revisionId);
        if (revisionId) {
            return {
                conversationRef,
                revisionId,
                updatedAt: normalizeString(revision.updated_at)
                    ?? normalizeString(revision.updatedAt)
                    ?? new Date(0).toISOString(),
            };
        }
        const events = await this.loadEvents(conversationRef);
        const last = events[events.length - 1];
        return {
            conversationRef,
            revisionId: last?.revisionId ?? `rev-stored-${conversationRef}`,
            updatedAt: last?.timestamp ?? new Date(0).toISOString(),
        };
    }
    async loadCompactedReplay(conversationRef) {
        const events = await this.loadEvents(conversationRef);
        return [...events].reverse().map(compactedReplayFromEvent).find(Boolean) ?? null;
    }
    async call(method, params) {
        if (!this.options.runtime.rpc) {
            throw new Error('SidecarConversationStore requires a local runtime with rpc support');
        }
        const response = await this.options.runtime.rpc({ method, params });
        if (response.success === false) {
            throw new Error(String(response.error ?? `Sidecar RPC failed: ${method}`));
        }
        return response;
    }
    buildEventWriteParams(event, messageIndex) {
        const defaultParams = {
            user_id: this.options.userId,
            conversation_id: event.conversationRef,
            event_type: event.type,
            role: roleFromEvent(event),
            content: textFromEvent(event),
            timestamp: event.timestamp,
            revision_id: event.revisionId,
            turn_ref: event.turnRef ?? null,
            producer: event.source === 'backend'
                ? 'backend'
                : (event.source === 'sidecar' ? 'sidecar' : 'sdk'),
            producer_event_id: event.source === 'backend' ? event.eventId : null,
            producer_sequence: event.source === 'backend' && typeof event.payload.backendSequence === 'number'
                ? event.payload.backendSequence
                : null,
            event_payload: event,
            record_kind: CHAT_EVENT_RECORD_KIND,
            ...(messageIndex ? { message_index: messageIndex } : {}),
        };
        return {
            ...defaultParams,
            ...(this.options.eventWriteParams?.({
                event,
                defaultParams: { ...defaultParams },
            }) ?? {}),
        };
    }
}
exports.SidecarConversationStore = SidecarConversationStore;
