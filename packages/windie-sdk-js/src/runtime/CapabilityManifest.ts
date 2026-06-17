/**
 * Defines capability manifest contracts for the TypeScript SDK runtime.
 */

import type { JsonRecord } from '../conversation/types.js';

type CapabilityManifestSummary = {
  revision: string;
  toolCount: number;
  promptLayerCount: number;
  skillCount: number;
  pluginCount: number;
};

export function setAgentDefinitionToolManifest(
  agentDefinition: JsonRecord,
  toolSchemas: JsonRecord[],
): CapabilityManifestSummary {
  const tools = agentDefinition.tools && typeof agentDefinition.tools === 'object' && !Array.isArray(agentDefinition.tools)
    ? agentDefinition.tools as JsonRecord
    : {};
  const clientManifest = tools.client_manifest && typeof tools.client_manifest === 'object' && !Array.isArray(tools.client_manifest)
    ? tools.client_manifest as JsonRecord
    : {};
  agentDefinition.tools = {
    ...tools,
    mode: typeof tools.mode === 'string' ? tools.mode : 'client_only',
    client_manifest: {
      ...clientManifest,
      version: Number.isFinite(clientManifest.version) ? clientManifest.version : 1,
      tools: toolSchemas,
    },
  };
  return stampAgentDefinitionCapabilityMetadata(agentDefinition);
}

export function stampAgentDefinitionCapabilityMetadata(
  agentDefinition: JsonRecord,
): CapabilityManifestSummary {
  const summary = summarizeAgentDefinitionCapabilities(agentDefinition);
  agentDefinition.metadata = {
    ...(agentDefinition.metadata && typeof agentDefinition.metadata === 'object' && !Array.isArray(agentDefinition.metadata)
      ? agentDefinition.metadata as JsonRecord
      : {}),
    client_capability_revision: summary.revision,
    client_capability: {
      revision: summary.revision,
      tool_count: summary.toolCount,
      prompt_layer_count: summary.promptLayerCount,
      skill_count: summary.skillCount,
      plugin_count: summary.pluginCount,
    },
  };
  return summary;
}

function summarizeAgentDefinitionCapabilities(
  agentDefinition: JsonRecord,
): CapabilityManifestSummary {
  const tools = agentDefinition.tools && typeof agentDefinition.tools === 'object' && !Array.isArray(agentDefinition.tools)
    ? agentDefinition.tools as JsonRecord
    : {};
  const clientManifest = tools.client_manifest && typeof tools.client_manifest === 'object' && !Array.isArray(tools.client_manifest)
    ? tools.client_manifest as JsonRecord
    : {};
  const manifestTools = Array.isArray(clientManifest.tools) ? clientManifest.tools : [];
  const promptLayers = collectPromptLayers(agentDefinition);
  const skills = Array.isArray(agentDefinition.skills) ? agentDefinition.skills : [];
  const plugins = Array.isArray(agentDefinition.plugins) ? agentDefinition.plugins : [];
  const revisionPayload = {
    tools: manifestTools.map(tool => normalizeNamedContribution(tool)),
    prompt_layers: promptLayers.map(layer => normalizePromptLayerContribution(layer)),
    skills: skills.map(layer => normalizePromptLayerContribution(layer)),
    plugins: plugins.map(plugin => normalizeNamedContribution(plugin)),
  };
  return {
    revision: `cap_${hashString(stableStringify(revisionPayload))}`,
    toolCount: manifestTools.length,
    promptLayerCount: promptLayers.length,
    skillCount: skills.length,
    pluginCount: plugins.length,
  };
}

function collectPromptLayers(agentDefinition: JsonRecord): unknown[] {
  const layers: unknown[] = [];
  for (const key of ['agents_md', 'skills', 'prompt_layers']) {
    const value = agentDefinition[key];
    if (Array.isArray(value)) {
      layers.push(...value);
    }
  }
  const plugins = Array.isArray(agentDefinition.plugins) ? agentDefinition.plugins : [];
  for (const plugin of plugins) {
    if (plugin && typeof plugin === 'object' && !Array.isArray(plugin)) {
      const pluginLayers = (plugin as JsonRecord).prompt_layers;
      if (Array.isArray(pluginLayers)) {
        layers.push(...pluginLayers);
      }
    }
  }
  return layers;
}

function normalizeNamedContribution(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const record = value as JsonRecord;
  const normalized: JsonRecord = {};
  for (const key of ['name', 'id', 'extension_id', 'plugin_id', 'mcp_server_id', 'mcp_tool_name']) {
    if (typeof record[key] === 'string' && (record[key] as string).trim()) {
      normalized[key] = (record[key] as string).trim();
    }
  }
  return normalized;
}

function normalizePromptLayerContribution(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const record = value as JsonRecord;
  const normalized: JsonRecord = {};
  for (const key of ['id', 'type', 'revision', 'source_path']) {
    if (typeof record[key] === 'string' && (record[key] as string).trim()) {
      normalized[key] = (record[key] as string).trim();
    }
  }
  if (typeof record.priority === 'number' && Number.isFinite(record.priority)) {
    normalized.priority = record.priority;
  }
  if (typeof record.content === 'string' && record.content.trim()) {
    normalized.content = record.content.trim();
  }
  return normalized;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as JsonRecord;
    const keys = Object.keys(record).sort();
    return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
