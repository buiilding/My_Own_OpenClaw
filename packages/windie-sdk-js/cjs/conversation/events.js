"use strict";
/**
 * Provides the events module for the TypeScript SDK runtime.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRuntimeId = createRuntimeId;
exports.createConversationEvent = createConversationEvent;
exports.createInitialRevisionId = createInitialRevisionId;
function createRuntimeId(prefix) {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
        return `${prefix}_${globalThis.crypto.randomUUID()}`;
    }
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
function createConversationEvent({ type, conversationRef, revisionId, turnRef = null, source = 'sdk', payload, eventId, timestamp, }) {
    return {
        eventId: eventId ?? createRuntimeId('evt'),
        type,
        conversationRef,
        turnRef,
        revisionId: revisionId ?? createRuntimeId('rev'),
        timestamp: timestamp ?? new Date().toISOString(),
        source,
        payload: payload ?? {},
    };
}
function createInitialRevisionId() {
    return createRuntimeId('rev');
}
