"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDisplayRows = buildDisplayRows;
exports.buildCurrentTurnProjection = buildCurrentTurnProjection;
exports.buildCompactionState = buildCompactionState;
exports.buildDisplayConversation = buildDisplayConversation;
exports.buildToolTrace = buildToolTrace;
exports.buildConversationMetadata = buildConversationMetadata;
exports.buildRehydrateSnapshot = buildRehydrateSnapshot;
const toolCorrelationIds_js_1 = require("../tools/toolCorrelationIds.js");
const toolOutputContent_js_1 = require("../tools/toolOutputContent.js");
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
const SETTINGS_UPDATE_ERROR_TEXT = 'Failed to update settings';
const EMPTY_CHAT_GREETING_TEXT = 'Hi! What can I help you with?';
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
        ?? (0, toolOutputContent_js_1.stringField)(payload, 'text', 'content', 'error')
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
function displayRowMetadata(event) {
    return {
        eventId: event.eventId,
        source: event.source,
        revisionId: event.revisionId,
        timestamp: event.timestamp,
        toolName: toolNameFromPayload(event.payload),
        requestId: (0, toolOutputContent_js_1.stringField)(event.payload, 'requestId', 'request_id'),
        correlationId: (0, toolOutputContent_js_1.stringField)(event.payload, 'correlationId', 'correlation_id'),
        bundleId: (0, toolOutputContent_js_1.stringField)(event.payload, 'bundleId', 'bundle_id'),
        toolCallId: (0, toolOutputContent_js_1.stringField)(event.payload, 'toolCallId', 'tool_call_id'),
        screenshotRef: (0, toolOutputContent_js_1.stringField)(event.payload, 'screenshotRef', 'screenshot_ref'),
        screenshotUrl: (0, toolOutputContent_js_1.stringField)(event.payload, 'screenshotUrl', 'screenshot_url'),
        modelId: (0, toolOutputContent_js_1.stringField)(event.payload, 'modelId', 'model_id'),
        modelProvider: (0, toolOutputContent_js_1.stringField)(event.payload, 'modelProvider', 'model_provider'),
        raw: event.payload,
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
function streamingAssistantKey(event) {
    return `${event.conversationRef}:${event.turnRef ?? event.eventId}`;
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
        return {
            ...displayRowBase(event, index),
            role: 'assistant',
            type: 'tool_call',
            content: modelFacingToolCallFromPayload(event.payload),
            metadata: {
                ...displayRowMetadata(event),
                toolName: toolNameFromPayload(event.payload),
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
    const metadata = displayRowMetadata(event);
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
function buildStreamingAssistantRow(event, index, assistantText, reasoningText, eventIds) {
    const raw = {
        ...event.payload,
        assistantText,
        reasoningText,
        sourceEventIds: eventIds,
    };
    return {
        id: assistantDisplayRowId(event),
        conversationRef: event.conversationRef,
        turnRef: event.turnRef,
        index,
        role: 'assistant',
        type: 'assistant_message',
        content: assistantText,
        isStreaming: true,
        metadata: {
            ...displayRowMetadata(event),
            raw,
        },
    };
}
function buildFinalAssistantRow(event, index, streamingState) {
    const reasoningText = streamingState?.reasoningText ?? null;
    const raw = reasoningText
        ? {
            ...event.payload,
            reasoningText,
            sourceEventIds: streamingState?.eventIds ?? [],
        }
        : event.payload;
    return {
        id: assistantDisplayRowId(event),
        conversationRef: event.conversationRef,
        turnRef: event.turnRef,
        index,
        role: 'assistant',
        type: 'assistant_message',
        content: textFromPayload(event.payload),
        metadata: {
            ...displayRowMetadata(event),
            raw,
        },
    };
}
function buildDisplayRows(events) {
    const rows = [];
    const streamingAssistants = new Map();
    const userRowsByTurn = new Map();
    for (const event of events) {
        if (event.type === 'user_message_metadata') {
            const key = userMetadataKey(event);
            const rowIndex = key ? userRowsByTurn.get(key) : undefined;
            const row = typeof rowIndex === 'number' ? rows[rowIndex] : null;
            if (row?.type === 'user_message') {
                rows[rowIndex] = mergeUserMessageMetadata(row, event);
            }
            continue;
        }
        if (event.type === 'assistant_delta' || event.type === 'reasoning_delta') {
            const key = streamingAssistantKey(event);
            const current = streamingAssistants.get(key) ?? {
                rowIndex: rows.length,
                assistantText: '',
                reasoningText: null,
                eventIds: [],
            };
            const text = textFromPayload(event.payload);
            const nextState = {
                rowIndex: current.rowIndex,
                assistantText: event.type === 'assistant_delta'
                    ? `${current.assistantText}${text}`
                    : current.assistantText,
                reasoningText: event.type === 'reasoning_delta'
                    ? `${current.reasoningText ?? ''}${text}`
                    : current.reasoningText,
                eventIds: [...current.eventIds, event.eventId],
            };
            streamingAssistants.set(key, nextState);
            const row = buildStreamingAssistantRow(event, nextState.rowIndex, nextState.assistantText, nextState.reasoningText, nextState.eventIds);
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
                rows[streamingState.rowIndex] = buildFinalAssistantRow(event, streamingState.rowIndex, streamingState);
                streamingAssistants.delete(key);
                continue;
            }
        }
        const row = displayRowFromEvent(event, rows.length);
        if (row) {
            rows.push(row);
            if (row.type === 'user_message') {
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
    return {
        id: event.eventId,
        kind,
        toolName,
        ...(outputText ? { text: outputText } : {}),
        status: statusFromToolPayload(event.payload),
        payload: event.payload,
    };
}
function emptyCurrentTurnProjection(conversationRef, turnRef = null) {
    const projection = {
        conversationRef,
        turnRef,
        phase: turnRef ? 'awaiting' : 'idle',
        assistantText: '',
        reasoningText: null,
        toolEvents: [],
        lastError: null,
    };
    return withLiveTurnPresentation(projection);
}
function resetCurrentTurnIfNeeded(current, event) {
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
            sourceChannel: 'windie:current-turn',
            turnRef: projection.turnRef,
        });
    }
    projection.toolEvents.forEach((toolEvent, index) => {
        entries.push({
            id: `${baseId}:tool:${toolEvent.id || index}`,
            type: toolEntryType(toolEvent),
            text: toolEntryText(toolEvent),
            sourceEventType: toolEvent.kind,
            sourceChannel: 'windie:current-turn',
            turnRef: projection.turnRef,
            toolName: toolEvent.toolName ?? null,
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
            sourceChannel: 'windie:current-turn',
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
            sourceChannel: 'windie:current-turn',
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
    return {
        conversationRef: projection.conversationRef,
        turnRef: projection.turnRef,
        phase: projection.phase,
        entries,
        hasVisibleContent,
        typingVisible: projection.phase === 'awaiting' && !hasVisibleContent,
        overlayVisible: hasVisibleContent,
        isBusy,
        isTerminal: terminalPhases.has(projection.phase),
        lastError: projection.lastError,
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
    for (const event of events) {
        projection = resetCurrentTurnIfNeeded(projection, event);
        if (!projection.conversationRef) {
            projection = { ...projection, conversationRef: event.conversationRef };
        }
        if (!projection.turnRef && event.turnRef) {
            projection = { ...projection, turnRef: event.turnRef };
        }
        if (event.type === 'turn_started' || event.type === 'user_message') {
            projection = advanceCurrentTurnPhase(projection, 'awaiting');
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
        if (event.type === 'turn_error' || event.type === 'runtime_error' || event.type === 'compaction_failed') {
            if (event.type !== 'compaction_failed' && shouldIgnoreCurrentTurnError(event.payload)) {
                continue;
            }
            projection = {
                ...projection,
                phase: 'error',
                lastError: textFromPayload(event.payload) || 'Unknown runtime error',
            };
        }
    }
    return withLiveTurnPresentation(projection);
}
function toolOutputDedupeKey(event) {
    if (event.type !== 'tool_output' && event.type !== 'tool_bundle_output') {
        return null;
    }
    return (0, toolCorrelationIds_js_1.resolveToolOutputDedupeKey)(event.payload);
}
function toolPairKey(event) {
    return toolPairKeys(event)[0] ?? null;
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
function toDisplayMessage(event) {
    if (event.type === 'assistant_delta') {
        return null;
    }
    if (event.type === 'reasoning_delta') {
        return null;
    }
    if (event.type === 'tool_progress') {
        return null;
    }
    if (event.type === 'memory_retrieval_diagnostic' || event.type === 'memory_store_changed') {
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
            skippedReason: (0, toolOutputContent_js_1.stringField)(compactionEvent.payload, 'skippedReason', 'skipped_reason'),
            debug: compactionEvent.payload,
        };
    }
    if (compactionEvent.type === 'compaction_applied') {
        return {
            status: 'applied',
            generationId: (0, toolOutputContent_js_1.stringField)(compactionEvent.payload, 'generationId', 'generation_id'),
            summaryPreview: (0, toolOutputContent_js_1.stringField)(compactionEvent.payload, 'summaryPreview', 'summary_preview'),
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
    const displayEvents = withoutOrphanEmptyChatGreeting(withoutDuplicateToolOutputs(events));
    return {
        conversationRef: first?.conversationRef ?? '',
        revisionId: last?.revisionId ?? first?.revisionId ?? '',
        messages: displayEvents.map(toDisplayMessage).filter((message) => Boolean(message)),
        compaction: buildCompactionState(events),
    };
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
                content: textFromPayload(event.payload),
            }, event.payload)];
    }
    if (event.type === 'assistant_message') {
        return [withStructuredPayload({
                role: 'assistant',
                content: textFromPayload(event.payload),
            }, event.payload)];
    }
    if (event.type === 'tool_call') {
        return [withStructuredPayload({
                role: 'assistant',
                content: textFromPayload(event.payload),
                tool_calls: toolCallsFromPayload(event.payload),
                tool_call_id: (0, toolOutputContent_js_1.stringField)(event.payload, 'toolCallId', 'tool_call_id'),
            }, event.payload)];
    }
    if (event.type === 'tool_bundle_call') {
        return [withStructuredPayload({
                role: 'assistant',
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
    const rehydrateEvents = withoutOrphanEmptyChatGreeting(withoutDanglingToolPairs(withoutDuplicateToolOutputs(events)));
    return {
        conversationRef: display.conversationRef,
        revisionId: display.revisionId,
        messages: rehydrateEvents.flatMap(toRehydrateMessages),
        replayGenerationId: null,
    };
}
