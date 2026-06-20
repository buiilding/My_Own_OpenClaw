"use strict";
/**
 * Defines backend payload contract contracts for the TypeScript SDK runtime.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.filterBackendPayload = filterBackendPayload;
const BACKEND_PAYLOAD_KEYS_BY_TYPE = Object.freeze({
    query: Object.freeze([
        'text',
        'conversation_ref',
        'content',
        'screenshot_ref',
        'screenshot_refs',
        'capture_meta',
        'system_state_internal',
        'workspace_path',
        'repo_instruction_messages',
        'client_prompt_layers',
        'agent_definition',
    ]),
    'stop-query': Object.freeze(['conversation_ref', 'turn_ref']),
    'rehydrate-conversation': Object.freeze([
        'conversation_ref',
        'messages',
        'rehydrate_mode',
        'workspace_path',
        'repo_instruction_messages',
    ]),
    'load-settings': Object.freeze(['client_version']),
    'list-models': Object.freeze([]),
    'update-settings': Object.freeze([
        'model_mode',
        'model_provider',
        'selected_model_id',
        'interaction_mode',
        'speech_mode_enabled',
        'wakeword_enabled',
        'wakeword_stt_enabled',
        'browser_automation_enabled',
        'include_query_screenshot',
        'provider_api_keys',
        'tools',
        'agent_definition',
    ]),
    'wakeword-detected': Object.freeze([]),
    'compact-history': Object.freeze(['force', 'conversation_ref']),
    'tool-result': Object.freeze(['request_id', 'success', 'data', 'error']),
    'tool-bundle-result': Object.freeze([
        'bundle_id',
        'status',
        'screenshot',
        'screenshot_ref',
        'capture_meta',
        'system_state',
        'step_results',
        'error',
    ]),
});
const PROVIDER_API_KEY_ENTRY_KEYS = Object.freeze(['enabled', 'api_key']);
const PROVIDER_API_KEY_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const TOOL_SETTINGS_KEYS = Object.freeze(['mode', 'client_manifest']);
const CAPTURE_META_KEYS = Object.freeze([
    'source_w',
    'source_h',
    'crop_x',
    'crop_y',
    'crop_w',
    'crop_h',
    'desktop_virtual_bounds',
    'monitor_id',
    'timestamp',
    'capture_engine',
]);
const CAPTURE_META_REQUIRED_NUMBER_KEYS = Object.freeze([
    'source_w',
    'source_h',
    'crop_x',
    'crop_y',
    'crop_w',
    'crop_h',
    'timestamp',
]);
const CAPTURE_BOUNDS_KEYS = Object.freeze(['x', 'y', 'width', 'height']);
function isJsonRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function filterKeys(source, allowedKeys) {
    if (!isJsonRecord(source)) {
        return null;
    }
    const filtered = {};
    for (const key of allowedKeys) {
        if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined) {
            filtered[key] = source[key];
        }
    }
    return filtered;
}
function filterNestedRecordEntries(source, allowedEntryKeys) {
    if (!isJsonRecord(source)) {
        return null;
    }
    const filtered = {};
    for (const key of Object.keys(source)) {
        if (!PROVIDER_API_KEY_NAME_PATTERN.test(key)) {
            continue;
        }
        const entry = filterKeys(source[key], allowedEntryKeys);
        if (entry && Object.keys(entry).length > 0) {
            filtered[key] = entry;
        }
    }
    return Object.keys(filtered).length > 0 ? filtered : null;
}
function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}
function normalizeCaptureBounds(value) {
    const bounds = filterKeys(value, CAPTURE_BOUNDS_KEYS);
    if (!bounds) {
        return null;
    }
    return CAPTURE_BOUNDS_KEYS.every(key => isFiniteNumber(bounds[key])) ? bounds : null;
}
function normalizeCaptureMeta(value) {
    const captureMeta = filterKeys(value, CAPTURE_META_KEYS);
    if (!captureMeta) {
        return null;
    }
    if (!CAPTURE_META_REQUIRED_NUMBER_KEYS.every(key => isFiniteNumber(captureMeta[key]))) {
        return null;
    }
    if (Object.prototype.hasOwnProperty.call(captureMeta, 'desktop_virtual_bounds')) {
        const bounds = normalizeCaptureBounds(captureMeta.desktop_virtual_bounds);
        if (bounds) {
            captureMeta.desktop_virtual_bounds = bounds;
        }
        else {
            delete captureMeta.desktop_virtual_bounds;
        }
    }
    return captureMeta;
}
function normalizeUpdateSettingsPayload(payload) {
    const nextPayload = { ...payload };
    const tools = filterKeys(nextPayload.tools, TOOL_SETTINGS_KEYS);
    if (tools) {
        nextPayload.tools = tools;
    }
    else {
        delete nextPayload.tools;
    }
    const providerApiKeys = filterNestedRecordEntries(nextPayload.provider_api_keys, PROVIDER_API_KEY_ENTRY_KEYS);
    if (providerApiKeys) {
        nextPayload.provider_api_keys = providerApiKeys;
    }
    else {
        delete nextPayload.provider_api_keys;
    }
    return nextPayload;
}
function normalizeToolResultPayload(payload) {
    const nextPayload = { ...payload };
    if (isJsonRecord(nextPayload.data) && Object.prototype.hasOwnProperty.call(nextPayload.data, 'capture_meta')) {
        const data = { ...nextPayload.data };
        const captureMeta = normalizeCaptureMeta(data.capture_meta);
        if (captureMeta) {
            data.capture_meta = captureMeta;
        }
        else {
            delete data.capture_meta;
        }
        nextPayload.data = data;
    }
    return nextPayload;
}
function normalizeToolBundleResultPayload(payload) {
    const nextPayload = { ...payload };
    if (Object.prototype.hasOwnProperty.call(nextPayload, 'capture_meta')) {
        const captureMeta = normalizeCaptureMeta(nextPayload.capture_meta);
        if (captureMeta) {
            nextPayload.capture_meta = captureMeta;
        }
        else {
            delete nextPayload.capture_meta;
        }
    }
    return nextPayload;
}
function normalizeKnownPayload(type, payload) {
    if (type === 'update-settings') {
        return normalizeUpdateSettingsPayload(payload);
    }
    if (type === 'tool-result') {
        return normalizeToolResultPayload(payload);
    }
    if (type === 'tool-bundle-result') {
        return normalizeToolBundleResultPayload(payload);
    }
    return payload;
}
function filterBackendPayload(type, payload = {}) {
    const allowedKeys = BACKEND_PAYLOAD_KEYS_BY_TYPE[type];
    if (!allowedKeys) {
        return { ...payload };
    }
    const filtered = filterKeys(payload, allowedKeys) ?? {};
    return normalizeKnownPayload(type, filtered);
}
