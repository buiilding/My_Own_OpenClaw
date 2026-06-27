"use strict";
/**
 * Provides the tool output content module for the TypeScript SDK runtime.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordFromUnknown = recordFromUnknown;
exports.stringField = stringField;
exports.readToolOutputContent = readToolOutputContent;
exports.normalizeLocalToolResultData = normalizeLocalToolResultData;
exports.readBundleStepModelContent = readBundleStepModelContent;
const OUTPUT_FALLBACK_KEYS = ['output', 'message', 'error'];
function recordFromUnknown(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : null;
}
function stringField(payload, ...keys) {
    if (!payload) {
        return null;
    }
    for (const key of keys) {
        const value = payload[key];
        if (typeof value === 'string' && value.trim()) {
            return value;
        }
    }
    return null;
}
function resultRecord(payload) {
    return recordFromUnknown(payload.result);
}
function jsonFallback(payload) {
    return JSON.stringify(payload);
}
function readToolOutputContent(payload) {
    const result = resultRecord(payload);
    const output = stringField(payload, ...OUTPUT_FALLBACK_KEYS)
        ?? stringField(result, ...OUTPUT_FALLBACK_KEYS);
    const modelContent = output ?? jsonFallback(payload);
    return {
        displayContent: modelContent,
        modelContent,
        hasModelContent: Boolean(output),
    };
}
function normalizeLocalToolResultData(data, fallbackOutput = '') {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return { output: fallbackOutput };
    }
    const explicitOutput = data.output;
    const output = explicitOutput
        ?? data.message
        ?? data.error
        ?? fallbackOutput;
    const normalized = { ...data };
    delete normalized.path_trace;
    normalized.output = output;
    return normalized;
}
function readBundleStepModelContent(step) {
    const output = step.output ?? step.result;
    if (typeof output === 'string') {
        return output;
    }
    const outputRecord = recordFromUnknown(output);
    if (outputRecord) {
        return readToolOutputContent(outputRecord).modelContent;
    }
    return JSON.stringify(step);
}
