import type { ToolSchema } from './backendEvents.js';
import { InMemoryConversationStore } from './stores/InMemoryConversationStore.js';
import {
  SdkConversationRuntime,
  type SendInput,
} from './runtime/ConversationRuntime.js';
import {
  toAgentStreamEvent,
  toolOutputStreamKey,
  type WindieAgentStreamEvent,
} from './runtime/AgentStreamEvents.js';
import {
  buildModelSettingsPatch,
  type WindieModelSelection,
} from './settings/modelSelection.js';
import {
  createWindieLocalRuntimeProvider,
  SidecarDaemonHttpClient,
  type SidecarDaemonClientOptions,
  type WindieAutoSidecarOptions,
  type WindieLocalRuntimeClient,
  type WindieLocalRuntimeProvider,
  type WindieMcpDefinition,
  type WindiePluginDefinition,
  type WindieSkillDefinition,
  type WindieToolDefinition,
} from './runtime/LocalSidecarRuntime.js';
import type {
  ConversationMetadata,
  ConversationStore,
  JsonRecord,
  ListConversationOptions,
} from './conversation/types.js';
import {
  createMessageId,
  createWindieAgentBackendTransport,
  deriveWsUrl,
  normalizeWsUrl,
  resolveWebSocketImplementation,
  WindieAgentSession,
  type WebSocketConstructor,
  type WindieAgentQueryInput,
} from './transport/WindieAgentSession.js';
import {
  WindieSdkClient,
  type FetchLike,
  type SdkModelsResponse,
  type WindieSdkQueryOptions,
} from './transport/HostedBackendHttpClient.js';

export * from './conversation/types.js';
export * from './conversation/events.js';
export * from './stores/InMemoryConversationStore.js';
export * from './projections/conversationProjections.js';
export * from './runtime/conversationReducer.js';
export * from './runtime/ConversationRuntime.js';
export * from './runtime/AgentStreamEvents.js';
export * from './runtime/LocalSidecarRuntime.js';
export * from './transport/backendEventNormalizer.js';
export * from './transport/HostedBackendHttpClient.js';
export * from './tools/ToolExecutionCoordinator.js';
export * from './settings/modelSelection.js';
export { WindieAgentSession } from './transport/WindieAgentSession.js';
export type {
  WebSocketConstructor,
  WebSocketLike,
  WindieAgentQueryInput,
} from './transport/WindieAgentSession.js';

export type WindieAgentQueryOptions = Partial<Omit<WindieAgentQueryInput, 'text' | 'conversationRef'>> & {
  conversationRef?: string;
  model?: WindieModelSelection;
};

export type WindieWakeUpOptions = {
  backendUrl?: string;
  userId?: string;
  systemPrompt?: string;
  workspacePath?: string;
  tools?: WindieToolDefinition[];
  skills?: WindieSkillDefinition[];
  mcps?: WindieMcpDefinition[];
  plugins?: WindiePluginDefinition[];
  conversationRef?: string;
  agentId?: string;
  name?: string;
  model?: WindieModelSelection;
};

export type WindieClientOptions = {
  backendUrl?: string;
  httpBaseUrl?: string;
  wsUrl?: string;
  fetchImpl?: FetchLike;
  WebSocketImpl?: WebSocketConstructor;
  defaultUserId?: string;
  localRuntime?: WindieLocalRuntimeClient;
  sidecar?: WindieLocalRuntimeClient;
  sidecarDaemon?: SidecarDaemonClientOptions;
  ensureLocalRuntime?: WindieLocalRuntimeProvider<WindieWakeUpOptions>;
  autoStartLocalRuntime?: boolean;
  autoSidecar?: WindieAutoSidecarOptions;
};

export class WindieAgent {
  private readonly defaultConversationStore = new InMemoryConversationStore();

