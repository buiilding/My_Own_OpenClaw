/**
 * Provides the agent definition module for the Electron main process.
 */

const { loadExtensionSkillPromptLayers } = require('../extensions/extension_manifest.cjs');

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
    .filter((layer) => layer && typeof layer === 'object' && !Array.isArray(layer))
    .map((layer, index) => ({
      id: normalizeString(layer.id) || `client-layer-${index}`,
      type: normalizeString(layer.type) || 'custom',
      priority: normalizeNumber(layer.priority, 100),
      content: normalizeString(layer.content),
      ...(normalizeString(layer.revision) ? { revision: normalizeString(layer.revision) } : {}),
      ...(normalizeString(layer.source_path) ? { source_path: normalizeString(layer.source_path) } : {}),
    }))
    .filter((layer) => layer.id && layer.type && layer.content);
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

function buildAgentDefinition(options = {}) {
  const includeToolManifest = options.includeToolManifest !== false;
  const clientToolManifest = includeToolManifest
    ? options.clientToolManifest || { version: 1, tools: [] }
    : null;
  const enabledRemoteTools = normalizeStringList(options.enabledRemoteTools);
  const disabledTools = normalizeStringList(options.disabledTools);
  const disabledCapabilities = normalizeStringList(options.disabledCapabilities);
  const explicitAvailableTools = normalizeStringList(options.availableTools);
  const extensionPromptLayers = options.includeExtensionPromptLayers === false
    ? []
    : loadExtensionSkillPromptLayers({ contributionsDir: options.contributionsDir });
  const customInstructionLayer = buildCustomInstructionLayer(options.customInstructions);
  const promptLayers = normalizePromptLayers([
    ...extensionPromptLayers,
    ...(customInstructionLayer ? [customInstructionLayer] : []),
    ...(Array.isArray(options.promptLayers) ? options.promptLayers : []),
  ]);
  const skills = normalizePromptLayers(options.skills);
  const agentsMd = normalizePromptLayers(options.agentsMd || options.agents_md);
  const plugins = Array.isArray(options.plugins) ? options.plugins : [];

  const systemPromptContent = normalizeString(options.systemPrompt);
  const workspacePath = normalizeString(options.workspacePath);
  const definition = {
    version: 1,
    id: normalizeString(options.id) || 'windie-default',
    name: normalizeString(options.name) || 'WindieOS Agent',
    mode: (
      systemPromptContent
      || promptLayers.length > 0
      || skills.length > 0
      || agentsMd.length > 0
      || plugins.length > 0
      || workspacePath
      || clientToolManifest?.tools?.length > 0
    )
      ? 'default_plus_overrides'
      : 'windie_default',
    system_prompt: systemPromptContent
      ? { mode: 'replace', content: systemPromptContent }
      : { mode: 'default' },
    tools: {
      mode: explicitAvailableTools.length > 0 ? 'explicit' : 'default_plus_client',
      client_manifest: includeToolManifest ? clientToolManifest : undefined,
      available_tools: explicitAvailableTools.length > 0 ? explicitAvailableTools : undefined,
      enabled_remote_tools: enabledRemoteTools,
      disabled_tools: disabledTools,
      disabled_capabilities: disabledCapabilities,
    },
    prompt_layers: promptLayers,
    skills,
    agents_md: agentsMd,
    plugins,
    runtime: {
      operating_system: normalizeString(options.operatingSystem),
      workspace_path: workspacePath,
    },
  };
  const summary = summarizeAgentDefinitionCapabilities(definition);
  definition.metadata = {
    client_capability_revision: summary.revision,
    client_capability: {
      revision: summary.revision,
      tool_count: summary.toolCount,
      prompt_layer_count: summary.promptLayerCount,
      skill_count: summary.skillCount,
      plugin_count: summary.pluginCount,
    },
  };

  return JSON.parse(JSON.stringify(definition));
}

module.exports = {
  buildAgentDefinition,
};

function summarizeAgentDefinitionCapabilities(agentDefinition) {
  const tools = agentDefinition.tools && typeof agentDefinition.tools === 'object' && !Array.isArray(agentDefinition.tools)
    ? agentDefinition.tools
    : {};
  const manifest = tools.client_manifest && typeof tools.client_manifest === 'object' && !Array.isArray(tools.client_manifest)
    ? tools.client_manifest
    : {};
  const manifestTools = Array.isArray(manifest.tools) ? manifest.tools : [];
  const promptLayers = collectPromptLayers(agentDefinition);
  const skills = Array.isArray(agentDefinition.skills) ? agentDefinition.skills : [];
  const plugins = Array.isArray(agentDefinition.plugins) ? agentDefinition.plugins : [];
  return {
    revision: `cap_${hashString(stableStringify({
      tools: manifestTools.map(normalizeNamedContribution),
      prompt_layers: promptLayers.map(normalizePromptLayerContribution),
      skills: skills.map(normalizePromptLayerContribution),
      plugins: plugins.map(normalizeNamedContribution),
    }))}`,
    toolCount: manifestTools.length,
    promptLayerCount: promptLayers.length,
    skillCount: skills.length,
    pluginCount: plugins.length,
  };
}

function collectPromptLayers(agentDefinition) {
  const layers = [];
  for (const key of ['agents_md', 'skills', 'prompt_layers']) {
    if (Array.isArray(agentDefinition[key])) {
      layers.push(...agentDefinition[key]);
    }
  }
  const plugins = Array.isArray(agentDefinition.plugins) ? agentDefinition.plugins : [];
  for (const plugin of plugins) {
    if (plugin && typeof plugin === 'object' && !Array.isArray(plugin) && Array.isArray(plugin.prompt_layers)) {
      layers.push(...plugin.prompt_layers);
    }
  }
  return layers;
}

function normalizeNamedContribution(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const normalized = {};
  for (const key of ['name', 'id', 'extension_id', 'plugin_id', 'mcp_server_id', 'mcp_tool_name']) {
    const item = normalizeString(value[key]);
    if (item) {
      normalized[key] = item;
    }
  }
  return normalized;
}

function normalizePromptLayerContribution(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const normalized = {};
  for (const key of ['id', 'type', 'revision', 'source_path']) {
    const item = normalizeString(value[key]);
    if (item) {
      normalized[key] = item;
    }
  }
  if (typeof value.priority === 'number' && Number.isFinite(value.priority)) {
    normalized.priority = value.priority;
  }
  const content = normalizeString(value.content);
  if (content) {
    normalized.content = content;
  }
  return normalized;
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
