import {
  isBackendEvent,
  type BackendEvent,
  type BackendEventType,
  type ToolSchema,
} from '../../types/backendEvents';

type FetchLike = typeof fetch;

type WebSocketLike = {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener?: (event: string, listener: (payload: unknown) => void) => void;
  removeEventListener?: (event: string, listener: (payload: unknown) => void) => void;
  on?: (event: string, listener: (payload: unknown) => void) => void;
  off?: (event: string, listener: (payload: unknown) => void) => void;
};

type WebSocketConstructor = new (url: string) => WebSocketLike;

type JsonRecord = Record<string, unknown>;

export type SdkInteractionMode = 'chat' | 'agent';

export type SdkImageSource = {
  artifact_id?: string;
  image_base64?: string;
};

export type SdkBoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SdkPoint = {
  x: number;
  y: number;
};

export type SdkImageMetadata = {
  source_id: string;
  artifact_id?: string | null;
  content_type: string;
  width: number;
  height: number;
};

export type SdkOcrResult = {
  id: string;
  text: string;
  confidence: number;
  bbox: SdkBoundingBox;
  center?: SdkPoint | null;
  candidate_id?: string | null;
  score?: number | null;
};

export type SdkOverlayArtifactResponse = {
  image: SdkImageMetadata;
  artifact_id: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  url: string;
  annotation_count: number;
};

export type SdkVisionTarget = {
  description: string;
  center: SdkPoint;
  rank: number;
};

export type SdkConfigSnapshot = {
  model_mode: string;
  model_provider: string;
  selected_model_id: string;
  interaction_mode: string;
};

export type SdkModelsResponse = {
  config: SdkConfigSnapshot;
  models: JsonRecord[];
};

export type SdkToolSchemasResponse = {
  config: SdkConfigSnapshot;
  canonical_tool_schemas: JsonRecord[];
  provider_tool_schemas: JsonRecord[];
};

export type SdkToolCapabilitiesResponse = {
  config: SdkConfigSnapshot;
  capability: JsonRecord;
  canonical_tool_schema?: JsonRecord | null;
  provider_tool_schema?: JsonRecord | null;
};

export type SdkSystemPromptResponse = {
  config: SdkConfigSnapshot;
  system_prompt: string;
};

export type SdkPromptPreviewRequest = {
  user_id?: string;
  model_id?: string;
  model_provider?: string;
  interaction_mode?: SdkInteractionMode;
  include_tools?: boolean;
  workspace_path?: string;
  user_query_raw?: string;
  messages?: JsonRecord[];
};

export type SdkPromptPreviewResponse = {
  config: SdkConfigSnapshot;
  system_prompt: string;
  prompt_messages: JsonRecord[];
  canonical_tool_schemas: JsonRecord[];
  provider_tool_schemas: JsonRecord[];
  user_message_full?: {
    content: string;
    metadata: {
      original_query: string;
      context_type: string;
      injected_context: string;
      active_window: string;
    };
  } | null;
  prompt_token_count?: number | null;
  token_count_error?: string | null;
};

export type SdkQueryPlanRequest = {
  user_id?: string;
  model_id?: string;
  model_provider?: string;
  interaction_mode?: SdkInteractionMode;
  include_tools?: boolean;
  workspace_path?: string;
  user_query_raw?: string;
  conversation_ref?: string;
  messages?: JsonRecord[];
};

export type SdkQueryPlanResponse = {
  config: SdkConfigSnapshot;
  query_message: JsonRecord;
  transparency_events: JsonRecord[];
  system_prompt: string;
  prompt_messages: JsonRecord[];
  canonical_tool_schemas: JsonRecord[];
  provider_tool_schemas: JsonRecord[];
  user_message_full?: {
    content: string;
    metadata: {
      original_query: string;
      context_type: string;
      injected_context: string;
      active_window: string;
    };
  } | null;
  prompt_token_count?: number | null;
  token_count_error?: string | null;
};

export type SdkArtifactUploadResponse = {
  artifact_id: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  url: string;
};

export type SdkOcrRunRequest = {
  image: SdkImageSource;
};

export type SdkOcrTextQueryRequest = {
  image: SdkImageSource;
  text: string;
  threshold?: number;
  max_results?: number;
};

export type SdkOcrCandidateRequest = {
  image: SdkImageSource;
  candidate_id: string;
};

export type SdkOcrOverlayRequest = {
  image: SdkImageSource;
  text?: string;
  candidate_id?: string;
  threshold?: number;
  max_results?: number;
  show_labels?: boolean;
};

export type SdkOcrInspectRequest = {
  image: SdkImageSource;
  text?: string;
  threshold?: number;
  max_results?: number;
  include_overlay?: boolean;
  show_labels?: boolean;
};

