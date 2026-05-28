"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WindieDesktopAgent = void 0;
const InMemoryConversationStore_js_1 = require("../stores/InMemoryConversationStore.js");
const conversationProjections_js_1 = require("../projections/conversationProjections.js");
const WindieClient_js_1 = require("./WindieClient.js");
function normalizeSendInput(input) {
    return typeof input === 'string' ? { text: input } : input;
}
function trimTrailingSlash(value) {
    return value.endsWith('/') ? value.slice(0, -1) : value;
}
function normalizeHttpUrl(value) {
    if (typeof value !== 'string' || !value.trim()) {
        return undefined;
    }
    try {
        const url = new URL(value.trim());
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            return undefined;
        }
        url.search = '';
        url.hash = '';
        if (!url.pathname || url.pathname === '/') {
            url.pathname = '/';
            return trimTrailingSlash(url.toString());
        }
        url.pathname = trimTrailingSlash(url.pathname);
        return url.toString();
    }
    catch {
        return undefined;
    }
}
function normalizeWsUrl(value) {
    if (typeof value !== 'string' || !value.trim()) {
        return undefined;
    }
    try {
        const url = new URL(value.trim());
        if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
            return undefined;
        }
        url.search = '';
        url.hash = '';
        url.pathname = trimTrailingSlash(url.pathname || '/');
        return url.toString();
    }
    catch {
        return undefined;
    }
}
function deriveWsFromHttp(httpUrl) {
    const url = new URL(httpUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/ws';
    url.search = '';
    url.hash = '';
    return trimTrailingSlash(url.toString());
}
function deriveHttpFromWs(wsUrl) {
    const url = new URL(wsUrl);
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    url.search = '';
    url.hash = '';
    const path = trimTrailingSlash(url.pathname || '/');
    url.pathname = path === '/ws' ? '/' : path;
    return trimTrailingSlash(url.toString());
}
function normalizeDesktopEndpoint(endpoint) {
    if (!endpoint) {
        return undefined;
    }
    if (typeof endpoint === 'string') {
        const backendUrl = normalizeHttpUrl(endpoint);
        const wsUrl = normalizeWsUrl(endpoint);
        if (!backendUrl && !wsUrl) {
            return undefined;
        }
        const httpBaseUrl = backendUrl ?? deriveHttpFromWs(wsUrl);
        return {
            backendUrl: httpBaseUrl,
            httpBaseUrl,
            wsUrl: wsUrl ?? deriveWsFromHttp(httpBaseUrl),
            wsOrigin: httpBaseUrl,
        };
    }
    if (endpoint.primary) {
        return normalizeDesktopEndpoint(endpoint.primary);
    }
    const backendUrl = normalizeHttpUrl(endpoint.backendUrl)
        ?? normalizeHttpUrl(endpoint.httpBaseUrl)
        ?? normalizeHttpUrl(endpoint.httpUrl);
    const wsUrl = normalizeWsUrl(endpoint.wsUrl);
    if (!backendUrl && !wsUrl) {
        return undefined;
    }
    const httpBaseUrl = backendUrl ?? deriveHttpFromWs(wsUrl);
    return {
        backendUrl: httpBaseUrl,
        httpBaseUrl,
        wsUrl: wsUrl ?? deriveWsFromHttp(httpBaseUrl),
        wsOrigin: normalizeHttpUrl(endpoint.wsOrigin) ?? httpBaseUrl,
    };
}
function normalizeDesktopEndpointCandidates(endpoint, candidates) {
    const nestedCandidates = endpoint && typeof endpoint === 'object' && Array.isArray(endpoint.fallbacks)
        ? endpoint.fallbacks
        : [];
    const all = [
        normalizeDesktopEndpoint(endpoint),
        ...nestedCandidates.map(normalizeDesktopEndpoint),
        ...(Array.isArray(candidates) ? candidates.map(normalizeDesktopEndpoint) : []),
    ].filter((item) => Boolean(item));
    const seen = new Set();
    const normalized = [];
    for (const item of all) {
        const key = `${item.backendUrl ?? item.httpBaseUrl ?? ''}::${item.wsUrl ?? ''}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        normalized.push(item);
    }
    return normalized.length > 0 ? normalized : undefined;
}
function resolveProcessEnv() {
    return globalThis.process?.env ?? {};
}
function resolveEnvDesktopEndpointCandidates() {
    const env = resolveProcessEnv();
    const explicitHttpUrl = normalizeHttpUrl(env.BACKEND_HTTP_URL);
    const explicitWsUrl = normalizeWsUrl(env.BACKEND_WS_URL);
    if (explicitHttpUrl || explicitWsUrl) {
        return [{
                httpUrl: explicitHttpUrl,
                wsUrl: explicitWsUrl,
            }];
    }
    if (typeof env.BACKEND_HOST === 'string' || typeof env.BACKEND_PORT === 'string') {
        const host = env.BACKEND_HOST || '127.0.0.1';
        const port = env.BACKEND_PORT || '8765';
        return [{
                httpUrl: `http://${host}:${port}`,
                wsUrl: `ws://${host}:${port}/ws`,
            }];
    }
    const defaultHttpUrl = normalizeHttpUrl(env.WINDIE_DEFAULT_BACKEND_HTTP_URL);
    const defaultWsUrl = normalizeWsUrl(env.WINDIE_DEFAULT_BACKEND_WS_URL);
    if (defaultHttpUrl || defaultWsUrl) {
        return [{
                httpUrl: defaultHttpUrl,
                wsUrl: defaultWsUrl,
            }];
    }
    return undefined;
}
function buildDesktopInstallAuth(options) {
    if (options.installAuth) {
        return options.installAuth;
    }
    const installToken = options.installToken ?? options.apiKey;
    if (!installToken) {
        return undefined;
    }
    return {
        installToken,
        autoRegister: false,
    };
}
function statusFromTerminalEvent(event, workspacePath) {
    if (event.type === 'turn_completed') {
        return {
            phase: 'ready',
            conversationRef: event.conversationRef,
            turnRef: event.turnRef,
            workspacePath,
        };
    }
    if (event.type === 'turn_stopped') {
        return {
            phase: 'stopped',
            conversationRef: event.conversationRef,
            turnRef: event.turnRef,
            workspacePath,
        };
    }
    if (event.type === 'turn_error' || event.type === 'runtime_error') {
        const error = typeof event.payload.error === 'string'
            ? event.payload.error
            : null;
        return {
            phase: 'error',
            conversationRef: event.conversationRef,
            turnRef: event.turnRef,
            workspacePath,
            error,
        };
    }
    return null;
}
class WindieDesktopAgent {
    constructor(options) {
        this.options = options;
        this.rowsListeners = new Set();
        this.eventListeners = new Set();
        this.currentTurnListeners = new Set();
        this.statusListeners = new Set();
        this.connectionListeners = new Set();
        this.fallbackListeners = new Set();
        this.trafficListeners = new Set();
        this.lastConnectionEvent = null;
        this.lastFallbackEvent = null;
        this.lastTrafficEvent = null;
        this.closed = false;
        this.runtime = options.runtime;
        this.conversationRef = options.conversationRef;
        this.currentStatus = {
            phase: 'ready',
            conversationRef: this.conversationRef,
            workspacePath: options.workspacePath ?? null,
        };
        this.detachEvents = this.attachRuntime(this.runtime);
        for (const event of options.initialConnectionEvents ?? []) {
            this.recordConnectionEvent(event);
        }
        for (const event of options.initialFallbackEvents ?? []) {
            this.recordFallbackEvent(event);
        }
        for (const event of options.initialTrafficEvents ?? []) {
            this.recordTrafficEvent(event);
        }
    }
    attachRuntime(runtime) {
        return runtime.subscribeEvents((event, snapshot) => {
            this.emitConversationEvent(event, snapshot);
            this.emitRows((0, conversationProjections_js_1.buildDisplayRows)([event]));
            this.emitCurrentTurn(snapshot.currentTurn, snapshot);
            const terminalStatus = statusFromTerminalEvent(event, this.options.workspacePath);
            if (terminalStatus) {
                this.setStatus(terminalStatus);
            }
        });
    }
    resolveInputConversationRef(input) {
        const payload = input && 'payload' in input ? input.payload : undefined;
        const fromPayload = payload && typeof payload === 'object' && !Array.isArray(payload)
            ? payload.conversation_ref
            : undefined;
        const direct = input?.conversation_ref;
        const value = typeof fromPayload === 'string' && fromPayload.trim()
            ? fromPayload.trim()
            : (typeof direct === 'string' && direct.trim() ? direct.trim() : '');
        return value || this.conversationRef;
    }
    useConversation(conversationRef) {
        if (conversationRef === this.conversationRef) {
            return this.runtime;
        }
        if (!this.options.agent?.conversation) {
            throw new Error('WindieDesktopAgent cannot switch conversations without a started WindieAgent');
        }
        this.detachEvents();
        this.runtime.close();
        this.conversationRef = conversationRef;
        this.runtime = this.options.agent.conversation({
            conversationRef,
            store: this.options.store,
        });
        this.detachEvents = this.attachRuntime(this.runtime);
        this.setStatus({
            phase: 'ready',
            conversationRef,
            workspacePath: this.options.workspacePath ?? null,
        });
        return this.runtime;
    }
    recordConnectionEvent(event) {
        this.lastConnectionEvent = event;
        this.connectionListeners.forEach(listener => listener(event));
    }
    recordFallbackEvent(event) {
        this.lastFallbackEvent = event;
        this.fallbackListeners.forEach(listener => listener(event));
    }
    recordTrafficEvent(event) {
        this.lastTrafficEvent = event;
        this.trafficListeners.forEach(listener => listener(event));
    }
    static async start(options) {
        const { apiKey, appName, connection, debug, endpoint, testing, workspace, workspacePath: explicitWorkspacePath, store, ...clientAndWakeOptions } = options;
        const legacyClientOptions = clientAndWakeOptions;
        const initialConnectionEvents = [];
        const initialFallbackEvents = [];
        const initialTrafficEvents = [];
        let desktopAgent = null;
        const emitConnection = (event) => {
            if (desktopAgent) {
                desktopAgent.recordConnectionEvent(event);
            }
            else {
                initialConnectionEvents.push(event);
            }
        };
        const emitFallback = (event) => {
            if (desktopAgent) {
                desktopAgent.recordFallbackEvent(event);
            }
            else {
                initialFallbackEvents.push(event);
            }
        };
        const emitTraffic = (event) => {
            if (desktopAgent) {
                desktopAgent.recordTrafficEvent(event);
            }
            else {
                initialTrafficEvents.push(event);
            }
        };
        const workspacePath = explicitWorkspacePath ?? workspace;
        const envEndpointCandidates = endpoint ? undefined : resolveEnvDesktopEndpointCandidates();
        const envPrimaryEndpoint = envEndpointCandidates?.[0];
        const normalizedEndpoint = normalizeDesktopEndpoint(endpoint ?? envPrimaryEndpoint);
        const normalizedEndpoints = normalizeDesktopEndpointCandidates(endpoint ?? envPrimaryEndpoint, envEndpointCandidates?.slice(1));
        const backendUrl = legacyClientOptions.backendUrl
            ?? legacyClientOptions.httpBaseUrl
            ?? normalizedEndpoint?.backendUrl
            ?? normalizedEndpoint?.httpBaseUrl
            ?? 'https://api.windieos.com';
        const installToken = legacyClientOptions.installToken ?? apiKey;
        const installAuth = buildDesktopInstallAuth({
            apiKey,
            installToken: legacyClientOptions.installToken,
            installAuth: legacyClientOptions.installAuth,
        });
        const client = new WindieClient_js_1.WindieClient({
            ...clientAndWakeOptions,
            backendUrl,
            httpBaseUrl: legacyClientOptions.httpBaseUrl ?? normalizedEndpoint?.httpBaseUrl ?? backendUrl,
            wsUrl: legacyClientOptions.wsUrl ?? normalizedEndpoint?.wsUrl,
            wsOrigin: legacyClientOptions.wsOrigin ?? normalizedEndpoint?.wsOrigin ?? backendUrl,
            backendEndpoints: legacyClientOptions.backendEndpoints ?? normalizedEndpoints,
            backendSession: legacyClientOptions.backendSession ?? 'managed',
            reconnectIntervalMs: connection?.reconnectIntervalMs ?? legacyClientOptions.reconnectIntervalMs,
            connectTimeoutMs: connection?.connectTimeoutMs ?? legacyClientOptions.connectTimeoutMs,
            idleDisconnectTimeoutMs: connection?.idleDisconnectTimeoutMs ?? legacyClientOptions.idleDisconnectTimeoutMs,
            log: debug?.log ?? legacyClientOptions.log,
            fetchImpl: testing?.fetchImpl ?? legacyClientOptions.fetchImpl,
            WebSocketImpl: testing?.WebSocketImpl ?? legacyClientOptions.WebSocketImpl,
            sidecar: testing?.sidecar ?? legacyClientOptions.sidecar,
            localRuntime: testing?.localRuntime ?? legacyClientOptions.localRuntime,
            installToken,
            installAuth,
            autoStartLocalRuntime: testing?.autoStartLocalRuntime ?? legacyClientOptions.autoStartLocalRuntime ?? true,
            onBackendOpen: payload => {
                emitConnection({ type: 'open', ...payload });
                legacyClientOptions.onBackendOpen?.(payload);
            },
            onBackendClose: payload => {
                emitConnection({ type: 'close', ...payload });
                legacyClientOptions.onBackendClose?.(payload);
            },
            onBackendError: payload => {
                emitConnection({ type: 'error', ...payload });
                legacyClientOptions.onBackendError?.(payload);
            },
            onBackendHandshakeError: error => {
                emitConnection({ type: 'handshake-error', error });
                legacyClientOptions.onBackendHandshakeError?.(error);
            },
            onBackendMessageError: error => {
                emitConnection({ type: 'message-error', error });
                legacyClientOptions.onBackendMessageError?.(error);
            },
            onBackendSend: type => {
                emitTraffic({ type });
                legacyClientOptions.onBackendSend?.(type);
            },
            onBackendFallback: endpoint => {
                emitFallback(endpoint);
                legacyClientOptions.onBackendFallback?.(endpoint);
            },
        });
        const agent = await client.wakeUp({
            ...clientAndWakeOptions,
            backendUrl,
            installToken,
            installAuth,
            name: appName ?? 'Windie Desktop Agent',
            workspacePath,
            builtins: clientAndWakeOptions.builtins ?? 'default',
        });
        const conversationRef = `conv-${agent.id}`;
        const conversationStore = store ?? new InMemoryConversationStore_js_1.InMemoryConversationStore();
        const runtime = agent.conversation({
            conversationRef,
            store: conversationStore,
        });
        desktopAgent = new WindieDesktopAgent({
            agent,
            runtime,
            store: conversationStore,
            conversationRef,
            workspacePath,
            initialConnectionEvents,
            initialFallbackEvents,
            initialTrafficEvents,
        });
        return desktopAgent;
    }
    onRows(listener) {
        this.rowsListeners.add(listener);
        return () => {
            this.rowsListeners.delete(listener);
        };
    }
    onConversationEvent(listener) {
        this.eventListeners.add(listener);
        return () => {
            this.eventListeners.delete(listener);
        };
    }
    onCurrentTurn(listener) {
        this.currentTurnListeners.add(listener);
        return () => {
            this.currentTurnListeners.delete(listener);
        };
    }
    onStatus(listener) {
        this.statusListeners.add(listener);
        listener(this.currentStatus);
        return () => {
            this.statusListeners.delete(listener);
        };
    }
    onConnection(listener) {
        this.connectionListeners.add(listener);
        if (this.lastConnectionEvent) {
            listener(this.lastConnectionEvent);
        }
        return () => {
            this.connectionListeners.delete(listener);
        };
    }
    onBackendFallback(listener) {
        this.fallbackListeners.add(listener);
        if (this.lastFallbackEvent) {
            listener(this.lastFallbackEvent);
        }
        return () => {
            this.fallbackListeners.delete(listener);
        };
    }
    onTraffic(listener) {
        this.trafficListeners.add(listener);
        if (this.lastTrafficEvent) {
            listener(this.lastTrafficEvent);
        }
        return () => {
            this.trafficListeners.delete(listener);
        };
    }
    onBackendEvent(listener) {
        return this.options.agent?.subscribeRawBackendEvents?.(listener) ?? (() => { });
    }
    async run(input) {
        const sendInput = normalizeSendInput(input);
        const runtime = this.useConversation(this.resolveInputConversationRef(sendInput));
        this.setStatus({
            phase: 'running',
            conversationRef: this.conversationRef,
            turnRef: sendInput.turnRef ?? null,
            workspacePath: this.options.workspacePath ?? null,
        });
        const result = await runtime.send(sendInput);
        this.setStatus({
            phase: 'running',
            conversationRef: this.conversationRef,
            turnRef: result.turnRef,
            workspacePath: this.options.workspacePath ?? null,
        });
        return result;
    }
    async stop(input) {
        const conversationRef = typeof input === 'object' && input?.conversation_ref
            ? input.conversation_ref
            : this.conversationRef;
        const turnRef = typeof input === 'string'
            ? input
            : (typeof input === 'object' ? input?.turn_ref : null);
        const runtime = this.useConversation(conversationRef || this.conversationRef);
        if (this.options.agent?.stop) {
            return this.options.agent.stop(conversationRef || this.conversationRef);
        }
        await runtime.stop(turnRef ?? null);
        return undefined;
    }
    async load() {
        return this.runtime.load();
    }
    async ensureConnected() {
        if (this.options.agent?.ensureConnected) {
            await this.options.agent.ensureConnected();
            return;
        }
        await this.runtime.ensureConnected();
    }
    isConnected() {
        return this.options.agent?.isConnected?.() ?? false;
    }
    async updateSettings(payload) {
        if (this.options.agent?.updateSettings) {
            return this.options.agent.updateSettings(payload);
        }
        return this.runtime.updateSettings(payload);
    }
    async listModels() {
        if (!this.options.agent?.listModels) {
            throw new Error('WindieDesktopAgent.listModels requires a started WindieAgent');
        }
        return this.options.agent.listModels();
    }
    async requestModelList() {
        if (this.options.agent?.requestModelList) {
            return this.options.agent.requestModelList();
        }
        return this.runtime.requestModelList();
    }
    async rehydrate(payload) {
        if (payload) {
            this.useConversation(this.resolveInputConversationRef(payload));
            await this.runtime.rehydrateMessages(payload);
            return undefined;
        }
        return this.runtime.rehydrate();
    }
    async rehydrateMessages(payload) {
        this.useConversation(this.resolveInputConversationRef(payload));
        await this.runtime.rehydrateMessages(payload);
    }
    async compactHistory(input = {}) {
        this.useConversation(this.resolveInputConversationRef(input));
        return this.runtime.compactHistory({
            force: input.force,
            payload: input,
        });
    }
    async wakewordDetected(payload = {}) {
        if (this.options.agent?.wakewordDetected) {
            return this.options.agent.wakewordDetected(payload);
        }
        return this.runtime.wakewordDetected(payload);
    }
    noteBackendTraffic(reason = 'traffic') {
        this.options.agent?.noteBackendTraffic?.(reason);
    }
    syncBackendIdleTimer(reason = 'idle-sync') {
        this.options.agent?.syncBackendIdleTimer?.(reason);
    }
    async localStatus() {
        return this.options.agent?.status ? this.options.agent.status() : null;
    }
    close() {
        if (this.closed) {
            return;
        }
        this.closed = true;
        this.detachEvents();
        this.runtime.close();
        this.options.agent?.sleep();
        this.setStatus({
            phase: 'closed',
            conversationRef: this.conversationRef,
            workspacePath: this.options.workspacePath ?? null,
        });
    }
    async shutdown() {
        this.close();
        await this.options.agent?.shutdownLocalRuntime();
    }
    emitRows(rows) {
        if (rows.length === 0) {
            return;
        }
        this.rowsListeners.forEach(listener => listener(rows));
    }
    emitConversationEvent(event, snapshot) {
        this.eventListeners.forEach(listener => listener(event, snapshot));
    }
    emitCurrentTurn(currentTurn, snapshot) {
        this.currentTurnListeners.forEach(listener => listener(currentTurn, snapshot));
    }
    setStatus(status) {
        this.currentStatus = status;
        this.statusListeners.forEach(listener => listener(status));
    }
}
exports.WindieDesktopAgent = WindieDesktopAgent;
