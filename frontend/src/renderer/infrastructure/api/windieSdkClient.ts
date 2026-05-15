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
  agent_definition?: JsonRecord;
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
  agent_definition?: JsonRecord;
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
  fetchImpl?: FetchLike;
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

export type WindieToolDefinition = {
  name: string;
  description?: string;
  schema: JsonRecord;
  execution_target?: 'sidecar';
  argument_resolution?: string;
  module?: string;
  workspacePath?: string;
};

export type WindieSkillDefinition = JsonRecord & {
  id?: string;
  type?: string;
  content?: string;
  priority?: number;
};

export type WindieMcpDefinition = JsonRecord & {
  id?: string;
  name?: string;
  command?: string;
  args?: string[];
};

export type WindiePluginDefinition = JsonRecord & {
  path?: string;
  pluginPath?: string;
};

export type WindieWakeUpOptions = {
  backendUrl?: string;
  userId?: string;
  systemPrompt?: string;
  workspacePath?: string;
  tools?: WindieToolDefinition[];
  skills?: WindieSkillDefinition[];
  mcps?: WindieMcpDefinition[];
  plugins?: WindiePluginDefinition[];
  conversationRef?: string;
  agentId?: string;
  name?: string;
};

export type WindieLocalRuntimeClient = {
  status?: () => Promise<JsonRecord>;
  listTools?: () => Promise<{ version?: number; tools?: JsonRecord[] }>;
  registerModuleTool?: (tool: WindieToolDefinition, context: { workspacePath?: string }) => Promise<JsonRecord>;
  registerPlugin?: (plugin: WindiePluginDefinition) => Promise<JsonRecord>;
  registerMcp?: (mcp: WindieMcpDefinition) => Promise<JsonRecord>;
  executeTool?: (payload: { toolName: string; args: JsonRecord }) => Promise<{ success?: boolean; data?: JsonRecord; error?: string }>;
  shutdown?: () => Promise<void>;
};

export type WindieLocalRuntimeProviderContext = {
  wakeUp: WindieWakeUpOptions;
  needsLocalRuntime: boolean;
};

export type WindieLocalRuntimeProvider = (
  context: WindieLocalRuntimeProviderContext,
) => Promise<WindieLocalRuntimeClient | undefined> | WindieLocalRuntimeClient | undefined;

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

function normalizeToolResultData(data: JsonRecord | undefined): JsonRecord | undefined {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return undefined;
  }
  if (typeof data.llm_content === 'string' && data.llm_content) {
    return data;
  }
  const display = typeof data.return_display === 'string' ? data.return_display : '';
  return {
    ...data,
    llm_content: display || JSON.stringify(data),
  };
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

