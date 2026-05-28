import { InMemoryConversationStore } from '../stores/InMemoryConversationStore.js';
import type { BackendEvent } from '../events/backendEvents.js';
import type {
  ConversationMetadata,
  ConversationStore,
  JsonRecord,
  ListConversationOptions,
  SearchConversationOptions,
} from '../conversation/types.js';
import { searchConversationMetadata } from '../conversation/metadata.js';
import {
  createWindieAgentBackendTransport,
  type WindieAgentQueryInput,
  type WindieAgentSessionRuntime,
} from '../transport/WindieAgentSession.js';
import {
  WindieSdkClient,
  type SdkGenerateTitleRequest,
  type SdkGenerateTitleResponse,
  type SdkModelsResponse,
  type SdkPromptPreviewRequest,
  type SdkPromptPreviewResponse,
  type SdkQueryPlanRequest,
  type SdkQueryPlanResponse,
  type SdkSystemPromptResponse,
  type SdkToolSchemasResponse,
} from '../transport/HostedBackendHttpClient.js';
import {
  buildModelSettingsPatch,
  type WindieModelSelection,
} from '../settings/modelSelection.js';
import type { WindieLocalRuntimeClient } from './LocalSidecarRuntime.js';
import type {
  WindieLocalRuntimeEventListener,
} from './LocalSidecarRuntime.js';
import {
  SdkConversationRuntime,
  type SendInput,
} from './ConversationRuntime.js';
import type {
  WindieDesktopAgent,
  WindieDesktopAgentStartOptions,
} from './WindieDesktopAgent.js';
import { WindieChatSession } from './WindieChatSession.js';
import {
  toAgentStreamEvent,
  toolOutputStreamKeys,
  type WindieAgentStreamEvent,
} from './AgentStreamEvents.js';

export type WindieAgentQueryOptions = Partial<Omit<WindieAgentQueryInput, 'text' | 'conversationRef'>> & {
  conversationRef?: string;
  model?: WindieModelSelection;
};

export type WindieAgentOwner = {
  listAgents(): Array<{ id: string; agentDefinition: JsonRecord }>;
};

export type LoadConversationOptions = {
  conversationRef: string;
  revisionId?: string;
  store?: ConversationStore;
};

export type RawBackendEventListener = (event: BackendEvent) => void;

export type WindieMemoryType = 'episodic' | 'semantic';

export type WindieMemoryQuery = {
  userId?: string;
  query?: string;
  limit?: number;
  memoryType?: WindieMemoryType;
  excludeConversationId?: string;
  episodicLimit?: number;
  semanticLimit?: number;
  semanticMinScore?: number;
};

export type WindieStoreMemoryInput = {
  userId?: string;
  userQuery: string;
  assistantResponse: string;
  memoryType?: WindieMemoryType;
  sessionId?: string;
};

export class WindieAgent {
  private readonly defaultConversationStore = new InMemoryConversationStore();

  static async startDesktop(options: WindieDesktopAgentStartOptions): Promise<WindieDesktopAgent> {
    const { WindieDesktopAgent } = await import('./WindieDesktopAgent.js');
    return WindieDesktopAgent.start(options);
  }

  constructor(
    readonly id: string,
    readonly session: WindieAgentSessionRuntime,
    readonly agentDefinition: JsonRecord,
    private readonly sdkClient: WindieSdkClient,
    private readonly owner: WindieAgentOwner,
    private readonly localRuntime?: WindieLocalRuntimeClient,
  ) {}

  async ask(text: string, options: WindieAgentQueryOptions = {}): Promise<string> {
    if (options.model) {
      await this.setModel(options.model);
    }
    return this.session.query(this.buildQueryInput(text, options));
  }

  async query(payload: WindieAgentQueryInput): Promise<string> {
    return this.session.query(payload);
  }

  async run(input: string | WindieAgentQueryInput, options: WindieAgentQueryOptions = {}): Promise<string> {
    if (typeof input === 'string') {
      return this.ask(input, options);
    }
    if (options.model) {
      await this.setModel(options.model);
    }
    return this.query(input);
  }

