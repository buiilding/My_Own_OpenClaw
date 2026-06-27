/**
 * Implements the hosted backend http client integration for the TypeScript SDK runtime.
 */

import type { JsonRecord } from '../conversation/types.js';

export type FetchLike = typeof fetch;

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

export type AgentInstallIdentityResponse = {
  success?: boolean;
  user_id: string;
  install_id: string;
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

export type SdkGenerateTitleRequest = {
  user_id?: string;
  user_message: string;
  assistant_message: string;
  model_id?: string;
  model_provider?: string;
};

export type SdkGenerateTitleResponse = {
  title: string;
  success?: boolean;
};

export type SdkEmbeddingRequest = {
  text: string;
  model_name?: string;
};

export type SdkEmbeddingResponse = {
  embedding: number[];
  provider_id: string;
  model_id: string;
  model_name: string;
  dimension: number;
  embedding_space_version: string;
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

export type AgentSdkQueryOptions = {
  userId?: string;
  modelId?: string;
  modelProvider?: string;
  interactionMode?: SdkInteractionMode;
};

export type AgentHostedBackendClientOptions = {
  httpBaseUrl: string;
  fetchImpl?: FetchLike;
  authToken?: string;
};

function resolveFetchImplementation(fetchImpl?: FetchLike): FetchLike {
  if (fetchImpl) {
    return fetchImpl;
  }
  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch.bind(globalThis);
  }
  throw new Error('Agent SDK HTTP client requires a fetch implementation');
}

function normalizeHttpBaseUrl(httpBaseUrl: string): string {
  return httpBaseUrl.replace(/\/+$/, '');
}

function buildQueryString(options: AgentSdkQueryOptions = {}): string {
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
    return `Agent SDK request failed (${status} ${statusText})`;
  }
  return `Agent SDK request failed (${status} ${statusText}): ${trimmedBody}`;
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function filterKeys(source: unknown, keys: readonly string[]): JsonRecord {
  if (!isJsonRecord(source)) {
    return {};
  }
  const filtered: JsonRecord = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined) {
      filtered[key] = source[key];
    }
  }
  return filtered;
}

function filterImageSource(value: unknown): JsonRecord {
  return filterKeys(value, ['artifact_id', 'image_base64']);
}

function filterBoundingBox(value: unknown): JsonRecord {
  return filterKeys(value, ['x', 'y', 'width', 'height']);
}

function filterOverlayPoint(value: unknown): JsonRecord {
  return filterKeys(value, ['x', 'y', 'label', 'color']);
}

function filterOverlayRegion(value: unknown): JsonRecord {
  return filterKeys(value, ['x', 'y', 'width', 'height', 'label', 'color']);
}

function filterPromptContribution(value: unknown): JsonRecord {
  return filterKeys(value, ['id', 'type', 'priority', 'content', 'source_path']);
}

function filterPromptContributions(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(filterPromptContribution) : [];
}

function filterAgentDefinition(value: unknown): JsonRecord | undefined {
  if (!isJsonRecord(value)) {
    return undefined;
  }
  const filtered = filterKeys(value, [
    'version',
    'id',
    'name',
    'mode',
    'system_prompt',
    'tools',
    'prompt_layers',
    'skills',
    'agents_md',
    'plugins',
    'runtime',
    'metadata',
  ]);
  if (Object.prototype.hasOwnProperty.call(filtered, 'system_prompt')) {
    filtered.system_prompt = filterKeys(filtered.system_prompt, ['mode', 'content']);
  }
  if (Object.prototype.hasOwnProperty.call(filtered, 'tools')) {
    filtered.tools = filterKeys(filtered.tools, [
      'mode',
      'client_manifest',
      'available_tools',
      'enabled_remote_tools',
      'disabled_tools',
      'disabled_capabilities',
    ]);
  }
  if (Object.prototype.hasOwnProperty.call(filtered, 'runtime')) {
    filtered.runtime = filterKeys(filtered.runtime, [
      'operating_system',
      'workspace_path',
      'coordinate_methods',
    ]);
  }
  for (const key of ['prompt_layers', 'skills', 'agents_md']) {
    if (Object.prototype.hasOwnProperty.call(filtered, key)) {
      filtered[key] = filterPromptContributions(filtered[key]);
    }
  }
  if (Array.isArray(filtered.plugins)) {
    filtered.plugins = filtered.plugins.map(plugin => {
      const nextPlugin = filterKeys(plugin, ['id', 'name', 'version', 'prompt_layers', 'metadata']);
      if (Object.prototype.hasOwnProperty.call(nextPlugin, 'prompt_layers')) {
        nextPlugin.prompt_layers = filterPromptContributions(nextPlugin.prompt_layers);
      }
      return nextPlugin;
    });
  }
  return filtered;
}

