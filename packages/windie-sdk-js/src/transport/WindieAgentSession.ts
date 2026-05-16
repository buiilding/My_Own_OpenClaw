import {
  isBackendEvent,
  type BackendEvent,
  type BackendEventType,
} from '../events/backendEvents.js';
import type {
  BackendTransport,
  JsonRecord,
} from '../conversation/types.js';

export type WebSocketLike = {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener?: (event: string, listener: (payload: unknown) => void) => void;
  removeEventListener?: (event: string, listener: (payload: unknown) => void) => void;
  on?: (event: string, listener: (payload: unknown) => void) => void;
  off?: (event: string, listener: (payload: unknown) => void) => void;
};

export type WebSocketConstructor = new (url: string, options?: unknown) => WebSocketLike;

export type WindieAgentSessionOptions = {
  backendUrl: string;
  wsUrl?: string;
  WebSocketImpl?: WebSocketConstructor;
  userId: string;
  operatingSystem?: string;
  agentDefinition?: JsonRecord;
};

export type WindieAgentQueryInput = {
  text: string;
  conversationRef: string;
  content?: string | null;
  screenshot?: string | null;
  screenshotRef?: string | null;
  screenshotRefs?: string[] | null;
  attachmentContext?: string | null;
  attachmentFilenames?: string[] | null;
  systemStateInternal?: JsonRecord | null;
  workspacePath?: string | null;
  turnRef?: string | null;
};

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

export function resolveWebSocketImplementation(WebSocketImpl?: WebSocketConstructor): WebSocketConstructor {
  if (WebSocketImpl) {
    return WebSocketImpl;
  }
  if (typeof globalThis.WebSocket === 'function') {
    return globalThis.WebSocket as unknown as WebSocketConstructor;
  }
  throw new Error('WindieSdkClient requires a WebSocket implementation');
}

export function normalizeWsUrl(wsUrl: string): string {
  return wsUrl.replace(/\/+$/, '');
}

export function deriveWsUrl(httpBaseUrl: string): string {
  const normalized = httpBaseUrl.replace(/\/+$/, '');
  const url = new URL(normalized);
  if (url.protocol === 'https:') {
    url.protocol = 'wss:';
  } else if (url.protocol === 'http:') {
    url.protocol = 'ws:';
  }
  url.pathname = url.pathname.replace(/\/+$/, '') + '/ws';
  return url.toString().replace(/\/+$/, '');
}

export function createMessageId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createWindieAgentSession(options: WindieAgentSessionOptions): WindieAgentSession {
  const wsUrl = options.wsUrl
    ? normalizeWsUrl(options.wsUrl)
    : deriveWsUrl(options.backendUrl);
  const WebSocketImpl = resolveWebSocketImplementation(options.WebSocketImpl);
  const socket = new WebSocketImpl(wsUrl);
  return new WindieAgentSession(socket, {
    user_id: options.userId,
    operating_system: options.operatingSystem,
    agent_definition: options.agentDefinition,
  });
}

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
  throw new Error('Windie SDK WebSocket implementation does not support event listeners');
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

function normalizeClosePayload(payload: unknown): { code?: number; reason?: string; wasClean?: boolean } {
  if (!payload || typeof payload !== 'object') {
    return {};
  }
  const candidate = payload as Record<string, unknown>;
  return {
    code: typeof candidate.code === 'number' ? candidate.code : undefined,
    reason: typeof candidate.reason === 'string' ? candidate.reason : undefined,
    wasClean: typeof candidate.wasClean === 'boolean' ? candidate.wasClean : undefined,
  };
}

export class WindieAgentSession {
  private readonly listeners = new Map<WindieAgentEventName, Set<WindieAgentListener<unknown>>>();
  private readonly detachSocketListeners: Array<() => void> = [];
  private readonly readyPromise: Promise<void>;
  private resolveReady: (() => void) | null = null;
  private rejectReady: ((error: unknown) => void) | null = null;
  private isReady = false;

