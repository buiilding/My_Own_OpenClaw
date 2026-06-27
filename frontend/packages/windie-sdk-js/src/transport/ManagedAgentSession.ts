/**
 * Provides managed hosted agent session transport for the TypeScript SDK runtime.
 */

import {
  isBackendEvent,
  type BackendEvent,
  type BackendEventType,
} from '../events/backendEvents.js';
import type { JsonRecord } from '../conversation/types.js';
import {
  deriveWsUrl,
  buildAgentSessionHandshake,
  rejectRemovedStopInputAliases,
  resolveWebSocketImplementation,
  type WebSocketConstructor,
  type WebSocketLike,
  type AgentQueryInput,
  type AgentStopInput,
  type AgentSessionRuntime,
} from './AgentSession.js';
import {
  createManagedWebSocketSession,
  type ManagedWebSocketSession,
} from './ManagedWebSocketSession.js';
import { createAgentBackendSocket } from './BackendSocketFactory.js';
import { filterBackendPayload } from './backendPayloadContract.js';

type AgentSessionEventMap = {
  open: void;
  close: { code?: number; reason?: string; wasClean?: boolean };
  'socket-error': unknown;
  message: unknown;
  event: BackendEvent;
} & {
  [K in BackendEventType]: Extract<BackendEvent, { type: K }>;
};

type AgentSessionEventName = keyof AgentSessionEventMap;
type AgentSessionListener<T> = (payload: T) => void;

export type ManagedAgentBackendEndpoint = {
  backendUrl?: string;
  httpBaseUrl?: string;
  wsUrl?: string;
  wsOrigin?: string;
  headers?: Record<string, string>;
};

export type ManagedAgentSessionOptions = {
  backendUrl: string;
  wsUrl?: string;
  wsOrigin?: string;
  WebSocketImpl?: WebSocketConstructor;
  headers?: Record<string, string>;
  endpoints?: ManagedAgentBackendEndpoint[];
  userId: string;
  operatingSystem?: string;
  agentDefinition?: JsonRecord;
  normalizePayload?: (type: string, payload: JsonRecord) => JsonRecord;
  createMessageId?: () => string;
  reconnectIntervalMs?: number;
  connectTimeoutMs?: number;
  idleDisconnectTimeoutMs?: number;
  shouldHoldOpen?: () => boolean;
  beforeConnect?: (payload: { reason: string }) => Promise<void> | void;
  log?: (message: string) => void;
  onOpen?: (payload: { socket: WebSocketLike; handshake: JsonRecord }) => void;
  onSocketChange?: (socket: WebSocketLike | null) => void;
  onClose?: (payload: {
    opened: boolean;
    closeReason: string | null;
    shouldReconnect: boolean;
    reconnectScheduled: boolean;
  }) => void;
  onError?: (payload: { error: unknown; opened: boolean; socket: WebSocketLike }) => void;
  onHandshakeError?: (error: unknown) => void;
  onMessageError?: (error: unknown) => void;
  onSend?: (type: string) => void;
  onFallback?: (endpoint: ManagedAgentBackendEndpoint) => void;
};

function resolveEndpointWsUrl(endpoint: ManagedAgentBackendEndpoint): string {
  if (endpoint.wsUrl) {
    return endpoint.wsUrl.replace(/\/+$/, '');
  }
  const backendUrl = endpoint.backendUrl ?? endpoint.httpBaseUrl;
  if (!backendUrl) {
    throw new Error('Managed agent endpoint requires backendUrl or wsUrl');
  }
  return deriveWsUrl(backendUrl);
}

export class ManagedAgentSession implements AgentSessionRuntime {
  private readonly listeners = new Map<AgentSessionEventName, Set<AgentSessionListener<unknown>>>();
  private readonly endpoints: ManagedAgentBackendEndpoint[];
  private activeEndpointIndex = 0;
  private readonly session: ManagedWebSocketSession;

  constructor(options: ManagedAgentSessionOptions) {
    this.endpoints = normalizeEndpoints(options);
    const WebSocketImpl = resolveWebSocketImplementation(options.WebSocketImpl);
    this.session = createManagedWebSocketSession({
      createSocket: () => {
        const endpoint = this.currentEndpoint();
        return createAgentBackendSocket({
          WebSocketImpl,
          wsUrl: resolveEndpointWsUrl(endpoint),
          wsOrigin: endpoint.wsOrigin,
          headers: {
            ...(options.headers ?? {}),
            ...(endpoint.headers ?? {}),
          },
        });
      },
      buildHandshake: () => buildAgentSessionHandshake({
        userId: options.userId,
        operatingSystem: options.operatingSystem,
        agentDefinition: options.agentDefinition,
      }),
      getUserId: () => options.userId,
      normalizePayload: options.normalizePayload ?? filterBackendPayload,
      createMessageId: options.createMessageId,
      reconnectIntervalMs: options.reconnectIntervalMs,
      connectTimeoutMs: options.connectTimeoutMs,
      idleDisconnectTimeoutMs: options.idleDisconnectTimeoutMs,
      shouldHoldOpen: options.shouldHoldOpen,
      beforeConnect: options.beforeConnect,
      advanceEndpoint: () => this.advanceEndpoint(),
      onFallback: () => options.onFallback?.(this.currentEndpoint()),
      onSocketChange: options.onSocketChange,
      onOpen: payload => {
        options.onOpen?.(payload);
        this.emit('open', undefined);
      },
      onClose: payload => {
        options.onClose?.(payload);
        this.emit('close', {
          reason: payload.closeReason ?? undefined,
          wasClean: !payload.shouldReconnect,
        });
      },
      onError: payload => {
        options.onError?.(payload);
        this.emit('socket-error', payload.error);
      },
      onHandshakeError: options.onHandshakeError,
      onMessageError: options.onMessageError,
      onSend: options.onSend,
      onEvent: event => {
        this.emit('message', event);
        if (!isBackendEvent(event)) {
          return;
        }
        this.emit('event', event);
        this.emit(event.type, event as AgentSessionEventMap[BackendEventType]);
      },
      log: options.log,
    });
  }

