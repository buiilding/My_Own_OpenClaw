"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeBackendEventToConversationEvent = normalizeBackendEventToConversationEvent;
const events_js_1 = require("../conversation/events.js");
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
    const payload = payloadOf(event);
    const payloadTurnRef = stringField(payload, 'turn_ref', 'turnRef');
    if (payloadTurnRef?.trim()) {
        return payloadTurnRef.trim();
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
function toolCorrelationIdFromPayload(payload) {
    return stringField(payload, 'correlation_id', 'correlationId', 'request_id', 'requestId');
}
function revisionIdFor(event, fallbackRevisionId) {
    const payload = payloadOf(event);
    if (typeof payload.revision_id === 'string' && payload.revision_id.trim()) {
        return payload.revision_id.trim();
    }
    if (typeof payload.revisionId === 'string' && payload.revisionId.trim()) {
        return payload.revisionId.trim();
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
        rawEvent: event,
    };
}
function numberField(record, key) {
    const value = record[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function logCompactionNormalization(event, base, normalizedType, payload) {
    const replacementHistoryEntries = Array.isArray(payload.replacement_history_entries)
        ? payload.replacement_history_entries
        : null;
    console.log('[Windie SDK][Compaction] backend event normalized', {
        backendEventType: event.type,
        normalizedEventType: normalizedType,
        conversationRef: base.conversationRef,
        turnRef: base.turnRef,
        revisionId: base.revisionId,
        eventId: base.eventId,
        backendEventId: typeof event.event_id === 'string' ? event.event_id : null,
        backendSequence: backendSequenceOf(event),
        generationId: stringField(payload, 'generation_id', 'generationId'),
        skippedReason: stringField(payload, 'skipped_reason', 'skippedReason'),
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
            rawEvent: event,
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
                tools: Array.isArray(payload.tools) ? payload.tools : [],
                structuredPayload: payload,
                ...backendMetadata,
            },
        });
    }
    if (event.type === 'tool-bundle-output') {
        return (0, events_js_1.createConversationEvent)({
            ...base,
            type: 'tool_bundle_output',
            source: 'sidecar',
            payload: {
                ...payload,
                bundleId: typeof payload.bundle_id === 'string' ? payload.bundle_id : (typeof payload.bundleId === 'string' ? payload.bundleId : null),
                correlationId: typeof payload.bundle_id === 'string' ? payload.bundle_id : (typeof payload.bundleId === 'string' ? payload.bundleId : null),
                userId: typeof event.user_id === 'string' ? event.user_id : null,
                stepResults: Array.isArray(payload.step_results) ? payload.step_results : (Array.isArray(payload.stepResults) ? payload.stepResults : []),
                screenshotRef: typeof payload.screenshot_ref === 'string' ? payload.screenshot_ref : null,
                screenshot: typeof payload.screenshot === 'string' ? payload.screenshot : null,
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
                compactionRef: stringField(payload, 'generation_id', 'generationId') ?? base.turnRef,
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
                compactionRef: stringField(payload, 'generation_id', 'generationId') ?? base.turnRef,
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