export type SdkOcrRunResponse = {
  image: SdkImageMetadata;
  results: SdkOcrResult[];
};

export type SdkOcrFindTextResponse = {
  image: SdkImageMetadata;
  query: string;
  threshold: number;
  matches: SdkOcrResult[];
};

export type SdkOcrResolveTextResponse = {
  image: SdkImageMetadata;
  query: string;
  threshold: number;
  match: SdkOcrResult;
};

export type SdkOcrResolveCandidateResponse = {
  image: SdkImageMetadata;
  candidate_id: string;
  match: SdkOcrResult;
};

export type SdkOcrInspectResponse = {
  image: SdkImageMetadata;
  query?: string | null;
  threshold: number;
  results: SdkOcrResult[];
  ranked_matches: SdkOcrResult[];
  accepted_matches: SdkOcrResult[];
  resolved_match?: SdkOcrResult | null;
  resolution_error?: {
    status_code: number;
    detail: unknown;
  } | null;
  overlay?: SdkOverlayArtifactResponse | null;
};

export type SdkVisionLocateRequest = {
  image: SdkImageSource;
  description: string;
};

export type SdkVisionLocateAllRequest = {
  image: SdkImageSource;
  description: string;
  max_results?: number;
};

export type SdkVisionDescribeRequest = {
  image: SdkImageSource;
  region?: SdkBoundingBox;
};

export type SdkVisionOverlayRequest = {
  image: SdkImageSource;
  result: {
    points?: Array<SdkPoint & { label?: string; color?: string }>;
    regions?: Array<SdkBoundingBox & { label?: string; color?: string }>;
  };
  show_labels?: boolean;
};

export type SdkVisionLocateResponse = {
  image: SdkImageMetadata;
  description: string;
  match: SdkVisionTarget;
};

export type SdkVisionLocateAllResponse = {
  image: SdkImageMetadata;
  description: string;
  matches: SdkVisionTarget[];
};

export type SdkVisionDescribeResponse = {
  image: SdkImageMetadata;
  region?: SdkBoundingBox | null;
  description: string;
};

export type WindieSdkQueryOptions = {
  userId?: string;
  modelId?: string;
  modelProvider?: string;
  interactionMode?: SdkInteractionMode;
};

export type WindieSdkClientOptions = {
  httpBaseUrl: string;
  wsUrl?: string;
  fetchImpl?: FetchLike;
  WebSocketImpl?: WebSocketConstructor;
  defaultUserId?: string;
  defaultOperatingSystem?: string;
};

export type WindieAgentConnectOptions = {
  userId?: string;
  operatingSystem?: string;
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

function resolveFetchImplementation(fetchImpl?: FetchLike): FetchLike {
  if (fetchImpl) {
    return fetchImpl;
  }
  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch.bind(globalThis);
  }
  throw new Error('WindieSdkClient requires a fetch implementation');
}

function resolveWebSocketImplementation(WebSocketImpl?: WebSocketConstructor): WebSocketConstructor {
  if (WebSocketImpl) {
    return WebSocketImpl;
  }
  if (typeof globalThis.WebSocket === 'function') {
    return globalThis.WebSocket as unknown as WebSocketConstructor;
  }
  throw new Error('WindieSdkClient requires a WebSocket implementation');
}

function normalizeHttpBaseUrl(httpBaseUrl: string): string {
  return httpBaseUrl.replace(/\/+$/, '');
}

function normalizeWsUrl(wsUrl: string): string {
  return wsUrl.replace(/\/+$/, '');
}

function deriveWsUrl(httpBaseUrl: string): string {
  const normalized = normalizeHttpBaseUrl(httpBaseUrl);
  const url = new URL(normalized);
  if (url.protocol === 'https:') {
    url.protocol = 'wss:';
  } else if (url.protocol === 'http:') {
    url.protocol = 'ws:';
  }
  url.pathname = url.pathname.replace(/\/+$/, '') + '/ws';
  return url.toString().replace(/\/+$/, '');
}

