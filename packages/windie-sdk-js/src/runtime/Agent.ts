/**
 * Provides the reusable agent API module for the TypeScript SDK runtime.
 */

import { createConversationEvent, createRuntimeId } from '../conversation/events.js';
import { InMemoryConversationStore } from '../stores/InMemoryConversationStore.js';
import type { BackendEvent } from '../events/backendEvents.js';
import type {
  CompactedReplaySnapshot,
  AppDiagnosticEventDraft,
  ConversationEvent,
  DisplayTimelineCheckpoint,
  ConversationMetadata,
  ConversationRevision,
  ConversationStore,
  JsonRecord,
  ListConversationOptions,
  LocalToolExecutionLifecycle,
  ModelHistoryCheckpoint,
  SearchConversationOptions,
  TurnResourceResolverRegistry,
  TraceEventPayload,
} from '../conversation/types.js';
import { searchConversationMetadata } from '../conversation/metadata.js';
import {
  createAgentRuntimeTransport,
  type AgentQueryInput,
  type AgentSessionRuntime,
} from '../transport/AgentSession.js';
import {
  AgentHostedBackendClient,
  type AgentInstallIdentityResponse,
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
  type AgentModelSelection,
} from '../settings/modelSelection.js';
import type {
  AgentLocalRuntimeClient,
  AgentLocalRuntimeEventListener,
  AgentMcpDefinition,
} from './LocalRuntime.js';
import {
  SdkConversationRuntime,
  type CheckoutRevisionResult,
  type EditAndResendInput,
  type ForkConversationInput,
  type ForkConversationResult,
  type ReplaceRowsInput,
  type RetryTurnInput,
  type SendInput,
  type TurnResult,
} from './ConversationRuntime.js';
import { TraceRecorder, type TraceEventInput } from './TraceRecorder.js';
import {
  setAgentDefinitionToolManifest,
} from './CapabilityManifest.js';
import {
  enrichQueryPayload,
  formatCompletedTurnMemory,
  type MemoryRetrievalDiagnostic,
} from './ContextEnrichmentPipeline.js';
import { createDefaultTurnResourceResolvers } from './DefaultTurnResourceResolvers.js';
import { AgentChatSession } from './AgentChatSession.js';
import {
  createAgentStreamEventRuntime,
  type AgentStreamEvent,
} from './AgentStreamEvents.js';

const LOCAL_RUNTIME_LIFECYCLE_TRACE_PATH = 'local_runtime.lifecycle';
const agentStreamEventRuntime = createAgentStreamEventRuntime();

export type AgentQueryOptions = Partial<Omit<AgentQueryInput, 'text' | 'conversationRef'>> & {
  conversationRef?: string;
  model?: AgentModelSelection;
};

export type AgentStopOptions = {
  conversationRef?: string | null;
  turnRef?: string | null;
};

export type AgentOwner = {
  listAgents(): Array<{ id: string; agentDefinition: JsonRecord }>;
  getKnownLocalRuntime?(): AgentLocalRuntimeClient | null;
  localRuntime?(options?: { reason?: string }): Promise<AgentLocalRuntimeClient>;
  shutdownLocalRuntime?(): Promise<void>;
};

