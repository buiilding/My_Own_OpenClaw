/**
 * Provides the managed websocket session module for the TypeScript SDK runtime.
 */

import { isBackendEvent, type BackendEvent } from '../events/backendEvents.js';
import type { JsonRecord } from '../conversation/types.js';
import { createMessageId, type WebSocketLike } from './AgentSession.js';

export type ManagedWebSocketSessionOptions = {
  createSocket: () => WebSocketLike;
  buildHandshake: () => Promise<JsonRecord> | JsonRecord;
  getUserId: () => string | null | undefined;
  normalizePayload?: (type: string, payload: JsonRecord) => JsonRecord;
  createMessageId?: () => string;
  reconnectIntervalMs?: number;
  connectTimeoutMs?: number;
  idleDisconnectTimeoutMs?: number;
  shouldHoldOpen?: () => boolean;
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
  onEvent?: (event: BackendEvent | unknown) => void;
  onSend?: (type: string) => void;
  onFallback?: () => void;
  advanceEndpoint?: () => boolean;
  beforeConnect?: (payload: { reason: string }) => Promise<void> | void;
};

type ConnectWaiter = {
  resolve: (value: boolean) => void;
  reject: (error: unknown) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

const DEFAULT_RECONNECT_INTERVAL_MS = 1000;
const DEFAULT_CONNECT_TIMEOUT_MS = 10000;
const DEFAULT_IDLE_DISCONNECT_TIMEOUT_MS = 30 * 60 * 1000;

function attachSocketListener(
  socket: WebSocketLike,
  event: string,
  listener: (payload: unknown) => void,
): () => void {
  if (typeof socket.addEventListener === 'function') {
    socket.addEventListener(event, listener);
    return () => socket.removeEventListener?.(event, listener);
  }
  if (typeof socket.on === 'function') {
    socket.on(event, listener);
    return () => socket.off?.(event, listener);
  }
  throw new Error('Agent SDK WebSocket implementation does not support event listeners');
}

function normalizeIncomingSocketMessage(payload: unknown): unknown {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data?: unknown }).data;
  }
  if (payload instanceof Uint8Array) {
    return new TextDecoder().decode(payload);
  }
  return payload;
}

function getReadyState(socket: WebSocketLike | null): number | null {
  const readyState = (socket as { readyState?: unknown } | null)?.readyState;
  return typeof readyState === 'number' ? readyState : null;
}

function isOpenSocket(socket: WebSocketLike | null): boolean {
  return getReadyState(socket) === 1;
}

function isConnectingSocket(socket: WebSocketLike | null): boolean {
  return getReadyState(socket) === 0;
}

export class ManagedWebSocketSession {
  private socket: WebSocketLike | null = null;
  private detachSocketListeners: Array<() => void> = [];
  private shouldMaintainConnection = false;
  private handshakeCompleted = false;
  private intentionalCloseReason: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private idleDisconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly connectWaiters = new Set<ConnectWaiter>();
  private readonly reconnectIntervalMs: number;
  private readonly connectTimeoutMs: number;
  private readonly idleDisconnectTimeoutMs: number;

  constructor(private readonly options: ManagedWebSocketSessionOptions) {
    this.reconnectIntervalMs = options.reconnectIntervalMs ?? DEFAULT_RECONNECT_INTERVAL_MS;
    this.connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    this.idleDisconnectTimeoutMs = options.idleDisconnectTimeoutMs ?? DEFAULT_IDLE_DISCONNECT_TIMEOUT_MS;
  }

  getSocket(): WebSocketLike | null {
    return this.socket;
  }

  isOpen(): boolean {
    return this.handshakeCompleted && isOpenSocket(this.socket);
  }

  isConnecting(): boolean {
    return isConnectingSocket(this.socket);
  }

