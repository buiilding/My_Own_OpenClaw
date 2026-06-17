/**
 * Collects Electron-owned inputs for SDK agent definition construction.
 */

const { loadExtensionSkillPromptLayers } = require('../extensions/extension_manifest.cjs');

function rejectRemovedInputKeys(options, keys, label) {
  const present = keys.filter((key) => Object.prototype.hasOwnProperty.call(options, key));
  if (present.length > 0) {
    throw new Error(`${label} received removed input field(s): ${present.join(', ')}.`);
  }
}

function buildDesktopAgentDefinitionInputs(options = {}) {
  rejectRemovedInputKeys(options, ['agents_md'], 'desktop agent definition inputs');

  const extensionPromptLayers = options.includeExtensionPromptLayers === false
    ? []
    : loadExtensionSkillPromptLayers({ contributionsDir: options.contributionsDir });
  return {
    includeToolManifest: options.includeToolManifest,
    clientToolManifest: options.clientToolManifest,
    enabledRemoteTools: options.enabledRemoteTools,
    disabledTools: options.disabledTools,
    disabledCapabilities: options.disabledCapabilities,
    availableTools: options.availableTools,
    customInstructions: options.customInstructions,
    promptLayers: [
      ...extensionPromptLayers,
      ...(Array.isArray(options.promptLayers) ? options.promptLayers : []),
    ],
    skills: options.skills,
    agentsMd: options.agentsMd,
    plugins: options.plugins,
    systemPrompt: options.systemPrompt,
    workspacePath: options.workspacePath,
    operatingSystem: options.operatingSystem,
    id: options.id,
    name: options.name,
  };
}

module.exports = {
  buildDesktopAgentDefinitionInputs,
};
