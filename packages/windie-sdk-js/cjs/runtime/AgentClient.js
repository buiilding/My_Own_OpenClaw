"use strict";
/**
 * Implements the hosted/local agent client integration for the TypeScript SDK runtime.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentClient = void 0;
const modelSelection_js_1 = require("../settings/modelSelection.js");
const InMemoryConversationStore_js_1 = require("../stores/InMemoryConversationStore.js");
const LocalRuntimeConversationStore_js_1 = require("../stores/LocalRuntimeConversationStore.js");
const builtins_js_1 = require("../tools/builtins.js");
const AgentSession_js_1 = require("../transport/AgentSession.js");
const ManagedAgentSession_js_1 = require("../transport/ManagedAgentSession.js");
const HostedBackendHttpClient_js_1 = require("../transport/HostedBackendHttpClient.js");
const Agent_js_1 = require("./Agent.js");
const CapabilityManifest_js_1 = require("./CapabilityManifest.js");
const LocalRuntime_js_1 = require("./LocalRuntime.js");
const RuntimeEnv_js_1 = require("./RuntimeEnv.js");
class AgentClient {
    constructor(options = {}) {
        this.activeAgents = new Map();
        this.defaultOptions = options;
    }
    async wakeUp(options = {}) {
        const runtimeFeatures = normalizeRuntimeFeatures(options, this.defaultOptions);
        const initialModelSettings = options.model
            ? (0, modelSelection_js_1.buildModelSettingsPatch)(options.model, 'agentClient.wakeUp')
            : null;
        const backendUrl = this.resolveBackendUrl(options.backendUrl);
        const operatingSystem = options.operatingSystem ?? this.defaultOptions.operatingSystem ?? detectOperatingSystem();
        const workspacePath = normalizeRuntimePath(options.workspacePath) ?? detectWorkspacePath();
        const wakeUpOptions = {
            ...options,
            operatingSystem,
            workspacePath,
        };
        const installAuth = await this.resolveInstallAuthState(backendUrl, operatingSystem, wakeUpOptions);
        const userId = installAuth?.userId
            ?? wakeUpOptions.userId
            ?? this.defaultOptions.defaultUserId
            ?? 'local-sdk-user';
        const localRuntime = await this.resolveLocalRuntimeForWakeUp(wakeUpOptions, runtimeFeatures);
        validateLocalRuntimeFeatures(localRuntime, runtimeFeatures);
        const sdkClient = this.createSdkClient(backendUrl, installAuth?.installToken);
        const conversationStore = createDefaultConversationStore({
            localRuntime,
            persistenceEnabled: runtimeFeatures.persistence,
            userId,
        });
        const localTools = await this.prepareLocalRuntime(wakeUpOptions, localRuntime);
        const agentDefinition = buildWakeUpAgentDefinition(wakeUpOptions, localTools);
        const localToolLifecycle = wakeUpOptions.localToolLifecycle ?? this.defaultOptions.localToolLifecycle;
        const session = this.createAgentSession({
            backendUrl,
            installToken: installAuth?.installToken,
            userId,
            operatingSystem,
            agentDefinition,
        });
        await session.waitForOpen();
        if (initialModelSettings) {
            await session.updateSettings(initialModelSettings);
        }
        const id = typeof agentDefinition.id === 'string' ? agentDefinition.id : (0, AgentSession_js_1.createMessageId)();
        const agent = new Agent_js_1.Agent(id, session, agentDefinition, sdkClient, this, localRuntime, userId, conversationStore, runtimeFeatures.memory, localToolLifecycle);
        this.activeAgents.set(id, agent);
        session.on('close', () => {
            this.activeAgents.delete(id);
        });
        return agent;
    }
    listAgents() {
        return Array.from(this.activeAgents.values()).map(agent => ({
            id: agent.id,
            agentDefinition: agent.agentDefinition,
        }));
    }
    async listModels(options = {}) {
        const { backendUrl, ...queryOptions } = options;
        return this.createSdkClient(this.resolveBackendUrl(backendUrl)).models(queryOptions);
    }
    async listTools() {
        const localRuntime = this.getKnownLocalRuntime();
        return localRuntime?.listTools ? localRuntime.listTools() : null;
    }
    async status() {
        const localRuntime = this.getKnownLocalRuntime();
        return localRuntime?.status ? localRuntime.status() : null;
    }
    getKnownLocalRuntime() {
        return this.resolveKnownLocalRuntime() ?? null;
    }
    async localRuntime(options = {}) {
        return this.ensureLocalRuntime({
            reason: options.reason ?? 'local-runtime',
            wakeUp: {},
            errorMessage: 'Agent SDK local runtime provider did not return a runtime.',
        });
    }
    async executeTool(call, options = {}) {
        const runtime = await this.localRuntime({
            ...options,
            reason: options.reason ?? 'execute-tool',
        });
        if (typeof runtime.executeTool !== 'function') {
            throw new Error('Agent SDK local runtime does not support tool execution.');
        }
        return runtime.executeTool({
            toolName: call.toolName,
            args: call.args,
        });
    }
    async rpc(payload, options = {}) {
        const runtime = await this.localRuntime({
            ...options,
            reason: options.reason ?? 'local-runtime-rpc',
        });
        if (typeof runtime.rpc !== 'function') {
            throw new Error('Agent SDK local runtime does not support RPC.');
        }
        return runtime.rpc(payload);
    }
    async listLocalTools(options = {}) {
        const runtime = await this.localRuntime({
            ...options,
            reason: options.reason ?? 'list-local-tools',
        });
        if (typeof runtime.listTools !== 'function') {
            throw new Error('Agent SDK local runtime does not support tool listing.');
        }
        return runtime.listTools();
    }
    async localStatus(options = {}) {
        const runtime = await this.localRuntime({
            ...options,
            reason: options.reason ?? 'local-status',
        });
        if (typeof runtime.status !== 'function') {
            throw new Error('Agent SDK local runtime does not support status.');
        }
        return runtime.status();
    }
    async shutdownLocalRuntime() {
        const localRuntime = this.getKnownLocalRuntime();
        await localRuntime?.shutdown?.();
        if (localRuntime && localRuntime === this.activeLocalRuntime) {
            this.activeLocalRuntime = undefined;
        }
    }
    resolveBackendUrl(backendUrl) {
        const resolvedBackendUrl = backendUrl
            ?? this.defaultOptions.backendUrl
            ?? this.defaultOptions.httpBaseUrl
            ?? (0, RuntimeEnv_js_1.readGlobalRuntimeEnv)(RuntimeEnv_js_1.AGENT_BACKEND_URL_ENV_KEYS);
        if (resolvedBackendUrl) {
            return resolvedBackendUrl;
        }
        throw new Error(RuntimeEnv_js_1.AGENT_BACKEND_URL_REQUIRED_MESSAGE);
    }
    createSdkClient(backendUrl, authToken) {
        return new HostedBackendHttpClient_js_1.AgentHostedBackendClient({
            httpBaseUrl: backendUrl,
            fetchImpl: this.defaultOptions.fetchImpl,
            authToken,
        });
    }
    createAgentSession({ backendUrl, installToken, userId, operatingSystem, agentDefinition, }) {
        const headers = installToken ? { Authorization: `Bearer ${installToken}` } : undefined;
        if (this.defaultOptions.backendSession === 'managed') {
            return (0, ManagedAgentSession_js_1.createManagedAgentSession)({
                backendUrl,
                wsUrl: this.defaultOptions.wsUrl,
                wsOrigin: this.defaultOptions.wsOrigin,
                endpoints: this.defaultOptions.backendEndpoints,
                WebSocketImpl: this.defaultOptions.WebSocketImpl,
                headers,
                userId,
                operatingSystem,
                agentDefinition,
                reconnectIntervalMs: this.defaultOptions.reconnectIntervalMs,
                connectTimeoutMs: this.defaultOptions.connectTimeoutMs,
                idleDisconnectTimeoutMs: this.defaultOptions.idleDisconnectTimeoutMs,
                shouldHoldOpen: this.defaultOptions.shouldHoldBackendConnectionOpen,
                beforeConnect: this.defaultOptions.beforeBackendConnect,
                onOpen: this.defaultOptions.onBackendOpen,
                onSocketChange: this.defaultOptions.onBackendSocketChange,
                onClose: this.defaultOptions.onBackendClose,
                onError: this.defaultOptions.onBackendError,
                onHandshakeError: this.defaultOptions.onBackendHandshakeError,
                onMessageError: this.defaultOptions.onBackendMessageError,
                onSend: this.defaultOptions.onBackendSend,
                onFallback: this.defaultOptions.onBackendFallback,
                log: this.defaultOptions.log,
            });
        }
        return (0, AgentSession_js_1.createAgentSession)({
            backendUrl,
            wsUrl: this.defaultOptions.wsUrl,
            WebSocketImpl: this.defaultOptions.WebSocketImpl,
            headers,
            userId,
            operatingSystem,
            agentDefinition,
        });
    }
    async resolveInstallAuthState(backendUrl, operatingSystem, options) {
        const configured = options.installAuth ?? this.defaultOptions.installAuth ?? {};
        const installToken = (options.installToken
            ?? configured.installToken
            ?? this.defaultOptions.installToken
            ?? (0, RuntimeEnv_js_1.readGlobalRuntimeEnv)(RuntimeEnv_js_1.AGENT_INSTALL_TOKEN_ENV_KEYS))?.trim();
        const configuredUserId = options.userId ?? configured.userId ?? this.defaultOptions.defaultUserId;
        if (installToken) {
            const identity = await this.resolveInstallTokenIdentity(backendUrl, installToken);
            return {
                installToken,
                installId: configured.installId ?? identity?.installId,
                userId: configuredUserId ?? identity?.userId ?? 'local-sdk-user',
            };
        }
        const shouldAutoRegister = configured.autoRegister === true;
        if (!shouldAutoRegister) {
            return null;
        }
        const fetchImpl = this.defaultOptions.fetchImpl ?? globalThis.fetch?.bind(globalThis);
        if (typeof fetchImpl !== 'function') {
            throw new Error('Agent SDK install auth auto-registration requires fetch');
        }
        const response = await fetchImpl(`${backendUrl.replace(/\/+$/, '')}/api/install/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ operating_system: operatingSystem }),
        });
        if (!response.ok) {
            throw new Error(`Install registration failed (${response.status} ${response.statusText}): ${await response.text()}`);
        }
        const payload = await response.json();
        const registeredUserId = typeof payload.user_id === 'string' ? payload.user_id.trim() : '';
        const registeredInstallId = typeof payload.install_id === 'string' ? payload.install_id.trim() : '';
        const registeredInstallToken = typeof payload.install_token === 'string' ? payload.install_token.trim() : '';
        if (!registeredUserId || !registeredInstallToken) {
            throw new Error('Install registration returned an invalid auth payload');
        }
        return {
            userId: configuredUserId ?? registeredUserId,
            installId: registeredInstallId || undefined,
            installToken: registeredInstallToken,
        };
    }
    async resolveInstallTokenIdentity(backendUrl, installToken) {
        try {
            const identity = await new HostedBackendHttpClient_js_1.AgentHostedBackendClient({
                httpBaseUrl: backendUrl,
                fetchImpl: this.defaultOptions.fetchImpl,
                authToken: installToken,
            }).installIdentity();
            const userId = typeof identity.user_id === 'string' ? identity.user_id.trim() : '';
            const installId = typeof identity.install_id === 'string' ? identity.install_id.trim() : '';
            if (!userId || !installId) {
                throw new Error('Install identity response is missing user_id or install_id');
            }
            return {
                userId,
                installId,
            };
        }
        catch (error) {
            if (this.defaultOptions.defaultUserId) {
                this.defaultOptions.log?.(`Install identity lookup failed; falling back to configured user id: ${error instanceof Error ? error.message : String(error)}`);
                return null;
            }
            throw error;
        }
    }
    resolveConfiguredLocalRuntime() {
        const explicitRuntime = this.defaultOptions.localRuntime;
        if (explicitRuntime) {
            return explicitRuntime;
        }
        const daemonOptions = this.defaultOptions.localRuntimeDaemon;
        if (daemonOptions) {
            return new LocalRuntime_js_1.AgentLocalRuntimeHttpClient({
                ...daemonOptions,
                fetchImpl: daemonOptions.fetchImpl ?? this.defaultOptions.fetchImpl,
            });
        }
        return undefined;
    }
    resolveKnownLocalRuntime() {
        if (this.activeLocalRuntime) {
            return this.activeLocalRuntime;
        }
        const configuredRuntime = this.resolveConfiguredLocalRuntime();
        if (configuredRuntime) {
            this.activeLocalRuntime = configuredRuntime;
            return configuredRuntime;
        }
        return undefined;
    }
    async ensureLocalRuntime({ wakeUp, reason, errorMessage, }) {
        const knownRuntime = this.resolveKnownLocalRuntime();
        if (knownRuntime) {
            return knownRuntime;
        }
        const context = {
            wakeUp,
            needsLocalRuntime: true,
        };
        if (this.defaultOptions.ensureLocalRuntime) {
            const runtime = await this.defaultOptions.ensureLocalRuntime(context);
            if (!runtime) {
                throw new Error(errorMessage);
            }
            this.activeLocalRuntime = runtime;
            return runtime;
        }
        if (this.defaultOptions.autoStartLocalRuntime === false) {
            throw new Error(`Agent SDK local runtime is required for ${reason}, but autoStartLocalRuntime is false.`);
        }
        if (!this.autoLocalRuntimeProvider) {
            this.autoLocalRuntimeProvider = (0, LocalRuntime_js_1.createAgentLocalRuntimeProvider)({
                fetchImpl: this.defaultOptions.fetchImpl,
                ...(this.defaultOptions.autoLocalRuntime ?? {}),
            });
        }
        const runtime = await this.autoLocalRuntimeProvider(context);
        if (!runtime) {
            throw new Error(errorMessage);
        }
        this.activeLocalRuntime = runtime;
        return runtime;
    }
    async resolveLocalRuntimeForWakeUp(options, runtimeFeatures) {
        const knownRuntime = this.resolveKnownLocalRuntime();
        if (knownRuntime) {
            return knownRuntime;
        }
        if (!this.needsLocalRuntime(options, runtimeFeatures)) {
            return undefined;
        }
        return this.ensureLocalRuntime({
            wakeUp: options,
            reason: 'memory, persistence, tools, plugins, MCPs, or builtins',
            errorMessage: 'Agent SDK local runtime provider did not return a runtime for required local features.',
        });
    }
    needsLocalRuntime(options, runtimeFeatures) {
        const builtins = normalizeBuiltins(options);
        return Boolean(runtimeFeatures.memory
            || runtimeFeatures.persistence
            || (options.tools ?? []).some(tool => Boolean(tool.module))
            || (options.plugins ?? []).length > 0
            || (options.mcps ?? []).length > 0
            || builtins.length > 0);
    }
    async prepareLocalRuntime(options, localRuntime) {
        if (!localRuntime) {
            return (options.tools ?? []).map(tool => buildManifestTool(tool));
        }
        await localRuntime.status?.();
        for (const tool of options.tools ?? []) {
            if (tool.module) {
                await localRuntime.registerModuleTool?.(tool, { workspacePath: options.workspacePath });
            }
        }
        for (const plugin of options.plugins ?? []) {
            await localRuntime.registerPlugin?.(plugin);
        }
        for (const mcp of options.mcps ?? []) {
            await localRuntime.registerMcp?.(mcp);
        }
        const manifest = await localRuntime.listTools?.();
        const registeredTools = Array.isArray(manifest?.tools) ? manifest.tools : [];
        const builtins = normalizeBuiltins(options);
        const hasRuntimeExtensions = (options.tools ?? []).some(tool => Boolean(tool.module))
            || (options.plugins ?? []).length > 0
            || (options.mcps ?? []).length > 0;
        const registeredRuntimeTools = hasRuntimeExtensions ? registeredTools : [];
        const selectedBuiltinTools = builtins.length > 0
            ? registeredTools.filter(tool => (typeof tool.name === 'string'
                && (0, builtins_js_1.shouldIncludeBuiltinTool)(tool.name, builtins)))
            : [];
        const explicitTools = (options.tools ?? [])
            .filter(tool => !tool.module)
            .map(tool => buildManifestTool(tool));
        return dedupeManifestTools([...registeredRuntimeTools, ...selectedBuiltinTools, ...explicitTools]);
    }
}
exports.AgentClient = AgentClient;
function featureEnabled(value, fallback) {
    if (typeof value === 'boolean') {
        return value;
    }
    if (value && typeof value === 'object' && typeof value.enabled === 'boolean') {
        return value.enabled;
    }
    return fallback;
}
function normalizeRuntimeFeatures(options, defaults) {
    return {
        memory: featureEnabled(options.memory ?? defaults.memory, true),
        persistence: featureEnabled(options.persistence ?? defaults.persistence, true),
    };
}
function createDefaultConversationStore({ localRuntime, persistenceEnabled, userId, }) {
    if (!persistenceEnabled) {
        return new InMemoryConversationStore_js_1.InMemoryConversationStore();
    }
    if (!localRuntime?.rpc) {
        throw new Error('Agent SDK persistence requires a local runtime with RPC support.');
    }
    return new LocalRuntimeConversationStore_js_1.LocalRuntimeConversationStore({
        userId,
        runtime: localRuntime,
    });
}
function validateLocalRuntimeFeatures(localRuntime, runtimeFeatures) {
    if (runtimeFeatures.memory && !localRuntime?.rpc) {
        throw new Error('Agent SDK memory requires a local runtime with RPC support.');
    }
    if (runtimeFeatures.persistence && !localRuntime?.rpc) {
        throw new Error('Agent SDK persistence requires a local runtime with RPC support.');
    }
}
function buildWakeUpAgentDefinition(options, tools) {
    const definition = {
        version: 1,
        id: options.agentId ?? `agent-${(0, AgentSession_js_1.createMessageId)()}`,
        name: options.name ?? 'Agent',
        system_prompt: options.systemPrompt
            ? { mode: 'replace', content: options.systemPrompt }
            : undefined,
        tools: {
            mode: 'client_only',
            client_manifest: {
                version: 1,
                tools,
            },
        },
        skills: options.skills ?? [],
        plugins: options.plugins ?? [],
        runtime: {
            workspace_path: options.workspacePath,
            operating_system: options.operatingSystem ?? detectOperatingSystem(),
        },
    };
    (0, CapabilityManifest_js_1.stampAgentDefinitionCapabilityMetadata)(definition);
    return definition;
}
function normalizeBuiltins(options) {
    const selected = options.builtins;
    if (selected === 'none') {
        return [];
    }
    if (selected === 'default') {
        return ['desktop'];
    }
    if (Array.isArray(selected)) {
        return dedupeBuiltinToolSets(selected);
    }
    return [];
}
function dedupeBuiltinToolSets(values) {
    const normalized = [];
    const seen = new Set();
    for (const value of values) {
        if (seen.has(value)) {
            continue;
        }
        seen.add(value);
        normalized.push(value);
    }
    return normalized;
}
function buildManifestTool(tool) {
    return {
        name: tool.name,
        description: tool.description,
        execution_target: tool.execution_target ?? 'local_runtime',
        argument_resolution: tool.argument_resolution ?? 'passthrough',
        schema: tool.schema,
    };
}
function dedupeManifestTools(tools) {
    const deduped = [];
    const seen = new Set();
    for (const tool of tools) {
        const name = typeof tool.name === 'string' ? tool.name.trim() : '';
        if (!name || seen.has(name)) {
            continue;
        }
        seen.add(name);
        deduped.push(tool);
    }
    return deduped;
}
function detectOperatingSystem() {
    const processPlatform = globalThis.process?.platform;
    if (processPlatform === 'darwin') {
        return 'macOS';
    }
    if (processPlatform === 'win32') {
        return 'Windows';
    }
    if (processPlatform === 'linux') {
        return 'Linux';
    }
    return 'unknown';
}
function normalizeRuntimePath(path) {
    return typeof path === 'string' && path.trim() ? path.trim() : undefined;
}
function detectWorkspacePath() {
    const processLike = globalThis.process;
    try {
        const cwd = typeof processLike?.cwd === 'function' ? processLike.cwd() : undefined;
        const normalizedCwd = normalizeRuntimePath(cwd);
        if (normalizedCwd) {
            return normalizedCwd;
        }
    }
    catch {
        // Fall through to the best home-directory signal exposed by the runtime.
    }
    const env = processLike?.env ?? {};
    const homeDrivePath = env.HOMEDRIVE && env.HOMEPATH
        ? `${env.HOMEDRIVE}${env.HOMEPATH}`
        : undefined;
    return [
        env.HOME,
        env.USERPROFILE,
        homeDrivePath,
    ].map(normalizeRuntimePath).find(Boolean);
}
