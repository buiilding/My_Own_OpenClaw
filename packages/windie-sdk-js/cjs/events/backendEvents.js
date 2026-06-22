"use strict";
/**
 * Provides the backend events module for the TypeScript SDK runtime.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isBackendEvent = isBackendEvent;
const BACKEND_EVENT_TYPES = new Set([
    'query-accepted',
    'llm-thought',
    'streaming-response',
    'streaming-complete',
    'context-compaction-started',
    'context-compaction-completed',
    'context-compaction-failed',
    'tool-call',
    'tool-output',
    'tool-bundle',
    'web-search-progress',
    'audio-chunk',
    'wakeword-activated',
    'wakeword-greeting',
    'settings-loaded',
    'settings-updated',
    'models-listed',
    'local-user-message',
    'system-prompt',
    'user-message-full',
    'assistant-message-full',
    'token-count',
    'tool-schemas',
    'trace-event',
    'model-history-updated',
    'error',
]);
function isBackendEvent(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const candidate = value;
    return typeof candidate.type === 'string' && BACKEND_EVENT_TYPES.has(candidate.type);
}
