"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toolOutputStreamKey = toolOutputStreamKey;
exports.toolOutputStreamKeys = toolOutputStreamKeys;
exports.toAgentStreamEvent = toAgentStreamEvent;
const backendEvents_js_1 = require("../events/backendEvents.js");
const toolCorrelationIds_js_1 = require("../tools/toolCorrelationIds.js");
function rawBackendEventFromConversationEvent(event) {
    const rawEvent = event.payload.rawEvent;
    return (0, backendEvents_js_1.isBackendEvent)(rawEvent) ? rawEvent : null;
}
function toolOutputStreamKey(event) {
    return toolOutputStreamKeys(event)[0] ?? null;
}
function toolOutputStreamKeys(event) {
    if (event.type !== 'tool_output' && event.type !== 'tool_bundle_output') {
        return [];
    }
    return (0, toolCorrelationIds_js_1.resolveToolOutputCorrelationKeys)(event.payload);
}
function syntheticToolOutputEvent(event) {
    return {
        id: event.eventId,
        type: 'tool-output',
        conversation_ref: event.conversationRef,
        turn_ref: event.turnRef ?? undefined,
        payload: event.payload,
    };
}
function syntheticStreamingResponseEvent(event) {
    return {
        id: event.eventId,
        type: 'streaming-response',
        conversation_ref: event.conversationRef,
        turn_ref: event.turnRef ?? undefined,
        payload: {
            text: typeof event.payload.text === 'string' ? event.payload.text : '',
        },
    };
}
function syntheticStreamingCompleteEvent(event) {
    return {
        id: event.eventId,
        type: 'streaming-complete',
        conversation_ref: event.conversationRef,
        turn_ref: event.turnRef ?? undefined,
        payload: {
            final_response: typeof event.payload.finalResponse === 'string'
                ? event.payload.finalResponse
                : undefined,
        },
    };
}
function syntheticToolCallEvent(event) {
    return {
        id: event.eventId,
        type: 'tool-call',
        conversation_ref: event.conversationRef,
        turn_ref: event.turnRef ?? undefined,
        payload: {
            tool_name: typeof event.payload.toolName === 'string' ? event.payload.toolName : undefined,
            parameters: event.payload.args && typeof event.payload.args === 'object' && !Array.isArray(event.payload.args)
                ? event.payload.args
                : undefined,
            request_id: typeof event.payload.requestId === 'string' ? event.payload.requestId : undefined,
            tool_call_id: typeof event.payload.toolCallId === 'string' ? event.payload.toolCallId : undefined,
            correlation_id: typeof event.payload.correlationId === 'string' ? event.payload.correlationId : undefined,
        },
    };
}
function syntheticErrorEvent(event) {
    const message = typeof event.payload.message === 'string'
        ? event.payload.message
        : (typeof event.payload.error === 'string' ? event.payload.error : 'Windie stream failed');
    return {
        id: event.eventId,
        type: 'error',
        conversation_ref: event.conversationRef,
        turn_ref: event.turnRef ?? undefined,
        payload: {
            message,
        },
    };
}
function toAgentStreamEvent(runtimeEvent) {
    if (runtimeEvent.type === 'turn_started') {
        return {
            type: 'start',
            queryMessageId: runtimeEvent.result.queryMessageId,
            conversationRef: runtimeEvent.snapshot.state.conversationRef,
        };
    }
    if (runtimeEvent.type === 'error') {
        return {
            type: 'error',
            message: runtimeEvent.error instanceof Error ? runtimeEvent.error.message : String(runtimeEvent.error),
            error: runtimeEvent.error,
        };
    }
    const event = runtimeEvent.event;
    const rawEvent = rawBackendEventFromConversationEvent(event);
    if (event.type === 'assistant_delta') {
        const backendEvent = rawEvent?.type === 'streaming-response'
            ? rawEvent
            : syntheticStreamingResponseEvent(event);
        return {
            type: 'text',
            text: typeof event.payload.text === 'string' ? event.payload.text : '',
            event: backendEvent,
        };
    }
    if (event.type === 'turn_completed') {
        const backendEvent = rawEvent?.type === 'streaming-complete'
            ? rawEvent
            : syntheticStreamingCompleteEvent(event);
        return {
            type: 'complete',
            finalResponse: typeof event.payload.finalResponse === 'string'
                ? event.payload.finalResponse
                : undefined,
            event: backendEvent,
        };
    }
    if (event.type === 'tool_call') {
        const backendEvent = rawEvent?.type === 'tool-call'
            ? rawEvent
            : syntheticToolCallEvent(event);
        return {
            type: 'tool_call',
            toolName: typeof event.payload.toolName === 'string' ? event.payload.toolName : undefined,
            event: backendEvent,
        };
    }
    if (event.type === 'tool_output' || event.type === 'tool_bundle_output') {
        const backendEvent = rawEvent?.type === 'tool-output'
            ? rawEvent
            : syntheticToolOutputEvent(event);
        return {
            type: 'tool_output',
            event: backendEvent,
        };
    }
    if (event.type === 'turn_error' || event.type === 'runtime_error') {
        const backendEvent = rawEvent?.type === 'error'
            ? rawEvent
            : syntheticErrorEvent(event);
        return {
            type: 'error',
            message: backendEvent.payload?.message || backendEvent.payload?.content || 'Windie stream failed',
            event: backendEvent,
        };
    }
    if (rawEvent) {
        return {
            type: 'event',
            event: rawEvent,
        };
    }
    return null;
}
