"use strict";
/**
 * Provides the windie chat session module for the TypeScript SDK runtime.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WindieChatSession = void 0;
const AgentStreamEvents_js_1 = require("./AgentStreamEvents.js");
function normalizeSendInput(input) {
    return typeof input === 'string' ? { text: input } : input;
}
class WindieChatSession {
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
    async send(input) {
        return this.runtime.send(normalizeSendInput(input));
    }
    async *stream(input) {
        const seenToolOutputs = new Set();
        for await (const runtimeEvent of this.runtime.stream(normalizeSendInput(input))) {
            const streamEvents = (0, AgentStreamEvents_js_1.toAgentStreamEvents)(runtimeEvent);
            if (streamEvents.length === 0) {
                continue;
            }
            if (runtimeEvent.type === 'conversation_event') {
                const keys = (0, AgentStreamEvents_js_1.toolOutputStreamKeys)(runtimeEvent.event);
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
    async stop(turnRef) {
        await this.runtime.stop(turnRef ?? null);
    }
    async rehydrate() {
        return this.runtime.rehydrate();
    }
    close() {
        this.runtime.close();
    }
    onConversationEvent(listener) {
        return this.onEvent(listener);
    }
}
exports.WindieChatSession = WindieChatSession;
