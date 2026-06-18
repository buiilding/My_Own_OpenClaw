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
const TurnInputPipeline_js_1 = require("./TurnInputPipeline.js");
function nowMs() {
    return Date.now();
}
function durationSince(startedAtMs) {
    return Math.max(0, Date.now() - startedAtMs);
}
const LOCAL_RUNTIME_RPC_TRACE_PATH = 'local_runtime.rpc';
function isCompactionStdoutEnabled() {
    const env = globalThis.process?.env;
    return env?.WINDIE_DEBUG_COMPACTION_STDOUT === '1';
}
function optionalRequestId(value) {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
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
function eventMatchesId(event, messageId) {
    return event.eventId === messageId
        || event.payload.id === messageId
        || event.payload.messageId === messageId
        || event.payload.message_id === messageId;
}
function resolvedUserTurnPayload(events, userIndex) {
    const userEvent = events[userIndex];
    if (!userEvent || userEvent.type !== 'user_message') {
        return {};
    }
    const payload = { ...userEvent.payload };
    const turnRef = userEvent.turnRef;
    for (let index = userIndex + 1; index < events.length; index += 1) {
        const event = events[index];
        if (!event || event.type === 'user_message') {
            break;
        }
        if (event.type !== 'user_message_metadata') {
            continue;
        }
        if (turnRef) {
            if (event.turnRef !== turnRef) {
                continue;
            }
        }
        else if (event.turnRef) {
            continue;
        }
        Object.assign(payload, event.payload);
    }
    return payload;
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
        this.backendEventQueue = Promise.resolve();
        this.state = (0, conversationReducer_js_1.createInitialConversationRuntimeState)(options.conversationRef, options.revisionId);
    }
    async load() {
        const events = await this.options.store.loadEvents(this.options.conversationRef);
        this.events = events;
        this.state = events.reduce((state, event) => (0, conversationReducer_js_1.reduceConversationRuntimeState)(state, event), (0, conversationReducer_js_1.createInitialConversationRuntimeState)(this.options.conversationRef, events[events.length - 1]?.revisionId ?? this.state.revisionId));
        return this.snapshot(this.events);
    }
    subscribe(listener) {
        this.listeners.add(listener);
        void this.load().then(snapshot => listener(snapshot));
        return () => {
            this.listeners.delete(listener);
        };
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
        this.detachTransport = this.options.transport.subscribe(rawEvent => {
            if (!(0, backendEvents_js_1.isBackendEvent)(rawEvent)) {
                return;
            }
            const event = (0, backendEventNormalizer_js_1.normalizeBackendEventToConversationEvent)(rawEvent, {
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
            const baseUserPayload = isJsonRecord(input.metadata)
                ? input.metadata
                : (isJsonRecord(input.payload) ? input.payload : {});
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
            const resources = input.resources ?? [];
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
                    resources: input.resources ?? null,
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
            if ((input.resources ?? []).some(resource => resource.kind === 'query_screenshot_request')) {
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
                        resourceCount: input.resources?.length ?? 0,
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
                        resourceCount: input.resources?.length ?? 0,
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
        const prepared = await this.prepareEditAndResend(input);
        return this.send(prepared);
    }
    async prepareEditAndResend(input) {
        const normalizedText = input.text.trim();
        if (!normalizedText) {
            throw new Error('editAndResend requires non-empty text');
        }
        const events = await this.options.store.loadEvents(this.options.conversationRef);
        const userIndex = events.findIndex(event => (event.type === 'user_message' && eventMatchesId(event, input.messageId)));
        if (userIndex < 0) {
            throw new Error(`Cannot edit missing user message: ${input.messageId}`);
        }
        const replayPayload = mergeReplayPayload(resolvedUserTurnPayload(events, userIndex), input.payload);
        replayPayload.text = normalizedText;
        await this.rewriteToRevision({
            events,
            preservedEvents: events.slice(0, userIndex),
            removedEvents: events.slice(userIndex),
            reason: 'edit_resend',
            replacementText: normalizedText,
        });
        await this.rehydrate();
        return {
            text: normalizedText,
            turnRef: input.turnRef,
            model: input.model,
            payload: replayPayload,
        };
    }
    async retryTurn(input = {}) {
        const prepared = await this.prepareRetryTurn(input);
        return this.send(prepared);
    }
    async prepareRetryTurn(input = {}) {
        const events = await this.options.store.loadEvents(this.options.conversationRef);
        const targetIndex = input.messageId
            ? events.findIndex(event => eventMatchesId(event, input.messageId))
            : events.length - 1;
        if (input.messageId && targetIndex < 0) {
            throw new Error(`Cannot retry missing message: ${input.messageId}`);
        }
        const searchStart = targetIndex >= 0 ? targetIndex : events.length - 1;
        let userIndex = -1;
        for (let index = searchStart; index >= 0; index -= 1) {
            if (events[index]?.type === 'user_message') {
                userIndex = index;
                break;
            }
        }
        if (userIndex < 0) {
            throw new Error('Cannot retry without a previous user message');
        }
        const retryText = eventText(events[userIndex]);
        if (!retryText.trim()) {
            throw new Error('Cannot retry a user message with empty text');
        }
        const replayPayload = mergeReplayPayload(resolvedUserTurnPayload(events, userIndex), input.payload);
        replayPayload.text = retryText;
        await this.rewriteToRevision({
            events,
            preservedEvents: events.slice(0, userIndex),
            removedEvents: events.slice(userIndex),
            reason: 'retry',
            replacementText: retryText,
        });
        await this.rehydrate();
        return {
            text: retryText,
            turnRef: input.turnRef,
            model: input.model,
            payload: replayPayload,
        };
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
    async rehydrate() {
        const startedAtMs = nowMs();
        const snapshot = await this.options.store.loadForRehydrate(this.options.conversationRef);
        if (!this.options.transport) {
            await this.recordRuntimeTrace({
                path: 'conversation.rehydrate',
                stage: 'transport_send',
                status: 'skipped',
                data: {
                    reason: 'transport_unavailable',
                    messageCount: snapshot.messages.length,
                    rehydrateMode: 'replace',
                },
            });
            return snapshot;
        }
        await this.recordRuntimeTrace({
            path: 'conversation.rehydrate',
            stage: 'transport_send',
            status: 'started',
            data: {
                messageCount: snapshot.messages.length,
                rehydrateMode: 'replace',
            },
        });
        try {
            await this.options.transport.rehydrateConversation({
                conversation_ref: this.options.conversationRef,
                messages: snapshot.messages,
                rehydrate_mode: 'replace',
            });
            await this.recordRuntimeTrace({
                path: 'conversation.rehydrate',
                stage: 'transport_send',
                status: 'succeeded',
                durationMs: durationSince(startedAtMs),
                data: {
                    messageCount: snapshot.messages.length,
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
                    messageCount: snapshot.messages.length,
                    rehydrateMode: 'replace',
                },
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
            throw new Error('ConversationRuntime.setModel requires a backend transport');
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
    async rewriteToRevision({ events, preservedEvents, removedEvents, reason, replacementText, }) {
        const baseRevisionId = events[events.length - 1]?.revisionId ?? this.state.revisionId;
        const newRevisionId = (0, events_js_1.createRuntimeId)('rev');
        const rewriteEvent = (0, events_js_1.createConversationEvent)({
            eventId: this.nextLocalEventId(null, 'conversation_rewritten'),
            type: 'conversation_rewritten',
            conversationRef: this.options.conversationRef,
            revisionId: newRevisionId,
            source: 'sdk',
            payload: {
                baseRevisionId,
                reason,
                replacementUserMessage: {
                    text: replacementText,
                },
                removedEventIds: removedEvents.map(event => event.eventId),
            },
        });
        const nextEvents = [...preservedEvents, rewriteEvent];
        this.events = nextEvents;
        await this.options.store.rewriteConversation({
            conversationRef: this.options.conversationRef,
            baseRevisionId,
            newRevisionId,
            cutAfterEventId: preservedEvents[preservedEvents.length - 1]?.eventId ?? null,
            replacementUserMessage: { text: replacementText },
            preservedEvents: nextEvents,
            removedEventIds: removedEvents.map(event => event.eventId),
            reason,
        });
        this.state = nextEvents.reduce((state, event) => (0, conversationReducer_js_1.reduceConversationRuntimeState)(state, event), (0, conversationReducer_js_1.createInitialConversationRuntimeState)(this.options.conversationRef, newRevisionId));
        this.events = await this.options.store.loadEvents(this.options.conversationRef);
        const snapshot = this.snapshot(this.events);
        this.notify(snapshot, rewriteEvent);
    }
    async applyEvent(event) {
        this.events = [...this.events, event];
        this.state = (0, conversationReducer_js_1.reduceConversationRuntimeState)(this.state, event);
        if ((event.type === 'turn_stopped' || event.type === 'turn_error') && event.turnRef) {
            this.pendingTurns.delete(event.turnRef);
        }
        const snapshot = this.snapshot(this.events);
        this.notify(snapshot, event);
        await this.options.store.appendEvent(event);
        await this.maybeExecuteTool(event);
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
        const assistantResponse = completedAssistantResponse(event);
        const pendingTurn = event.turnRef ? this.pendingTurns.get(event.turnRef) : undefined;
        this.events = [...this.events, event];
        this.state = (0, conversationReducer_js_1.reduceConversationRuntimeState)(this.state, event);
        await this.options.store.appendEvent(event);
        try {
            await this.persistCompletedTurnMemory(event, pendingTurn, assistantResponse);
        }
        finally {
            if (pendingTurn) {
                this.pendingTurns.delete(pendingTurn.turnRef);
            }
        }
        const snapshot = this.snapshot(this.events);
        this.notify(snapshot, event);
        this.scheduleCompletedTurnTitleGeneration(event, pendingTurn, assistantResponse);
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
        if (!this.shouldAcceptBackendEvent(event)) {
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
    shouldAcceptBackendEvent(event) {
        if (event.source !== 'backend') {
            return true;
        }
        if (event.conversationRef !== this.options.conversationRef) {
            this.logRejectedBackendEvent(event, 'conversation_ref_mismatch');
            return false;
        }
        if (!(0, conversationEventScope_js_1.isConversationControlEvent)(event)
            && this.state.stopState.requested
            && event.turnRef
            && (!this.state.stopState.turnRef || event.turnRef === this.state.stopState.turnRef)
            && event.type !== 'turn_completed'
            && event.type !== 'turn_error'
            && event.type !== 'runtime_error') {
            return false;
        }
        if (!(0, conversationEventScope_js_1.isConversationControlEvent)(event)
            && event.turnRef
            && this.state.activeTurnRef
            && event.turnRef !== this.state.activeTurnRef) {
            this.logRejectedBackendEvent(event, 'active_turn_ref_mismatch');
            return false;
        }
        return true;
    }
    logRejectedBackendEvent(event, reason) {
        if (!(0, conversationEventScope_js_1.isConversationControlEvent)(event)) {
            return;
        }
        if (!isCompactionStdoutEnabled()) {
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
    snapshot(events) {
        const currentTurn = (0, conversationProjections_js_1.buildCurrentTurnProjection)(events);
        return {
            state: this.state,
            display: (0, conversationProjections_js_1.buildDisplayConversation)(events),
            displayRows: (0, conversationProjections_js_1.buildDisplayRows)(events),
            rehydrate: (0, conversationProjections_js_1.buildRehydrateSnapshot)(events),
            currentTurn,
        };
    }
}
exports.SdkConversationRuntime = SdkConversationRuntime;
function createConversationRuntime(options) {
    return new SdkConversationRuntime(options);
}
