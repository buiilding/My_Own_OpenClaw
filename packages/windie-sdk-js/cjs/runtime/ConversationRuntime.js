"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SdkConversationRuntime = void 0;
exports.createConversationRuntime = createConversationRuntime;
const events_js_1 = require("../conversation/events.js");
const backendEvents_js_1 = require("../events/backendEvents.js");
const conversationProjections_js_1 = require("../projections/conversationProjections.js");
const backendEventNormalizer_js_1 = require("../transport/backendEventNormalizer.js");
const ToolExecutionCoordinator_js_1 = require("../tools/ToolExecutionCoordinator.js");
const modelSelection_js_1 = require("../settings/modelSelection.js");
const ContextEnrichmentPipeline_js_1 = require("./ContextEnrichmentPipeline.js");
const conversationReducer_js_1 = require("./conversationReducer.js");
const conversationEventScope_js_1 = require("./conversationEventScope.js");
const TurnInputPipeline_js_1 = require("./TurnInputPipeline.js");
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
function findUserEventIndexByOrdinal(events, userMessageOrdinal) {
    if (!Number.isInteger(userMessageOrdinal) || (userMessageOrdinal ?? -1) < 0) {
        return -1;
    }
    let currentOrdinal = -1;
    for (let index = 0; index < events.length; index += 1) {
        if (events[index]?.type !== 'user_message') {
            continue;
        }
        currentOrdinal += 1;
        if (currentOrdinal === userMessageOrdinal) {
            return index;
        }
    }
    return -1;
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
function rawBackendPayload(event) {
    const rawEvent = isJsonRecord(event.payload.rawEvent) ? event.payload.rawEvent : {};
    return isJsonRecord(rawEvent.payload) ? rawEvent.payload : {};
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
            const resourceResolution = await (0, TurnInputPipeline_js_1.resolveTurnInputResources)({
                resources: input.resources ?? null,
                resolvers: this.options.resourceResolvers ?? null,
                context: {
                    text: input.text,
                    conversationRef: this.options.conversationRef,
                    turnRef,
                    payload: sourcePayload,
                },
            });
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
                })
                : payloadForEnrichment;
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
                queryMessageId = turnRef;
            }
            else {
                const sentQueryMessageId = await this.options.transport.sendQuery({
                    ...enrichedPayload,
                    text: input.text,
                    conversation_ref: this.options.conversationRef,
                }, {
                    messageId: turnRef,
                });
                if (!sentQueryMessageId) {
                    throw new Error('Failed to send query to backend');
                }
                queryMessageId = sentQueryMessageId;
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
        let userIndex = events.findIndex(event => (event.type === 'user_message' && eventMatchesId(event, input.messageId)));
        if (userIndex < 0) {
            userIndex = findUserEventIndexByOrdinal(events, input.userMessageOrdinal);
        }
        if (userIndex < 0) {
            throw new Error(`Cannot edit missing user message: ${input.messageId}`);
        }
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
            payload: {
                ...events[userIndex].payload,
                ...(input.payload ?? {}),
            },
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
        const ordinalUserIndex = findUserEventIndexByOrdinal(events, input.userMessageOrdinal);
        const searchStart = targetIndex >= 0
            ? targetIndex
            : (ordinalUserIndex >= 0 ? ordinalUserIndex : events.length - 1);
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
            payload: {
                ...events[userIndex].payload,
                ...(input.payload ?? {}),
            },
        };
    }
    async stop(turnRef = this.state.activeTurnRef ?? null) {
        await this.options.transport?.stop({
            conversation_ref: this.options.conversationRef,
            turn_ref: turnRef,
        });
        await this.applyEvent((0, events_js_1.createConversationEvent)({
            eventId: this.nextLocalEventId(turnRef, 'turn_stopped'),
            type: 'turn_stopped',
            conversationRef: this.options.conversationRef,
            revisionId: this.state.revisionId,
            turnRef,
            source: 'ui',
            payload: {},
        }));
    }
    async rehydrate() {
        const snapshot = await this.options.store.loadForRehydrate(this.options.conversationRef);
        await this.options.transport?.rehydrateConversation({
            conversation_ref: this.options.conversationRef,
            messages: snapshot.messages,
            rehydrate_mode: 'replace',
        });
        return snapshot;
    }
    async rehydrateMessages(payload) {
        await this.options.transport?.rehydrateConversation({
            ...payload,
            rehydrate_mode: 'replace',
        });
    }
    async compactHistory(input = {}) {
        const payload = {
            ...(input.payload ?? {}),
            force: input.force ?? true,
            conversation_ref: this.options.conversationRef,
        };
        return this.options.transport?.compactHistory(payload);
    }
    async wakewordDetected(payload = {}) {
        return this.options.transport?.wakewordDetected(payload);
    }
    async updateSettings(payload) {
        return this.options.transport?.updateSettings(payload);
    }
    async requestModelList() {
        return this.options.transport?.listModels();
    }
    async ensureConnected() {
        await this.options.transport?.connect();
    }
    async setModel(selection) {
        if (!this.options.transport) {
            throw new Error('ConversationRuntime.setModel requires a backend transport');
        }
        const settings = (0, modelSelection_js_1.buildModelSettingsPatch)(selection, 'ConversationRuntime.setModel');
        const backendMessageId = await this.options.transport.updateSettings(settings);
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
                backendMessageId: backendMessageId ?? null,
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
                return;
            }
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
            console.warn('[Windie SDK] Memory persistence failed:', error instanceof Error ? error.message : String(error));
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
            console.warn('[Windie SDK] Conversation title generation failed:', error instanceof Error ? error.message : String(error));
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
        const titleState = await localRuntime.rpc({
            method: 'get_conversation_title_state',
            params: {
                user_id: input.userId,
                conversation_id: input.conversationRef,
            },
        });
        if (!titleStateAllowsGeneratedTitle(titleState)) {
            return;
        }
        const response = await sdkClient.generateConversationTitle({
            user_id: input.userId,
            user_message: input.userMessage,
            assistant_message: input.assistantMessage,
            ...(input.modelId ? { model_id: input.modelId } : {}),
            ...(input.modelProvider ? { model_provider: input.modelProvider } : {}),
        });
        if (response.success === false) {
            return;
        }
        const title = typeof response.title === 'string' ? response.title.trim() : '';
        if (!title || title.toLowerCase() === 'new chat') {
            return;
        }
        const updateResult = await localRuntime.rpc({
            method: 'update_conversation_title',
            params: {
                user_id: input.userId,
                conversation_id: input.conversationRef,
                title,
            },
        });
        rpcResponseData(updateResult, 'Conversation title update RPC failed');
    }
    completedTurnModelId(event) {
        const rawPayload = rawBackendPayload(event);
        return stringPayloadField(this.state.settings, 'selected_model_id', 'modelId', 'model_id')
            ?? stringPayloadField(event.payload, 'modelId', 'model_id', 'selected_model_id')
            ?? stringPayloadField(rawPayload, 'model_id', 'modelId', 'selected_model_id');
    }
    completedTurnModelProvider(event) {
        const rawPayload = rawBackendPayload(event);
        return stringPayloadField(this.state.settings, 'model_provider', 'modelProvider', 'provider')
            ?? stringPayloadField(event.payload, 'modelProvider', 'model_provider', 'provider')
            ?? stringPayloadField(rawPayload, 'model_provider', 'modelProvider', 'provider');
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
            console.warn('[Windie SDK] Backend event processing failed:', error instanceof Error ? error.message : String(error));
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
        if (event.type === 'turn_completed') {
            await this.applyBackendTurnCompleted(event);
            return;
        }
        await this.applyEvent(event);
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
        console.log('[Windie SDK][Compaction] backend event rejected', {
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
            store: {
                appendEvent: async (outputEvent) => {
                    await this.applyEvent(outputEvent);
                },
            },
            artifactUploader: this.options.sdkClient?.artifacts,
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
            liveTurnPresentation: currentTurn.presentation,
        };
    }
}
exports.SdkConversationRuntime = SdkConversationRuntime;
function createConversationRuntime(options) {
    return new SdkConversationRuntime(options);
}
