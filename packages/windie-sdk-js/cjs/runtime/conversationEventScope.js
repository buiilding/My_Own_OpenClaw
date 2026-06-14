/**
 * Provides the conversation event scope module for the committed JavaScript SDK runtime.
 */

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConversationEventScope = getConversationEventScope;
exports.isConversationControlEvent = isConversationControlEvent;
exports.shouldEventUpdateActiveTurnRef = shouldEventUpdateActiveTurnRef;
const CONVERSATION_CONTROL_EVENT_TYPES = new Set([
    'compaction_started',
    'compaction_skipped',
    'compaction_applied',
    'compaction_failed',
]);
function sourceEventType(event) {
    const value = event.payload.sourceEventType;
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function getConversationEventScope(event) {
    if (CONVERSATION_CONTROL_EVENT_TYPES.has(event.type)) {
        return 'conversation_control';
    }
    const sourceType = sourceEventType(event);
    if (event.type === 'runtime_error'
        && sourceType
        && (sourceType.startsWith('compaction_') || sourceType.startsWith('context-compaction-'))) {
        return 'conversation_control';
    }
    return 'turn_stream';
}
function isConversationControlEvent(event) {
    return getConversationEventScope(event) === 'conversation_control';
}
function shouldEventUpdateActiveTurnRef(event) {
    return Boolean(event.turnRef) && getConversationEventScope(event) === 'turn_stream';
}
