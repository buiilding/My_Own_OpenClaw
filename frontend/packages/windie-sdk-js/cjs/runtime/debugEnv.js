"use strict";
/**
 * Resolves SDK runtime debug environment flags.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCompactionStdoutEnabled = isCompactionStdoutEnabled;
exports.isStrictRuntimeInputEnabled = isStrictRuntimeInputEnabled;
const SDK_DEBUG_ENV = Object.freeze({
    compactionStdout: 'AGENT_DEBUG_COMPACTION_STDOUT',
    strictRuntimeInput: 'WINDIE_STRICT_RUNTIME_INPUT',
});
function isCompactionStdoutEnabled(env = globalThis.process?.env) {
    return env?.[SDK_DEBUG_ENV.compactionStdout] === '1';
}
function isStrictRuntimeInputEnabled(env = globalThis.process?.env) {
    const nodeEnv = String(env?.NODE_ENV || '').trim().toLowerCase();
    return (env?.[SDK_DEBUG_ENV.strictRuntimeInput] === '1'
        || nodeEnv === 'test'
        || nodeEnv === 'development');
}
