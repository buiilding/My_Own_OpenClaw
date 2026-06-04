import type {
  CompactHistoryPayload,
  ConversationEvent,
  ConversationStore,
  CurrentTurnProjection,
  JsonRecord,
  RehydratePayload,
  SdkDisplayRow,
  SettingsPayload,
  WakewordPayload,
} from '../conversation/types.js';
import type { SdkModelsResponse } from '../transport/HostedBackendHttpClient.js';
import { buildDisplayRows } from '../projections/conversationProjections.js';
import type {
  ConversationSnapshot,
  SdkConversationRuntime,
  SendInput,
  TurnResult,
} from './ConversationRuntime.js';
import type { WindieAgent } from './WindieAgent.js';
import {
  WindieClient,
  type WindieInstallAuthOptions,
  type WindieClientOptions,
  type WindieWakeUpOptions,
} from './WindieClient.js';
import type { WindieManagedBackendEndpoint } from '../transport/ManagedWindieAgentSession.js';
import type {
  WebSocketConstructor,
  WebSocketLike,
} from '../transport/WindieAgentSession.js';
import type {
  FetchLike,
} from '../transport/HostedBackendHttpClient.js';
import type { WindieLocalRuntimeClient } from './LocalSidecarRuntime.js';

export type WindieDesktopAgentStatusPhase =
  | 'ready'
  | 'running'
  | 'stopped'
  | 'error'
  | 'closed';

export type WindieDesktopAgentStatus = {
  phase: WindieDesktopAgentStatusPhase;
  conversationRef: string;
  turnRef?: string | null;
  workspacePath?: string | null;
  error?: string | null;
};

export type WindieDesktopEndpoint = string | {
  primary?: WindieDesktopEndpoint;
  fallbacks?: WindieDesktopEndpoint[];
  backendUrl?: string;
  httpUrl?: string;
  httpBaseUrl?: string;
  wsUrl?: string;
  wsOrigin?: string;
};

export type WindieDesktopDebugOptions = {
  log?: (message: string) => void;
};

export type WindieDesktopConnectionOptions = {
  reconnectIntervalMs?: number;
  connectTimeoutMs?: number;
  idleDisconnectTimeoutMs?: number;
};

export type WindieDesktopTestingOptions = {
  WebSocketImpl?: WebSocketConstructor;
  fetchImpl?: FetchLike;
  sidecar?: WindieLocalRuntimeClient;
  localRuntime?: WindieLocalRuntimeClient;
  autoStartLocalRuntime?: boolean;
};

export type WindieDesktopAgentStartOptions = Pick<
  WindieWakeUpOptions,
  | 'agentId'
  | 'builtins'
  | 'mcps'
  | 'model'
  | 'memory'
  | 'operatingSystem'
  | 'persistence'
  | 'plugins'
  | 'skills'
  | 'systemPrompt'
  | 'tools'
> & {
  apiKey?: string;
  appName?: string;
  endpoint?: WindieDesktopEndpoint;
  debug?: WindieDesktopDebugOptions;
  connection?: WindieDesktopConnectionOptions;
  testing?: WindieDesktopTestingOptions;
  workspace?: string;
  workspacePath?: string;
  store?: ConversationStore;
};

export type WindieDesktopAgentOptions = {
  agent?: Pick<
    WindieAgent,
    | 'compactHistory'
    | 'conversation'
    | 'ensureConnected'
    | 'getDefaultConversationStore'
    | 'isConnected'
    | 'listModels'
    | 'noteBackendTraffic'
    | 'requestModelList'
    | 'rehydrateConversation'
    | 'shutdownLocalRuntime'
    | 'sleep'
    | 'stop'
    | 'status'
    | 'subscribeRawBackendEvents'
    | 'syncBackendIdleTimer'
    | 'updateSettings'
    | 'wakewordDetected'
  > | null;
  runtime: SdkConversationRuntime;
  store?: ConversationStore;
  conversationRef: string;
  workspacePath?: string | null;
  initialConnectionEvents?: WindieDesktopConnectionEvent[];
  initialFallbackEvents?: WindieDesktopFallbackEvent[];
  initialTrafficEvents?: WindieDesktopTrafficEvent[];
};

