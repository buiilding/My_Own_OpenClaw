/**
 * Provides the managed windie agent session module for the TypeScript SDK runtime.
 */

import {
  isBackendEvent,
  type BackendEvent,
  type BackendEventType,
} from '../events/backendEvents.js';
import type { JsonRecord } from '../conversation/types.js';
import {
  deriveWsUrl,
  resolveWebSocketImplementation,
  type WebSocketConstructor,
  type WebSocketLike,
  type WindieAgentQueryInput,
  type WindieAgentStopInput,
  type WindieAgentSessionRuntime,
} from './WindieAgentSession.js';
import {
  createManagedBackendSession,
  type ManagedBackendSession,
} from './ManagedBackendSession.js';
import { createWindieSdkBackendSocket } from './BackendSocketFactory.js';
import { filterBackendPayload } from './backendPayloadContract.js';

type WindieAgentEventMap = {
  open: void;
  close: { code?: number; reason?: string; wasClean?: boolean };
  'socket-error': unknown;
  message: unknown;
  event: BackendEvent;
} & {
  [K in BackendEventType]: Extract<BackendEvent, { type: K }>;
};

type WindieAgentEventName = keyof WindieAgentEventMap;
type WindieAgentListener<T> = (payload: T) => void;

export type WindieManagedBackendEndpoint = {
  backendUrl?: string;
  httpBaseUrl?: string;
  wsUrl?: string;
  wsOrigin?: string;
  headers?: Record<string, string>;
};

export type ManagedWindieAgentSessionOptions = {
  backendUrl: string;
  wsUrl?: string;
  wsOrigin?: string;
  WebSocketImpl?: WebSocketConstructor;
  headers?: Record<string, string>;
  endpoints?: WindieManagedBackendEndpoint[];
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
    fallbackScheduled: boolean;
  }) => void;
  onError?: (payload: { error: unknown; opened: boolean; socket: WebSocketLike }) => void;
  onHandshakeError?: (error: unknown) => void;
  onMessageError?: (error: unknown) => void;
  onSend?: (type: string) => void;
  onFallback?: (endpoint: WindieManagedBackendEndpoint) => void;
};

function resolveEndpointWsUrl(endpoint: WindieManagedBackendEndpoint): string {
  if (endpoint.wsUrl) {
    return endpoint.wsUrl.replace(/\/+$/, '');
  }
  const backendUrl = endpoint.backendUrl ?? endpoint.httpBaseUrl;
  if (!backendUrl) {
    throw new Error('Managed Windie agent endpoint requires backendUrl or wsUrl');
  }
  return deriveWsUrl(backendUrl);
}

export class ManagedWindieAgentSession implements WindieAgentSessionRuntime {
  private readonly listeners = new Map<WindieAgentEventName, Set<WindieAgentListener<unknown>>>();
  private readonly endpoints: WindieManagedBackendEndpoint[];
  private activeEndpointIndex = 0;
  private readonly session: ManagedBackendSession;

  constructor(private readonly options: ManagedWindieAgentSessionOptions) {
    this.endpoints = normalizeEndpoints(options);
    const WebSocketImpl = resolveWebSocketImplementation(options.WebSocketImpl);
    this.session = createManagedBackendSession({
      createSocket: () => {
        const endpoint = this.currentEndpoint();
        return createWindieSdkBackendSocket({
          WebSocketImpl,
          wsUrl: resolveEndpointWsUrl(endpoint),
          wsOrigin: endpoint.wsOrigin,
          headers: {
            ...(options.headers ?? {}),
            ...(endpoint.headers ?? {}),
          },
        });
      },
      buildHandshake: () => ({
        type: 'handshake',
        user_id: options.userId,
        operating_system: options.operatingSystem,
        agent_definition: options.agentDefinition,
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
        this.emit(event.type, event as WindieAgentEventMap[BackendEventType]);
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

  on<TEvent extends WindieAgentEventName>(
    event: TEvent,
    listener: WindieAgentListener<WindieAgentEventMap[TEvent]>,
  ): () => void {
    const bucket = this.listeners.get(event) ?? new Set<WindieAgentListener<unknown>>();
    bucket.add(listener as WindieAgentListener<unknown>);
    this.listeners.set(event, bucket);
    return () => {
      bucket.delete(listener as WindieAgentListener<unknown>);
      if (bucket.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  async query(payload: WindieAgentQueryInput): Promise<string> {
    return this.sendBackendMessage('query', {
      ...(payload.rawPayload ?? {}),
      text: payload.text,
      conversation_ref: payload.conversationRef,
      agent_definition: payload.agentDefinition ?? payload.rawPayload?.agent_definition,
      content: payload.content ?? undefined,
      screenshot: payload.screenshot ?? undefined,
      screenshot_ref: payload.screenshotRef ?? undefined,
      screenshot_refs: payload.screenshotRefs ?? undefined,
      system_state_internal: payload.systemStateInternal ?? undefined,
      workspace_path: payload.workspacePath ?? undefined,
    }, payload.turnRef ?? undefined);
  }

  async stopQuery(input: WindieAgentStopInput | null = null): Promise<string> {
    return this.sendBackendMessage('stop-query', {
      conversation_ref: input?.conversation_ref ?? input?.conversationRef ?? null,
      turn_ref: input?.turn_ref ?? input?.turnRef ?? null,
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
      throw new Error(`Windie managed agent session could not send ${type}`);
    }
    return id;
  }

  private currentEndpoint(): WindieManagedBackendEndpoint {
    return this.endpoints[this.activeEndpointIndex] ?? this.endpoints[0];
  }

  private advanceEndpoint(): boolean {
    if (this.endpoints.length <= 1) {
      return false;
    }
    this.activeEndpointIndex = (this.activeEndpointIndex + 1) % this.endpoints.length;
    return true;
  }

  private emit<TEvent extends WindieAgentEventName>(
    event: TEvent,
    payload: WindieAgentEventMap[TEvent],
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

function normalizeEndpoints(options: ManagedWindieAgentSessionOptions): WindieManagedBackendEndpoint[] {
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

export function createManagedWindieAgentSession(
  options: ManagedWindieAgentSessionOptions,
): ManagedWindieAgentSession {
  return new ManagedWindieAgentSession(options);
}