function markSdkOwnedToolEvent(event: BackendEvent): BackendEvent {
  if (event.type !== 'tool-call' && event.type !== 'tool-bundle') {
    return event;
  }
  const cloned = JSON.parse(JSON.stringify(event)) as BackendEvent;
  if (cloned.type === 'tool-call') {
    cloned.payload = {
      ...(cloned.payload ?? {}),
      metadata: {
        ...((cloned.payload?.metadata ?? {}) as JsonRecord),
        skip_frontend_execution: true,
        execution_owner: 'sdk-runtime',
      },
    };
    return cloned;
  }
  const payload = (cloned.payload ?? {}) as Extract<BackendEvent, { type: 'tool-bundle' }>['payload'];
  const tools = Array.isArray(payload?.tools) ? payload.tools : undefined;
  cloned.payload = {
    ...payload,
    metadata: {
      ...(((payload as JsonRecord).metadata ?? {}) as JsonRecord),
      skip_frontend_execution: true,
      execution_owner: 'sdk-runtime',
    },
    tools: tools
      ? tools.map(tool => ({
          ...(tool ?? {}),
          metadata: {
            ...((tool?.metadata ?? {}) as JsonRecord),
            skip_frontend_execution: true,
            execution_owner: 'sdk-runtime',
          },
        }))
      : payload?.tools,
  } as typeof cloned.payload;
  return cloned;
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
    private readonly localRuntime?: WindieLocalRuntimeClient,
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
          const listenerEvent = this.projectBackendEventForListeners(parsed);
          this.emit('message', listenerEvent);
          this.emit('event', listenerEvent);
          this.emit(listenerEvent.type, listenerEvent as WindieAgentEventMap[BackendEventType]);
          void this.maybeExecuteLocalTool(parsed);
        } else {
          this.emit('message', parsed);
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
      user_id: this.handshake.user_id,
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
      user_id: this.handshake.user_id,
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
      user_id: this.handshake.user_id,
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
      user_id: this.handshake.user_id,
      timestamp: new Date().toISOString(),
    }));
    return id;
  }

  private projectBackendEventForListeners(event: BackendEvent): BackendEvent {
    if (!this.localRuntime?.executeTool) {
      return event;
    }
    return markSdkOwnedToolEvent(event);
  }

  private async maybeExecuteLocalTool(event: BackendEvent): Promise<void> {
    if (!this.localRuntime?.executeTool) {
      return;
    }
    if (event.type === 'tool-bundle') {
      await this.executeLocalToolBundle(event);
      return;
    }
    if (event.type !== 'tool-call') {
      return;
    }
    const payload = event.payload ?? {};
    if (payload.metadata?.skip_frontend_execution === true) {
      return;
    }
    const toolName = typeof payload.tool_name === 'string' ? payload.tool_name : '';
    const requestId = typeof payload.request_id === 'string'
      ? payload.request_id
      : (typeof payload.correlation_id === 'string' ? payload.correlation_id : '');
    if (!toolName || !requestId) {
      return;
    }
    const startedAt = Date.now();
    try {
      const result = await this.localRuntime.executeTool({
        toolName,
        args: payload.parameters && typeof payload.parameters === 'object'
          ? payload.parameters
          : {},
      });
      this.sendToolResult({
        requestId,
        success: result.success !== false,
        data: normalizeToolResultData(result.data),
        error: result.success === false ? result.error || 'Tool execution failed' : undefined,
        elapsedMs: Date.now() - startedAt,
      });
    } catch (error) {
      this.sendToolResult({
        requestId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        elapsedMs: Date.now() - startedAt,
      });
    }
  }

  private async executeLocalToolBundle(event: Extract<BackendEvent, { type: 'tool-bundle' }>): Promise<void> {
    const payload = event.payload ?? {};
    const bundleId = typeof payload.bundle_id === 'string' ? payload.bundle_id : '';
    const steps = Array.isArray(payload.tools) ? payload.tools : [];
    if (!bundleId || steps.length === 0 || !this.localRuntime?.executeTool) {
      return;
    }
    const stepResults = [];
    for (const step of steps) {
      const toolName = typeof step?.name === 'string' ? step.name : '';
      if (!toolName) {
        continue;
      }
      try {
        const result = await this.localRuntime.executeTool({
          toolName,
          args: step.args && typeof step.args === 'object' ? step.args : {},
        });
        stepResults.push({
          tool: toolName,
          status: result.success === false ? 'failure' : 'success',
          output: result.success === false
            ? { error: result.error || 'Tool execution failed' }
            : normalizeToolResultData(result.data) ?? {},
        });
      } catch (error) {
        stepResults.push({
          tool: toolName,
          status: 'failure',
          output: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }
    if (stepResults.length === 0) {
      return;
    }
    const failures = stepResults.filter(step => step.status !== 'success');
    const status = failures.length === 0
      ? 'success'
      : (failures.length === stepResults.length ? 'failure' : 'partial_failure');
    this.socket.send(JSON.stringify({
      id: createMessageId(),
      type: 'tool-bundle-result',
      payload: {
        bundle_id: bundleId,
        status,
        step_results: stepResults,
        error: failures.length > 0 ? `${failures.length} bundled tool step(s) failed` : undefined,
      },
      user_id: this.handshake.user_id,
      timestamp: new Date().toISOString(),
    }));
  }

  private sendToolResult(payload: {
    requestId: string;
    success: boolean;
    data?: JsonRecord;
    error?: string;
    elapsedMs?: number;
  }): string {
    const id = createMessageId();
    this.socket.send(JSON.stringify({
      id,
      type: 'tool-result',
      payload: {
        request_id: payload.requestId,
        success: payload.success,
        data: payload.data,
        error: payload.error,
      },
      user_id: this.handshake.user_id,
      timestamp: new Date().toISOString(),
      metadata: {
        local_execution_elapsed_ms: payload.elapsedMs,
      },
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
  private readonly fetchImpl: FetchLike;

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

  constructor(options: WindieSdkClientOptions) {
    this.httpBaseUrl = normalizeHttpBaseUrl(options.httpBaseUrl);
    this.fetchImpl = resolveFetchImplementation(options.fetchImpl);
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

export type SidecarDaemonClientOptions = {
  baseUrl: string;
  token: string;
  fetchImpl?: FetchLike;
};

export type WindieAutoSidecarOptions = {
  discoveryFile?: string;
  daemonScript?: string;
  pythonCommand?: string;
  host?: string;
  port?: number;
  startTimeoutMs?: number;
  pollIntervalMs?: number;
  fetchImpl?: FetchLike;
};

export class SidecarDaemonHttpClient implements WindieLocalRuntimeClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: SidecarDaemonClientOptions) {
    this.baseUrl = normalizeHttpBaseUrl(options.baseUrl);
    this.token = options.token;
    this.fetchImpl = resolveFetchImplementation(options.fetchImpl);
  }

  async status(): Promise<JsonRecord> {
    return this.request('/status', { method: 'GET' });
  }

  async listTools(): Promise<{ version?: number; tools?: JsonRecord[] }> {
    return this.request('/tools', { method: 'GET' });
  }

  async registerModuleTool(tool: WindieToolDefinition, context: { workspacePath?: string }): Promise<JsonRecord> {
    return this.post('/tools/register-module', {
      name: tool.name,
      description: tool.description,
      module: tool.module,
      schema: tool.schema,
      workspace_path: tool.workspacePath ?? context.workspacePath,
    });
  }

  async registerPlugin(plugin: WindiePluginDefinition): Promise<JsonRecord> {
    return this.post('/plugins/register', plugin);
  }

  async registerMcp(mcp: WindieMcpDefinition): Promise<JsonRecord> {
    return this.post('/mcps/register', mcp);
  }

  async executeTool(payload: { toolName: string; args: JsonRecord }): Promise<{ success?: boolean; data?: JsonRecord; error?: string }> {
    return this.post('/execute-tool', {
      tool_name: payload.toolName,
      args: payload.args,
    });
  }

  async shutdown(): Promise<void> {
    await this.post('/shutdown', {});
  }

  private async post<TResponse>(path: string, body: unknown): Promise<TResponse> {
    return this.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private async request<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
    const headers = new Headers(init.headers);
    headers.set('x-windie-sidecar-token', this.token);
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });
    if (!response.ok) {
      throw new Error(buildErrorMessage(response.status, response.statusText, await response.text()));
    }
    return response.json() as Promise<TResponse>;
  }
}

type NodeFsLike = {
  existsSync(path: string): boolean;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
  readFileSync(path: string, encoding: BufferEncoding): string;
};

type NodeOsLike = {
  tmpdir(): string;
};

type NodePathLike = {
  dirname(path: string): string;
  join(...parts: string[]): string;
  resolve(...parts: string[]): string;
};

type NodeChildProcessLike = {
  spawn(command: string, args: string[], options?: JsonRecord): {
    kill?: (signal?: string) => void;
    unref?: () => void;
  };
};

async function importNodeModule<TModule>(specifier: string): Promise<TModule> {
  return import(/* @vite-ignore */ specifier) as Promise<TModule>;
}

async function loadNodeSidecarModules(): Promise<{
  fs: NodeFsLike;
  os: NodeOsLike;
  path: NodePathLike;
  childProcess: NodeChildProcessLike;
}> {
  const [fs, os, path, childProcess] = await Promise.all([
    importNodeModule<NodeFsLike>('node:fs'),
    importNodeModule<NodeOsLike>('node:os'),
    importNodeModule<NodePathLike>('node:path'),
    importNodeModule<NodeChildProcessLike>('node:child_process'),
  ]);
  return { fs, os, path, childProcess };
}

function normalizeDiscovery(raw: unknown): SidecarDaemonClientOptions | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const payload = raw as JsonRecord;
  const baseUrl = typeof payload.base_url === 'string'
    ? payload.base_url.trim()
    : (typeof payload.baseUrl === 'string' ? payload.baseUrl.trim() : '');
  const token = typeof payload.token === 'string' ? payload.token.trim() : '';
  if (!baseUrl || !token) {
    return null;
  }
  return { baseUrl, token };
}

function readDaemonDiscovery(fs: NodeFsLike, discoveryFile: string): SidecarDaemonClientOptions | null {
  try {
    if (!fs.existsSync(discoveryFile)) {
      return null;
    }
    return normalizeDiscovery(JSON.parse(fs.readFileSync(discoveryFile, 'utf8')));
  } catch {
    return null;
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function probeDaemon(
  discovery: SidecarDaemonClientOptions | null,
  fetchImpl?: FetchLike,
): Promise<SidecarDaemonHttpClient | null> {
  if (!discovery) {
    return null;
  }
  const client = new SidecarDaemonHttpClient({
    ...discovery,
    fetchImpl,
  });
  try {
    await client.status();
    return client;
  } catch {
    return null;
  }
}

function resolveDaemonScript(options: WindieAutoSidecarOptions, fs: NodeFsLike, path: NodePathLike): string {
  const processLike = (globalThis as unknown as {
    process?: { cwd?: () => string; env?: Record<string, string | undefined> };
  }).process;
  const explicit = options.daemonScript
    ?? processLike?.env?.WINDIE_SIDECAR_DAEMON_SCRIPT;
  if (explicit) {
    return path.resolve(explicit);
  }
  const cwd = typeof processLike?.cwd === 'function'
    ? processLike.cwd()
    : '.';
  const candidates = [
    path.resolve(cwd, 'frontend/src/main/python/sidecar_daemon.py'),
    path.resolve(cwd, 'src/main/python/sidecar_daemon.py'),
  ];
  const found = candidates.find(candidate => fs.existsSync(candidate));
  if (found) {
    return found;
  }
  throw new Error(
    'WindieClient could not locate sidecar_daemon.py. Set WINDIE_SIDECAR_DAEMON_SCRIPT or pass autoSidecar.daemonScript.',
  );
}

export function createWindieLocalRuntimeProvider(
  options: WindieAutoSidecarOptions = {},
): WindieLocalRuntimeProvider {
  let cachedRuntime: WindieLocalRuntimeClient | undefined;
  let ownedProcess: { kill?: (signal?: string) => void; unref?: () => void } | null = null;
  return async () => {
    if (cachedRuntime) {
      return cachedRuntime;
    }
    let modules: Awaited<ReturnType<typeof loadNodeSidecarModules>>;
    try {
      modules = await loadNodeSidecarModules();
    } catch (error) {
      throw new Error(
        `WindieClient local tools require a Node sidecar runtime provider: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const { fs, os, path, childProcess } = modules;
    const processLike = (globalThis as unknown as {
      process?: { env?: Record<string, string | undefined> };
    }).process;
    const discoveryFile = path.resolve(
      options.discoveryFile
        ?? processLike?.env?.WINDIE_SIDECAR_DAEMON_DISCOVERY_FILE
        ?? path.join(os.tmpdir(), 'windieos', 'sidecar-daemon.json'),
    );
    const fetchImpl = options.fetchImpl;
    const existing = await probeDaemon(readDaemonDiscovery(fs, discoveryFile), fetchImpl);
    if (existing) {
      cachedRuntime = existing;
      return cachedRuntime;
    }

    const daemonScript = resolveDaemonScript(options, fs, path);
    fs.mkdirSync(path.dirname(discoveryFile), { recursive: true });
    const pythonCommand = options.pythonCommand
      ?? processLike?.env?.WINDIE_PYTHON
      ?? 'python3';
    const args = [
      daemonScript,
      '--discovery-file',
      discoveryFile,
    ];
    if (options.host) {
      args.push('--host', options.host);
    }
    if (typeof options.port === 'number') {
      args.push('--port', String(options.port));
    }
    ownedProcess = childProcess.spawn(pythonCommand, args, {
      stdio: 'ignore',
      detached: true,
    });
    ownedProcess.unref?.();

    const deadline = Date.now() + (options.startTimeoutMs ?? 10000);
    const pollIntervalMs = options.pollIntervalMs ?? 100;
    while (Date.now() < deadline) {
      const started = await probeDaemon(readDaemonDiscovery(fs, discoveryFile), fetchImpl);
      if (started) {
        cachedRuntime = {
          status: () => started.status(),
          listTools: () => started.listTools(),
          registerModuleTool: (tool, context) => started.registerModuleTool(tool, context),
          registerPlugin: plugin => started.registerPlugin(plugin),
          registerMcp: mcp => started.registerMcp(mcp),
          executeTool: payload => started.executeTool(payload),
          shutdown: async () => {
            try {
              await started.shutdown();
            } finally {
              ownedProcess?.kill?.('SIGTERM');
              ownedProcess = null;
              cachedRuntime = undefined;
            }
          },
        };
        return cachedRuntime;
      }
      await sleep(pollIntervalMs);
    }
    ownedProcess?.kill?.('SIGTERM');
    ownedProcess = null;
    throw new Error(`Timed out waiting for Windie sidecar daemon discovery at ${discoveryFile}`);
  };
}

export type WindieClientOptions = {
  backendUrl?: string;
  httpBaseUrl?: string;
  wsUrl?: string;
  fetchImpl?: FetchLike;
  WebSocketImpl?: WebSocketConstructor;
  defaultUserId?: string;
  localRuntime?: WindieLocalRuntimeClient;
  sidecar?: WindieLocalRuntimeClient;
  sidecarDaemon?: SidecarDaemonClientOptions;
  ensureLocalRuntime?: WindieLocalRuntimeProvider;
  autoStartLocalRuntime?: boolean;
  autoSidecar?: WindieAutoSidecarOptions;
};

export function moduleTool(tool: WindieToolDefinition & { module: string }): WindieToolDefinition {
  return {
    ...tool,
    execution_target: 'sidecar',
    argument_resolution: tool.argument_resolution ?? 'passthrough',
  };
}

export class WindieAgent {
  constructor(
    readonly id: string,
    readonly session: WindieAgentSession,
    readonly agentDefinition: JsonRecord,
    private readonly sdkClient: WindieSdkClient,
    private readonly owner: WindieClient,
  ) {}

  async ask(text: string, options: Partial<Omit<WindieAgentQueryInput, 'text' | 'conversationRef'>> & { conversationRef?: string } = {}): Promise<string> {
    return this.session.query({
      ...options,
      text,
      conversationRef: options.conversationRef ?? `conv-${this.id}`,
    });
  }

  async query(payload: WindieAgentQueryInput): Promise<string> {
    return this.session.query(payload);
  }

  async run(input: string | WindieAgentQueryInput, options: Partial<Omit<WindieAgentQueryInput, 'text' | 'conversationRef'>> & { conversationRef?: string } = {}): Promise<string> {
    if (typeof input === 'string') {
      return this.ask(input, options);
    }
    return this.query(input);
  }

  async stream(input: string | WindieAgentQueryInput, options: Partial<Omit<WindieAgentQueryInput, 'text' | 'conversationRef'>> & { conversationRef?: string } = {}): Promise<{ queryMessageId: string; session: WindieAgentSession }> {
    const queryMessageId = await this.run(input, options);
    return {
      queryMessageId,
      session: this.session,
    };
  }

  async stop(conversationRef?: string | null): Promise<string> {
    return this.session.stopQuery(conversationRef);
  }

  sleep(): void {
    this.session.close(1000, 'sleep');
  }

  async listModels(): Promise<SdkModelsResponse> {
    return this.sdkClient.models();
  }

  listAgents(): Array<{ id: string; agentDefinition: JsonRecord }> {
    return this.owner.listAgents();
  }
}

export class WindieClient {
  private readonly defaultOptions: WindieClientOptions;
  private readonly activeAgents = new Map<string, WindieAgent>();

  constructor(options: WindieClientOptions = {}) {
    this.defaultOptions = options;
  }

  async wakeUp(options: WindieWakeUpOptions): Promise<WindieAgent> {
    const backendUrl = this.resolveBackendUrl(options.backendUrl);
    const localRuntime = await this.resolveLocalRuntimeForWakeUp(options);
    const sdkClient = this.createSdkClient(backendUrl);

    const localTools = await this.prepareLocalRuntime(options, localRuntime);
    const agentDefinition = buildWakeUpAgentDefinition(options, localTools);
    const wsUrl = this.defaultOptions.wsUrl
      ? normalizeWsUrl(this.defaultOptions.wsUrl)
      : deriveWsUrl(backendUrl);
    const WebSocketImpl = resolveWebSocketImplementation(this.defaultOptions.WebSocketImpl);
    const socket = new WebSocketImpl(wsUrl);
    const session = new WindieAgentSession(socket, {
      user_id: options.userId ?? this.defaultOptions.defaultUserId ?? 'local-sdk-user',
      operating_system: detectOperatingSystem(),
      agent_definition: agentDefinition,
    }, localRuntime);
    await session.waitForOpen();
    const id = typeof agentDefinition.id === 'string' ? agentDefinition.id : createMessageId();
    const agent = new WindieAgent(id, session, agentDefinition, sdkClient, this);
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
    const localRuntime = this.resolveConfiguredLocalRuntime();
    return localRuntime?.listTools ? localRuntime.listTools() : null;
  }

  async status(): Promise<JsonRecord | null> {
    const localRuntime = this.resolveConfiguredLocalRuntime();
    return localRuntime?.status ? localRuntime.status() : null;
  }

  async shutdownLocalRuntime(): Promise<void> {
    const localRuntime = this.resolveConfiguredLocalRuntime();
    await localRuntime?.shutdown?.();
  }

  private resolveBackendUrl(backendUrl?: string): string {
    return backendUrl ?? this.defaultOptions.backendUrl ?? this.defaultOptions.httpBaseUrl ?? 'https://api.windieos.com';
  }

  private createSdkClient(backendUrl: string): WindieSdkClient {
    return new WindieSdkClient({
      httpBaseUrl: backendUrl,
      fetchImpl: this.defaultOptions.fetchImpl,
    });
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

  private async resolveLocalRuntimeForWakeUp(options: WindieWakeUpOptions): Promise<WindieLocalRuntimeClient | undefined> {
    const configuredRuntime = this.resolveConfiguredLocalRuntime();
    if (configuredRuntime) {
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
      return this.defaultOptions.ensureLocalRuntime(context);
    }
    if (this.defaultOptions.autoStartLocalRuntime === false) {
      return undefined;
    }
    return createWindieLocalRuntimeProvider({
      fetchImpl: this.defaultOptions.fetchImpl,
      ...(this.defaultOptions.autoSidecar ?? {}),
    })(context);
  }

  private needsLocalRuntime(options: WindieWakeUpOptions): boolean {
    return Boolean(
      (options.tools ?? []).some(tool => Boolean(tool.module))
      || (options.plugins ?? []).length > 0
      || (options.mcps ?? []).length > 0,
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
    const explicitTools = (options.tools ?? [])
      .filter(tool => !tool.module)
      .map(tool => buildManifestTool(tool));
    return [...registeredTools, ...explicitTools];
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
      mode: 'default_plus_client',
      client_manifest: {
        version: 1,
        tools,
      },
    },
    skills: options.skills ?? [],
    mcps: options.mcps ?? [],
    plugins: options.plugins ?? [],
    runtime: {
      workspace_path: options.workspacePath,
      operating_system: detectOperatingSystem(),
    },
  };
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

export type { ToolSchema };