type RowsListener = (rows: SdkDisplayRow[]) => void;
type EventListener = (event: ConversationEvent, snapshot: ConversationSnapshot) => void;
type CurrentTurnListener = (currentTurn: CurrentTurnProjection, snapshot: ConversationSnapshot) => void;
type StatusListener = (status: WindieDesktopAgentStatus) => void;
type BackendEventListener = Parameters<WindieAgent['subscribeRawBackendEvents']>[0];
export type WindieDesktopConnectionEvent =
  | { type: 'open'; socket: WebSocketLike; handshake: JsonRecord }
  | {
    type: 'close';
    opened: boolean;
    closeReason: string | null;
    shouldReconnect: boolean;
    fallbackScheduled: boolean;
  }
  | { type: 'error'; error: unknown; opened: boolean; socket: WebSocketLike }
  | { type: 'handshake-error'; error: unknown }
  | { type: 'message-error'; error: unknown };
export type WindieDesktopFallbackEvent = WindieManagedBackendEndpoint;
export type WindieDesktopTrafficEvent = {
  type: string;
};
type ConnectionListener = (event: WindieDesktopConnectionEvent) => void;
type FallbackListener = (event: WindieDesktopFallbackEvent) => void;
type TrafficListener = (event: WindieDesktopTrafficEvent) => void;

function normalizeSendInput(input: string | SendInput): SendInput {
  return typeof input === 'string' ? { text: input } : input;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function normalizeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return undefined;
    }
    url.search = '';
    url.hash = '';
    if (!url.pathname || url.pathname === '/') {
      url.pathname = '/';
      return trimTrailingSlash(url.toString());
    }
    url.pathname = trimTrailingSlash(url.pathname);
    return url.toString();
  } catch {
    return undefined;
  }
}

function normalizeWsUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
      return undefined;
    }
    url.search = '';
    url.hash = '';
    url.pathname = trimTrailingSlash(url.pathname || '/');
    return url.toString();
  } catch {
    return undefined;
  }
}

