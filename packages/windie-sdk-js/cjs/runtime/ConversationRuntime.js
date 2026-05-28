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
const conversationReducer_js_1 = require("./conversationReducer.js");
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
class SdkConversationRuntime {
    constructor(options) {
        this.options = options;
        this.events = [];
        this.listeners = new Set();
        this.eventListeners = new Set();
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
            if (event && this.shouldAcceptBackendEvent(event)) {
                void this.applyEvent(event);
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
        await this.applyEvent((0, events_js_1.createConversationEvent)({
            type: 'turn_started',
            conversationRef: this.options.conversationRef,
            revisionId,
            turnRef,
            source: 'sdk',
            payload: {},
        }));
        await this.applyEvent((0, events_js_1.createConversationEvent)({
            type: 'user_message',
            conversationRef: this.options.conversationRef,
            revisionId,
            turnRef,
            source: 'ui',
            payload: {
                ...(input.payload ?? {}),
                text: input.text,
            },
        }));
        const queryMessageId = await this.options.transport?.sendQuery({
            ...(input.payload ?? {}),
            text: input.text,
            conversation_ref: this.options.conversationRef,
        }, {
            messageId: turnRef,
        }) ?? turnRef;
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
            conversation_ref: payload.conversation_ref || this.options.conversationRef,
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
        const snapshot = this.snapshot(this.events);
        this.notify(snapshot, event);
        await this.options.store.appendEvent(event);
        await this.maybeExecuteTool(event);
    }
    shouldAcceptBackendEvent(event) {
        if (event.source !== 'backend') {
            return true;
        }
        if (event.conversationRef !== this.options.conversationRef) {
            return false;
        }
        if (event.turnRef
            && this.state.activeTurnRef
            && event.turnRef !== this.state.activeTurnRef) {
            return false;
        }
        return true;
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
            store: {
                appendEvent: async (outputEvent) => {
                    await this.applyEvent(outputEvent);
                },
            },
            sendToolResult: async (payload) => this.options.transport.sendToolResult(payload),
            sendToolBundleResult: async (payload) => this.options.transport.sendToolBundleResult(payload),
        });
        try {
            const claim = await coordinator.execute(event);
            if (!claim.claimed) {
                await this.applyEvent((0, events_js_1.createConversationEvent)({
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
        return {
            state: this.state,
            display: (0, conversationProjections_js_1.buildDisplayConversation)(events),
            displayRows: (0, conversationProjections_js_1.buildDisplayRows)(events),
            rehydrate: (0, conversationProjections_js_1.buildRehydrateSnapshot)(events),
            currentTurn: (0, conversationProjections_js_1.buildCurrentTurnProjection)(events),
        };
    }
}
exports.SdkConversationRuntime = SdkConversationRuntime;
function createConversationRuntime(options) {
    return new SdkConversationRuntime(options);
}
