"use strict";
/**
 * Provides the reusable chat session module for the TypeScript SDK runtime.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentChatSession = void 0;
const AgentStreamEvents_js_1 = require("./AgentStreamEvents.js");
function normalizeSendInput(input) {
    return typeof input === 'string' ? { text: input } : input;
}
const agentStreamEventRuntime = (0, AgentStreamEvents_js_1.createAgentStreamEventRuntime)();
class AgentChatSession {
    constructor(conversationRef, runtime) {
        this.conversationRef = conversationRef;
        this.runtime = runtime;
    }
    subscribe(listener) {
        return this.runtime.subscribe(listener);
    }
    onEvent(listener) {
        return this.runtime.subscribeEvents(listener);
    }
    async load() {
        return this.runtime.load();
    }
    async display() {
        return (await this.load()).display;
    }
    async loadDisplayTimeline(options = {}) {
        return this.runtime.loadDisplayTimeline(options);
    }
    async send(input) {
        return this.runtime.send(normalizeSendInput(input));
    }
    async *stream(input) {
        const seenToolOutputs = new Set();
        for await (const runtimeEvent of this.runtime.stream(normalizeSendInput(input))) {
            const streamEvents = agentStreamEventRuntime.toStreamEvents(runtimeEvent);
            if (streamEvents.length === 0) {
                continue;
            }
            if (runtimeEvent.type === 'conversation_event') {
                const keys = agentStreamEventRuntime.toolOutputStreamKeys(runtimeEvent.event);
                if (keys.some(key => seenToolOutputs.has(key))) {
                    continue;
                }
                keys.forEach(key => seenToolOutputs.add(key));
            }
            for (const streamEvent of streamEvents) {
                yield streamEvent;
            }
        }
    }
    async editAndResend(input) {
        return this.runtime.editAndResend(input);
    }
    async retry(input = {}) {
        return this.runtime.retryTurn(input);
    }
    async replaceRows(input) {
        return this.runtime.replaceRows(input);
    }
    async checkoutRevision(input) {
        return this.runtime.checkoutRevision(input);
    }
    async fork(input) {
        return this.runtime.fork(input);
    }
    async stop(turnRef) {
        await this.runtime.stop(turnRef ?? null);
    }
    async rehydrate(input = {}) {
        return this.runtime.rehydrate(input);
    }
    close() {
        this.runtime.close();
    }
}
exports.AgentChatSession = AgentChatSession;