function deriveWsFromHttp(httpUrl: string): string {
  const url = new URL(httpUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws';
  url.search = '';
  url.hash = '';
  return trimTrailingSlash(url.toString());
}

function deriveHttpFromWs(wsUrl: string): string {
  const url = new URL(wsUrl);
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.search = '';
  url.hash = '';
  const path = trimTrailingSlash(url.pathname || '/');
  url.pathname = path === '/ws' ? '/' : path;
  return trimTrailingSlash(url.toString());
}

function normalizeDesktopEndpoint(endpoint?: WindieDesktopEndpoint): WindieManagedBackendEndpoint | undefined {
  if (!endpoint) {
    return undefined;
  }
  if (typeof endpoint === 'string') {
    const backendUrl = normalizeHttpUrl(endpoint);
    const wsUrl = normalizeWsUrl(endpoint);
    if (!backendUrl && !wsUrl) {
      return undefined;
    }
    const httpBaseUrl = backendUrl ?? deriveHttpFromWs(wsUrl as string);
    return {
      backendUrl: httpBaseUrl,
      httpBaseUrl,
      wsUrl: wsUrl ?? deriveWsFromHttp(httpBaseUrl),
      wsOrigin: httpBaseUrl,
    };
  }

  if (endpoint.primary) {
    return normalizeDesktopEndpoint(endpoint.primary);
  }

  const backendUrl = normalizeHttpUrl(endpoint.backendUrl)
    ?? normalizeHttpUrl(endpoint.httpBaseUrl)
    ?? normalizeHttpUrl(endpoint.httpUrl);
  const wsUrl = normalizeWsUrl(endpoint.wsUrl);
  if (!backendUrl && !wsUrl) {
    return undefined;
  }
  const httpBaseUrl = backendUrl ?? deriveHttpFromWs(wsUrl as string);
  return {
    backendUrl: httpBaseUrl,
    httpBaseUrl,
    wsUrl: wsUrl ?? deriveWsFromHttp(httpBaseUrl),
    wsOrigin: normalizeHttpUrl(endpoint.wsOrigin) ?? httpBaseUrl,
  };
}

function normalizeDesktopEndpointCandidates(
  endpoint?: WindieDesktopEndpoint,
  candidates?: WindieDesktopEndpoint[],
): WindieManagedBackendEndpoint[] | undefined {
  const nestedCandidates = endpoint && typeof endpoint === 'object' && Array.isArray(endpoint.fallbacks)
    ? endpoint.fallbacks
    : [];
  const all = [
    normalizeDesktopEndpoint(endpoint),
    ...nestedCandidates.map(normalizeDesktopEndpoint),
    ...(Array.isArray(candidates) ? candidates.map(normalizeDesktopEndpoint) : []),
  ].filter((item): item is WindieManagedBackendEndpoint => Boolean(item));
  const seen = new Set<string>();
  const normalized: WindieManagedBackendEndpoint[] = [];
  for (const item of all) {
    const key = `${item.backendUrl ?? item.httpBaseUrl ?? ''}::${item.wsUrl ?? ''}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(item);
  }
  return normalized.length > 0 ? normalized : undefined;
}

function resolveProcessEnv(): Record<string, string | undefined> {
  return (globalThis as unknown as {
    process?: { env?: Record<string, string | undefined> };
  }).process?.env ?? {};
}

function resolveEnvDesktopEndpointCandidates(): WindieDesktopEndpoint[] | undefined {
  const env = resolveProcessEnv();
  const explicitHttpUrl = normalizeHttpUrl(env.BACKEND_HTTP_URL);
  const explicitWsUrl = normalizeWsUrl(env.BACKEND_WS_URL);
  if (explicitHttpUrl || explicitWsUrl) {
    return [{
      httpUrl: explicitHttpUrl,
      wsUrl: explicitWsUrl,
    }];
  }
  if (typeof env.BACKEND_HOST === 'string' || typeof env.BACKEND_PORT === 'string') {
    const host = env.BACKEND_HOST || '127.0.0.1';
    const port = env.BACKEND_PORT || '8765';
    return [{
      httpUrl: `http://${host}:${port}`,
      wsUrl: `ws://${host}:${port}/ws`,
    }];
  }
  const defaultHttpUrl = normalizeHttpUrl(env.WINDIE_DEFAULT_BACKEND_HTTP_URL);
  const defaultWsUrl = normalizeWsUrl(env.WINDIE_DEFAULT_BACKEND_WS_URL);
  if (defaultHttpUrl || defaultWsUrl) {
    return [{
      httpUrl: defaultHttpUrl,
      wsUrl: defaultWsUrl,
    }];
  }
  return undefined;
}

function buildDesktopInstallAuth(options: {
  apiKey?: string;
  installToken?: string;
  installAuth?: WindieInstallAuthOptions;
}): WindieInstallAuthOptions | undefined {
  if (options.installAuth) {
    return options.installAuth;
  }
  const installToken = options.installToken ?? options.apiKey;
  if (!installToken) {
    return undefined;
  }
  return {
    installToken,
    autoRegister: false,
  };
}

function statusFromTerminalEvent(
  event: ConversationEvent,
  workspacePath?: string | null,
): WindieDesktopAgentStatus | null {
  if (event.type === 'turn_completed') {
    return {
      phase: 'ready',
      conversationRef: event.conversationRef,
      turnRef: event.turnRef,
      workspacePath,
    };
  }
  if (event.type === 'turn_stopped') {
    return {
      phase: 'stopped',
      conversationRef: event.conversationRef,
      turnRef: event.turnRef,
      workspacePath,
    };
  }
  if (event.type === 'turn_error' || event.type === 'runtime_error') {
    const error = typeof event.payload.error === 'string'
      ? event.payload.error
      : null;
    return {
      phase: 'error',
      conversationRef: event.conversationRef,
      turnRef: event.turnRef,
      workspacePath,
      error,
    };
  }
  return null;
}

