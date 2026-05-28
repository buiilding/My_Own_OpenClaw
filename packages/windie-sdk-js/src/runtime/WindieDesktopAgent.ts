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
import { InMemoryConversationStore } from '../stores/InMemoryConversationStore.js';
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
  backendUrl?: string;
  httpUrl?: string;
  httpBaseUrl?: string;
  wsUrl?: string;
  wsOrigin?: string;
};

export type WindieDesktopAgentStartOptions = WindieClientOptions & Omit<WindieWakeUpOptions, 'workspacePath' | 'name' | 'userId'> & {
  apiKey?: string;
  appName?: string;
  endpoint?: WindieDesktopEndpoint;
  endpointCandidates?: WindieDesktopEndpoint[];
  installId?: string;
  userId?: string;
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
};

type RowsListener = (rows: SdkDisplayRow[]) => void;
type EventListener = (event: ConversationEvent, snapshot: ConversationSnapshot) => void;
type CurrentTurnListener = (currentTurn: CurrentTurnProjection, snapshot: ConversationSnapshot) => void;
type StatusListener = (status: WindieDesktopAgentStatus) => void;
type BackendEventListener = Parameters<WindieAgent['subscribeRawBackendEvents']>[0];

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
  const all = [
    normalizeDesktopEndpoint(endpoint),
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

function buildDesktopInstallAuth(options: {
  apiKey?: string;
  installId?: string;
  installToken?: string;
  installAuth?: WindieInstallAuthOptions;
  userId?: string;
  defaultUserId?: string;
}): WindieInstallAuthOptions | undefined {
  if (options.installAuth) {
    return options.installAuth;
  }
  const installToken = options.installToken ?? options.apiKey;
  const userId = options.userId ?? options.defaultUserId;
  if (!installToken && !userId && !options.installId) {
    return undefined;
  }
  return {
    installToken,
    userId,
    installId: options.installId,
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
  private detachEvents: () => void;
  private runtime: SdkConversationRuntime;
  private conversationRef: string;
  private currentStatus: WindieDesktopAgentStatus;
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

  static async start(options: WindieDesktopAgentStartOptions): Promise<WindieDesktopAgent> {
    const {
      apiKey,
      appName,
      endpoint,
      endpointCandidates,
      installId,
      userId,
      workspace,
      workspacePath: explicitWorkspacePath,
      store,
      ...clientAndWakeOptions
    } = options;
    const workspacePath = explicitWorkspacePath ?? workspace;
    const normalizedEndpoint = normalizeDesktopEndpoint(endpoint);
    const normalizedEndpoints = normalizeDesktopEndpointCandidates(endpoint, endpointCandidates);
    const backendUrl = clientAndWakeOptions.backendUrl
      ?? clientAndWakeOptions.httpBaseUrl
      ?? normalizedEndpoint?.backendUrl
      ?? normalizedEndpoint?.httpBaseUrl;
    const installToken = clientAndWakeOptions.installToken ?? apiKey;
    const installAuth = buildDesktopInstallAuth({
      apiKey,
      installId,
      installToken: clientAndWakeOptions.installToken,
      installAuth: clientAndWakeOptions.installAuth,
      userId,
      defaultUserId: clientAndWakeOptions.defaultUserId,
    });
    const client = new WindieClient({
      ...clientAndWakeOptions,
      backendUrl,
      httpBaseUrl: clientAndWakeOptions.httpBaseUrl ?? normalizedEndpoint?.httpBaseUrl ?? backendUrl,
      wsUrl: clientAndWakeOptions.wsUrl ?? normalizedEndpoint?.wsUrl,
      wsOrigin: clientAndWakeOptions.wsOrigin ?? normalizedEndpoint?.wsOrigin,
      backendEndpoints: clientAndWakeOptions.backendEndpoints ?? normalizedEndpoints,
      backendSession: clientAndWakeOptions.backendSession ?? 'managed',
      defaultUserId: clientAndWakeOptions.defaultUserId ?? userId,
      installToken,
      installAuth,
      autoStartLocalRuntime: clientAndWakeOptions.autoStartLocalRuntime ?? true,
    });
    const agent = await client.wakeUp({
      ...clientAndWakeOptions,
      backendUrl,
      userId: userId ?? clientAndWakeOptions.defaultUserId,
      installToken,
      installAuth,
      name: appName ?? 'Windie Desktop Agent',
      workspacePath,
      builtins: clientAndWakeOptions.builtins ?? 'default',
    });
    const conversationRef = clientAndWakeOptions.conversationRef ?? `conv-${agent.id}`;
    const conversationStore = store ?? new InMemoryConversationStore();
    const runtime = agent.conversation({
      conversationRef,
      store: conversationStore,
    });
    return new WindieDesktopAgent({
      agent,
      runtime,
      store: conversationStore,
      conversationRef,
      workspacePath,
    });
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
