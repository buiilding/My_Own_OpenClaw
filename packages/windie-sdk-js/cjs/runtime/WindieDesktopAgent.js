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
        this.currentStatus = {
            phase: 'ready',
            conversationRef: options.conversationRef,
            workspacePath: options.workspacePath ?? null,
        };
        this.detachEvents = options.runtime.subscribeEvents((event, snapshot) => {
            this.emitConversationEvent(event, snapshot);
            this.emitRows((0, conversationProjections_js_1.buildDisplayRows)([event]));
            this.emitCurrentTurn(snapshot.currentTurn, snapshot);
            const terminalStatus = statusFromTerminalEvent(event, options.workspacePath);
            if (terminalStatus) {
                this.setStatus(terminalStatus);
            }
        });
    }
    static async start(options) {
        const { apiKey, appName, workspace, workspacePath: explicitWorkspacePath, store, ...clientAndWakeOptions } = options;
        const workspacePath = explicitWorkspacePath ?? workspace;
        const client = new WindieClient_js_1.WindieClient({
            ...clientAndWakeOptions,
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
        const runtime = agent.conversation({
            conversationRef,
            store: store ?? new InMemoryConversationStore_js_1.InMemoryConversationStore(),
        });
        return new WindieDesktopAgent({
            agent,
            runtime,
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
    async run(input) {
        const sendInput = normalizeSendInput(input);
        this.setStatus({
            phase: 'running',
            conversationRef: this.options.conversationRef,
            turnRef: sendInput.turnRef ?? null,
            workspacePath: this.options.workspacePath ?? null,
        });
        const result = await this.options.runtime.send(sendInput);
        this.setStatus({
            phase: 'running',
            conversationRef: this.options.conversationRef,
            turnRef: result.turnRef,
            workspacePath: this.options.workspacePath ?? null,
        });
        return result;
    }
    async stop(turnRef) {
        await this.options.runtime.stop(turnRef ?? null);
    }
    async load() {
        return this.options.runtime.load();
    }
    async ensureConnected() {
        if (this.options.agent?.ensureConnected) {
            await this.options.agent.ensureConnected();
            return;
        }
        await this.options.runtime.ensureConnected();
    }
    isConnected() {
        return this.options.agent?.isConnected?.() ?? false;
    }
    async updateSettings(payload) {
        if (this.options.agent?.updateSettings) {
            return this.options.agent.updateSettings(payload);
        }
        return this.options.runtime.updateSettings(payload);
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
        return this.options.runtime.requestModelList();
    }
    async rehydrate(payload) {
        if (payload) {
            await this.options.runtime.rehydrateMessages(payload);
            return undefined;
        }
        return this.options.runtime.rehydrate();
    }
    async rehydrateMessages(payload) {
        await this.options.runtime.rehydrateMessages(payload);
    }
    async compactHistory(input = {}) {
        return this.options.runtime.compactHistory({
            force: input.force,
            payload: input,
        });
    }
    async wakewordDetected(payload = {}) {
        if (this.options.agent?.wakewordDetected) {
            return this.options.agent.wakewordDetected(payload);
        }
        return this.options.runtime.wakewordDetected(payload);
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
        this.options.runtime.close();
        this.options.agent?.sleep();
        this.setStatus({
            phase: 'closed',
            conversationRef: this.options.conversationRef,
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