export class WindieDesktopAgent {
  private readonly rowsListeners = new Set<RowsListener>();
  private readonly eventListeners = new Set<EventListener>();
  private readonly currentTurnListeners = new Set<CurrentTurnListener>();
  private readonly statusListeners = new Set<StatusListener>();
  private readonly connectionListeners = new Set<ConnectionListener>();
  private readonly fallbackListeners = new Set<FallbackListener>();
  private readonly trafficListeners = new Set<TrafficListener>();
  private detachEvents: () => void;
  private runtime: SdkConversationRuntime;
  private conversationRef: string;
  private currentStatus: WindieDesktopAgentStatus;
  private lastConnectionEvent: WindieDesktopConnectionEvent | null = null;
  private lastFallbackEvent: WindieDesktopFallbackEvent | null = null;
  private lastTrafficEvent: WindieDesktopTrafficEvent | null = null;
  private closed = false;

  constructor(private readonly options: WindieDesktopAgentOptions) {
    this.runtime = options.runtime;
    this.conversationRef = options.conversationRef;
    this.currentStatus = {
      phase: 'ready',
      conversationRef: this.conversationRef,
      workspacePath: options.workspacePath ?? null,
    };
    this.detachEvents = this.attachRuntime(this.runtime);
    for (const event of options.initialConnectionEvents ?? []) {
      this.recordConnectionEvent(event);
    }
    for (const event of options.initialFallbackEvents ?? []) {
      this.recordFallbackEvent(event);
    }
    for (const event of options.initialTrafficEvents ?? []) {
      this.recordTrafficEvent(event);
    }
  }

  private attachRuntime(runtime: SdkConversationRuntime): () => void {
    return runtime.subscribeEvents((event, snapshot) => {
      this.emitConversationEvent(event, snapshot);
      this.emitRows(buildDisplayRows([event]));
      this.emitCurrentTurn(snapshot.currentTurn, snapshot);
      const terminalStatus = statusFromTerminalEvent(event, this.options.workspacePath);
      if (terminalStatus) {
        this.setStatus(terminalStatus);
      }
    });
  }

  private resolveInputConversationRef(input: (Partial<SendInput> & { conversation_ref?: unknown }) | undefined): string {
    const payload = input && 'payload' in input ? input.payload : undefined;
    const fromPayload = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload.conversation_ref
      : undefined;
    const direct = (input as { conversation_ref?: unknown } | undefined)?.conversation_ref;
    const value = typeof fromPayload === 'string' && fromPayload.trim()
      ? fromPayload.trim()
      : (typeof direct === 'string' && direct.trim() ? direct.trim() : '');
    return value || this.conversationRef;
  }

  private useConversation(conversationRef: string): SdkConversationRuntime {
    if (conversationRef === this.conversationRef) {
      return this.runtime;
    }
    if (!this.options.agent?.conversation) {
      throw new Error('WindieDesktopAgent cannot switch conversations without a started WindieAgent');
    }
    this.detachEvents();
    this.runtime.close();
    this.conversationRef = conversationRef;
    this.runtime = this.options.agent.conversation({
      conversationRef,
      store: this.options.store,
    });
    this.detachEvents = this.attachRuntime(this.runtime);
    this.setStatus({
      phase: 'ready',
      conversationRef,
      workspacePath: this.options.workspacePath ?? null,
    });
    return this.runtime;
  }

  private recordConnectionEvent(event: WindieDesktopConnectionEvent): void {
    this.lastConnectionEvent = event;
    this.connectionListeners.forEach(listener => listener(event));
  }

  private recordFallbackEvent(event: WindieDesktopFallbackEvent): void {
    this.lastFallbackEvent = event;
    this.fallbackListeners.forEach(listener => listener(event));
  }

  private recordTrafficEvent(event: WindieDesktopTrafficEvent): void {
    this.lastTrafficEvent = event;
    this.trafficListeners.forEach(listener => listener(event));
  }