function filterPromptDebugPayload(value: unknown, includeConversationRef: boolean): JsonRecord {
  const allowedKeys = includeConversationRef
    ? ['user_id', 'model_id', 'model_provider', 'interaction_mode', 'include_tools', 'workspace_path', 'agent_definition', 'user_query_raw', 'conversation_ref', 'messages']
    : ['user_id', 'model_id', 'model_provider', 'interaction_mode', 'include_tools', 'workspace_path', 'agent_definition', 'user_query_raw', 'messages'];
  const filtered = filterKeys(value, allowedKeys);
  if (Object.prototype.hasOwnProperty.call(filtered, 'agent_definition')) {
    const agentDefinition = filterAgentDefinition(filtered.agent_definition);
    if (agentDefinition) {
      filtered.agent_definition = agentDefinition;
    } else {
      delete filtered.agent_definition;
    }
  }
  return filtered;
}

function filterSdkHttpPayload(path: string, body: unknown): unknown {
  const withImage = (keys: readonly string[]): JsonRecord => {
    const filtered = filterKeys(body, keys);
    if (Object.prototype.hasOwnProperty.call(filtered, 'image')) {
      filtered.image = filterImageSource(filtered.image);
    }
    return filtered;
  };
  if (path.startsWith('/api/sdk/ocr/')) {
    if (path === '/api/sdk/ocr/run') {
      return withImage(['image']);
    }
    if (path === '/api/sdk/ocr/resolve-candidate') {
      return withImage(['image', 'candidate_id']);
    }
    if (path === '/api/sdk/ocr/overlay') {
      return withImage(['image', 'text', 'candidate_id', 'threshold', 'max_results', 'show_labels']);
    }
    if (path === '/api/sdk/ocr/inspect') {
      return withImage(['image', 'text', 'threshold', 'max_results', 'include_overlay', 'show_labels']);
    }
    return withImage(['image', 'text', 'threshold', 'max_results']);
  }
  if (path === '/api/sdk/vision/locate') {
    return withImage(['image', 'description']);
  }
  if (path === '/api/sdk/vision/locate-all') {
    return withImage(['image', 'description', 'max_results']);
  }
  if (path === '/api/sdk/vision/describe') {
    const filtered = withImage(['image', 'region']);
    if (Object.prototype.hasOwnProperty.call(filtered, 'region')) {
      filtered.region = filterBoundingBox(filtered.region);
    }
    return filtered;
  }
  if (path === '/api/sdk/vision/overlay') {
    const filtered = withImage(['image', 'result', 'show_labels']);
    const result = isJsonRecord(filtered.result) ? filterKeys(filtered.result, ['image', 'points', 'regions']) : {};
    if (Object.prototype.hasOwnProperty.call(result, 'image')) {
      result.image = filterKeys(result.image, ['source_id', 'artifact_id', 'content_type', 'width', 'height']);
    }
    if (Array.isArray(result.points)) {
      result.points = result.points.map(filterOverlayPoint);
    }
    if (Array.isArray(result.regions)) {
      result.regions = result.regions.map(filterOverlayRegion);
    }
    filtered.result = result;
    return filtered;
  }
  if (path === '/api/sdk/prompt-preview') {
    return filterPromptDebugPayload(body, false);
  }
  if (path === '/api/sdk/query-plan') {
    return filterPromptDebugPayload(body, true);
  }
  if (path === '/api/semantic/title') {
    return filterKeys(body, ['user_id', 'user_message', 'assistant_message', 'model_id', 'model_provider']);
  }
  if (path === '/api/embeddings/') {
    return filterKeys(body, ['text', 'model_name']);
  }
  return body;
}

export class AgentHostedBackendClient {
  private readonly httpBaseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly authToken?: string;

