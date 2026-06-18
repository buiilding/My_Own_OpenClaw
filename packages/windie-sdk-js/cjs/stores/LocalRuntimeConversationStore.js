"use strict";
/**
 * Implements local-runtime conversation storage for the TypeScript SDK runtime.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalRuntimeConversationStore = void 0;
const metadata_js_1 = require("../conversation/metadata.js");
const conversationProjections_js_1 = require("../projections/conversationProjections.js");
const debugEnv_js_1 = require("../runtime/debugEnv.js");
const compactedReplayEvents_js_1 = require("./compactedReplayEvents.js");
const CHAT_EVENT_RECORD_KIND = 'chat_event';
const LOCAL_RUNTIME_RPC_DIAGNOSTIC_STAGE = 'local_runtime_rpc';
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
async function emitAppDiagnostic(options, event) {
    try {
        await options.diagnostics?.emit?.(event);
    }
    catch {
        // App diagnostics must never make local-runtime conversation reads fail.
    }
}
function serializeDiagnosticsContext(options) {
    const diagnostics = normalizeRecord(options.diagnostics);
    if (!diagnostics) {
        return undefined;
    }
    return {
        path: normalizeString(diagnostics.path) ?? undefined,
        trace_id: normalizeString(diagnostics.traceId) ?? undefined,
        parent_span_id: normalizeString(diagnostics.parentSpanId) ?? undefined,
        request_id: normalizeString(diagnostics.requestId) ?? undefined,
        session_id: normalizeString(diagnostics.sessionId) ?? undefined,
        conversation_ref: normalizeString(diagnostics.conversationRef) ?? undefined,
    };
}
function normalizeEventCount(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
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
    const metadata = parseJsonRecord(row.metadata);
    return normalizeConversationEvent(parseJsonRecord(row.event_payload)
        ?? parseJsonRecord(row.eventPayload)
        ?? metadata?.agent_sdk_conversation_event
        ?? metadata?.agentSdkConversationEvent);
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
function valueByKeys(record, keys) {
    for (const key of keys) {
        if (record[key] !== undefined && record[key] !== null) {
            return record[key];
        }
    }
    return undefined;
}
function normalizeJsonArray(value) {
    return Array.isArray(value)
        ? value.filter((entry) => Boolean(normalizeRecord(entry)))
        : [];
}
function eventPayloadWriteParams(event) {
    const payload = normalizeRecord(event.payload) ?? {};
    const metadata = normalizeRecord(payload.metadata) ?? {};
    const screenshot = valueByKeys(payload, ['screenshotRef', 'screenshot_ref', 'screenshotUrl', 'screenshot_url', 'screenshot'])
        ?? valueByKeys(metadata, ['screenshot']);
    return {
        tool_name: valueByKeys(payload, ['toolName', 'tool_name']) ?? null,
        correlation_id: valueByKeys(payload, ['correlationId', 'correlation_id', 'toolCallId', 'tool_call_id', 'requestId', 'request_id']) ?? null,
        workspace_path: valueByKeys(payload, ['workspacePath', 'workspace_path']) ?? null,
        workspace_name: valueByKeys(payload, ['workspaceName', 'workspace_name']) ?? null,
        metadata: {
            ...metadata,
            model_id: valueByKeys(payload, ['modelId', 'model_id']) ?? metadata.model_id ?? null,
            model_provider: valueByKeys(payload, ['modelProvider', 'model_provider']) ?? metadata.model_provider ?? null,
            screenshot: screenshot ?? null,
        },
        attachments: normalizeJsonArray(payload.attachments),
        compaction_checkpoint: event.type === 'compaction_applied' ? event.payload : null,
    };
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
function isCompactionEvent(event) {
    return event.type.startsWith('compaction_');
}
function responseMessageIndex(response) {
    const data = normalizeRecord(response.data);
    const value = data?.message_index ?? data?.messageIndex;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function logStoredCompactionEvent(event, params, response) {
    if (!(0, debugEnv_js_1.isCompactionStdoutEnabled)()) {
        return;
    }
    const payload = normalizeRecord(event.payload) ?? {};
    console.log('[Agent SDK][Compaction] conversation.append_event succeeded', {
        conversationRef: event.conversationRef,
        turnRef: event.turnRef,
        revisionId: event.revisionId,
        eventId: event.eventId,
        eventType: event.type,
        source: event.source,
        userId: normalizeString(params.user_id),
        producer: normalizeString(params.producer),
        producerEventId: normalizeString(params.producer_event_id),
        producerSequence: typeof params.producer_sequence === 'number' ? params.producer_sequence : null,
        messageIndex: responseMessageIndex(response),
        generationId: normalizeString(payload.generationId),
        skippedReason: normalizeString(payload.skippedReason),
        hasCompactionCheckpoint: Boolean(params.compaction_checkpoint),
    });
}
function metadataFromRow(row) {
    const conversationRef = normalizeString(row.conversation_id);
    if (!conversationRef) {
        return null;
    }
    return {
        conversationRef,
        revisionId: normalizeString(row.revision_id) ?? `rev-stored-${conversationRef}`,
        title: normalizeString(row.title) ?? conversationRef,
        lastMessage: normalizeString(row.last_message),
        updatedAt: normalizeString(row.last_timestamp)
            ?? new Date(0).toISOString(),
        eventCount: normalizeEventCount(row.entry_count),
        workspacePath: normalizeString(row.workspace_path),
        workspaceName: normalizeString(row.workspace_name),
        snippet: normalizeString(row.snippet),
        matchedRole: normalizeString(row.matched_role),
    };
}
class LocalRuntimeConversationStore {
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
            const params = this.buildEventWriteParams(event);
            const response = await this.call('conversation.append_event', params);
            if (isCompactionEvent(event)) {
                logStoredCompactionEvent(event, params, response);
            }
        }
    }
    async rewriteConversation(plan) {
        const rewriteEvent = plan.preservedEvents[plan.preservedEvents.length - 1] ?? null;
        if ((plan.reason === 'edit_resend' || plan.reason === 'retry')
            && rewriteEvent?.type === 'conversation_rewritten') {
            await this.call('conversation.rewrite_after_event', {
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
        await this.call('conversation.replace', {
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
            const result = await this.call('conversation.load_events', {
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
        const replay = (0, compactedReplayEvents_js_1.latestCompactedReplayFromEvents)(events);
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
        const startedAt = Date.now();
        await emitAppDiagnostic(options, {
            stage: LOCAL_RUNTIME_RPC_DIAGNOSTIC_STAGE,
            status: 'started',
            runtime: 'sdk',
            data: {
                limit: options.limit,
            },
        });
        try {
            const result = await this.call('conversation.list', {
                user_id: this.options.userId,
                record_kind: CHAT_EVENT_RECORD_KIND,
                limit: options.cursor ? undefined : options.limit,
                diagnostics: serializeDiagnosticsContext(options),
            });
            const data = normalizeRecord(result.data) ?? {};
            const diagnostics = normalizeRecord(data.diagnostics);
            const localRuntimeEvents = Array.isArray(diagnostics?.events) ? diagnostics.events : [];
            for (const event of localRuntimeEvents) {
                const draft = normalizeRecord(event);
                if (!draft) {
                    continue;
                }
                await emitAppDiagnostic(options, {
                    stage: normalizeString(draft.stage) ?? 'local_runtime',
                    status: (normalizeString(draft.status) ?? 'succeeded'),
                    runtime: 'local-runtime',
                    durationMs: typeof draft.durationMs === 'number' ? draft.durationMs : null,
                    data: normalizeRecord(draft.data) ?? {},
                    error: draft.error,
                });
            }
            const metadata = (Array.isArray(data.conversations) ? data.conversations : [])
                .map(row => metadataFromRow(normalizeRecord(row) ?? {}))
                .filter((entry) => Boolean(entry))
                .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
            await emitAppDiagnostic(options, {
                stage: LOCAL_RUNTIME_RPC_DIAGNOSTIC_STAGE,
                status: 'succeeded',
                runtime: 'sdk',
                durationMs: Date.now() - startedAt,
                data: {
                    limit: options.limit,
                    resultCount: metadata.length,
                },
            });
            return (0, metadata_js_1.applyConversationMetadataPagination)(metadata, options);
        }
        catch (error) {
            await emitAppDiagnostic(options, {
                stage: LOCAL_RUNTIME_RPC_DIAGNOSTIC_STAGE,
                status: 'failed',
                runtime: 'sdk',
                durationMs: Date.now() - startedAt,
                data: {
                    limit: options.limit,
                },
                error,
            });
            throw error;
        }
    }
    async searchMetadata(options) {
        const result = await this.call('conversation.search', {
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
        await this.call('conversation.delete', {
            user_id: this.options.userId,
            conversation_id: conversationRef,
            record_kind: CHAT_EVENT_RECORD_KIND,
        });
    }
    async clearConversations() {
        await this.call('clear_chat_history', {
            user_id: this.options.userId,
            record_kind: CHAT_EVENT_RECORD_KIND,
        });
    }
    async getRevision(conversationRef) {
        const result = await this.call('conversation.get_revision', {
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
        return (0, compactedReplayEvents_js_1.latestCompactedReplayFromEvents)(events);
    }
    async call(method, params) {
        if (!this.options.runtime.rpc) {
            throw new Error('LocalRuntimeConversationStore requires a local runtime with rpc support');
        }
        const response = await this.options.runtime.rpc({ method, params });
        if (response.success === false) {
            throw new Error(String(response.error ?? `Local runtime RPC failed: ${method}`));
        }
        return response;
    }
    buildEventWriteParams(event, messageIndex) {
        const producerSource = String(event.source);
        const defaultParams = {
            user_id: this.options.userId,
            conversation_id: event.conversationRef,
            event_type: event.type,
            role: roleFromEvent(event),
            content: textFromEvent(event),
            timestamp: event.timestamp,
            revision_id: event.revisionId,
            turn_ref: event.turnRef ?? null,
            producer: producerSource === 'backend'
                ? 'backend'
                : 'sdk',
            producer_event_id: producerSource === 'backend' ? event.eventId : null,
            producer_sequence: producerSource === 'backend' && typeof event.payload.backendSequence === 'number'
                ? event.payload.backendSequence
                : null,
            event_payload: event,
            record_kind: CHAT_EVENT_RECORD_KIND,
            ...(messageIndex ? { message_index: messageIndex } : {}),
        };
        return {
            ...defaultParams,
            ...eventPayloadWriteParams(event),
            ...(this.options.eventWriteParams?.({
                event,
                defaultParams: { ...defaultParams },
            }) ?? {}),
        };
    }
}
exports.LocalRuntimeConversationStore = LocalRuntimeConversationStore;