  connect({ force = false }: { force?: boolean } = {}): void {
    this.shouldMaintainConnection = true;
    if (!force && !this.shouldMaintainConnection) {
      return;
    }
    if (this.isOpen() || this.isConnecting()) {
      this.options.log?.('Agent SDK managed websocket session already open or connecting.');
      return;
    }

    const nextSocket = this.options.createSocket();
    this.socket = nextSocket;
    this.handshakeCompleted = false;
    this.options.onSocketChange?.(this.socket);
    let opened = false;
    this.detachSocketListeners.splice(0).forEach(detach => detach());

    this.detachSocketListeners.push(
      attachSocketListener(nextSocket, 'open', async () => {
        if (this.socket !== nextSocket) {
          return;
        }
        opened = true;
        try {
          const handshake = await this.options.buildHandshake();
          nextSocket.send(JSON.stringify(handshake));
          this.handshakeCompleted = true;
          this.options.onOpen?.({ socket: nextSocket, handshake });
          this.resolveConnectWaiters();
          this.noteTraffic('ws-open');
        } catch (error) {
          this.options.onHandshakeError?.(error);
          this.rejectConnectWaiters(error);
          if (this.socket === nextSocket) {
            this.intentionalCloseReason = 'handshake-failed';
            try {
              nextSocket.close();
            } finally {
              if (this.socket === nextSocket) {
                this.socket = null;
                this.handshakeCompleted = false;
                this.options.onSocketChange?.(this.socket);
                this.detachSocketListeners.splice(0).forEach(detach => detach());
              }
            }
          }
        }
      }),
    );

    this.detachSocketListeners.push(
      attachSocketListener(nextSocket, 'message', payload => {
        if (this.socket !== nextSocket) {
          return;
        }
        try {
          const raw = normalizeIncomingSocketMessage(payload);
          const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
          this.options.onEvent?.(isBackendEvent(data) ? data : data);
          this.noteTraffic(`message:${isBackendEvent(data) ? data.type : 'unknown'}`);
        } catch (error) {
          this.options.onMessageError?.(error);
        }
      }),
    );

    this.detachSocketListeners.push(
      attachSocketListener(nextSocket, 'close', () => {
        if (this.socket !== nextSocket) {
          return;
        }
        this.socket = null;
        this.handshakeCompleted = false;
        this.options.onSocketChange?.(this.socket);
        this.detachSocketListeners.splice(0).forEach(detach => detach());
        this.clearIdleDisconnectTimer();
        const closeReason = this.intentionalCloseReason;
        this.intentionalCloseReason = null;
        const shouldReconnect = this.shouldMaintainConnection && !closeReason;
        let reconnectScheduled = false;
        if (!opened && shouldReconnect && this.options.advanceEndpoint?.()) {
          this.options.onFallback?.();
          this.scheduleReconnect(0);
          reconnectScheduled = true;
        }
        this.options.onClose?.({ opened, closeReason, shouldReconnect, reconnectScheduled });
        if (!shouldReconnect && !opened) {
          this.rejectConnectWaiters(
            new Error(`Backend websocket closed before connecting (${closeReason || 'not-demanded'}).`),
          );
          return;
        }
        if (shouldReconnect && !reconnectScheduled) {
          this.scheduleReconnect(this.reconnectIntervalMs);
        }
      }),
    );

    this.detachSocketListeners.push(
      attachSocketListener(nextSocket, 'error', error => {
        if (this.socket !== nextSocket) {
          return;
        }
        this.options.onError?.({ error, opened, socket: nextSocket });
        if (!opened && this.shouldMaintainConnection && this.options.advanceEndpoint?.()) {
          this.socket = null;
          this.handshakeCompleted = false;
          this.options.onSocketChange?.(this.socket);
          this.detachSocketListeners.splice(0).forEach(detach => detach());
          this.options.onFallback?.();
          this.connect({ force: true });
          return;
        }
        if (!opened) {
          this.rejectConnectWaiters(error);
        }
      }),
    );
  }

  async ensureConnected({
    reason = 'request',
    timeoutMs = this.connectTimeoutMs,
  }: {
    reason?: string;
    timeoutMs?: number;
  } = {}): Promise<boolean> {
    this.shouldMaintainConnection = true;
    this.clearReconnectTimer();
    this.clearIdleDisconnectTimer();
    if (this.options.beforeConnect) {
      await this.options.beforeConnect({ reason });
    }
    if (this.isOpen()) {
      this.syncIdleTimer(`ensure:${reason}`);
      return true;
    }
    const waitPromise = new Promise<boolean>((resolve, reject) => {
      const waiter: ConnectWaiter = {
        resolve,
        reject,
        timeoutId: setTimeout(() => {
          this.connectWaiters.delete(waiter);
          reject(new Error(`Timed out connecting to backend for ${reason}.`));
        }, timeoutMs),
      };
      this.connectWaiters.add(waiter);
    });
    try {
      this.connect({ force: true });
    } catch (error) {
      this.rejectConnectWaiters(error);
    }
    await waitPromise;
    this.syncIdleTimer(`connected:${reason}`);
    return true;
  }