  readonly artifacts = {
    upload: async (file: Blob | File, filename?: string): Promise<SdkArtifactUploadResponse> => this.uploadArtifact(file, filename),
    url: (artifactId: string): string => this.artifactUrl(artifactId),
    fetch: async (artifactId: string): Promise<Response> => this.fetchArtifact(artifactId),
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
    models: async (options?: AgentSdkQueryOptions): Promise<SdkModelsResponse> => this.getJson(`/api/sdk/models${buildQueryString(options)}`),
    toolSchemas: async (options?: AgentSdkQueryOptions): Promise<SdkToolSchemasResponse> => this.getJson(`/api/sdk/tool-schemas${buildQueryString(options)}`),
    toolCapabilities: async (toolName: string, options?: AgentSdkQueryOptions): Promise<SdkToolCapabilitiesResponse> => this.getJson(`/api/sdk/tool-capabilities/${encodeURIComponent(toolName)}${buildQueryString(options)}`),
    systemPrompt: async (options?: AgentSdkQueryOptions): Promise<SdkSystemPromptResponse> => this.getJson(`/api/sdk/system-prompt${buildQueryString(options)}`),
    promptPreview: async (payload: SdkPromptPreviewRequest): Promise<SdkPromptPreviewResponse> => this.postJson('/api/sdk/prompt-preview', payload),
    queryPlan: async (payload: SdkQueryPlanRequest): Promise<SdkQueryPlanResponse> => this.postJson('/api/sdk/query-plan', payload),
  };

  readonly titles = {
    generate: async (payload: SdkGenerateTitleRequest): Promise<SdkGenerateTitleResponse> => this.postJson('/api/semantic/title', payload),
  };

  readonly embeddings = {
    create: async (payload: SdkEmbeddingRequest): Promise<SdkEmbeddingResponse> => this.postJson('/api/embeddings/', {
      model_name: 'default',
      ...payload,
    }),
  };

  readonly install = {
    identity: async (): Promise<AgentInstallIdentityResponse> => this.getJson('/api/install/me'),
  };

  constructor(options: AgentHostedBackendClientOptions) {
    this.httpBaseUrl = normalizeHttpBaseUrl(options.httpBaseUrl);
    this.fetchImpl = resolveFetchImplementation(options.fetchImpl);
    this.authToken = options.authToken?.trim() || undefined;
  }

  async models(options?: AgentSdkQueryOptions): Promise<SdkModelsResponse> {
    return this.introspection.models(options);
  }

  async installIdentity(): Promise<AgentInstallIdentityResponse> {
    return this.install.identity();
  }

  async toolSchemas(options?: AgentSdkQueryOptions): Promise<SdkToolSchemasResponse> {
    return this.introspection.toolSchemas(options);
  }

  async toolCapabilities(toolName: string, options?: AgentSdkQueryOptions): Promise<SdkToolCapabilitiesResponse> {
    return this.introspection.toolCapabilities(toolName, options);
  }

  async systemPrompt(options?: AgentSdkQueryOptions): Promise<SdkSystemPromptResponse> {
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

  async fetchArtifact(artifactId: string): Promise<Response> {
    const response = await this.fetchImpl(this.artifactUrl(artifactId), {
      method: 'GET',
      headers: this.buildHeaders(),
    });
    if (!response.ok) {
      throw new Error(buildErrorMessage(response.status, response.statusText, await response.text()));
    }
    return response;
  }

  async generateConversationTitle(payload: SdkGenerateTitleRequest): Promise<SdkGenerateTitleResponse> {
    return this.titles.generate(payload);
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
      body: JSON.stringify(filterSdkHttpPayload(path, body)),
    });
  }

  private async request<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
    const response = await this.fetchImpl(`${this.httpBaseUrl}${path}`, {
      ...init,
      headers: this.buildHeaders(init.headers),
    });
    if (!response.ok) {
      const bodyText = await response.text();
      throw new Error(buildErrorMessage(response.status, response.statusText, bodyText));
    }
    return response.json() as Promise<TResponse>;
  }

  private buildHeaders(initHeaders?: HeadersInit): Headers {
    const headers = new Headers(initHeaders);
    if (this.authToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${this.authToken}`);
    }
    return headers;
  }
}
