/**
 * Implements the hosted/local agent client integration for the TypeScript SDK runtime.
 */

import {
  buildModelSettingsPatch,
  type AgentModelSelection,
} from '../settings/modelSelection.js';
import type {
  ConversationStore,
  JsonRecord,
  LocalToolManifest,
  LocalToolResult,
  LocalToolExecutionLifecycle,
} from '../conversation/types.js';
import { InMemoryConversationStore } from '../stores/InMemoryConversationStore.js';
import { LocalRuntimeConversationStore } from '../stores/LocalRuntimeConversationStore.js';
import {
  shouldIncludeBuiltinTool,
  type AgentBuiltinSelection,
  type AgentBuiltinToolSet,
} from '../tools/builtins.js';
import {
  createAgentSession,
  createMessageId,
  type WebSocketConstructor,
  type WebSocketLike,
  type AgentSessionRuntime,
} from '../transport/AgentSession.js';
import {
  createManagedAgentSession,
  type ManagedAgentBackendEndpoint,
} from '../transport/ManagedAgentSession.js';
import {
  AgentHostedBackendClient,
  type FetchLike,
  type SdkModelsResponse,
  type AgentSdkQueryOptions,
} from '../transport/HostedBackendHttpClient.js';
import { Agent } from './Agent.js';
import { stampAgentDefinitionCapabilityMetadata } from './CapabilityManifest.js';
import {
  createAgentLocalRuntimeProvider,
  AgentLocalRuntimeHttpClient,
  type AgentLocalRuntimeHttpClientOptions,
  type AgentAutoLocalRuntimeOptions,
  type AgentLocalRuntimeClient,
  type AgentLocalRuntimeProvider,
  type AgentMcpDefinition,
  type AgentPluginDefinition,
  type AgentSkillDefinition,
  type AgentToolDefinition,
} from './LocalRuntime.js';
import {
  AGENT_BACKEND_URL_REQUIRED_MESSAGE,
  AGENT_BACKEND_URL_ENV_KEYS,
  AGENT_INSTALL_TOKEN_ENV_KEYS,
  readGlobalRuntimeEnv,
} from './RuntimeEnv.js';

export type AgentRuntimeFeatureOption = boolean | {
  enabled?: boolean;
};

export type AgentInstallAuthState = {
  userId: string;
  installId?: string;
  installToken: string;
};

export type AgentInstallAuthOptions = Partial<AgentInstallAuthState> & {
  autoRegister?: boolean;
};

export type AgentWakeUpOptions = {
  backendUrl?: string;
  userId?: string;
  installToken?: string;
  installAuth?: AgentInstallAuthOptions;
  systemPrompt?: string;
  workspacePath?: string;
  tools?: AgentToolDefinition[];
  skills?: AgentSkillDefinition[];
  mcps?: AgentMcpDefinition[];
  plugins?: AgentPluginDefinition[];
  builtins?: AgentBuiltinSelection;
  conversationRef?: string;
  agentId?: string;
  name?: string;
  model?: AgentModelSelection;
  operatingSystem?: string;
  localToolLifecycle?: LocalToolExecutionLifecycle;
  memory?: AgentRuntimeFeatureOption;
  persistence?: AgentRuntimeFeatureOption;
};

export type AgentClientOptions = {
  backendUrl?: string;
  httpBaseUrl?: string;
  wsUrl?: string;
  wsOrigin?: string;
  backendSession?: 'direct' | 'managed';
  backendEndpoints?: ManagedAgentBackendEndpoint[];
  reconnectIntervalMs?: number;
  connectTimeoutMs?: number;
  idleDisconnectTimeoutMs?: number;
  shouldHoldBackendConnectionOpen?: () => boolean;
  beforeBackendConnect?: (payload: { reason: string }) => Promise<void> | void;
  onBackendOpen?: (payload: { socket: WebSocketLike; handshake: JsonRecord }) => void;
  onBackendSocketChange?: (socket: WebSocketLike | null) => void;
  onBackendClose?: (payload: {
    opened: boolean;
    closeReason: string | null;
    shouldReconnect: boolean;
    reconnectScheduled: boolean;
  }) => void;
  onBackendError?: (payload: { error: unknown; opened: boolean; socket: WebSocketLike }) => void;
  onBackendHandshakeError?: (error: unknown) => void;
  onBackendMessageError?: (error: unknown) => void;
  onBackendSend?: (type: string) => void;
  onBackendFallback?: (endpoint: ManagedAgentBackendEndpoint) => void;
  log?: (message: string) => void;
  fetchImpl?: FetchLike;
  WebSocketImpl?: WebSocketConstructor;
  operatingSystem?: string;
  defaultUserId?: string;
  installToken?: string;
  installAuth?: AgentInstallAuthOptions;
  localRuntime?: AgentLocalRuntimeClient;
  localToolLifecycle?: LocalToolExecutionLifecycle;
  localRuntimeDaemon?: AgentLocalRuntimeHttpClientOptions;
  ensureLocalRuntime?: AgentLocalRuntimeProvider<AgentWakeUpOptions>;
  autoStartLocalRuntime?: boolean;
  autoLocalRuntime?: AgentAutoLocalRuntimeOptions;
  memory?: AgentRuntimeFeatureOption;
  persistence?: AgentRuntimeFeatureOption;
};

