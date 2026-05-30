import {
  buildModelSettingsPatch,
  type WindieModelSelection,
} from '../settings/modelSelection.js';
import type { JsonRecord } from '../conversation/types.js';
import {
  shouldIncludeBuiltinTool,
  type WindieBuiltinSelection,
  type WindieBuiltinToolSet,
} from '../tools/builtins.js';
import {
  createWindieAgentSession,
  createMessageId,
  type WebSocketConstructor,
  type WebSocketLike,
  type WindieAgentSessionRuntime,
} from '../transport/WindieAgentSession.js';
import {
  createManagedWindieAgentSession,
  type WindieManagedBackendEndpoint,
} from '../transport/ManagedWindieAgentSession.js';
import {
  WindieSdkClient,
  type FetchLike,
  type SdkModelsResponse,
  type WindieSdkQueryOptions,
} from '../transport/HostedBackendHttpClient.js';
import { WindieAgent } from './WindieAgent.js';
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
} from './LocalSidecarRuntime.js';

export type WindieWakeUpOptions = {
  backendUrl?: string;
  userId?: string;
  installToken?: string;
  installAuth?: WindieInstallAuthOptions;
  systemPrompt?: string;
  workspacePath?: string;
  tools?: WindieToolDefinition[];
  skills?: WindieSkillDefinition[];
  mcps?: WindieMcpDefinition[];
  plugins?: WindiePluginDefinition[];
  builtins?: WindieBuiltinSelection;
  /**
   * @deprecated Use builtins instead.
   */
  builtinTools?: WindieBuiltinToolSet[];
  conversationRef?: string;
  agentId?: string;
  name?: string;
  model?: WindieModelSelection;
  operatingSystem?: string;
};

export type WindieClientOptions = {
  backendUrl?: string;
  httpBaseUrl?: string;
  wsUrl?: string;
  wsOrigin?: string;
  backendSession?: 'direct' | 'managed';
  backendEndpoints?: WindieManagedBackendEndpoint[];
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
    fallbackScheduled: boolean;
  }) => void;
  onBackendError?: (payload: { error: unknown; opened: boolean; socket: WebSocketLike }) => void;
  onBackendHandshakeError?: (error: unknown) => void;
  onBackendMessageError?: (error: unknown) => void;
  onBackendSend?: (type: string) => void;
  onBackendFallback?: (endpoint: WindieManagedBackendEndpoint) => void;
  log?: (message: string) => void;
  fetchImpl?: FetchLike;
  WebSocketImpl?: WebSocketConstructor;
  operatingSystem?: string;
  defaultUserId?: string;
  installToken?: string;
  installAuth?: WindieInstallAuthOptions;
  localRuntime?: WindieLocalRuntimeClient;
  sidecar?: WindieLocalRuntimeClient;
  sidecarDaemon?: SidecarDaemonClientOptions;
  ensureLocalRuntime?: WindieLocalRuntimeProvider<WindieWakeUpOptions>;
  autoStartLocalRuntime?: boolean;
  autoSidecar?: WindieAutoSidecarOptions;
};

export type WindieInstallAuthState = {
  userId: string;
  installId?: string;
  installToken: string;
};

export type WindieInstallAuthOptions = Partial<WindieInstallAuthState> & {
  autoRegister?: boolean;
};

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

  private createSdkClient(backendUrl: string, authToken?: string): WindieSdkClient {
    return new WindieSdkClient({
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
  }): WindieAgentSessionRuntime {
    const headers = installToken ? { Authorization: `Bearer ${installToken}` } : undefined;
    if (this.defaultOptions.backendSession === 'managed') {
      return createManagedWindieAgentSession({
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
    return createWindieAgentSession({
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
    options: WindieWakeUpOptions,
  ): Promise<WindieInstallAuthState | null> {
    const configured = options.installAuth ?? this.defaultOptions.installAuth ?? {};
    const installToken = (
      options.installToken
      ?? configured.installToken
      ?? this.defaultOptions.installToken
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
    const shouldAutoRegister = configured.autoRegister ?? (
      !configuredUserId && isHostedWindieBackendUrl(backendUrl)
    );
    if (!shouldAutoRegister) {
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
    const payload = await response.json() as Record<string, unknown>;
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

  private async resolveInstallTokenIdentity(
    backendUrl: string,
    installToken: string,
  ): Promise<Pick<WindieInstallAuthState, 'userId' | 'installId'> | null> {
    try {
      const identity = await new WindieSdkClient({
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
          `Windie install identity lookup failed; falling back to configured user id: ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
      }
      throw error;
    }
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
    const builtins = normalizeBuiltins(options);
    return Boolean(
      (options.tools ?? []).some(tool => Boolean(tool.module))
      || (options.plugins ?? []).length > 0
      || (options.mcps ?? []).length > 0
      || builtins.length > 0,
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
    const builtins = normalizeBuiltins(options);
    const hasRuntimeExtensions = (options.tools ?? []).some(tool => Boolean(tool.module))
      || (options.plugins ?? []).length > 0
      || (options.mcps ?? []).length > 0;
    const registeredRuntimeTools = hasRuntimeExtensions ? registeredTools : [];
    const builtinTools = builtins.length > 0
      ? registeredTools.filter(tool => (
        typeof tool.name === 'string'
        && shouldIncludeBuiltinTool(tool.name, builtins)
      ))
      : [];
    const explicitTools = (options.tools ?? [])
      .filter(tool => !tool.module)
      .map(tool => buildManifestTool(tool));
    return dedupeManifestTools([...registeredRuntimeTools, ...builtinTools, ...explicitTools]);
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

function isHostedWindieBackendUrl(backendUrl: string): boolean {
  try {
    const hostname = new URL(backendUrl).hostname.toLowerCase();
    return hostname === 'api.windieos.com';
  } catch {
    return false;
  }
}

function normalizeBuiltins(options: WindieWakeUpOptions): WindieBuiltinToolSet[] {
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

function dedupeBuiltinToolSets(values: WindieBuiltinToolSet[]): WindieBuiltinToolSet[] {
  const normalized: WindieBuiltinToolSet[] = [];
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

function buildManifestTool(tool: WindieToolDefinition): JsonRecord {
  return {
    name: tool.name,
    description: tool.description,
    execution_target: tool.execution_target ?? 'sidecar',
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
