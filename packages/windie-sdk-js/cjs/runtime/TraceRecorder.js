"use strict";
/**
 * Provides the trace recorder module for the TypeScript SDK runtime.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TraceRecorder = void 0;
exports.sanitizeTraceData = sanitizeTraceData;
const events_js_1 = require("../conversation/events.js");
const REDACTED_KEYS = new Set([
    'accesstoken',
    'apikey',
    'authorization',
    'bearer',
    'bearertoken',
    'content',
    'credential',
    'credentials',
    'embedding',
    'embeddings',
    'filecontent',
    'memory',
    'memories',
    'messagetext',
    'oauthstate',
    'password',
    'providerpayload',
    'rawrows',
    'refreshtoken',
    'screenshot',
    'secret',
    'shelloutput',
    'sqlrow',
    'sqlrows',
    'stack',
    'text',
    'token',
    'usertext',
]);
function isoNow() {
    return new Date().toISOString();
}
function toError(error) {
    if (!error) {
        return null;
    }
    if (error instanceof Error) {
        return {
            code: error.name || 'Error',
            message: error.message || 'Unknown trace error',
        };
    }
    if (typeof error === 'object' && !Array.isArray(error)) {
        const record = error;
        const code = typeof record.code === 'string' && record.code.trim()
            ? record.code.trim()
            : 'Error';
        const message = typeof record.message === 'string' && record.message.trim()
            ? record.message.trim()
            : 'Unknown trace error';
        return { code, message };
    }
    return {
        code: 'Error',
        message: String(error),
    };
}
function sanitizeTraceValue(value) {
    if (value == null) {
        return value;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(sanitizeTraceValue);
    }
    if (typeof value !== 'object') {
        return String(value);
    }
    const sanitized = {};
    for (const [key, entry] of Object.entries(value)) {
        const normalizedKey = key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        if (REDACTED_KEYS.has(normalizedKey) || normalizedKey.endsWith('token')) {
            sanitized[key] = '[redacted]';
            continue;
        }
        sanitized[key] = sanitizeTraceValue(entry);
    }
    return sanitized;
}
function sanitizeTraceData(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return undefined;
    }
    return sanitizeTraceValue(data);
}
class TraceRecorder {
    constructor(options) {
        this.conversationRef = options.conversationRef;
        this.turnRef = options.turnRef ?? null;
        this.userId = options.userId ?? null;
        this.runtime = options.runtime ?? 'sdk';
        this.emit = options.emit;
        this.traceId = options.traceId || (0, events_js_1.createRuntimeId)('trace');
    }
    context(parentSpanId) {
        return {
            traceId: this.traceId,
            parentSpanId: parentSpanId ?? null,
            conversationRef: this.conversationRef,
            turnRef: this.turnRef,
            userId: this.userId,
        };
    }
    async record(input) {
        const endedAt = input.endedAt ?? isoNow();
        const payload = {
            schemaVersion: 1,
            traceId: this.traceId,
            spanId: (0, events_js_1.createRuntimeId)('span'),
            parentSpanId: input.parentSpanId ?? null,
            path: input.path,
            stage: input.stage,
            status: input.status,
            runtime: input.runtime ?? this.runtime,
            conversationRef: this.conversationRef,
            turnRef: this.turnRef,
            userId: this.userId,
            requestId: input.requestId ?? null,
            startedAt: input.startedAt ?? null,
            endedAt,
            durationMs: typeof input.durationMs === 'number' && Number.isFinite(input.durationMs)
                ? input.durationMs
                : null,
            ...(input.data ? { data: sanitizeTraceData(input.data) } : {}),
            error: toError(input.error),
        };
        await this.emit?.(payload);
        return payload;
    }
}
exports.TraceRecorder = TraceRecorder;