  async waitForOpen(): Promise<void> {
    await this.session.ensureConnected({ reason: 'agent-session' });
  }

  isOpen(): boolean {
    return this.session.isOpen();
  }

  on<TEvent extends AgentSessionEventName>(
    event: TEvent,
    listener: AgentSessionListener<AgentSessionEventMap[TEvent]>,
  ): () => void {
    const bucket = this.listeners.get(event) ?? new Set<AgentSessionListener<unknown>>();
    bucket.add(listener as AgentSessionListener<unknown>);
    this.listeners.set(event, bucket);
    return () => {
      bucket.delete(listener as AgentSessionListener<unknown>);
      if (bucket.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  async query(payload: AgentQueryInput): Promise<string> {
    return this.sendBackendMessage('query', {
      ...(payload.backendPayload ?? {}),
      text: payload.text,
      conversation_ref: payload.conversationRef,
      agent_definition: payload.agentDefinition ?? payload.backendPayload?.agent_definition,
      content: payload.content ?? undefined,
      screenshot_ref: payload.screenshotRef ?? undefined,
      screenshot_refs: payload.screenshotRefs ?? undefined,
      system_state_internal: payload.systemStateInternal ?? undefined,
      workspace_path: payload.workspacePath ?? undefined,
    }, payload.turnRef ?? undefined);
  }

  async stopQuery(input: AgentStopInput | null = null): Promise<string> {
    rejectRemovedStopInputAliases(input);
    return this.sendBackendMessage('stop-query', {
      conversation_ref: input?.conversationRef ?? null,
      turn_ref: input?.turnRef ?? null,
    });
  }

  async updateSettings(config: JsonRecord): Promise<string> {
    return this.sendBackendMessage('update-settings', config);
  }

  async listModels(): Promise<string> {
    return this.sendBackendMessage('list-models', {});
  }

  async rehydrateConversation(payload: JsonRecord): Promise<string> {
    return this.sendBackendMessage('rehydrate-conversation', {
      ...payload,
      rehydrate_mode: payload.rehydrate_mode ?? 'replace',
    });
  }

  async compactHistory(payload: JsonRecord): Promise<string> {
    return this.sendBackendMessage('compact-history', payload);
  }

  async wakewordDetected(payload: JsonRecord = {}): Promise<string> {
    return this.sendBackendMessage('wakeword-detected', payload);
  }

  async sendToolResultPayload(payload: JsonRecord): Promise<string> {
    return this.sendBackendMessage('tool-result', payload);
  }

  async sendToolBundleResultPayload(payload: JsonRecord): Promise<string> {
    return this.sendBackendMessage('tool-bundle-result', payload);
  }

  close(_code?: number, reason = 'agent-session-close'): void {
    this.session.close(reason);
  }

  noteTraffic(reason = 'traffic'): void {
    this.session.noteTraffic(reason);
  }

  syncIdleTimer(reason = 'idle-sync'): void {
    this.session.syncIdleTimer(reason);
  }

  private async sendBackendMessage(type: string, payload: JsonRecord, messageId?: string): Promise<string> {
    await this.waitForOpen();
    const id = this.session.sendMessage(type, payload, messageId ?? null);
    if (!id) {
      throw new Error(`Agent SDK managed session could not send ${type}`);
    }
    return id;
  }

  private currentEndpoint(): ManagedAgentBackendEndpoint {
    return this.endpoints[this.activeEndpointIndex] ?? this.endpoints[0];
  }

  private advanceEndpoint(): boolean {
    if (this.endpoints.length <= 1) {
      return false;
    }
    this.activeEndpointIndex = (this.activeEndpointIndex + 1) % this.endpoints.length;
    return true;
  }

  private emit<TEvent extends AgentSessionEventName>(
    event: TEvent,
    payload: AgentSessionEventMap[TEvent],
  ): void {
    const bucket = this.listeners.get(event);
    if (!bucket) {
      return;
    }
    bucket.forEach(listener => {
      listener(payload);
    });
  }
}

function normalizeEndpoints(options: ManagedAgentSessionOptions): ManagedAgentBackendEndpoint[] {
  const endpoints = options.endpoints && options.endpoints.length > 0
    ? options.endpoints
    : [{
      backendUrl: options.backendUrl,
      wsUrl: options.wsUrl,
      wsOrigin: options.wsOrigin,
      headers: options.headers,
    }];
  return endpoints.map(endpoint => ({
    ...endpoint,
    backendUrl: endpoint.backendUrl ?? endpoint.httpBaseUrl ?? options.backendUrl,
  }));
}

export function createManagedAgentSession(
  options: ManagedAgentSessionOptions,
): ManagedAgentSession {
  return new ManagedAgentSession(options);
}
