"use strict";
/**
 * Projects conversation projections state for the TypeScript SDK runtime.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDisplayRows = buildDisplayRows;
exports.buildCurrentTurnProjection = buildCurrentTurnProjection;
exports.isInternalConversationLane = isInternalConversationLane;
exports.buildConversationView = buildConversationView;
exports.buildConversationViewBuildDiagnostics = buildConversationViewBuildDiagnostics;
exports.buildCompactionState = buildCompactionState;
exports.buildDisplayConversation = buildDisplayConversation;
exports.buildTraceTimeline = buildTraceTimeline;
exports.buildToolTrace = buildToolTrace;
exports.buildConversationMetadata = buildConversationMetadata;
exports.buildRehydrateSnapshot = buildRehydrateSnapshot;
const toolCorrelationIds_js_1 = require("../tools/toolCorrelationIds.js");
const toolOutputContent_js_1 = require("../tools/toolOutputContent.js");
const legacyVisualAttachmentReplayAdapter_js_1 = require("./legacyVisualAttachmentReplayAdapter.js");
function textFromPayload(payload) {
    if (typeof payload.text === 'string') {
        return payload.text;
    }
    if (typeof payload.message === 'string') {
        return payload.message;
    }
    if (typeof payload.content === 'string') {
        return payload.content;
    }
    if (typeof payload.finalResponse === 'string') {
        return payload.finalResponse;
    }
    if (typeof payload.final_response === 'string') {
        return payload.final_response;
    }
    if (typeof payload.error === 'string') {
        return payload.error;
    }
    return '';
}
function isConversationControlProjectionEvent(event) {
    return event.type === 'compaction_started'
        || event.type === 'compaction_skipped'
        || event.type === 'compaction_applied'
        || event.type === 'compaction_failed';
}
function isTracePayload(payload) {
    return payload.schemaVersion === 1
        && typeof payload.traceId === 'string'
        && typeof payload.spanId === 'string'
        && typeof payload.path === 'string'
        && typeof payload.stage === 'string'
        && typeof payload.status === 'string'
        && typeof payload.runtime === 'string';
}
const SETTINGS_UPDATE_ERROR_TEXT = 'Failed to update settings';
const EMPTY_CHAT_GREETING_TEXT = 'Hi! What can I help you with?';
const SDK_CURRENT_TURN_SOURCE_CHANNEL = 'sdk:current-turn';
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
function displayTextFromPayload(payload) {
    return (0, toolOutputContent_js_1.readToolOutputContent)(payload).displayContent;
}
function rawToolOutputTextFromPayload(payload) {
    const result = (0, toolOutputContent_js_1.recordFromUnknown)(payload.result);
    return (0, toolOutputContent_js_1.stringField)(result, 'output')
        ?? (0, toolOutputContent_js_1.stringField)(payload, 'output')
        ?? (0, toolOutputContent_js_1.stringField)(result, 'message')
        ?? (0, toolOutputContent_js_1.stringField)(payload, 'message')
        ?? (0, toolOutputContent_js_1.stringField)(result, 'error')
        ?? (0, toolOutputContent_js_1.stringField)(payload, 'error')
        ?? JSON.stringify(payload);
}
function bundleOutputContentFromPayload(payload) {
    const bundleId = (0, toolOutputContent_js_1.stringField)(payload, 'bundleId', 'bundle_id');
    const steps = bundleStepResultsFromPayload(payload);
    if (steps.length === 0) {
        return {
            ...(bundleId ? { bundleId } : {}),
            step_results: [],
            output: rawToolOutputTextFromPayload(payload),
        };
    }
    return {
        ...(bundleId ? { bundleId } : {}),
        step_results: steps.map((step) => {
            const toolName = (0, toolOutputContent_js_1.stringField)(step, 'toolName', 'tool_name', 'tool');
            const toolCallId = (0, toolOutputContent_js_1.stringField)(step, 'toolCallId', 'tool_call_id', 'id');
            const status = (0, toolOutputContent_js_1.stringField)(step, 'status');
            const error = (0, toolOutputContent_js_1.stringField)(step, 'error');
            const rawOutput = (0, toolOutputContent_js_1.recordFromUnknown)(step.output) ?? (0, toolOutputContent_js_1.recordFromUnknown)(step.result);
            return {
                ...(toolName ? { tool: toolName } : {}),
                ...(toolCallId ? { toolCallId } : {}),
                ...(status ? { status } : {}),
                output: rawOutput
                    ? rawToolOutputTextFromPayload(rawOutput)
                    : ((0, toolOutputContent_js_1.stringField)(step, 'output', 'result', 'message')
                        ?? (error ? `Error: ${error}` : JSON.stringify(step))),
            };
        }),
    };
}
function bundleDisplayTextFromPayload(payload) {
    const content = bundleOutputContentFromPayload(payload);
    const steps = Array.isArray(content.step_results) ? content.step_results : [];
    if (steps.length === 0) {
        return typeof content.output === 'string' ? content.output : displayTextFromPayload(payload);
    }
    return steps.map((step, index) => {
        const stepRecord = (0, toolOutputContent_js_1.recordFromUnknown)(step);
        const toolName = (0, toolOutputContent_js_1.stringField)(stepRecord, 'tool');
        const label = toolName ? `${toolName} #${index + 1}` : `step #${index + 1}`;
        const outputRecord = (0, toolOutputContent_js_1.recordFromUnknown)(stepRecord?.output) ?? (0, toolOutputContent_js_1.recordFromUnknown)(stepRecord?.result);
        const outputText = (0, toolOutputContent_js_1.stringField)(stepRecord, 'output')
            ?? (outputRecord ? (0, toolOutputContent_js_1.readToolOutputContent)(outputRecord).displayContent : (0, toolOutputContent_js_1.readBundleStepModelContent)(stepRecord ?? {}));
        return `${label}\n${outputText}`;
    }).join('\n\n');
}
function modelTextFromPayload(payload) {
    return (0, toolOutputContent_js_1.readToolOutputContent)(payload).modelContent;
}
function contentFromPayload(payload) {
    const text = textFromPayload(payload);
    if (text) {
        return text;
    }
    const structured = payload.structuredPayload;
    if (structured && typeof structured === 'object') {
        return JSON.stringify(structured);
    }
    return JSON.stringify(payload);
}
function toolNameFromPayload(payload) {
    if (typeof payload.toolName === 'string') {
        return payload.toolName;
    }
    if (typeof payload.tool_name === 'string') {
        return payload.tool_name;
    }
    return null;
}
function modelFacingToolCallFromRecord(record) {
    const metadata = (0, toolOutputContent_js_1.recordFromUnknown)(record?.metadata);
    const modelFacing = (0, toolOutputContent_js_1.recordFromUnknown)(metadata?.model_facing_tool_call)
        ?? (0, toolOutputContent_js_1.recordFromUnknown)(record?.model_facing_tool_call);
    if (modelFacing) {
        return modelFacing;
    }
    const toolCalls = Array.isArray(record?.tool_calls)
        ? record?.tool_calls
        : (Array.isArray(record?.toolCalls) ? record?.toolCalls : null);
    if (toolCalls) {
        const first = (0, toolOutputContent_js_1.recordFromUnknown)(toolCalls[0]);
        if (first) {
            return first;
        }
    }
    const toolName = (0, toolOutputContent_js_1.stringField)(record, 'toolName', 'tool_name', 'name');
    if (!toolName) {
        return null;
    }
    const args = (0, toolOutputContent_js_1.recordFromUnknown)(record?.args)
        ?? (0, toolOutputContent_js_1.recordFromUnknown)(record?.parameters)
        ?? (0, toolOutputContent_js_1.recordFromUnknown)(record?.arguments)
        ?? {};
    const toolCallId = (0, toolOutputContent_js_1.stringField)(record, 'toolCallId', 'tool_call_id', 'id');
    return {
        ...(toolCallId ? { id: toolCallId } : {}),
        name: toolName,
        arguments: args,
    };
}
function modelFacingToolCallFromPayload(payload) {
    const structuredPayload = (0, toolOutputContent_js_1.recordFromUnknown)(payload.structuredPayload);
    return modelFacingToolCallFromRecord(payload)
        ?? modelFacingToolCallFromRecord(structuredPayload)
        ?? {
            name: toolNameFromPayload(payload) ?? 'tool',
            arguments: (0, toolOutputContent_js_1.recordFromUnknown)(payload.args) ?? {},
        };
}
function bundleToolCallContentFromPayload(payload) {
    const bundleId = (0, toolOutputContent_js_1.stringField)(payload, 'bundleId', 'bundle_id');
    const structuredPayload = (0, toolOutputContent_js_1.recordFromUnknown)(payload.structuredPayload);
    const tools = Array.isArray(payload.tools)
        ? payload.tools
        : (Array.isArray(structuredPayload?.tools) ? structuredPayload.tools : []);
    const toolCalls = tools
        .map((tool) => modelFacingToolCallFromRecord((0, toolOutputContent_js_1.recordFromUnknown)(tool)))
        .filter((toolCall) => Boolean(toolCall));
    if (toolCalls.length > 0) {
        return {
            ...(bundleId ? { bundleId } : {}),
            tool_calls: toolCalls,
        };
    }
    return {
        ...(bundleId ? { bundleId } : {}),
        tool_calls: toolCallsFromPayload(payload) ?? [],
    };
}
function stringArrayField(record, ...keys) {
    for (const key of keys) {
        const value = record[key];
        if (!Array.isArray(value)) {
            continue;
        }
        const normalized = value
            .filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
            .map(entry => entry.trim());
        if (normalized.length > 0) {
            return normalized;
        }
    }
    return null;
}
function displayAttachmentFromRecord(record) {
    const id = (0, toolOutputContent_js_1.stringField)(record, 'id');
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
    return {
        id,
        kind,
        source,
        status,
        ...((0, toolOutputContent_js_1.stringField)(record, 'filename') ? { filename: (0, toolOutputContent_js_1.stringField)(record, 'filename') } : {}),
        ...((0, toolOutputContent_js_1.stringField)(record, 'contentType', 'content_type') ? {
            contentType: (0, toolOutputContent_js_1.stringField)(record, 'contentType', 'content_type'),
        } : {}),
        ...((0, toolOutputContent_js_1.stringField)(record, 'screenshotRef', 'screenshot_ref') ? {
            screenshotRef: (0, toolOutputContent_js_1.stringField)(record, 'screenshotRef', 'screenshot_ref'),
        } : {}),
        ...((0, toolOutputContent_js_1.stringField)(record, 'screenshotUrl', 'screenshot_url') ? {
            screenshotUrl: (0, toolOutputContent_js_1.stringField)(record, 'screenshotUrl', 'screenshot_url'),
        } : {}),
        ...((0, toolOutputContent_js_1.stringField)(record, 'errorCode', 'error_code') ? { errorCode: (0, toolOutputContent_js_1.stringField)(record, 'errorCode', 'error_code') } : {}),
    };
}
function displayAttachmentsField(record, ...keys) {
    for (const key of keys) {
        const value = record[key];
        if (!Array.isArray(value)) {
            continue;
        }
        const attachments = value
            .map(entry => (0, toolOutputContent_js_1.recordFromUnknown)(entry))
            .filter((entry) => Boolean(entry))
            .map(displayAttachmentFromRecord)
            .filter((entry) => Boolean(entry));
        if (attachments.length > 0) {
            return attachments;
        }
    }
    return null;
}
function mergeDisplayAttachments(existing, incoming) {
    const ordered = new Map();
    for (const attachment of [...(existing ?? []), ...(incoming ?? [])]) {
        const previous = ordered.get(attachment.id);
        ordered.set(attachment.id, attachment.status === 'ready' || attachment.status === 'failed'
            ? attachment
            : {
                ...(previous ?? {}),
                ...attachment,
            });
    }
    const attachments = Array.from(ordered.values());
    return attachments.length > 0 ? attachments : null;
}
function sourceEventTypeFromPayload(payload) {
    return (0, toolOutputContent_js_1.stringField)(payload, 'sourceEventType', 'source_event_type');
}
function displayCorrelationIdFromEvent(event) {
    return (0, toolOutputContent_js_1.stringField)(event.payload, 'requestId', 'request_id', 'bundleId', 'bundle_id', 'toolCallId', 'tool_call_id', 'correlationId', 'correlation_id');
}
function toolDisplayDetailsFromEvent(event) {
    if (event.type !== 'tool_call'
        && event.type !== 'tool_bundle_call'
        && event.type !== 'tool_output'
        && event.type !== 'tool_bundle_output') {
        return null;
    }
    const details = {};
    const toolName = toolNameFromPayload(event.payload)
        ?? (event.type === 'tool_bundle_call' || event.type === 'tool_bundle_output' ? 'tool_bundle' : null);
    const requestId = (0, toolOutputContent_js_1.stringField)(event.payload, 'requestId', 'request_id');
    const correlationId = (0, toolOutputContent_js_1.stringField)(event.payload, 'correlationId', 'correlation_id');
    const displayCorrelationId = displayCorrelationIdFromEvent(event);
    const bundleId = (0, toolOutputContent_js_1.stringField)(event.payload, 'bundleId', 'bundle_id');
    const toolCallId = (0, toolOutputContent_js_1.stringField)(event.payload, 'toolCallId', 'tool_call_id');
    const sourceEventType = sourceEventTypeFromPayload(event.payload);
    if (toolName) {
        details.toolName = toolName;
    }
    if (requestId) {
        details.requestId = requestId;
    }
    if (correlationId) {
        details.correlationId = correlationId;
    }
    if (displayCorrelationId) {
        details.displayCorrelationId = displayCorrelationId;
    }
    if (bundleId) {
        details.bundleId = bundleId;
    }
    if (toolCallId) {
        details.toolCallId = toolCallId;
    }
    if (sourceEventType) {
        details.sourceEventType = sourceEventType;
    }
    if (typeof event.payload.success === 'boolean') {
        details.success = event.payload.success;
    }
    return Object.keys(details).length > 0 ? details : null;
}
function displayRowMetadata(event) {
    const screenshotRef = (0, toolOutputContent_js_1.stringField)(event.payload, 'screenshotRef', 'screenshot_ref');
    const screenshotUrl = (0, toolOutputContent_js_1.stringField)(event.payload, 'screenshotUrl', 'screenshot_url');
    const screenshotRefs = stringArrayField(event.payload, 'screenshotRefs', 'screenshot_refs')
        ?? (screenshotRef ? [screenshotRef] : null);
    const attachments = displayAttachmentsField(event.payload, 'attachments', 'display_attachments')
        ?? (0, legacyVisualAttachmentReplayAdapter_js_1.legacyVisualAttachmentReplayAdapter)(event);
    const screenshotContentType = (0, toolOutputContent_js_1.stringField)(event.payload, 'screenshotContentType', 'screenshot_content_type');
    const toolDetails = toolDisplayDetailsFromEvent(event);
    return {
        eventId: event.eventId,
        source: event.source,
        revisionId: event.revisionId,
        timestamp: event.timestamp,
        toolName: toolNameFromPayload(event.payload),
        requestId: (0, toolOutputContent_js_1.stringField)(event.payload, 'requestId', 'request_id'),
        correlationId: (0, toolOutputContent_js_1.stringField)(event.payload, 'correlationId', 'correlation_id'),
        displayCorrelationId: displayCorrelationIdFromEvent(event),
        bundleId: (0, toolOutputContent_js_1.stringField)(event.payload, 'bundleId', 'bundle_id'),
        toolCallId: (0, toolOutputContent_js_1.stringField)(event.payload, 'toolCallId', 'tool_call_id'),
        toolCallDetails: event.type === 'tool_call' || event.type === 'tool_bundle_call'
            ? toolDetails
            : null,
        toolOutputDetails: event.type === 'tool_output' || event.type === 'tool_bundle_output'
            ? toolDetails
            : null,
        screenshotRef,
        screenshot_ref: screenshotRef,
        screenshotUrl,
        screenshot_url: screenshotUrl,
        screenshotRefs,
        screenshot_refs: screenshotRefs,
        screenshot: (0, toolOutputContent_js_1.stringField)(event.payload, 'screenshot', 'image'),
        screenshotContentType,
        attachments,
        structuredPayload: structuredPayloadFrom(event.payload),
        sourceEventType: sourceEventTypeFromPayload(event.payload),
        success: typeof event.payload.success === 'boolean' ? event.payload.success : null,
        modelId: (0, toolOutputContent_js_1.stringField)(event.payload, 'modelId', 'model_id'),
        modelProvider: (0, toolOutputContent_js_1.stringField)(event.payload, 'modelProvider', 'model_provider'),
        raw: event.payload,
    };
}
const SCREENSHOT_METADATA_KEYS = [
    'screenshotRef',
    'screenshot_ref',
    'screenshotUrl',
    'screenshot_url',
    'screenshotRefs',
    'screenshot_refs',
    'screenshot',
    'image',
    'screenshotContentType',
    'screenshot_content_type',
    'attachments',
    'display_attachments',
];
function hasScreenshotMetadata(payload) {
    return SCREENSHOT_METADATA_KEYS.some(key => Object.prototype.hasOwnProperty.call(payload, key));
}
function preserveExistingScreenshotMetadata(row, metadata) {
    const previous = row.metadata;
    const screenshotRef = previous?.screenshotRef ?? previous?.screenshot_ref ?? null;
    const screenshotUrl = previous?.screenshotUrl ?? previous?.screenshot_url ?? null;
    const screenshotRefs = previous?.screenshotRefs
        ?? previous?.screenshot_refs
        ?? (screenshotRef ? [screenshotRef] : null);
    const attachments = mergeDisplayAttachments(previous?.attachments, metadata.attachments);
    return {
        ...metadata,
        screenshotRef,
        screenshot_ref: screenshotRef,
        screenshotUrl,
        screenshot_url: screenshotUrl,
        screenshotRefs,
        screenshot_refs: screenshotRefs,
        screenshot: previous?.screenshot ?? null,
        screenshotContentType: previous?.screenshotContentType ?? null,
        attachments,
    };
}
function toolRowIdentity(event, index) {
    if (event.type === 'tool_call') {
        const toolCall = modelFacingToolCallFromPayload(event.payload);
        return (0, toolOutputContent_js_1.stringField)(toolCall, 'id')
            ?? (0, toolOutputContent_js_1.stringField)(event.payload, 'toolCallId', 'tool_call_id', 'requestId', 'request_id', 'correlationId', 'correlation_id')
            ?? String(index);
    }
    if (event.type === 'tool_output') {
        return (0, toolOutputContent_js_1.stringField)(event.payload, 'toolCallId', 'tool_call_id', 'requestId', 'request_id', 'correlationId', 'correlation_id')
            ?? String(index);
    }
    if (event.type === 'tool_bundle_call' || event.type === 'tool_bundle_output') {
        return (0, toolOutputContent_js_1.stringField)(event.payload, 'bundleId', 'bundle_id', 'correlationId', 'correlation_id')
            ?? String(index);
    }
    return String(index);
}
function displayRowId(event, index) {
    if (event.type === 'assistant_message') {
        return assistantDisplayRowId(event);
    }
    if (event.type === 'tool_call'
        || event.type === 'tool_progress'
        || event.type === 'tool_output'
        || event.type === 'tool_bundle_call'
        || event.type === 'tool_bundle_output') {
        return `${event.eventId}:${event.type}:${toolRowIdentity(event, index)}`;
    }
    return event.eventId;
}
function assistantDisplayRowId(event) {
    return event.turnRef
        ? `${event.conversationRef}:${event.turnRef}:assistant`
        : event.eventId;
}
function assistantSegmentDisplayRowId(event) {
    const baseId = assistantDisplayRowId(event);
    return event.turnRef ? `${baseId}:${event.eventId}` : event.eventId;
}
function streamingAssistantKey(event) {
    return `${event.conversationRef}:${event.turnRef ?? event.eventId}`;
}
function conversationTurnKey(event) {
    if (event.turnRef) {
        return `${event.conversationRef}:${event.turnRef}`;
    }
    return null;
}
function assistantDisplayRowIdForSegment(event, assistantRowsByTurn) {
    const turnKey = conversationTurnKey(event);
    if (!turnKey || (assistantRowsByTurn.get(turnKey) ?? 0) === 0) {
        return assistantDisplayRowId(event);
    }
    return assistantSegmentDisplayRowId(event);
}
function recordAssistantDisplayRow(event, assistantRowsByTurn) {
    const turnKey = conversationTurnKey(event);
    if (!turnKey) {
        return;
    }
    assistantRowsByTurn.set(turnKey, (assistantRowsByTurn.get(turnKey) ?? 0) + 1);
}
function displayRowBase(event, index) {
    return {
        id: displayRowId(event, index),
        conversationRef: event.conversationRef,
        turnRef: event.turnRef,
        index,
        metadata: displayRowMetadata(event),
    };
}
function userTurnKey(row) {
    return row.turnRef ? `${row.conversationRef}:${row.turnRef}` : null;
}
function applyLiveAttachmentsToUserRow(row, options) {
    const key = userTurnKey(row);
    const liveAttachments = key ? options.liveAttachments?.[key] ?? null : null;
    if (!liveAttachments || liveAttachments.length === 0) {
        return row;
    }
    return {
        ...row,
        metadata: {
            ...row.metadata,
            attachments: mergeDisplayAttachments(liveAttachments, row.metadata?.attachments),
        },
    };
}
function displayRowFromEvent(event, index) {
    if (event.type === 'user_message') {
        return {
            ...displayRowBase(event, index),
            role: 'user',
            type: 'user_message',
            content: textFromPayload(event.payload),
        };
    }
    if (event.type === 'assistant_delta' || event.type === 'reasoning_delta') {
        return null;
    }
    if (event.type === 'assistant_message') {
        return {
            ...displayRowBase(event, index),
            role: 'assistant',
            type: 'assistant_message',
            content: textFromPayload(event.payload),
        };
    }
    if (event.type === 'tool_call') {
        const modelFacingToolCall = modelFacingToolCallFromPayload(event.payload);
        return {
            ...displayRowBase(event, index),
            role: 'assistant',
            type: 'tool_call',
            content: modelFacingToolCall,
            metadata: {
                ...displayRowMetadata(event),
                toolName: toolNameFromPayload(event.payload),
                modelFacingToolCall,
            },
        };
    }
    if (event.type === 'tool_progress') {
        return {
            ...displayRowBase(event, index),
            role: 'assistant',
            type: 'tool_progress',
            content: textFromPayload(event.payload),
            metadata: {
                ...displayRowMetadata(event),
                toolName: toolNameFromPayload(event.payload) ?? 'web_search',
            },
        };
    }
    if (event.type === 'tool_bundle_call') {
        return {
            ...displayRowBase(event, index),
            role: 'assistant',
            type: 'tool_bundle_call',
            content: bundleToolCallContentFromPayload(event.payload),
            metadata: {
                ...displayRowMetadata(event),
                toolName: 'tool_bundle',
            },
        };
    }
    if (event.type === 'tool_output') {
        return {
            ...displayRowBase(event, index),
            role: 'tool',
            type: 'tool_output',
            content: rawToolOutputTextFromPayload(event.payload),
            metadata: {
                ...displayRowMetadata(event),
                toolName: toolNameFromPayload(event.payload),
            },
        };
    }
    if (event.type === 'tool_bundle_output') {
        return {
            ...displayRowBase(event, index),
            role: 'tool',
            type: 'tool_bundle_output',
            content: bundleOutputContentFromPayload(event.payload),
            metadata: {
                ...displayRowMetadata(event),
                toolName: 'tool_bundle',
            },
        };
    }
    if (event.type === 'turn_error' || event.type === 'runtime_error') {
        if (event.type === 'turn_error' && shouldIgnoreCurrentTurnError(event.payload)) {
            return null;
        }
        return {
            ...displayRowBase(event, index),
            role: 'system',
            type: 'error',
            content: textFromPayload(event.payload) || 'Unknown runtime error',
        };
    }
    return null;
}
function mergeUserMessageMetadata(row, event) {
    const metadata = hasScreenshotMetadata(event.payload)
        ? displayRowMetadata(event)
        : preserveExistingScreenshotMetadata(row, displayRowMetadata(event));
    return {
        ...row,
        metadata: {
            ...row.metadata,
            ...metadata,
            raw: {
                ...((0, toolOutputContent_js_1.recordFromUnknown)(row.metadata?.raw) ?? {}),
                ...event.payload,
            },
        },
    };
}
function buildStreamingAssistantRow(event, index, rowId, assistantText, reasoningText, eventIds) {
    const raw = {
        ...event.payload,
        assistantText,
        reasoningText,
        sourceEventIds: eventIds,
    };
    return {
        id: rowId,
        conversationRef: event.conversationRef,
        turnRef: event.turnRef,
        index,
        role: 'assistant',
        type: 'assistant_message',
        content: assistantText,
        isStreaming: true,
        metadata: {
            ...displayRowMetadata(event),
            reasoningText,
            raw,
        },
    };
}
function buildFinalAssistantRow(event, index, rowId, streamingState) {
    const reasoningText = streamingState?.reasoningText ?? null;
    const raw = reasoningText
        ? {
            ...event.payload,
            reasoningText,
            sourceEventIds: streamingState?.eventIds ?? [],
        }
        : event.payload;
    return {
        id: rowId,
        conversationRef: event.conversationRef,
        turnRef: event.turnRef,
        index,
        role: 'assistant',
        type: 'assistant_message',
        content: textFromPayload(event.payload),
        metadata: {
            ...displayRowMetadata(event),
            reasoningText,
            raw,
        },
    };
}
function replaceAssistantRowsForTurnWithError(rows, event, errorRow) {
    if (!event.turnRef) {
        return false;
    }
    const matchingIndexes = [];
    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        if (row.type === 'assistant_message'
            && row.conversationRef === event.conversationRef
            && row.turnRef === event.turnRef) {
            matchingIndexes.push(index);
        }
    }
    if (matchingIndexes.length === 0) {
        return false;
    }
    const [firstIndex, ...extraIndexes] = matchingIndexes;
    for (let index = extraIndexes.length - 1; index >= 0; index -= 1) {
        rows.splice(extraIndexes[index], 1);
    }
    rows[firstIndex] = {
        ...errorRow,
        index: firstIndex,
    };
    return true;
}
function buildDisplayRows(events, options = {}) {
    const rows = [];
    const streamingAssistants = new Map();
    const userRowsByTurn = new Map();
    const assistantRowsByTurn = new Map();
    const supersededTurnRefs = new Set();
    for (const event of events) {
        if (event.type === 'turn_superseded') {
            const turnRef = normalizedTurnRef(event.turnRef);
            if (turnRef) {
                supersededTurnRefs.add(turnRef);
                streamingAssistants.delete(`${event.conversationRef}:${turnRef}`);
            }
            continue;
        }
        const eventTurnRef = normalizedTurnRef(event.turnRef);
        if (eventTurnRef && supersededTurnRefs.has(eventTurnRef)) {
            continue;
        }
        if (event.type === 'user_message_metadata') {
            const key = userMetadataKey(event);
            const rowIndex = key ? userRowsByTurn.get(key) : undefined;
            const row = typeof rowIndex === 'number' ? rows[rowIndex] : null;
            if (row?.type === 'user_message') {
                rows[rowIndex] = applyLiveAttachmentsToUserRow(mergeUserMessageMetadata(row, event), options);
            }
            continue;
        }
        if (event.type === 'assistant_delta' || event.type === 'reasoning_delta') {
            const key = streamingAssistantKey(event);
            const current = streamingAssistants.get(key) ?? {
                rowIndex: null,
                rowId: null,
                assistantText: '',
                reasoningText: null,
                eventIds: [],
            };
            const text = textFromPayload(event.payload);
            const assistantText = event.type === 'assistant_delta'
                ? `${current.assistantText}${text}`
                : current.assistantText;
            const reasoningText = event.type === 'reasoning_delta'
                ? `${current.reasoningText ?? ''}${text}`
                : current.reasoningText;
            const rowIndex = current.rowIndex
                ?? (assistantText ? rows.length : null);
            const rowId = current.rowId
                ?? (assistantText ? assistantDisplayRowIdForSegment(event, assistantRowsByTurn) : null);
            const nextState = {
                rowIndex,
                rowId,
                assistantText,
                reasoningText,
                eventIds: [...current.eventIds, event.eventId],
            };
            streamingAssistants.set(key, nextState);
            if (nextState.rowIndex === null || nextState.rowId === null) {
                continue;
            }
            const row = buildStreamingAssistantRow(event, nextState.rowIndex, nextState.rowId, nextState.assistantText, nextState.reasoningText, nextState.eventIds);
            if (nextState.rowIndex === rows.length) {
                rows.push(row);
            }
            else {
                rows[nextState.rowIndex] = row;
            }
            continue;
        }
        if (event.type === 'assistant_message') {
            const key = streamingAssistantKey(event);
            const streamingState = streamingAssistants.get(key);
            if (streamingState) {
                const rowIndex = streamingState.rowIndex ?? rows.length;
                const rowId = streamingState.rowId ?? assistantDisplayRowIdForSegment(event, assistantRowsByTurn);
                rows[rowIndex] = buildFinalAssistantRow(event, rowIndex, rowId, streamingState);
                streamingAssistants.delete(key);
                recordAssistantDisplayRow(event, assistantRowsByTurn);
                continue;
            }
            const row = displayRowFromEvent(event, rows.length);
            if (row) {
                rows.push({
                    ...row,
                    id: assistantDisplayRowIdForSegment(event, assistantRowsByTurn),
                });
                recordAssistantDisplayRow(event, assistantRowsByTurn);
            }
            continue;
        }
        if (event.type === 'turn_error' || event.type === 'runtime_error') {
            if (event.type === 'turn_error' && shouldIgnoreCurrentTurnError(event.payload)) {
                continue;
            }
            const key = streamingAssistantKey(event);
            if (key) {
                streamingAssistants.delete(key);
            }
            const errorRow = displayRowFromEvent(event, rows.length);
            if (errorRow) {
                if (!replaceAssistantRowsForTurnWithError(rows, event, errorRow)) {
                    rows.push(errorRow);
                }
            }
            continue;
        }
        const row = displayRowFromEvent(event, rows.length);
        if (row) {
            rows.push(row);
            if (row.type === 'user_message') {
                rows[rows.length - 1] = applyLiveAttachmentsToUserRow(row, options);
                const key = userMetadataKey(event);
                if (key) {
                    userRowsByTurn.set(key, rows.length - 1);
                }
            }
        }
    }
    return rows;
}
function userMetadataKey(event) {
    if (event.turnRef) {
        return `${event.conversationRef}:${event.turnRef}`;
    }
    return null;
}
function statusFromToolPayload(payload) {
    if (typeof payload.status === 'string') {
        return payload.status;
    }
    if (typeof payload.success === 'boolean') {
        return payload.success ? 'success' : 'error';
    }
    if (typeof payload.error === 'string' && payload.error.length > 0) {
        return 'error';
    }
    return null;
}
function numberField(record, ...keys) {
    for (const key of keys) {
        const value = record?.[key];
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
    }
    return null;
}
function toolArgumentsFromPayload(payload, modelFacingToolCall) {
    const structuredPayload = structuredPayloadFrom(payload);
    return (0, toolOutputContent_js_1.recordFromUnknown)(modelFacingToolCall?.arguments)
        ?? (0, toolOutputContent_js_1.recordFromUnknown)(payload.args)
        ?? (0, toolOutputContent_js_1.recordFromUnknown)(payload.parameters)
        ?? (0, toolOutputContent_js_1.recordFromUnknown)(structuredPayload?.parameters)
        ?? null;
}
function toolMetadataFromPayload(payload) {
    const structuredPayload = structuredPayloadFrom(payload);
    return (0, toolOutputContent_js_1.recordFromUnknown)(structuredPayload?.metadata)
        ?? (0, toolOutputContent_js_1.recordFromUnknown)(payload.metadata)
        ?? null;
}
function toolDisplayMetadataFromMetadata(metadata) {
    if (!metadata) {
        return null;
    }
    const displayMetadata = { ...metadata };
    delete displayMetadata.model_facing_tool_call;
    return Object.keys(displayMetadata).length > 0 ? displayMetadata : null;
}
function toolExecutionSkippedFromMetadata(metadata) {
    return metadata?.skip_local_execution === true;
}
function toolRecoveryFieldsFromMetadata(metadata) {
    return {
        toolCallValidationFailed: metadata?.llm_tool_call_validation_failed === true,
        rawToolCallPreview: (0, toolOutputContent_js_1.stringField)(metadata, 'llm_tool_call_raw_tool_call_preview'),
        rawArgumentsPreview: (0, toolOutputContent_js_1.stringField)(metadata, 'llm_tool_call_raw_arguments_preview'),
        parseError: (0, toolOutputContent_js_1.stringField)(metadata, 'llm_tool_call_parse_error'),
    };
}
function bundleToolCallsFromPayload(payload) {
    const structuredPayload = structuredPayloadFrom(payload);
    const rawTools = Array.isArray(structuredPayload?.tools)
        ? structuredPayload.tools
        : (Array.isArray(payload.tools) ? payload.tools : null);
    if (!rawTools) {
        return null;
    }
    const toolCalls = rawTools
        .map((item) => {
        const tool = (0, toolOutputContent_js_1.recordFromUnknown)(item);
        if (!tool) {
            return null;
        }
        const metadata = (0, toolOutputContent_js_1.recordFromUnknown)(tool.metadata);
        const modelFacing = (0, toolOutputContent_js_1.recordFromUnknown)(metadata?.model_facing_tool_call);
        const argumentsValue = (0, toolOutputContent_js_1.recordFromUnknown)(tool.args)
            ?? (0, toolOutputContent_js_1.recordFromUnknown)(tool.arguments)
            ?? {};
        if (modelFacing) {
            return {
                ...modelFacing,
                ...((0, toolOutputContent_js_1.recordFromUnknown)(modelFacing.arguments) ? {} : { arguments: argumentsValue }),
            };
        }
        const name = (0, toolOutputContent_js_1.stringField)(tool, 'name', 'toolName', 'tool_name');
        return {
            ...(name ? { name } : {}),
            arguments: argumentsValue,
        };
    })
        .filter((tool) => Boolean(tool && Object.keys(tool).length > 0));
    return toolCalls.length > 0 ? toolCalls : null;
}
function currentTurnToolEventFrom(event) {
    if (event.type !== 'tool_call'
        && event.type !== 'tool_bundle_call'
        && event.type !== 'tool_progress'
        && event.type !== 'tool_output'
        && event.type !== 'tool_bundle_output') {
        return null;
    }
    const kind = event.type === 'tool_progress'
        ? 'tool_progress'
        : (event.type === 'tool_output' || event.type === 'tool_bundle_output' ? 'tool_output' : 'tool_call');
    const toolName = toolNameFromPayload(event.payload)
        ?? (event.type === 'tool_bundle_call' || event.type === 'tool_bundle_output' ? 'tool_bundle' : null);
    const outputText = event.type === 'tool_output' || event.type === 'tool_bundle_output'
        ? (event.type === 'tool_bundle_output' ? bundleDisplayTextFromPayload(event.payload) : displayTextFromPayload(event.payload))
        : textFromPayload(event.payload);
    const structuredPayload = structuredPayloadFrom(event.payload);
    const modelFacingToolCall = event.type === 'tool_call'
        ? modelFacingToolCallFromPayload(event.payload)
        : null;
    const toolMetadata = toolMetadataFromPayload(event.payload);
    const recoveryFields = toolRecoveryFieldsFromMetadata(toolMetadata);
    const success = typeof event.payload.success === 'boolean' ? event.payload.success : null;
    const attachments = displayAttachmentsField(event.payload, 'attachments', 'display_attachments')
        ?? (0, legacyVisualAttachmentReplayAdapter_js_1.legacyVisualAttachmentReplayAdapter)(event);
    return {
        id: event.eventId,
        kind,
        toolName,
        requestId: (0, toolOutputContent_js_1.stringField)(event.payload, 'requestId'),
        correlationId: (0, toolOutputContent_js_1.stringField)(event.payload, 'correlationId'),
        bundleId: (0, toolOutputContent_js_1.stringField)(event.payload, 'bundleId'),
        modelFacingToolCall,
        toolCalls: event.type === 'tool_bundle_call' ? bundleToolCallsFromPayload(event.payload) : null,
        toolArguments: toolArgumentsFromPayload(event.payload, modelFacingToolCall),
        toolCallDetails: structuredPayload ?? event.payload,
        toolOutputDetails: structuredPayload ?? event.payload,
        toolMetadata,
        toolDisplayMetadata: toolDisplayMetadataFromMetadata(toolMetadata),
        attachments,
        ...recoveryFields,
        screenshot: (0, toolOutputContent_js_1.stringField)(event.payload, 'screenshot', 'image'),
        screenshotRef: (0, toolOutputContent_js_1.stringField)(event.payload, 'screenshotRef', 'screenshot_ref'),
        screenshotUrl: (0, toolOutputContent_js_1.stringField)(event.payload, 'screenshotUrl', 'screenshot_url'),
        screenshotContentType: (0, toolOutputContent_js_1.stringField)(event.payload, 'screenshotContentType', 'screenshot_content_type'),
        executionTime: numberField(event.payload, 'executionTime', 'execution_time')
            ?? numberField(structuredPayload, 'executionTime', 'execution_time'),
        ...(outputText ? { text: outputText } : {}),
        status: statusFromToolPayload(event.payload),
        success,
        executionSkipped: toolExecutionSkippedFromMetadata(toolMetadata),
        payload: event.payload,
    };
}
function emptyCurrentTurnProjection(conversationRef, turnRef = null) {
    const projection = {
        conversationRef,
        turnRef,
        phase: turnRef ? 'awaiting' : 'idle',
        userMessageRowId: null,
        assistantText: '',
        reasoningText: null,
        toolEvents: [],
        lastError: null,
    };
    return withLiveTurnPresentation(projection);
}
function normalizedTurnRef(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function resetCurrentTurnIfNeeded(current, event) {
    if (isConversationControlProjectionEvent(event)) {
        return current;
    }
    if (!event.turnRef || current.turnRef === event.turnRef) {
        return current;
    }
    return emptyCurrentTurnProjection(event.conversationRef, event.turnRef);
}
function appendText(current, next) {
    if (!next) {
        return current;
    }
    return `${current}${next}`;
}
function appendNullableText(current, next) {
    if (!next) {
        return current;
    }
    return `${current ?? ''}${next}`;
}
function advanceCurrentTurnPhase(current, phase) {
    if (current.phase === phase) {
        return current;
    }
    return { ...current, phase };
}
function visibleText(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? value : null;
}
function toolCallDisplayPreview(toolEvent) {
    if (toolEvent.kind !== 'tool_call') {
        return null;
    }
    if (toolEvent.toolCallValidationFailed === true) {
        const rawPreview = visibleText(toolEvent.rawToolCallPreview);
        if (rawPreview) {
            return rawPreview;
        }
    }
    const modelFacingToolCall = (0, toolOutputContent_js_1.recordFromUnknown)(toolEvent.modelFacingToolCall) ?? {};
    const argumentsValue = (0, toolOutputContent_js_1.recordFromUnknown)(modelFacingToolCall.arguments)
        ?? (0, toolOutputContent_js_1.recordFromUnknown)(modelFacingToolCall.args)
        ?? (0, toolOutputContent_js_1.recordFromUnknown)(toolEvent.toolArguments);
    const metadata = (0, toolOutputContent_js_1.recordFromUnknown)(toolEvent.toolDisplayMetadata);
    const id = (0, toolOutputContent_js_1.stringField)(modelFacingToolCall, 'id') ?? visibleText(toolEvent.requestId ?? null);
    const name = (0, toolOutputContent_js_1.stringField)(modelFacingToolCall, 'name') ?? visibleText(toolEvent.toolName ?? null);
    const thoughtSignature = (0, toolOutputContent_js_1.stringField)(modelFacingToolCall, 'thought_signature', 'thoughtSignature')
        ?? (metadata ? (0, toolOutputContent_js_1.stringField)(metadata, 'thought_signature', 'thoughtSignature') : null);
    const preview = {};
    if (id) {
        preview.id = id;
    }
    if (name) {
        preview.name = name;
    }
    if (argumentsValue
        && (toolEvent.toolCallValidationFailed !== true || Object.keys(argumentsValue).length > 0)) {
        preview.arguments = argumentsValue;
    }
    if (metadata && Object.keys(metadata).length > 0) {
        preview.metadata = metadata;
    }
    if (thoughtSignature) {
        preview.thought_signature = thoughtSignature;
    }
    const rawToolCallPreview = visibleText(toolEvent.rawToolCallPreview);
    if (rawToolCallPreview) {
        preview.raw_tool_call_preview = rawToolCallPreview;
    }
    const rawArgumentsPreview = visibleText(toolEvent.rawArgumentsPreview);
    if (rawArgumentsPreview) {
        preview.raw_arguments_preview = rawArgumentsPreview;
    }
    const parseError = visibleText(toolEvent.parseError);
    if (parseError) {
        preview.parse_error = parseError;
    }
    if (toolEvent.executionSkipped === true) {
        preview.execution_skipped = true;
    }
    return Object.keys(preview).length > 0 ? JSON.stringify(preview, null, 2) : null;
}
function toolEntryText(toolEvent) {
    const text = visibleText(toolEvent.text);
    if (text) {
        return text;
    }
    const toolName = visibleText(toolEvent.toolName ?? null);
    if (toolEvent.kind === 'tool_output') {
        return toolName ? `${toolName} completed` : 'Tool completed';
    }
    if (toolEvent.kind === 'tool_progress') {
        return toolName ? `${toolName} is running` : 'Tool is running';
    }
    const toolCallPreview = toolCallDisplayPreview(toolEvent);
    if (toolCallPreview) {
        return toolCallPreview;
    }
    return toolName ? `Using ${toolName}` : 'Using tool';
}
function toolEntryType(toolEvent) {
    if (toolEvent.kind === 'tool_output') {
        return 'tool-output';
    }
    if (toolEvent.kind === 'tool_progress') {
        return 'tool-progress';
    }
    return 'tool-call';
}
function buildLiveTurnPresentation(projection) {
    const baseId = `${projection.conversationRef || 'conversation'}:${projection.turnRef || 'turn'}`;
    const entries = [];
    const reasoningText = visibleText(projection.reasoningText);
    if (reasoningText) {
        entries.push({
            id: `${baseId}:thinking`,
            type: 'thinking',
            text: reasoningText,
            sourceEventType: 'reasoning_delta',
            sourceChannel: SDK_CURRENT_TURN_SOURCE_CHANNEL,
            turnRef: projection.turnRef,
        });
    }
    projection.toolEvents.forEach((toolEvent, index) => {
        entries.push({
            id: `${baseId}:tool:${toolEvent.id || index}`,
            type: toolEntryType(toolEvent),
            text: toolEntryText(toolEvent),
            sourceEventType: toolEvent.kind,
            sourceChannel: SDK_CURRENT_TURN_SOURCE_CHANNEL,
            turnRef: projection.turnRef,
            toolName: toolEvent.toolName ?? null,
            requestId: toolEvent.requestId ?? null,
            correlationId: toolEvent.correlationId ?? null,
            bundleId: toolEvent.bundleId ?? null,
            modelFacingToolCall: toolEvent.modelFacingToolCall ?? null,
            toolCalls: toolEvent.toolCalls ?? null,
            toolArguments: toolEvent.toolArguments ?? null,
            toolCallDetails: toolEvent.toolCallDetails ?? null,
            toolOutputDetails: toolEvent.toolOutputDetails ?? null,
            toolMetadata: toolEvent.toolMetadata ?? null,
            toolDisplayMetadata: toolEvent.toolDisplayMetadata ?? null,
            attachments: toolEvent.attachments ?? null,
            toolCallValidationFailed: toolEvent.toolCallValidationFailed ?? null,
            rawToolCallPreview: toolEvent.rawToolCallPreview ?? null,
            rawArgumentsPreview: toolEvent.rawArgumentsPreview ?? null,
            parseError: toolEvent.parseError ?? null,
            screenshot: toolEvent.screenshot ?? null,
            screenshotRef: toolEvent.screenshotRef ?? null,
            screenshotUrl: toolEvent.screenshotUrl ?? null,
            screenshotContentType: toolEvent.screenshotContentType ?? null,
            executionTime: toolEvent.executionTime ?? null,
            success: toolEvent.success ?? null,
            executionSkipped: toolEvent.executionSkipped ?? null,
            payload: toolEvent.payload,
        });
    });
    const assistantText = visibleText(projection.assistantText);
    if (assistantText) {
        entries.push({
            id: `${baseId}:assistant`,
            type: 'llm-text',
            text: assistantText,
            sourceEventType: 'assistant_delta',
            sourceChannel: SDK_CURRENT_TURN_SOURCE_CHANNEL,
            turnRef: projection.turnRef,
            isComplete: projection.phase === 'complete',
        });
    }
    const errorText = visibleText(projection.lastError);
    if (errorText) {
        entries.push({
            id: `${baseId}:error`,
            type: 'error',
            text: errorText,
            sourceEventType: 'runtime_error',
            sourceChannel: SDK_CURRENT_TURN_SOURCE_CHANNEL,
            turnRef: projection.turnRef,
            isComplete: true,
        });
    }
    const activePhases = new Set([
        'awaiting',
        'streaming',
        'tool_call',
        'tool_output',
    ]);
    const terminalPhases = new Set([
        'complete',
        'error',
    ]);
    const hasVisibleContent = entries.length > 0;
    const isBusy = activePhases.has(projection.phase);
    const typingVisible = projection.phase === 'awaiting' && !hasVisibleContent;
    const overlayIntentMode = hasVisibleContent ? 'response' : (typingVisible ? 'awaiting' : 'hidden');
    const overlayVisible = overlayIntentMode !== 'hidden';
    return {
        conversationRef: projection.conversationRef,
        turnRef: projection.turnRef,
        phase: projection.phase,
        entries,
        hasVisibleContent,
        typingVisible,
        overlayVisible,
        isBusy,
        isTerminal: terminalPhases.has(projection.phase),
        lastError: projection.lastError,
        awaitingAnchor: typingVisible && projection.userMessageRowId
            ? {
                kind: 'user-message',
                rowId: projection.userMessageRowId,
                turnRef: projection.turnRef,
                conversationRef: projection.conversationRef,
            }
            : null,
        overlayIntent: {
            visible: overlayVisible,
            mode: overlayIntentMode,
            turnRef: projection.turnRef,
            conversationRef: projection.conversationRef,
            staleGuardRef: projection.turnRef,
        },
    };
}
function withLiveTurnPresentation(projection) {
    return {
        ...projection,
        presentation: buildLiveTurnPresentation(projection),
    };
}
function buildCurrentTurnProjection(events) {
    let projection = emptyCurrentTurnProjection(events[0]?.conversationRef ?? '');
    const supersededTurnRefs = new Set();
    for (const event of events) {
        if (event.type === 'turn_superseded') {
            const supersededTurnRef = normalizedTurnRef(event.turnRef);
            if (supersededTurnRef) {
                supersededTurnRefs.add(supersededTurnRef);
            }
            if (supersededTurnRef && projection.turnRef === supersededTurnRef) {
                projection = {
                    ...projection,
                    phase: 'complete',
                    lastError: null,
                };
            }
            continue;
        }
        const turnRef = normalizedTurnRef(event.turnRef);
        if (turnRef && supersededTurnRefs.has(turnRef)) {
            continue;
        }
        projection = resetCurrentTurnIfNeeded(projection, event);
        if (!projection.conversationRef) {
            projection = { ...projection, conversationRef: event.conversationRef };
        }
        if (isConversationControlProjectionEvent(event)) {
            continue;
        }
        if (!projection.turnRef && event.turnRef) {
            projection = { ...projection, turnRef: event.turnRef };
        }
        if (event.type === 'turn_started' || event.type === 'user_message') {
            const nextProjection = advanceCurrentTurnPhase(projection, 'awaiting');
            projection = event.type === 'user_message'
                ? {
                    ...nextProjection,
                    userMessageRowId: displayRowId(event, 0),
                }
                : nextProjection;
            continue;
        }
        if (event.type === 'reasoning_delta') {
            projection = {
                ...advanceCurrentTurnPhase(projection, projection.phase === 'idle' ? 'awaiting' : projection.phase),
                reasoningText: appendNullableText(projection.reasoningText, textFromPayload(event.payload)),
            };
            continue;
        }
        if (event.type === 'assistant_delta') {
            projection = {
                ...projection,
                phase: 'streaming',
                assistantText: appendText(projection.assistantText, textFromPayload(event.payload)),
            };
            continue;
        }
        if (event.type === 'assistant_message') {
            const text = textFromPayload(event.payload);
            projection = {
                ...projection,
                phase: text ? 'streaming' : projection.phase,
                assistantText: text || projection.assistantText,
            };
            continue;
        }
        const toolEvent = currentTurnToolEventFrom(event);
        if (toolEvent) {
            projection = {
                ...projection,
                phase: toolEvent.kind === 'tool_output' ? 'tool_output' : 'tool_call',
                toolEvents: [...projection.toolEvents, toolEvent],
            };
            continue;
        }
        if (event.type === 'turn_completed') {
            const finalResponse = textFromPayload(event.payload);
            projection = {
                ...projection,
                phase: 'complete',
                assistantText: projection.assistantText || finalResponse,
                lastError: null,
            };
            continue;
        }
        if (event.type === 'turn_stopped') {
            projection = {
                ...projection,
                phase: 'complete',
                lastError: null,
            };
            continue;
        }
        if (event.type === 'turn_error' || event.type === 'runtime_error') {
            if (shouldIgnoreCurrentTurnError(event.payload)) {
                continue;
            }
            projection = {
                ...projection,
                phase: 'error',
                assistantText: '',
                lastError: textFromPayload(event.payload) || 'Unknown runtime error',
            };
        }
    }
    return withLiveTurnPresentation(projection);
}
function isInternalConversationLane(conversationRef) {
    return typeof conversationRef === 'string' && conversationRef.startsWith('conv-agent-');
}
function rowRevisionId(row) {
    const revisionId = row.metadata?.revisionId;
    return typeof revisionId === 'string' && revisionId.trim() ? revisionId.trim() : null;
}
function stableEditTargetRowId(row) {
    const replacedDisplayRowId = row.metadata?.replacedDisplayRowId;
    return typeof replacedDisplayRowId === 'string' && replacedDisplayRowId.trim()
        ? replacedDisplayRowId.trim()
        : row.id;
}
function withConversationViewRowActions(row) {
    if (row.type === 'user_message') {
        return {
            ...row,
            actions: {
                ...(row.actions ?? {}),
                canEdit: true,
                editTargetRowId: stableEditTargetRowId(row),
            },
        };
    }
    if (row.type === 'assistant_message') {
        return {
            ...row,
            actions: {
                ...(row.actions ?? {}),
                canRetry: row.isStreaming !== true,
                retryTargetRowId: row.id,
            },
        };
    }
    if (row.type === 'error') {
        return {
            ...row,
            actions: {
                ...(row.actions ?? {}),
                canRetry: true,
                retryTargetRowId: row.id,
            },
        };
    }
    return row;
}
function resolveConversationViewConversationRef(input) {
    const candidates = [
        input.conversationRef,
        input.state?.conversationRef,
        input.displayRows?.find(row => !isInternalConversationLane(row.conversationRef))?.conversationRef,
        input.events?.find(event => !isInternalConversationLane(event.conversationRef))?.conversationRef,
        input.currentTurn && !isInternalConversationLane(input.currentTurn.conversationRef)
            ? input.currentTurn.conversationRef
            : null,
        input.currentTurn?.conversationRef,
    ];
    return candidates.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim() ?? '';
}
function resolveConversationViewRevisionId(input, displayRows) {
    const displayRevision = [...displayRows].reverse().map(rowRevisionId).find(Boolean);
    const candidates = [
        input.revisionId,
        input.state?.revisionId,
        displayRevision,
        input.events?.[input.events.length - 1]?.revisionId,
    ];
    return candidates.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim() ?? null;
}
function userFacingEventsForView(events, conversationRef, revisionId = null) {
    return events.filter(event => (event.conversationRef === conversationRef
        && !isInternalConversationLane(event.conversationRef)
        && (!revisionId || event.revisionId === revisionId)));
}
function currentTurnForView(input, conversationRef, revisionId) {
    const events = input.events ?? [];
    const currentTurn = input.currentTurn ?? null;
    const userFacingEvents = userFacingEventsForView(events, conversationRef, revisionId);
    if (userFacingEvents.length > 0) {
        return buildCurrentTurnProjection(userFacingEvents);
    }
    if (!revisionId
        && currentTurn
        && currentTurn.conversationRef === conversationRef
        && !isInternalConversationLane(currentTurn.conversationRef)) {
        return currentTurn;
    }
    return emptyCurrentTurnProjection(conversationRef);
}
function conversationViewLiveTurnPhase(phase) {
    if (phase === 'tool_call' || phase === 'tool_output') {
        return 'tool';
    }
    return phase;
}
function responseOverlayModeFromPresentation(presentation) {
    if (presentation.overlayIntent.mode === 'response') {
        return 'response';
    }
    if (presentation.overlayIntent.mode === 'awaiting') {
        return 'typing';
    }
    return 'hidden';
}
function latestEventRef(events, predicate = () => true) {
    const event = [...events].reverse().find(predicate);
    return event?.eventId ?? null;
}
function modelHistoryCheckpointIdFromEvents(events, revisionId) {
    const event = [...events].reverse().find(candidate => (candidate.type === 'model_history_updated'
        && (!revisionId || candidate.revisionId === revisionId)));
    return (0, toolOutputContent_js_1.stringField)(event?.payload ?? {}, 'checkpointId', 'checkpoint_id');
}
function liveToolEntryTypeMatchesDisplayRow(entry, row) {
    if (entry.type === 'tool-call') {
        return row.type === 'tool_call' || row.type === 'tool_bundle_call';
    }
    if (entry.type === 'tool-output') {
        return row.type === 'tool_output' || row.type === 'tool_bundle_output';
    }
    if (entry.type === 'tool-progress') {
        return row.type === 'tool_progress';
    }
    return false;
}
function identityFromToolRecord(record) {
    const metadata = (0, toolOutputContent_js_1.recordFromUnknown)(record?.metadata);
    return (0, toolOutputContent_js_1.stringField)(record, 'toolCallId', 'tool_call_id', 'id', 'requestId', 'request_id', 'bundleId', 'bundle_id', 'displayCorrelationId', 'correlationId', 'correlation_id') ?? (0, toolOutputContent_js_1.stringField)(metadata, 'toolCallId', 'tool_call_id', 'requestId', 'request_id', 'bundleId', 'bundle_id', 'displayCorrelationId', 'correlationId', 'correlation_id');
}
function liveToolEntryIdentity(entry) {
    return (0, toolOutputContent_js_1.stringField)(entry, 'correlationId', 'requestId', 'bundleId')
        ?? identityFromToolRecord((0, toolOutputContent_js_1.recordFromUnknown)(entry.toolCallDetails))
        ?? identityFromToolRecord((0, toolOutputContent_js_1.recordFromUnknown)(entry.toolOutputDetails))
        ?? identityFromToolRecord((0, toolOutputContent_js_1.recordFromUnknown)(entry.modelFacingToolCall));
}
function displayRowToolIdentity(row) {
    const metadata = row.metadata ?? {};
    return (0, toolOutputContent_js_1.stringField)(metadata, 'displayCorrelationId', 'toolCallId', 'tool_call_id', 'requestId', 'request_id', 'bundleId', 'bundle_id', 'correlationId', 'correlation_id', 'eventId')
        ?? identityFromToolRecord((0, toolOutputContent_js_1.recordFromUnknown)(metadata.toolCallDetails))
        ?? identityFromToolRecord((0, toolOutputContent_js_1.recordFromUnknown)(metadata.toolOutputDetails))
        ?? identityFromToolRecord((0, toolOutputContent_js_1.recordFromUnknown)(metadata.modelFacingToolCall))
        ?? identityFromToolRecord((0, toolOutputContent_js_1.recordFromUnknown)(row.content));
}
function displayRowMaterializesLiveToolEntry(row, entry) {
    if (!liveToolEntryTypeMatchesDisplayRow(entry, row)) {
        return false;
    }
    if (entry.turnRef && row.turnRef && entry.turnRef !== row.turnRef) {
        return false;
    }
    const entryIdentity = liveToolEntryIdentity(entry);
    return Boolean(entryIdentity && displayRowToolIdentity(row) === entryIdentity);
}
function filterMaterializedLiveTurnEntries(entries, displayRows) {
    return entries.filter(entry => ((entry.type !== 'tool-call'
        && entry.type !== 'tool-output'
        && entry.type !== 'tool-progress')
        || !displayRows.some(row => displayRowMaterializesLiveToolEntry(row, entry))));
}
function buildConversationView(input) {
    const conversationRef = resolveConversationViewConversationRef(input);
    const displayRows = (input.displayRows ?? []).filter(row => (row.conversationRef === conversationRef
        && !isInternalConversationLane(row.conversationRef))).map(withConversationViewRowActions);
    const revisionId = resolveConversationViewRevisionId(input, displayRows);
    const currentTurn = currentTurnForView(input, conversationRef, revisionId);
    const livePhase = conversationViewLiveTurnPhase(currentTurn.phase);
    const presentation = currentTurn.presentation;
    const liveTurnEntries = filterMaterializedLiveTurnEntries(presentation.entries, displayRows);
    const responseOverlayMode = responseOverlayModeFromPresentation(presentation);
    const isBusy = presentation.isBusy;
    return {
        conversationRef,
        revisionId,
        displayRows,
        liveTurn: {
            turnRef: currentTurn.turnRef,
            phase: livePhase,
            entries: liveTurnEntries,
            isBusy,
            isTerminal: presentation.isTerminal,
            canStop: isBusy && Boolean(currentTurn.turnRef),
            lastError: currentTurn.lastError,
        },
        surfaces: {
            pill: {
                mode: isBusy ? 'busy' : 'idle',
            },
            dashboard: {
                mode: isBusy ? 'busy' : 'idle',
            },
            responseOverlay: {
                mode: responseOverlayMode,
                visible: responseOverlayMode !== 'hidden',
                guardRef: presentation.overlayIntent.staleGuardRef,
                ownerConversationRef: conversationRef,
                turnRef: currentTurn.turnRef,
            },
        },
        actions: {
            canEdit: displayRows.some(row => row.actions?.canEdit === true),
            canRetry: presentation.isTerminal && displayRows.some(row => row.actions?.canRetry === true),
            canFork: displayRows.length > 0,
        },
    };
}
function buildConversationViewBuildDiagnostics(input) {
    const view = input.view ?? buildConversationView(input);
    const events = input.events ?? [];
    const modelHistoryCheckpointId = input.modelHistoryCheckpoint?.checkpointId
        ?? modelHistoryCheckpointIdFromEvents(events, view.revisionId);
    return {
        activeRevisionId: view.revisionId,
        displayRowCount: view.displayRows.length,
        liveTurnRef: view.liveTurn.turnRef,
        liveTurnPhase: view.liveTurn.phase,
        responseOverlayMode: view.surfaces.responseOverlay.mode,
        responseOverlayGuardRef: view.surfaces.responseOverlay.guardRef,
        pendingTurnRef: input.pendingTurnRef ?? null,
        supersededTurnCount: events.filter(event => event.type === 'turn_superseded').length,
        filteredInternalLaneCount: events.filter(event => isInternalConversationLane(event.conversationRef)).length,
        modelHistoryCheckpointId,
        lastEventRef: latestEventRef(events),
        lastSdkEventRef: latestEventRef(events, event => event.source === 'sdk'),
        lastBackendEventRef: latestEventRef(events, event => event.source === 'backend'),
    };
}
function toolOutputDedupeKey(event) {
    if (event.type !== 'tool_output' && event.type !== 'tool_bundle_output') {
        return null;
    }
    return (0, toolCorrelationIds_js_1.resolveToolOutputDedupeKey)(event.payload);
}
function toolPairKeys(event) {
    if (event.type === 'tool_bundle_call' || event.type === 'tool_bundle_output') {
        return (0, toolCorrelationIds_js_1.resolveToolPairKeys)(event.payload, { bundle: true });
    }
    if (event.type === 'tool_call' || event.type === 'tool_output') {
        return (0, toolCorrelationIds_js_1.resolveToolPairKeys)(event.payload);
    }
    return [];
}
function isToolCallEvent(event) {
    return event.type === 'tool_call' || event.type === 'tool_bundle_call';
}
function isToolOutputEvent(event) {
    return event.type === 'tool_output' || event.type === 'tool_bundle_output';
}
function toolCallsFromPayload(payload) {
    if (Array.isArray(payload.toolCalls)) {
        return payload.toolCalls;
    }
    if (Array.isArray(payload.tool_calls)) {
        return payload.tool_calls;
    }
    const structuredPayload = (0, toolOutputContent_js_1.recordFromUnknown)(payload.structuredPayload);
    if (Array.isArray(structuredPayload?.toolCalls)) {
        return structuredPayload.toolCalls;
    }
    if (Array.isArray(structuredPayload?.tool_calls)) {
        return structuredPayload.tool_calls;
    }
    const tools = Array.isArray(payload.tools)
        ? payload.tools
        : (Array.isArray(structuredPayload?.tools) ? structuredPayload.tools : null);
    if (!tools) {
        return null;
    }
    const toolCalls = tools
        .map(tool => {
        const record = (0, toolOutputContent_js_1.recordFromUnknown)(tool);
        const metadata = (0, toolOutputContent_js_1.recordFromUnknown)(record?.metadata);
        return (0, toolOutputContent_js_1.recordFromUnknown)(metadata?.model_facing_tool_call)
            ?? (0, toolOutputContent_js_1.recordFromUnknown)(record?.model_facing_tool_call);
    })
        .filter((toolCall) => Boolean(toolCall));
    return toolCalls.length > 0 ? toolCalls : null;
}
function structuredPayloadFrom(payload) {
    const structuredPayload = (0, toolOutputContent_js_1.recordFromUnknown)(payload.structuredPayload);
    return structuredPayload ? { ...structuredPayload } : null;
}
function withStructuredPayload(message, payload) {
    const structuredPayload = structuredPayloadFrom(payload);
    if (!structuredPayload) {
        return message;
    }
    return {
        ...message,
        structured_payload: structuredPayload,
    };
}
function stepOutputContent(step) {
    const output = step.output ?? step.result;
    if (typeof output === 'string') {
        return output;
    }
    const outputRecord = (0, toolOutputContent_js_1.recordFromUnknown)(output);
    if (outputRecord) {
        return (0, toolOutputContent_js_1.readBundleStepModelContent)({ output: outputRecord });
    }
    return JSON.stringify(step);
}
function bundleStepResultsFromPayload(payload) {
    const structuredPayload = structuredPayloadFrom(payload);
    const candidates = [
        payload.stepResults,
        payload.step_results,
        structuredPayload?.stepResults,
        structuredPayload?.step_results,
        structuredPayload?.results,
    ];
    for (const candidate of candidates) {
        if (!Array.isArray(candidate)) {
            continue;
        }
        return candidate
            .map(step => (0, toolOutputContent_js_1.recordFromUnknown)(step))
            .filter((step) => Boolean(step));
    }
    return [];
}
function bundleOutputMessages(event) {
    const bundleId = (0, toolOutputContent_js_1.stringField)(event.payload, 'bundleId', 'bundle_id');
    const structuredPayload = structuredPayloadFrom(event.payload);
    const steps = bundleStepResultsFromPayload(event.payload);
    if (steps.length === 0) {
        return [withStructuredPayload({
                role: 'tool',
                message_type: 'tool_output',
                content: contentFromPayload(event.payload),
                tool_name: 'tool_bundle',
            }, {
                structuredPayload: {
                    ...(structuredPayload ?? {}),
                    ...(bundleId ? { bundle_id: bundleId } : {}),
                },
            })];
    }
    return steps.map(step => {
        const toolCallId = (0, toolOutputContent_js_1.stringField)(step, 'toolCallId', 'tool_call_id', 'id');
        const toolName = (0, toolOutputContent_js_1.stringField)(step, 'toolName', 'tool_name', 'tool') ?? 'tool_bundle';
        return withStructuredPayload({
            role: 'tool',
            message_type: 'tool_output',
            content: stepOutputContent(step),
            tool_call_id: toolCallId,
            tool_name: toolName,
        }, {
            structuredPayload: {
                ...(structuredPayload ?? {}),
                ...(bundleId ? { bundle_id: bundleId } : {}),
                step_result: step,
            },
        });
    });
}
function withoutDuplicateToolOutputs(events) {
    const preferredOutputs = new Map();
    const prefers = (candidate, current) => {
        const candidateHasModelContent = (0, toolOutputContent_js_1.readToolOutputContent)(candidate.payload).hasModelContent;
        const currentHasModelContent = (0, toolOutputContent_js_1.readToolOutputContent)(current.payload).hasModelContent;
        if (candidateHasModelContent !== currentHasModelContent) {
            return candidateHasModelContent;
        }
        if (candidate.source === 'backend' && current.source !== 'backend') {
            return true;
        }
        if (candidate.source !== 'backend' && current.source === 'backend') {
            return false;
        }
        return false;
    };
    for (const event of events) {
        const key = toolOutputDedupeKey(event);
        if (!key) {
            continue;
        }
        const current = preferredOutputs.get(key);
        if (!current || prefers(event, current)) {
            preferredOutputs.set(key, event);
        }
    }
    return events.filter(event => {
        const key = toolOutputDedupeKey(event);
        if (!key) {
            return true;
        }
        return preferredOutputs.get(key) === event;
    });
}
function withoutDanglingToolPairs(events) {
    const callKeys = new Set();
    const outputKeys = new Set();
    for (const event of events) {
        const keys = toolPairKeys(event);
        if (keys.length === 0) {
            continue;
        }
        if (isToolCallEvent(event)) {
            keys.forEach(key => callKeys.add(key));
        }
        else if (isToolOutputEvent(event)) {
            keys.forEach(key => outputKeys.add(key));
        }
    }
    return events.filter(event => {
        if (isToolCallEvent(event)) {
            return toolPairKeys(event).some(key => outputKeys.has(key));
        }
        if (isToolOutputEvent(event)) {
            return toolPairKeys(event).some(key => callKeys.has(key));
        }
        return true;
    });
}
function withoutOrphanEmptyChatGreeting(events) {
    const hasUserMessage = events.some(event => event.type === 'user_message');
    if (hasUserMessage) {
        return events;
    }
    return events.filter(event => (event.type !== 'assistant_message'
        || textFromPayload(event.payload).trim() !== EMPTY_CHAT_GREETING_TEXT));
}
function withoutAssistantMessagesForErroredTurns(events) {
    const erroredTurnKeys = new Set();
    for (const event of events) {
        if ((event.type === 'turn_error' || event.type === 'runtime_error')
            && !(event.type === 'turn_error' && shouldIgnoreCurrentTurnError(event.payload))) {
            erroredTurnKeys.add(streamingAssistantKey(event));
        }
    }
    if (erroredTurnKeys.size === 0) {
        return events;
    }
    return events.filter(event => (event.type !== 'assistant_message'
        || !erroredTurnKeys.has(streamingAssistantKey(event))));
}
function withoutSupersededTurnLiveEvents(events) {
    const supersededTurnRefs = new Set();
    const filtered = [];
    for (const event of events) {
        if (event.type === 'turn_superseded') {
            const turnRef = normalizedTurnRef(event.turnRef);
            if (turnRef) {
                supersededTurnRefs.add(turnRef);
            }
            filtered.push(event);
            continue;
        }
        const turnRef = normalizedTurnRef(event.turnRef);
        if (turnRef && supersededTurnRefs.has(turnRef)) {
            continue;
        }
        filtered.push(event);
    }
    return filtered;
}
function isWebSearchToolName(toolName) {
    return (toolName ?? '').trim() === 'web_search';
}
function modelFacingToolNameFromPayload(payload) {
    const firstToolCall = (0, toolOutputContent_js_1.recordFromUnknown)(toolCallsFromPayload(payload)?.[0]);
    return (0, toolOutputContent_js_1.stringField)(firstToolCall, 'name', 'toolName', 'tool_name');
}
function isWebSearchToolPayload(payload) {
    return isWebSearchToolName(toolNameFromPayload(payload) ?? modelFacingToolNameFromPayload(payload));
}
function isNativeWebSearchProgressPayload(payload) {
    if (isWebSearchToolPayload(payload)) {
        return true;
    }
    if ((0, toolOutputContent_js_1.stringField)(payload, 'sourceEventType', 'source_event_type') === 'web-search-progress') {
        return true;
    }
    return false;
}
function progressGroupIdentity(event) {
    return (0, toolOutputContent_js_1.stringField)(event.payload, 'requestId', 'request_id', 'correlationId', 'correlation_id');
}
function nativeWebSearchProgressGroupKey(event) {
    const identity = progressGroupIdentity(event);
    if (identity) {
        return `${event.conversationRef}:${event.turnRef ?? 'no-turn'}:${identity}`;
    }
    if (event.turnRef) {
        return `${event.conversationRef}:${event.turnRef}:native-web-search`;
    }
    return `${event.conversationRef}:${event.eventId}:native-web-search`;
}
function realWebSearchPairGroupKeys(events) {
    const callGroups = new Set();
    const outputGroups = new Set();
    for (const event of events) {
        if ((event.type !== 'tool_call' && event.type !== 'tool_output')
            || !isWebSearchToolPayload(event.payload)) {
            continue;
        }
        const groupKey = nativeWebSearchProgressGroupKey(event);
        if (event.type === 'tool_call') {
            callGroups.add(groupKey);
        }
        else {
            outputGroups.add(groupKey);
        }
    }
    const pairGroups = new Set();
    for (const groupKey of callGroups) {
        if (outputGroups.has(groupKey)) {
            pairGroups.add(groupKey);
        }
    }
    return pairGroups;
}
function nativeWebSearchProgressEntry(event) {
    if (event.type !== 'tool_progress') {
        return null;
    }
    if (!isNativeWebSearchProgressPayload(event.payload)) {
        return null;
    }
    const text = textFromPayload(event.payload).trim();
    if (!text) {
        return null;
    }
    return {
        eventId: event.eventId,
        text,
        query: (0, toolOutputContent_js_1.stringField)(event.payload, 'query'),
        url: (0, toolOutputContent_js_1.stringField)(event.payload, 'url'),
        pattern: (0, toolOutputContent_js_1.stringField)(event.payload, 'pattern'),
        actionType: (0, toolOutputContent_js_1.stringField)(event.payload, 'actionType', 'action_type'),
    };
}
function nativeWebSearchToolCallId(group) {
    return [
        'native-web-search',
        group.turnRef ?? group.requestId ?? group.entries[0]?.eventId ?? 'progress',
        group.requestId ?? group.correlationId ?? 'trace',
    ].join(':');
}
function nativeWebSearchQuery(group) {
    const explicitQuery = group.entries.find(entry => entry.query)?.query;
    if (explicitQuery) {
        return explicitQuery;
    }
    const sourceHosts = Array.from(new Set(group.entries.flatMap(entry => {
        if (!entry.url) {
            return [];
        }
        try {
            return [new URL(entry.url).hostname.replace(/^www\./, '')];
        }
        catch {
            return [];
        }
    })));
    if (sourceHosts.length > 0) {
        return `Native web search over ${sourceHosts.slice(0, 5).join(', ')}`;
    }
    return 'Native web search';
}
function nativeWebSearchToolOutput(group) {
    const uniqueLines = [];
    const seen = new Set();
    for (const entry of group.entries) {
        if (seen.has(entry.text)) {
            continue;
        }
        seen.add(entry.text);
        uniqueLines.push(entry.text);
    }
    return [
        'Native web_search activity:',
        ...uniqueLines.map(line => `- ${line}`),
    ].join('\n');
}
function buildNativeWebSearchSyntheticEvents(group) {
    const toolCallId = nativeWebSearchToolCallId(group);
    const argumentsPayload = {
        query: nativeWebSearchQuery(group),
        count: Math.max(1, Math.min(group.entries.length, 10)),
    };
    const commonPayload = {
        toolName: 'web_search',
        requestId: group.requestId,
        correlationId: group.correlationId ?? group.requestId,
        toolCallId,
        syntheticNativeWebSearch: true,
        synthetic_native_web_search: true,
        sourceEventIds: group.entries.map(entry => entry.eventId),
        nativeProgress: group.entries,
    };
    return [
        {
            eventId: `${toolCallId}:call`,
            type: 'tool_call',
            conversationRef: group.conversationRef,
            turnRef: group.turnRef,
            revisionId: group.revisionId,
            timestamp: group.timestamp,
            source: 'sdk',
            payload: {
                ...commonPayload,
                args: argumentsPayload,
                tool_calls: [{
                        id: toolCallId,
                        name: 'web_search',
                        arguments: argumentsPayload,
                    }],
                structuredPayload: {
                    synthetic_native_web_search: true,
                    progress_events: group.entries,
                },
            },
        },
        {
            eventId: `${toolCallId}:output`,
            type: 'tool_output',
            conversationRef: group.conversationRef,
            turnRef: group.turnRef,
            revisionId: group.revisionId,
            timestamp: group.timestamp,
            source: 'sdk',
            payload: {
                ...commonPayload,
                success: true,
                output: nativeWebSearchToolOutput(group),
                structuredPayload: {
                    synthetic_native_web_search: true,
                    progress_events: group.entries,
                },
            },
        },
    ];
}
function withSyntheticNativeWebSearchToolPairs(events) {
    const existingPairGroups = realWebSearchPairGroupKeys(events);
    const groups = new Map();
    for (let index = 0; index < events.length; index += 1) {
        const event = events[index];
        const entry = nativeWebSearchProgressEntry(event);
        if (!entry) {
            continue;
        }
        const key = nativeWebSearchProgressGroupKey(event);
        if (existingPairGroups.has(key)) {
            continue;
        }
        const current = groups.get(key);
        if (current) {
            current.entries.push(entry);
            continue;
        }
        groups.set(key, {
            firstIndex: index,
            conversationRef: event.conversationRef,
            turnRef: event.turnRef ?? null,
            revisionId: event.revisionId,
            timestamp: event.timestamp,
            requestId: (0, toolOutputContent_js_1.stringField)(event.payload, 'requestId', 'request_id'),
            correlationId: (0, toolOutputContent_js_1.stringField)(event.payload, 'correlationId', 'correlation_id'),
            entries: [entry],
        });
    }
    if (groups.size === 0) {
        return events;
    }
    const insertions = new Map();
    for (const group of groups.values()) {
        insertions.set(group.firstIndex, buildNativeWebSearchSyntheticEvents(group));
    }
    return events.flatMap((event, index) => [
        ...(insertions.get(index) ?? []),
        event,
    ]);
}
function toDisplayMessage(event) {
    if (event.type === 'assistant_delta') {
        return null;
    }
    if (event.type === 'reasoning_delta') {
        return null;
    }
    if (event.type === 'memory_retrieval_diagnostic'
        || event.type === 'memory_store_changed'
        || event.type === 'trace_event'
        || event.type === 'model_history_updated'
        || event.type === 'turn_superseded') {
        return null;
    }
    if (event.type === 'turn_completed') {
        return null;
    }
    if (event.type === 'system_prompt'
        || event.type === 'user_message_metadata'
        || event.type === 'tool_schemas_metadata') {
        return null;
    }
    if (event.type === 'compaction_skipped') {
        return null;
    }
    if (event.type.startsWith('compaction_')) {
        return null;
    }
    let sender = 'system';
    if (event.type === 'user_message') {
        sender = 'user';
    }
    else if (event.type === 'assistant_message') {
        sender = 'assistant';
    }
    else if (event.type === 'tool_progress') {
        sender = 'assistant';
    }
    else if (event.type === 'tool_call'
        || event.type === 'tool_output'
        || event.type === 'tool_bundle_call'
        || event.type === 'tool_bundle_output') {
        sender = 'tool';
    }
    const text = (event.type === 'tool_output' || event.type === 'tool_bundle_output'
        ? displayTextFromPayload(event.payload)
        : textFromPayload(event.payload));
    if (!text && sender === 'system') {
        return null;
    }
    return {
        id: event.eventId,
        conversationRef: event.conversationRef,
        turnRef: event.turnRef,
        revisionId: event.revisionId,
        timestamp: event.timestamp,
        sender,
        text,
        messageType: event.type,
        toolName: toolNameFromPayload(event.payload),
        requestId: (0, toolOutputContent_js_1.stringField)(event.payload, 'requestId', 'request_id'),
        bundleId: (0, toolOutputContent_js_1.stringField)(event.payload, 'bundleId', 'bundle_id'),
        toolCallId: (0, toolOutputContent_js_1.stringField)(event.payload, 'toolCallId', 'tool_call_id'),
        correlationId: (0, toolOutputContent_js_1.stringField)(event.payload, 'correlationId', 'correlation_id'),
        metadata: event.payload,
    };
}
function buildCompactionState(events) {
    const compactionEvent = [...events].reverse().find(event => event.type.startsWith('compaction_'));
    if (!compactionEvent) {
        return { status: 'idle' };
    }
    if (compactionEvent.type === 'compaction_started') {
        return { status: 'started', debug: compactionEvent.payload };
    }
    if (compactionEvent.type === 'compaction_skipped') {
        return {
            status: 'skipped',
            skippedReason: (0, toolOutputContent_js_1.stringField)(compactionEvent.payload, 'skippedReason'),
            debug: compactionEvent.payload,
        };
    }
    if (compactionEvent.type === 'compaction_applied') {
        return {
            status: 'applied',
            generationId: (0, toolOutputContent_js_1.stringField)(compactionEvent.payload, 'generationId'),
            summaryPreview: (0, toolOutputContent_js_1.stringField)(compactionEvent.payload, 'summaryPreview'),
            debug: compactionEvent.payload,
        };
    }
    if (compactionEvent.type === 'compaction_failed') {
        return { status: 'failed', debug: compactionEvent.payload };
    }
    return { status: 'idle' };
}
function buildDisplayConversation(events) {
    const first = events[0];
    const last = events[events.length - 1];
    const displayEvents = withoutAssistantMessagesForErroredTurns(withoutOrphanEmptyChatGreeting(withoutDuplicateToolOutputs(withoutSupersededTurnLiveEvents(events))));
    return {
        conversationRef: first?.conversationRef ?? '',
        revisionId: last?.revisionId ?? first?.revisionId ?? '',
        messages: displayEvents.map(toDisplayMessage).filter((message) => Boolean(message)),
        compaction: buildCompactionState(events),
    };
}
function buildTraceTimeline(events, options = {}) {
    return events
        .filter(event => event.type === 'trace_event')
        .filter(event => !options.conversationRef || event.conversationRef === options.conversationRef)
        .filter(event => !options.turnRef || event.turnRef === options.turnRef)
        .filter(event => {
        if (!isTracePayload(event.payload)) {
            return false;
        }
        if (options.traceId && event.payload.traceId !== options.traceId) {
            return false;
        }
        if (options.path && event.payload.path !== options.path) {
            return false;
        }
        return true;
    })
        .map(event => ({
        ...event.payload,
        eventId: event.eventId,
        timestamp: event.timestamp,
    }));
}
function buildToolTrace(events) {
    const display = buildDisplayConversation(events);
    return {
        conversationRef: display.conversationRef,
        revisionId: display.revisionId,
        calls: display.messages.filter(message => (message.messageType === 'tool_call' || message.messageType === 'tool_bundle_call')),
        outputs: display.messages.filter(message => (message.messageType === 'tool_output' || message.messageType === 'tool_bundle_output')),
    };
}
function buildConversationMetadata(events) {
    const display = buildDisplayConversation(events);
    const lastMessage = [...display.messages].reverse().find(message => message.text);
    const firstUserMessage = display.messages.find(message => message.sender === 'user');
    return {
        conversationRef: display.conversationRef,
        revisionId: display.revisionId,
        title: firstUserMessage?.text ?? display.conversationRef,
        lastMessage: lastMessage?.text ?? null,
        updatedAt: events[events.length - 1]?.timestamp ?? new Date(0).toISOString(),
        eventCount: events.length,
    };
}
function toRehydrateMessages(event) {
    if (event.type === 'user_message') {
        return [withStructuredPayload({
                role: 'user',
                message_type: 'user_query',
                content: textFromPayload(event.payload),
            }, event.payload)];
    }
    if (event.type === 'assistant_message') {
        return [withStructuredPayload({
                role: 'assistant',
                message_type: 'assistant_response',
                content: textFromPayload(event.payload),
            }, event.payload)];
    }
    if (event.type === 'tool_call') {
        return [withStructuredPayload({
                role: 'assistant',
                message_type: 'assistant_response',
                content: textFromPayload(event.payload),
                tool_calls: toolCallsFromPayload(event.payload),
                tool_call_id: (0, toolOutputContent_js_1.stringField)(event.payload, 'toolCallId', 'tool_call_id'),
            }, event.payload)];
    }
    if (event.type === 'tool_bundle_call') {
        return [withStructuredPayload({
                role: 'assistant',
                message_type: 'assistant_response',
                content: contentFromPayload(event.payload),
                tool_calls: toolCallsFromPayload(event.payload),
            }, {
                structuredPayload: {
                    ...(structuredPayloadFrom(event.payload) ?? {}),
                    bundle_id: (0, toolOutputContent_js_1.stringField)(event.payload, 'bundleId', 'bundle_id'),
                    tools: event.payload.tools,
                },
            })];
    }
    if (event.type === 'tool_output') {
        return [withStructuredPayload({
                role: 'tool',
                message_type: 'tool_output',
                content: modelTextFromPayload(event.payload),
                tool_call_id: (0, toolOutputContent_js_1.stringField)(event.payload, 'toolCallId', 'tool_call_id'),
                tool_name: toolNameFromPayload(event.payload),
            }, event.payload)];
    }
    if (event.type === 'tool_bundle_output') {
        return bundleOutputMessages(event);
    }
    return [];
}
function buildRehydrateSnapshot(events) {
    const display = buildDisplayConversation(events);
    const rehydrateEvents = withoutOrphanEmptyChatGreeting(withoutDanglingToolPairs(withoutDuplicateToolOutputs(withSyntheticNativeWebSearchToolPairs(withoutSupersededTurnLiveEvents(events)))));
    return {
        conversationRef: display.conversationRef,
        revisionId: display.revisionId,
        messages: rehydrateEvents.flatMap(toRehydrateMessages),
        replayGenerationId: null,
    };
}
