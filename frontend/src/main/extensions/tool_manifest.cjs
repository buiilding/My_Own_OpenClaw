/**
 * Defines tool manifest contracts for the Electron main process.
 */

const builtinToolManifest = require('../generated/builtin_tool_manifest.json');
const { loadExtensionPluginTools } = require('./extension_manifest.cjs');

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeToolNameList(values) {
  return new Set(Array.isArray(values)
    ? values
      .filter((value) => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean)
    : []);
}

function buildBuiltinClientToolManifest(options = {}) {
  const disabledTools = normalizeToolNameList(options.disabledTools);
  const tools = Array.isArray(builtinToolManifest.tools)
    ? builtinToolManifest.tools
      .filter((tool) => typeof tool?.name === 'string' && !disabledTools.has(tool.name))
      .map((tool) => cloneJson(tool))
    : [];
  return {
    version: builtinToolManifest.version || 1,
    tools,
  };
}

function buildClientToolManifest(options = {}) {
  const disabledTools = normalizeToolNameList(options.disabledTools);
  const builtinManifest = buildBuiltinClientToolManifest({ disabledTools: [...disabledTools] });
  const seenNames = new Set(builtinManifest.tools.map((tool) => tool.name));
  const pluginTools = loadExtensionPluginTools({
    contributionsDir: options.contributionsDir,
  })
    .filter((tool) => {
      if (!tool?.name || disabledTools.has(tool.name) || seenNames.has(tool.name)) {
        return false;
      }
      seenNames.add(tool.name);
      return true;
    });

  return {
    version: 1,
    tools: [
      ...builtinManifest.tools,
      ...pluginTools,
    ],
  };
}

module.exports = {
  buildClientToolManifest,
};
