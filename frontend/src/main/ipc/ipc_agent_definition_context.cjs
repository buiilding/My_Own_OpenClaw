/**
 * Builds and attaches SDK agent-definition context for Electron main payloads.
 */

const {
  buildElectronAgentDefinitionInputs,
} = require('../agent/electron_agent_definition_inputs.cjs');
const {
  resolveWorkspaceRepoInstructionPromptLayers,
} = require('../app/repo_instruction_runtime.cjs');
const {
  loadExtensionSkillPromptLayers,
} = require('../extensions/extension_manifest.cjs');
const {
  resolveDesktopHostOperatingSystem,
} = require('./ipc_desktop_host_os_runtime.cjs');

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function cloneJsonObject(value) {
  if (!isPlainObject(value)) {
    return {};
  }
  return JSON.parse(JSON.stringify(value));
}

function mergeAgentDefinitionContext(generatedDefinition, suppliedDefinition) {
  const supplied = cloneJsonObject(suppliedDefinition);
  if (Object.keys(supplied).length === 0) {
    return generatedDefinition;
  }

  const generated = cloneJsonObject(generatedDefinition);
  return JSON.parse(JSON.stringify({
    ...generated,
    ...supplied,
    system_prompt: isPlainObject(supplied.system_prompt)
      ? supplied.system_prompt
      : generated.system_prompt,
    tools: isPlainObject(supplied.tools)
      ? supplied.tools
      : generated.tools,
    runtime: {
      ...(isPlainObject(generated.runtime) ? generated.runtime : {}),
      ...(isPlainObject(supplied.runtime) ? supplied.runtime : {}),
    },
    prompt_layers: [
      ...(Array.isArray(generated.prompt_layers) ? generated.prompt_layers : []),
      ...(Array.isArray(supplied.prompt_layers) ? supplied.prompt_layers : []),
    ],
    agents_md: [
      ...(Array.isArray(generated.agents_md) ? generated.agents_md : []),
      ...(Array.isArray(supplied.agents_md) ? supplied.agents_md : []),
    ],
    skills: [
      ...(Array.isArray(generated.skills) ? generated.skills : []),
      ...(Array.isArray(supplied.skills) ? supplied.skills : []),
    ],
    plugins: [
      ...(Array.isArray(generated.plugins) ? generated.plugins : []),
      ...(Array.isArray(supplied.plugins) ? supplied.plugins : []),
    ],
  }));
}

function attachAgentDefinitionContext(payload, {
  latestDesktopUiConfig = null,
  platformName = process.platform,
  buildAgentDefinition,
  isDefaultAgentDefinition,
} = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }
  if (typeof buildAgentDefinition !== 'function') {
    throw new Error('Agent definition context requires buildAgentDefinition');
  }
  if (typeof isDefaultAgentDefinition !== 'function') {
    throw new Error('Agent definition context requires isDefaultAgentDefinition');
  }
  const customInstructions = typeof latestDesktopUiConfig?.agent_custom_instructions === 'string'
    ? latestDesktopUiConfig.agent_custom_instructions.trim()
    : '';
  const workspacePath = typeof payload.workspace_path === 'string'
    ? payload.workspace_path.trim()
    : '';
  const agentsMd = workspacePath
    ? resolveWorkspaceRepoInstructionPromptLayers(workspacePath)
    : [];
  const generatedAgentDefinition = buildAgentDefinition(buildElectronAgentDefinitionInputs({
    includeToolManifest: false,
    includeExtensionPromptLayers: false,
    customInstructions,
    promptLayers: loadExtensionSkillPromptLayers(),
    agentsMd,
    workspacePath,
    operatingSystem: resolveDesktopHostOperatingSystem(platformName),
  }));
  const suppliedAgentDefinition = isPlainObject(payload.agent_definition)
    ? payload.agent_definition
    : null;
  if (isDefaultAgentDefinition(generatedAgentDefinition) && !suppliedAgentDefinition) {
    return payload;
  }

  return {
    ...payload,
    agent_definition: mergeAgentDefinitionContext(
      generatedAgentDefinition,
      suppliedAgentDefinition,
    ),
  };
}

function createAgentDefinitionContextRuntime({
  getLatestDesktopUiConfig = () => null,
  platformName = process.platform,
  buildAgentDefinition,
  isDefaultAgentDefinition,
} = {}) {
  function attach(payload) {
    return attachAgentDefinitionContext(payload, {
      latestDesktopUiConfig: getLatestDesktopUiConfig(),
      platformName,
      buildAgentDefinition,
      isDefaultAgentDefinition,
    });
  }

  return {
    attach,
  };
}

module.exports = {
  createAgentDefinitionContextRuntime,
  mergeAgentDefinitionContext,
};
