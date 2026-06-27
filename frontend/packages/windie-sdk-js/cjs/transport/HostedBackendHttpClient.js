"use strict";
/**
 * Implements the hosted backend http client integration for the TypeScript SDK runtime.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentHostedBackendClient = void 0;
function resolveFetchImplementation(fetchImpl) {
    if (fetchImpl) {
        return fetchImpl;
    }
    if (typeof globalThis.fetch === 'function') {
        return globalThis.fetch.bind(globalThis);
    }
    throw new Error('Agent SDK HTTP client requires a fetch implementation');
}
function normalizeHttpBaseUrl(httpBaseUrl) {
    return httpBaseUrl.replace(/\/+$/, '');
}
function buildQueryString(options = {}) {
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
function buildErrorMessage(status, statusText, bodyText) {
    const trimmedBody = bodyText.trim();
    if (!trimmedBody) {
        return `Agent SDK request failed (${status} ${statusText})`;
    }
    return `Agent SDK request failed (${status} ${statusText}): ${trimmedBody}`;
}
function isJsonRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function filterKeys(source, keys) {
    if (!isJsonRecord(source)) {
        return {};
    }
    const filtered = {};
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined) {
            filtered[key] = source[key];
        }
    }
    return filtered;
}
function filterImageSource(value) {
    return filterKeys(value, ['artifact_id', 'image_base64']);
}
function filterBoundingBox(value) {
    return filterKeys(value, ['x', 'y', 'width', 'height']);
}
function filterOverlayPoint(value) {
    return filterKeys(value, ['x', 'y', 'label', 'color']);
}
function filterOverlayRegion(value) {
    return filterKeys(value, ['x', 'y', 'width', 'height', 'label', 'color']);
}
function filterPromptContribution(value) {
    return filterKeys(value, ['id', 'type', 'priority', 'content', 'source_path']);
}
function filterPromptContributions(value) {
    return Array.isArray(value) ? value.map(filterPromptContribution) : [];
}
function filterAgentDefinition(value) {
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
function filterPromptDebugPayload(value, includeConversationRef) {
    const allowedKeys = includeConversationRef
        ? ['user_id', 'model_id', 'model_provider', 'interaction_mode', 'include_tools', 'workspace_path', 'agent_definition', 'user_query_raw', 'conversation_ref', 'messages']
        : ['user_id', 'model_id', 'model_provider', 'interaction_mode', 'include_tools', 'workspace_path', 'agent_definition', 'user_query_raw', 'messages'];
    const filtered = filterKeys(value, allowedKeys);
    if (Object.prototype.hasOwnProperty.call(filtered, 'agent_definition')) {
        const agentDefinition = filterAgentDefinition(filtered.agent_definition);
        if (agentDefinition) {
            filtered.agent_definition = agentDefinition;
        }
        else {
            delete filtered.agent_definition;
        }
    }
    return filtered;
}
function filterSdkHttpPayload(path, body) {
    const withImage = (keys) => {
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
class AgentHostedBackendClient {
    constructor(options) {
        this.artifacts = {
            upload: async (file, filename) => this.uploadArtifact(file, filename),
            url: (artifactId) => this.artifactUrl(artifactId),
            fetch: async (artifactId) => this.fetchArtifact(artifactId),
        };
        this.ocr = {
            run: async (payload) => this.postJson('/api/sdk/ocr/run', payload),
            inspect: async (payload) => this.postJson('/api/sdk/ocr/inspect', payload),
            findText: async (payload) => this.postJson('/api/sdk/ocr/find-text', payload),
            findTextCandidates: async (payload) => this.postJson('/api/sdk/ocr/find-text-candidates', payload),
            resolveText: async (payload) => this.postJson('/api/sdk/ocr/resolve-text', payload),
            resolveCandidate: async (payload) => this.postJson('/api/sdk/ocr/resolve-candidate', payload),
            overlay: async (payload) => this.postJson('/api/sdk/ocr/overlay', payload),
        };
        this.vision = {
            locate: async (payload) => this.postJson('/api/sdk/vision/locate', payload),
            locateAll: async (payload) => this.postJson('/api/sdk/vision/locate-all', payload),
            describe: async (payload) => this.postJson('/api/sdk/vision/describe', payload),
            overlay: async (payload) => this.postJson('/api/sdk/vision/overlay', payload),
        };
        this.introspection = {
            models: async (options) => this.getJson(`/api/sdk/models${buildQueryString(options)}`),
            toolSchemas: async (options) => this.getJson(`/api/sdk/tool-schemas${buildQueryString(options)}`),
            toolCapabilities: async (toolName, options) => this.getJson(`/api/sdk/tool-capabilities/${encodeURIComponent(toolName)}${buildQueryString(options)}`),
            systemPrompt: async (options) => this.getJson(`/api/sdk/system-prompt${buildQueryString(options)}`),
            promptPreview: async (payload) => this.postJson('/api/sdk/prompt-preview', payload),
            queryPlan: async (payload) => this.postJson('/api/sdk/query-plan', payload),
        };
        this.titles = {
            generate: async (payload) => this.postJson('/api/semantic/title', payload),
        };
        this.embeddings = {
            create: async (payload) => this.postJson('/api/embeddings/', {
                model_name: 'default',
                ...payload,
            }),
        };
        this.install = {
            identity: async () => this.getJson('/api/install/me'),
        };
        this.httpBaseUrl = normalizeHttpBaseUrl(options.httpBaseUrl);
        this.fetchImpl = resolveFetchImplementation(options.fetchImpl);
        this.authToken = options.authToken?.trim() || undefined;
    }
    async models(options) {
        return this.introspection.models(options);
    }
    async installIdentity() {
        return this.install.identity();
    }
    async toolSchemas(options) {
        return this.introspection.toolSchemas(options);
    }
    async toolCapabilities(toolName, options) {
        return this.introspection.toolCapabilities(toolName, options);
    }
    async systemPrompt(options) {
        return this.introspection.systemPrompt(options);
    }
    async promptPreview(payload) {
        return this.introspection.promptPreview(payload);
    }
    async queryPlan(payload) {
        return this.introspection.queryPlan(payload);
    }
    artifactUrl(artifactId) {
        return `${this.httpBaseUrl}/api/artifacts/${encodeURIComponent(artifactId)}`;
    }
    async fetchArtifact(artifactId) {
        const response = await this.fetchImpl(this.artifactUrl(artifactId), {
            method: 'GET',
            headers: this.buildHeaders(),
        });
        if (!response.ok) {
            throw new Error(buildErrorMessage(response.status, response.statusText, await response.text()));
        }
        return response;
    }
    async generateConversationTitle(payload) {
        return this.titles.generate(payload);
    }
    async uploadArtifact(file, filename) {
        const form = new FormData();
        const inferredName = filename ?? ((typeof File !== 'undefined' && file instanceof File) ? file.name : 'artifact.bin');
        form.append('file', file, inferredName);
        return this.request('/api/artifacts/', {
            method: 'POST',
            body: form,
        });
    }
    async getJson(path) {
        return this.request(path, {
            method: 'GET',
        });
    }
    async postJson(path, body) {
        return this.request(path, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(filterSdkHttpPayload(path, body)),
        });
    }
    async request(path, init) {
        const response = await this.fetchImpl(`${this.httpBaseUrl}${path}`, {
            ...init,
            headers: this.buildHeaders(init.headers),
        });
        if (!response.ok) {
            const bodyText = await response.text();
            throw new Error(buildErrorMessage(response.status, response.statusText, bodyText));
        }
        return response.json();
    }
    buildHeaders(initHeaders) {
        const headers = new Headers(initHeaders);
        if (this.authToken && !headers.has('Authorization')) {
            headers.set('Authorization', `Bearer ${this.authToken}`);
        }
        return headers;
    }
}
exports.AgentHostedBackendClient = AgentHostedBackendClient;