  constructor(
    readonly id: string,
    readonly session: WindieAgentSession,
    readonly agentDefinition: JsonRecord,
    private readonly sdkClient: WindieSdkClient,
    private readonly owner: WindieClient,
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
          const key = toolOutputStreamKey(runtimeEvent.event);
          if (key && seenToolOutputs.has(key)) {
            continue;
          }
          if (key) {
            seenToolOutputs.add(key);
          }
        }
        yield streamEvent;
      }
    }
  }

  async stop(conversationRef?: string | null): Promise<string> {
    return this.session.stopQuery(conversationRef);
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
      transport: createWindieAgentBackendTransport(this.session, conversationRef),
      localRuntime: options.localRuntime === undefined ? this.localRuntime : options.localRuntime,
    });
    runtime.attachTransport();
    return runtime;
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

  async listConversations(options: ListConversationOptions & {
    store?: ConversationStore;
  } = {}): Promise<ConversationMetadata[]> {
    const { store, ...listOptions } = options;
    return (store ?? this.defaultConversationStore).listMetadata(listOptions);
  }

  async loadConversation(options: {
    conversationRef: string;
    revisionId?: string;
    store?: ConversationStore;
  }): Promise<ReturnType<SdkConversationRuntime['load']>> {
    return this.conversation(options).load();
  }

  listAgents(): Array<{ id: string; agentDefinition: JsonRecord }> {
    return this.owner.listAgents();
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

export class WindieClient {
  private readonly defaultOptions: WindieClientOptions;
  private readonly activeAgents = new Map<string, WindieAgent>();
  private autoLocalRuntimeProvider?: WindieLocalRuntimeProvider<WindieWakeUpOptions>;
  private activeLocalRuntime?: WindieLocalRuntimeClient;

  constructor(options: WindieClientOptions = {}) {
    this.defaultOptions = options;
  }

  async wakeUp(options: WindieWakeUpOptions): Promise<WindieAgent> {
    const initialModelSettings = options.model
      ? buildModelSettingsPatch(options.model, 'WindieClient.wakeUp')
      : null;
    const backendUrl = this.resolveBackendUrl(options.backendUrl);
    const localRuntime = await this.resolveLocalRuntimeForWakeUp(options);
    const sdkClient = this.createSdkClient(backendUrl);

    const localTools = await this.prepareLocalRuntime(options, localRuntime);
    const agentDefinition = buildWakeUpAgentDefinition(options, localTools);
    const wsUrl = this.defaultOptions.wsUrl
      ? normalizeWsUrl(this.defaultOptions.wsUrl)
      : deriveWsUrl(backendUrl);
    const WebSocketImpl = resolveWebSocketImplementation(this.defaultOptions.WebSocketImpl);
    const socket = new WebSocketImpl(wsUrl);
    const session = new WindieAgentSession(socket, {
      user_id: options.userId ?? this.defaultOptions.defaultUserId ?? 'local-sdk-user',
      operating_system: detectOperatingSystem(),
      agent_definition: agentDefinition,
    });
    await session.waitForOpen();
    if (initialModelSettings) {
      await session.updateSettings(initialModelSettings);
    }
    const id = typeof agentDefinition.id === 'string' ? agentDefinition.id : createMessageId();
    const agent = new WindieAgent(id, session, agentDefinition, sdkClient, this, localRuntime);
    this.activeAgents.set(id, agent);
    session.on('close', () => {
      this.activeAgents.delete(id);
    });
    return agent;
  }

  listAgents(): Array<{ id: string; agentDefinition: JsonRecord }> {
    return Array.from(this.activeAgents.values()).map(agent => ({
      id: agent.id,
      agentDefinition: agent.agentDefinition,
    }));
  }

  async listModels(options: WindieSdkQueryOptions & { backendUrl?: string } = {}): Promise<SdkModelsResponse> {
    const { backendUrl, ...queryOptions } = options;
    return this.createSdkClient(this.resolveBackendUrl(backendUrl)).models(queryOptions);
  }

  async listTools(): Promise<{ version?: number; tools?: JsonRecord[] } | null> {
    const localRuntime = this.resolveKnownLocalRuntime();
    return localRuntime?.listTools ? localRuntime.listTools() : null;
  }

  async status(): Promise<JsonRecord | null> {
    const localRuntime = this.resolveKnownLocalRuntime();
    return localRuntime?.status ? localRuntime.status() : null;
  }

  async shutdownLocalRuntime(): Promise<void> {
    const localRuntime = this.resolveKnownLocalRuntime();
    await localRuntime?.shutdown?.();
    if (localRuntime && localRuntime === this.activeLocalRuntime) {
      this.activeLocalRuntime = undefined;
    }
  }

  private resolveBackendUrl(backendUrl?: string): string {
    return backendUrl ?? this.defaultOptions.backendUrl ?? this.defaultOptions.httpBaseUrl ?? 'https://api.windieos.com';
  }

  private createSdkClient(backendUrl: string): WindieSdkClient {
    return new WindieSdkClient({
      httpBaseUrl: backendUrl,
      fetchImpl: this.defaultOptions.fetchImpl,
    });
  }

  private resolveConfiguredLocalRuntime(): WindieLocalRuntimeClient | undefined {
    const explicitRuntime = this.defaultOptions.sidecar ?? this.defaultOptions.localRuntime;
    if (explicitRuntime) {
      return explicitRuntime;
    }
    if (this.defaultOptions.sidecarDaemon) {
      return new SidecarDaemonHttpClient({
        ...this.defaultOptions.sidecarDaemon,
        fetchImpl: this.defaultOptions.sidecarDaemon.fetchImpl ?? this.defaultOptions.fetchImpl,
      });
    }
    return undefined;
  }

  private resolveKnownLocalRuntime(): WindieLocalRuntimeClient | undefined {
    return this.activeLocalRuntime ?? this.resolveConfiguredLocalRuntime();
  }

  private async resolveLocalRuntimeForWakeUp(options: WindieWakeUpOptions): Promise<WindieLocalRuntimeClient | undefined> {
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
      this.autoLocalRuntimeProvider = createWindieLocalRuntimeProvider<WindieWakeUpOptions>({
        fetchImpl: this.defaultOptions.fetchImpl,
        ...(this.defaultOptions.autoSidecar ?? {}),
      });
    }
    const runtime = await this.autoLocalRuntimeProvider(context);
    this.activeLocalRuntime = runtime;
    return runtime;
  }

  private needsLocalRuntime(options: WindieWakeUpOptions): boolean {
    return Boolean(
      (options.tools ?? []).some(tool => Boolean(tool.module))
      || (options.plugins ?? []).length > 0
      || (options.mcps ?? []).length > 0,
    );
  }

  private async prepareLocalRuntime(
    options: WindieWakeUpOptions,
    localRuntime?: WindieLocalRuntimeClient,
  ): Promise<JsonRecord[]> {
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
    const explicitTools = (options.tools ?? [])
      .filter(tool => !tool.module)
      .map(tool => buildManifestTool(tool));
    return [...registeredTools, ...explicitTools];
  }
}

function buildWakeUpAgentDefinition(options: WindieWakeUpOptions, tools: JsonRecord[]): JsonRecord {
  return {
    version: 1,
    id: options.agentId ?? `windie-agent-${createMessageId()}`,
    name: options.name ?? 'Windie Agent',
    system_prompt: options.systemPrompt
      ? { mode: 'replace', content: options.systemPrompt }
      : undefined,
    tools: {
      mode: 'default_plus_client',
      client_manifest: {
        version: 1,
        tools,
      },
    },
    skills: options.skills ?? [],
    mcps: options.mcps ?? [],
    plugins: options.plugins ?? [],
    runtime: {
      workspace_path: options.workspacePath,
      operating_system: detectOperatingSystem(),
    },
  };
}

function buildManifestTool(tool: WindieToolDefinition): JsonRecord {
  return {
    name: tool.name,
    description: tool.description,
    execution_target: tool.execution_target ?? 'sidecar',
    argument_resolution: tool.argument_resolution ?? 'passthrough',
    schema: tool.schema,
  };
}

function detectOperatingSystem(): string {
  const processPlatform = (globalThis as unknown as { process?: { platform?: string } }).process?.platform;
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

export type { ToolSchema };