  async *stream(
    input: string | WindieAgentQueryInput,
    options: WindieAgentQueryOptions = {},
  ): AsyncIterableIterator<WindieAgentStreamEvent> {
    const queryInput = typeof input === 'string' ? this.buildQueryInput(input, options) : input;
    const model = typeof input === 'string' ? options.model : undefined;
    const seenToolOutputs = new Set<string>();
    const conversation = this.conversation({
      conversationRef: queryInput.conversationRef,
      store: this.defaultConversationStore,
    });
    const payload: SendInput['payload'] = {
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
      const streamEvent = toAgentStreamEvent(runtimeEvent);
      if (streamEvent) {
        if (runtimeEvent.type === 'conversation_event') {
          const keys = toolOutputStreamKeys(runtimeEvent.event);
          if (keys.some(key => seenToolOutputs.has(key))) {
            continue;
          }
          keys.forEach(key => seenToolOutputs.add(key));
        }
        yield streamEvent;
      }
    }
  }

  async stop(conversationRef?: string | null): Promise<string> {
    return this.session.stopQuery(conversationRef);
  }

  async wakewordDetected(payload: JsonRecord = {}): Promise<string> {
    return this.session.wakewordDetected(payload);
  }

  async requestModelList(): Promise<string> {
    return this.session.listModels();
  }

  async rehydrateConversation(payload: JsonRecord): Promise<string> {
    return this.session.rehydrateConversation(payload);
  }

  async compactHistory(payload: JsonRecord): Promise<string> {
    return this.session.compactHistory(payload);
  }

  async ensureConnected(): Promise<void> {
    await this.session.waitForOpen();
  }

  isConnected(): boolean {
    return this.session.isOpen();
  }

  conversation(options: {
    conversationRef?: string;
    revisionId?: string;
    store?: ConversationStore;
    localRuntime?: WindieLocalRuntimeClient | null;
  } = {}): SdkConversationRuntime {
    const conversationRef = options.conversationRef ?? `conv-${this.id}`;
    const runtime = new SdkConversationRuntime({
      conversationRef,
      revisionId: options.revisionId,
      store: options.store ?? this.defaultConversationStore,
      transport: createWindieAgentBackendTransport(this.session, conversationRef, this.agentDefinition),
      localRuntime: options.localRuntime === undefined ? this.localRuntime : options.localRuntime,
    });
    runtime.attachTransport();
    return runtime;
  }

  chat(options: {
    conversationRef?: string;
    revisionId?: string;
    store?: ConversationStore;
    localRuntime?: WindieLocalRuntimeClient | null;
  } = {}): WindieChatSession {
    const runtime = this.conversation(options);
    return new WindieChatSession(options.conversationRef ?? `conv-${this.id}`, runtime);
  }

  sleep(): void {
    this.session.close(1000, 'sleep');
  }

  async updateSettings(config: JsonRecord): Promise<string> {
    return this.session.updateSettings(config);
  }

  async setModel(selection: WindieModelSelection): Promise<string> {
    return this.updateSettings(buildModelSettingsPatch(selection));
  }

  async listModels(): Promise<SdkModelsResponse> {
    return this.sdkClient.models();
  }

  async getSystemPrompt(): Promise<SdkSystemPromptResponse> {
    return this.sdkClient.systemPrompt();
  }

  async listToolSchemas(): Promise<SdkToolSchemasResponse> {
    return this.sdkClient.toolSchemas();
  }

  async previewPrompt(payload: SdkPromptPreviewRequest): Promise<SdkPromptPreviewResponse> {
    return this.sdkClient.promptPreview(payload);
  }

  async planQuery(payload: SdkQueryPlanRequest): Promise<SdkQueryPlanResponse> {
    return this.sdkClient.queryPlan(payload);
  }

  async updateSystemPrompt(content: string): Promise<string> {
    return this.updateSettings({
      system_prompt: {
        mode: 'replace',
        content,
      },
    });
  }

