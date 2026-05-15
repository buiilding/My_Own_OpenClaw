const { loadExtensionPromptLayers } = require('./extension_manifest.cjs');

function normalizeString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
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
      priority: Number.isFinite(Number(layer.priority)) ? Number(layer.priority) : 100,
      content: normalizeString(layer.content),
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
    : loadExtensionPromptLayers({ extensionsDir: options.extensionsDir });
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

  return JSON.parse(JSON.stringify(definition));
}

module.exports = {
  buildAgentDefinition,
};
