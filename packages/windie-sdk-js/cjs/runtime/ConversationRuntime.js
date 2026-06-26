"use strict";
/**
 * Coordinates the conversation runtime for the TypeScript SDK runtime.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SdkConversationRuntime = void 0;
exports.createConversationRuntime = createConversationRuntime;
const events_js_1 = require("../conversation/events.js");
const backendEvents_js_1 = require("../events/backendEvents.js");
const conversationProjections_js_1 = require("../projections/conversationProjections.js");
const backendEventNormalizer_js_1 = require("../transport/backendEventNormalizer.js");
const AgentSession_js_1 = require("../transport/AgentSession.js");
const ToolExecutionCoordinator_js_1 = require("../tools/ToolExecutionCoordinator.js");
const modelSelection_js_1 = require("../settings/modelSelection.js");
const ContextEnrichmentPipeline_js_1 = require("./ContextEnrichmentPipeline.js");
const TraceRecorder_js_1 = require("./TraceRecorder.js");
const conversationReducer_js_1 = require("./conversationReducer.js");
const conversationEventScope_js_1 = require("./conversationEventScope.js");
const debugEnv_js_1 = require("./debugEnv.js");
const modelHistoryPayload_js_1 = require("./modelHistoryPayload.js");
const TurnInputPipeline_js_1 = require("./TurnInputPipeline.js");
const toolCorrelationIds_js_1 = require("../tools/toolCorrelationIds.js");
const toolOutputContent_js_1 = require("../tools/toolOutputContent.js");
function nowMs() {
    return Date.now();
}
function durationSince(startedAtMs) {
    return Math.max(0, Date.now() - startedAtMs);
}
const LOCAL_RUNTIME_RPC_TRACE_PATH = 'local_runtime.rpc';
const PRE_NORMALIZED_SEND_INPUT_KEYS = Object.freeze([
    'agentDefinition',
    'agent_definition',
    'backendPayload',
    'conversationRef',
    'conversation_ref',
    'content',
    'screenshotRef',
    'screenshotRefs',
    'screenshot_ref',
    'screenshot_refs',
    'attachmentContext',
    'attachmentFilenames',
    'attachment_context',
    'attachment_filenames',
    'systemStateInternal',
    'system_state_internal',
    'workspacePath',
    'workspace_path',
]);
function assertRuntimeSendInputEnvelope(input) {
    if (!(0, debugEnv_js_1.isStrictRuntimeInputEnabled)() || !isJsonRecord(input)) {
        return;
    }
    const invalidKeys = PRE_NORMALIZED_SEND_INPUT_KEYS.filter(key => (Object.prototype.hasOwnProperty.call(input, key)));
    if (invalidKeys.length === 0) {
        return;
    }
    throw new Error(`ConversationRuntime.send received pre-normalized top-level field(s): ${invalidKeys.join(', ')}. `
        + 'Normalize query inputs into the runtime send envelope and put agent config at payload.agent_definition.');
}
function optionalRequestId(value) {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
}
function optionalPayloadString(value) {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
function optionalPayloadRecords(value) {
    return Array.isArray(value) ? value.filter(isJsonRecord) : null;
}
const USER_MESSAGE_DISPLAY_PAYLOAD_KEYS = [
    'screenshotRef',
    'screenshot_ref',
    'screenshotRefs',
    'screenshot_refs',
    'screenshotUrl',
    'screenshot_url',
    'screenshot',
    'image',
    'screenshotContentType',
    'screenshot_content_type',
    'attachment_filenames',
    'attachmentFilenames',
    'attachments',
    'display_attachments',
];
function userMessageDisplayPayloadFrom(value) {
    if (!isJsonRecord(value)) {
        return {};
    }
    const payload = {};
    for (const key of USER_MESSAGE_DISPLAY_PAYLOAD_KEYS) {
        if (Object.prototype.hasOwnProperty.call(value, key) && value[key] !== undefined) {
            payload[key] = value[key];
        }
    }
    return payload;
}
const completedTurnTitleGenerationInFlight = new Set();
function eventText(event) {
    if (typeof event.payload.text === 'string') {
        return event.payload.text;
    }
    if (typeof event.payload.content === 'string') {
        return event.payload.content;
    }
    return '';
}
function mergeReplayPayload(resolvedPayload, overridePayload) {
    const payload = { ...resolvedPayload };
    if (!overridePayload) {
        return payload;
    }
    for (const [key, value] of Object.entries(overridePayload)) {
        if (value === null || value === undefined) {
            continue;
        }
        payload[key] = value;
    }
    return payload;
}
function displayRowMatchesId(row, messageId) {
    return row.id === messageId
        || row.metadata?.eventId === messageId
        || row.metadata?.replacedDisplayRowId === messageId
        || row.metadata?.raw?.id === messageId
        || row.metadata?.raw?.messageId === messageId
        || row.metadata?.raw?.message_id === messageId;
}
function replacementUserDisplayRow(sourceRow, options) {
    const rowId = `${options.turnRef}-sdk-evt-000002-user_message`;
    return {
        ...sourceRow,
        id: rowId,
        revisionId: options.baseRevisionId,
        turnRef: options.turnRef,
        content: options.text,
        metadata: {
            ...(sourceRow.metadata ?? {}),
            eventId: rowId,
            replacedDisplayRowId: sourceRow.metadata?.replacedDisplayRowId ?? sourceRow.id,
            revisionId: options.baseRevisionId,
            source: 'ui',
            sourceEventType: 'sdk-replay',
            timestamp: options.timestamp,
        },
    };
}
function readyImageAttachmentsFromDisplayRow(row) {
    const attachments = row.metadata?.attachments;
    if (!Array.isArray(attachments)) {
        return [];
    }
    return attachments.filter((attachment) => (Boolean(attachment)
        && attachment.kind === 'image'
        && attachment.status === 'ready'
        && typeof attachment.id === 'string'
        && attachment.id.trim().length > 0));
}
function replayPayloadFromDisplayRow(row) {
    const payload = {};
    const metadata = row.metadata;
    if (metadata) {
        const screenshotRefs = Array.isArray(metadata.screenshotRefs)
            ? metadata.screenshotRefs
            : metadata.screenshot_refs;
        if (Array.isArray(screenshotRefs) && screenshotRefs.length > 0) {
            payload.screenshot_refs = screenshotRefs.filter((value) => (typeof value === 'string' && value.trim().length > 0));
        }
        const screenshotRef = metadata.screenshotRef
            ?? metadata.screenshot_ref
            ?? metadata.screenshot;
        if (!payload.screenshot_refs && typeof screenshotRef === 'string' && screenshotRef.trim()) {
            payload.screenshot_ref = screenshotRef.trim();
        }
        const screenshotUrl = metadata.screenshotUrl ?? metadata.screenshot_url;
        if (typeof screenshotUrl === 'string' && screenshotUrl.trim()) {
            payload.screenshot_url = screenshotUrl.trim();
        }
    }
    const attachments = readyImageAttachmentsFromDisplayRow(row);
    if (attachments.length > 0) {
        payload.screenshot_refs = attachments.map(attachment => attachment.id.trim());
        const attachmentFilenames = attachments
            .map(attachment => (typeof attachment.filename === 'string' && attachment.filename.trim()
            ? attachment.filename.trim()
            : null))
            .filter((value) => Boolean(value));
        if (attachmentFilenames.length > 0) {
            payload.attachment_filenames = attachmentFilenames;
        }
    }
    return payload;
}
function displayMessageFromRow(row, fallbackTimestamp) {
    const metadata = isJsonRecord(row.metadata) ? row.metadata : {};
    const metadataRevisionId = typeof metadata.revisionId === 'string' ? metadata.revisionId : '';
    const messageType = row.type === 'error'
        ? 'turn_error'
        : row.type === 'reasoning'
            ? null
            : row.type;
    if (!messageType) {
        return null;
    }
    const text = typeof row.content === 'string'
        ? row.content
        : row.content == null
            ? ''
            : JSON.stringify(row.content);
    if (!text && row.role === 'system') {
        return null;
    }
    return {
        id: row.id,
        conversationRef: row.conversationRef,
        turnRef: row.turnRef ?? null,
        revisionId: rowMetadataRevision(row) ?? metadataRevisionId,
        timestamp: typeof metadata.timestamp === 'string' ? metadata.timestamp : fallbackTimestamp,
        sender: row.role,
        text,
        messageType,
        toolName: typeof metadata.toolName === 'string' ? metadata.toolName : null,
        requestId: typeof metadata.requestId === 'string' ? metadata.requestId : null,
        bundleId: typeof metadata.bundleId === 'string' ? metadata.bundleId : null,
        toolCallId: typeof metadata.toolCallId === 'string' ? metadata.toolCallId : null,
        correlationId: typeof metadata.correlationId === 'string' ? metadata.correlationId : null,
        metadata,
    };
}
function isTerminalConversationEvent(event) {
    return event.type === 'turn_completed'
        || event.type === 'turn_stopped'
        || event.type === 'turn_error'
        || event.type === 'runtime_error'
        || event.type === 'compaction_failed';
}
function isJsonRecord(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
function arrayRecordCount(value) {
    return Array.isArray(value) ? value.length : 0;
}
function displayAttachmentsFromUnknown(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter((entry) => {
        if (!isJsonRecord(entry)) {
            return false;
        }
        return typeof entry.id === 'string'
            && (entry.kind === 'image' || entry.kind === 'screenshot_request')
            && (entry.source === 'user_included'
                || entry.source === 'camera_button'
                || entry.source === 'tool_result'
                || entry.source === 'replay')
            && (entry.status === 'materializing'
                || entry.status === 'pending_capture'
                || entry.status === 'ready'
                || entry.status === 'failed');
    });
}
function rowMetadataRevision(row) {
    if (!row) {
        return null;
    }
    const explicit = row.revisionId;
    if (typeof explicit === 'string' && explicit.trim()) {
        return explicit.trim();
    }
    const metadataRevision = row.metadata?.revisionId;
    return typeof metadataRevision === 'string' && metadataRevision.trim()
        ? metadataRevision.trim()
        : null;
}
function displayRowDedupeKey(row) {
    const content = typeof row.content === 'string' ? row.content : JSON.stringify(row.content);
    return [
        row.turnRef ?? '',
        row.type,
        content,
    ].join('\u0000');
}
function displayRowToolOutputDedupeKey(row) {
    if (row.type !== 'tool_output' && row.type !== 'tool_bundle_output') {
        return null;
    }
    const raw = isJsonRecord(row.metadata?.raw) ? row.metadata.raw : null;
    const rawKey = raw ? (0, toolCorrelationIds_js_1.resolveToolOutputDedupeKey)(raw) : null;
    if (rawKey) {
        return rawKey;
    }
    const requestId = typeof row.metadata?.requestId === 'string' && row.metadata.requestId.trim()
        ? row.metadata.requestId.trim()
        : null;
    if (requestId) {
        return `request:${requestId}`;
    }
    const correlationId = typeof row.metadata?.correlationId === 'string' && row.metadata.correlationId.trim()
        ? row.metadata.correlationId.trim()
        : null;
    if (correlationId) {
        return `request:${correlationId}`;
    }
    const bundleId = typeof row.metadata?.bundleId === 'string' && row.metadata.bundleId.trim()
        ? row.metadata.bundleId.trim()
        : null;
    if (bundleId) {
        return `bundle:${bundleId}`;
    }
    const toolCallId = typeof row.metadata?.toolCallId === 'string' && row.metadata.toolCallId.trim()
        ? row.metadata.toolCallId.trim()
        : null;
    return toolCallId ? `tool-call:${toolCallId}` : null;
}
function displayRowHasModelContent(row) {
    const raw = isJsonRecord(row.metadata?.raw) ? row.metadata.raw : null;
    if (raw) {
        return (0, toolOutputContent_js_1.readToolOutputContent)(raw).hasModelContent;
    }
    return typeof row.content === 'string' && row.content.trim().length > 0;
}
function displayRowSource(row) {
    const source = row.metadata?.source;
    return typeof source === 'string' && source.trim() ? source.trim() : null;
}
function withoutDuplicateDisplayToolOutputs(rows) {
    const preferredRows = new Map();
    const prefers = (candidate, current) => {
        const candidateHasModelContent = displayRowHasModelContent(candidate);
        const currentHasModelContent = displayRowHasModelContent(current);
        if (candidateHasModelContent !== currentHasModelContent) {
            return candidateHasModelContent;
        }
        if (displayRowSource(candidate) === 'backend' && displayRowSource(current) !== 'backend') {
            return true;
        }
        if (displayRowSource(candidate) !== 'backend' && displayRowSource(current) === 'backend') {
            return false;
        }
        return false;
    };
    for (const row of rows) {
        const key = displayRowToolOutputDedupeKey(row);
        if (!key) {
            continue;
        }
        const current = preferredRows.get(key);
        if (!current || prefers(row, current)) {
            preferredRows.set(key, row);
        }
    }
    return rows
        .filter(row => {
        const key = displayRowToolOutputDedupeKey(row);
        return !key || preferredRows.get(key) === row;
    })
        .map((row, index) => ({
        ...row,
        index,
    }));
}
function rehydrateSnapshotFromModelHistory(events, conversationRef, revisionId, displayRows = (0, conversationProjections_js_1.buildDisplayRows)(events)) {
    const modelHistoryEvent = [...events].reverse().find(event => (event.type === 'model_history_updated'
        && event.conversationRef === conversationRef
        && event.revisionId === revisionId));
    if (!modelHistoryEvent) {
        return null;
    }
    const rows = Array.isArray(modelHistoryEvent.payload.rows)
        ? modelHistoryEvent.payload.rows.filter((row) => Boolean(row && typeof row === 'object'))
        : [];
    if (rows.length === 0) {
        return null;
    }
    return (0, modelHistoryPayload_js_1.rehydrateSnapshotFromModelHistoryCheckpoint)({
        checkpointId: typeof modelHistoryEvent.payload.checkpointId === 'string'
            ? modelHistoryEvent.payload.checkpointId
            : `${revisionId}-model-history`,
        conversationRef,
        revisionId,
        createdAt: typeof modelHistoryEvent.payload.createdAt === 'string'
            ? modelHistoryEvent.payload.createdAt
            : modelHistoryEvent.timestamp,
        rows: attachDisplaySourcesToModelHistoryRows(rows, displayRows.filter(row => rowMetadataRevision(row) === revisionId)),
    });
}
function displayTimelinePairKeys(row) {
    const metadata = row.metadata ?? {};
    const keys = [
        metadata.toolCallId,
        metadata.requestId,
        metadata.correlationId,
        metadata.bundleId,
    ].filter((value) => typeof value === 'string' && value.trim().length > 0);
    if ((row.type === 'tool_call' || row.type === 'tool_bundle_call') && isJsonRecord(row.content)) {
        const toolCalls = Array.isArray(row.content.tool_calls)
            ? row.content.tool_calls
            : Array.isArray(row.content.toolCalls) ? row.content.toolCalls : [];
        for (const toolCall of toolCalls) {
            const record = isJsonRecord(toolCall) ? toolCall : null;
            const id = typeof record?.id === 'string' && record.id.trim() ? record.id.trim() : null;
            if (id) {
                keys.push(id);
            }
        }
    }
    return Array.from(new Set(keys));
}
function validateDisplayTimelineAttachments(row) {
    const attachments = row.metadata?.attachments;
    if (attachments == null) {
        return;
    }
    if (!Array.isArray(attachments)) {
        throw new Error('replaceRows attachment refs must be an array');
    }
    for (const attachment of attachments) {
        if (!attachment || typeof attachment !== 'object') {
            throw new Error('replaceRows attachment refs must be objects');
        }
        const record = attachment;
        const id = typeof record.id === 'string' ? record.id.trim() : '';
        if (!id) {
            throw new Error('replaceRows attachment refs require stable ids');
        }
        if (record.kind !== 'image' && record.kind !== 'screenshot_request') {
            throw new Error('replaceRows attachment refs require canonical kind');
        }
        if (!record.source || !record.status) {
            throw new Error('replaceRows attachment refs require source and status');
        }
    }
}
function normalizeDisplayTimelineRows(rows, options) {
    if (!Array.isArray(rows)) {
        throw new Error('replaceRows rows must be an array');
    }
    const normalized = rows.map((row, index) => {
        if (!row || typeof row !== 'object') {
            throw new Error('replaceRows rows must be objects');
        }
        if (row.conversationRef !== options.conversationRef) {
            throw new Error('replaceRows rows must match the active conversation');
        }
        if (rowMetadataRevision(row) !== options.baseRevisionId) {
            throw new Error('replaceRows rows must belong to the base revision');
        }
        if (!row.id || typeof row.id !== 'string') {
            throw new Error('replaceRows rows require stable ids');
        }
        return {
            ...row,
            index,
            revisionId: options.newRevisionId,
            metadata: {
                ...(row.metadata ?? {}),
                revisionId: options.newRevisionId,
            },
        };
    });
    normalized.forEach(validateDisplayTimelineAttachments);
    const openToolKeys = new Set();
    for (const row of normalized) {
        const keys = displayTimelinePairKeys(row);
        if (row.type === 'tool_call' || row.type === 'tool_bundle_call') {
            keys.forEach(key => openToolKeys.add(key));
        }
        if (row.type === 'tool_output' || row.type === 'tool_bundle_output') {
            const hasPair = keys.length === 0 || keys.some(key => openToolKeys.has(key));
            if (!hasPair) {
                throw new Error('replaceRows tool outputs require a preceding tool call');
            }
        }
    }
    return normalized;
}
function rowsForFork(rows, options) {
    const cutIndex = rows.findIndex(row => row.id === options.cutAfterRowId);
    if (cutIndex < 0) {
        throw new Error(`Cannot fork missing display row: ${options.cutAfterRowId}`);
    }
    return rows.slice(0, cutIndex + 1).map((row, index) => ({
        ...row,
        conversationRef: options.newConversationRef,
        revisionId: options.newRevisionId,
        index,
        metadata: {
            ...(row.metadata ?? {}),
            revisionId: options.newRevisionId,
            forkedFromConversationRef: row.conversationRef,
            forkedFromRevisionId: row.revisionId,
        },
    }));
}
function modelRowsForFork(rows, options) {
    const forkRows = [];
    for (const row of rows) {
        const sourceIds = Array.isArray(row.sourceDisplayRowIds)
            ? row.sourceDisplayRowIds.filter(value => typeof value === 'string' && value.trim())
            : [];
        if (sourceIds.length === 0 || !sourceIds.every(id => options.keptDisplayRowIds.has(id))) {
            continue;
        }
        forkRows.push({
            ...row,
            id: `${options.newRevisionId}-mh-row-${String(forkRows.length + 1).padStart(4, '0')}`,
            conversationRef: options.newConversationRef,
            revisionId: options.newRevisionId,
            sourceDisplayRowIds: sourceIds,
        });
    }
    return forkRows;
}
function modelRowsForDisplayRevision(rows, options) {
    return modelRowsForFork(rows, {
        keptDisplayRowIds: options.keptDisplayRowIds,
        newConversationRef: options.conversationRef,
        newRevisionId: options.newRevisionId,
    });
}
function stringArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter((entry) => typeof entry === 'string' && entry.trim().length > 0);
}
function firstToolCallIdFromUnknown(value) {
    const calls = Array.isArray(value) ? value : [];
    for (const call of calls) {
        const record = isJsonRecord(call) ? call : null;
        const id = typeof record?.id === 'string' && record.id.trim() ? record.id.trim() : null;
        if (id) {
            return id;
        }
    }
    return null;
}
function displayRowToolCallId(row) {
    const metadata = row.metadata ?? {};
    const metadataId = typeof metadata.toolCallId === 'string' && metadata.toolCallId.trim()
        ? metadata.toolCallId.trim()
        : null;
    if (metadataId) {
        return metadataId;
    }
    if (isJsonRecord(row.content)) {
        const direct = typeof row.content.toolCallId === 'string' && row.content.toolCallId.trim()
            ? row.content.toolCallId.trim()
            : null;
        if (direct) {
            return direct;
        }
        const calls = Array.isArray(row.content.tool_calls)
            ? row.content.tool_calls
            : (Array.isArray(row.content.toolCalls) ? row.content.toolCalls : []);
        return firstToolCallIdFromUnknown(calls);
    }
    return null;
}
function modelRowToolCallId(row) {
    if (typeof row.toolCallId === 'string' && row.toolCallId.trim()) {
        return row.toolCallId.trim();
    }
    return firstToolCallIdFromUnknown(row.toolCalls);
}
function displayRowMatchesModelHistory(row, modelRow) {
    if (modelRow.messageType === 'user_query') {
        return row.role === 'user' && row.type === 'user_message';
    }
    if (modelRow.messageType === 'tool_output') {
        if (row.type !== 'tool_output' && row.type !== 'tool_bundle_output') {
            return false;
        }
        const modelToolCallId = modelRowToolCallId(modelRow);
        const displayToolCallId = displayRowToolCallId(row);
        return !modelToolCallId || !displayToolCallId || modelToolCallId === displayToolCallId;
    }
    if (modelRow.messageType === 'assistant_response') {
        const hasToolCalls = Array.isArray(modelRow.toolCalls) && modelRow.toolCalls.length > 0;
        if (hasToolCalls) {
            if (row.type !== 'tool_call' && row.type !== 'tool_bundle_call') {
                return false;
            }
            const modelToolCallId = modelRowToolCallId(modelRow);
            const displayToolCallId = displayRowToolCallId(row);
            return !modelToolCallId || !displayToolCallId || modelToolCallId === displayToolCallId;
        }
        return row.role === 'assistant' && row.type === 'assistant_message';
    }
    return false;
}
function attachDisplaySourcesToModelHistoryRows(rows, displayRows) {
    let cursor = 0;
    let canInferFromOrder = true;
    return rows.map(row => {
        const existingSources = stringArray(row.sourceDisplayRowIds);
        if (existingSources.length > 0) {
            const indexes = existingSources
                .map(sourceId => displayRows.findIndex(displayRow => displayRow.id === sourceId))
                .filter(index => index >= 0);
            if (indexes.length > 0) {
                cursor = Math.max(cursor, Math.max(...indexes) + 1);
                canInferFromOrder = true;
            }
            return {
                ...row,
                sourceDisplayRowIds: existingSources,
            };
        }
        if (!canInferFromOrder || row.messageType === 'context_compaction') {
            canInferFromOrder = false;
            return {
                ...row,
                sourceDisplayRowIds: [],
            };
        }
        const matchIndex = displayRows.findIndex((displayRow, index) => (index >= cursor && displayRowMatchesModelHistory(displayRow, row)));
        if (matchIndex < 0) {
            canInferFromOrder = false;
            return {
                ...row,
                sourceDisplayRowIds: [],
            };
        }
        cursor = matchIndex + 1;
        return {
            ...row,
            sourceDisplayRowIds: [displayRows[matchIndex].id],
        };
    });
}
function getAgentDefinitionClientManifestTools(agentDefinition) {
    if (!isJsonRecord(agentDefinition)) {
        return [];
    }
    const tools = isJsonRecord(agentDefinition.tools) ? agentDefinition.tools : null;
    const clientManifest = isJsonRecord(tools?.client_manifest) ? tools.client_manifest : null;
    const manifestTools = Array.isArray(clientManifest?.tools) ? clientManifest.tools : [];
    return manifestTools.filter(isJsonRecord);
}
function getMcpManifestToolStats(agentDefinition) {
    const mcpTools = getAgentDefinitionClientManifestTools(agentDefinition).filter((tool) => (typeof tool.mcp_server_id === 'string' && tool.mcp_server_id.trim().length > 0));
    const serverIds = new Set(mcpTools
        .map((tool) => (typeof tool.mcp_server_id === 'string' ? tool.mcp_server_id.trim() : ''))
        .filter(Boolean));
    return {
        toolCount: mcpTools.length,
        serverCount: serverIds.size,
    };
}
function getAgentDefinitionToolCount(agentDefinition) {
    if (!isJsonRecord(agentDefinition)) {
        return 0;
    }
    if (Array.isArray(agentDefinition.tools)) {
        return agentDefinition.tools.length;
    }
    return getAgentDefinitionClientManifestTools(agentDefinition).length;
}
function getAgentDefinitionCapabilityRevision(agentDefinition) {
    if (!isJsonRecord(agentDefinition) || !isJsonRecord(agentDefinition.metadata)) {
        return null;
    }
    const revision = agentDefinition.metadata.client_capability_revision;
    if (typeof revision === 'string' && revision.trim()) {
        return revision.trim();
    }
    const capability = agentDefinition.metadata.client_capability;
    if (isJsonRecord(capability) && typeof capability.revision === 'string' && capability.revision.trim()) {
        return capability.revision.trim();
    }
    return null;
}
function recordKeyCount(value) {
    return isJsonRecord(value) ? Object.keys(value).length : 0;
}
function hasOwnEnumerableKeys(value) {
    return Object.keys(value).length > 0;
}
function stringPayloadField(payload, ...keys) {
    for (const key of keys) {
        const value = payload[key];
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    return undefined;
}
function completedAssistantResponse(event) {
    return stringPayloadField(event.payload, 'finalResponse', 'final_response', 'text', 'content') ?? '';
}
function rpcResponseData(response, fallbackError) {
    const record = isJsonRecord(response) ? response : {};
    if (record.success === false) {
        const error = typeof record.error === 'string' && record.error.trim()
            ? record.error
            : fallbackError;
        throw new Error(error);
    }
    return isJsonRecord(record.data) ? record.data : record;
}
function titleStateAllowsGeneratedTitle(response) {
    const state = rpcResponseData(response, 'Conversation title state RPC failed');
    if (state.is_locked === true || state.isLocked === true) {
        return false;
    }
    const title = typeof state.title === 'string' ? state.title.trim() : '';
    if (!title) {
        return true;
    }
    const source = typeof state.source === 'string' ? state.source.trim().toLowerCase() : '';
    return source === 'heuristic';
}
function titleGenerationKey(input) {
    return `${input.userId}:${input.conversationRef}`;
}
class SdkConversationRuntime {
    constructor(options) {
        this.options = options;
        this.events = [];
        this.listeners = new Set();
        this.eventListeners = new Set();
        this.localEventCounters = new Map();
        this.backendTurnSequences = new Map();
        this.pendingTurns = new Map();
        this.liveDisplayAttachmentsByTurn = new Map();
        this.activeDisplayTimeline = null;
        this.backendEventQueue = Promise.resolve();
        this.state = (0, conversationReducer_js_1.createInitialConversationRuntimeState)(options.conversationRef, options.revisionId);
    }
    async load() {
        const events = await this.options.store.loadEvents(this.options.conversationRef);
        this.events = events;
        const requestedRevisionId = this.activeDisplayTimeline?.revisionId
            ?? (this.state.revisionId && this.state.revisionId !== 'rev-empty' ? this.state.revisionId : null);
        this.activeDisplayTimeline = await this.loadStoredDisplayTimeline(requestedRevisionId);
        const activeRevisionId = this.activeDisplayTimeline?.revisionId
            ?? events[events.length - 1]?.revisionId
            ?? this.state.revisionId;
        const stateEvents = this.activeDisplayTimeline
            ? events.filter(event => event.revisionId === activeRevisionId)
            : events;
        this.state = stateEvents.reduce((state, event) => (0, conversationReducer_js_1.reduceConversationRuntimeState)(state, event), (0, conversationReducer_js_1.createInitialConversationRuntimeState)(this.options.conversationRef, activeRevisionId));
        return this.snapshot(this.events);
    }
    async loadDisplayTimeline(options = {}) {
        const requestedRevisionId = Object.prototype.hasOwnProperty.call(options, 'revisionId')
            ? options.revisionId ?? null
            : null;
        const checkpoint = await this.loadStoredDisplayTimeline(requestedRevisionId);
        if (checkpoint) {
            const events = await this.options.store.loadEvents(this.options.conversationRef);
            return {
                ...checkpoint,
                rows: this.displayRowsForTimeline(checkpoint, events),
            };
        }
        const rows = await this.options.store.loadDisplayRows(this.options.conversationRef);
        const fallbackRevisionId = requestedRevisionId ?? this.state.revisionId;
        return {
            conversationRef: this.options.conversationRef,
            revisionId: fallbackRevisionId,
            createdAt: new Date().toISOString(),
            rows: rows.map((row, index) => ({
                ...row,
                index,
                revisionId: rowMetadataRevision(row) ?? fallbackRevisionId,
            })),
            reason: null,
            baseRevisionId: null,
        };
    }
    async loadModelHistory(options = {}) {
        const loader = this.options.store.loadModelHistory;
        if (!loader) {
            return null;
        }
        return loader.call(this.options.store, {
            conversationRef: this.options.conversationRef,
            revisionId: Object.prototype.hasOwnProperty.call(options, 'revisionId')
                ? options.revisionId ?? null
                : null,
        });
    }
    isTurnSuperseded(turnRef) {
        const normalizedTurnRef = typeof turnRef === 'string' && turnRef.trim()
            ? turnRef.trim()
            : null;
        return Boolean(normalizedTurnRef && this.state.supersededTurns[normalizedTurnRef]);
    }
    async loadStoredDisplayTimeline(revisionId = null) {
        const loader = this.options.store.loadDisplayTimeline;
        if (!loader) {
            return null;
        }
        return loader.call(this.options.store, {
            conversationRef: this.options.conversationRef,
            revisionId,
        });
    }
    async checkoutRevision(input) {
        const revisionId = typeof input.revisionId === 'string'
            ? input.revisionId.trim()
            : '';
        if (!revisionId) {
            throw new Error('checkoutRevision requires revisionId');
        }
        const displayTimeline = await this.loadStoredDisplayTimeline(revisionId);
        if (!displayTimeline) {
            throw new Error('checkoutRevision requires an existing display timeline revision');
        }
        const modelHistoryCheckpoint = await this.loadModelHistory({ revisionId });
        this.activeDisplayTimeline = displayTimeline;
        this.state = {
            ...this.state,
            revisionId,
        };
        await this.recordRuntimeTrace({
            path: 'conversation.revision',
            stage: 'checkout',
            status: 'succeeded',
            data: {
                revisionId,
                displayRowCount: displayTimeline.rows.length,
                modelHistoryRowCount: modelHistoryCheckpoint?.rows.length ?? 0,
                modelHistoryCheckpointId: modelHistoryCheckpoint?.checkpointId ?? null,
            },
        }, { revisionId });
        const snapshot = await this.load();
        return {
            displayTimeline,
            modelHistoryCheckpoint,
            view: snapshot.view,
        };
    }
    async replaceRows(input) {
        if (!this.options.store.replaceDisplayTimeline) {
            throw new Error('replaceRows requires a display timeline capable conversation store');
        }
        if (!input.baseRevisionId || !input.baseRevisionId.trim()) {
            throw new Error('replaceRows requires baseRevisionId');
        }
        const baseRevisionId = input.baseRevisionId.trim();
        const newRevisionId = (0, events_js_1.createRuntimeId)('rev');
        const createdAt = new Date().toISOString();
        const rows = normalizeDisplayTimelineRows(input.rows, {
            conversationRef: this.options.conversationRef,
            baseRevisionId,
            newRevisionId,
        });
        const checkpoint = {
            conversationRef: this.options.conversationRef,
            revisionId: newRevisionId,
            createdAt,
            rows,
            reason: input.reason,
            baseRevisionId,
        };
        await this.options.store.replaceDisplayTimeline(checkpoint);
        let modelHistoryRowCount = 0;
        let modelHistoryCheckpointId = null;
        if (this.options.store.loadModelHistory && this.options.store.replaceModelHistory) {
            const baseModelHistory = await this.options.store.loadModelHistory.call(this.options.store, {
                conversationRef: this.options.conversationRef,
                revisionId: baseRevisionId,
            });
            if (baseModelHistory) {
                const modelRows = modelRowsForDisplayRevision(baseModelHistory.rows, {
                    keptDisplayRowIds: new Set(rows.map(row => row.id)),
                    conversationRef: this.options.conversationRef,
                    newRevisionId,
                });
                modelHistoryCheckpointId = `${newRevisionId}-replace-rows-model-history`;
                await this.options.store.replaceModelHistory.call(this.options.store, {
                    checkpointId: modelHistoryCheckpointId,
                    conversationRef: this.options.conversationRef,
                    revisionId: newRevisionId,
                    createdAt,
                    rows: modelRows,
                });
                modelHistoryRowCount = modelRows.length;
            }
        }
        this.activeDisplayTimeline = checkpoint;
        this.state = {
            ...this.state,
            revisionId: newRevisionId,
        };
        await this.recordRuntimeTrace({
            path: 'conversation.display_timeline',
            stage: 'replace_rows',
            status: 'succeeded',
            data: {
                rowCount: rows.length,
                reason: input.reason,
                baseRevisionId,
                revisionId: newRevisionId,
                modelHistoryRowCount,
                modelHistoryCheckpointId,
            },
        }, { revisionId: newRevisionId });
        return checkpoint;
    }
    async fork(input) {
        const requestedConversationRef = typeof input.newConversationRef === 'string'
            ? input.newConversationRef.trim()
            : null;
        const newConversationRef = requestedConversationRef || (0, events_js_1.createRuntimeId)('conv');
        if (newConversationRef === this.options.conversationRef) {
            throw new Error('fork requires a distinct newConversationRef');
        }
        if (!this.options.store.replaceDisplayTimeline) {
            throw new Error('fork requires a display timeline capable conversation store');
        }
        const sourceTimeline = await this.loadDisplayTimeline({
            revisionId: input.sourceRevisionId ?? null,
        });
        const cutAfterRowId = typeof input.cutAfterRowId === 'string' && input.cutAfterRowId.trim()
            ? input.cutAfterRowId.trim()
            : sourceTimeline.rows[sourceTimeline.rows.length - 1]?.id ?? '';
        if (!cutAfterRowId) {
            throw new Error('fork requires at least one source display row');
        }
        const newRevisionId = (0, events_js_1.createRuntimeId)('rev');
        const createdAt = new Date().toISOString();
        const displayRows = rowsForFork(sourceTimeline.rows, {
            cutAfterRowId,
            newConversationRef,
            newRevisionId,
        });
        const displayCheckpoint = {
            conversationRef: newConversationRef,
            revisionId: newRevisionId,
            createdAt,
            rows: displayRows,
            reason: 'fork',
            baseRevisionId: sourceTimeline.revisionId,
        };
        await this.options.store.replaceDisplayTimeline(displayCheckpoint);
        let modelHistoryRowCount = 0;
        let modelHistoryCheckpointId = null;
        if (this.options.store.loadModelHistory && this.options.store.replaceModelHistory) {
            const sourceModelHistory = await this.options.store.loadModelHistory.call(this.options.store, {
                conversationRef: this.options.conversationRef,
                revisionId: input.sourceRevisionId ?? sourceTimeline.revisionId,
            });
            if (sourceModelHistory) {
                const modelRows = modelRowsForFork(sourceModelHistory.rows, {
                    keptDisplayRowIds: new Set(sourceTimeline.rows.slice(0, displayRows.length).map(row => row.id)),
                    newConversationRef,
                    newRevisionId,
                });
                if (modelRows.length > 0) {
                    modelHistoryCheckpointId = `${newRevisionId}-fork-model-history`;
                    await this.options.store.replaceModelHistory.call(this.options.store, {
                        checkpointId: modelHistoryCheckpointId,
                        conversationRef: newConversationRef,
                        revisionId: newRevisionId,
                        createdAt,
                        rows: modelRows,
                    });
                    modelHistoryRowCount = modelRows.length;
                }
            }
        }
        await this.recordRuntimeTrace({
            path: 'conversation.revision',
            stage: 'fork',
            status: 'succeeded',
            data: {
                sourceConversationRef: this.options.conversationRef,
                sourceRevisionId: sourceTimeline.revisionId,
                conversationRef: newConversationRef,
                revisionId: newRevisionId,
                cutAfterRowId,
                displayRowCount: displayRows.length,
                modelHistoryRowCount,
            },
        });
        return {
            conversationRef: newConversationRef,
            revisionId: newRevisionId,
            sourceConversationRef: this.options.conversationRef,
            sourceRevisionId: sourceTimeline.revisionId,
            cutAfterRowId,
            displayTimeline: displayCheckpoint,
            displayRowCount: displayRows.length,
            modelHistoryRowCount,
            modelHistoryCheckpointId,
        };
    }
    subscribe(listener) {
        this.listeners.add(listener);
        void this.load().then(snapshot => listener(snapshot));
        return () => {
            this.listeners.delete(listener);
        };
    }
    async getView() {
        const snapshot = await this.load();
        return snapshot.view;
    }
    subscribeView(listener) {
        return this.subscribe(snapshot => listener(snapshot.view));
    }
    subscribeEvents(listener) {
        this.eventListeners.add(listener);
        return () => {
            this.eventListeners.delete(listener);
        };
    }
    attachTransport() {
        if (!this.options.transport || this.detachTransport) {
            return;
        }
        this.detachTransport = this.options.transport.subscribe(sourceEvent => {
            if (!(0, backendEvents_js_1.isBackendEvent)(sourceEvent)) {
                return;
            }
            const event = (0, backendEventNormalizer_js_1.normalizeBackendEventToConversationEvent)(sourceEvent, {
                fallbackRevisionId: this.state.revisionId,
                fallbackConversationRef: this.options.conversationRef,
                fallbackTurnRef: this.state.activeTurnRef ?? undefined,
            });
            if (event) {
                this.enqueueBackendEvent(event);
            }
        });
    }
    async send(input) {
        assertRuntimeSendInputEnvelope(input);
        if (input.model) {
            await this.setModel(input.model);
        }
        const turnRef = input.turnRef ?? (0, events_js_1.createRuntimeId)('turn');
        const revisionId = this.state.revisionId === 'rev-empty'
            ? (0, events_js_1.createRuntimeId)('rev')
            : this.state.revisionId;
        const memoryDiagnostics = [];
        const emitMemoryDiagnostic = (diagnostic) => {
            memoryDiagnostics.push(diagnostic);
        };
        const traceRecorder = new TraceRecorder_js_1.TraceRecorder({
            conversationRef: this.options.conversationRef,
            turnRef,
            userId: this.options.userId ?? null,
            emit: async (payload) => {
                await this.applyEvent((0, events_js_1.createConversationEvent)({
                    eventId: this.nextLocalEventId(turnRef, 'trace_event'),
                    type: 'trace_event',
                    conversationRef: this.options.conversationRef,
                    revisionId,
                    turnRef,
                    source: 'sdk',
                    payload,
                }));
            },
        });
        const pendingTurn = {
            turnRef,
            conversationRef: this.options.conversationRef,
            revisionId,
            userText: input.text,
        };
        this.pendingTurns.set(turnRef, pendingTurn);
        let queryMessageId;
        try {
            await this.applyEvent((0, events_js_1.createConversationEvent)({
                eventId: this.nextLocalEventId(turnRef, 'turn_started'),
                type: 'turn_started',
                conversationRef: this.options.conversationRef,
                revisionId,
                turnRef,
                source: 'sdk',
                payload: {},
            }));
            const resources = this.withStableDisplayAttachmentIds(input.resources ?? [], turnRef);
            this.setLiveDisplayAttachments(this.options.conversationRef, turnRef, this.initialLiveDisplayAttachments(resources));
            const baseUserPayload = {
                ...userMessageDisplayPayloadFrom(input.payload),
                ...userMessageDisplayPayloadFrom(input.metadata),
            };
            await this.applyEvent((0, events_js_1.createConversationEvent)({
                eventId: this.nextLocalEventId(turnRef, 'user_message'),
                type: 'user_message',
                conversationRef: this.options.conversationRef,
                revisionId,
                turnRef,
                source: 'ui',
                payload: {
                    ...baseUserPayload,
                    text: input.text,
                },
            }));
            const sourcePayload = isJsonRecord(input.payload) ? input.payload : {};
            const resourceKinds = resources.map(resource => resource.kind);
            const resourceResolutionStartedAtMs = nowMs();
            await traceRecorder.record({
                path: 'query.resources',
                stage: 'resolve',
                status: 'started',
                data: {
                    resourceCount: resources.length,
                    resourceKinds,
                    resolverRegisteredCount: this.options.resourceResolvers
                        ? Object.keys(this.options.resourceResolvers).length
                        : 0,
                },
            });
            let resourceResolution;
            try {
                resourceResolution = await (0, TurnInputPipeline_js_1.resolveTurnInputResources)({
                    resources,
                    resolvers: this.options.resourceResolvers ?? null,
                    context: {
                        text: input.text,
                        conversationRef: this.options.conversationRef,
                        turnRef,
                        payload: sourcePayload,
                        traceContext: traceRecorder.context(),
                        emitTrace: async (traceEvent) => {
                            await traceRecorder.record(traceEvent);
                        },
                    },
                });
                await traceRecorder.record({
                    path: 'query.resources',
                    stage: 'resolve',
                    status: 'succeeded',
                    durationMs: durationSince(resourceResolutionStartedAtMs),
                    data: {
                        resourceCount: resources.length,
                        resourceKinds,
                        payloadKeyCount: Object.keys(resourceResolution.payload).length,
                        metadataKeyCount: Object.keys(resourceResolution.metadata).length,
                    },
                });
            }
            catch (error) {
                this.markLiveDisplayAttachmentsFailed(this.options.conversationRef, turnRef);
                await traceRecorder.record({
                    path: 'query.resources',
                    stage: 'resolve',
                    status: 'failed',
                    durationMs: durationSince(resourceResolutionStartedAtMs),
                    error,
                    data: {
                        resourceCount: resources.length,
                        resourceKinds,
                    },
                });
                throw error;
            }
            this.mergeLiveDisplayAttachments(this.options.conversationRef, turnRef, displayAttachmentsFromUnknown(resourceResolution.metadata.attachments));
            const payloadForEnrichment = {
                ...sourcePayload,
                ...resourceResolution.payload,
            };
            const enrichedPayload = this.options.enrichQuery
                ? await this.options.enrichQuery({
                    text: input.text,
                    conversationRef: this.options.conversationRef,
                    payload: payloadForEnrichment,
                    emitDiagnostic: emitMemoryDiagnostic,
                    traceContext: traceRecorder.context(),
                    emitTrace: async (traceEvent) => {
                        await traceRecorder.record(traceEvent);
                    },
                })
                : payloadForEnrichment;
            const sdkAgentDefinition = isJsonRecord(this.options.agentDefinition)
                ? this.options.agentDefinition
                : null;
            const queryAgentDefinition = isJsonRecord(enrichedPayload.agent_definition)
                ? enrichedPayload.agent_definition
                : null;
            const mergedAgentDefinition = (0, AgentSession_js_1.mergeQueryAgentDefinition)(sdkAgentDefinition ?? undefined, queryAgentDefinition);
            const transportPayload = mergedAgentDefinition
                ? {
                    ...enrichedPayload,
                    agent_definition: mergedAgentDefinition,
                }
                : enrichedPayload;
            for (const diagnostic of memoryDiagnostics) {
                await this.applyEvent((0, events_js_1.createConversationEvent)({
                    eventId: this.nextLocalEventId(turnRef, 'memory_retrieval_diagnostic'),
                    type: 'memory_retrieval_diagnostic',
                    conversationRef: this.options.conversationRef,
                    revisionId,
                    turnRef,
                    source: 'sdk',
                    payload: {
                        ...diagnostic,
                    },
                }));
            }
            const metadataPayload = {
                ...resourceResolution.metadata,
                ...enrichedPayload,
            };
            const workspaceResources = resources.filter(resource => resource.kind === 'workspace');
            const workspacePathPresent = typeof enrichedPayload.workspace_path === 'string'
                ? enrichedPayload.workspace_path.trim().length > 0
                : typeof resourceResolution.payload.workspace_path === 'string'
                    && resourceResolution.payload.workspace_path.trim().length > 0;
            await traceRecorder.record({
                path: 'workspace.context',
                stage: 'resolve',
                status: workspaceResources.length > 0 || workspacePathPresent ? 'succeeded' : 'skipped',
                data: {
                    workspaceResourceCount: workspaceResources.length,
                    hasWorkspacePath: workspacePathPresent,
                    hasWorkspaceResource: workspaceResources.length > 0,
                    sourceKind: workspaceResources.length > 0
                        ? 'resource'
                        : (workspacePathPresent ? 'payload' : 'none'),
                },
            });
            const agentDefinition = isJsonRecord(transportPayload.agent_definition)
                ? transportPayload.agent_definition
                : null;
            const mcpManifestStats = getMcpManifestToolStats(agentDefinition);
            const sdkMcpManifestStats = getMcpManifestToolStats(sdkAgentDefinition);
            const queryMcpManifestStats = getMcpManifestToolStats(queryAgentDefinition);
            await traceRecorder.record({
                path: 'agent.definition',
                stage: 'shape',
                status: agentDefinition ? 'succeeded' : 'skipped',
                data: {
                    hasAgentDefinition: Boolean(agentDefinition),
                    hasSdkAgentDefinition: Boolean(sdkAgentDefinition),
                    hasQueryAgentDefinition: Boolean(queryAgentDefinition),
                    toolCount: getAgentDefinitionToolCount(agentDefinition),
                    sdkToolCount: getAgentDefinitionToolCount(sdkAgentDefinition),
                    queryToolCount: getAgentDefinitionToolCount(queryAgentDefinition),
                    pluginCount: arrayRecordCount(agentDefinition?.plugins),
                    mcpCount: arrayRecordCount(agentDefinition?.mcps),
                    mcpManifestToolCount: mcpManifestStats.toolCount,
                    sdkMcpManifestToolCount: sdkMcpManifestStats.toolCount,
                    queryMcpManifestToolCount: queryMcpManifestStats.toolCount,
                    skillCount: arrayRecordCount(agentDefinition?.skills),
                    capabilityRevision: getAgentDefinitionCapabilityRevision(agentDefinition),
                    sdkCapabilityRevision: getAgentDefinitionCapabilityRevision(sdkAgentDefinition),
                    queryCapabilityRevision: getAgentDefinitionCapabilityRevision(queryAgentDefinition),
                    agentDefinitionKeyCount: recordKeyCount(agentDefinition),
                    hasWorkspacePath: workspacePathPresent,
                    hasLocalRuntime: Boolean(this.options.localRuntime),
                },
            });
            await traceRecorder.record({
                path: 'extension.load',
                stage: 'contribute',
                status: arrayRecordCount(agentDefinition?.plugins) > 0 ? 'succeeded' : 'skipped',
                data: {
                    pluginCount: arrayRecordCount(agentDefinition?.plugins),
                    hasAgentDefinition: Boolean(agentDefinition),
                },
            });
            await traceRecorder.record({
                path: 'mcp.tool',
                stage: 'contribute',
                status: mcpManifestStats.toolCount > 0 || arrayRecordCount(agentDefinition?.mcps) > 0
                    ? 'succeeded'
                    : 'skipped',
                data: {
                    mcpServerCount: mcpManifestStats.serverCount || arrayRecordCount(agentDefinition?.mcps),
                    mcpDefinitionCount: arrayRecordCount(agentDefinition?.mcps),
                    mcpManifestToolCount: mcpManifestStats.toolCount,
                    capabilityRevision: getAgentDefinitionCapabilityRevision(agentDefinition),
                    hasAgentDefinition: Boolean(agentDefinition),
                },
            });
            if (resources.some(resource => resource.kind === 'query_screenshot_request')) {
                await traceRecorder.record({
                    path: 'screenshot.capture',
                    stage: 'query_payload_applied',
                    status: 'succeeded',
                    data: {
                        hasScreenshotRef: typeof enrichedPayload.screenshot_ref === 'string'
                            && enrichedPayload.screenshot_ref.trim().length > 0,
                        screenshotRefCount: Array.isArray(enrichedPayload.screenshot_refs)
                            ? enrichedPayload.screenshot_refs.length
                            : (typeof enrichedPayload.screenshot_ref === 'string' ? 1 : 0),
                        hasCaptureMeta: isJsonRecord(enrichedPayload.capture_meta),
                    },
                });
            }
            if (this.options.enrichQuery || hasOwnEnumerableKeys(resourceResolution.metadata)) {
                await this.applyEvent((0, events_js_1.createConversationEvent)({
                    eventId: this.nextLocalEventId(turnRef, 'user_message_metadata'),
                    type: 'user_message_metadata',
                    conversationRef: this.options.conversationRef,
                    revisionId,
                    turnRef,
                    source: 'sdk',
                    payload: {
                        ...metadataPayload,
                        text: input.text,
                    },
                }));
            }
            if (!this.options.transport) {
                await traceRecorder.record({
                    path: 'query.dispatch',
                    stage: 'transport_send',
                    status: 'skipped',
                    data: {
                        reason: 'transport_unavailable',
                        resourceCount: resources.length,
                        payloadKeyCount: Object.keys(transportPayload).length,
                        hasModelOverride: Boolean(input.model),
                    },
                });
                queryMessageId = turnRef;
            }
            else {
                const dispatchStartedAtMs = nowMs();
                await traceRecorder.record({
                    path: 'query.dispatch',
                    stage: 'transport_send',
                    status: 'started',
                    data: {
                        resourceCount: resources.length,
                        payloadKeyCount: Object.keys(transportPayload).length,
                        hasModelOverride: Boolean(input.model),
                        hasConversationRef: true,
                    },
                });
                try {
                    const sentQueryMessageId = await this.options.transport.sendQuery({
                        ...transportPayload,
                        text: input.text,
                        conversation_ref: this.options.conversationRef,
                        revision_id: revisionId,
                    }, {
                        messageId: turnRef,
                    });
                    if (!sentQueryMessageId) {
                        throw new Error('Failed to send query to backend');
                    }
                    await traceRecorder.record({
                        path: 'query.dispatch',
                        stage: 'transport_send',
                        status: 'succeeded',
                        requestId: sentQueryMessageId,
                        durationMs: durationSince(dispatchStartedAtMs),
                        data: {
                            backendMessageId: sentQueryMessageId,
                            backendAccepted: true,
                        },
                    });
                    queryMessageId = sentQueryMessageId;
                }
                catch (error) {
                    await traceRecorder.record({
                        path: 'query.dispatch',
                        stage: 'transport_send',
                        status: 'failed',
                        durationMs: durationSince(dispatchStartedAtMs),
                        error,
                        data: {
                            backendAccepted: false,
                        },
                    });
                    throw error;
                }
            }
        }
        catch (error) {
            this.pendingTurns.delete(turnRef);
            await this.applyEvent((0, events_js_1.createConversationEvent)({
                eventId: this.nextLocalEventId(turnRef, 'turn_error'),
                type: 'turn_error',
                conversationRef: this.options.conversationRef,
                revisionId,
                turnRef,
                source: 'sdk',
                payload: {
                    error: error instanceof Error ? error.message : String(error),
                    reason: 'send_failed',
                },
            }));
            throw error;
        }
        return { turnRef, queryMessageId };
    }
    async *stream(input) {
        const queue = [];
        let finished = false;
        let notify = null;
        let sendError = null;
        const wake = () => {
            notify?.();
            notify = null;
        };
        const push = (event) => {
            if (finished) {
                return;
            }
            queue.push(event);
            if (event.type === 'conversation_event' && isTerminalConversationEvent(event.event)) {
                finished = true;
            }
            wake();
        };
        const next = async () => {
            while (queue.length === 0 && !finished) {
                await new Promise(resolve => {
                    notify = resolve;
                });
            }
            return queue.shift() ?? null;
        };
        const unsubscribe = this.subscribeEvents((event, snapshot) => {
            push({ type: 'conversation_event', event, snapshot });
        });
        const sendPromise = this.send(input)
            .then(async (result) => {
            push({
                type: 'turn_started',
                result,
                snapshot: await this.load(),
            });
        })
            .catch(async (error) => {
            sendError = error;
            let snapshot;
            try {
                snapshot = await this.load();
            }
            catch {
                snapshot = undefined;
            }
            push({ type: 'error', error, snapshot });
            finished = true;
            wake();
        });
        try {
            while (true) {
                const event = await next();
                if (!event) {
                    break;
                }
                yield event;
            }
            await sendPromise;
            if (sendError) {
                throw sendError;
            }
        }
        finally {
            finished = true;
            unsubscribe();
            wake();
        }
    }
    async editAndResend(input) {
        const normalizedText = input.text.trim();
        if (!normalizedText) {
            throw new Error('editAndResend requires non-empty text');
        }
        const displayTimeline = await this.loadDisplayTimeline();
        const userIndex = displayTimeline.rows.findIndex(row => (row.role === 'user'
            && row.type === 'user_message'
            && displayRowMatchesId(row, input.messageId)));
        if (userIndex < 0) {
            throw new Error(`Cannot edit missing user message: ${input.messageId}`);
        }
        const replayPayload = mergeReplayPayload(replayPayloadFromDisplayRow(displayTimeline.rows[userIndex]), input.payload);
        replayPayload.text = normalizedText;
        const turnRef = input.turnRef ?? (0, events_js_1.createRuntimeId)('turn');
        const timestamp = new Date().toISOString();
        const checkpoint = await this.replaceRows({
            rows: [
                ...displayTimeline.rows.slice(0, userIndex),
                replacementUserDisplayRow(displayTimeline.rows[userIndex], {
                    baseRevisionId: displayTimeline.revisionId,
                    text: normalizedText,
                    timestamp,
                    turnRef,
                }),
            ],
            baseRevisionId: displayTimeline.revisionId,
            reason: 'user_edit',
        });
        const supersededTurnRef = displayTimeline.rows[userIndex].turnRef;
        const shouldStopSupersededTurn = this.shouldStopSupersededTurn(supersededTurnRef);
        await this.supersedeTurn({
            supersededTurnRef,
            replacementTurnRef: turnRef,
            revisionId: checkpoint.revisionId,
            reason: 'user_edit',
        });
        this.requestBestEffortSupersededTurnStop(supersededTurnRef, shouldStopSupersededTurn);
        return this.send({
            text: normalizedText,
            turnRef,
            model: input.model,
            payload: replayPayload,
        });
    }
    async retryTurn(input = {}) {
        const displayTimeline = await this.loadDisplayTimeline();
        const targetIndex = input.messageId
            ? displayTimeline.rows.findIndex(row => displayRowMatchesId(row, input.messageId))
            : displayTimeline.rows.length - 1;
        if (input.messageId && targetIndex < 0) {
            throw new Error(`Cannot retry missing message: ${input.messageId}`);
        }
        const searchStart = targetIndex >= 0 ? targetIndex : displayTimeline.rows.length - 1;
        let userIndex = -1;
        for (let index = searchStart; index >= 0; index -= 1) {
            const row = displayTimeline.rows[index];
            if (row?.role === 'user' && row.type === 'user_message') {
                userIndex = index;
                break;
            }
        }
        if (userIndex < 0) {
            throw new Error('Cannot retry without a previous user message');
        }
        const userRow = displayTimeline.rows[userIndex];
        const retryText = typeof userRow.content === 'string' ? userRow.content : '';
        if (!retryText.trim()) {
            throw new Error('Cannot retry a user message with empty text');
        }
        const replayPayload = mergeReplayPayload(replayPayloadFromDisplayRow(userRow), input.payload);
        replayPayload.text = retryText;
        const turnRef = input.turnRef ?? (0, events_js_1.createRuntimeId)('turn');
        const timestamp = new Date().toISOString();
        const checkpoint = await this.replaceRows({
            rows: [
                ...displayTimeline.rows.slice(0, userIndex),
                replacementUserDisplayRow(userRow, {
                    baseRevisionId: displayTimeline.revisionId,
                    text: retryText,
                    timestamp,
                    turnRef,
                }),
            ],
            baseRevisionId: displayTimeline.revisionId,
            reason: 'retry',
        });
        const supersededTurnRef = userRow.turnRef;
        const shouldStopSupersededTurn = this.shouldStopSupersededTurn(supersededTurnRef);
        await this.supersedeTurn({
            supersededTurnRef,
            replacementTurnRef: turnRef,
            revisionId: checkpoint.revisionId,
            reason: 'retry',
        });
        this.requestBestEffortSupersededTurnStop(supersededTurnRef, shouldStopSupersededTurn);
        return this.send({
            text: retryText,
            turnRef,
            model: input.model,
            payload: replayPayload,
        });
    }
    shouldStopSupersededTurn(turnRef) {
        const normalizedTurnRef = this.normalizeTurnRef(turnRef);
        if (!normalizedTurnRef || normalizedTurnRef !== this.state.activeTurnRef) {
            return false;
        }
        return this.state.phase !== 'idle'
            && this.state.phase !== 'completed'
            && this.state.phase !== 'stopped'
            && this.state.phase !== 'error';
    }
    async supersedeTurn(input) {
        const supersededTurnRef = this.normalizeTurnRef(input.supersededTurnRef);
        const replacementTurnRef = this.normalizeTurnRef(input.replacementTurnRef);
        if (!supersededTurnRef || !replacementTurnRef || supersededTurnRef === replacementTurnRef) {
            return;
        }
        const createdAt = new Date().toISOString();
        this.pendingTurns.delete(supersededTurnRef);
        this.liveDisplayAttachmentsByTurn.delete(`${this.options.conversationRef}:${supersededTurnRef}`);
        await this.applyEvent((0, events_js_1.createConversationEvent)({
            eventId: this.nextLocalEventId(supersededTurnRef, 'turn_superseded'),
            type: 'turn_superseded',
            conversationRef: this.options.conversationRef,
            revisionId: input.revisionId,
            turnRef: supersededTurnRef,
            source: 'sdk',
            payload: {
                supersededTurnRef,
                replacementTurnRef,
                revisionId: input.revisionId,
                reason: input.reason,
                createdAt,
            },
        }));
    }
    requestBestEffortSupersededTurnStop(turnRef, shouldStop) {
        const supersededTurnRef = this.normalizeTurnRef(turnRef);
        if (!supersededTurnRef || !shouldStop) {
            return;
        }
        void this.stop(supersededTurnRef).catch(error => {
            console.warn('[Agent SDK] Superseded turn stop failed:', error instanceof Error ? error.message : String(error));
        });
    }
    async stop(turnRef = this.state.activeTurnRef ?? null) {
        const startedAtMs = nowMs();
        await this.applyEvent((0, events_js_1.createConversationEvent)({
            eventId: this.nextLocalEventId(turnRef, 'turn_stopped'),
            type: 'turn_stopped',
            conversationRef: this.options.conversationRef,
            revisionId: this.state.revisionId,
            turnRef,
            source: 'ui',
            payload: {},
        }));
        if (!this.options.transport) {
            await this.recordRuntimeTrace({
                path: 'websocket.control',
                stage: 'send',
                status: 'skipped',
                data: {
                    reason: 'transport_unavailable',
                    messageType: 'stop-query',
                    hasTurnRef: Boolean(turnRef),
                },
            }, { turnRef });
        }
        else {
            await this.recordRuntimeTrace({
                path: 'websocket.control',
                stage: 'send',
                status: 'started',
                data: {
                    messageType: 'stop-query',
                    hasTurnRef: Boolean(turnRef),
                },
            }, { turnRef });
            try {
                await this.options.transport.stop({
                    conversation_ref: this.options.conversationRef,
                    turn_ref: turnRef,
                });
                await this.recordRuntimeTrace({
                    path: 'websocket.control',
                    stage: 'send',
                    status: 'succeeded',
                    durationMs: durationSince(startedAtMs),
                    data: {
                        messageType: 'stop-query',
                        hasTurnRef: Boolean(turnRef),
                    },
                }, { turnRef });
            }
            catch (error) {
                await this.recordRuntimeTrace({
                    path: 'websocket.control',
                    stage: 'send',
                    status: 'failed',
                    durationMs: durationSince(startedAtMs),
                    error,
                    data: {
                        messageType: 'stop-query',
                        hasTurnRef: Boolean(turnRef),
                    },
                }, { turnRef });
                throw error;
            }
        }
    }
    async rehydrate(input = {}) {
        const startedAtMs = nowMs();
        const modelHistoryCheckpoint = await this.loadModelHistoryCheckpointForRehydrate();
        const modelHistoryPayload = modelHistoryCheckpoint && modelHistoryCheckpoint.rows.length > 0
            ? (0, modelHistoryPayload_js_1.modelHistoryPayloadFromCheckpoint)(modelHistoryCheckpoint)
            : null;
        const snapshot = modelHistoryCheckpoint
            ? (0, modelHistoryPayload_js_1.rehydrateSnapshotFromModelHistoryCheckpoint)(modelHistoryCheckpoint) ?? {
                conversationRef: this.options.conversationRef,
                revisionId: modelHistoryCheckpoint.revisionId,
                messages: [],
            }
            : {
                conversationRef: this.options.conversationRef,
                revisionId: this.state.revisionId,
                messages: [],
            };
        const rehydrateTraceData = {
            messageCount: 0,
            modelHistoryRowCount: modelHistoryCheckpoint?.rows.length ?? 0,
            modelHistoryCheckpointId: modelHistoryCheckpoint?.checkpointId ?? null,
            source: modelHistoryPayload ? 'model_history' : 'missing_model_history',
            rehydrateMode: 'replace',
        };
        if (!modelHistoryPayload) {
            await this.recordRuntimeTrace({
                path: 'conversation.rehydrate',
                stage: 'transport_send',
                status: 'skipped',
                data: {
                    reason: 'missing_model_history_checkpoint',
                    ...rehydrateTraceData,
                },
            });
            return snapshot;
        }
        const payload = {
            conversation_ref: this.options.conversationRef,
            messages: [],
            model_history: modelHistoryPayload,
            rehydrate_mode: 'replace',
            workspace_path: optionalPayloadString(input.workspace_path),
            repo_instruction_messages: optionalPayloadRecords(input.repo_instruction_messages),
        };
        if (!this.options.transport) {
            await this.recordRuntimeTrace({
                path: 'conversation.rehydrate',
                stage: 'transport_send',
                status: 'skipped',
                data: {
                    reason: 'transport_unavailable',
                    ...rehydrateTraceData,
                },
            });
            return snapshot;
        }
        await this.recordRuntimeTrace({
            path: 'conversation.rehydrate',
            stage: 'transport_send',
            status: 'started',
            data: rehydrateTraceData,
        });
        try {
            await this.options.transport.rehydrateConversation(payload);
            await this.recordRuntimeTrace({
                path: 'conversation.rehydrate',
                stage: 'transport_send',
                status: 'succeeded',
                durationMs: durationSince(startedAtMs),
                data: rehydrateTraceData,
            });
        }
        catch (error) {
            await this.recordRuntimeTrace({
                path: 'conversation.rehydrate',
                stage: 'transport_send',
                status: 'failed',
                durationMs: durationSince(startedAtMs),
                error,
                data: rehydrateTraceData,
            });
            throw error;
        }
        return snapshot;
    }
    async rehydrateMessages(payload) {
        const messages = Array.isArray(payload.messages) ? payload.messages : [];
        const startedAtMs = nowMs();
        if (!this.options.transport) {
            await this.recordRuntimeTrace({
                path: 'conversation.rehydrate',
                stage: 'transport_send',
                status: 'skipped',
                data: {
                    reason: 'transport_unavailable',
                    messageCount: messages.length,
                    rehydrateMode: 'replace',
                },
            });
            return;
        }
        await this.recordRuntimeTrace({
            path: 'conversation.rehydrate',
            stage: 'transport_send',
            status: 'started',
            data: {
                messageCount: messages.length,
                rehydrateMode: 'replace',
            },
        });
        try {
            await this.options.transport.rehydrateConversation({
                ...payload,
                rehydrate_mode: 'replace',
            });
            await this.recordRuntimeTrace({
                path: 'conversation.rehydrate',
                stage: 'transport_send',
                status: 'succeeded',
                durationMs: durationSince(startedAtMs),
                data: {
                    messageCount: messages.length,
                    rehydrateMode: 'replace',
                },
            });
        }
        catch (error) {
            await this.recordRuntimeTrace({
                path: 'conversation.rehydrate',
                stage: 'transport_send',
                status: 'failed',
                durationMs: durationSince(startedAtMs),
                error,
                data: {
                    messageCount: messages.length,
                    rehydrateMode: 'replace',
                },
            });
            throw error;
        }
    }
    async compactHistory(input = {}) {
        const payload = {
            ...(input.payload ?? {}),
            force: input.force ?? true,
            conversation_ref: this.options.conversationRef,
        };
        const startedAtMs = nowMs();
        if (!this.options.transport) {
            await this.recordRuntimeTrace({
                path: 'compaction.lifecycle',
                stage: 'request',
                status: 'skipped',
                data: {
                    reason: 'transport_unavailable',
                    force: payload.force,
                    payloadKeyCount: Object.keys(payload).length,
                },
            });
            return undefined;
        }
        await this.recordRuntimeTrace({
            path: 'compaction.lifecycle',
            stage: 'request',
            status: 'started',
            data: {
                force: payload.force,
                payloadKeyCount: Object.keys(payload).length,
            },
        });
        try {
            const backendMessageId = await this.options.transport.compactHistory(payload);
            const requestId = optionalRequestId(backendMessageId);
            await this.recordRuntimeTrace({
                path: 'compaction.lifecycle',
                stage: 'request',
                status: 'succeeded',
                requestId,
                durationMs: durationSince(startedAtMs),
                data: {
                    force: payload.force,
                    backendMessageId: requestId,
                },
            });
            return backendMessageId;
        }
        catch (error) {
            await this.recordRuntimeTrace({
                path: 'compaction.lifecycle',
                stage: 'request',
                status: 'failed',
                durationMs: durationSince(startedAtMs),
                error,
                data: {
                    force: payload.force,
                },
            });
            throw error;
        }
    }
    async wakewordDetected(payload = {}) {
        const startedAtMs = nowMs();
        if (!this.options.transport) {
            await this.recordRuntimeTrace({
                path: 'wakeword.runtime',
                stage: 'activate',
                status: 'skipped',
                data: {
                    reason: 'transport_unavailable',
                    payloadKeyCount: Object.keys(payload).length,
                },
            });
            await this.recordRuntimeTrace({
                path: 'websocket.control',
                stage: 'send',
                status: 'skipped',
                data: {
                    reason: 'transport_unavailable',
                    messageType: 'wakeword-detected',
                },
            });
            return undefined;
        }
        await this.recordRuntimeTrace({
            path: 'wakeword.runtime',
            stage: 'activate',
            status: 'started',
            data: {
                payloadKeyCount: Object.keys(payload).length,
            },
        });
        await this.recordRuntimeTrace({
            path: 'websocket.control',
            stage: 'send',
            status: 'started',
            data: {
                messageType: 'wakeword-detected',
            },
        });
        try {
            const backendMessageId = await this.options.transport.wakewordDetected(payload);
            const requestId = optionalRequestId(backendMessageId);
            await this.recordRuntimeTrace({
                path: 'wakeword.runtime',
                stage: 'activate',
                status: 'succeeded',
                requestId,
                durationMs: durationSince(startedAtMs),
                data: {
                    backendMessageId: requestId,
                },
            });
            await this.recordRuntimeTrace({
                path: 'websocket.control',
                stage: 'send',
                status: 'succeeded',
                requestId,
                durationMs: durationSince(startedAtMs),
                data: {
                    messageType: 'wakeword-detected',
                    backendMessageId: requestId,
                },
            });
            return backendMessageId;
        }
        catch (error) {
            await this.recordRuntimeTrace({
                path: 'wakeword.runtime',
                stage: 'activate',
                status: 'failed',
                durationMs: durationSince(startedAtMs),
                error,
            });
            await this.recordRuntimeTrace({
                path: 'websocket.control',
                stage: 'send',
                status: 'failed',
                durationMs: durationSince(startedAtMs),
                error,
                data: {
                    messageType: 'wakeword-detected',
                },
            });
            throw error;
        }
    }
    async updateSettings(payload) {
        const updatedKeys = Object.keys(payload).sort();
        const startedAtMs = nowMs();
        if (!this.options.transport) {
            await this.recordRuntimeTrace({
                path: 'settings.sync',
                stage: 'update',
                status: 'skipped',
                data: {
                    reason: 'transport_unavailable',
                    updatedKeys,
                },
            });
            return undefined;
        }
        await this.recordRuntimeTrace({
            path: 'settings.sync',
            stage: 'update',
            status: 'started',
            data: {
                updatedKeys,
            },
        });
        try {
            const backendMessageId = await this.options.transport.updateSettings(payload);
            const requestId = optionalRequestId(backendMessageId);
            await this.recordRuntimeTrace({
                path: 'settings.sync',
                stage: 'update',
                status: 'succeeded',
                requestId,
                durationMs: durationSince(startedAtMs),
                data: {
                    updatedKeys,
                    backendMessageId: requestId,
                },
            });
            return backendMessageId;
        }
        catch (error) {
            await this.recordRuntimeTrace({
                path: 'settings.sync',
                stage: 'update',
                status: 'failed',
                durationMs: durationSince(startedAtMs),
                error,
                data: {
                    updatedKeys,
                },
            });
            throw error;
        }
    }
    async requestModelList() {
        const startedAtMs = nowMs();
        if (!this.options.transport) {
            await this.recordRuntimeTrace({
                path: 'model.catalog',
                stage: 'list',
                status: 'skipped',
                data: {
                    reason: 'transport_unavailable',
                },
            });
            return undefined;
        }
        await this.recordRuntimeTrace({
            path: 'model.catalog',
            stage: 'list',
            status: 'started',
        });
        try {
            const backendMessageId = await this.options.transport.listModels();
            const requestId = optionalRequestId(backendMessageId);
            await this.recordRuntimeTrace({
                path: 'model.catalog',
                stage: 'list',
                status: 'succeeded',
                requestId,
                durationMs: durationSince(startedAtMs),
                data: {
                    backendMessageId: requestId,
                },
            });
            return backendMessageId;
        }
        catch (error) {
            await this.recordRuntimeTrace({
                path: 'model.catalog',
                stage: 'list',
                status: 'failed',
                durationMs: durationSince(startedAtMs),
                error,
            });
            throw error;
        }
    }
    async ensureConnected() {
        await this.options.transport?.connect();
    }
    async setModel(selection) {
        if (!this.options.transport) {
            throw new Error('ConversationRuntime.setModel requires an agent runtime transport');
        }
        const settings = (0, modelSelection_js_1.buildModelSettingsPatch)(selection, 'ConversationRuntime.setModel');
        const backendMessageId = await this.updateSettings(settings);
        const requestId = optionalRequestId(backendMessageId);
        const revisionId = this.state.revisionId === 'rev-empty'
            ? (0, events_js_1.createRuntimeId)('rev')
            : this.state.revisionId;
        await this.applyEvent((0, events_js_1.createConversationEvent)({
            eventId: this.nextLocalEventId(null, 'settings_updated'),
            type: 'settings_updated',
            conversationRef: this.options.conversationRef,
            revisionId,
            source: 'sdk',
            payload: {
                ...settings,
                backendMessageId: requestId,
            },
        }));
        return backendMessageId;
    }
    close() {
        this.detachTransport?.();
        this.detachTransport = undefined;
        this.listeners.clear();
        this.eventListeners.clear();
    }
    normalizeTurnRef(turnRef) {
        return typeof turnRef === 'string' && turnRef.trim() ? turnRef.trim() : null;
    }
    isEventSupersededForLive(event) {
        if (event.type === 'turn_superseded') {
            return false;
        }
        return this.isTurnSuperseded(event.turnRef);
    }
    async applyEvent(event) {
        const supersededForLive = this.isEventSupersededForLive(event);
        this.events = [...this.events, event];
        if (!supersededForLive || event.type === 'turn_superseded') {
            this.state = (0, conversationReducer_js_1.reduceConversationRuntimeState)(this.state, event);
        }
        if ((event.type === 'turn_stopped' || event.type === 'turn_error') && event.turnRef) {
            this.pendingTurns.delete(event.turnRef);
        }
        const snapshot = this.snapshot(this.events);
        this.notify(snapshot, event);
        await this.options.store.appendEvent(event);
        if (!supersededForLive) {
            await this.persistModelHistoryCheckpoint(event);
            await this.maybeExecuteTool(event);
        }
    }
    async persistModelHistoryCheckpoint(event) {
        if (event.type !== 'model_history_updated' || !this.options.store.replaceModelHistory) {
            return;
        }
        const checkpoint = this.modelHistoryCheckpointFromEvent(event);
        if (!checkpoint) {
            return;
        }
        await this.options.store.replaceModelHistory(checkpoint);
    }
    modelHistoryCheckpointFromEvent(event) {
        const checkpointId = typeof event.payload.checkpointId === 'string'
            ? event.payload.checkpointId
            : null;
        const revisionId = typeof event.payload.revisionId === 'string'
            ? event.payload.revisionId
            : event.revisionId;
        const createdAt = typeof event.payload.createdAt === 'string'
            ? event.payload.createdAt
            : event.timestamp;
        const rows = Array.isArray(event.payload.rows)
            ? event.payload.rows.filter((row) => Boolean(row && typeof row === 'object'))
            : [];
        if (!checkpointId || !revisionId) {
            return null;
        }
        return {
            checkpointId,
            conversationRef: event.conversationRef,
            revisionId,
            createdAt,
            rows: attachDisplaySourcesToModelHistoryRows(rows, this.displayRowsForSnapshot(this.events).filter(row => rowMetadataRevision(row) === revisionId)),
        };
    }
    async loadModelHistoryCheckpointForRehydrate() {
        const loader = this.options.store.loadModelHistory;
        if (!loader) {
            return null;
        }
        const revisionId = this.state.revisionId === 'rev-empty' ? null : this.state.revisionId;
        return loader.call(this.options.store, {
            conversationRef: this.options.conversationRef,
            revisionId,
        });
    }
    async recordRuntimeTrace(input, options = {}) {
        const turnRef = options.turnRef ?? null;
        const revisionId = options.revisionId
            ?? (this.state.revisionId === 'rev-empty' ? (0, events_js_1.createRuntimeId)('rev') : this.state.revisionId);
        const traceRecorder = new TraceRecorder_js_1.TraceRecorder({
            conversationRef: this.options.conversationRef,
            turnRef,
            userId: this.options.userId ?? null,
            traceId: options.traceId ?? null,
            emit: async (payload) => {
                await this.applyEvent((0, events_js_1.createConversationEvent)({
                    eventId: this.nextLocalEventId(turnRef, 'trace_event'),
                    type: 'trace_event',
                    conversationRef: this.options.conversationRef,
                    revisionId,
                    turnRef,
                    source: 'sdk',
                    payload,
                }));
            },
        });
        return traceRecorder.record(input);
    }
    async applyBackendTurnCompleted(event) {
        if (this.isEventSupersededForLive(event)) {
            await this.applyEvent(event);
            return;
        }
        const assistantResponse = completedAssistantResponse(event);
        const pendingTurn = event.turnRef ? this.pendingTurns.get(event.turnRef) : undefined;
        this.events = [...this.events, event];
        this.state = (0, conversationReducer_js_1.reduceConversationRuntimeState)(this.state, event);
        await this.options.store.appendEvent(event);
        if (pendingTurn) {
            this.pendingTurns.delete(pendingTurn.turnRef);
        }
        const snapshot = this.snapshot(this.events);
        this.notify(snapshot, event);
        this.scheduleCompletedTurnTitleGeneration(event, pendingTurn, assistantResponse);
        void this.persistCompletedTurnMemory(event, pendingTurn, assistantResponse).catch(error => {
            console.warn('[Agent SDK] Memory persistence scheduling failed:', error instanceof Error ? error.message : String(error));
        });
    }
    async persistCompletedTurnMemory(event, pendingTurn, assistantResponse) {
        if (!pendingTurn) {
            return;
        }
        if (!this.options.sdkClient) {
            return;
        }
        const memoryPersistenceStartedAtMs = nowMs();
        await this.recordRuntimeTrace({
            path: 'memory.persistence',
            stage: 'completed_turn',
            status: 'started',
            data: {
                memoryEnabled: this.options.memoryEnabled !== false,
                hasLocalRuntime: Boolean(this.options.localRuntime),
                hasSdkClient: Boolean(this.options.sdkClient),
                userQueryLength: pendingTurn.userText.trim().length,
                assistantResponseLength: assistantResponse.trim().length,
            },
        }, {
            turnRef: event.turnRef,
            revisionId: event.revisionId,
        });
        try {
            const result = await (0, ContextEnrichmentPipeline_js_1.storeCompletedTurnMemory)({
                localRuntime: this.options.localRuntime,
                sdkClient: this.options.sdkClient,
                userId: this.options.userId ?? 'local-sdk-user',
                conversationRef: event.conversationRef,
                userQuery: pendingTurn.userText,
                assistantResponse,
                memoryEnabled: this.options.memoryEnabled,
            });
            if (!result) {
                await this.recordRuntimeTrace({
                    path: 'memory.persistence',
                    stage: 'completed_turn',
                    status: 'skipped',
                    durationMs: durationSince(memoryPersistenceStartedAtMs),
                    data: {
                        reason: 'memory_disabled_or_unavailable',
                        memoryEnabled: this.options.memoryEnabled !== false,
                    },
                }, {
                    turnRef: event.turnRef,
                    revisionId: event.revisionId,
                });
                return;
            }
            await this.recordRuntimeTrace({
                path: 'memory.persistence',
                stage: 'completed_turn',
                status: 'succeeded',
                durationMs: durationSince(memoryPersistenceStartedAtMs),
                requestId: result.memoryId ?? null,
                data: {
                    memoryTypes: ['episodic'],
                    hasMemoryId: Boolean(result.memoryId),
                },
            }, {
                turnRef: event.turnRef,
                revisionId: event.revisionId,
            });
            await this.applyEvent((0, events_js_1.createConversationEvent)({
                eventId: this.nextLocalEventId(event.turnRef, 'memory_store_changed'),
                type: 'memory_store_changed',
                conversationRef: event.conversationRef,
                revisionId: event.revisionId,
                turnRef: event.turnRef,
                source: 'sdk',
                payload: {
                    userId: this.options.userId ?? 'local-sdk-user',
                    conversationRef: event.conversationRef,
                    memoryTypes: ['episodic'],
                    reason: 'completed_turn',
                    memoryId: result.memoryId ?? null,
                },
            }));
        }
        catch (error) {
            await this.recordRuntimeTrace({
                path: 'memory.persistence',
                stage: 'completed_turn',
                status: 'failed',
                durationMs: durationSince(memoryPersistenceStartedAtMs),
                error,
                data: {
                    memoryEnabled: this.options.memoryEnabled !== false,
                },
            }, {
                turnRef: event.turnRef,
                revisionId: event.revisionId,
            });
            console.warn('[Agent SDK] Memory persistence failed:', error instanceof Error ? error.message : String(error));
        }
    }
    scheduleCompletedTurnTitleGeneration(event, pendingTurn, assistantResponse) {
        if (!pendingTurn
            || !this.options.sdkClient
            || typeof this.options.sdkClient.generateConversationTitle !== 'function'
            || !this.options.localRuntime?.rpc) {
            return;
        }
        const userMessage = pendingTurn.userText.trim();
        const assistantMessage = assistantResponse.trim();
        if (!userMessage || !assistantMessage) {
            return;
        }
        if (this.hasPreviousAssistantText(event.turnRef)) {
            return;
        }
        const input = {
            userId: this.options.userId ?? 'local-sdk-user',
            conversationRef: event.conversationRef,
            turnRef: event.turnRef,
            revisionId: event.revisionId,
            userMessage,
            assistantMessage,
            modelId: this.completedTurnModelId(event),
            modelProvider: this.completedTurnModelProvider(event),
        };
        const key = titleGenerationKey(input);
        if (completedTurnTitleGenerationInFlight.has(key)) {
            return;
        }
        completedTurnTitleGenerationInFlight.add(key);
        void this.generateCompletedTurnTitle(input)
            .catch(error => {
            console.warn('[Agent SDK] Conversation title generation failed:', error instanceof Error ? error.message : String(error));
        })
            .finally(() => {
            completedTurnTitleGenerationInFlight.delete(key);
        });
    }
    hasPreviousAssistantText(currentTurnRef) {
        return this.events.some(event => {
            if (currentTurnRef && event.turnRef === currentTurnRef) {
                return false;
            }
            if (event.type === 'assistant_message') {
                return eventText(event).trim().length > 0;
            }
            if (event.type === 'turn_completed') {
                return completedAssistantResponse(event).trim().length > 0;
            }
            return false;
        });
    }
    async generateCompletedTurnTitle(input) {
        const localRuntime = this.options.localRuntime;
        const sdkClient = this.options.sdkClient;
        if (!localRuntime?.rpc || !sdkClient || typeof sdkClient.generateConversationTitle !== 'function') {
            return;
        }
        const titleState = await this.traceLocalRuntimeRpc(localRuntime, {
            method: 'get_conversation_title_state',
            params: {
                user_id: input.userId,
                conversation_id: input.conversationRef,
            },
        }, {
            turnRef: input.turnRef ?? null,
            revisionId: input.revisionId ?? null,
        });
        if (!titleStateAllowsGeneratedTitle(titleState)) {
            return;
        }
        const titleGenerationStartedAtMs = nowMs();
        await this.recordRuntimeTrace({
            path: 'title.generation',
            stage: 'generate',
            status: 'started',
            data: {
                hasModelId: Boolean(input.modelId),
                modelProvider: input.modelProvider ?? null,
                userMessageLength: input.userMessage.length,
                assistantMessageLength: input.assistantMessage.length,
            },
        }, {
            turnRef: input.turnRef ?? null,
            revisionId: input.revisionId ?? null,
        });
        let response;
        try {
            response = await sdkClient.generateConversationTitle({
                user_id: input.userId,
                user_message: input.userMessage,
                assistant_message: input.assistantMessage,
                ...(input.modelId ? { model_id: input.modelId } : {}),
                ...(input.modelProvider ? { model_provider: input.modelProvider } : {}),
            });
        }
        catch (error) {
            await this.recordRuntimeTrace({
                path: 'title.generation',
                stage: 'generate',
                status: 'failed',
                durationMs: durationSince(titleGenerationStartedAtMs),
                error,
                data: {
                    hasModelId: Boolean(input.modelId),
                    modelProvider: input.modelProvider ?? null,
                },
            }, {
                turnRef: input.turnRef ?? null,
                revisionId: input.revisionId ?? null,
            });
            throw error;
        }
        if (response.success === false) {
            await this.recordRuntimeTrace({
                path: 'title.generation',
                stage: 'generate',
                status: 'failed',
                durationMs: durationSince(titleGenerationStartedAtMs),
                data: {
                    success: false,
                },
                error: {
                    code: 'title_generation_failed',
                    message: 'Conversation title generation failed.',
                },
            }, {
                turnRef: input.turnRef ?? null,
                revisionId: input.revisionId ?? null,
            });
            return;
        }
        const title = typeof response.title === 'string' ? response.title.trim() : '';
        if (!title || title.toLowerCase() === 'new chat') {
            await this.recordRuntimeTrace({
                path: 'title.generation',
                stage: 'generate',
                status: 'skipped',
                durationMs: durationSince(titleGenerationStartedAtMs),
                data: {
                    reason: 'empty_or_default_title',
                },
            }, {
                turnRef: input.turnRef ?? null,
                revisionId: input.revisionId ?? null,
            });
            return;
        }
        await this.recordRuntimeTrace({
            path: 'title.generation',
            stage: 'generate',
            status: 'succeeded',
            durationMs: durationSince(titleGenerationStartedAtMs),
            data: {
                success: true,
                titleLength: title.length,
            },
        }, {
            turnRef: input.turnRef ?? null,
            revisionId: input.revisionId ?? null,
        });
        const updateResult = await this.traceLocalRuntimeRpc(localRuntime, {
            method: 'update_conversation_title',
            params: {
                user_id: input.userId,
                conversation_id: input.conversationRef,
                title,
            },
        }, {
            turnRef: input.turnRef ?? null,
            revisionId: input.revisionId ?? null,
        });
        rpcResponseData(updateResult, 'Conversation title update RPC failed');
    }
    async traceLocalRuntimeRpc(localRuntime, request, options = {}) {
        if (!localRuntime.rpc) {
            throw new Error('local runtime rpc is unavailable');
        }
        const startedAtMs = nowMs();
        const method = request.method;
        const params = isJsonRecord(request.params) ? request.params : {};
        await this.recordRuntimeTrace({
            path: LOCAL_RUNTIME_RPC_TRACE_PATH,
            stage: 'request',
            status: 'started',
            requestId: typeof request.id === 'string' || typeof request.id === 'number'
                ? String(request.id)
                : method,
            data: {
                method,
                paramsKeyCount: Object.keys(params).length,
                hasParams: Object.keys(params).length > 0,
            },
        }, options);
        try {
            const response = await localRuntime.rpc(request);
            await this.recordRuntimeTrace({
                path: LOCAL_RUNTIME_RPC_TRACE_PATH,
                stage: 'request',
                status: 'succeeded',
                requestId: typeof request.id === 'string' || typeof request.id === 'number'
                    ? String(request.id)
                    : method,
                durationMs: durationSince(startedAtMs),
                data: {
                    method,
                    responseKeyCount: Object.keys(response).length,
                    hasSuccessFlag: typeof response.success === 'boolean',
                    ...(typeof response.success === 'boolean' ? { successFlag: response.success } : {}),
                },
            }, options);
            return response;
        }
        catch (error) {
            await this.recordRuntimeTrace({
                path: LOCAL_RUNTIME_RPC_TRACE_PATH,
                stage: 'request',
                status: 'failed',
                requestId: typeof request.id === 'string' || typeof request.id === 'number'
                    ? String(request.id)
                    : method,
                durationMs: durationSince(startedAtMs),
                data: {
                    method,
                },
                error,
            }, options);
            throw error;
        }
    }
    completedTurnModelId(event) {
        return stringPayloadField(this.state.settings, 'selected_model_id', 'modelId', 'model_id')
            ?? stringPayloadField(event.payload, 'modelId', 'model_id', 'selected_model_id');
    }
    completedTurnModelProvider(event) {
        return stringPayloadField(this.state.settings, 'model_provider', 'modelProvider')
            ?? stringPayloadField(event.payload, 'modelProvider', 'model_provider');
    }
    nextLocalEventId(turnRef, type) {
        const scope = turnRef && turnRef.trim() ? turnRef.trim() : this.options.conversationRef;
        const next = (this.localEventCounters.get(scope) ?? 0) + 1;
        this.localEventCounters.set(scope, next);
        return `${scope}-sdk-evt-${next.toString().padStart(6, '0')}-${type}`;
    }
    backendSequenceKey(event) {
        return event.turnRef ?? `conversation:${event.conversationRef}`;
    }
    enqueueBackendEvent(event) {
        this.backendEventQueue = this.backendEventQueue
            .then(() => this.processNormalizedBackendEvent(event))
            .catch(error => {
            console.warn('[Agent SDK] Backend event processing failed:', error instanceof Error ? error.message : String(error));
        });
    }
    async processNormalizedBackendEvent(event) {
        if (event.source !== 'backend') {
            await this.applyEvent(event);
            return;
        }
        const rejectionReason = this.backendEventRejectionReason(event);
        if (rejectionReason) {
            await this.recordRejectedBackendEvent(event, rejectionReason);
            return;
        }
        const sequence = typeof event.payload.backendSequence === 'number'
            ? event.payload.backendSequence
            : null;
        if (event.type === 'turn_error' && sequence === null) {
            await this.applyEvent(event);
            return;
        }
        if (!Number.isInteger(sequence) || (sequence ?? 0) <= 0) {
            await this.applyBackendSequenceError(event, {
                reason: 'missing_backend_sequence',
                error: 'Backend stream event missing producer sequence',
            });
            return;
        }
        const key = this.backendSequenceKey(event);
        const state = this.backendTurnSequences.get(key) ?? {
            lastSequence: 0,
            eventIds: new Set(),
        };
        if (state.eventIds.has(event.eventId)) {
            return;
        }
        if (sequence <= state.lastSequence) {
            await this.applyBackendSequenceError(event, {
                reason: 'backend_sequence_regressed',
                error: `Backend stream sequence regressed from ${state.lastSequence} to ${sequence}`,
                lastSequence: state.lastSequence,
                receivedSequence: sequence,
            });
            return;
        }
        if (sequence > state.lastSequence + 1) {
            await this.applyBackendSequenceError(event, {
                reason: 'backend_sequence_gap',
                error: `Backend stream sequence gap before ${sequence}`,
                missing_sequence_start: state.lastSequence + 1,
                missing_sequence_end: sequence - 1,
                lastSequence: state.lastSequence,
                receivedSequence: sequence,
            });
        }
        state.eventIds.add(event.eventId);
        state.lastSequence = sequence;
        this.backendTurnSequences.set(key, state);
        const phaseBefore = this.state.phase;
        if (this.isEventSupersededForLive(event)) {
            await this.recordSupersededLateEvent(event);
        }
        if (event.type === 'turn_completed') {
            await this.applyBackendTurnCompleted(event);
        }
        else {
            await this.applyEvent(event);
        }
        await this.recordOverlayPhaseTrace(event, phaseBefore);
    }
    async recordOverlayPhaseTrace(event, phaseBefore) {
        const phaseAfter = this.state.phase;
        if (phaseBefore === phaseAfter || event.type === 'trace_event') {
            return;
        }
        await this.recordRuntimeTrace({
            path: 'overlay.phase',
            stage: 'projection',
            status: 'succeeded',
            data: {
                sourceEventType: event.type,
                phaseBefore,
                phaseAfter,
                hasTurnRef: Boolean(event.turnRef),
                activeTurnMatches: event.turnRef ? event.turnRef === this.state.activeTurnRef : false,
            },
        }, {
            turnRef: event.turnRef,
            revisionId: event.revisionId,
        });
    }
    async applyBackendSequenceError(event, payload) {
        await this.applyEvent((0, events_js_1.createConversationEvent)({
            eventId: this.nextLocalEventId(event.turnRef, 'runtime_error'),
            type: 'runtime_error',
            conversationRef: event.conversationRef,
            revisionId: event.revisionId,
            turnRef: event.turnRef,
            source: 'sdk',
            payload: {
                ...payload,
                sourceEventId: event.eventId,
                sourceEventType: event.type,
            },
        }));
    }
    backendEventRejectionReason(event) {
        if (event.source !== 'backend') {
            return null;
        }
        if (event.conversationRef !== this.options.conversationRef) {
            this.logRejectedBackendEvent(event, 'conversation_ref_mismatch');
            return 'conversation_ref_mismatch';
        }
        if (!(0, conversationEventScope_js_1.isConversationControlEvent)(event)
            && event.turnRef
            && this.isTurnSuperseded(event.turnRef)) {
            return null;
        }
        if (!(0, conversationEventScope_js_1.isConversationControlEvent)(event)
            && this.state.stopState.requested
            && event.turnRef
            && (!this.state.stopState.turnRef || event.turnRef === this.state.stopState.turnRef)
            && event.type !== 'turn_completed'
            && event.type !== 'turn_error'
            && event.type !== 'runtime_error') {
            return 'stopped_turn_stream';
        }
        if (!(0, conversationEventScope_js_1.isConversationControlEvent)(event)
            && event.turnRef
            && this.state.activeTurnRef
            && event.turnRef !== this.state.activeTurnRef) {
            this.logRejectedBackendEvent(event, 'active_turn_ref_mismatch');
            return 'active_turn_ref_mismatch';
        }
        return null;
    }
    async recordRejectedBackendEvent(event, reason) {
        await this.recordRuntimeTrace({
            path: 'backend.event.reject',
            stage: 'active_turn_gate',
            status: 'failed',
            data: {
                reason,
                sourceEventType: event.type,
                sourceEventId: event.eventId,
                eventTurnRef: event.turnRef ?? null,
                activeTurnRef: this.state.activeTurnRef ?? null,
                phase: this.state.phase,
                backendSequence: typeof event.payload.backendSequence === 'number'
                    ? event.payload.backendSequence
                    : null,
            },
        }, {
            turnRef: event.turnRef ?? null,
            revisionId: event.revisionId,
        });
    }
    async recordSupersededLateEvent(event) {
        if (event.type === 'trace_event') {
            return;
        }
        const supersededTurn = event.turnRef
            ? this.state.supersededTurns[event.turnRef]
            : null;
        await this.recordRuntimeTrace({
            path: 'turn.supersession',
            stage: 'late_event',
            status: 'ignored_for_live_authority',
            data: {
                sourceEventType: event.type,
                sourceEventId: event.eventId,
                eventTurnRef: event.turnRef ?? null,
                replacementTurnRef: supersededTurn?.replacementTurnRef ?? null,
                supersessionReason: supersededTurn?.reason ?? null,
                backendSequence: typeof event.payload.backendSequence === 'number'
                    ? event.payload.backendSequence
                    : null,
            },
        }, {
            turnRef: event.turnRef ?? null,
            revisionId: event.revisionId,
        });
    }
    logRejectedBackendEvent(event, reason) {
        if (!(0, conversationEventScope_js_1.isConversationControlEvent)(event)) {
            return;
        }
        if (!(0, debugEnv_js_1.isCompactionStdoutEnabled)()) {
            return;
        }
        console.log('[Agent SDK][Compaction] backend event rejected', {
            reason,
            eventType: event.type,
            eventScope: (0, conversationEventScope_js_1.getConversationEventScope)(event),
            conversationRef: event.conversationRef,
            expectedConversationRef: this.options.conversationRef,
            turnRef: event.turnRef ?? null,
            activeTurnRef: this.state.activeTurnRef ?? null,
            phase: this.state.phase,
            eventId: event.eventId,
            backendSequence: typeof event.payload.backendSequence === 'number'
                ? event.payload.backendSequence
                : null,
        });
    }
    notify(snapshot, event) {
        this.listeners.forEach(listener => listener(snapshot));
        if (event) {
            this.eventListeners.forEach(listener => listener(event, snapshot));
        }
    }
    turnAttachmentKey(conversationRef, turnRef) {
        return turnRef ? `${conversationRef}:${turnRef}` : null;
    }
    withStableDisplayAttachmentIds(resources, turnRef) {
        let visualIndex = 0;
        return resources.map(resource => {
            if (resource.kind !== 'clipboard_image' && resource.kind !== 'query_screenshot_request') {
                return resource;
            }
            const displayAttachmentId = stringPayloadField({ value: resource.displayAttachmentId }, 'value')
                ?? `${turnRef}:attachment:${visualIndex.toString().padStart(3, '0')}`;
            visualIndex += 1;
            return {
                ...resource,
                displayAttachmentId,
            };
        });
    }
    initialLiveDisplayAttachments(resources) {
        const attachments = [];
        for (const resource of resources) {
            if (resource.kind === 'clipboard_image') {
                const id = stringPayloadField({ value: resource.displayAttachmentId }, 'value');
                if (!id) {
                    continue;
                }
                const contentType = stringPayloadField({ value: resource.contentType }, 'value') ?? 'image/png';
                attachments.push({
                    id,
                    kind: 'image',
                    source: 'user_included',
                    status: 'materializing',
                    ...(resource.filename ? { filename: resource.filename } : {}),
                    contentType,
                    previewSrc: `data:${contentType};base64,${resource.base64}`,
                });
            }
            else if (resource.kind === 'query_screenshot_request') {
                const id = stringPayloadField({ value: resource.displayAttachmentId }, 'value');
                if (!id) {
                    continue;
                }
                attachments.push({
                    id,
                    kind: 'screenshot_request',
                    source: 'camera_button',
                    status: 'pending_capture',
                });
            }
        }
        return attachments;
    }
    setLiveDisplayAttachments(conversationRef, turnRef, attachments) {
        const key = this.turnAttachmentKey(conversationRef, turnRef);
        if (!key) {
            return;
        }
        if (attachments.length === 0) {
            this.liveDisplayAttachmentsByTurn.delete(key);
            return;
        }
        this.liveDisplayAttachmentsByTurn.set(key, attachments);
    }
    mergeLiveDisplayAttachments(conversationRef, turnRef, attachments) {
        if (attachments.length === 0) {
            return;
        }
        const key = this.turnAttachmentKey(conversationRef, turnRef);
        if (!key) {
            return;
        }
        const byId = new Map((this.liveDisplayAttachmentsByTurn.get(key) ?? []).map(attachment => [attachment.id, attachment]));
        for (const attachment of attachments) {
            byId.set(attachment.id, attachment.status === 'ready' || attachment.status === 'failed'
                ? attachment
                : {
                    ...(byId.get(attachment.id) ?? {}),
                    ...attachment,
                });
        }
        this.liveDisplayAttachmentsByTurn.set(key, Array.from(byId.values()));
    }
    markLiveDisplayAttachmentsFailed(conversationRef, turnRef) {
        const key = this.turnAttachmentKey(conversationRef, turnRef);
        if (!key) {
            return;
        }
        const existing = this.liveDisplayAttachmentsByTurn.get(key) ?? [];
        if (existing.length === 0) {
            return;
        }
        this.liveDisplayAttachmentsByTurn.set(key, existing.map(attachment => ({
            id: attachment.id,
            kind: attachment.kind,
            source: attachment.source,
            status: 'failed',
            ...(attachment.filename ? { filename: attachment.filename } : {}),
            ...(attachment.contentType ? { contentType: attachment.contentType } : {}),
            errorCode: 'resource_resolution_failed',
        })));
    }
    liveDisplayAttachmentsRecord() {
        return Object.fromEntries(this.liveDisplayAttachmentsByTurn.entries());
    }
    pendingTurnRefForView() {
        const activeTurnRef = this.state.activeTurnRef ?? null;
        if (activeTurnRef && this.pendingTurns.has(activeTurnRef)) {
            return activeTurnRef;
        }
        return this.pendingTurns.keys().next().value ?? null;
    }
    async maybeExecuteTool(event) {
        if (event.source !== 'backend'
            || (event.type !== 'tool_call' && event.type !== 'tool_bundle_call')
            || !this.options.localRuntime?.executeTool
            || !this.options.transport) {
            return;
        }
        const coordinator = new ToolExecutionCoordinator_js_1.ToolExecutionCoordinator({
            localRuntime: this.options.localRuntime,
            localToolLifecycle: this.options.localToolLifecycle,
            agentDefinition: isJsonRecord(this.options.agentDefinition)
                ? this.options.agentDefinition
                : null,
            store: {
                appendEvent: async (outputEvent) => {
                    await this.applyEvent(outputEvent);
                },
            },
            artifactUploader: this.options.sdkClient?.artifacts,
            emitTrace: async (traceEvent) => {
                await this.recordRuntimeTrace(traceEvent, {
                    turnRef: event.turnRef,
                    revisionId: event.revisionId,
                });
            },
            sendToolResult: async (payload) => this.options.transport.sendToolResult(payload),
            sendToolBundleResult: async (payload) => this.options.transport.sendToolBundleResult(payload),
        });
        try {
            const claim = await coordinator.execute(event);
            if (!claim.claimed) {
                await this.applyEvent((0, events_js_1.createConversationEvent)({
                    eventId: this.nextLocalEventId(event.turnRef, 'runtime_error'),
                    type: 'runtime_error',
                    conversationRef: event.conversationRef,
                    revisionId: event.revisionId,
                    turnRef: event.turnRef,
                    source: 'sdk',
                    payload: {
                        error: `Malformed tool event: ${claim.reason ?? 'unclaimable-tool-event'}`,
                        reason: 'malformed_tool_event',
                        claimReason: claim.reason ?? null,
                    },
                }));
            }
        }
        catch (error) {
            await this.applyEvent((0, events_js_1.createConversationEvent)({
                eventId: this.nextLocalEventId(event.turnRef, 'turn_error'),
                type: 'turn_error',
                conversationRef: event.conversationRef,
                revisionId: event.revisionId,
                turnRef: event.turnRef,
                source: 'sdk',
                payload: {
                    error: error instanceof Error ? error.message : String(error),
                    reason: 'tool_result_delivery_failed',
                },
            }));
        }
    }
    displayRowsForSnapshot(events) {
        const eventRows = (0, conversationProjections_js_1.buildDisplayRows)(events, {
            liveAttachments: this.liveDisplayAttachmentsRecord(),
        });
        if (!this.activeDisplayTimeline) {
            return eventRows;
        }
        return this.displayRowsForTimeline(this.activeDisplayTimeline, events);
    }
    displayRowsForTimeline(timeline, events) {
        const eventRows = (0, conversationProjections_js_1.buildDisplayRows)(events, {
            liveAttachments: this.liveDisplayAttachmentsRecord(),
        });
        const rowIds = new Set(timeline.rows.flatMap(row => {
            const ids = [row.id];
            const eventId = row.metadata?.eventId;
            if (typeof eventId === 'string' && eventId.trim()) {
                ids.push(eventId.trim());
            }
            return ids;
        }));
        const rowDedupeKeys = new Set(timeline.rows.map(displayRowDedupeKey));
        const timelineRevisionId = timeline.revisionId;
        const appendedRows = eventRows.filter(row => (rowMetadataRevision(row) === timelineRevisionId
            && !rowIds.has(row.id)
            && !rowDedupeKeys.has(displayRowDedupeKey(row))));
        return withoutDuplicateDisplayToolOutputs([
            ...timeline.rows,
            ...appendedRows.map((row, offset) => ({
                ...row,
                index: timeline.rows.length + offset,
                revisionId: timelineRevisionId,
            })),
        ]);
    }
    displayConversationForSnapshot(events, displayRows) {
        if (!this.activeDisplayTimeline) {
            return (0, conversationProjections_js_1.buildDisplayConversation)(events);
        }
        const fallbackTimestamp = this.activeDisplayTimeline.createdAt;
        const first = displayRows[0];
        const last = displayRows[displayRows.length - 1];
        const activeRevisionId = this.activeDisplayTimeline.revisionId;
        const activeRevisionEvents = events.filter(event => event.revisionId === activeRevisionId);
        return {
            conversationRef: first?.conversationRef ?? this.options.conversationRef,
            revisionId: rowMetadataRevision(last) ?? activeRevisionId,
            messages: displayRows
                .map(row => displayMessageFromRow(row, fallbackTimestamp))
                .filter((message) => Boolean(message)),
            compaction: (0, conversationProjections_js_1.buildCompactionState)(activeRevisionEvents),
        };
    }
    snapshot(events) {
        const currentTurn = (0, conversationProjections_js_1.buildCurrentTurnProjection)(events);
        const displayRows = this.displayRowsForSnapshot(events);
        const rehydrate = rehydrateSnapshotFromModelHistory(events, this.options.conversationRef, this.state.revisionId, displayRows) ?? (0, conversationProjections_js_1.buildRehydrateSnapshot)(events);
        const viewInput = {
            conversationRef: this.options.conversationRef,
            revisionId: this.state.revisionId,
            state: this.state,
            displayRows,
            currentTurn,
            events,
            pendingTurnRef: this.pendingTurnRefForView(),
        };
        const view = (0, conversationProjections_js_1.buildConversationView)(viewInput);
        return {
            state: this.state,
            display: this.displayConversationForSnapshot(events, displayRows),
            displayRows,
            rehydrate,
            currentTurn,
            view,
            viewDiagnostics: (0, conversationProjections_js_1.buildConversationViewBuildDiagnostics)({
                ...viewInput,
                view,
            }),
        };
    }
}
exports.SdkConversationRuntime = SdkConversationRuntime;
function createConversationRuntime(options) {
    return new SdkConversationRuntime(options);
}
