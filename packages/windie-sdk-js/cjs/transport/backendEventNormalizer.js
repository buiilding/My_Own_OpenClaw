"use strict";
/**
 * Provides the backend event normalizer module for the TypeScript SDK runtime.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeBackendEventToConversationEvent = normalizeBackendEventToConversationEvent;
const events_js_1 = require("../conversation/events.js");
const debugEnv_js_1 = require("../runtime/debugEnv.js");
const TraceRecorder_js_1 = require("../runtime/TraceRecorder.js");
const toolCorrelationIds_js_1 = require("../tools/toolCorrelationIds.js");
function payloadOf(event) {
    return (event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload))
        ? event.payload
        : {};
}
function conversationRefOf(event) {
    if (typeof event.conversation_ref === 'string' && event.conversation_ref.trim()) {
        return event.conversation_ref.trim();
    }
    return null;
}
function scopedErrorTurnRef(event, fallbackTurnRef) {
    if (event.type === 'error') {
        const payload = payloadOf(event);
        const payloadTurnRef = stringField(payload, 'turn_ref');
        if (payloadTurnRef?.trim()) {
            return payloadTurnRef.trim();
        }
    }
    if (typeof event.turn_ref === 'string' && event.turn_ref.trim()) {
        return event.turn_ref.trim();
    }
    if (event.type !== 'error') {
        return null;
    }
    const eventId = typeof event.id === 'string' && event.id.trim()
        ? event.id.trim()
        : null;
    const fallback = typeof fallbackTurnRef === 'string' && fallbackTurnRef.trim()
        ? fallbackTurnRef.trim()
        : null;
    if (eventId && fallback && eventId === fallback) {
        return eventId;
    }
    if (!eventId && fallback) {
        return fallback;
    }
    return null;
}
function stringFromEventPayloadOrTopLevel(event, key) {
    const payload = payloadOf(event);
    const payloadValue = payload[key];
    if (typeof payloadValue === 'string') {
        return payloadValue;
    }
    const topLevelValue = event[key];
    return typeof topLevelValue === 'string' ? topLevelValue : null;
}
function stringField(record, ...keys) {
    for (const key of keys) {
        const value = record[key];
        if (typeof value === 'string') {
            return value;
        }
    }
    return null;
}
function nonDataUrlStringField(record, ...keys) {
    const value = stringField(record, ...keys);
    if (!value || value.trim().toLowerCase().startsWith('data:')) {
        return null;
    }
    return value.trim();
}
function stringArrayField(record, ...keys) {
    for (const key of keys) {
        const value = record[key];
        if (!Array.isArray(value)) {
            continue;
        }
        const normalized = value
            .filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
            .map(entry => entry.trim())
            .filter(entry => !entry.toLowerCase().startsWith('data:'));
        if (normalized.length > 0) {
            return normalized;
        }
    }
    return null;
}
function recordFromUnknown(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : null;
}
function displayAttachmentFromBackendRecord(record) {
    const id = nonDataUrlStringField(record, 'id');
    const kind = record.kind === 'image' || record.kind === 'screenshot_request' ? record.kind : null;
    const source = (record.source === 'user_included'
        || record.source === 'camera_button'
        || record.source === 'tool_result'
        || record.source === 'replay') ? record.source : null;
    const status = (record.status === 'materializing'
        || record.status === 'pending_capture'
        || record.status === 'ready'
        || record.status === 'failed') ? record.status : null;
    if (!id || !kind || !source || !status) {
        return null;
    }
    const filename = nonDataUrlStringField(record, 'filename');
    const contentType = nonDataUrlStringField(record, 'contentType', 'content_type');
    const screenshotRef = nonDataUrlStringField(record, 'screenshotRef', 'screenshot_ref');
    const screenshotUrl = nonDataUrlStringField(record, 'screenshotUrl', 'screenshot_url');
    const errorCode = nonDataUrlStringField(record, 'errorCode', 'error_code');
    return {
        id,
        kind,
        source,
        status,
        ...(filename ? { filename } : {}),
        ...(contentType ? { contentType } : {}),
        ...(screenshotRef ? { screenshotRef } : {}),
        ...(screenshotUrl ? { screenshotUrl } : {}),
        ...(errorCode ? { errorCode } : {}),
    };
}
function displayAttachmentsFromBackendField(payload) {
    for (const key of ['attachments', 'display_attachments']) {
        const value = payload[key];
        if (!Array.isArray(value)) {
            continue;
        }
        const attachments = value
            .map(recordFromUnknown)
            .filter((record) => Boolean(record))
            .map(displayAttachmentFromBackendRecord)
            .filter((attachment) => Boolean(attachment));
        if (attachments.length > 0) {
            return attachments;
        }
    }
    return null;
}
function displayAttachmentsFromScreenshotAliases(payload, eventId) {
    const screenshotRef = nonDataUrlStringField(payload, 'screenshot_ref', 'screenshotRef');
    const screenshotRefs = stringArrayField(payload, 'screenshot_refs', 'screenshotRefs')
        ?? (screenshotRef ? [screenshotRef] : null);
    if (!screenshotRefs || screenshotRefs.length === 0) {
        return null;
    }
    const screenshotUrl = nonDataUrlStringField(payload, 'screenshot_url', 'screenshotUrl');
    const contentType = nonDataUrlStringField(payload, 'screenshot_content_type', 'screenshotContentType');
    return screenshotRefs.map((ref, index) => ({
        id: `${eventId}:attachment:${index.toString().padStart(3, '0')}`,
        kind: 'image',
        source: 'tool_result',
        status: 'ready',
        ...(contentType ? { contentType } : {}),
        screenshotRef: ref,
        ...(index === 0 && screenshotUrl ? { screenshotUrl } : {}),
    }));
}
function normalizeBackendDisplayAttachments(payload, eventId) {
    return displayAttachmentsFromBackendField(payload)
        ?? displayAttachmentsFromScreenshotAliases(payload, eventId);
}
const MODEL_HISTORY_ROLES = new Set(['system', 'user', 'assistant', 'tool']);
const MODEL_HISTORY_MESSAGE_TYPES = new Set([
    'user_query',
    'assistant_response',
    'tool_output',
    'context_compaction',
]);
function modelHistoryRoleOf(value) {
    return typeof value === 'string' && MODEL_HISTORY_ROLES.has(value)
        ? value
        : null;
}
function modelHistoryMessageTypeOf(value) {
    return typeof value === 'string' && MODEL_HISTORY_MESSAGE_TYPES.has(value)
        ? value
        : null;
}
function modelHistoryRowsFromPayload(payload) {
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    return rows.flatMap((entry) => {
        const row = recordFromUnknown(entry);
        const id = row ? stringField(row, 'id') : null;
        const conversationRef = row ? stringField(row, 'conversation_ref', 'conversationRef') : null;
        const revisionId = row ? stringField(row, 'revision_id', 'revisionId') : null;
        const role = row ? modelHistoryRoleOf(row.role) : null;
        const messageType = row ? modelHistoryMessageTypeOf(row.message_type ?? row.messageType) : null;
        if (!row || !id || !conversationRef || !revisionId || !role || !messageType) {
            return [];
        }
        return [{
                id,
                conversationRef,
                revisionId,
                role,
                messageType,
                content: row.content,
                toolCallId: stringField(row, 'tool_call_id', 'toolCallId'),
                toolCalls: Array.isArray(row.tool_calls) ? row.tool_calls : (Array.isArray(row.toolCalls) ? row.toolCalls : []),
                toolName: stringField(row, 'tool_name', 'toolName'),
                imageRefs: stringArrayField(row, 'image_refs', 'imageRefs') ?? [],
                compactionFacts: recordFromUnknown(row.compaction_facts ?? row.compactionFacts),
                sourceDisplayRowIds: stringArrayField(row, 'source_display_row_ids', 'sourceDisplayRowIds') ?? [],
            }];
    });
}
function toolCorrelationIdFromPayload(payload) {
    return stringField(payload, 'correlation_id', 'request_id');
}
function normalizeToolBundleTools(tools) {
    if (!Array.isArray(tools)) {
        return [];
    }
    return tools.flatMap((tool) => {
        if (!tool || typeof tool !== 'object' || Array.isArray(tool)) {
            return [];
        }
        const record = tool;
        const name = typeof record.name === 'string' ? record.name : null;
        if (!name) {
            return [];
        }
        const args = record.args && typeof record.args === 'object' && !Array.isArray(record.args)
            ? record.args
            : {};
        const toolCallId = typeof record.tool_call_id === 'string'
            ? record.tool_call_id
            : (0, toolCorrelationIds_js_1.resolveModelFacingToolCallId)(record);
        return [{
                name,
                args,
                ...(toolCallId ? { toolCallId } : {}),
            }];
    });
}
function revisionIdFor(event, fallbackRevisionId) {
    const payload = payloadOf(event);
    if (typeof payload.revision_id === 'string' && payload.revision_id.trim()) {
        return payload.revision_id.trim();
    }
    return fallbackRevisionId || (0, events_js_1.createRuntimeId)('rev');
}
function eventBase(event, fallbackRevisionId, fallbackConversationRef, fallbackTurnRef) {
    const turnRef = scopedErrorTurnRef(event, fallbackTurnRef);
    const conversationRef = conversationRefOf(event) ?? (event.type === 'error' && turnRef ? fallbackConversationRef : null) ?? null;
    if (!conversationRef) {
        return null;
    }
    if (typeof event.event_id !== 'string' || !event.event_id.trim()) {
        return {
            conversationRef,
            revisionId: revisionIdFor(event, fallbackRevisionId),
            turnRef,
            eventId: (0, events_js_1.createRuntimeId)('evt'),
            timestamp: new Date().toISOString(),
        };
    }
    return {
        conversationRef,
        revisionId: revisionIdFor(event, fallbackRevisionId),
        turnRef,
        eventId: event.event_id.trim(),
        timestamp: new Date().toISOString(),
    };
}
function backendSequenceOf(event) {
    return Number.isInteger(event.sequence) && (event.sequence ?? 0) > 0
        ? event.sequence
        : null;
}
function backendEventMetadata(event) {
    return {
        backendSequence: backendSequenceOf(event),
        sourceEventType: event.type,
        sourceEvent: event,
    };
}
function numberField(record, key) {
    const value = record[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function traceStringField(record, ...keys) {
    const value = stringField(record, ...keys);
    return value && value.trim() ? value.trim() : null;
}
function traceNumberField(record, ...keys) {
    for (const key of keys) {
        const value = record[key];
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
    }
    return null;
}
const TRACE_STATUSES = new Set(['started', 'succeeded', 'failed', 'skipped']);
const TRACE_RUNTIMES = new Set([
    'sdk',
    'electron-main',
    'renderer',
    'local-runtime',
    'backend',
    'provider',
]);
function traceStatusOf(value) {
    return typeof value === 'string' && TRACE_STATUSES.has(value)
        ? value
        : null;
}
function traceRuntimeOf(value) {
    return typeof value === 'string' && TRACE_RUNTIMES.has(value)
        ? value
        : 'backend';
}
function traceErrorOf(value) {
    if (!value) {
        return null;
    }
    if (typeof value === 'string') {
        return { code: 'Error', message: value };
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { code: 'Error', message: String(value) };
    }
    const record = value;
    return {
        code: traceStringField(record, 'code', 'name') ?? 'Error',
        message: traceStringField(record, 'message', 'summary', 'error') ?? 'Unknown trace error',
    };
}
function tracePayloadFromBackendEvent(event, base) {
    const payload = payloadOf(event);
    const path = traceStringField(payload, 'path');
    const stage = traceStringField(payload, 'stage');
    const status = traceStatusOf(payload.status);
    if (!path || !stage || !status) {
        return null;
    }
    const data = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
        ? (0, TraceRecorder_js_1.sanitizeTraceData)(payload.data)
        : undefined;
    return {
        schemaVersion: 1,
        traceId: traceStringField(payload, 'traceId') ?? (0, events_js_1.createRuntimeId)('trace'),
        spanId: traceStringField(payload, 'spanId') ?? (0, events_js_1.createRuntimeId)('span'),
        parentSpanId: traceStringField(payload, 'parentSpanId'),
        path,
        stage,
        status,
        runtime: traceRuntimeOf(payload.runtime),
        conversationRef: base.conversationRef,
        turnRef: base.turnRef,
        userId: (typeof event.user_id === 'string' && event.user_id.trim() ? event.user_id.trim() : null),
        requestId: traceStringField(payload, 'requestId'),
        startedAt: traceStringField(payload, 'startedAt'),
        endedAt: traceStringField(payload, 'endedAt') ?? base.timestamp,
        durationMs: traceNumberField(payload, 'durationMs'),
        backendSequence: backendSequenceOf(event),
        backendEventId: typeof event.event_id === 'string' && event.event_id.trim() ? event.event_id.trim() : null,
        ...(data ? { data } : {}),
        error: traceErrorOf(payload.error),
    };
}
function logCompactionNormalization(event, base, normalizedType, payload) {
    if (!(0, debugEnv_js_1.isCompactionStdoutEnabled)()) {
        return;
    }
    const replacementHistoryEntries = Array.isArray(payload.replacement_history_entries)
        ? payload.replacement_history_entries
        : null;
    console.log('[Agent SDK][Compaction] backend event normalized', {
        backendEventType: event.type,
        normalizedEventType: normalizedType,
        conversationRef: base.conversationRef,
        turnRef: base.turnRef,
        revisionId: base.revisionId,
        eventId: base.eventId,
        backendEventId: typeof event.event_id === 'string' ? event.event_id : null,
        backendSequence: backendSequenceOf(event),
        generationId: stringField(payload, 'generation_id'),
        skippedReason: stringField(payload, 'skipped_reason'),
        replacementHistoryEntryCount: replacementHistoryEntries?.length ?? null,
        beforeTokens: numberField(payload, 'before_tokens'),
        afterTokens: numberField(payload, 'after_tokens'),
        removedMessages: numberField(payload, 'removed_messages'),
    });
}
function missingBackendIdentityEvent(event, base) {
    return (0, events_js_1.createConversationEvent)({
        ...base,
        type: 'runtime_error',
        source: 'sdk',
        payload: {
            error: 'Backend stream event missing event_id or sequence',
            reason: 'missing_backend_event_identity',
            sourceEventType: event.type,
            backendEventId: typeof event.event_id === 'string' ? event.event_id : null,
            backendSequence: backendSequenceOf(event),
            sourceEvent: event,
        },
    });
}
function normalizeBackendEventToConversationEvent(event, options = {}) {
    const base = eventBase(event, options.fallbackRevisionId, options.fallbackConversationRef, options.fallbackTurnRef);
    if (!base) {
        return null;
    }
    const payload = payloadOf(event);
    const backendMetadata = backendEventMetadata(event);
    if (event.type === 'error') {
        const message = typeof payload.message === 'string'
            ? payload.message
            : (typeof payload.content === 'string' ? payload.content : 'Backend error');
        return (0, events_js_1.createConversationEvent)({
            ...base,
            type: 'turn_error',
            source: 'backend',
            payload: {
                message,
                content: typeof payload.content === 'string' ? payload.content : message,
                userId: typeof event.user_id === 'string' ? event.user_id : null,
                ...backendMetadata,
            },
        });
    }
    if (typeof event.event_id !== 'string' || !event.event_id.trim() || backendSequenceOf(event) === null) {
        return missingBackendIdentityEvent(event, base);
    }
    if (event.type === 'trace-event') {
        const tracePayload = tracePayloadFromBackendEvent(event, base);
        if (!tracePayload) {
            return (0, events_js_1.createConversationEvent)({
                ...base,
                type: 'runtime_error',
                source: 'sdk',
                payload: {
                    error: 'Backend trace event missing required path, stage, or status',
                    reason: 'malformed_backend_trace_event',
                    sourceEventType: event.type,
                    ...backendMetadata,
                },
            });
        }
        return (0, events_js_1.createConversationEvent)({
            ...base,
            type: 'trace_event',
            source: 'backend',
            payload: tracePayload,
        });
    }
    if (event.type === 'model-history-updated') {
        const checkpointId = stringField(payload, 'checkpoint_id', 'checkpointId');
        const revisionId = stringField(payload, 'revision_id', 'revisionId');
        const createdAt = stringField(payload, 'created_at', 'createdAt') ?? base.timestamp;
        const rows = modelHistoryRowsFromPayload(payload);
        if (!checkpointId || !revisionId) {
            return (0, events_js_1.createConversationEvent)({
                ...base,
                type: 'runtime_error',
                source: 'sdk',
                payload: {
                    error: 'Backend model-history event missing checkpoint_id or revision_id',
                    reason: 'malformed_model_history_event',
                    sourceEventType: event.type,
                    ...backendMetadata,
                },
            });
        }
        return (0, events_js_1.createConversationEvent)({
            ...base,
            revisionId,
            type: 'model_history_updated',
            source: 'backend',
            payload: {
                conversationRef: base.conversationRef,
                revisionId,
                checkpointId,
                createdAt,
                rows,
                ...backendMetadata,
            },
        });
    }
    if (event.type === 'query-accepted') {
        return (0, events_js_1.createConversationEvent)({
            ...base,
            type: 'turn_started',
            source: 'backend',
            payload: {
                status: typeof payload.status === 'string' ? payload.status : 'accepted',
                ...backendMetadata,
            },
        });
    }
    if (event.type === 'llm-thought') {
        return (0, events_js_1.createConversationEvent)({
            ...base,
            type: 'reasoning_delta',
            source: 'backend',
            payload: {
                text: typeof payload.status === 'string'
                    ? payload.status
                    : (typeof payload.content === 'string' ? payload.content : ''),
                ...backendMetadata,
            },
        });
    }
    if (event.type === 'streaming-response') {
        return (0, events_js_1.createConversationEvent)({
            ...base,
            type: 'assistant_delta',
            source: 'backend',
            payload: {
                text: typeof payload.text === 'string' ? payload.text : '',
                ...backendMetadata,
            },
        });
    }
    if (event.type === 'streaming-complete') {
        return (0, events_js_1.createConversationEvent)({
            ...base,
            type: 'turn_completed',
            source: 'backend',
            payload: {
                finalResponse: typeof payload.final_response === 'string' ? payload.final_response : null,
                userId: typeof event.user_id === 'string' ? event.user_id : null,
                modelId: stringField(payload, 'model_id', 'modelId', 'selected_model_id'),
                modelProvider: stringField(payload, 'model_provider', 'modelProvider'),
                ...backendMetadata,
            },
        });
    }
    if (event.type === 'local-user-message') {
        return (0, events_js_1.createConversationEvent)({
            ...base,
            type: 'user_message',
            source: 'backend',
            payload: {
                ...payload,
                text: typeof payload.text === 'string' ? payload.text : '',
                content: typeof payload.text === 'string' ? payload.text : '',
                screenshotRef: typeof payload.screenshot_ref === 'string' ? payload.screenshot_ref : null,
                screenshotUrl: typeof payload.screenshot_url === 'string' ? payload.screenshot_url : null,
                screenshotRefs: Array.isArray(payload.screenshot_refs) ? payload.screenshot_refs : [],
                attachmentFilenames: Array.isArray(payload.attachment_filenames) ? payload.attachment_filenames : [],
                userId: typeof event.user_id === 'string' ? event.user_id : null,
                sourceEventType: 'local-user-message',
                structuredPayload: payload,
                ...backendMetadata,
            },
        });
    }
    if (event.type === 'system-prompt') {
        const toolSchemas = Array.isArray(payload.tool_schemas) ? payload.tool_schemas : [];
        return (0, events_js_1.createConversationEvent)({
            ...base,
            type: 'system_prompt',
            source: 'backend',
            payload: {
                ...payload,
                content: typeof payload.content === 'string' ? payload.content : '',
                toolSchemas,
                structuredPayload: payload,
                ...backendMetadata,
            },
        });
    }
    if (event.type === 'user-message-full') {
        return (0, events_js_1.createConversationEvent)({
            ...base,
            type: 'user_message_metadata',
            source: 'backend',
            payload: {
                ...payload,
                content: typeof payload.content === 'string' ? payload.content : '',
                metadata: payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
                    ? payload.metadata
                    : null,
                structuredPayload: payload,
                ...backendMetadata,
            },
        });
    }
    if (event.type === 'assistant-message-full') {
        const content = stringFromEventPayloadOrTopLevel(event, 'content');
        return (0, events_js_1.createConversationEvent)({
            ...base,
            type: 'assistant_message',
            source: 'backend',
            payload: {
                text: content ?? '',
                content: content ?? '',
                structuredPayload: payload,
                ...backendMetadata,
            },
        });
    }
    if (event.type === 'tool-schemas') {
        const toolSchemas = Array.isArray(payload.tool_schemas) ? payload.tool_schemas : [];
        return (0, events_js_1.createConversationEvent)({
            ...base,
            type: 'tool_schemas_metadata',
            source: 'backend',
            payload: {
                ...payload,
                toolSchemas,
                structuredPayload: payload,
                ...backendMetadata,
            },
        });
    }
    if (event.type === 'tool-call') {
        return (0, events_js_1.createConversationEvent)({
            ...base,
            type: 'tool_call',
            source: 'backend',
            payload: {
                toolName: typeof payload.tool_name === 'string' ? payload.tool_name : null,
                args: payload.parameters && typeof payload.parameters === 'object' ? payload.parameters : {},
                requestId: typeof payload.request_id === 'string' ? payload.request_id : null,
                correlationId: typeof payload.correlation_id === 'string' ? payload.correlation_id : null,
                metadata: payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
                    ? payload.metadata
                    : null,
                toolCallId: typeof payload.tool_call_id === 'string'
                    ? payload.tool_call_id
                    : (0, toolCorrelationIds_js_1.resolveModelFacingToolCallId)(payload),
                userId: typeof event.user_id === 'string' ? event.user_id : null,
                structuredPayload: payload,
                ...backendMetadata,
            },
        });
    }
    if (event.type === 'web-search-progress') {
        return (0, events_js_1.createConversationEvent)({
            ...base,
            type: 'tool_progress',
            source: 'backend',
            payload: {
                ...payload,
                toolName: 'web_search',
                text: typeof payload.text === 'string' ? payload.text : '',
                requestId: typeof payload.request_id === 'string' ? payload.request_id : null,
                correlationId: toolCorrelationIdFromPayload(payload),
                structuredPayload: payload,
                ...backendMetadata,
            },
        });
    }
    if (event.type === 'tool-output') {
        const attachments = normalizeBackendDisplayAttachments(payload, base.eventId);
        return (0, events_js_1.createConversationEvent)({
            ...base,
            type: 'tool_output',
            source: 'backend',
            payload: {
                ...payload,
                toolName: typeof payload.tool_name === 'string' ? payload.tool_name : null,
                requestId: typeof payload.request_id === 'string' ? payload.request_id : null,
                correlationId: toolCorrelationIdFromPayload(payload),
                screenshotRef: typeof payload.screenshot_ref === 'string' ? payload.screenshot_ref : null,
                screenshot: typeof payload.screenshot === 'string' ? payload.screenshot : null,
                attachments,
                userId: typeof event.user_id === 'string' ? event.user_id : null,
                structuredPayload: payload,
                ...backendMetadata,
            },
        });
    }
    if (event.type === 'tool-bundle') {
        return (0, events_js_1.createConversationEvent)({
            ...base,
            type: 'tool_bundle_call',
            source: 'backend',
            payload: {
                bundleId: typeof payload.bundle_id === 'string' ? payload.bundle_id : null,
                correlationId: typeof payload.bundle_id === 'string' ? payload.bundle_id : null,
                userId: typeof event.user_id === 'string' ? event.user_id : null,
                tools: normalizeToolBundleTools(payload.tools),
                structuredPayload: payload,
                ...backendMetadata,
            },
        });
    }
    if (event.type === 'context-compaction-started') {
        logCompactionNormalization(event, base, 'compaction_started', payload);
        return (0, events_js_1.createConversationEvent)({
            ...base,
            type: 'compaction_started',
            source: 'backend',
            payload: {
                ...payload,
                operationRef: base.turnRef,
                compactionRef: stringField(payload, 'generation_id') ?? base.turnRef,
                reason: typeof payload.reason === 'string' ? payload.reason : null,
                ...backendMetadata,
            },
        });
    }
    if (event.type === 'context-compaction-completed') {
        const skippedReason = typeof payload.skipped_reason === 'string'
            ? payload.skipped_reason
            : '';
        const replacementHistoryEntries = Array.isArray(payload.replacement_history_entries)
            ? payload.replacement_history_entries
            : [];
        const hasReplacementHistory = replacementHistoryEntries.length > 0;
        const normalizedType = skippedReason || !hasReplacementHistory ? 'compaction_skipped' : 'compaction_applied';
        logCompactionNormalization(event, base, normalizedType, payload);
        return (0, events_js_1.createConversationEvent)({
            ...base,
            type: normalizedType,
            source: 'backend',
            payload: {
                ...payload,
                operationRef: base.turnRef,
                compactionRef: typeof payload.generation_id === 'string'
                    ? payload.generation_id
                    : base.turnRef,
                skippedReason: skippedReason || (hasReplacementHistory ? null : 'missing-replacement-history'),
                generationId: typeof payload.generation_id === 'string' ? payload.generation_id : null,
                reason: typeof payload.reason === 'string' ? payload.reason : null,
                strategy: typeof payload.strategy === 'string' ? payload.strategy : null,
                beforeTokens: typeof payload.before_tokens === 'number' ? payload.before_tokens : null,
                afterTokens: typeof payload.after_tokens === 'number' ? payload.after_tokens : null,
                removedMessages: typeof payload.removed_messages === 'number' ? payload.removed_messages : null,
                summaryPreview: typeof payload.summary_preview === 'string' ? payload.summary_preview : null,
                summaryText: typeof payload.summary_text === 'string' ? payload.summary_text : null,
                replacementHistoryPreview: Array.isArray(payload.replacement_history_preview)
                    ? payload.replacement_history_preview
                    : [],
                entries: replacementHistoryEntries,
                entryCount: replacementHistoryEntries.length,
                complete: hasReplacementHistory,
                active: hasReplacementHistory,
                sourceRevisionId: base.revisionId,
                sourceTurnRef: base.turnRef,
                createdAt: base.timestamp,
                replacementHistoryEntries,
                userId: typeof event.user_id === 'string' ? event.user_id : null,
                ...backendMetadata,
            },
        });
    }
    if (event.type === 'context-compaction-failed') {
        logCompactionNormalization(event, base, 'compaction_failed', payload);
        return (0, events_js_1.createConversationEvent)({
            ...base,
            type: 'compaction_failed',
            source: 'backend',
            payload: {
                ...payload,
                operationRef: base.turnRef,
                compactionRef: stringField(payload, 'generation_id') ?? base.turnRef,
                error: typeof payload.error === 'string' ? payload.error : null,
                ...backendMetadata,
            },
        });
    }
    if (event.type === 'token-count') {
        return (0, events_js_1.createConversationEvent)({
            ...base,
            type: 'usage_updated',
            source: 'backend',
            payload: {
                ...payload,
                userId: typeof event.user_id === 'string' ? event.user_id : null,
                ...backendMetadata,
            },
        });
    }
    return null;
}
