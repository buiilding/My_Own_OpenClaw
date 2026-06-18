"use strict";
/**
 * Resolves SDK runtime debug environment flags.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCompactionStdoutEnabled = isCompactionStdoutEnabled;
const SDK_DEBUG_ENV = Object.freeze({
    compactionStdout: 'AGENT_DEBUG_COMPACTION_STDOUT',
});
function isCompactionStdoutEnabled(env = globalThis.process?.env) {
    return env?.[SDK_DEBUG_ENV.compactionStdout] === '1';
}
