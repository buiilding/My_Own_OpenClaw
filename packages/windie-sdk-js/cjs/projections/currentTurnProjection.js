"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCurrentTurnProjector = createCurrentTurnProjector;
exports.createEmptyCurrentTurnProjection = createEmptyCurrentTurnProjection;
exports.updateCurrentTurnProjectionFromBackendEvent = updateCurrentTurnProjectionFromBackendEvent;
function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function textFromPayload(payload) {
    if (typeof payload.text === 'string')
        return payload.text;
    if (typeof payload.content === 'string')
        return payload.content;
    if (typeof payload.status === 'string')
        return payload.status;
    if (typeof payload.final_response === 'string')
        return payload.final_response;
    if (typeof payload.finalResponse === 'string')
        return payload.finalResponse;
    if (typeof payload.message === 'string')
        return payload.message;
    if (typeof payload.error === 'string')
        return payload.error;
    return '';
}
const SETTINGS_UPDATE_ERROR_TEXT = 'Failed to update settings';
const RECOVERABLE_TOOL_PARSE_ERROR_MARKERS = [
    'failed to parse streamed tool-call arguments',
    'raw arguments preview:',
];
function shouldIgnoreCurrentTurnError(payload) {
    const message = typeof payload.message === 'string' ? payload.message : '';
    const content = typeof payload.content === 'string' ? payload.content : '';
    const normalizedMessage = message.toLowerCase();
    const normalizedContent = content.toLowerCase();
    const isRecoverableToolParseError = RECOVERABLE_TOOL_PARSE_ERROR_MARKERS.every((marker) => (normalizedMessage.includes(marker) || normalizedContent.includes(marker)));
    return (message.includes(SETTINGS_UPDATE_ERROR_TEXT)
        || content.includes(SETTINGS_UPDATE_ERROR_TEXT)
        || isRecoverableToolParseError);
}
function conversationRefFrom(event, fallbackConversationRef) {
    if (typeof event?.conversation_ref === 'string' && event.conversation_ref.trim()) {
        return event.conversation_ref.trim();
    }
    const payload = asRecord(event?.payload);
    if (typeof payload.conversation_ref === 'string' && payload.conversation_ref.trim()) {
        return payload.conversation_ref.trim();
    }
    if (typeof payload.conversationRef === 'string' && payload.conversationRef.trim()) {
        return payload.conversationRef.trim();
    }
    return typeof fallbackConversationRef === 'string' && fallbackConversationRef.trim()
        ? fallbackConversationRef.trim()
        : null;
}
function turnRefFrom(event) {
    if (typeof event?.turn_ref === 'string' && event.turn_ref.trim()) {
        return event.turn_ref.trim();
    }
    const payload = asRecord(event?.payload);
    if (typeof payload.turn_ref === 'string' && payload.turn_ref.trim()) {
        return payload.turn_ref.trim();
    }
    if (typeof payload.turnRef === 'string' && payload.turnRef.trim()) {
        return payload.turnRef.trim();
    }
    return null;
}
function toolNameFromPayload(payload, fallback) {
    if (typeof payload.tool_name === 'string')
        return payload.tool_name;
    if (typeof payload.toolName === 'string')
        return payload.toolName;
    return fallback ?? null;
}
function statusFromPayload(payload) {
    if (typeof payload.status === 'string')
        return payload.status;
    if (typeof payload.success === 'boolean')
        return payload.success ? 'success' : 'error';
    if (typeof payload.error === 'string' && payload.error)
        return 'error';
    return null;
}
function createEmptyCurrentTurnProjection(conversationRef = '', turnRef = null) {
    return {
        conversationRef,
        turnRef,
        phase: turnRef ? 'awaiting' : 'idle',
        assistantText: '',
        reasoningText: null,
        toolEvents: [],
        lastError: null,
    };
}
function appendText(current, next) {
    return next ? `${current || ''}${next}` : (current || '');
}
function toolEventFromBackendEvent(event, payload) {
    if (event.type === 'tool-call' || event.type === 'tool-bundle') {
        const fallbackName = event.type === 'tool-bundle' ? 'tool_bundle' : null;
        return {
            id: event.id || payload.request_id || payload.bundle_id || `${event.type}:${Date.now()}`,
            kind: 'tool_call',
            toolName: toolNameFromPayload(payload, fallbackName),
            text: textFromPayload(payload) || undefined,
            status: statusFromPayload(payload),
            payload,
        };
    }
    if (event.type === 'web-search-progress') {
        return {
            id: event.id || payload.request_id || `web-search-progress:${Date.now()}`,
            kind: 'tool_progress',
            toolName: toolNameFromPayload(payload, 'web_search'),
            text: textFromPayload(payload) || undefined,
            status: statusFromPayload(payload),
            payload,
        };
    }
    if (event.type === 'tool-output' || event.type === 'tool-bundle-output') {
        const fallbackName = event.type === 'tool-bundle-output' ? 'tool_bundle' : null;
        return {
            id: event.id || payload.request_id || payload.bundle_id || `${event.type}:${Date.now()}`,
            kind: 'tool_output',
            toolName: toolNameFromPayload(payload, fallbackName),
            text: textFromPayload(payload) || undefined,
            status: statusFromPayload(payload),
            payload,
        };
    }
    return null;
}
function updateCurrentTurnProjectionFromBackendEvent(currentProjection, event, options = {}) {
    const eventRecord = asRecord(event);
    const payload = asRecord(eventRecord.payload);
    const conversationRef = conversationRefFrom(eventRecord, options.fallbackConversationRef);
    if (!conversationRef) {
        return null;
    }
    const turnRef = turnRefFrom(eventRecord);
    let projection = currentProjection && currentProjection.conversationRef === conversationRef
        ? currentProjection
        : createEmptyCurrentTurnProjection(conversationRef, turnRef);
    if (turnRef && projection.turnRef !== turnRef) {
        projection = createEmptyCurrentTurnProjection(conversationRef, turnRef);
    }
    else if (!projection.turnRef && turnRef) {
        projection = { ...projection, turnRef };
    }
    if (eventRecord.type === 'query-accepted' || eventRecord.type === 'local-user-message') {
        return { ...projection, phase: 'awaiting', lastError: null };
    }
    if (eventRecord.type === 'llm-thought') {
        return {
            ...projection,
            phase: projection.phase === 'idle' ? 'awaiting' : projection.phase,
            reasoningText: appendText(projection.reasoningText, textFromPayload(payload)) || null,
        };
    }
    if (eventRecord.type === 'streaming-response') {
        return {
            ...projection,
            phase: 'streaming',
            assistantText: appendText(projection.assistantText, textFromPayload(payload)),
            lastError: null,
        };
    }
    if (eventRecord.type === 'assistant-message-full') {
        const text = textFromPayload(payload);
        return {
            ...projection,
            phase: text ? 'streaming' : projection.phase,
            assistantText: text || projection.assistantText,
            lastError: null,
        };
    }
    const toolEvent = toolEventFromBackendEvent(eventRecord, payload);
    if (toolEvent) {
        return {
            ...projection,
            phase: toolEvent.kind === 'tool_output' ? 'tool_output' : 'tool_call',
            toolEvents: [...projection.toolEvents, toolEvent],
            lastError: null,
        };
    }
    if (eventRecord.type === 'streaming-complete') {
        const finalResponse = textFromPayload(payload);
        return {
            ...projection,
            phase: 'complete',
            assistantText: projection.assistantText || finalResponse,
            lastError: null,
        };
    }
    if (eventRecord.type === 'error' || eventRecord.type === 'context-compaction-failed') {
        if (eventRecord.type === 'error' && shouldIgnoreCurrentTurnError(payload)) {
            return null;
        }
        return {
            ...projection,
            phase: 'error',
            lastError: textFromPayload(payload) || 'Unknown runtime error',
        };
    }
    return null;
}
function createCurrentTurnProjector() {
    const projections = new Map();
    return {
        applyBackendEvent(event, options = {}) {
            const conversationRef = conversationRefFrom(event, options.fallbackConversationRef);
            if (!conversationRef) {
                return null;
            }
            const next = updateCurrentTurnProjectionFromBackendEvent(projections.get(conversationRef), event, options);
            if (!next) {
                return null;
            }
            projections.set(next.conversationRef, next);
            return next;
        },
        get(conversationRef) {
            return projections.get(conversationRef) || null;
        },
        reset(conversationRef) {
            if (conversationRef) {
                projections.delete(conversationRef);
            }
            else {
                projections.clear();
            }
        },
    };
}
