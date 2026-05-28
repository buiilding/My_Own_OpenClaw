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
  type WindieClientOptions,
  type WindieWakeUpOptions,
} from './WindieClient.js';

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

export type WindieDesktopAgentStartOptions = WindieClientOptions & Omit<WindieWakeUpOptions, 'workspacePath' | 'name'> & {
  apiKey?: string;
  appName?: string;
  workspace?: string;
  workspacePath?: string;
  store?: ConversationStore;
};

export type WindieDesktopAgentOptions = {
  agent?: Pick<
    WindieAgent,
    | 'compactHistory'
    | 'ensureConnected'
    | 'isConnected'
    | 'listModels'
    | 'requestModelList'
    | 'rehydrateConversation'
    | 'shutdownLocalRuntime'
    | 'sleep'
    | 'status'
    | 'updateSettings'
    | 'wakewordDetected'
  > | null;
  runtime: SdkConversationRuntime;
  conversationRef: string;
  workspacePath?: string | null;
};

type RowsListener = (rows: SdkDisplayRow[]) => void;
type EventListener = (event: ConversationEvent, snapshot: ConversationSnapshot) => void;
type CurrentTurnListener = (currentTurn: CurrentTurnProjection, snapshot: ConversationSnapshot) => void;
type StatusListener = (status: WindieDesktopAgentStatus) => void;

function normalizeSendInput(input: string | SendInput): SendInput {
  return typeof input === 'string' ? { text: input } : input;
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
  private readonly detachEvents: () => void;
  private currentStatus: WindieDesktopAgentStatus;
  private closed = false;

  constructor(private readonly options: WindieDesktopAgentOptions) {
    this.currentStatus = {
      phase: 'ready',
      conversationRef: options.conversationRef,
      workspacePath: options.workspacePath ?? null,
    };
    this.detachEvents = options.runtime.subscribeEvents((event, snapshot) => {
      this.emitConversationEvent(event, snapshot);
      this.emitRows(buildDisplayRows([event]));
      this.emitCurrentTurn(snapshot.currentTurn, snapshot);
      const terminalStatus = statusFromTerminalEvent(event, options.workspacePath);
      if (terminalStatus) {
        this.setStatus(terminalStatus);
      }
    });
  }

  static async start(options: WindieDesktopAgentStartOptions): Promise<WindieDesktopAgent> {
    const {
      apiKey,
      appName,
      workspace,
      workspacePath: explicitWorkspacePath,
      store,
      ...clientAndWakeOptions
    } = options;
    const workspacePath = explicitWorkspacePath ?? workspace;
    const client = new WindieClient({
      ...clientAndWakeOptions,
      installToken: clientAndWakeOptions.installToken ?? apiKey,
      autoStartLocalRuntime: clientAndWakeOptions.autoStartLocalRuntime ?? true,
    });
    const agent = await client.wakeUp({
      ...clientAndWakeOptions,
      installToken: clientAndWakeOptions.installToken ?? apiKey,
      name: appName ?? 'Windie Desktop Agent',
      workspacePath,
      builtins: clientAndWakeOptions.builtins ?? 'default',
    });
    const conversationRef = clientAndWakeOptions.conversationRef ?? `conv-${agent.id}`;
    const runtime = agent.conversation({
      conversationRef,
      store: store ?? new InMemoryConversationStore(),
    });
    return new WindieDesktopAgent({
      agent,
      runtime,
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

  async run(input: string | SendInput): Promise<TurnResult> {
    const sendInput = normalizeSendInput(input);
    this.setStatus({
      phase: 'running',
      conversationRef: this.options.conversationRef,
      turnRef: sendInput.turnRef ?? null,
      workspacePath: this.options.workspacePath ?? null,
    });
    const result = await this.options.runtime.send(sendInput);
    this.setStatus({
      phase: 'running',
      conversationRef: this.options.conversationRef,
      turnRef: result.turnRef,
      workspacePath: this.options.workspacePath ?? null,
    });
    return result;
  }

  async stop(turnRef?: string | null): Promise<void> {
    await this.options.runtime.stop(turnRef ?? null);
  }

  async load(): Promise<ConversationSnapshot> {
    return this.options.runtime.load();
  }

  async ensureConnected(): Promise<void> {
    if (this.options.agent?.ensureConnected) {
      await this.options.agent.ensureConnected();
      return;
    }
    await this.options.runtime.ensureConnected();
  }

  isConnected(): boolean {
    return this.options.agent?.isConnected?.() ?? false;
  }

  async updateSettings(payload: SettingsPayload): Promise<string | void> {
    if (this.options.agent?.updateSettings) {
      return this.options.agent.updateSettings(payload);
    }
    return this.options.runtime.updateSettings(payload);
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
    return this.options.runtime.requestModelList();
  }

  async rehydrate(payload?: RehydratePayload): Promise<ConversationSnapshot['rehydrate'] | void> {
    if (payload) {
      await this.options.runtime.rehydrateMessages(payload);
      return undefined;
    }
    return this.options.runtime.rehydrate();
  }

  async rehydrateMessages(payload: RehydratePayload): Promise<void> {
    await this.options.runtime.rehydrateMessages(payload);
  }

  async compactHistory(input: CompactHistoryPayload = {}): Promise<string | void> {
    return this.options.runtime.compactHistory({
      force: input.force,
      payload: input,
    });
  }

  async wakewordDetected(payload: WakewordPayload = {}): Promise<string | void> {
    if (this.options.agent?.wakewordDetected) {
      return this.options.agent.wakewordDetected(payload);
    }
    return this.options.runtime.wakewordDetected(payload);
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
    this.options.runtime.close();
    this.options.agent?.sleep();
    this.setStatus({
      phase: 'closed',
      conversationRef: this.options.conversationRef,
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