function logMemoryRetrievalDiagnostic(diagnostic: MemoryRetrievalDiagnostic): void {
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

function normalizeJsonRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

async function emitAppDiagnostic(options: ListConversationOptions, event: AppDiagnosticEventDraft): Promise<void> {
  try {
    await options.diagnostics?.emit?.(event);
  } catch {
    // App diagnostics must never make SDK conversation reads fail.
  }
}

function unwrapLocalRuntimeRpcData(response: unknown, fallbackMessage: string): JsonRecord {
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

export type AgentMemoryType = 'episodic' | 'semantic';

export type AgentMemoryQuery = {
  userId?: string;
  query?: string;
  limit?: number;
  memoryType?: AgentMemoryType;
  excludeConversationId?: string;
  episodicLimit?: number;
  semanticLimit?: number;
  semanticMinScore?: number;
};

export type AgentStoreMemoryInput = {
  userId?: string;
  userQuery: string;
  assistantResponse: string;
  memoryType?: AgentMemoryType;
  sessionId?: string;
};

export type AgentClearMemoriesResult = JsonRecord & {
  episodic_deleted_count?: number;
  semantic_deleted_count?: number;
};

export type AgentMemoryListResult = JsonRecord & {
  memories: unknown[];
  count: number;
};

export type AgentDeleteMemoryResult = JsonRecord & {
  deleted?: boolean;
};

export type AgentStoreMemoryResult = JsonRecord & {
  memory_id?: string;
  memory_type?: string;
};

export type AgentTraceOptions = {
  conversationRef?: string;
  turnRef?: string | null;
  store?: ConversationStore;
};

export class Agent {
  constructor(
    readonly id: string,
    readonly session: AgentSessionRuntime,
    readonly agentDefinition: JsonRecord,
    private readonly sdkClient: AgentHostedBackendClient,
    private readonly owner: AgentOwner,
    private readonly localRuntime?: AgentLocalRuntimeClient,
    private readonly userId = 'local-sdk-user',
    private readonly defaultConversationStore: ConversationStore = new InMemoryConversationStore(),
    private readonly memoryEnabled = true,
    private readonly localToolLifecycle?: LocalToolExecutionLifecycle,
  ) {}

  getDefaultConversationStore(): ConversationStore {
    return this.defaultConversationStore;
  }

  private getKnownLocalRuntime(): AgentLocalRuntimeClient | undefined {
    return this.localRuntime ?? this.owner.getKnownLocalRuntime?.() ?? undefined;
  }

  private async ensureLocalRuntime(reason: string): Promise<AgentLocalRuntimeClient> {
    const knownRuntime = this.getKnownLocalRuntime();
    if (knownRuntime) {
      return knownRuntime;
    }
    if (typeof this.owner.localRuntime !== 'function') {
      throw new Error(`Local runtime is required for ${reason}`);
    }
    return this.owner.localRuntime({ reason });
  }

  async ask(text: string, options: AgentQueryOptions = {}): Promise<string> {
    if (options.model) {
      await this.setModel(options.model);
    }
    return this.query(this.buildQueryInput(text, options));
  }

  async query(payload: AgentQueryInput): Promise<string> {
    const enriched = await this.enrichAgentQueryInput(payload);
    return this.session.query(enriched);
  }

  async run(input: string | AgentQueryInput, options: AgentQueryOptions = {}): Promise<string> {
    if (typeof input === 'string') {
      return this.ask(input, options);
    }
    if (options.model) {
      await this.setModel(options.model);
    }
    return this.query(input);
  }

  async *stream(
    input: string | AgentQueryInput,
    options: AgentQueryOptions = {},
  ): AsyncIterableIterator<AgentStreamEvent> {
    const queryInput = typeof input === 'string' ? this.buildQueryInput(input, options) : input;
    const model = typeof input === 'string' ? options.model : undefined;
    const seenToolOutputs = new Set<string>();
    const conversation = this.conversation({
      conversationRef: queryInput.conversationRef,
      store: this.defaultConversationStore,
    });
    const payload: SendInput['payload'] = {
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

  async stop(input?: string | AgentStopOptions | null): Promise<string> {
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

  noteBackendTraffic(reason = 'traffic'): void {
    this.session.noteTraffic?.(reason);
  }

  syncBackendIdleTimer(reason = 'idle-sync'): void {
    this.session.syncIdleTimer?.(reason);
  }

  conversation(options: {
    conversationRef?: string;
    revisionId?: string;
    store?: ConversationStore;
    localRuntime?: AgentLocalRuntimeClient | null;
    localToolLifecycle?: LocalToolExecutionLifecycle | null;
    resourceResolvers?: TurnResourceResolverRegistry | null;
  } = {}): SdkConversationRuntime {
    const conversationRef = options.conversationRef ?? `conv-${this.id}`;
    const resolvedLocalRuntime = options.localRuntime === undefined
      ? this.getKnownLocalRuntime()
      : options.localRuntime;
    const resolvedLocalToolLifecycle = options.localToolLifecycle === undefined
      ? this.localToolLifecycle
      : options.localToolLifecycle;
    const defaultResourceResolvers = createDefaultTurnResourceResolvers({
      localRuntime: resolvedLocalRuntime,
      localToolLifecycle: resolvedLocalToolLifecycle,
      sdkClient: this.sdkClient,
    });
    const runtime = new SdkConversationRuntime({
      conversationRef,
      revisionId: options.revisionId,
      store: options.store ?? this.defaultConversationStore,
      transport: createAgentRuntimeTransport(this.session, conversationRef, this.agentDefinition),
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
      enrichQuery: async input => {
        const enriched = await enrichQueryPayload({
          text: input.text,
          conversationRef: input.conversationRef,
          userId: this.userId,
          payload: input.payload ?? {},
          sdkClient: this.sdkClient,
          localRuntime: resolvedLocalRuntime,
          memoryEnabled: this.memoryEnabled,
          emitDiagnostic: async diagnostic => {
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

  chat(options: {
    conversationRef?: string;
    revisionId?: string;
    store?: ConversationStore;
    localRuntime?: AgentLocalRuntimeClient | null;
    localToolLifecycle?: LocalToolExecutionLifecycle | null;
    resourceResolvers?: TurnResourceResolverRegistry | null;
  } = {}): AgentChatSession {
    const runtime = this.conversation(options);
    return new AgentChatSession(options.conversationRef ?? `conv-${this.id}`, runtime);
  }

  sleep(): void {
    this.session.close(1000, 'sleep');
  }

  async shutdown(): Promise<void> {
    this.sleep();
    await this.shutdownLocalRuntime();
  }

  async updateSettings(config: JsonRecord): Promise<string> {
    return this.session.updateSettings(config);
  }

  async setModel(selection: AgentModelSelection): Promise<string> {
    return this.updateSettings(buildModelSettingsPatch(selection));
  }

  async listModels(): Promise<SdkModelsResponse> {
    return this.sdkClient.models();
  }

  async getSystemPrompt(): Promise<SdkSystemPromptResponse> {
    return this.sdkClient.systemPrompt();
  }

  async listToolSchemas(options: AgentTraceOptions = {}): Promise<SdkToolSchemasResponse> {
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
      const toolSchemas: unknown[] = Array.isArray((response as JsonRecord).canonical_tool_schemas)
        ? (response as JsonRecord).canonical_tool_schemas as unknown[]
        : Array.isArray((response as JsonRecord).tool_schemas)
          ? (response as JsonRecord).tool_schemas as unknown[]
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
    } catch (error) {
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
    const summary = setAgentDefinitionToolManifest(this.agentDefinition, toolSchemas);
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

  async registerMcps(
    mcps: AgentMcpDefinition[],
    options: { replace?: boolean } = {},
  ): Promise<{ registration: JsonRecord; toolSchemas: JsonRecord[] }> {
    const localRuntime = await this.ensureLocalRuntime('MCP registration');
    if (typeof localRuntime.registerMcp !== 'function') {
      throw new Error('Local runtime does not support MCP registration.');
    }
    const servers = Array.isArray(mcps) ? mcps : [];
    const registration = await localRuntime.registerMcp({
      servers,
      replace: options.replace !== false,
    } as AgentMcpDefinition);
    const manifest = await localRuntime.listTools?.();
    const toolSchemas = Array.isArray(manifest?.tools) ? manifest.tools : [];
    await this.updateToolSchemas(toolSchemas);
    return {
      registration: registration && typeof registration === 'object' && !Array.isArray(registration)
        ? registration as JsonRecord
        : {},
      toolSchemas,
    };
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

  async searchMemory(query: string | AgentMemoryQuery): Promise<JsonRecord> {
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

  async listMemories(options: { userId?: string; type: AgentMemoryType; limit?: number }): Promise<AgentMemoryListResult> {
    const data = await this.callLocalRuntimeRpcData(
      options.type === 'semantic' ? 'list_semantic_memories' : 'list_episodic_memories',
      {
        user_id: options.userId ?? this.userId,
        limit: options.limit,
      },
    );
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

  async storeMemory(input: AgentStoreMemoryInput): Promise<AgentStoreMemoryResult> {
    const content = formatCompletedTurnMemory({
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

  async deleteMemory(options: { userId?: string; type: AgentMemoryType; memoryId: string }): Promise<AgentDeleteMemoryResult> {
    return this.callLocalRuntimeRpcData(
      options.type === 'semantic' ? 'delete_semantic_memory' : 'delete_episodic_memory',
      {
        user_id: options.userId ?? this.userId,
        memory_id: options.memoryId,
      },
    );
  }

  async clearMemories(options: { userId?: string } = {}): Promise<AgentClearMemoriesResult> {
    return await this.callLocalRuntimeRpcData('clear_local_memory', {
      user_id: options.userId ?? this.userId,
    }) as AgentClearMemoriesResult;
  }

  async listTools(options: AgentTraceOptions = {}): Promise<{ version?: number; tools?: JsonRecord[] } | null> {
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
    } catch (error) {
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

  async status(options: AgentTraceOptions = {}): Promise<JsonRecord | null> {
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
    } catch (error) {
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

  async shutdownLocalRuntime(options: AgentTraceOptions = {}): Promise<void> {
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
      } else {
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
    } catch (error) {
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

  async uploadArtifact(file: Blob | File, filename?: string) {
    return this.sdkClient.artifacts.upload(file, filename);
  }

  artifactUrl(artifactId: string): string {
    return this.sdkClient.artifacts.url(artifactId);
  }

  async fetchArtifact(artifactId: string, options: AgentTraceOptions = {}): Promise<Response> {
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
    } catch (error) {
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

  async installIdentity(options: AgentTraceOptions = {}): Promise<AgentInstallIdentityResponse> {
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
          hasInstallId: typeof (response as JsonRecord).install_id === 'string'
            || typeof (response as JsonRecord).installId === 'string',
          responseKeyCount: Object.keys(response as JsonRecord).length,
        },
      }, options);
      return response;
    } catch (error) {
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

  subscribeRawBackendEvents(listener: (event: BackendEvent) => void): () => void {
    return this.session.on('event', listener);
  }

  subscribeLocalRuntimeEvents(listener: AgentLocalRuntimeEventListener): () => void {
    return this.getKnownLocalRuntime()?.subscribeEvents?.(listener) ?? (() => {});
  }

  async listConversations(options: ListConversationOptions & {
    store?: ConversationStore;
  } = {}): Promise<ConversationMetadata[]> {
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
    } catch (error) {
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

  async clearConversations(options: { store?: ConversationStore } = {}): Promise<void> {
    const conversationStore = options.store ?? this.defaultConversationStore;
    if (typeof conversationStore.clearConversations !== 'function') {
      throw new Error('clearConversations requires a clearable conversation store');
    }
    await conversationStore.clearConversations();
  }

  async loadConversation(
    options: string | {
      conversationRef: string;
      revisionId?: string;
      store?: ConversationStore;
    },
  ): Promise<ReturnType<SdkConversationRuntime['load']>> {
    const loadOptions = typeof options === 'string'
      ? { conversationRef: options }
      : options;
    return this.conversation(loadOptions).load();
  }

  async getConversationRevision(options: string | {
    conversationRef: string;
    store?: ConversationStore;
  }): Promise<ConversationRevision> {
    const revisionOptions = typeof options === 'string'
      ? { conversationRef: options }
      : options;
    const conversationStore = revisionOptions.store ?? this.defaultConversationStore;
    return conversationStore.getRevision(revisionOptions.conversationRef);
  }

  async listConversationRevisions(options: {
    conversationRef: string;
    limit?: number;
    store?: ConversationStore;
  }): Promise<ConversationRevision[]> {
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

  async appendConversationEvent(options: ConversationEvent | {
    event: ConversationEvent;
    store?: ConversationStore;
  }): Promise<void> {
    const appendOptions = 'event' in options ? options : { event: options };
    const conversationStore = appendOptions.store ?? this.defaultConversationStore;
    await conversationStore.appendEvent(appendOptions.event);
  }

  async replaceCompactedReplay(options: CompactedReplaySnapshot | {
    snapshot: CompactedReplaySnapshot;
    store?: ConversationStore;
  }): Promise<void> {
    const replaceOptions = 'snapshot' in options ? options : { snapshot: options };
    const conversationStore = replaceOptions.store ?? this.defaultConversationStore;
    await conversationStore.replaceCompactedReplay(replaceOptions.snapshot);
  }

  async loadDisplayTimeline(options: {
    conversationRef: string;
    revisionId?: string | null;
    store?: ConversationStore;
  }): Promise<DisplayTimelineCheckpoint> {
    const { conversationRef, revisionId, store } = options;
    return this.conversation({
      conversationRef,
      revisionId: revisionId ?? undefined,
      store: store ?? this.defaultConversationStore,
    }).loadDisplayTimeline({
      revisionId: revisionId ?? null,
    });
  }

  async loadModelHistory(options: {
    conversationRef: string;
    revisionId?: string | null;
    store?: ConversationStore;
  }): Promise<ModelHistoryCheckpoint | null> {
    const { conversationRef, revisionId, store } = options;
    return this.conversation({
      conversationRef,
      revisionId: revisionId ?? undefined,
      store: store ?? this.defaultConversationStore,
    }).loadModelHistory({
      revisionId: revisionId ?? null,
    });
  }

  async checkoutRevision(options: {
    conversationRef: string;
    revisionId: string;
    store?: ConversationStore;
  }): Promise<CheckoutRevisionResult> {
    const { conversationRef, revisionId, store } = options;
    return this.conversation({
      conversationRef,
      revisionId,
      store: store ?? this.defaultConversationStore,
    }).checkoutRevision({ revisionId });
  }

  async replaceRows(
    options: ReplaceRowsInput & {
      conversationRef: string;
      revisionId?: string;
      store?: ConversationStore;
    },
  ): Promise<DisplayTimelineCheckpoint> {
    const { conversationRef, revisionId, store, ...input } = options;
    return this.conversation({
      conversationRef,
      revisionId,
      store: store ?? this.defaultConversationStore,
    }).replaceRows(input);
  }

  async editAndResend(
    options: EditAndResendInput & {
      conversationRef: string;
      revisionId?: string;
      store?: ConversationStore;
    },
  ): Promise<TurnResult> {
    const { conversationRef, revisionId, store, ...input } = options;
    return this.conversation({
      conversationRef,
      revisionId,
      store: store ?? this.defaultConversationStore,
    }).editAndResend(input);
  }

  async retryTurn(
    options: RetryTurnInput & {
      conversationRef: string;
      revisionId?: string;
      store?: ConversationStore;
    },
  ): Promise<TurnResult> {
    const { conversationRef, revisionId, store, ...input } = options;
    return this.conversation({
      conversationRef,
      revisionId,
      store: store ?? this.defaultConversationStore,
    }).retryTurn(input);
  }

  async forkConversation(
    options: ForkConversationInput & {
      conversationRef: string;
      revisionId?: string;
      store?: ConversationStore;
    },
  ): Promise<ForkConversationResult> {
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

  listAgents(): Array<{ id: string; agentDefinition: JsonRecord }> {
    return this.owner.listAgents();
  }

  private async recordAgentTrace(
    input: TraceEventInput,
    options: AgentTraceOptions = {},
  ): Promise<TraceEventPayload> {
    const conversationRef = options.conversationRef ?? `conv-${this.id}`;
    const turnRef = options.turnRef ?? null;
    const store = options.store ?? this.defaultConversationStore;
    const revisionId = createRuntimeId('rev');
    const recorder = new TraceRecorder({
      conversationRef,
      turnRef,
      userId: this.userId,
      emit: async payload => {
        await store.appendEvent(createConversationEvent<TraceEventPayload>({
          eventId: `${turnRef ?? conversationRef}-sdk-evt-${createRuntimeId('trace_event')}`,
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

  private async callLocalRuntimeRpc(method: string, params: JsonRecord): Promise<JsonRecord> {
    const localRuntime = await this.ensureLocalRuntime(`local-runtime-rpc:${method}`);
    if (!localRuntime.rpc) {
      throw new Error(`Local runtime RPC is required for ${method}`);
    }
    return localRuntime.rpc({ method, params });
  }

  private async callLocalRuntimeRpcData(method: string, params: JsonRecord): Promise<JsonRecord> {
    const result = await this.callLocalRuntimeRpc(method, params);
    return unwrapLocalRuntimeRpcData(result, `Local runtime RPC failed for ${method}`);
  }

  private buildQueryInput(text: string, options: AgentQueryOptions): AgentQueryInput {
    const { model: _model, ...queryOptions } = options;
    return {
      ...queryOptions,
      text,
      conversationRef: queryOptions.conversationRef ?? `conv-${this.id}`,
    };
  }

  private async enrichAgentQueryInput(input: AgentQueryInput): Promise<AgentQueryInput> {
    const enriched = await enrichQueryPayload({
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
