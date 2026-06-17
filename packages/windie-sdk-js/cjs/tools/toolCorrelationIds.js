"use strict";
/**
 * Provides the tool correlation ids module for the TypeScript SDK runtime.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveModelFacingToolCallId = resolveModelFacingToolCallId;
exports.resolveCorrelationId = resolveCorrelationId;
exports.resolveToolCallCorrelationId = resolveToolCallCorrelationId;
exports.resolveToolOutputCorrelationId = resolveToolOutputCorrelationId;
exports.resolveToolBundleCorrelationId = resolveToolBundleCorrelationId;
exports.resolveToolWaitId = resolveToolWaitId;
exports.resolveToolEventCorrelationId = resolveToolEventCorrelationId;
exports.resolveToolOutputCorrelationKeys = resolveToolOutputCorrelationKeys;
exports.resolveToolOutputDedupeKey = resolveToolOutputDedupeKey;
exports.resolveToolPairKeys = resolveToolPairKeys;
function recordFromUnknown(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : null;
}
function stringField(payload, ...keys) {
    const record = recordFromUnknown(payload);
    if (!record) {
        return null;
    }
    for (const key of keys) {
        const value = record[key];
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    return null;
}
function resolveModelFacingToolCallId(payload) {
    const metadata = recordFromUnknown(recordFromUnknown(payload)?.metadata);
    const toolCall = recordFromUnknown(metadata?.model_facing_tool_call);
    return stringField(toolCall, 'id');
}
function resolveCorrelationId(...ids) {
    for (const id of ids) {
        if (typeof id === 'string' && id.trim()) {
            return id.trim();
        }
    }
    return null;
}
function resolveToolCallCorrelationId(payload, eventId) {
    return resolveCorrelationId(stringField(payload, 'correlationId', 'correlation_id'), stringField(payload, 'requestId', 'request_id'), stringField(payload, 'toolCallId', 'tool_call_id'), resolveModelFacingToolCallId(payload), eventId) ?? undefined;
}
function resolveToolOutputCorrelationId(payload, eventId) {
    const metadata = recordFromUnknown(recordFromUnknown(payload)?.metadata);
    return resolveCorrelationId(stringField(payload, 'requestId', 'request_id'), stringField(payload, 'toolCallId', 'tool_call_id'), stringField(metadata, 'toolCallId', 'tool_call_id'), eventId) ?? undefined;
}
function resolveToolBundleCorrelationId(payload, eventId) {
    return resolveCorrelationId(stringField(payload, 'bundleId', 'bundle_id'), eventId) ?? undefined;
}
function resolveToolWaitId(payload) {
    return resolveCorrelationId(stringField(payload, 'requestId', 'request_id'), stringField(payload, 'bundleId', 'bundle_id'), stringField(payload, 'correlationId', 'correlation_id'), stringField(payload, 'toolCallId', 'tool_call_id'));
}
function resolveToolEventCorrelationId(payload) {
    return resolveCorrelationId(stringField(payload, 'requestId', 'request_id'), stringField(payload, 'bundleId', 'bundle_id'), stringField(payload, 'toolCallId', 'tool_call_id'), stringField(payload, 'correlationId', 'correlation_id'));
}
function resolveToolOutputCorrelationKeys(payload) {
    const keys = [];
    const toolCallId = stringField(payload, 'toolCallId', 'tool_call_id');
    if (toolCallId) {
        keys.push(`tool-call:${toolCallId}`);
    }
    const requestId = stringField(payload, 'requestId', 'request_id', 'correlationId', 'correlation_id');
    if (requestId) {
        keys.push(`request:${requestId}`);
    }
    const bundleId = stringField(payload, 'bundleId', 'bundle_id');
    if (bundleId) {
        keys.push(`bundle:${bundleId}`);
    }
    return keys;
}
function resolveToolOutputDedupeKey(payload) {
    const requestId = stringField(payload, 'requestId', 'request_id', 'correlationId', 'correlation_id');
    if (requestId) {
        return `request:${requestId}`;
    }
    const bundleId = stringField(payload, 'bundleId', 'bundle_id');
    if (bundleId) {
        return `bundle:${bundleId}`;
    }
    const toolCallId = stringField(payload, 'toolCallId', 'tool_call_id');
    return toolCallId ? `tool-call:${toolCallId}` : null;
}
function resolveToolPairKeys(payload, options = {}) {
    if (options.bundle) {
        const bundleId = stringField(payload, 'bundleId', 'bundle_id');
        return bundleId ? [`bundle:${bundleId}`] : [];
    }
    const keys = [];
    const toolCallId = stringField(payload, 'toolCallId', 'tool_call_id');
    if (toolCallId) {
        keys.push(`tool-call:${toolCallId}`);
    }
    const requestId = stringField(payload, 'requestId', 'request_id', 'correlationId', 'correlation_id');
    if (requestId) {
        keys.push(`request:${requestId}`);
    }
    return keys;
}
