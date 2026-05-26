"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WindieSdkClient = void 0;
function resolveFetchImplementation(fetchImpl) {
    if (fetchImpl) {
        return fetchImpl;
    }
    if (typeof globalThis.fetch === 'function') {
        return globalThis.fetch.bind(globalThis);
    }
    throw new Error('WindieSdkClient requires a fetch implementation');
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
        return `Windie SDK request failed (${status} ${statusText})`;
    }
    return `Windie SDK request failed (${status} ${statusText}): ${trimmedBody}`;
}
class WindieSdkClient {
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
        this.httpBaseUrl = normalizeHttpBaseUrl(options.httpBaseUrl);
        this.fetchImpl = resolveFetchImplementation(options.fetchImpl);
        this.authToken = options.authToken?.trim() || undefined;
    }
    async models(options) {
        return this.introspection.models(options);
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
            body: JSON.stringify(body),
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
exports.WindieSdkClient = WindieSdkClient;