  constructor(
    private readonly socket: WebSocketLike,
    private readonly handshake: { user_id: string; operating_system?: string; agent_definition?: JsonRecord },
  ) {
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });

    this.detachSocketListeners.push(
      attachSocketListener(this.socket, 'open', () => {
        this.socket.send(JSON.stringify({
          type: 'handshake',
          user_id: handshake.user_id,
          operating_system: handshake.operating_system,
          agent_definition: handshake.agent_definition,
        }));
        this.isReady = true;
        this.resolveReady?.();
        this.emit('open', undefined);
      }),
    );

    this.detachSocketListeners.push(
      attachSocketListener(this.socket, 'message', payload => {
        const raw = normalizeIncomingSocketMessage(payload);
        let parsed: unknown = raw;
        if (typeof raw === 'string') {
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
        }
        if (isBackendEvent(parsed)) {
          this.emit('message', parsed);
          this.emit('event', parsed);
          this.emit(parsed.type, parsed as WindieAgentEventMap[BackendEventType]);
        } else {
          this.emit('message', parsed);
        }
      }),
    );

    this.detachSocketListeners.push(
      attachSocketListener(this.socket, 'close', payload => {
        const closePayload = normalizeClosePayload(payload);
        if (!this.isReady) {
          this.rejectReady?.(new Error('Windie agent session closed before handshake completed'));
        }
        this.emit('close', closePayload);
        this.detachSocketListeners.splice(0).forEach(detach => detach());
      }),
    );

    this.detachSocketListeners.push(
      attachSocketListener(this.socket, 'error', payload => {
        if (!this.isReady) {
          this.rejectReady?.(payload);
        }
        this.emit('socket-error', payload);
      }),
    );
  }

  async waitForOpen(): Promise<void> {
    await this.readyPromise;
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
      text: payload.text,
      conversation_ref: payload.conversationRef,
      turn_ref: payload.turnRef ?? undefined,
      content: payload.content ?? undefined,
      screenshot: payload.screenshot ?? undefined,
      screenshot_ref: payload.screenshotRef ?? undefined,
      screenshot_refs: payload.screenshotRefs ?? undefined,
      attachment_context: payload.attachmentContext ?? undefined,
      attachment_filenames: payload.attachmentFilenames ?? undefined,
      system_state_internal: payload.systemStateInternal ?? undefined,
      workspace_path: payload.workspacePath ?? undefined,
    });
  }

  async stopQuery(conversationRef?: string | null): Promise<string> {
    return this.sendBackendMessage('stop-query', {
      conversation_ref: conversationRef ?? null,
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

  close(code?: number, reason?: string): void {
    this.socket.close(code, reason);
  }

  private async sendBackendMessage(type: string, payload: JsonRecord): Promise<string> {
    await this.waitForOpen();
    const id = createMessageId();
    this.socket.send(JSON.stringify({
      id,
      type,
      payload: {
        ...payload,
      },
      user_id: this.handshake.user_id,
      timestamp: new Date().toISOString(),
    }));
    return id;
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

export function createWindieAgentBackendTransport(
  session: WindieAgentSession,
  conversationRef: string,
): BackendTransport {
  return {
    connect: async () => session.waitForOpen(),
    handshake: async () => undefined,
    sendQuery: async payload => session.query({
      text: typeof payload.text === 'string' ? payload.text : '',
      conversationRef: typeof payload.conversation_ref === 'string'
        ? payload.conversation_ref
        : conversationRef,
      turnRef: typeof payload.turn_ref === 'string' ? payload.turn_ref : null,
      content: typeof payload.content === 'string' ? payload.content : null,
      screenshot: typeof payload.screenshot === 'string' ? payload.screenshot : null,
      screenshotRef: typeof payload.screenshot_ref === 'string' ? payload.screenshot_ref : null,
      screenshotRefs: Array.isArray(payload.screenshot_refs)
        ? payload.screenshot_refs.filter((value): value is string => typeof value === 'string')
        : null,
      attachmentContext: typeof payload.attachment_context === 'string' ? payload.attachment_context : null,
      attachmentFilenames: Array.isArray(payload.attachment_filenames)
        ? payload.attachment_filenames.filter((value): value is string => typeof value === 'string')
        : null,
      systemStateInternal: payload.system_state_internal && typeof payload.system_state_internal === 'object'
        ? payload.system_state_internal as JsonRecord
        : null,
      workspacePath: typeof payload.workspace_path === 'string' ? payload.workspace_path : null,
    }),
    sendToolResult: async payload => {
      await session.sendToolResultPayload(payload);
    },
    sendToolBundleResult: async payload => {
      await session.sendToolBundleResultPayload(payload);
    },
    rehydrateConversation: async payload => {
      await session.rehydrateConversation({
        conversation_ref: typeof payload.conversation_ref === 'string'
          ? payload.conversation_ref
          : conversationRef,
        messages: Array.isArray(payload.messages) ? payload.messages : [],
        rehydrate_mode: 'replace',
      });
    },
    compactHistory: async payload => session.compactHistory(payload),
    wakewordDetected: async payload => session.wakewordDetected(payload),
    stop: async payload => {
      await session.stopQuery(
        typeof payload.conversation_ref === 'string' ? payload.conversation_ref : conversationRef,
      );
    },
    updateSettings: async payload => {
      await session.updateSettings(payload);
    },
    listModels: async () => session.listModels(),
    subscribe: listener => session.on('event', listener),
    close: async () => session.close(1000, 'conversation-runtime-close'),
  };
}