  sendMessage(type: string, payload: JsonRecord = {}, messageId: string | null = null): string | null {
    if (!this.isOpen() || !this.socket) {
      this.options.log?.('Cannot send message: Agent SDK managed websocket session is not connected.');
      return null;
    }
    const userId = this.options.getUserId();
    if (!userId) {
      this.options.log?.('Cannot send message: user_id not set.');
      return null;
    }
    const id = messageId || this.options.createMessageId?.() || createMessageId();
    const message = {
      id,
      type,
      payload: this.options.normalizePayload?.(type, payload) ?? payload,
      user_id: userId,
      timestamp: new Date().toISOString(),
    };
    try {
      this.socket.send(JSON.stringify(message));
      this.options.onSend?.(type);
      this.noteTraffic(`send:${type}`);
      return id;
    } catch (error) {
      this.options.log?.(`Error sending message to backend: ${error}`);
      return null;
    }
  }

  sendQuery(payload: JsonRecord, messageId: string | null = null): string | null {
    return this.sendMessage('query', payload, messageId);
  }

  sendWakewordDetected(payload: JsonRecord = {}, messageId: string | null = null): string | null {
    return this.sendMessage('wakeword-detected', payload, messageId);
  }

  sendStopQuery(payload: JsonRecord = {}, messageId: string | null = null): string | null {
    return this.sendMessage('stop-query', payload, messageId);
  }

  sendUpdateSettings(payload: JsonRecord = {}, messageId: string | null = null): string | null {
    return this.sendMessage('update-settings', payload, messageId);
  }

  sendListModels(payload: JsonRecord = {}, messageId: string | null = null): string | null {
    return this.sendMessage('list-models', payload, messageId);
  }

  sendRehydrateConversation(payload: JsonRecord = {}, messageId: string | null = null): string | null {
    return this.sendMessage('rehydrate-conversation', payload, messageId);
  }

  sendCompactHistory(payload: JsonRecord = {}, messageId: string | null = null): string | null {
    return this.sendMessage('compact-history', payload, messageId);
  }

  sendToolResult(payload: JsonRecord = {}, messageId: string | null = null): string | null {
    return this.sendMessage('tool-result', payload, messageId);
  }

  sendToolBundleResult(payload: JsonRecord = {}, messageId: string | null = null): string | null {
    return this.sendMessage('tool-bundle-result', payload, messageId);
  }

  close(reason = 'runtime-close'): void {
    this.shouldMaintainConnection = false;
    this.intentionalCloseReason = reason;
    this.clearReconnectTimer();
    this.clearIdleDisconnectTimer();
    this.rejectConnectWaiters(new Error('Agent SDK managed websocket session closed.'));
    const current = this.socket;
    this.socket = null;
    this.handshakeCompleted = false;
    this.options.onSocketChange?.(this.socket);
    this.detachSocketListeners.splice(0).forEach(detach => detach());
    if (current && (isOpenSocket(current) || isConnectingSocket(current))) {
      current.close(1000, reason);
    }
  }

  noteTraffic(reason = 'traffic'): void {
    if (!this.shouldMaintainConnection) {
      return;
    }
    this.syncIdleTimer(reason);
  }

  syncIdleTimer(reason = 'idle-sync'): void {
    this.clearIdleDisconnectTimer();
    if (!this.shouldMaintainConnection || !this.isOpen()) {
      return;
    }
    if (this.options.shouldHoldOpen?.()) {
      return;
    }
    this.idleDisconnectTimer = setTimeout(() => {
      this.options.log?.(`Closing idle backend websocket after ${this.idleDisconnectTimeoutMs}ms (${reason}).`);
      this.intentionalCloseReason = 'idle-timeout';
      this.shouldMaintainConnection = false;
      this.clearReconnectTimer();
      this.clearIdleDisconnectTimer();
      if (this.socket && (isOpenSocket(this.socket) || isConnectingSocket(this.socket))) {
        this.socket.close();
      }
    }, this.idleDisconnectTimeoutMs);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearIdleDisconnectTimer(): void {
    if (this.idleDisconnectTimer !== null) {
      clearTimeout(this.idleDisconnectTimer);
      this.idleDisconnectTimer = null;
    }
  }

  private resolveConnectWaiters(): void {
    for (const waiter of this.connectWaiters) {
      clearTimeout(waiter.timeoutId);
      waiter.resolve(true);
    }
    this.connectWaiters.clear();
  }

  private rejectConnectWaiters(error: unknown): void {
    for (const waiter of this.connectWaiters) {
      clearTimeout(waiter.timeoutId);
      waiter.reject(error);
    }
    this.connectWaiters.clear();
  }

  private scheduleReconnect(delayMs = this.reconnectIntervalMs): void {
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect({ force: true });
    }, delayMs);
  }
}

export function createManagedWebSocketSession(options: ManagedWebSocketSessionOptions): ManagedWebSocketSession {
  return new ManagedWebSocketSession(options);
}
