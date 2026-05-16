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

function resolveFetchImplementation(fetchImpl?: FetchLike): FetchLike {
  if (fetchImpl) {
    return fetchImpl;
  }
  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch.bind(globalThis);
  }
  throw new Error('WindieSdkClient requires a fetch implementation');
}

function normalizeHttpBaseUrl(httpBaseUrl: string): string {
  return httpBaseUrl.replace(/\/+$/, '');
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