  static async start(options: WindieDesktopAgentStartOptions): Promise<WindieDesktopAgent> {
    const {
      apiKey,
      appName,
      connection,
      debug,
      endpoint,
      testing,
      workspace,
      workspacePath: explicitWorkspacePath,
      store,
      ...clientAndWakeOptions
    } = options;
    const legacyClientOptions = clientAndWakeOptions as WindieClientOptions & WindieWakeUpOptions;
    const initialConnectionEvents: WindieDesktopConnectionEvent[] = [];
    const initialFallbackEvents: WindieDesktopFallbackEvent[] = [];
    const initialTrafficEvents: WindieDesktopTrafficEvent[] = [];
    let desktopAgent: WindieDesktopAgent | null = null;
    const emitConnection = (event: WindieDesktopConnectionEvent): void => {
      if (desktopAgent) {
        desktopAgent.recordConnectionEvent(event);
      } else {
        initialConnectionEvents.push(event);
      }
    };
    const emitFallback = (event: WindieDesktopFallbackEvent): void => {
      if (desktopAgent) {
        desktopAgent.recordFallbackEvent(event);
      } else {
        initialFallbackEvents.push(event);
      }
    };
    const emitTraffic = (event: WindieDesktopTrafficEvent): void => {
      if (desktopAgent) {
        desktopAgent.recordTrafficEvent(event);
      } else {
        initialTrafficEvents.push(event);
      }
    };
    const workspacePath = explicitWorkspacePath ?? workspace;
    const envEndpointCandidates = endpoint ? undefined : resolveEnvDesktopEndpointCandidates();
    const envPrimaryEndpoint = envEndpointCandidates?.[0];
    const normalizedEndpoint = normalizeDesktopEndpoint(endpoint ?? envPrimaryEndpoint);
    const normalizedEndpoints = normalizeDesktopEndpointCandidates(
      endpoint ?? envPrimaryEndpoint,
      envEndpointCandidates?.slice(1),
    );
    const backendUrl = legacyClientOptions.backendUrl
      ?? legacyClientOptions.httpBaseUrl
      ?? normalizedEndpoint?.backendUrl
      ?? normalizedEndpoint?.httpBaseUrl
      ?? 'https://api.windieos.com';
    const installToken = legacyClientOptions.installToken ?? apiKey;
    const installAuth = buildDesktopInstallAuth({
      apiKey,
      installToken: legacyClientOptions.installToken,
      installAuth: legacyClientOptions.installAuth,
    });
    const client = new WindieClient({
      ...clientAndWakeOptions,
      backendUrl,
      httpBaseUrl: legacyClientOptions.httpBaseUrl ?? normalizedEndpoint?.httpBaseUrl ?? backendUrl,
      wsUrl: legacyClientOptions.wsUrl ?? normalizedEndpoint?.wsUrl,
      wsOrigin: legacyClientOptions.wsOrigin ?? normalizedEndpoint?.wsOrigin ?? backendUrl,
      backendEndpoints: legacyClientOptions.backendEndpoints ?? normalizedEndpoints,
      backendSession: legacyClientOptions.backendSession ?? 'managed',
      reconnectIntervalMs: connection?.reconnectIntervalMs ?? legacyClientOptions.reconnectIntervalMs,
      connectTimeoutMs: connection?.connectTimeoutMs ?? legacyClientOptions.connectTimeoutMs,
      idleDisconnectTimeoutMs: connection?.idleDisconnectTimeoutMs ?? legacyClientOptions.idleDisconnectTimeoutMs,
      log: debug?.log ?? legacyClientOptions.log,
      fetchImpl: testing?.fetchImpl ?? legacyClientOptions.fetchImpl,
      WebSocketImpl: testing?.WebSocketImpl ?? legacyClientOptions.WebSocketImpl,
      sidecar: testing?.sidecar ?? legacyClientOptions.sidecar,
      localRuntime: testing?.localRuntime ?? legacyClientOptions.localRuntime,
      installToken,
      installAuth,
      autoStartLocalRuntime: testing?.autoStartLocalRuntime ?? legacyClientOptions.autoStartLocalRuntime ?? true,
      onBackendOpen: payload => {
        emitConnection({ type: 'open', ...payload });
        legacyClientOptions.onBackendOpen?.(payload);
      },
      onBackendClose: payload => {
        emitConnection({ type: 'close', ...payload });
        legacyClientOptions.onBackendClose?.(payload);
      },
      onBackendError: payload => {
        emitConnection({ type: 'error', ...payload });
        legacyClientOptions.onBackendError?.(payload);
      },
      onBackendHandshakeError: error => {
        emitConnection({ type: 'handshake-error', error });
        legacyClientOptions.onBackendHandshakeError?.(error);
      },
      onBackendMessageError: error => {
        emitConnection({ type: 'message-error', error });
        legacyClientOptions.onBackendMessageError?.(error);
      },
      onBackendSend: type => {
        emitTraffic({ type });
        legacyClientOptions.onBackendSend?.(type);
      },
      onBackendFallback: endpoint => {
        emitFallback(endpoint);
        legacyClientOptions.onBackendFallback?.(endpoint);
      },
    });
    const agent = await client.wakeUp({
      ...clientAndWakeOptions,
      backendUrl,
      installToken,
      installAuth,
      name: appName ?? 'Windie Desktop Agent',
      workspacePath,
      builtins: clientAndWakeOptions.builtins ?? 'default',
    });
    const conversationRef = `conv-${agent.id}`;
    const conversationStore = store ?? agent.getDefaultConversationStore();
    const runtime = agent.conversation({
      conversationRef,
      store: conversationStore,
    });
    desktopAgent = new WindieDesktopAgent({
      agent,
      runtime,
      store: conversationStore,
      conversationRef,
      workspacePath,
      initialConnectionEvents,
      initialFallbackEvents,
      initialTrafficEvents,
    });
    return desktopAgent;
  }

