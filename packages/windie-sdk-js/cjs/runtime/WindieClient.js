"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WindieClient = void 0;
const modelSelection_js_1 = require("../settings/modelSelection.js");
const builtins_js_1 = require("../tools/builtins.js");
const WindieAgentSession_js_1 = require("../transport/WindieAgentSession.js");
const ManagedWindieAgentSession_js_1 = require("../transport/ManagedWindieAgentSession.js");
const HostedBackendHttpClient_js_1 = require("../transport/HostedBackendHttpClient.js");
const WindieAgent_js_1 = require("./WindieAgent.js");
const LocalSidecarRuntime_js_1 = require("./LocalSidecarRuntime.js");
class WindieClient {
    constructor(options = {}) {
        this.activeAgents = new Map();
        this.defaultOptions = options;
    }
    async wakeUp(options) {
        const initialModelSettings = options.model
            ? (0, modelSelection_js_1.buildModelSettingsPatch)(options.model, 'WindieClient.wakeUp')
            : null;
        const backendUrl = this.resolveBackendUrl(options.backendUrl);
        const operatingSystem = options.operatingSystem ?? this.defaultOptions.operatingSystem ?? detectOperatingSystem();
        const installAuth = await this.resolveInstallAuthState(backendUrl, operatingSystem, options);
        const userId = installAuth?.userId
            ?? options.userId
            ?? this.defaultOptions.defaultUserId
            ?? 'local-sdk-user';
        const localRuntime = await this.resolveLocalRuntimeForWakeUp(options);
        const sdkClient = this.createSdkClient(backendUrl, installAuth?.installToken);
        const localTools = await this.prepareLocalRuntime(options, localRuntime);
        const agentDefinition = buildWakeUpAgentDefinition(options, localTools);
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
        const id = typeof agentDefinition.id === 'string' ? agentDefinition.id : (0, WindieAgentSession_js_1.createMessageId)();
        const agent = new WindieAgent_js_1.WindieAgent(id, session, agentDefinition, sdkClient, this, localRuntime);
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
        const localRuntime = this.resolveKnownLocalRuntime();
        return localRuntime?.listTools ? localRuntime.listTools() : null;
    }
    async status() {
        const localRuntime = this.resolveKnownLocalRuntime();
        return localRuntime?.status ? localRuntime.status() : null;
    }
    async shutdownLocalRuntime() {
        const localRuntime = this.resolveKnownLocalRuntime();
        await localRuntime?.shutdown?.();
        if (localRuntime && localRuntime === this.activeLocalRuntime) {
            this.activeLocalRuntime = undefined;
        }
    }
    resolveBackendUrl(backendUrl) {
        return backendUrl ?? this.defaultOptions.backendUrl ?? this.defaultOptions.httpBaseUrl ?? 'https://api.windieos.com';
    }
    createSdkClient(backendUrl, authToken) {
        return new HostedBackendHttpClient_js_1.WindieSdkClient({
            httpBaseUrl: backendUrl,
            fetchImpl: this.defaultOptions.fetchImpl,
            authToken,
        });
    }
    createAgentSession({ backendUrl, installToken, userId, operatingSystem, agentDefinition, }) {
        const headers = installToken ? { Authorization: `Bearer ${installToken}` } : undefined;
        if (this.defaultOptions.backendSession === 'managed') {
            return (0, ManagedWindieAgentSession_js_1.createManagedWindieAgentSession)({
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
        return (0, WindieAgentSession_js_1.createWindieAgentSession)({
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
            ?? this.defaultOptions.installToken)?.trim();
        const configuredUserId = options.userId ?? configured.userId ?? this.defaultOptions.defaultUserId;
        if (installToken) {
            return {
                installToken,
                installId: configured.installId,
                userId: configuredUserId ?? 'local-sdk-user',
            };
        }
        if (configured.autoRegister !== true) {
            return null;
        }
        const fetchImpl = this.defaultOptions.fetchImpl ?? globalThis.fetch?.bind(globalThis);
        if (typeof fetchImpl !== 'function') {
            throw new Error('WindieClient install auth auto-registration requires fetch');
        }
        const response = await fetchImpl(`${backendUrl.replace(/\/+$/, '')}/api/install/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ operating_system: operatingSystem }),
        });
        if (!response.ok) {
            throw new Error(`Windie install registration failed (${response.status} ${response.statusText}): ${await response.text()}`);
        }
        const payload = await response.json();
        const registeredUserId = typeof payload.user_id === 'string' ? payload.user_id.trim() : '';
        const registeredInstallId = typeof payload.install_id === 'string' ? payload.install_id.trim() : '';
        const registeredInstallToken = typeof payload.install_token === 'string' ? payload.install_token.trim() : '';
        if (!registeredUserId || !registeredInstallToken) {
            throw new Error('Windie install registration returned an invalid auth payload');
        }
        return {
            userId: registeredUserId,
            installId: registeredInstallId || undefined,
            installToken: registeredInstallToken,
        };
    }
    resolveConfiguredLocalRuntime() {
        const explicitRuntime = this.defaultOptions.sidecar ?? this.defaultOptions.localRuntime;
        if (explicitRuntime) {
            return explicitRuntime;
        }
        if (this.defaultOptions.sidecarDaemon) {
            return new LocalSidecarRuntime_js_1.SidecarDaemonHttpClient({
                ...this.defaultOptions.sidecarDaemon,
                fetchImpl: this.defaultOptions.sidecarDaemon.fetchImpl ?? this.defaultOptions.fetchImpl,
            });
        }
        return undefined;
    }
    resolveKnownLocalRuntime() {
        return this.activeLocalRuntime ?? this.resolveConfiguredLocalRuntime();
    }
    async resolveLocalRuntimeForWakeUp(options) {
        const configuredRuntime = this.resolveConfiguredLocalRuntime();
        if (configuredRuntime) {
            this.activeLocalRuntime = configuredRuntime;
            return configuredRuntime;
        }
        if (!this.needsLocalRuntime(options)) {
            return undefined;
        }
        const context = {
            wakeUp: options,
            needsLocalRuntime: true,
        };
        if (this.defaultOptions.ensureLocalRuntime) {
            const runtime = await this.defaultOptions.ensureLocalRuntime(context);
            this.activeLocalRuntime = runtime;
            return runtime;
        }
        if (this.defaultOptions.autoStartLocalRuntime === false) {
            return undefined;
        }
        if (!this.autoLocalRuntimeProvider) {
            this.autoLocalRuntimeProvider = (0, LocalSidecarRuntime_js_1.createWindieLocalRuntimeProvider)({
                fetchImpl: this.defaultOptions.fetchImpl,
                ...(this.defaultOptions.autoSidecar ?? {}),
            });
        }
        const runtime = await this.autoLocalRuntimeProvider(context);
        this.activeLocalRuntime = runtime;
        return runtime;
    }
    needsLocalRuntime(options) {
        const builtins = normalizeBuiltins(options);
        return Boolean((options.tools ?? []).some(tool => Boolean(tool.module))
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
        const builtinTools = builtins.length > 0
            ? registeredTools.filter(tool => (typeof tool.name === 'string'
                && (0, builtins_js_1.shouldIncludeBuiltinTool)(tool.name, builtins)))
            : [];
        const explicitTools = (options.tools ?? [])
            .filter(tool => !tool.module)
            .map(tool => buildManifestTool(tool));
        return dedupeManifestTools([...registeredRuntimeTools, ...builtinTools, ...explicitTools]);
    }
}
exports.WindieClient = WindieClient;
function buildWakeUpAgentDefinition(options, tools) {
    return {
        version: 1,
        id: options.agentId ?? `windie-agent-${(0, WindieAgentSession_js_1.createMessageId)()}`,
        name: options.name ?? 'Windie Agent',
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
    return dedupeBuiltinToolSets(options.builtinTools ?? []);
}
function dedupeBuiltinToolSets(values) {
    const normalized = [];
    const seen = new Set();
    for (const value of values) {
        const canonical = canonicalBuiltinToolSet(value);
        if (seen.has(canonical)) {
            continue;
        }
        seen.add(canonical);
        normalized.push(canonical);
    }
    return normalized;
}
function canonicalBuiltinToolSet(value) {
    if (value === 'computer-use') {
        return 'computer';
    }
    if (value === 'browser-use') {
        return 'browser';
    }
    return value;
}
function buildManifestTool(tool) {
    return {
        name: tool.name,
        description: tool.description,
        execution_target: tool.execution_target ?? 'sidecar',
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
