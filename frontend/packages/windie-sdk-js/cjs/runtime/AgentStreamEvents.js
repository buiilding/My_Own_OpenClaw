"use strict";
/**
 * Provides the agent stream events module for the TypeScript SDK runtime.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAgentStreamEventRuntime = createAgentStreamEventRuntime;
const toolCorrelationIds_js_1 = require("../tools/toolCorrelationIds.js");
function toolOutputStreamKey(event) {
    return toolOutputStreamKeys(event)[0] ?? null;
}
function toolOutputStreamKeys(event) {
    if (event.type !== 'tool_output' && event.type !== 'tool_bundle_output') {
        return [];
    }
    return (0, toolCorrelationIds_js_1.resolveToolOutputCorrelationKeys)(event.payload);
}
function toAgentStreamEvents(runtimeEvent) {
    if (runtimeEvent.type === 'turn_started') {
        return [];
    }
    if (runtimeEvent.type === 'error') {
        const locator = locatorFromSnapshot(runtimeEvent.snapshot);
        return [
            stateEvent('error', locator),
            {
                type: 'error',
                message: runtimeEvent.error instanceof Error ? runtimeEvent.error.message : String(runtimeEvent.error),
                ...locator,
            },
        ];
    }
    const event = runtimeEvent.event;
    const locator = locatorFromConversationEvent(event);
    if (event.type === 'user_message') {
        return [
            stateEvent('sending', locator),
            {
                type: 'user_message',
                text: stringField(event.payload, 'text') ?? '',
                content: stringField(event.payload, 'content') ?? '',
                ...locator,
            },
            stateEvent('thinking', locator),
        ];
    }
    if (event.type === 'reasoning_delta') {
        return [
            stateEvent('thinking', locator),
            {
                type: 'reasoning_delta',
                text: stringField(event.payload, 'text', 'content', 'status') ?? '',
                ...locator,
            },
        ];
    }
    if (event.type === 'assistant_delta') {
        return [
            stateEvent('streaming', locator),
            {
                type: 'assistant_delta',
                text: stringField(event.payload, 'text', 'content', 'delta') ?? '',
                ...locator,
            },
        ];
    }
    if (event.type === 'assistant_message') {
        return [
            {
                type: 'assistant_message',
                text: stringField(event.payload, 'text', 'content') ?? '',
                ...locator,
            },
        ];
    }
    if (event.type === 'tool_call') {
        return [
            stateEvent('tool_call', locator),
            {
                type: 'tool_calls',
                calls: [toolCallFromPayload(event.payload, 0)],
                ...locator,
            },
        ];
    }
    if (event.type === 'tool_bundle_call') {
        const calls = bundleToolCallsFromPayload(event.payload);
        if (calls.length === 0) {
            return [stateEvent('tool_call', locator)];
        }
        return [
            stateEvent('tool_call', locator),
            {
                type: 'tool_calls',
                calls,
                ...locator,
            },
        ];
    }
    if (event.type === 'tool_output') {
        return [
            stateEvent('tool_output', locator),
            {
                type: 'tool_outputs',
                outputs: [toolOutputFromPayload(event.payload, 0)],
                ...locator,
            },
        ];
    }
    if (event.type === 'tool_bundle_output') {
        const outputs = bundleToolOutputsFromPayload(event.payload);
        if (outputs.length === 0) {
            return [stateEvent('tool_output', locator)];
        }
        return [
            stateEvent('tool_output', locator),
            {
                type: 'tool_outputs',
                outputs,
                ...locator,
            },
        ];
    }
    if (event.type === 'memory_retrieval_diagnostic') {
        return [{
                type: 'memory_diagnostic',
                stage: stringField(event.payload, 'stage') ?? 'unknown',
                message: stringField(event.payload, 'message') ?? 'Memory retrieval diagnostic',
                error: stringField(event.payload, 'error'),
                episodicCount: numberField(event.payload, 'episodicCount'),
                semanticCount: numberField(event.payload, 'semanticCount'),
                ...locator,
            }];
    }
    if (event.type === 'turn_completed' || event.type === 'turn_stopped') {
        const finalResponse = stringField(event.payload, 'finalResponse', 'final_response');
        return [
            ...(finalResponse ? [{
                    type: 'assistant_message',
                    text: finalResponse,
                    ...locator,
                }] : []),
            stateEvent('idle', locator),
        ];
    }
    if (event.type === 'turn_error' || event.type === 'runtime_error') {
        return [
            stateEvent('error', locator),
            {
                type: 'error',
                message: stringField(event.payload, 'message', 'content', 'error') ?? 'Agent stream failed',
                ...locator,
            },
        ];
    }
    return [];
}
function createAgentStreamEventRuntime() {
    return {
        toStreamEvents: toAgentStreamEvents,
        toolOutputStreamKey,
        toolOutputStreamKeys,
    };
}
function locatorFromSnapshot(snapshot) {
    return {
        conversationRef: snapshot?.state.conversationRef ?? '',
        turnRef: snapshot?.state.activeTurnRef ?? null,
    };
}
function locatorFromConversationEvent(event) {
    return {
        conversationRef: event.conversationRef,
        turnRef: event.turnRef ?? null,
    };
}
function stateEvent(state, locator) {
    return {
        type: 'state',
        state,
        ...locator,
    };
}
function stringField(record, ...keys) {
    for (const key of keys) {
        const value = record[key];
        if (typeof value === 'string' && value.trim()) {
            return value;
        }
    }
    return null;
}
function numberField(record, ...keys) {
    for (const key of keys) {
        const value = record[key];
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
    }
    return null;
}
function recordField(record, ...keys) {
    for (const key of keys) {
        const value = record[key];
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            return value;
        }
    }
    return null;
}
function arrayField(record, ...keys) {
    for (const key of keys) {
        const value = record[key];
        if (Array.isArray(value)) {
            return value;
        }
    }
    return [];
}
function recordFromUnknown(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : null;
}
function modelFacingCallFromRecord(record) {
    const metadata = recordField(record, 'metadata');
    const modelFacing = recordFromUnknown(metadata?.model_facing_tool_call)
        ?? recordFromUnknown(record.model_facing_tool_call);
    if (modelFacing) {
        return modelFacing;
    }
    const toolCalls = arrayField(record, 'tool_calls', 'toolCalls');
    return recordFromUnknown(toolCalls[0]);
}
function toolNameFromModelCall(call) {
    const fn = recordFromUnknown(call?.function);
    return stringField(call ?? {}, 'name', 'toolName', 'tool_name')
        ?? stringField(fn ?? {}, 'name');
}
function toolArgsFromModelCall(call) {
    const fn = recordFromUnknown(call?.function);
    const args = call?.arguments ?? fn?.arguments;
    if (typeof args === 'string') {
        try {
            return JSON.parse(args);
        }
        catch {
            return args;
        }
    }
    return args ?? null;
}
function toolCallIdFromModelCall(call) {
    return stringField(call ?? {}, 'id', 'toolCallId', 'tool_call_id');
}
function toolCallNameFromPayload(payload, options) {
    return stringField(payload, 'toolName')
        ?? (options.allowStepName ? stringField(payload, 'name') : null);
}
function toolCallFromPayload(payload, index, options = {}) {
    const modelFacing = modelFacingCallFromRecord(payload);
    return {
        toolName: toolNameFromModelCall(modelFacing)
            ?? toolCallNameFromPayload(payload, options)
            ?? 'unknown_tool',
        args: toolArgsFromModelCall(modelFacing)
            ?? recordField(payload, 'args', 'arguments')
            ?? {},
        requestId: stringField(payload, 'requestId'),
        toolCallId: toolCallIdFromModelCall(modelFacing)
            ?? stringField(payload, 'toolCallId'),
        index,
    };
}
function bundleToolCallsFromPayload(payload) {
    const structuredPayload = recordField(payload, 'structuredPayload');
    const tools = arrayField(payload, 'tools');
    const structuredTools = structuredPayload ? arrayField(structuredPayload, 'tools') : [];
    return (tools.length > 0 ? tools : structuredTools)
        .map(recordFromUnknown)
        .filter((tool) => Boolean(tool))
        .map((tool, index) => toolCallFromPayload(tool, index, { allowStepName: true }));
}
function resultFromPayload(payload) {
    if ('result' in payload)
        return payload.result;
    if ('data' in payload)
        return payload.data;
    if ('output' in payload)
        return payload.output;
    const structuredPayload = recordField(payload, 'structuredPayload');
    return structuredPayload ?? payload;
}
function isLargeBinaryDisplayField(key, value) {
    return (typeof value === 'string'
        && value.length > 500
        && /screenshot|image|base64|bytes|data_url|dataUrl/i.test(key));
}
function dataUrlContentType(value) {
    const match = /^data:([^;,]+)[;,]/i.exec(value);
    return match?.[1]?.toLowerCase() ?? null;
}
function stringRecordField(record, ...keys) {
    if (!record) {
        return null;
    }
    for (const key of keys) {
        const value = record[key];
        if (typeof value === 'string' && value.trim()) {
            return value;
        }
    }
    return null;
}
function contentTypeForAttachment(key, value, parent) {
    return dataUrlContentType(value)
        ?? stringRecordField(parent, `${key}_content_type`, `${key}ContentType`, 'content_type', 'contentType', 'mime_type', 'mimeType');
}
function attachmentKind(key, contentType) {
    if (contentType?.toLowerCase().startsWith('image/')) {
        return 'image';
    }
    return /screenshot|image|data_url|dataUrl/i.test(key) ? 'image' : 'binary';
}
function appendPath(parentPath, key) {
    return parentPath ? `${parentPath}.${key}` : key;
}
function appendArrayPath(parentPath, index) {
    return `${parentPath}[${index}]`;
}
function extractToolResultAttachments(value, path = '') {
    if (Array.isArray(value)) {
        const attachments = [];
        const result = value.map((item, index) => {
            const extracted = extractToolResultAttachments(item, appendArrayPath(path, index));
            attachments.push(...extracted.attachments);
            return extracted.result;
        });
        return { result, attachments };
    }
    if (value && typeof value === 'object') {
        const record = value;
        const attachments = [];
        const result = {};
        for (const [key, nested] of Object.entries(record)) {
            const fieldPath = appendPath(path, key);
            if (isLargeBinaryDisplayField(key, nested)) {
                const contentType = contentTypeForAttachment(key, nested, record);
                attachments.push({
                    kind: attachmentKind(key, contentType),
                    fieldPath,
                    key,
                    contentType,
                    value: nested,
                    charLength: nested.length,
                });
                continue;
            }
            const extracted = extractToolResultAttachments(nested, fieldPath);
            result[key] = extracted.result;
            attachments.push(...extracted.attachments);
        }
        return { result, attachments };
    }
    return { result: value, attachments: [] };
}
function successFromPayload(payload) {
    if (typeof payload.success === 'boolean') {
        return payload.success;
    }
    const status = stringField(payload, 'status');
    if (!status) {
        return null;
    }
    if (status === 'ok' || status === 'success') {
        return true;
    }
    if (status === 'error' || status === 'failure' || status === 'failed') {
        return false;
    }
    return null;
}
function toolOutputNameFromPayload(payload, options) {
    return stringField(payload, 'toolName')
        ?? (options.allowStepToolName ? stringField(payload, 'tool', 'name') : null);
}
function toolOutputFromPayload(payload, index, options = {}) {
    const extractedResult = extractToolResultAttachments(resultFromPayload(payload));
    return {
        toolName: toolOutputNameFromPayload(payload, options) ?? 'unknown_tool',
        result: extractedResult.result,
        attachments: extractedResult.attachments,
        success: successFromPayload(payload),
        error: stringField(payload, 'error'),
        requestId: stringField(payload, 'requestId'),
        toolCallId: stringField(payload, 'toolCallId'),
        index,
    };
}
function bundleToolOutputsFromPayload(payload) {
    const structuredPayload = recordField(payload, 'structuredPayload');
    const steps = arrayField(payload, 'stepResults', 'step_results');
    const structuredSteps = structuredPayload
        ? arrayField(structuredPayload, 'stepResults', 'step_results', 'results')
        : [];
    return (steps.length > 0 ? steps : structuredSteps)
        .map(recordFromUnknown)
        .filter((step) => Boolean(step))
        .map((step, index) => toolOutputFromPayload(step, index, { allowStepToolName: true }));
}
