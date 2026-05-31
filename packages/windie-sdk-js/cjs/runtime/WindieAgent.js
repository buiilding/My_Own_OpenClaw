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
const WindieChatSession_js_1 = require("./WindieChatSession.js");
const AgentStreamEvents_js_1 = require("./AgentStreamEvents.js");
class WindieAgent {
    static async startDesktop(options) {
        const { WindieDesktopAgent } = await Promise.resolve().then(() => __importStar(require('./WindieDesktopAgent.js')));
        return WindieDesktopAgent.start(options);
    }
    constructor(id, session, agentDefinition, sdkClient, owner, localRuntime) {
        this.id = id;
        this.session = session;
        this.agentDefinition = agentDefinition;
        this.sdkClient = sdkClient;
        this.owner = owner;
        this.localRuntime = localRuntime;
        this.defaultConversationStore = new InMemoryConversationStore_js_1.InMemoryConversationStore();
    }
    async ask(text, options = {}) {
        if (options.model) {
            await this.setModel(options.model);
        }
        return this.session.query(this.buildQueryInput(text, options));
    }
    async query(payload) {
        return this.session.query(payload);
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
        return this.callLocalRuntimeRpc('search_memory', {
            query: payload.query ?? '',
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
        return this.callLocalRuntimeRpc('store_memory', {
            user_id: input.userId,
            user_query: input.userQuery,
            assistant_response: input.assistantResponse,
            memory_type: input.memoryType,
            session_id: input.sessionId,
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
}
exports.WindieAgent = WindieAgent;
