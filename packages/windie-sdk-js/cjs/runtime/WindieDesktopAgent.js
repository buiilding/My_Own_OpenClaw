"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WindieDesktopAgent = void 0;
const InMemoryConversationStore_js_1 = require("../stores/InMemoryConversationStore.js");
const conversationProjections_js_1 = require("../projections/conversationProjections.js");
const WindieClient_js_1 = require("./WindieClient.js");
function normalizeSendInput(input) {
    return typeof input === 'string' ? { text: input } : input;
}
function statusFromTerminalEvent(event, workspacePath) {
    if (event.type === 'turn_completed') {
        return {
            phase: 'ready',
            conversationRef: event.conversationRef,
            turnRef: event.turnRef,
            workspacePath,
        };
    }
    if (event.type === 'turn_stopped') {
        return {
            phase: 'stopped',
            conversationRef: event.conversationRef,
            turnRef: event.turnRef,
            workspacePath,
        };
    }
    if (event.type === 'turn_error' || event.type === 'runtime_error') {
        const error = typeof event.payload.error === 'string'
            ? event.payload.error
            : null;
        return {
            phase: 'error',
            conversationRef: event.conversationRef,
            turnRef: event.turnRef,
            workspacePath,
            error,
        };
    }
    return null;
}
class WindieDesktopAgent {
    constructor(options) {
        this.options = options;
        this.rowsListeners = new Set();
        this.eventListeners = new Set();
        this.currentTurnListeners = new Set();
        this.statusListeners = new Set();
        this.closed = false;
        this.runtime = options.runtime;
        this.conversationRef = options.conversationRef;
        this.currentStatus = {
            phase: 'ready',
            conversationRef: this.conversationRef,
            workspacePath: options.workspacePath ?? null,
        };
        this.detachEvents = this.attachRuntime(this.runtime);
    }
    attachRuntime(runtime) {
        return runtime.subscribeEvents((event, snapshot) => {
            this.emitConversationEvent(event, snapshot);
            this.emitRows((0, conversationProjections_js_1.buildDisplayRows)([event]));
            this.emitCurrentTurn(snapshot.currentTurn, snapshot);
            const terminalStatus = statusFromTerminalEvent(event, this.options.workspacePath);
            if (terminalStatus) {
                this.setStatus(terminalStatus);
            }
        });
    }
    resolveInputConversationRef(input) {
        const payload = input && 'payload' in input ? input.payload : undefined;
        const fromPayload = payload && typeof payload === 'object' && !Array.isArray(payload)
            ? payload.conversation_ref
            : undefined;
        const direct = input?.conversation_ref;
        const value = typeof fromPayload === 'string' && fromPayload.trim()
            ? fromPayload.trim()
            : (typeof direct === 'string' && direct.trim() ? direct.trim() : '');
        return value || this.conversationRef;
    }
    useConversation(conversationRef) {
        if (conversationRef === this.conversationRef) {
            return this.runtime;
        }
        if (!this.options.agent?.conversation) {
            throw new Error('WindieDesktopAgent cannot switch conversations without a started WindieAgent');
        }
        this.detachEvents();
        this.runtime.close();
        this.conversationRef = conversationRef;
        this.runtime = this.options.agent.conversation({
            conversationRef,
            store: this.options.store,
        });
        this.detachEvents = this.attachRuntime(this.runtime);
        this.setStatus({
            phase: 'ready',
            conversationRef,
            workspacePath: this.options.workspacePath ?? null,
        });
        return this.runtime;
    }
    static async start(options) {
        const { apiKey, appName, workspace, workspacePath: explicitWorkspacePath, store, ...clientAndWakeOptions } = options;
        const workspacePath = explicitWorkspacePath ?? workspace;
        const client = new WindieClient_js_1.WindieClient({
            ...clientAndWakeOptions,
            backendSession: clientAndWakeOptions.backendSession ?? 'managed',
            installToken: clientAndWakeOptions.installToken ?? apiKey,
            autoStartLocalRuntime: clientAndWakeOptions.autoStartLocalRuntime ?? true,
        });
        const agent = await client.wakeUp({
            ...clientAndWakeOptions,
            installToken: clientAndWakeOptions.installToken ?? apiKey,
            name: appName ?? 'Windie Desktop Agent',
            workspacePath,
            builtins: clientAndWakeOptions.builtins ?? 'default',
        });
        const conversationRef = clientAndWakeOptions.conversationRef ?? `conv-${agent.id}`;
        const conversationStore = store ?? new InMemoryConversationStore_js_1.InMemoryConversationStore();
        const runtime = agent.conversation({
            conversationRef,
            store: conversationStore,
        });
        return new WindieDesktopAgent({
            agent,
            runtime,
            store: conversationStore,
            conversationRef,
            workspacePath,
        });
    }
    onRows(listener) {
        this.rowsListeners.add(listener);
        return () => {
            this.rowsListeners.delete(listener);
        };
    }
    onConversationEvent(listener) {
        this.eventListeners.add(listener);
        return () => {
            this.eventListeners.delete(listener);
        };
    }
    onCurrentTurn(listener) {
        this.currentTurnListeners.add(listener);
        return () => {
            this.currentTurnListeners.delete(listener);
        };
    }
    onStatus(listener) {
        this.statusListeners.add(listener);
        listener(this.currentStatus);
        return () => {
            this.statusListeners.delete(listener);
        };
    }
    onBackendEvent(listener) {
        return this.options.agent?.subscribeRawBackendEvents?.(listener) ?? (() => { });
    }
    async run(input) {
        const sendInput = normalizeSendInput(input);
        const runtime = this.useConversation(this.resolveInputConversationRef(sendInput));
        this.setStatus({
            phase: 'running',
            conversationRef: this.conversationRef,
            turnRef: sendInput.turnRef ?? null,
            workspacePath: this.options.workspacePath ?? null,
        });
        const result = await runtime.send(sendInput);
        this.setStatus({
            phase: 'running',
            conversationRef: this.conversationRef,
            turnRef: result.turnRef,
            workspacePath: this.options.workspacePath ?? null,
        });
        return result;
    }
    async stop(input) {
        const conversationRef = typeof input === 'object' && input?.conversation_ref
            ? input.conversation_ref
            : this.conversationRef;
        const turnRef = typeof input === 'string'
            ? input
            : (typeof input === 'object' ? input?.turn_ref : null);
        const runtime = this.useConversation(conversationRef || this.conversationRef);
        if (this.options.agent?.stop) {
            return this.options.agent.stop(conversationRef || this.conversationRef);
        }
        await runtime.stop(turnRef ?? null);
        return undefined;
    }
    async load() {
        return this.runtime.load();
    }
    async ensureConnected() {
        if (this.options.agent?.ensureConnected) {
            await this.options.agent.ensureConnected();
            return;
        }
        await this.runtime.ensureConnected();
    }
    isConnected() {
        return this.options.agent?.isConnected?.() ?? false;
    }
    async updateSettings(payload) {
        if (this.options.agent?.updateSettings) {
            return this.options.agent.updateSettings(payload);
        }
        return this.runtime.updateSettings(payload);
    }
    async listModels() {
        if (!this.options.agent?.listModels) {
            throw new Error('WindieDesktopAgent.listModels requires a started WindieAgent');
        }
        return this.options.agent.listModels();
    }
    async requestModelList() {
        if (this.options.agent?.requestModelList) {
            return this.options.agent.requestModelList();
        }
        return this.runtime.requestModelList();
    }
    async rehydrate(payload) {
        if (payload) {
            this.useConversation(this.resolveInputConversationRef(payload));
            await this.runtime.rehydrateMessages(payload);
            return undefined;
        }
        return this.runtime.rehydrate();
    }
    async rehydrateMessages(payload) {
        this.useConversation(this.resolveInputConversationRef(payload));
        await this.runtime.rehydrateMessages(payload);
    }
    async compactHistory(input = {}) {
        this.useConversation(this.resolveInputConversationRef(input));
        return this.runtime.compactHistory({
            force: input.force,
            payload: input,
        });
    }
    async wakewordDetected(payload = {}) {
        if (this.options.agent?.wakewordDetected) {
            return this.options.agent.wakewordDetected(payload);
        }
        return this.runtime.wakewordDetected(payload);
    }
    noteBackendTraffic(reason = 'traffic') {
        this.options.agent?.noteBackendTraffic?.(reason);
    }
    syncBackendIdleTimer(reason = 'idle-sync') {
        this.options.agent?.syncBackendIdleTimer?.(reason);
    }
    async localStatus() {
        return this.options.agent?.status ? this.options.agent.status() : null;
    }
    close() {
        if (this.closed) {
            return;
        }
        this.closed = true;
        this.detachEvents();
        this.runtime.close();
        this.options.agent?.sleep();
        this.setStatus({
            phase: 'closed',
            conversationRef: this.conversationRef,
            workspacePath: this.options.workspacePath ?? null,
        });
    }
    async shutdown() {
        this.close();
        await this.options.agent?.shutdownLocalRuntime();
    }
    emitRows(rows) {
        if (rows.length === 0) {
            return;
        }
        this.rowsListeners.forEach(listener => listener(rows));
    }
    emitConversationEvent(event, snapshot) {
        this.eventListeners.forEach(listener => listener(event, snapshot));
    }
    emitCurrentTurn(currentTurn, snapshot) {
        this.currentTurnListeners.forEach(listener => listener(currentTurn, snapshot));
    }
    setStatus(status) {
        this.currentStatus = status;
        this.statusListeners.forEach(listener => listener(status));
    }
}
exports.WindieDesktopAgent = WindieDesktopAgent;
