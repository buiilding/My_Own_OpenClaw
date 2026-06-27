"use strict";
/**
 * Provides managed hosted agent session transport for the TypeScript SDK runtime.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ManagedAgentSession = void 0;
exports.createManagedAgentSession = createManagedAgentSession;
const backendEvents_js_1 = require("../events/backendEvents.js");
const AgentSession_js_1 = require("./AgentSession.js");
const ManagedWebSocketSession_js_1 = require("./ManagedWebSocketSession.js");
const BackendSocketFactory_js_1 = require("./BackendSocketFactory.js");
const backendPayloadContract_js_1 = require("./backendPayloadContract.js");
function resolveEndpointWsUrl(endpoint) {
    if (endpoint.wsUrl) {
        return endpoint.wsUrl.replace(/\/+$/, '');
    }
    const backendUrl = endpoint.backendUrl ?? endpoint.httpBaseUrl;
    if (!backendUrl) {
        throw new Error('Managed agent endpoint requires backendUrl or wsUrl');
    }
    return (0, AgentSession_js_1.deriveWsUrl)(backendUrl);
}
class ManagedAgentSession {
    constructor(options) {
        this.listeners = new Map();
        this.activeEndpointIndex = 0;
        this.endpoints = normalizeEndpoints(options);
        const WebSocketImpl = (0, AgentSession_js_1.resolveWebSocketImplementation)(options.WebSocketImpl);
        this.session = (0, ManagedWebSocketSession_js_1.createManagedWebSocketSession)({
            createSocket: () => {
                const endpoint = this.currentEndpoint();
                return (0, BackendSocketFactory_js_1.createAgentBackendSocket)({
                    WebSocketImpl,
                    wsUrl: resolveEndpointWsUrl(endpoint),
                    wsOrigin: endpoint.wsOrigin,
                    headers: {
                        ...(options.headers ?? {}),
                        ...(endpoint.headers ?? {}),
                    },
                });
            },
            buildHandshake: () => (0, AgentSession_js_1.buildAgentSessionHandshake)({
                userId: options.userId,
                operatingSystem: options.operatingSystem,
                agentDefinition: options.agentDefinition,
            }),
            getUserId: () => options.userId,
            normalizePayload: options.normalizePayload ?? backendPayloadContract_js_1.filterBackendPayload,
            createMessageId: options.createMessageId,
            reconnectIntervalMs: options.reconnectIntervalMs,
            connectTimeoutMs: options.connectTimeoutMs,
            idleDisconnectTimeoutMs: options.idleDisconnectTimeoutMs,
            shouldHoldOpen: options.shouldHoldOpen,
            beforeConnect: options.beforeConnect,
            advanceEndpoint: () => this.advanceEndpoint(),
            onFallback: () => options.onFallback?.(this.currentEndpoint()),
            onSocketChange: options.onSocketChange,
            onOpen: payload => {
                options.onOpen?.(payload);
                this.emit('open', undefined);
            },
            onClose: payload => {
                options.onClose?.(payload);
                this.emit('close', {
                    reason: payload.closeReason ?? undefined,
                    wasClean: !payload.shouldReconnect,
                });
            },
            onError: payload => {
                options.onError?.(payload);
                this.emit('socket-error', payload.error);
            },
            onHandshakeError: options.onHandshakeError,
            onMessageError: options.onMessageError,
            onSend: options.onSend,
            onEvent: event => {
                this.emit('message', event);
                if (!(0, backendEvents_js_1.isBackendEvent)(event)) {
                    return;
                }
                this.emit('event', event);
                this.emit(event.type, event);
            },
            log: options.log,
        });
    }
    async waitForOpen() {
        await this.session.ensureConnected({ reason: 'agent-session' });
    }
    isOpen() {
        return this.session.isOpen();
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
        return this.sendBackendMessage('query', {
            ...(payload.backendPayload ?? {}),
            text: payload.text,
            conversation_ref: payload.conversationRef,
            agent_definition: payload.agentDefinition ?? payload.backendPayload?.agent_definition,
            content: payload.content ?? undefined,
            screenshot_ref: payload.screenshotRef ?? undefined,
            screenshot_refs: payload.screenshotRefs ?? undefined,
            system_state_internal: payload.systemStateInternal ?? undefined,
            workspace_path: payload.workspacePath ?? undefined,
        }, payload.turnRef ?? undefined);
    }
    async stopQuery(input = null) {
        (0, AgentSession_js_1.rejectRemovedStopInputAliases)(input);
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
    close(_code, reason = 'agent-session-close') {
        this.session.close(reason);
    }
    noteTraffic(reason = 'traffic') {
        this.session.noteTraffic(reason);
    }
    syncIdleTimer(reason = 'idle-sync') {
        this.session.syncIdleTimer(reason);
    }
    async sendBackendMessage(type, payload, messageId) {
        await this.waitForOpen();
        const id = this.session.sendMessage(type, payload, messageId ?? null);
        if (!id) {
            throw new Error(`Agent SDK managed session could not send ${type}`);
        }
        return id;
    }
    currentEndpoint() {
        return this.endpoints[this.activeEndpointIndex] ?? this.endpoints[0];
    }
    advanceEndpoint() {
        if (this.endpoints.length <= 1) {
            return false;
        }
        this.activeEndpointIndex = (this.activeEndpointIndex + 1) % this.endpoints.length;
        return true;
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
exports.ManagedAgentSession = ManagedAgentSession;
function normalizeEndpoints(options) {
    const endpoints = options.endpoints && options.endpoints.length > 0
        ? options.endpoints
        : [{
                backendUrl: options.backendUrl,
                wsUrl: options.wsUrl,
                wsOrigin: options.wsOrigin,
                headers: options.headers,
            }];
    return endpoints.map(endpoint => ({
        ...endpoint,
        backendUrl: endpoint.backendUrl ?? endpoint.httpBaseUrl ?? options.backendUrl,
    }));
}
function createManagedAgentSession(options) {
    return new ManagedAgentSession(options);
}