  onRows(listener: RowsListener): () => void {
    this.rowsListeners.add(listener);
    return () => {
      this.rowsListeners.delete(listener);
    };
  }

  onConversationEvent(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  onCurrentTurn(listener: CurrentTurnListener): () => void {
    this.currentTurnListeners.add(listener);
    return () => {
      this.currentTurnListeners.delete(listener);
    };
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.currentStatus);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  onConnection(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    if (this.lastConnectionEvent) {
      listener(this.lastConnectionEvent);
    }
    return () => {
      this.connectionListeners.delete(listener);
    };
  }

  onBackendFallback(listener: FallbackListener): () => void {
    this.fallbackListeners.add(listener);
    if (this.lastFallbackEvent) {
      listener(this.lastFallbackEvent);
    }
    return () => {
      this.fallbackListeners.delete(listener);
    };
  }

  onTraffic(listener: TrafficListener): () => void {
    this.trafficListeners.add(listener);
    if (this.lastTrafficEvent) {
      listener(this.lastTrafficEvent);
    }
    return () => {
      this.trafficListeners.delete(listener);
    };
  }

  onBackendEvent(listener: BackendEventListener): () => void {
    return this.options.agent?.subscribeRawBackendEvents?.(listener) ?? (() => {});
  }

  async run(input: string | SendInput): Promise<TurnResult> {
    const sendInput = normalizeSendInput(input);
    const runtime = this.useConversation(this.resolveInputConversationRef(sendInput));
    this.setStatus({
      phase: 'running',
      conversationRef: this.conversationRef,
      turnRef: sendInput.turnRef ?? null,
      workspacePath: this.options.workspacePath ?? null,
    });
    const result = await runtime.send(sendInput);
    this.setStatus({
      phase: 'running',
      conversationRef: this.conversationRef,
      turnRef: result.turnRef,
      workspacePath: this.options.workspacePath ?? null,
    });
    return result;
  }

  async stop(input?: string | null | { conversation_ref?: string | null; turn_ref?: string | null }): Promise<string | void> {
    const conversationRef = typeof input === 'object' && input?.conversation_ref
      ? input.conversation_ref
      : this.conversationRef;
    const turnRef = typeof input === 'string'
      ? input
      : (typeof input === 'object' ? input?.turn_ref : null);
    const runtime = this.useConversation(conversationRef || this.conversationRef);
    if (this.options.agent?.stop) {
      return this.options.agent.stop(conversationRef || this.conversationRef);
    }
    await runtime.stop(turnRef ?? null);
    return undefined;
  }

  async load(): Promise<ConversationSnapshot> {
    return this.runtime.load();
  }

  async ensureConnected(): Promise<void> {
    if (this.options.agent?.ensureConnected) {
      await this.options.agent.ensureConnected();
      return;
    }
    await this.runtime.ensureConnected();
  }

  isConnected(): boolean {
    return this.options.agent?.isConnected?.() ?? false;
  }

  async updateSettings(payload: SettingsPayload): Promise<string | void> {
    if (this.options.agent?.updateSettings) {
      return this.options.agent.updateSettings(payload);
    }
    return this.runtime.updateSettings(payload);
  }

  async listModels(): Promise<SdkModelsResponse> {
    if (!this.options.agent?.listModels) {
      throw new Error('WindieDesktopAgent.listModels requires a started WindieAgent');
    }
    return this.options.agent.listModels();
  }

  async requestModelList(): Promise<string | void> {
    if (this.options.agent?.requestModelList) {
      return this.options.agent.requestModelList();
    }
    return this.runtime.requestModelList();
  }

  async rehydrate(payload?: RehydratePayload): Promise<ConversationSnapshot['rehydrate'] | void> {
    if (payload) {
      this.useConversation(this.resolveInputConversationRef(payload));
      await this.runtime.rehydrateMessages(payload);
      return undefined;
    }
    return this.runtime.rehydrate();
  }

  async rehydrateMessages(payload: RehydratePayload): Promise<void> {
    this.useConversation(this.resolveInputConversationRef(payload));
    await this.runtime.rehydrateMessages(payload);
  }

  async compactHistory(input: CompactHistoryPayload = {}): Promise<string | void> {
    this.useConversation(this.resolveInputConversationRef(input));
    return this.runtime.compactHistory({
      force: input.force,
      payload: input,
    });
  }

  async wakewordDetected(payload: WakewordPayload = {}): Promise<string | void> {
    if (this.options.agent?.wakewordDetected) {
      return this.options.agent.wakewordDetected(payload);
    }
    return this.runtime.wakewordDetected(payload);
  }

  noteBackendTraffic(reason = 'traffic'): void {
    this.options.agent?.noteBackendTraffic?.(reason);
  }

  syncBackendIdleTimer(reason = 'idle-sync'): void {
    this.options.agent?.syncBackendIdleTimer?.(reason);
  }

  async localStatus(): Promise<JsonRecord | null> {
    return this.options.agent?.status ? this.options.agent.status() : null;
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.detachEvents();
    this.runtime.close();
    this.options.agent?.sleep();
    this.setStatus({
      phase: 'closed',
      conversationRef: this.conversationRef,
      workspacePath: this.options.workspacePath ?? null,
    });
  }

  async shutdown(): Promise<void> {
    this.close();
    await this.options.agent?.shutdownLocalRuntime();
  }

  private emitRows(rows: SdkDisplayRow[]): void {
    if (rows.length === 0) {
      return;
    }
    this.rowsListeners.forEach(listener => listener(rows));
  }

  private emitConversationEvent(event: ConversationEvent, snapshot: ConversationSnapshot): void {
    this.eventListeners.forEach(listener => listener(event, snapshot));
  }

  private emitCurrentTurn(currentTurn: CurrentTurnProjection, snapshot: ConversationSnapshot): void {
    this.currentTurnListeners.forEach(listener => listener(currentTurn, snapshot));
  }

  private setStatus(status: WindieDesktopAgentStatus): void {
    this.currentStatus = status;
    this.statusListeners.forEach(listener => listener(status));
  }
}