  async updateToolSchemas(toolSchemas: JsonRecord[]): Promise<string> {
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

  async generateConversationTitle(payload: SdkGenerateTitleRequest): Promise<SdkGenerateTitleResponse> {
    return this.sdkClient.generateConversationTitle(payload);
  }

  async updateConversationTitle(conversationRef: string, title: string, userId = 'local-sdk-user'): Promise<JsonRecord> {
    return this.callLocalRuntimeRpc('update_conversation_title', {
      user_id: userId,
      conversation_id: conversationRef,
      title,
    });
  }

  async searchMemory(query: string | WindieMemoryQuery): Promise<JsonRecord> {
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

  async listMemories(options: { userId?: string; type: WindieMemoryType; limit?: number }): Promise<JsonRecord> {
    return this.callLocalRuntimeRpc(
      options.type === 'semantic' ? 'list_semantic_memories' : 'list_episodic_memories',
      {
        user_id: options.userId,
        limit: options.limit,
      },
    );
  }

  async storeMemory(input: WindieStoreMemoryInput): Promise<JsonRecord> {
    return this.callLocalRuntimeRpc('store_memory', {
      user_id: input.userId,
      user_query: input.userQuery,
      assistant_response: input.assistantResponse,
      memory_type: input.memoryType,
      session_id: input.sessionId,
    });
  }

  async deleteMemory(options: { userId?: string; type: WindieMemoryType; memoryId: string }): Promise<JsonRecord> {
    return this.callLocalRuntimeRpc(
      options.type === 'semantic' ? 'delete_semantic_memory' : 'delete_episodic_memory',
      {
        user_id: options.userId,
        memory_id: options.memoryId,
      },
    );
  }

  async listTools(): Promise<{ version?: number; tools?: JsonRecord[] } | null> {
    return this.localRuntime?.listTools ? this.localRuntime.listTools() : null;
  }

  async status(): Promise<JsonRecord | null> {
    return this.localRuntime?.status ? this.localRuntime.status() : null;
  }

  async shutdownLocalRuntime(): Promise<void> {
    await this.localRuntime?.shutdown?.();
  }

  async uploadArtifact(file: Blob | File, filename?: string) {
    return this.sdkClient.artifacts.upload(file, filename);
  }

  artifactUrl(artifactId: string): string {
    return this.sdkClient.artifacts.url(artifactId);
  }

  async fetchArtifact(artifactId: string): Promise<Response> {
    return this.sdkClient.artifacts.fetch(artifactId);
  }

  subscribeRawBackendEvents(listener: RawBackendEventListener): () => void {
    return this.session.on('event', listener);
  }

  subscribeLocalRuntimeEvents(listener: WindieLocalRuntimeEventListener): () => void {
    return this.localRuntime?.subscribeEvents?.(listener) ?? (() => {});
  }

  async listConversations(options: ListConversationOptions & {
    store?: ConversationStore;
  } = {}): Promise<ConversationMetadata[]> {
    const { store, ...listOptions } = options;
    return (store ?? this.defaultConversationStore).listMetadata(listOptions);
  }

  async searchConversations(options: SearchConversationOptions & {
    store?: ConversationStore;
  }): Promise<ConversationMetadata[]> {
    const { store, ...searchOptions } = options;
    const conversationStore = store ?? this.defaultConversationStore;
    if (typeof conversationStore.searchMetadata === 'function') {
      return conversationStore.searchMetadata(searchOptions);
    }
    return searchConversationMetadata(await conversationStore.listMetadata(), searchOptions);
  }

  async deleteConversation(options: string | {
    conversationRef: string;
    store?: ConversationStore;
  }): Promise<void> {
    const deleteOptions = typeof options === 'string'
      ? { conversationRef: options }
      : options;
    const conversationStore = deleteOptions.store ?? this.defaultConversationStore;
    if (typeof conversationStore.deleteConversation !== 'function') {
      throw new Error('deleteConversation requires a deletable conversation store');
    }
    await conversationStore.deleteConversation(deleteOptions.conversationRef);
  }

  async loadConversation(
    options: string | LoadConversationOptions,
  ): Promise<ReturnType<SdkConversationRuntime['load']>> {
    const loadOptions = typeof options === 'string'
      ? { conversationRef: options }
      : options;
    return this.conversation(loadOptions).load();
  }

  listAgents(): Array<{ id: string; agentDefinition: JsonRecord }> {
    return this.owner.listAgents();
  }

  private async callLocalRuntimeRpc(method: string, params: JsonRecord): Promise<JsonRecord> {
    if (!this.localRuntime?.rpc) {
      throw new Error(`Local runtime RPC is required for ${method}`);
    }
    return this.localRuntime.rpc({ method, params });
  }

  private buildQueryInput(text: string, options: WindieAgentQueryOptions): WindieAgentQueryInput {
    const { model: _model, ...queryOptions } = options;
    return {
      ...queryOptions,
      text,
      conversationRef: queryOptions.conversationRef ?? `conv-${this.id}`,
    };
  }
}