function buildQueryString(options: WindieSdkQueryOptions = {}): string {
  const params = new URLSearchParams();
  if (options.userId) {
    params.set('user_id', options.userId);
  }
  if (options.modelId) {
    params.set('model_id', options.modelId);
  }
  if (options.modelProvider) {
    params.set('model_provider', options.modelProvider);
  }
  if (options.interactionMode) {
    params.set('interaction_mode', options.interactionMode);
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

function buildErrorMessage(status: number, statusText: string, bodyText: string): string {
  const trimmedBody = bodyText.trim();
  if (!trimmedBody) {
    return `Windie SDK request failed (${status} ${statusText})`;
  }
  return `Windie SDK request failed (${status} ${statusText}): ${trimmedBody}`;
}

function createMessageId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
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
    handshake: { user_id: string; operating_system?: string },
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
        this.emit('message', parsed);
        if (isBackendEvent(parsed)) {
          this.emit('event', parsed);
          this.emit(parsed.type, parsed as WindieAgentEventMap[BackendEventType]);
        }
      }),
    );

    this.detachSocketListeners.push(
      attachSocketListener(this.socket, 'close', payload => {
        const closePayload = normalizeClosePayload(payload);
        if (!this.isReady) {
          this.rejectReady?.(new Error(`Windie agent session closed before handshake completed`));
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
    await this.waitForOpen();
    const id = createMessageId();
    this.socket.send(JSON.stringify({
      id,
      type: 'query',
      payload: {
        text: payload.text,
        conversation_ref: payload.conversationRef,
        content: payload.content ?? undefined,
        screenshot: payload.screenshot ?? undefined,
        screenshot_ref: payload.screenshotRef ?? undefined,
        screenshot_refs: payload.screenshotRefs ?? undefined,
        attachment_context: payload.attachmentContext ?? undefined,
        attachment_filenames: payload.attachmentFilenames ?? undefined,
        system_state_internal: payload.systemStateInternal ?? undefined,
        workspace_path: payload.workspacePath ?? undefined,
      },
      timestamp: new Date().toISOString(),
    }));
    return id;
  }

  async stopQuery(conversationRef?: string | null): Promise<string> {
    await this.waitForOpen();
    const id = createMessageId();
    this.socket.send(JSON.stringify({
      id,
      type: 'stop-query',
      payload: {
        conversation_ref: conversationRef ?? null,
      },
      timestamp: new Date().toISOString(),
    }));
    return id;
  }

  async updateSettings(config: JsonRecord): Promise<string> {
    await this.waitForOpen();
    const id = createMessageId();
    this.socket.send(JSON.stringify({
      id,
      type: 'update-settings',
      payload: config,
      timestamp: new Date().toISOString(),
    }));
    return id;
  }

  async listModels(): Promise<string> {
    await this.waitForOpen();
    const id = createMessageId();
    this.socket.send(JSON.stringify({
      id,
      type: 'list-models',
      payload: {},
      timestamp: new Date().toISOString(),
    }));
    return id;
  }

  close(code?: number, reason?: string): void {
    this.socket.close(code, reason);
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

export class WindieSdkClient {
  private readonly httpBaseUrl: string;
  private readonly wsUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly WebSocketImpl: WebSocketConstructor;
  private readonly defaultUserId?: string;
  private readonly defaultOperatingSystem?: string;

  readonly artifacts = {
    upload: async (file: Blob | File, filename?: string): Promise<SdkArtifactUploadResponse> => this.uploadArtifact(file, filename),
    url: (artifactId: string): string => this.artifactUrl(artifactId),
  };

  readonly ocr = {
    run: async (payload: SdkOcrRunRequest): Promise<SdkOcrRunResponse> => this.postJson('/api/sdk/ocr/run', payload),
    inspect: async (payload: SdkOcrInspectRequest): Promise<SdkOcrInspectResponse> => this.postJson('/api/sdk/ocr/inspect', payload),
    findText: async (payload: SdkOcrTextQueryRequest): Promise<SdkOcrFindTextResponse> => this.postJson('/api/sdk/ocr/find-text', payload),
    findTextCandidates: async (payload: SdkOcrTextQueryRequest): Promise<SdkOcrFindTextResponse> => this.postJson('/api/sdk/ocr/find-text-candidates', payload),
    resolveText: async (payload: SdkOcrTextQueryRequest): Promise<SdkOcrResolveTextResponse> => this.postJson('/api/sdk/ocr/resolve-text', payload),
    resolveCandidate: async (payload: SdkOcrCandidateRequest): Promise<SdkOcrResolveCandidateResponse> => this.postJson('/api/sdk/ocr/resolve-candidate', payload),
    overlay: async (payload: SdkOcrOverlayRequest): Promise<SdkOverlayArtifactResponse> => this.postJson('/api/sdk/ocr/overlay', payload),
  };

  readonly vision = {
    locate: async (payload: SdkVisionLocateRequest): Promise<SdkVisionLocateResponse> => this.postJson('/api/sdk/vision/locate', payload),
    locateAll: async (payload: SdkVisionLocateAllRequest): Promise<SdkVisionLocateAllResponse> => this.postJson('/api/sdk/vision/locate-all', payload),
    describe: async (payload: SdkVisionDescribeRequest): Promise<SdkVisionDescribeResponse> => this.postJson('/api/sdk/vision/describe', payload),
    overlay: async (payload: SdkVisionOverlayRequest): Promise<SdkOverlayArtifactResponse> => this.postJson('/api/sdk/vision/overlay', payload),
  };

  readonly introspection = {
    models: async (options?: WindieSdkQueryOptions): Promise<SdkModelsResponse> => this.getJson(`/api/sdk/models${buildQueryString(options)}`),
    toolSchemas: async (options?: WindieSdkQueryOptions): Promise<SdkToolSchemasResponse> => this.getJson(`/api/sdk/tool-schemas${buildQueryString(options)}`),
    toolCapabilities: async (toolName: string, options?: WindieSdkQueryOptions): Promise<SdkToolCapabilitiesResponse> => this.getJson(`/api/sdk/tool-capabilities/${encodeURIComponent(toolName)}${buildQueryString(options)}`),
    systemPrompt: async (options?: WindieSdkQueryOptions): Promise<SdkSystemPromptResponse> => this.getJson(`/api/sdk/system-prompt${buildQueryString(options)}`),
    promptPreview: async (payload: SdkPromptPreviewRequest): Promise<SdkPromptPreviewResponse> => this.postJson('/api/sdk/prompt-preview', payload),
    queryPlan: async (payload: SdkQueryPlanRequest): Promise<SdkQueryPlanResponse> => this.postJson('/api/sdk/query-plan', payload),
  };

  readonly agent = {
    connect: async (options?: WindieAgentConnectOptions): Promise<WindieAgentSession> => this.connectAgent(options),
  };

  constructor(options: WindieSdkClientOptions) {
    this.httpBaseUrl = normalizeHttpBaseUrl(options.httpBaseUrl);
    this.wsUrl = options.wsUrl ? normalizeWsUrl(options.wsUrl) : deriveWsUrl(options.httpBaseUrl);
    this.fetchImpl = resolveFetchImplementation(options.fetchImpl);
    this.WebSocketImpl = resolveWebSocketImplementation(options.WebSocketImpl);
    this.defaultUserId = options.defaultUserId;
    this.defaultOperatingSystem = options.defaultOperatingSystem;
  }

  async models(options?: WindieSdkQueryOptions): Promise<SdkModelsResponse> {
    return this.introspection.models(options);
  }

  async toolSchemas(options?: WindieSdkQueryOptions): Promise<SdkToolSchemasResponse> {
    return this.introspection.toolSchemas(options);
  }

  async toolCapabilities(toolName: string, options?: WindieSdkQueryOptions): Promise<SdkToolCapabilitiesResponse> {
    return this.introspection.toolCapabilities(toolName, options);
  }

  async systemPrompt(options?: WindieSdkQueryOptions): Promise<SdkSystemPromptResponse> {
    return this.introspection.systemPrompt(options);
  }

  async promptPreview(payload: SdkPromptPreviewRequest): Promise<SdkPromptPreviewResponse> {
    return this.introspection.promptPreview(payload);
  }

  async queryPlan(payload: SdkQueryPlanRequest): Promise<SdkQueryPlanResponse> {
    return this.introspection.queryPlan(payload);
  }

  async connectAgent(options: WindieAgentConnectOptions = {}): Promise<WindieAgentSession> {
    const userId = options.userId ?? this.defaultUserId;
    if (!userId) {
      throw new Error('WindieSdkClient.connectAgent requires a userId or defaultUserId');
    }
    const socket = new this.WebSocketImpl(this.wsUrl);
    const session = new WindieAgentSession(socket, {
      user_id: userId,
      operating_system: options.operatingSystem ?? this.defaultOperatingSystem,
    });
    await session.waitForOpen();
    return session;
  }

  artifactUrl(artifactId: string): string {
    return `${this.httpBaseUrl}/api/artifacts/${encodeURIComponent(artifactId)}`;
  }

  private async uploadArtifact(file: Blob | File, filename?: string): Promise<SdkArtifactUploadResponse> {
    const form = new FormData();
    const inferredName = filename ?? ((typeof File !== 'undefined' && file instanceof File) ? file.name : 'artifact.bin');
    form.append('file', file, inferredName);
    return this.request<SdkArtifactUploadResponse>('/api/artifacts/', {
      method: 'POST',
      body: form,
    });
  }

  private async getJson<TResponse>(path: string): Promise<TResponse> {
    return this.request<TResponse>(path, {
      method: 'GET',
    });
  }

  private async postJson<TResponse>(path: string, body: unknown): Promise<TResponse> {
    return this.request<TResponse>(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  private async request<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
    const response = await this.fetchImpl(`${this.httpBaseUrl}${path}`, init);
    if (!response.ok) {
      const bodyText = await response.text();
      throw new Error(buildErrorMessage(response.status, response.statusText, bodyText));
    }
    return response.json() as Promise<TResponse>;
  }
}

export type { ToolSchema };
