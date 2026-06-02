"use strict";
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
exports.WindieAgent = void 0;
const InMemoryConversationStore_js_1 = require("../stores/InMemoryConversationStore.js");
const metadata_js_1 = require("../conversation/metadata.js");
const WindieAgentSession_js_1 = require("../transport/WindieAgentSession.js");
const modelSelection_js_1 = require("../settings/modelSelection.js");
const ConversationRuntime_js_1 = require("./ConversationRuntime.js");
const ContextEnrichmentPipeline_js_1 = require("./ContextEnrichmentPipeline.js");
const WindieChatSession_js_1 = require("./WindieChatSession.js");
const AgentStreamEvents_js_1 = require("./AgentStreamEvents.js");
function logMemoryRetrievalDiagnostic(diagnostic) {
    const details = [
        `stage=${diagnostic.stage}`,
        `conversationRef=${diagnostic.conversationRef}`,
        `queryLength=${diagnostic.queryLength}`,
        typeof diagnostic.episodicCount === 'number' ? `episodic=${diagnostic.episodicCount}` : null,
        typeof diagnostic.semanticCount === 'number' ? `semantic=${diagnostic.semanticCount}` : null,
        diagnostic.error ? `error=${diagnostic.error}` : null,
    ].filter(Boolean).join(' ');
    console.warn(`[Windie SDK] memory retrieval diagnostic: ${details}`);
}
function logMemoryPersistenceDiagnostic(diagnostic) {
    const details = [
        `stage=${diagnostic.stage}`,
        `conversationRef=${diagnostic.conversationRef}`,
        `userQueryLength=${diagnostic.userQueryLength}`,
        `assistantResponseLength=${diagnostic.assistantResponseLength}`,
        typeof diagnostic.contentLength === 'number' ? `contentLength=${diagnostic.contentLength}` : null,
        diagnostic.memoryId ? `memoryId=${diagnostic.memoryId}` : null,
        diagnostic.error ? `error=${diagnostic.error}` : null,
    ].filter(Boolean).join(' ');
    console.warn(`[Windie SDK] memory persistence diagnostic: ${details}`);
}
class WindieAgent {
    static async startDesktop(options) {
        const { WindieDesktopAgent } = await Promise.resolve().then(() => __importStar(require('./WindieDesktopAgent.js')));
        return WindieDesktopAgent.start(options);
    }
    constructor(id, session, agentDefinition, sdkClient, owner, localRuntime, userId = 'local-sdk-user', defaultConversationStore = new InMemoryConversationStore_js_1.InMemoryConversationStore(), memoryEnabled = true) {
        this.id = id;
        this.session = session;
        this.agentDefinition = agentDefinition;
        this.sdkClient = sdkClient;
        this.owner = owner;
        this.localRuntime = localRuntime;
        this.userId = userId;
        this.defaultConversationStore = defaultConversationStore;
        this.memoryEnabled = memoryEnabled;
        this.pendingDirectQueries = new Map();
        this.session.on('streaming-complete', event => {
            void this.maybeStoreDirectTurnMemory(event);
        });
    }
    getDefaultConversationStore() {
        return this.defaultConversationStore;
    }
    async ask(text, options = {}) {
        if (options.model) {
            await this.setModel(options.model);
        }
        return this.query(this.buildQueryInput(text, options));
    }
    async query(payload) {
        const enriched = await this.enrichAgentQueryInput(payload);
        const messageId = await this.session.query(enriched);
        this.pendingDirectQueries.set(messageId, {
            conversationRef: enriched.conversationRef,
            userQuery: enriched.text,
        });
        return messageId;
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
            content: queryInput.content ?? undefined,
            screenshot: queryInput.screenshot ?? undefined,
            screenshot_ref: queryInput.screenshotRef ?? undefined,
            screenshot_refs: queryInput.screenshotRefs ?? undefined,
            attachment_context: queryInput.attachmentContext ?? undefined,
            attachment_filenames: queryInput.attachmentFilenames ?? undefined,
            system_state_internal: queryInput.systemStateInternal ?? undefined,
            workspace_path: queryInput.workspacePath ?? undefined,
        };
        for await (const runtimeEvent of conversation.stream({
            text: queryInput.text,
            turnRef: queryInput.turnRef ?? undefined,
            payload,
            model,
        })) {
            const streamEvents = (0, AgentStreamEvents_js_1.toAgentStreamEvents)(runtimeEvent);
            if (streamEvents.length > 0) {
                if (runtimeEvent.type === 'conversation_event') {
                    const keys = (0, AgentStreamEvents_js_1.toolOutputStreamKeys)(runtimeEvent.event);
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
    async stop(conversationRef) {
        return this.session.stopQuery(conversationRef);
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
        const runtime = new ConversationRuntime_js_1.SdkConversationRuntime({
            conversationRef,
            revisionId: options.revisionId,
            store: options.store ?? this.defaultConversationStore,
            transport: (0, WindieAgentSession_js_1.createWindieAgentBackendTransport)(this.session, conversationRef, this.agentDefinition),
            localRuntime: options.localRuntime === undefined ? this.localRuntime : options.localRuntime,
            sdkClient: this.sdkClient,
            userId: this.userId,
            memoryEnabled: this.memoryEnabled,
            enrichQuery: async (input) => {
                const enriched = await (0, ContextEnrichmentPipeline_js_1.enrichQueryPayload)({
                    text: input.text,
                    conversationRef: input.conversationRef,
                    userId: this.userId,
                    payload: input.payload ?? {},
                    sdkClient: this.sdkClient,
                    localRuntime: options.localRuntime === undefined ? this.localRuntime : options.localRuntime,
                    memoryEnabled: this.memoryEnabled,
                    emitDiagnostic: async (diagnostic) => {
                        logMemoryRetrievalDiagnostic(diagnostic);
                        await input.emitDiagnostic?.(diagnostic);
                    },
                });
                return enriched.payload;
            },
        });
        runtime.attachTransport();
        return runtime;
    }
    chat(options = {}) {
        const runtime = this.conversation(options);
        return new WindieChatSession_js_1.WindieChatSession(options.conversationRef ?? `conv-${this.id}`, runtime);
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
    async listToolSchemas() {
        return this.sdkClient.toolSchemas();
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
        return this.updateSettings({
            tools: {
                mode: 'replace_client_manifest',
                client_manifest: {
                    version: 1,
                    tools: toolSchemas,
                },
            },
        });
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
        return this.callLocalRuntimeRpc('search_memory_by_embedding', {
            embedding: embedding.embedding,
            embedding_space_version: embedding.embedding_space_version,
            user_id: payload.userId,
            limit: payload.limit,
            memory_type: payload.memoryType,
            exclude_conversation_id: payload.excludeConversationId,
            episodic_limit: payload.episodicLimit,
            semantic_limit: payload.semanticLimit,
            semantic_min_score: payload.semanticMinScore,
        });
    }
    async listMemories(options) {
        return this.callLocalRuntimeRpc(options.type === 'semantic' ? 'list_semantic_memories' : 'list_episodic_memories', {
            user_id: options.userId,
            limit: options.limit,
        });
    }
    async storeMemory(input) {
        const content = (0, ContextEnrichmentPipeline_js_1.formatCompletedTurnMemory)({
            userQuery: input.userQuery,
            assistantResponse: input.assistantResponse,
        });
        const embedding = await this.sdkClient.embeddings.create({ text: content });
        return this.callLocalRuntimeRpc('store_memory_by_embedding', {
            user_id: input.userId,
            content,
            embedding: embedding.embedding,
            embedding_space_version: embedding.embedding_space_version,
            memory_type: input.memoryType,
            conversation_id: input.sessionId,
        });
    }
    async deleteMemory(options) {
        return this.callLocalRuntimeRpc(options.type === 'semantic' ? 'delete_semantic_memory' : 'delete_episodic_memory', {
            user_id: options.userId,
            memory_id: options.memoryId,
        });
    }
    async listTools() {
        return this.localRuntime?.listTools ? this.localRuntime.listTools() : null;
    }
    async status() {
        return this.localRuntime?.status ? this.localRuntime.status() : null;
    }
    async shutdownLocalRuntime() {
        if (this.owner.shutdownLocalRuntime) {
            await this.owner.shutdownLocalRuntime();
            return;
        }
        await this.localRuntime?.shutdown?.();
    }
    async uploadArtifact(file, filename) {
        return this.sdkClient.artifacts.upload(file, filename);
    }
    artifactUrl(artifactId) {
        return this.sdkClient.artifacts.url(artifactId);
    }
    async fetchArtifact(artifactId) {
        return this.sdkClient.artifacts.fetch(artifactId);
    }
    subscribeRawBackendEvents(listener) {
        return this.session.on('event', listener);
    }
    subscribeLocalRuntimeEvents(listener) {
        return this.localRuntime?.subscribeEvents?.(listener) ?? (() => { });
    }
    async listConversations(options = {}) {
        const { store, ...listOptions } = options;
        return (store ?? this.defaultConversationStore).listMetadata(listOptions);
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
    async loadConversation(options) {
        const loadOptions = typeof options === 'string'
            ? { conversationRef: options }
            : options;
        return this.conversation(loadOptions).load();
    }
    listAgents() {
        return this.owner.listAgents();
    }
    async callLocalRuntimeRpc(method, params) {
        if (!this.localRuntime?.rpc) {
            throw new Error(`Local runtime RPC is required for ${method}`);
        }
        return this.localRuntime.rpc({ method, params });
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
                ...(input.rawPayload ?? {}),
                content: input.content ?? undefined,
                attachment_context: input.attachmentContext ?? undefined,
                attachment_filenames: input.attachmentFilenames ?? undefined,
            },
            sdkClient: this.sdkClient,
            localRuntime: this.localRuntime,
            memoryEnabled: this.memoryEnabled,
            emitDiagnostic: logMemoryRetrievalDiagnostic,
        });
        return {
            ...input,
            rawPayload: enriched.payload,
            content: typeof enriched.payload.content === 'string' ? enriched.payload.content : input.content,
            attachmentContext: null,
            attachmentFilenames: null,
        };
    }
    async maybeStoreDirectTurnMemory(event) {
        const turnRef = typeof event.turn_ref === 'string' ? event.turn_ref : null;
        const assistantResponse = typeof event.payload.final_response === 'string'
            ? event.payload.final_response
            : '';
        if (!turnRef || !assistantResponse.trim()) {
            return;
        }
        const pending = this.pendingDirectQueries.get(turnRef);
        if (!pending) {
            return;
        }
        this.pendingDirectQueries.delete(turnRef);
        try {
            await (0, ContextEnrichmentPipeline_js_1.storeCompletedTurnMemory)({
                localRuntime: this.localRuntime,
                sdkClient: this.sdkClient,
                userId: this.userId,
                conversationRef: pending.conversationRef,
                userQuery: pending.userQuery,
                assistantResponse,
                memoryEnabled: this.memoryEnabled,
                emitDiagnostic: logMemoryPersistenceDiagnostic,
            });
        }
        catch (error) {
            console.warn('[Windie SDK] Memory persistence failed:', error instanceof Error ? error.message : String(error));
        }
    }
}
exports.WindieAgent = WindieAgent;
