"use strict";
/**
 * Provides the agent session transport for the TypeScript SDK runtime.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentSession = void 0;
exports.rejectRemovedStopInputAliases = rejectRemovedStopInputAliases;
exports.resolveWebSocketImplementation = resolveWebSocketImplementation;
exports.deriveWsUrl = deriveWsUrl;
exports.createMessageId = createMessageId;
exports.buildAgentSessionHandshake = buildAgentSessionHandshake;
exports.createAgentSession = createAgentSession;
exports.createAgentRuntimeTransport = createAgentRuntimeTransport;
exports.mergeQueryAgentDefinition = mergeQueryAgentDefinition;
const backendEvents_js_1 = require("../events/backendEvents.js");
const backendPayloadContract_js_1 = require("./backendPayloadContract.js");
function rejectRemovedStopInputAliases(input) {
    if (!input || typeof input !== 'object') {
        return;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'conversation_ref')
        || Object.prototype.hasOwnProperty.call(input, 'turn_ref')) {
        throw new Error('AgentSession.stopQuery accepts conversationRef and turnRef; snake_case stop fields are not supported.');
    }
}
function resolveWebSocketImplementation(WebSocketImpl) {
    if (WebSocketImpl) {
        return WebSocketImpl;
    }
    const nodeLikeProcess = globalThis.process;
    if (typeof nodeLikeProcess?.versions?.node === 'string') {
        return ws_1.default;
    }
    if (typeof globalThis.WebSocket === 'function') {
        return globalThis.WebSocket;
    }
    return ws_1.default;
}
function normalizeWsUrl(wsUrl) {
    return wsUrl.replace(/\/+$/, '');
}
function deriveWsUrl(httpBaseUrl) {
    const normalized = httpBaseUrl.replace(/\/+$/, '');
    const url = new URL(normalized);
    if (url.protocol === 'https:') {
        url.protocol = 'wss:';
    }
    else if (url.protocol === 'http:') {
        url.protocol = 'ws:';
    }
    url.pathname = url.pathname.replace(/\/+$/, '') + '/ws';
    return url.toString().replace(/\/+$/, '');
}
function createMessageId() {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
    }
    return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
function normalizeOptionalString(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function isJsonRecord(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
function buildAgentSessionHandshake({ userId, operatingSystem, agentDefinition, }) {
    const normalizedOperatingSystem = normalizeOptionalString(operatingSystem);
    const nextAgentDefinition = isJsonRecord(agentDefinition)
        ? { ...agentDefinition }
        : (normalizedOperatingSystem ? {} : null);
    if (nextAgentDefinition && normalizedOperatingSystem) {
        const runtime = isJsonRecord(nextAgentDefinition.runtime)
            ? { ...nextAgentDefinition.runtime }
            : {};
        if (!normalizeOptionalString(runtime.operating_system)) {
            runtime.operating_system = normalizedOperatingSystem;
        }
        nextAgentDefinition.runtime = runtime;
    }
    return {
        type: 'handshake',
        user_id: userId,
        ...(nextAgentDefinition ? { agent_definition: nextAgentDefinition } : {}),
    };
}
function createAgentSession(options) {
    const wsUrl = options.wsUrl
        ? normalizeWsUrl(options.wsUrl)
        : deriveWsUrl(options.backendUrl);
    const WebSocketImpl = resolveWebSocketImplementation(options.WebSocketImpl);
    const socketOptions = options.headers && Object.keys(options.headers).length > 0
        ? { headers: options.headers }
        : undefined;
    const socket = new WebSocketImpl(wsUrl, socketOptions);
    return new AgentSession(socket, buildAgentSessionHandshake({
        userId: options.userId,
        operatingSystem: options.operatingSystem,
        agentDefinition: options.agentDefinition,
    }));
}
function attachSocketListener(socket, event, listener) {
    if (typeof socket.addEventListener === 'function') {
        socket.addEventListener(event, listener);
        return () => socket.removeEventListener?.(event, listener);
    }
    if (typeof socket.on === 'function') {
        socket.on(event, listener);
        return () => socket.off?.(event, listener);
    }
    throw new Error('Agent SDK WebSocket implementation does not support event listeners');
}
function normalizeIncomingSocketMessage(payload) {
    if (payload && typeof payload === 'object' && 'data' in payload) {
        return payload.data;
    }
    if (payload instanceof Uint8Array) {
        return new TextDecoder().decode(payload);
    }
    return payload;
}
function normalizeClosePayload(payload) {
    if (!payload || typeof payload !== 'object') {
        return {};
    }
    const candidate = payload;
    return {
        code: typeof candidate.code === 'number' ? candidate.code : undefined,
        reason: typeof candidate.reason === 'string' ? candidate.reason : undefined,
        wasClean: typeof candidate.wasClean === 'boolean' ? candidate.wasClean : undefined,
    };
}
class AgentSession {
    constructor(socket, handshake) {
        this.socket = socket;
        this.handshake = handshake;
        this.listeners = new Map();
        this.detachSocketListeners = [];
        this.resolveReady = null;
        this.rejectReady = null;
        this.isReady = false;
        this.readyPromise = new Promise((resolve, reject) => {
            this.resolveReady = resolve;
            this.rejectReady = reject;
        });
        this.detachSocketListeners.push(attachSocketListener(this.socket, 'open', () => {
            this.socket.send(JSON.stringify(handshake));
            this.isReady = true;
            this.resolveReady?.();
            this.emit('open', undefined);
        }));
        this.detachSocketListeners.push(attachSocketListener(this.socket, 'message', payload => {
            const raw = normalizeIncomingSocketMessage(payload);
            let parsed = raw;
            if (typeof raw === 'string') {
                try {
                    parsed = JSON.parse(raw);
                }
                catch {
                    parsed = raw;
                }
            }
            if ((0, backendEvents_js_1.isBackendEvent)(parsed)) {
                this.emit('message', parsed);
                this.emit('event', parsed);
                this.emit(parsed.type, parsed);
            }
            else {
                this.emit('message', parsed);
            }
        }));
        this.detachSocketListeners.push(attachSocketListener(this.socket, 'close', payload => {
            const closePayload = normalizeClosePayload(payload);
            if (!this.isReady) {
                this.rejectReady?.(new Error('Agent SDK session closed before handshake completed'));
            }
            this.emit('close', closePayload);
            this.detachSocketListeners.splice(0).forEach(detach => detach());
        }));
        this.detachSocketListeners.push(attachSocketListener(this.socket, 'error', payload => {
            if (!this.isReady) {
                this.rejectReady?.(payload);
            }
            this.emit('socket-error', payload);
        }));
    }
    async waitForOpen() {
        await this.readyPromise;
    }
    isOpen() {
        return this.isReady;
    }
    on(event, listener) {
        const bucket = this.listeners.get(event) ?? new Set();
        bucket.add(listener);
        this.listeners.set(event, bucket);
        return () => {
            bucket.delete(listener);
            if (bucket.size === 0) {
                this.listeners.delete(event);
            }
        };
    }
    async query(payload) {
        const backendPayload = payload.backendPayload && typeof payload.backendPayload === 'object' && !Array.isArray(payload.backendPayload)
            ? payload.backendPayload
            : {};
        return this.sendBackendMessage('query', {
            ...backendPayload,
            text: payload.text,
            conversation_ref: payload.conversationRef,
            agent_definition: payload.agentDefinition ?? backendPayload.agent_definition,
            content: payload.content ?? undefined,
            screenshot_ref: payload.screenshotRef ?? undefined,
            screenshot_refs: payload.screenshotRefs ?? undefined,
            system_state_internal: payload.systemStateInternal ?? undefined,
            workspace_path: payload.workspacePath ?? undefined,
        }, payload.turnRef ?? undefined);
    }
    async stopQuery(input = null) {
        rejectRemovedStopInputAliases(input);
        return this.sendBackendMessage('stop-query', {
            conversation_ref: input?.conversationRef ?? null,
            turn_ref: input?.turnRef ?? null,
        });
    }
    async updateSettings(config) {
        return this.sendBackendMessage('update-settings', config);
    }
    async listModels() {
        return this.sendBackendMessage('list-models', {});
    }
    async rehydrateConversation(payload) {
        return this.sendBackendMessage('rehydrate-conversation', {
            ...payload,
            rehydrate_mode: payload.rehydrate_mode ?? 'replace',
        });
    }
    async compactHistory(payload) {
        return this.sendBackendMessage('compact-history', payload);
    }
    async wakewordDetected(payload = {}) {
        return this.sendBackendMessage('wakeword-detected', payload);
    }
    async sendToolResultPayload(payload) {
        return this.sendBackendMessage('tool-result', payload);
    }
    async sendToolBundleResultPayload(payload) {
        return this.sendBackendMessage('tool-bundle-result', payload);
    }
    close(code, reason) {
        this.socket.close(code, reason);
    }
    async sendBackendMessage(type, payload, messageId) {
        await this.waitForOpen();
        const id = messageId || createMessageId();
        this.socket.send(JSON.stringify({
            id,
            type,
            payload: (0, backendPayloadContract_js_1.filterBackendPayload)(type, payload),
            user_id: this.handshake.user_id,
            timestamp: new Date().toISOString(),
        }));
        return id;
    }
    emit(event, payload) {
        const bucket = this.listeners.get(event);
        if (!bucket) {
            return;
        }
        bucket.forEach(listener => {
            listener(payload);
        });
    }
}
exports.AgentSession = AgentSession;
function createAgentRuntimeTransport(session, conversationRef, agentDefinition) {
    return {
        connect: async () => session.waitForOpen(),
        handshake: async () => undefined,
        sendQuery: async (payload, options = {}) => session.query({
            text: typeof payload.text === 'string' ? payload.text : '',
            conversationRef: typeof payload.conversation_ref === 'string'
                ? payload.conversation_ref
                : conversationRef,
            agentDefinition: mergeQueryAgentDefinition(agentDefinition, payload.agent_definition && typeof payload.agent_definition === 'object'
                ? payload.agent_definition
                : null),
            backendPayload: payload,
            turnRef: options.messageId ?? null,
            content: typeof payload.content === 'string' ? payload.content : null,
            screenshotRef: typeof payload.screenshot_ref === 'string' ? payload.screenshot_ref : null,
            screenshotRefs: Array.isArray(payload.screenshot_refs)
                ? payload.screenshot_refs.filter((value) => typeof value === 'string')
                : null,
            attachmentContext: typeof payload.attachment_context === 'string' ? payload.attachment_context : null,
            attachmentFilenames: Array.isArray(payload.attachment_filenames)
                ? payload.attachment_filenames.filter((value) => typeof value === 'string')
                : null,
            systemStateInternal: payload.system_state_internal && typeof payload.system_state_internal === 'object'
                ? payload.system_state_internal
                : null,
            workspacePath: typeof payload.workspace_path === 'string' ? payload.workspace_path : null,
        }),
        sendToolResult: async (payload) => {
            await session.sendToolResultPayload(payload);
        },
        sendToolBundleResult: async (payload) => {
            await session.sendToolBundleResultPayload(payload);
        },
        rehydrateConversation: async (payload) => {
            await session.rehydrateConversation({
                conversation_ref: typeof payload.conversation_ref === 'string'
                    ? payload.conversation_ref
                    : conversationRef,
                messages: Array.isArray(payload.messages) ? payload.messages : [],
                model_history: isJsonRecord(payload.model_history) ? payload.model_history : null,
                rehydrate_mode: 'replace',
                workspace_path: typeof payload.workspace_path === 'string' ? payload.workspace_path : null,
                repo_instruction_messages: Array.isArray(payload.repo_instruction_messages)
                    ? payload.repo_instruction_messages.filter(isJsonRecord)
                    : null,
            });
        },
        compactHistory: async (payload) => session.compactHistory(payload),
        wakewordDetected: async (payload) => session.wakewordDetected(payload),
        stop: async (payload) => {
            await session.stopQuery({
                conversationRef: typeof payload.conversation_ref === 'string'
                    ? payload.conversation_ref
                    : conversationRef,
                turnRef: typeof payload.turn_ref === 'string' ? payload.turn_ref : null,
            });
        },
        updateSettings: async (payload) => {
            await session.updateSettings(payload);
        },
        listModels: async () => session.listModels(),
        subscribe: listener => session.on('event', listener),
        close: async () => session.close(1000, 'conversation-runtime-close'),
    };
}
function cloneJsonRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return JSON.parse(JSON.stringify(value));
}
function mergeJsonRecord(base, override) {
    const baseRecord = cloneJsonRecord(base);
    const overrideRecord = cloneJsonRecord(override);
    const merged = {
        ...baseRecord,
        ...overrideRecord,
    };
    return Object.keys(merged).length > 0 ? merged : undefined;
}
function mergeArrayValues(base, override) {
    const merged = [
        ...(Array.isArray(base) ? base : []),
        ...(Array.isArray(override) ? override : []),
    ];
    return merged.length > 0 ? merged : undefined;
}
function hasNonEmptyManifestTools(manifest) {
    return Array.isArray(manifest.tools) && manifest.tools.length > 0;
}
function hasToolPolicyOverride(tools) {
    if (!tools || typeof tools !== 'object' || Array.isArray(tools)) {
        return false;
    }
    const record = tools;
    return (Array.isArray(record.available_tools)
        || Array.isArray(record.enabled_remote_tools)
        || Array.isArray(record.disabled_tools)
        || Array.isArray(record.disabled_capabilities)
        || record.mode === 'client_only'
        || record.mode === 'explicit');
}
function mergeAgentDefinitionTools(baseTools, overrideTools) {
    const mergedTools = mergeJsonRecord(baseTools, overrideTools);
    if (!mergedTools) {
        return undefined;
    }
    const baseClientManifest = cloneJsonRecord(baseTools?.client_manifest);
    const overrideClientManifest = cloneJsonRecord(overrideTools?.client_manifest);
    if (hasNonEmptyManifestTools(overrideClientManifest)) {
        mergedTools.client_manifest = overrideClientManifest;
    }
    else if (Object.keys(overrideClientManifest).length > 0 && hasToolPolicyOverride(overrideTools)) {
        mergedTools.client_manifest = overrideClientManifest;
    }
    else if (Object.keys(baseClientManifest).length > 0) {
        mergedTools.client_manifest = baseClientManifest;
    }
    else if (Object.keys(overrideClientManifest).length > 0) {
        mergedTools.client_manifest = overrideClientManifest;
    }
    return mergedTools;
}
function mergeQueryAgentDefinition(baseDefinition, queryDefinition) {
    if (!queryDefinition || Object.keys(queryDefinition).length === 0) {
        return baseDefinition;
    }
    const base = cloneJsonRecord(baseDefinition);
    const query = cloneJsonRecord(queryDefinition);
    const merged = {
        ...base,
        ...query,
    };
    const tools = mergeAgentDefinitionTools(base.tools, query.tools);
    if (tools) {
        merged.tools = tools;
    }
    const runtime = mergeJsonRecord(base.runtime, query.runtime);
    if (runtime) {
        merged.runtime = runtime;
    }
    for (const key of ['prompt_layers', 'agents_md', 'skills', 'plugins']) {
        const values = mergeArrayValues(base[key], query[key]);
        if (values) {
            merged[key] = values;
        }
    }
    return Object.keys(merged).length > 0 ? merged : undefined;
}
const ws_1 = __importDefault(require("ws"));
