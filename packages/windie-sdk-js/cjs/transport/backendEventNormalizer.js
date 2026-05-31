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
function eventBase(event, fallbackRevisionId, fallbackConversationRef) {
    const conversationRef = conversationRefOf(event) ?? fallbackConversationRef ?? null;
    if (!conversationRef) {
        return null;
    }
    return {
        conversationRef,
        revisionId: revisionIdFor(event, fallbackRevisionId),
        turnRef: typeof event.turn_ref === 'string' ? event.turn_ref : null,
        eventId: typeof event.id === 'string' ? event.id : (0, events_js_1.createRuntimeId)('evt'),
        timestamp: new Date().toISOString(),
    };
}
function normalizeBackendEventToConversationEvent(event, options = {}) {
    const base = eventBase(event, options.fallbackRevisionId, options.fallbackConversationRef);
    if (!base) {
        return null;
    }
    const payload = payloadOf(event);
    if (event.type === 'query-accepted') {
        return (0, events_js_1.createConversationEvent)({
            ...base,
            type: 'turn_started',
            source: 'backend',
            payload: {
                status: typeof payload.status === 'string' ? payload.status : 'accepted',
                rawEvent: event,
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
                rawEvent: event,
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
                rawEvent: event,
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
                rawEvent: event,
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
                rawEvent: event,
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
                rawEvent: event,
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
                rawEvent: event,
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
                rawEvent: event,
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
                rawEvent: event,
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
                rawEvent: event,
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
                rawEvent: event,
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
                rawEvent: event,
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
                rawEvent: event,
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
                rawEvent: event,
            },
        });
    }
    if (event.type === 'context-compaction-started') {
        return (0, events_js_1.createConversationEvent)({
            ...base,
            type: 'compaction_started',
            source: 'backend',
            payload: {
                ...payload,
                reason: typeof payload.reason === 'string' ? payload.reason : null,
                rawEvent: event,
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
        return (0, events_js_1.createConversationEvent)({
            ...base,
            type: skippedReason || !hasReplacementHistory ? 'compaction_skipped' : 'compaction_applied',
            source: 'backend',
            payload: {
                ...payload,
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
                replacementHistoryEntries,
                userId: typeof event.user_id === 'string' ? event.user_id : null,
                rawEvent: event,
            },
        });
    }
    if (event.type === 'context-compaction-failed') {
        return (0, events_js_1.createConversationEvent)({
            ...base,
            type: 'compaction_failed',
            source: 'backend',
            payload: {
                ...payload,
                error: typeof payload.error === 'string' ? payload.error : null,
                rawEvent: event,
            },
        });
    }
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
                rawEvent: event,
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
                rawEvent: event,
            },
        });
    }
    return null;
}
