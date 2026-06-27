"use strict";
/**
 * Builds agent definition payloads for SDK callers.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAgentDefinition = buildAgentDefinition;
exports.isDefaultAgentDefinition = isDefaultAgentDefinition;
const CapabilityManifest_js_1 = require("./CapabilityManifest.js");
const DEFAULT_AGENT_DEFINITION_MODE = 'default';
function isJsonRecord(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
function normalizeString(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : '';
}
function normalizeNumber(value, fallback) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : fallback;
    }
    if (typeof value !== 'string' || !value.trim()) {
        return fallback;
    }
    const normalized = Number(value.trim());
    return Number.isFinite(normalized) ? normalized : fallback;
}
function normalizeStringList(values) {
    if (!Array.isArray(values)) {
        return [];
    }
    const normalized = [];
    const seen = new Set();
    for (const value of values) {
        const item = normalizeString(value);
        if (!item || seen.has(item)) {
            continue;
        }
        seen.add(item);
        normalized.push(item);
    }
    return normalized;
}
function normalizePromptLayers(values) {
    if (!Array.isArray(values)) {
        return [];
    }
    return values
        .filter(isJsonRecord)
        .map((layer, index) => ({
        id: normalizeString(layer.id) || `client-layer-${index}`,
        type: normalizeString(layer.type) || 'custom',
        priority: normalizeNumber(layer.priority, 100),
        content: normalizeString(layer.content),
        ...(normalizeString(layer.revision) ? { revision: normalizeString(layer.revision) } : {}),
        ...(normalizeString(layer.source_path) ? { source_path: normalizeString(layer.source_path) } : {}),
    }))
        .filter(layer => Boolean(layer.id && layer.type && layer.content));
}
function buildCustomInstructionLayer(customInstructions) {
    const content = normalizeString(customInstructions);
    if (!content) {
        return null;
    }
    return {
        id: 'custom-instructions',
        type: 'custom_instructions',
        priority: 60,
        content,
    };
}
function clientManifestHasTools(clientToolManifest) {
    return Array.isArray(clientToolManifest?.tools) && clientToolManifest.tools.length > 0;
}
function buildAgentDefinition(options = {}) {
    if (Object.prototype.hasOwnProperty.call(options, 'agents_md')) {
        throw new Error('buildAgentDefinition accepts agentsMd; snake_case agents_md input is not supported.');
    }
    const includeToolManifest = options.includeToolManifest !== false;
    const clientToolManifest = includeToolManifest
        ? (isJsonRecord(options.clientToolManifest) ? options.clientToolManifest : { version: 1, tools: [] })
        : null;
    const enabledRemoteTools = normalizeStringList(options.enabledRemoteTools);
    const disabledTools = normalizeStringList(options.disabledTools);
    const disabledCapabilities = normalizeStringList(options.disabledCapabilities);
    const explicitAvailableTools = normalizeStringList(options.availableTools);
    const customInstructionLayer = buildCustomInstructionLayer(options.customInstructions);
    const promptLayers = normalizePromptLayers([
        ...(customInstructionLayer ? [customInstructionLayer] : []),
        ...(Array.isArray(options.promptLayers) ? options.promptLayers : []),
    ]);
    const skills = normalizePromptLayers(options.skills);
    const agentsMd = normalizePromptLayers(options.agentsMd);
    const plugins = Array.isArray(options.plugins) ? options.plugins : [];
    const systemPromptContent = normalizeString(options.systemPrompt);
    const workspacePath = normalizeString(options.workspacePath);
    const hasToolPolicyOverrides = explicitAvailableTools.length > 0
        || enabledRemoteTools.length > 0
        || disabledTools.length > 0
        || disabledCapabilities.length > 0;
    const tools = {
        mode: explicitAvailableTools.length > 0 ? 'explicit' : 'default_plus_client',
        enabled_remote_tools: enabledRemoteTools,
        disabled_tools: disabledTools,
        disabled_capabilities: disabledCapabilities,
    };
    if (includeToolManifest) {
        tools.client_manifest = clientToolManifest;
    }
    if (explicitAvailableTools.length > 0) {
        tools.available_tools = explicitAvailableTools;
    }
    const definition = {
        version: 1,
        id: normalizeString(options.id) || 'agent-default',
        name: normalizeString(options.name) || 'Agent',
        mode: (systemPromptContent
            || promptLayers.length > 0
            || skills.length > 0
            || agentsMd.length > 0
            || plugins.length > 0
            || workspacePath
            || hasToolPolicyOverrides
            || clientManifestHasTools(clientToolManifest))
            ? 'default_plus_overrides'
            : DEFAULT_AGENT_DEFINITION_MODE,
        system_prompt: systemPromptContent
            ? { mode: 'replace', content: systemPromptContent }
            : { mode: 'default' },
        tools,
        prompt_layers: promptLayers,
        skills,
        agents_md: agentsMd,
        plugins,
        runtime: {
            operating_system: normalizeString(options.operatingSystem),
            workspace_path: workspacePath,
        },
    };
    (0, CapabilityManifest_js_1.stampAgentDefinitionCapabilityMetadata)(definition);
    return JSON.parse(JSON.stringify(definition));
}
function isDefaultAgentDefinition(definition) {
    return isJsonRecord(definition) && definition.mode === DEFAULT_AGENT_DEFINITION_MODE;
}
