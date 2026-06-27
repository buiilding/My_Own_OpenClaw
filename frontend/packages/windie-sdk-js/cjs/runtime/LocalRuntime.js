"use strict";
/**
 * Coordinates the local runtime provider for the TypeScript SDK runtime.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentLocalRuntimeHttpClient = void 0;
exports.moduleTool = moduleTool;
exports.createAgentLocalRuntimeProvider = createAgentLocalRuntimeProvider;
const RuntimeEnv_js_1 = require("./RuntimeEnv.js");
const LOCAL_RUNTIME_TOKEN_HEADER = 'x-agent-local-runtime-token';
function resolveFetchImplementation(fetchImpl) {
    if (fetchImpl) {
        return fetchImpl;
    }
    if (typeof globalThis.fetch === 'function') {
        return globalThis.fetch.bind(globalThis);
    }
    throw new Error('Agent SDK local runtime client requires a fetch implementation');
}
function normalizeHttpBaseUrl(httpBaseUrl) {
    return httpBaseUrl.replace(/\/+$/, '');
}
function buildEventWebSocketUrl(baseUrl) {
    const normalized = normalizeHttpBaseUrl(baseUrl);
    if (normalized.startsWith('https://')) {
        return `wss://${normalized.slice('https://'.length)}/events`;
    }
    if (normalized.startsWith('http://')) {
        return `ws://${normalized.slice('http://'.length)}/events`;
    }
    return `${normalized}/events`;
}
function buildErrorMessage(status, statusText, bodyText) {
    const trimmedBody = bodyText.trim();
    if (!trimmedBody) {
        return `Agent SDK request failed (${status} ${statusText})`;
    }
    return `Agent SDK request failed (${status} ${statusText}): ${trimmedBody}`;
}
function moduleTool(tool) {
    return {
        ...tool,
        execution_target: 'local_runtime',
        argument_resolution: tool.argument_resolution ?? 'passthrough',
    };
}
class AgentLocalRuntimeHttpClient {
    constructor(options) {
        this.eventSocket = null;
        this.eventListeners = new Set();
        this.baseUrl = normalizeHttpBaseUrl(options.baseUrl);
        this.token = options.token;
        this.fetchImpl = resolveFetchImplementation(options.fetchImpl);
        this.WebSocketImpl = options.WebSocketImpl;
    }
    async status() {
        return this.request('/status', { method: 'GET' });
    }
    async listTools() {
        return this.request('/tools', { method: 'GET' });
    }
    async registerModuleTool(tool, context) {
        return this.post('/tools/register-module', {
            name: tool.name,
            description: tool.description,
            module: tool.module,
            schema: tool.schema,
            workspace_path: tool.workspacePath ?? context.workspacePath,
        });
    }
    async registerPlugin(plugin) {
        return this.post('/plugins/register', plugin);
    }
    async registerMcp(mcp) {
        return this.post('/mcps/register', mcp);
    }
    async executeTool(payload) {
        return this.post('/execute-tool', {
            tool_name: payload.toolName,
            args: payload.args,
            request_id: payload.requestId,
            bundle_id: payload.bundleId,
            tool_call_id: payload.toolCallId,
            correlation_id: payload.correlationId,
            turn_ref: payload.turnRef,
            conversation_ref: payload.conversationRef,
        });
    }
    async rpc(payload) {
        const response = await this.post('/rpc', {
            jsonrpc: '2.0',
            id: payload.id ?? `sdk-${Date.now()}`,
            method: payload.method,
            params: payload.params ?? {},
        });
        if (response.error && typeof response.error === 'object' && !Array.isArray(response.error)) {
            const error = response.error;
            throw new Error(typeof error.message === 'string' && error.message.trim()
                ? error.message
                : JSON.stringify(error));
        }
        if (response.result && typeof response.result === 'object' && !Array.isArray(response.result)) {
            return response.result;
        }
        return response;
    }
    async shutdown() {
        this.closeEventSocket();
        await this.post('/shutdown', {});
    }
    subscribeEvents(listener) {
        this.eventListeners.add(listener);
        void this.ensureEventSocket();
        return () => {
            this.eventListeners.delete(listener);
            if (this.eventListeners.size === 0) {
                this.closeEventSocket();
            }
        };
    }
    async ensureEventSocket() {
        if (this.eventSocket || this.eventListeners.size === 0) {
            return;
        }
        const WebSocketImpl = await this.resolveWebSocketImpl();
        if (!WebSocketImpl || this.eventSocket || this.eventListeners.size === 0) {
            return;
        }
        const socket = new WebSocketImpl(buildEventWebSocketUrl(this.baseUrl), {
            headers: {
                [LOCAL_RUNTIME_TOKEN_HEADER]: this.token,
            },
        });
        this.eventSocket = socket;
        const onMessage = (raw) => {
            const event = this.parseEventPayload(raw);
            if (!event) {
                return;
            }
            for (const eventListener of this.eventListeners) {
                eventListener(event);
            }
        };
        const onClose = () => {
            if (this.eventSocket === socket) {
                this.eventSocket = null;
            }
        };
        socket.addEventListener?.('message', onMessage);
        socket.addEventListener?.('close', onClose);
        socket.on?.('message', onMessage);
        socket.on?.('close', onClose);
        socket.on?.('error', () => { });
    }
    closeEventSocket() {
        const socket = this.eventSocket;
        this.eventSocket = null;
        socket?.close?.();
    }
    async resolveWebSocketImpl() {
        if (this.WebSocketImpl) {
            return this.WebSocketImpl;
        }
        const globalWebSocket = globalThis.WebSocket;
        if (globalWebSocket) {
            return globalWebSocket;
        }
        try {
            const module = await importNodeModule('ws');
            return module.default ?? module;
        }
        catch {
            return null;
        }
    }
    parseEventPayload(raw) {
        try {
            const text = typeof raw === 'string'
                ? raw
                : typeof raw?.data === 'string'
                    ? String(raw.data)
                    : raw instanceof Uint8Array
                        ? new TextDecoder().decode(raw)
                        : String(raw ?? '');
            const payload = JSON.parse(text);
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return null;
            }
            const type = payload.type;
            if (typeof type !== 'string' || !type.trim()) {
                return null;
            }
            return payload;
        }
        catch {
            return null;
        }
    }
    async post(path, body) {
        return this.request(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    }
    async request(path, init) {
        const headers = new Headers(init.headers);
        headers.set(LOCAL_RUNTIME_TOKEN_HEADER, this.token);
        const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
            ...init,
            headers,
        });
        if (!response.ok) {
            throw new Error(buildErrorMessage(response.status, response.statusText, await response.text()));
        }
        return response.json();
    }
}
exports.AgentLocalRuntimeHttpClient = AgentLocalRuntimeHttpClient;
function attachProcessLineReader(stream, onLine) {
    if (!stream || typeof stream.on !== 'function' || typeof onLine !== 'function') {
        return;
    }
    let remainder = '';
    stream.on('data', (payload) => {
        const text = payload instanceof Uint8Array
            ? new TextDecoder().decode(payload)
            : String(payload ?? '');
        const lines = `${remainder}${text}`.split(/\r?\n/);
        remainder = lines.pop() ?? '';
        for (const line of lines) {
            if (line.trim()) {
                onLine(line);
            }
        }
    });
}
async function importNodeModule(specifier) {
    return Promise.resolve(`${specifier}`).then(s => __importStar(require(s)));
}
async function loadNodeLocalRuntimeModules() {
    const [fs, os, path, childProcess] = await Promise.all([
        importNodeModule('node:fs'),
        importNodeModule('node:os'),
        importNodeModule('node:path'),
        importNodeModule('node:child_process'),
    ]);
    return { fs, os, path, childProcess };
}
function isLoopbackHostname(hostname) {
    const host = String(hostname || '').toLowerCase();
    if (host === 'localhost' || host === '::1' || host === '[::1]' || host === '0:0:0:0:0:0:0:1') {
        return true;
    }
    const ipv4Match = host.match(/^(\d{1,3})(?:\.(\d{1,3})){3}$/);
    if (!ipv4Match) {
        return false;
    }
    const octets = host.split('.').map(part => Number(part));
    return octets.length === 4
        && octets.every(octet => Number.isInteger(octet) && octet >= 0 && octet <= 255)
        && octets[0] === 127;
}
function normalizeDaemonBaseUrl(value) {
    const rawBaseUrl = typeof value === 'string' ? value.trim() : '';
    if (!rawBaseUrl) {
        return null;
    }
    try {
        const parsed = new URL(rawBaseUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return null;
        }
        if (!isLoopbackHostname(parsed.hostname)) {
            return null;
        }
        if (parsed.username || parsed.password) {
            return null;
        }
        if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
            return null;
        }
        return parsed.origin;
    }
    catch {
        return null;
    }
}
function normalizeLaunchContext(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    const normalized = {};
    for (const [key, raw] of Object.entries(value)) {
        if (!key) {
            continue;
        }
        normalized[key] = typeof raw === 'string' ? raw.trim() : '';
    }
    return normalized;
}
function launchContextsEqual(left, right) {
    if (!left || !right) {
        return false;
    }
    return Object.entries(right).every(([key, value]) => (left[key] ?? '') === value);
}
function normalizeDiscovery(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return null;
    }
    const payload = raw;
    if (Object.prototype.hasOwnProperty.call(payload, 'baseUrl')) {
        return null;
    }
    const baseUrl = normalizeDaemonBaseUrl(payload.base_url);
    const token = typeof payload.token === 'string' ? payload.token.trim() : '';
    if (!baseUrl || !token) {
        return null;
    }
    return {
        baseUrl,
        token,
        launch: normalizeLaunchContext(payload.launch),
    };
}
function readDaemonDiscovery(fs, discoveryFile) {
    try {
        if (!fs.existsSync(discoveryFile)) {
            return null;
        }
        return normalizeDiscovery(JSON.parse(fs.readFileSync(discoveryFile, 'utf8')));
    }
    catch {
        return null;
    }
}
function deleteDaemonDiscovery(fs, discoveryFile) {
    try {
        fs.unlinkSync(discoveryFile);
    }
    catch {
        // Missing or locked discovery files are handled by the following spawn/probe loop.
    }
}
async function sleep(ms) {
    await new Promise(resolve => setTimeout(resolve, ms));
}
async function probeDaemon(discovery, fetchImpl, WebSocketImpl) {
    if (!discovery) {
        return null;
    }
    const client = new AgentLocalRuntimeHttpClient({
        ...discovery,
        fetchImpl,
        WebSocketImpl,
    });
    try {
        await client.status();
        return client;
    }
    catch {
        return null;
    }
}
async function waitForDaemonStop(discovery, fetchImpl, WebSocketImpl, timeoutMs = 2000, pollIntervalMs = 100) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const running = await probeDaemon(discovery, fetchImpl, WebSocketImpl);
        if (!running) {
            return;
        }
        await sleep(pollIntervalMs);
    }
    throw new Error('Timed out waiting for existing local runtime to stop');
}
async function shutdownDiscoveredDaemon(discovery, fetchImpl, WebSocketImpl, timeoutMs = 2000, pollIntervalMs = 100) {
    const existing = await probeDaemon(discovery, fetchImpl, WebSocketImpl);
    if (!existing) {
        return false;
    }
    await existing.shutdown();
    await waitForDaemonStop(discovery, fetchImpl, WebSocketImpl, timeoutMs, pollIntervalMs);
    return true;
}
function resolveDaemonScript(options, path) {
    const processLike = globalThis.process;
    const explicit = options.daemonScript
        ?? (0, RuntimeEnv_js_1.readRuntimeEnv)(processLike?.env, RuntimeEnv_js_1.AGENT_LOCAL_RUNTIME_DAEMON_SCRIPT_ENV_KEYS);
    if (explicit) {
        return path.resolve(explicit);
    }
    throw new Error(RuntimeEnv_js_1.AGENT_LOCAL_RUNTIME_DAEMON_SCRIPT_REQUIRED_MESSAGE);
}
function resolveProcessEnv() {
    const processLike = globalThis.process;
    return processLike?.env ?? {};
}
function buildSpawnEnv(options) {
    if (options.envMode === 'replace') {
        return { ...(options.env ?? {}) };
    }
    return {
        ...resolveProcessEnv(),
        ...(options.env ?? {}),
    };
}
function resolveDaemonLaunchCommand(options, path, discoveryFile) {
    if (typeof options.command === 'string' && options.command.trim()) {
        return {
            command: options.command,
            args: [
                ...(options.args ?? []),
                '--discovery-file',
                discoveryFile,
            ],
        };
    }
    const processEnv = resolveProcessEnv();
    const daemonScript = resolveDaemonScript(options, path);
    const pythonCommand = options.pythonCommand
        ?? (0, RuntimeEnv_js_1.readRuntimeEnv)(processEnv, RuntimeEnv_js_1.AGENT_LOCAL_RUNTIME_PYTHON_ENV_KEYS)
        ?? 'python3';
    return {
        command: pythonCommand,
        args: [
            ...(options.pythonArgs ?? []),
            daemonScript,
            '--discovery-file',
            discoveryFile,
        ],
    };
}
function createAgentLocalRuntimeProvider(options = {}) {
    let cachedRuntime;
    let pendingRuntimePromise = null;
    let ownedProcess = null;
    async function resolveRuntime() {
        if (cachedRuntime) {
            return cachedRuntime;
        }
        let modules;
        try {
            modules = await loadNodeLocalRuntimeModules();
        }
        catch (error) {
            throw new Error(`Agent SDK local tools require a Node local runtime provider: ${error instanceof Error ? error.message : String(error)}`);
        }
        const { fs, os, path, childProcess } = modules;
        const processEnv = resolveProcessEnv();
        const discoveryFile = path.resolve(options.discoveryFile
            ?? (0, RuntimeEnv_js_1.readRuntimeEnv)(processEnv, RuntimeEnv_js_1.AGENT_LOCAL_RUNTIME_DAEMON_DISCOVERY_FILE_ENV_KEYS)
            ?? path.join(os.tmpdir(), 'desktop-runtime', 'local-runtime-daemon.json'));
        const fetchImpl = options.fetchImpl;
        const expectedLaunchContext = normalizeLaunchContext(options.launchContext);
        const initialDiscovery = readDaemonDiscovery(fs, discoveryFile);
        if (expectedLaunchContext && initialDiscovery && !launchContextsEqual(initialDiscovery.launch ?? null, expectedLaunchContext)) {
            await shutdownDiscoveredDaemon(initialDiscovery, fetchImpl, options.WebSocketImpl, options.startTimeoutMs ?? 10000, options.pollIntervalMs ?? 100);
            deleteDaemonDiscovery(fs, discoveryFile);
        }
        const reusableDiscovery = expectedLaunchContext && initialDiscovery
            ? (launchContextsEqual(initialDiscovery.launch ?? null, expectedLaunchContext) ? initialDiscovery : null)
            : initialDiscovery;
        const existing = await probeDaemon(reusableDiscovery, fetchImpl, options.WebSocketImpl);
        if (existing) {
            if (options.reuseExisting === true) {
                cachedRuntime = existing;
                return cachedRuntime;
            }
            await existing.shutdown();
            await waitForDaemonStop(initialDiscovery, fetchImpl, options.WebSocketImpl, options.startTimeoutMs ?? 10000, options.pollIntervalMs ?? 100);
        }
        fs.mkdirSync(path.dirname(discoveryFile), { recursive: true });
        const launchCommand = resolveDaemonLaunchCommand(options, path, discoveryFile);
        const args = [...launchCommand.args];
        if (options.host) {
            args.push('--host', options.host);
        }
        if (typeof options.port === 'number') {
            args.push('--port', String(options.port));
        }
        const pipeStdout = typeof options.onStdoutLine === 'function';
        const pipeStderr = typeof options.onStderrLine === 'function';
        ownedProcess = childProcess.spawn(launchCommand.command, args, {
            cwd: options.cwd,
            env: buildSpawnEnv(options),
            stdio: (pipeStdout || pipeStderr)
                ? ['ignore', pipeStdout ? 'pipe' : 'ignore', pipeStderr ? 'pipe' : 'ignore']
                : 'ignore',
            detached: true,
        });
        try {
            options.onProcessSpawn?.({
                command: launchCommand.command,
                args,
                cwd: options.cwd,
            });
        }
        catch {
            // Logging callbacks must not break daemon startup.
        }
        attachProcessLineReader(ownedProcess.stdout, options.onStdoutLine);
        attachProcessLineReader(ownedProcess.stderr, options.onStderrLine);
        ownedProcess.unref?.();
        const deadline = Date.now() + (options.startTimeoutMs ?? 10000);
        const pollIntervalMs = options.pollIntervalMs ?? 100;
        while (Date.now() < deadline) {
            const discovered = readDaemonDiscovery(fs, discoveryFile);
            if (expectedLaunchContext && discovered && !launchContextsEqual(discovered.launch ?? null, expectedLaunchContext)) {
                deleteDaemonDiscovery(fs, discoveryFile);
                await sleep(pollIntervalMs);
                continue;
            }
            const started = await probeDaemon(discovered, fetchImpl, options.WebSocketImpl);
            if (started) {
                cachedRuntime = {
                    status: () => started.status(),
                    listTools: () => started.listTools(),
                    registerModuleTool: (tool, context) => started.registerModuleTool(tool, context),
                    registerPlugin: plugin => started.registerPlugin(plugin),
                    registerMcp: mcp => started.registerMcp(mcp),
                    executeTool: payload => started.executeTool(payload),
                    rpc: payload => started.rpc(payload),
                    subscribeEvents: listener => started.subscribeEvents(listener),
                    shutdown: async () => {
                        try {
                            await started.shutdown();
                        }
                        finally {
                            ownedProcess?.kill?.('SIGTERM');
                            ownedProcess = null;
                            cachedRuntime = undefined;
                        }
                    },
                };
                return cachedRuntime;
            }
            await sleep(pollIntervalMs);
        }
        ownedProcess?.kill?.('SIGTERM');
        ownedProcess = null;
        throw new Error(`Timed out waiting for local runtime discovery at ${discoveryFile}`);
    }
    return async () => {
        if (cachedRuntime) {
            return cachedRuntime;
        }
        if (pendingRuntimePromise) {
            return pendingRuntimePromise;
        }
        pendingRuntimePromise = resolveRuntime();
        try {
            return await pendingRuntimePromise;
        }
        finally {
            pendingRuntimePromise = null;
        }
    };
}
