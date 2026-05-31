"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordFromUnknown = recordFromUnknown;
exports.stringField = stringField;
exports.readToolOutputContent = readToolOutputContent;
exports.normalizeLocalToolResultData = normalizeLocalToolResultData;
exports.readBundleStepModelContent = readBundleStepModelContent;
const DISPLAY_FALLBACK_KEYS = ['return_display', 'output', 'message'];
const MODEL_FALLBACK_KEYS = ['llm_content', 'output', 'message'];
const FRONTEND_DERIVED_OUTPUT_KEYS = new Set([
    'display_content',
    'return_display',
    'llm_content',
    'model_llm_content',
    'llm_content_original_tokens',
    'llm_content_token_limit',
    'llm_content_truncated',
    'llm_content_token_source',
    'output_token_limit',
    'output_truncated',
    'original_output_tokens',
]);
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
function fallbackText(payload) {
    return stringField(payload, 'text', 'content', 'finalResponse', 'final_response', 'error') ?? '';
}
function jsonFallback(payload) {
    return fallbackText(payload) || JSON.stringify(payload);
}
function readToolOutputContent(payload) {
    const result = resultRecord(payload);
    const canonicalDisplay = stringField(payload, 'display_content')
        ?? stringField(result, 'display_content');
    const canonicalModel = stringField(payload, 'model_llm_content')
        ?? stringField(result, 'model_llm_content');
    const fallbackDisplay = stringField(payload, ...DISPLAY_FALLBACK_KEYS)
        ?? stringField(result, ...DISPLAY_FALLBACK_KEYS)
        ?? stringField(payload, 'llm_content')
        ?? stringField(result, 'llm_content')
        ?? fallbackText(payload);
    const fallbackModel = stringField(payload, ...MODEL_FALLBACK_KEYS)
        ?? stringField(result, ...MODEL_FALLBACK_KEYS)
        ?? fallbackText(payload);
    const modelContent = canonicalModel ?? fallbackModel ?? jsonFallback(payload);
    return {
        displayContent: canonicalDisplay ?? fallbackDisplay ?? modelContent,
        modelContent,
        hasModelContent: Boolean(canonicalModel ?? fallbackModel),
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
    const normalized = {};
    for (const [key, value] of Object.entries(data)) {
        if (!FRONTEND_DERIVED_OUTPUT_KEYS.has(key)) {
            normalized[key] = value;
        }
    }
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
