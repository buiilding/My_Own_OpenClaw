"use strict";
/**
 * Provides the reusable agent API module for the TypeScript SDK runtime.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Agent = void 0;
const events_js_1 = require("../conversation/events.js");
const InMemoryConversationStore_js_1 = require("../stores/InMemoryConversationStore.js");
const metadata_js_1 = require("../conversation/metadata.js");
const AgentSession_js_1 = require("../transport/AgentSession.js");
const modelSelection_js_1 = require("../settings/modelSelection.js");
const ConversationRuntime_js_1 = require("./ConversationRuntime.js");
const TraceRecorder_js_1 = require("./TraceRecorder.js");
const CapabilityManifest_js_1 = require("./CapabilityManifest.js");
const ContextEnrichmentPipeline_js_1 = require("./ContextEnrichmentPipeline.js");
const DefaultTurnResourceResolvers_js_1 = require("./DefaultTurnResourceResolvers.js");
const AgentChatSession_js_1 = require("./AgentChatSession.js");
const AgentStreamEvents_js_1 = require("./AgentStreamEvents.js");
const LOCAL_RUNTIME_LIFECYCLE_TRACE_PATH = 'local_runtime.lifecycle';
const agentStreamEventRuntime = (0, AgentStreamEvents_js_1.createAgentStreamEventRuntime)();
function logMemoryRetrievalDiagnostic(diagnostic) {
    const details = [
        `stage=${diagnostic.stage}`,
        `conversationRef=${diagnostic.conversationRef}`,
        `queryLength=${diagnostic.queryLength}`,
        typeof diagnostic.episodicCount === 'number' ? `episodic=${diagnostic.episodicCount}` : null,
        typeof diagnostic.semanticCount === 'number' ? `semantic=${diagnostic.semanticCount}` : null,
        diagnostic.error ? `error=${diagnostic.error}` : null,
    ].filter(Boolean).join(' ');
    console.warn(`[Agent SDK] memory retrieval diagnostic: ${details}`);
}
function normalizeJsonRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : null;
}
async function emitAppDiagnostic(options, event) {
    try {
        await options.diagnostics?.emit?.(event);
    }
    catch {
        // App diagnostics must never make SDK conversation reads fail.
    }
}
function unwrapLocalRuntimeRpcData(response, fallbackMessage) {
    const record = normalizeJsonRecord(response);
    if (!record) {
        throw new Error(fallbackMessage);
    }
    if (record.success === false) {
        const message = typeof record.error === 'string' && record.error.trim()
            ? record.error.trim()
            : fallbackMessage;
        throw new Error(message);
    }
    if (record.success === true || Object.prototype.hasOwnProperty.call(record, 'data')) {
        return normalizeJsonRecord(record.data) ?? {};
    }
    return record;
}
class Agent {
    constructor(id, session, agentDefinition, sdkClient, owner, localRuntime, userId = 'local-sdk-user', defaultConversationStore = new InMemoryConversationStore_js_1.InMemoryConversationStore(), memoryEnabled = true, localToolLifecycle) {
        this.id = id;
        this.session = session;
        this.agentDefinition = agentDefinition;
        this.sdkClient = sdkClient;
        this.owner = owner;
        this.localRuntime = localRuntime;
        this.userId = userId;
        this.defaultConversationStore = defaultConversationStore;
        this.memoryEnabled = memoryEnabled;
        this.localToolLifecycle = localToolLifecycle;
    }
    getDefaultConversationStore() {
        return this.defaultConversationStore;
    }
    getKnownLocalRuntime() {
        return this.localRuntime ?? this.owner.getKnownLocalRuntime?.() ?? undefined;
    }
    async ensureLocalRuntime(reason) {
        const knownRuntime = this.getKnownLocalRuntime();
        if (knownRuntime) {
            return knownRuntime;
        }
        if (typeof this.owner.localRuntime !== 'function') {
            throw new Error(`Local runtime is required for ${reason}`);
        }
        return this.owner.localRuntime({ reason });
    }
    async ask(text, options = {}) {
        if (options.model) {
            await this.setModel(options.model);
        }
        return this.query(this.buildQueryInput(text, options));
    }
    async query(payload) {
        const enriched = await this.enrichAgentQueryInput(payload);
        return this.session.query(enriched);
    }
    async run(input, options = {}) {
        if (typeof input === 'string') {
            return this.ask(input, options);
        }
        if (options.model) {
            await this.setModel(options.model);
        }
        return this.query(input);
    }
    async *stream(input, options = {}) {
        const queryInput = typeof input === 'string' ? this.buildQueryInput(input, options) : input;
        const model = typeof input === 'string' ? options.model : undefined;
        const seenToolOutputs = new Set();
        const conversation = this.conversation({
            conversationRef: queryInput.conversationRef,
            store: this.defaultConversationStore,
        });
        const payload = {
            ...(queryInput.backendPayload ?? {}),
            content: queryInput.content ?? undefined,
            screenshot_ref: queryInput.screenshotRef ?? undefined,
            screenshot_refs: queryInput.screenshotRefs ?? undefined,
            attachment_context: queryInput.attachmentContext ?? undefined,
            attachment_filenames: queryInput.attachmentFilenames ?? undefined,
            system_state_internal: queryInput.systemStateInternal ?? undefined,
            workspace_path: queryInput.workspacePath ?? undefined,
        };
        if (queryInput.agentDefinition) {
            payload.agent_definition = queryInput.agentDefinition;
        }
        for await (const runtimeEvent of conversation.stream({
            text: queryInput.text,
            turnRef: queryInput.turnRef ?? undefined,
            payload,
            model,
        })) {
            const streamEvents = agentStreamEventRuntime.toStreamEvents(runtimeEvent);
            if (streamEvents.length > 0) {
                if (runtimeEvent.type === 'conversation_event') {
                    const keys = agentStreamEventRuntime.toolOutputStreamKeys(runtimeEvent.event);
                    if (keys.some(key => seenToolOutputs.has(key))) {
                        continue;
                    }
                    keys.forEach(key => seenToolOutputs.add(key));
                }
                for (const streamEvent of streamEvents) {
                    yield streamEvent;
                }
            }
        }
    }
    async stop(input) {
        if (input && typeof input === 'object') {
            if ('conversation_ref' in input || 'turn_ref' in input) {
                throw new Error('agent.stop accepts conversationRef and turnRef; snake_case stop fields are not supported.');
            }
            return this.session.stopQuery({
                conversationRef: input.conversationRef ?? null,
                turnRef: input.turnRef ?? null,
            });
        }
        return this.session.stopQuery({ conversationRef: typeof input === 'string' ? input : null });
    }
    async wakewordDetected(payload = {}) {
        return this.session.wakewordDetected(payload);
    }
    async requestModelList() {
        return this.session.listModels();
    }
    async rehydrateConversation(payload) {
        return this.session.rehydrateConversation(payload);
    }
    async compactHistory(payload) {
        return this.session.compactHistory(payload);
    }
    async ensureConnected() {
        await this.session.waitForOpen();
    }
    isConnected() {
        return this.session.isOpen();
    }
    noteBackendTraffic(reason = 'traffic') {
        this.session.noteTraffic?.(reason);
    }
    syncBackendIdleTimer(reason = 'idle-sync') {
        this.session.syncIdleTimer?.(reason);
    }
    conversation(options = {}) {
        const conversationRef = options.conversationRef ?? `conv-${this.id}`;
        const resolvedLocalRuntime = options.localRuntime === undefined
            ? this.getKnownLocalRuntime()
            : options.localRuntime;
        const resolvedLocalToolLifecycle = options.localToolLifecycle === undefined
            ? this.localToolLifecycle
            : options.localToolLifecycle;
        const defaultResourceResolvers = (0, DefaultTurnResourceResolvers_js_1.createDefaultTurnResourceResolvers)({
            localRuntime: resolvedLocalRuntime,
            localToolLifecycle: resolvedLocalToolLifecycle,
            sdkClient: this.sdkClient,
        });
        const runtime = new ConversationRuntime_js_1.SdkConversationRuntime({
            conversationRef,
            revisionId: options.revisionId,
            store: options.store ?? this.defaultConversationStore,
            transport: (0, AgentSession_js_1.createAgentRuntimeTransport)(this.session, conversationRef, this.agentDefinition),
            localRuntime: resolvedLocalRuntime,
            sdkClient: this.sdkClient,
            userId: this.userId,
            memoryEnabled: this.memoryEnabled,
            agentDefinition: this.agentDefinition,
            localToolLifecycle: resolvedLocalToolLifecycle,
            resourceResolvers: {
                ...defaultResourceResolvers,
                ...(options.resourceResolvers ?? {}),
            },
            enrichQuery: async (input) => {
                const enriched = await (0, ContextEnrichmentPipeline_js_1.enrichQueryPayload)({
                    text: input.text,
                    conversationRef: input.conversationRef,
                    userId: this.userId,
                    payload: input.payload ?? {},
                    sdkClient: this.sdkClient,
                    localRuntime: resolvedLocalRuntime,
                    memoryEnabled: this.memoryEnabled,
                    emitDiagnostic: async (diagnostic) => {
                        logMemoryRetrievalDiagnostic(diagnostic);
                        await input.emitDiagnostic?.(diagnostic);
                    },
                    traceContext: input.traceContext,
                    emitTrace: input.emitTrace,
                });
                return enriched.payload;
            },
        });
        runtime.attachTransport();
        return runtime;
    }
    chat(options = {}) {
        const runtime = this.conversation(options);
        return new AgentChatSession_js_1.AgentChatSession(options.conversationRef ?? `conv-${this.id}`, runtime);
    }
    sleep() {
        this.session.close(1000, 'sleep');
    }
    async shutdown() {
        this.sleep();
        await this.shutdownLocalRuntime();
    }
    async updateSettings(config) {
        return this.session.updateSettings(config);
    }
    async setModel(selection) {
        return this.updateSettings((0, modelSelection_js_1.buildModelSettingsPatch)(selection));
    }
    async listModels() {
        return this.sdkClient.models();
    }
    async getSystemPrompt() {
        return this.sdkClient.systemPrompt();
    }
    async listToolSchemas(options = {}) {
        const startedAtMs = Date.now();
        await this.recordAgentTrace({
            path: 'tool.schema.policy',
            stage: 'sdk_list',
            status: 'started',
            data: {
                source: 'sdk_http',
            },
        }, options);
        try {
            const response = await this.sdkClient.toolSchemas();
            const toolSchemas = Array.isArray(response.canonical_tool_schemas)
                ? response.canonical_tool_schemas
                : Array.isArray(response.tool_schemas)
                    ? response.tool_schemas
                    : [];
            await this.recordAgentTrace({
                path: 'tool.schema.policy',
                stage: 'sdk_list',
                status: 'succeeded',
                durationMs: Date.now() - startedAtMs,
                data: {
                    source: 'sdk_http',
                    toolSchemaCount: toolSchemas.length,
                    hasToolSchemas: toolSchemas.length > 0,
                },
            }, options);
            return response;
        }
        catch (error) {
            await this.recordAgentTrace({
                path: 'tool.schema.policy',
                stage: 'sdk_list',
                status: 'failed',
                durationMs: Date.now() - startedAtMs,
                error,
                data: {
                    source: 'sdk_http',
                },
            }, options);
            throw error;
        }
    }
    async previewPrompt(payload) {
        return this.sdkClient.promptPreview(payload);
    }
    async planQuery(payload) {
        return this.sdkClient.queryPlan(payload);
    }
    async updateSystemPrompt(content) {
        return this.updateSettings({
            system_prompt: {
                mode: 'replace',
                content,
            },
        });
    }
    async updateToolSchemas(toolSchemas) {
        const summary = (0, CapabilityManifest_js_1.setAgentDefinitionToolManifest)(this.agentDefinition, toolSchemas);
        await this.recordAgentTrace({
            path: 'capability_manifest.rebuild',
            stage: 'sdk_apply',
            status: 'succeeded',
            runtime: 'sdk',
            data: {
                revision: summary.revision,
                toolCount: summary.toolCount,
                promptLayerCount: summary.promptLayerCount,
                skillCount: summary.skillCount,
                pluginCount: summary.pluginCount,
            },
        });
        const messageId = await this.updateSettings({
            agent_definition: this.agentDefinition,
            tools: {
                mode: 'replace_client_manifest',
                client_manifest: {
                    version: 1,
                    tools: toolSchemas,
                },
            },
        });
        await this.recordAgentTrace({
            path: 'capability_manifest.send',
            stage: 'update_settings',
            status: 'succeeded',
            runtime: 'sdk',
            data: {
                revision: summary.revision,
                toolCount: summary.toolCount,
                promptLayerCount: summary.promptLayerCount,
            },
        });
        return messageId;
    }
    async registerMcps(mcps, options = {}) {
        const localRuntime = await this.ensureLocalRuntime('MCP registration');
        if (typeof localRuntime.registerMcp !== 'function') {
            throw new Error('Local runtime does not support MCP registration.');
        }
        const servers = Array.isArray(mcps) ? mcps : [];
        const registration = await localRuntime.registerMcp({
            servers,
            replace: options.replace !== false,
        });
        const manifest = await localRuntime.listTools?.();
        const toolSchemas = Array.isArray(manifest?.tools) ? manifest.tools : [];
        await this.updateToolSchemas(toolSchemas);
        return {
            registration: registration && typeof registration === 'object' && !Array.isArray(registration)
                ? registration
                : {},
            toolSchemas,
        };
    }
    async generateConversationTitle(payload) {
        return this.sdkClient.generateConversationTitle(payload);
    }
    async updateConversationTitle(conversationRef, title, userId = 'local-sdk-user') {
        return this.callLocalRuntimeRpc('update_conversation_title', {
            user_id: userId,
            conversation_id: conversationRef,
            title,
        });
    }
    async searchMemory(query) {
        const payload = typeof query === 'string' ? { query } : query;
        const text = payload.query ?? '';
        const embedding = await this.sdkClient.embeddings.create({ text });
        return this.callLocalRuntimeRpcData('search_memory_by_embedding', {
            embedding: embedding.embedding,
            embedding_space_version: embedding.embedding_space_version,
            user_id: payload.userId ?? this.userId,
            limit: payload.limit,
            memory_type: payload.memoryType,
            exclude_conversation_id: payload.excludeConversationId,
            episodic_limit: payload.episodicLimit,
            semantic_limit: payload.semanticLimit,
            semantic_min_score: payload.semanticMinScore,
        });
    }
    async listMemories(options) {
        const data = await this.callLocalRuntimeRpcData(options.type === 'semantic' ? 'list_semantic_memories' : 'list_episodic_memories', {
            user_id: options.userId ?? this.userId,
            limit: options.limit,
        });
        const memories = Array.isArray(data.memories) ? data.memories : [];
        const count = typeof data.count === 'number' && Number.isFinite(data.count)
            ? data.count
            : memories.length;
        return {
            ...data,
            memories,
            count,
        };
    }
    async storeMemory(input) {
        const content = (0, ContextEnrichmentPipeline_js_1.formatCompletedTurnMemory)({
            userQuery: input.userQuery,
            assistantResponse: input.assistantResponse,
        });
        const embedding = await this.sdkClient.embeddings.create({ text: content });
        return this.callLocalRuntimeRpcData('store_memory_by_embedding', {
            user_id: input.userId ?? this.userId,
            content,
            embedding: embedding.embedding,
            embedding_space_version: embedding.embedding_space_version,
            memory_type: input.memoryType,
            conversation_id: input.sessionId,
        });
    }
    async deleteMemory(options) {
        return this.callLocalRuntimeRpcData(options.type === 'semantic' ? 'delete_semantic_memory' : 'delete_episodic_memory', {
            user_id: options.userId ?? this.userId,
            memory_id: options.memoryId,
        });
    }
    async clearMemories(options = {}) {
        return await this.callLocalRuntimeRpcData('clear_local_memory', {
            user_id: options.userId ?? this.userId,
        });
    }
    async listTools(options = {}) {
        const startedAtMs = Date.now();
        const localRuntime = this.getKnownLocalRuntime();
        if (!localRuntime?.listTools) {
            await this.recordAgentTrace({
                path: LOCAL_RUNTIME_LIFECYCLE_TRACE_PATH,
                stage: 'list_tools',
                status: 'skipped',
                runtime: 'local-runtime',
                data: {
                    reason: 'local_runtime_unavailable',
                },
            }, options);
            return null;
        }
        await this.recordAgentTrace({
            path: LOCAL_RUNTIME_LIFECYCLE_TRACE_PATH,
            stage: 'list_tools',
            status: 'started',
            runtime: 'local-runtime',
        }, options);
        try {
            const response = await localRuntime.listTools();
            await this.recordAgentTrace({
                path: LOCAL_RUNTIME_LIFECYCLE_TRACE_PATH,
                stage: 'list_tools',
                status: 'succeeded',
                runtime: 'local-runtime',
                durationMs: Date.now() - startedAtMs,
                data: {
                    toolCount: Array.isArray(response?.tools) ? response.tools.length : 0,
                    hasVersion: typeof response?.version === 'number',
                },
            }, options);
            return response;
        }
        catch (error) {
            await this.recordAgentTrace({
                path: LOCAL_RUNTIME_LIFECYCLE_TRACE_PATH,
                stage: 'list_tools',
                status: 'failed',
                runtime: 'local-runtime',
                durationMs: Date.now() - startedAtMs,
                error,
            }, options);
            throw error;
        }
    }
    async status(options = {}) {
        const startedAtMs = Date.now();
        const localRuntime = this.getKnownLocalRuntime();
        if (!localRuntime?.status) {
            await this.recordAgentTrace({
                path: LOCAL_RUNTIME_LIFECYCLE_TRACE_PATH,
                stage: 'status',
                status: 'skipped',
                runtime: 'local-runtime',
                data: {
                    reason: 'local_runtime_unavailable',
                },
            }, options);
            return null;
        }
        await this.recordAgentTrace({
            path: LOCAL_RUNTIME_LIFECYCLE_TRACE_PATH,
            stage: 'status',
            status: 'started',
            runtime: 'local-runtime',
        }, options);
        try {
            const response = await localRuntime.status();
            await this.recordAgentTrace({
                path: LOCAL_RUNTIME_LIFECYCLE_TRACE_PATH,
                stage: 'status',
                status: 'succeeded',
                runtime: 'local-runtime',
                durationMs: Date.now() - startedAtMs,
                data: {
                    responseKeyCount: response ? Object.keys(response).length : 0,
                    ready: typeof response?.ready === 'boolean' ? response.ready : null,
                    running: typeof response?.running === 'boolean' ? response.running : null,
                },
            }, options);
            return response;
        }
        catch (error) {
            await this.recordAgentTrace({
                path: LOCAL_RUNTIME_LIFECYCLE_TRACE_PATH,
                stage: 'status',
                status: 'failed',
                runtime: 'local-runtime',
                durationMs: Date.now() - startedAtMs,
                error,
            }, options);
            throw error;
        }
    }
    async shutdownLocalRuntime(options = {}) {
        const startedAtMs = Date.now();
        const localRuntime = this.getKnownLocalRuntime();
        const ownerShutdown = typeof this.owner.shutdownLocalRuntime === 'function';
        const localShutdown = typeof localRuntime?.shutdown === 'function';
        if (!ownerShutdown && !localShutdown) {
            await this.recordAgentTrace({
                path: LOCAL_RUNTIME_LIFECYCLE_TRACE_PATH,
                stage: 'shutdown',
                status: 'skipped',
                runtime: 'local-runtime',
                data: {
                    reason: 'shutdown_unavailable',
                },
            }, options);
            return;
        }
        await this.recordAgentTrace({
            path: LOCAL_RUNTIME_LIFECYCLE_TRACE_PATH,
            stage: 'shutdown',
            status: 'started',
            runtime: 'local-runtime',
            data: {
                ownerShutdown,
                localShutdown,
            },
        }, options);
        try {
            if (ownerShutdown) {
                await this.owner.shutdownLocalRuntime?.();
            }
            else {
                await localRuntime?.shutdown?.();
            }
            await this.recordAgentTrace({
                path: LOCAL_RUNTIME_LIFECYCLE_TRACE_PATH,
                stage: 'shutdown',
                status: 'succeeded',
                runtime: 'local-runtime',
                durationMs: Date.now() - startedAtMs,
                data: {
                    ownerShutdown,
                    localShutdown,
                },
            }, options);
        }
        catch (error) {
            await this.recordAgentTrace({
                path: LOCAL_RUNTIME_LIFECYCLE_TRACE_PATH,
                stage: 'shutdown',
                status: 'failed',
                runtime: 'local-runtime',
                durationMs: Date.now() - startedAtMs,
                error,
                data: {
                    ownerShutdown,
                    localShutdown,
                },
            }, options);
            throw error;
        }
    }
    async uploadArtifact(file, filename) {
        return this.sdkClient.artifacts.upload(file, filename);
    }
    artifactUrl(artifactId) {
        return this.sdkClient.artifacts.url(artifactId);
    }
    async fetchArtifact(artifactId, options = {}) {
        const startedAtMs = Date.now();
        await this.recordAgentTrace({
            path: 'artifact.fetch',
            stage: 'http_get',
            status: 'started',
            data: {
                hasArtifactId: Boolean(artifactId.trim()),
            },
        }, options);
        try {
            const response = await this.sdkClient.artifacts.fetch(artifactId);
            await this.recordAgentTrace({
                path: 'artifact.fetch',
                stage: 'http_get',
                status: 'succeeded',
                durationMs: Date.now() - startedAtMs,
                data: {
                    hasArtifactId: Boolean(artifactId.trim()),
                    statusCode: response.status,
                    ok: response.ok,
                    contentType: response.headers.get('content-type') ?? null,
                    contentLength: response.headers.get('content-length') ?? null,
                },
            }, options);
            return response;
        }
        catch (error) {
            await this.recordAgentTrace({
                path: 'artifact.fetch',
                stage: 'http_get',
                status: 'failed',
                durationMs: Date.now() - startedAtMs,
                error,
                data: {
                    hasArtifactId: Boolean(artifactId.trim()),
                },
            }, options);
            throw error;
        }
    }
    async installIdentity(options = {}) {
        const startedAtMs = Date.now();
        await this.recordAgentTrace({
            path: 'install.auth',
            stage: 'identity',
            status: 'started',
            data: {
                source: 'sdk_http',
            },
        }, options);
        try {
            const response = await this.sdkClient.installIdentity();
            await this.recordAgentTrace({
                path: 'install.auth',
                stage: 'identity',
                status: 'succeeded',
                durationMs: Date.now() - startedAtMs,
                data: {
                    source: 'sdk_http',
                    hasInstallId: typeof response.install_id === 'string'
                        || typeof response.installId === 'string',
                    responseKeyCount: Object.keys(response).length,
                },
            }, options);
            return response;
        }
        catch (error) {
            await this.recordAgentTrace({
                path: 'install.auth',
                stage: 'identity',
                status: 'failed',
                durationMs: Date.now() - startedAtMs,
                error,
                data: {
                    source: 'sdk_http',
                },
            }, options);
            throw error;
        }
    }
    subscribeRawBackendEvents(listener) {
        return this.session.on('event', listener);
    }
    subscribeLocalRuntimeEvents(listener) {
        return this.getKnownLocalRuntime()?.subscribeEvents?.(listener) ?? (() => { });
    }
    async listConversations(options = {}) {
        const { store, ...listOptions } = options;
        const startedAt = Date.now();
        await emitAppDiagnostic(listOptions, {
            stage: 'sdk_list',
            status: 'started',
            runtime: 'sdk',
            data: {
                limit: listOptions.limit,
            },
        });
        try {
            const metadata = await (store ?? this.defaultConversationStore).listMetadata(listOptions);
            await emitAppDiagnostic(listOptions, {
                stage: 'sdk_list',
                status: 'succeeded',
                runtime: 'sdk',
                durationMs: Date.now() - startedAt,
                data: {
                    limit: listOptions.limit,
                    resultCount: metadata.length,
                },
            });
            return metadata;
        }
        catch (error) {
            await emitAppDiagnostic(listOptions, {
                stage: 'sdk_list',
                status: 'failed',
                runtime: 'sdk',
                durationMs: Date.now() - startedAt,
                data: {
                    limit: listOptions.limit,
                },
                error,
            });
            throw error;
        }
    }
    async searchConversations(options) {
        const { store, ...searchOptions } = options;
        const conversationStore = store ?? this.defaultConversationStore;
        if (typeof conversationStore.searchMetadata === 'function') {
            return conversationStore.searchMetadata(searchOptions);
        }
        return (0, metadata_js_1.searchConversationMetadata)(await conversationStore.listMetadata(), searchOptions);
    }
    async deleteConversation(options) {
        const deleteOptions = typeof options === 'string'
            ? { conversationRef: options }
            : options;
        const conversationStore = deleteOptions.store ?? this.defaultConversationStore;
        if (typeof conversationStore.deleteConversation !== 'function') {
            throw new Error('deleteConversation requires a deletable conversation store');
        }
        await conversationStore.deleteConversation(deleteOptions.conversationRef);
    }
    async clearConversations(options = {}) {
        const conversationStore = options.store ?? this.defaultConversationStore;
        if (typeof conversationStore.clearConversations !== 'function') {
            throw new Error('clearConversations requires a clearable conversation store');
        }
        await conversationStore.clearConversations();
    }
    async loadConversation(options) {
        const loadOptions = typeof options === 'string'
            ? { conversationRef: options }
            : options;
        return this.conversation(loadOptions).load();
    }
    async getConversationRevision(options) {
        const revisionOptions = typeof options === 'string'
            ? { conversationRef: options }
            : options;
        const conversationStore = revisionOptions.store ?? this.defaultConversationStore;
        return conversationStore.getRevision(revisionOptions.conversationRef);
    }
    async listConversationRevisions(options) {
        const conversationStore = options.store ?? this.defaultConversationStore;
        if (conversationStore.listRevisions) {
            return conversationStore.listRevisions({
                conversationRef: options.conversationRef,
                limit: options.limit,
            });
        }
        return [
            await conversationStore.getRevision(options.conversationRef),
        ];
    }
    async appendConversationEvent(options) {
        const appendOptions = 'event' in options ? options : { event: options };
        const conversationStore = appendOptions.store ?? this.defaultConversationStore;
        await conversationStore.appendEvent(appendOptions.event);
    }
    async replaceCompactedReplay(options) {
        const replaceOptions = 'snapshot' in options ? options : { snapshot: options };
        const conversationStore = replaceOptions.store ?? this.defaultConversationStore;
        await conversationStore.replaceCompactedReplay(replaceOptions.snapshot);
    }
    async loadDisplayTimeline(options) {
        const { conversationRef, revisionId, store } = options;
        return this.conversation({
            conversationRef,
            revisionId: revisionId ?? undefined,
            store: store ?? this.defaultConversationStore,
        }).loadDisplayTimeline({
            revisionId: revisionId ?? null,
        });
    }
    async loadModelHistory(options) {
        const { conversationRef, revisionId, store } = options;
        return this.conversation({
            conversationRef,
            revisionId: revisionId ?? undefined,
            store: store ?? this.defaultConversationStore,
        }).loadModelHistory({
            revisionId: revisionId ?? null,
        });
    }
    async checkoutRevision(options) {
        const { conversationRef, revisionId, store } = options;
        return this.conversation({
            conversationRef,
            revisionId,
            store: store ?? this.defaultConversationStore,
        }).checkoutRevision({ revisionId });
    }
    async replaceRows(options) {
        const { conversationRef, revisionId, store, ...input } = options;
        return this.conversation({
            conversationRef,
            revisionId,
            store: store ?? this.defaultConversationStore,
        }).replaceRows(input);
    }
    async editAndResend(options) {
        const { conversationRef, revisionId, store, ...input } = options;
        return this.conversation({
            conversationRef,
            revisionId,
            store: store ?? this.defaultConversationStore,
        }).editAndResend(input);
    }
    async retryTurn(options) {
        const { conversationRef, revisionId, store, ...input } = options;
        return this.conversation({
            conversationRef,
            revisionId,
            store: store ?? this.defaultConversationStore,
        }).retryTurn(input);
    }
    async forkConversation(options) {
        const { conversationRef, revisionId, store, ...input } = options;
        const conversationStore = store ?? this.defaultConversationStore;
        const result = await this.conversation({
            conversationRef,
            revisionId,
            store: conversationStore,
        }).fork(input);
        const view = await this.conversation({
            conversationRef: result.conversationRef,
            revisionId: result.revisionId,
            store: conversationStore,
        }).getView();
        return {
            ...result,
            view,
        };
    }
    listAgents() {
        return this.owner.listAgents();
    }
    async recordAgentTrace(input, options = {}) {
        const conversationRef = options.conversationRef ?? `conv-${this.id}`;
        const turnRef = options.turnRef ?? null;
        const store = options.store ?? this.defaultConversationStore;
        const revisionId = (0, events_js_1.createRuntimeId)('rev');
        const recorder = new TraceRecorder_js_1.TraceRecorder({
            conversationRef,
            turnRef,
            userId: this.userId,
            emit: async (payload) => {
                await store.appendEvent((0, events_js_1.createConversationEvent)({
                    eventId: `${turnRef ?? conversationRef}-sdk-evt-${(0, events_js_1.createRuntimeId)('trace_event')}`,
                    type: 'trace_event',
                    conversationRef,
                    revisionId,
                    turnRef,
                    source: 'sdk',
                    payload,
                }));
            },
        });
        return recorder.record(input);
    }
    async callLocalRuntimeRpc(method, params) {
        const localRuntime = await this.ensureLocalRuntime(`local-runtime-rpc:${method}`);
        if (!localRuntime.rpc) {
            throw new Error(`Local runtime RPC is required for ${method}`);
        }
        return localRuntime.rpc({ method, params });
    }
    async callLocalRuntimeRpcData(method, params) {
        const result = await this.callLocalRuntimeRpc(method, params);
        return unwrapLocalRuntimeRpcData(result, `Local runtime RPC failed for ${method}`);
    }
    buildQueryInput(text, options) {
        const { model: _model, ...queryOptions } = options;
        return {
            ...queryOptions,
            text,
            conversationRef: queryOptions.conversationRef ?? `conv-${this.id}`,
        };
    }
    async enrichAgentQueryInput(input) {
        const enriched = await (0, ContextEnrichmentPipeline_js_1.enrichQueryPayload)({
            text: input.text,
            conversationRef: input.conversationRef,
            userId: this.userId,
            payload: {
                ...(input.backendPayload ?? {}),
                content: input.content ?? undefined,
                attachment_context: input.attachmentContext ?? undefined,
                attachment_filenames: input.attachmentFilenames ?? undefined,
            },
            sdkClient: this.sdkClient,
            localRuntime: this.getKnownLocalRuntime(),
            memoryEnabled: this.memoryEnabled,
            emitDiagnostic: logMemoryRetrievalDiagnostic,
        });
        return {
            ...input,
            agentDefinition: input.agentDefinition ?? this.agentDefinition,
            backendPayload: enriched.payload,
            content: typeof enriched.payload.content === 'string' ? enriched.payload.content : input.content,
            attachmentContext: null,
            attachmentFilenames: null,
        };
    }
}
exports.Agent = Agent;
