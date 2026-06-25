"use strict";
/**
 * Defines SDK-shaped host command names used by UI and host runtimes.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SDK_RUNTIME_COMMANDS = void 0;
exports.SDK_RUNTIME_COMMANDS = {
    CONVERSATION_SEND: 'conversation.send',
    CONVERSATION_STOP: 'conversation.stop',
    CONVERSATION_REHYDRATE: 'conversation.rehydrate',
    CONVERSATION_COMPACT: 'conversation.compact',
    CONVERSATION_LOAD: 'conversation.load',
    CONVERSATION_LOAD_DISPLAY: 'conversation.loadDisplay',
    CONVERSATION_LOAD_DISPLAY_TIMELINE: 'conversation.loadDisplayTimeline',
    CONVERSATION_LOAD_REHYDRATE: 'conversation.loadRehydrate',
    CONVERSATION_APPEND_EVENT: 'conversation.appendEvent',
    CONVERSATION_REPLACE_ROWS: 'conversation.replaceRows',
    CONVERSATION_EDIT_AND_RESEND: 'conversation.editAndResend',
    CONVERSATION_RETRY_TURN: 'conversation.retryTurn',
    CONVERSATION_CHECKOUT_REVISION: 'conversation.checkoutRevision',
    CONVERSATION_FORK: 'conversation.fork',
    CONVERSATION_LIST_REVISIONS: 'conversation.listRevisions',
    CONVERSATION_REPLACE_COMPACTED_REPLAY: 'conversation.replaceCompactedReplay',
    CONVERSATION_GET_REVISION: 'conversation.getRevision',
    CONVERSATIONS_LIST: 'conversations.list',
    CONVERSATIONS_SEARCH: 'conversations.search',
    CONVERSATIONS_DELETE: 'conversations.delete',
    CONVERSATIONS_CLEAR_ALL: 'conversations.clearAll',
    MEMORIES_LIST: 'memories.list',
    MEMORIES_DELETE: 'memories.delete',
    MEMORIES_CLEAR_ALL: 'memories.clearAll',
    SETTINGS_UPDATE: 'settings.update',
    MODELS_LIST: 'models.list',
    WAKEWORD_DETECTED: 'wakeword.detected',
    DIAGNOSTICS_APPEND: 'diagnostics.append',
};