export type AgentLocalRuntimeRequest = {
  reason?: string;
  require?: boolean;
};

type NormalizedAgentRuntimeFeatures = {
  memory: boolean;
  persistence: boolean;
};

export class AgentClient {
  private readonly defaultOptions: AgentClientOptions;
  private readonly activeAgents = new Map<string, Agent>();
  private autoLocalRuntimeProvider?: AgentLocalRuntimeProvider<AgentWakeUpOptions>;
  private activeLocalRuntime?: AgentLocalRuntimeClient;

  constructor(options: AgentClientOptions = {}) {
    this.defaultOptions = options;
  }

  async wakeUp(options: AgentWakeUpOptions = {}): Promise<Agent> {
    const runtimeFeatures = normalizeRuntimeFeatures(options, this.defaultOptions);
    const initialModelSettings = options.model
      ? buildModelSettingsPatch(options.model, 'agentClient.wakeUp')
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
    const id = typeof agentDefinition.id === 'string' ? agentDefinition.id : createMessageId();
    const agent = new Agent(
      id,
      session,
      agentDefinition,
      sdkClient,
      this,
      localRuntime,
      userId,
      conversationStore,
      runtimeFeatures.memory,
      localToolLifecycle,
    );
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

  async listModels(options: AgentSdkQueryOptions & { backendUrl?: string } = {}): Promise<SdkModelsResponse> {
    const { backendUrl, ...queryOptions } = options;
    return this.createSdkClient(this.resolveBackendUrl(backendUrl)).models(queryOptions);
  }

  async listTools(): Promise<{ version?: number; tools?: JsonRecord[] } | null> {
    const localRuntime = this.getKnownLocalRuntime();
    return localRuntime?.listTools ? localRuntime.listTools() : null;
  }

  async status(): Promise<JsonRecord | null> {
    const localRuntime = this.getKnownLocalRuntime();
    return localRuntime?.status ? localRuntime.status() : null;
  }

  getKnownLocalRuntime(): AgentLocalRuntimeClient | null {
    return this.resolveKnownLocalRuntime() ?? null;
  }

  async localRuntime(options: AgentLocalRuntimeRequest = {}): Promise<AgentLocalRuntimeClient> {
    return this.ensureLocalRuntime({
      reason: options.reason ?? 'local-runtime',
      wakeUp: {},
      errorMessage: 'Agent SDK local runtime provider did not return a runtime.',
    });
  }

  async executeTool(
    call: { toolName: string; args: JsonRecord; timeoutMs?: number },
    options: AgentLocalRuntimeRequest = {},
  ): Promise<LocalToolResult> {
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

  async rpc(
    payload: { method: string; params?: JsonRecord; id?: string | number },
    options: AgentLocalRuntimeRequest = {},
  ): Promise<JsonRecord> {
    const runtime = await this.localRuntime({
      ...options,
      reason: options.reason ?? 'local-runtime-rpc',
    });
    if (typeof runtime.rpc !== 'function') {
      throw new Error('Agent SDK local runtime does not support RPC.');
    }
    return runtime.rpc(payload);
  }

  async listLocalTools(options: AgentLocalRuntimeRequest = {}): Promise<LocalToolManifest> {
    const runtime = await this.localRuntime({
      ...options,
      reason: options.reason ?? 'list-local-tools',
    });
    if (typeof runtime.listTools !== 'function') {
      throw new Error('Agent SDK local runtime does not support tool listing.');
    }
    return runtime.listTools() as Promise<LocalToolManifest>;
  }

  async localStatus(options: AgentLocalRuntimeRequest = {}): Promise<JsonRecord> {
    const runtime = await this.localRuntime({
      ...options,
      reason: options.reason ?? 'local-status',
    });
    if (typeof runtime.status !== 'function') {
      throw new Error('Agent SDK local runtime does not support status.');
    }
    return runtime.status();
  }

  async shutdownLocalRuntime(): Promise<void> {
    const localRuntime = this.getKnownLocalRuntime();
    await localRuntime?.shutdown?.();
    if (localRuntime && localRuntime === this.activeLocalRuntime) {
      this.activeLocalRuntime = undefined;
    }
  }

  private resolveBackendUrl(backendUrl?: string): string {
    const resolvedBackendUrl = backendUrl
      ?? this.defaultOptions.backendUrl
      ?? this.defaultOptions.httpBaseUrl
      ?? readGlobalRuntimeEnv(AGENT_BACKEND_URL_ENV_KEYS);
    if (resolvedBackendUrl) {
      return resolvedBackendUrl;
    }
    throw new Error(AGENT_BACKEND_URL_REQUIRED_MESSAGE);
  }

  private createSdkClient(backendUrl: string, authToken?: string): AgentHostedBackendClient {
    return new AgentHostedBackendClient({
      httpBaseUrl: backendUrl,
      fetchImpl: this.defaultOptions.fetchImpl,
      authToken,
    });
  }

  private createAgentSession({
    backendUrl,
    installToken,
    userId,
    operatingSystem,
    agentDefinition,
  }: {
    backendUrl: string;
    installToken?: string;
    userId: string;
    operatingSystem: string;
    agentDefinition: JsonRecord;
  }): AgentSessionRuntime {
    const headers = installToken ? { Authorization: `Bearer ${installToken}` } : undefined;
    if (this.defaultOptions.backendSession === 'managed') {
      return createManagedAgentSession({
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
    return createAgentSession({
      backendUrl,
      wsUrl: this.defaultOptions.wsUrl,
      WebSocketImpl: this.defaultOptions.WebSocketImpl,
      headers,
      userId,
      operatingSystem,
      agentDefinition,
    });
  }

  private async resolveInstallAuthState(
    backendUrl: string,
    operatingSystem: string,
    options: AgentWakeUpOptions,
  ): Promise<AgentInstallAuthState | null> {
    const configured = options.installAuth ?? this.defaultOptions.installAuth ?? {};
    const installToken = (
      options.installToken
      ?? configured.installToken
      ?? this.defaultOptions.installToken
      ?? readGlobalRuntimeEnv(AGENT_INSTALL_TOKEN_ENV_KEYS)
    )?.trim();
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
    const payload = await response.json() as Record<string, unknown>;
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

  private async resolveInstallTokenIdentity(
    backendUrl: string,
    installToken: string,
  ): Promise<Pick<AgentInstallAuthState, 'userId' | 'installId'> | null> {
    try {
      const identity = await new AgentHostedBackendClient({
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
    } catch (error) {
      if (this.defaultOptions.defaultUserId) {
        this.defaultOptions.log?.(
          `Install identity lookup failed; falling back to configured user id: ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
      }
      throw error;
    }
  }

  private resolveConfiguredLocalRuntime(): AgentLocalRuntimeClient | undefined {
    const explicitRuntime = this.defaultOptions.localRuntime;
    if (explicitRuntime) {
      return explicitRuntime;
    }
    const daemonOptions = this.defaultOptions.localRuntimeDaemon;
    if (daemonOptions) {
      return new AgentLocalRuntimeHttpClient({
        ...daemonOptions,
        fetchImpl: daemonOptions.fetchImpl ?? this.defaultOptions.fetchImpl,
      });
    }
    return undefined;
  }

  private resolveKnownLocalRuntime(): AgentLocalRuntimeClient | undefined {
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

  private async ensureLocalRuntime({
    wakeUp,
    reason,
    errorMessage,
  }: {
    wakeUp: AgentWakeUpOptions;
    reason: string;
    errorMessage: string;
  }): Promise<AgentLocalRuntimeClient> {
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
      this.autoLocalRuntimeProvider = createAgentLocalRuntimeProvider<AgentWakeUpOptions>({
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

  private async resolveLocalRuntimeForWakeUp(
    options: AgentWakeUpOptions,
    runtimeFeatures: NormalizedAgentRuntimeFeatures,
  ): Promise<AgentLocalRuntimeClient | undefined> {
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

  private needsLocalRuntime(
    options: AgentWakeUpOptions,
    runtimeFeatures: NormalizedAgentRuntimeFeatures,
  ): boolean {
    const builtins = normalizeBuiltins(options);
    return Boolean(
      runtimeFeatures.memory
      || runtimeFeatures.persistence
      || (options.tools ?? []).some(tool => Boolean(tool.module))
      || (options.plugins ?? []).length > 0
      || (options.mcps ?? []).length > 0
      || builtins.length > 0,
    );
  }

  private async prepareLocalRuntime(
    options: AgentWakeUpOptions,
    localRuntime?: AgentLocalRuntimeClient,
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
    const builtins = normalizeBuiltins(options);
    const hasRuntimeExtensions = (options.tools ?? []).some(tool => Boolean(tool.module))
      || (options.plugins ?? []).length > 0
      || (options.mcps ?? []).length > 0;
    const registeredRuntimeTools = hasRuntimeExtensions ? registeredTools : [];
    const selectedBuiltinTools = builtins.length > 0
      ? registeredTools.filter(tool => (
        typeof tool.name === 'string'
        && shouldIncludeBuiltinTool(tool.name, builtins)
      ))
      : [];
    const explicitTools = (options.tools ?? [])
      .filter(tool => !tool.module)
      .map(tool => buildManifestTool(tool));
    return dedupeManifestTools([...registeredRuntimeTools, ...selectedBuiltinTools, ...explicitTools]);
  }
}

function featureEnabled(value: AgentRuntimeFeatureOption | undefined, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value && typeof value === 'object' && typeof value.enabled === 'boolean') {
    return value.enabled;
  }
  return fallback;
}

function normalizeRuntimeFeatures(
  options: AgentWakeUpOptions,
  defaults: AgentClientOptions,
): NormalizedAgentRuntimeFeatures {
  return {
    memory: featureEnabled(options.memory ?? defaults.memory, true),
    persistence: featureEnabled(options.persistence ?? defaults.persistence, true),
  };
}

function createDefaultConversationStore({
  localRuntime,
  persistenceEnabled,
  userId,
}: {
  localRuntime?: AgentLocalRuntimeClient;
  persistenceEnabled: boolean;
  userId: string;
}): ConversationStore {
  if (!persistenceEnabled) {
    return new InMemoryConversationStore();
  }
  if (!localRuntime?.rpc) {
    throw new Error('Agent SDK persistence requires a local runtime with RPC support.');
  }
  return new LocalRuntimeConversationStore({
    userId,
    runtime: localRuntime,
  });
}

function validateLocalRuntimeFeatures(
  localRuntime: AgentLocalRuntimeClient | undefined,
  runtimeFeatures: NormalizedAgentRuntimeFeatures,
): void {
  if (runtimeFeatures.memory && !localRuntime?.rpc) {
    throw new Error('Agent SDK memory requires a local runtime with RPC support.');
  }
  if (runtimeFeatures.persistence && !localRuntime?.rpc) {
    throw new Error('Agent SDK persistence requires a local runtime with RPC support.');
  }
}

function buildWakeUpAgentDefinition(options: AgentWakeUpOptions, tools: JsonRecord[]): JsonRecord {
  const definition: JsonRecord = {
    version: 1,
    id: options.agentId ?? `agent-${createMessageId()}`,
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
  stampAgentDefinitionCapabilityMetadata(definition);
  return definition;
}

function normalizeBuiltins(options: AgentWakeUpOptions): AgentBuiltinToolSet[] {
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

function dedupeBuiltinToolSets(values: AgentBuiltinToolSet[]): AgentBuiltinToolSet[] {
  const normalized: AgentBuiltinToolSet[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    normalized.push(value);
  }
  return normalized;
}

function buildManifestTool(tool: AgentToolDefinition): JsonRecord {
  return {
    name: tool.name,
    description: tool.description,
    execution_target: tool.execution_target ?? 'local_runtime',
    argument_resolution: tool.argument_resolution ?? 'passthrough',
    schema: tool.schema,
  };
}

function dedupeManifestTools(tools: JsonRecord[]): JsonRecord[] {
  const deduped: JsonRecord[] = [];
  const seen = new Set<string>();
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

function normalizeRuntimePath(path: unknown): string | undefined {
  return typeof path === 'string' && path.trim() ? path.trim() : undefined;
}

function detectWorkspacePath(): string | undefined {
  const processLike = (globalThis as unknown as {
    process?: {
      cwd?: () => string;
      env?: Record<string, string | undefined>;
    };
  }).process;
  try {
    const cwd = typeof processLike?.cwd === 'function' ? processLike.cwd() : undefined;
    const normalizedCwd = normalizeRuntimePath(cwd);
    if (normalizedCwd) {
      return normalizedCwd;
    }
  } catch {
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
