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
const {
  appendAgentDefinitionFlowDiagnostic,
} = require('../diagnostics/app_diagnostics_runtime.cjs');

const REMOTE_AGENT_TOOL_NAMES = Object.freeze([
  'web_search',
]);

const AGENT_DEFINITION_FLOW_STAGES = Object.freeze([
  'desktop_config.snapshot',
  'custom_instructions.collect',
  'local_tool_policy.collect',
  'remote_tool_policy.collect',
  'enabled_remote_tools.resolve',
  'workspace_path.collect',
  'repo_instructions.resolve',
  'extension_prompt_layers.resolve',
  'host_os.resolve',
  'sdk_builder.input',
  'generated_definition.build',
  'supplied_definition.detect',
  'definition_merge.apply',
  'payload_attachment.prepare',
  'payload_attachment.complete',
]);

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function cloneJsonObject(value) {
  if (!isPlainObject(value)) {
    return {};
  }
  return JSON.parse(JSON.stringify(value));
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function arrayRecordCount(value) {
  return Array.isArray(value)
    ? value.filter((item) => isPlainObject(item)).length
    : 0;
}

function agentToolCount(definition) {
  if (!isPlainObject(definition)) {
    return 0;
  }
  if (Array.isArray(definition.tools)) {
    return definition.tools.filter((tool) => isPlainObject(tool)).length;
  }
  if (isPlainObject(definition.tools)) {
    const manifest = isPlainObject(definition.tools.client_manifest)
      ? definition.tools.client_manifest
      : null;
    if (Array.isArray(manifest?.tools)) {
      return manifest.tools.filter((tool) => isPlainObject(tool)).length;
    }
    if (Array.isArray(definition.tools.available_tools)) {
      return definition.tools.available_tools.filter((tool) => (
        typeof tool === 'string' && tool.trim()
      )).length;
    }
  }
  return 0;
}

function systemPromptSummary(definition) {
  const prompt = isPlainObject(definition?.system_prompt) ? definition.system_prompt : null;
  return {
    hasSystemPromptOverride: typeof prompt?.content === 'string' && prompt.content.trim().length > 0,
    hasDefaultSystemPrompt: prompt?.mode === 'default',
  };
}

function buildAgentDefinitionFlowSummary({
  latestDesktopUiConfig,
  customInstructions,
  toolConfig,
  workspacePath,
  agentsMd,
  extensionPromptLayers,
  platformName,
  hostOperatingSystem,
  generatedAgentDefinition,
  suppliedAgentDefinition,
  finalAgentDefinition,
}) {
  const generatedPrompt = systemPromptSummary(generatedAgentDefinition);
  const finalPrompt = systemPromptSummary(finalAgentDefinition);
  return {
    hasDesktopUiConfig: isPlainObject(latestDesktopUiConfig),
    hasCustomInstructions: Boolean(customInstructions),
    customInstructionLength: customInstructions.length,
    disabledLocalToolCount: arrayValue(latestDesktopUiConfig?.agent_disabled_local_tools).length,
    disabledRemoteToolCount: arrayValue(latestDesktopUiConfig?.agent_disabled_remote_tools).length,
    enabledRemoteToolCount: toolConfig.enabledRemoteTools.length,
    availableToolCount: toolConfig.availableTools.length,
    disabledToolCount: toolConfig.disabledTools.length,
    extensionPromptLayerCount: arrayRecordCount(extensionPromptLayers),
    repoInstructionLayerCount: arrayRecordCount(agentsMd),
    generatedPromptLayerCount: arrayRecordCount(generatedAgentDefinition?.prompt_layers),
    generatedAgentsMdCount: arrayRecordCount(generatedAgentDefinition?.agents_md),
    generatedSkillCount: arrayRecordCount(generatedAgentDefinition?.skills),
    generatedPluginCount: arrayRecordCount(generatedAgentDefinition?.plugins),
    generatedMcpCount: arrayRecordCount(generatedAgentDefinition?.mcps),
    generatedToolCount: agentToolCount(generatedAgentDefinition),
    suppliedPromptLayerCount: arrayRecordCount(suppliedAgentDefinition?.prompt_layers),
    suppliedAgentsMdCount: arrayRecordCount(suppliedAgentDefinition?.agents_md),
    suppliedSkillCount: arrayRecordCount(suppliedAgentDefinition?.skills),
    suppliedPluginCount: arrayRecordCount(suppliedAgentDefinition?.plugins),
    suppliedMcpCount: arrayRecordCount(suppliedAgentDefinition?.mcps),
    suppliedToolCount: agentToolCount(suppliedAgentDefinition),
    finalPromptLayerCount: arrayRecordCount(finalAgentDefinition?.prompt_layers),
    finalAgentsMdCount: arrayRecordCount(finalAgentDefinition?.agents_md),
    finalSkillCount: arrayRecordCount(finalAgentDefinition?.skills),
    finalPluginCount: arrayRecordCount(finalAgentDefinition?.plugins),
    finalMcpCount: arrayRecordCount(finalAgentDefinition?.mcps),
    finalToolCount: agentToolCount(finalAgentDefinition),
    hasGeneratedAgentDefinition: isPlainObject(generatedAgentDefinition),
    hasSuppliedAgentDefinition: isPlainObject(suppliedAgentDefinition),
    hasFinalAgentDefinition: isPlainObject(finalAgentDefinition),
    hasSystemPromptOverride: generatedPrompt.hasSystemPromptOverride || finalPrompt.hasSystemPromptOverride,
    hasDefaultSystemPrompt: generatedPrompt.hasDefaultSystemPrompt || finalPrompt.hasDefaultSystemPrompt,
    hasWorkspacePath: Boolean(workspacePath),
    hasOperatingSystem: Boolean(hostOperatingSystem),
    platformName,
    hostOperatingSystem,
  };
}

function emitAgentDefinitionFlow(summary, {
  append = appendAgentDefinitionFlowDiagnostic,
  traceId = `agent-definition-flow-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
  turnRef = null,
} = {}) {
  if (typeof append !== 'function') {
    return;
  }
  for (const stage of AGENT_DEFINITION_FLOW_STAGES) {
    append({
      traceId,
      action: stage,
      stage,
      status: summary.hasFinalAgentDefinition ? 'succeeded' : 'skipped',
      source: 'ipc_agent_definition_context',
      turnRef,
      ...summary,
    });
  }
}

function containsTrimmedString(value, expected) {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.some((item) => (
    typeof item === 'string'
    && item.trim() === expected
  ));
}

function resolveAgentToolConfig(latestDesktopUiConfig) {
  const disabledLocalTools = arrayValue(latestDesktopUiConfig?.agent_disabled_local_tools);
  const disabledRemoteTools = arrayValue(latestDesktopUiConfig?.agent_disabled_remote_tools);
  const enabledRemoteTools = REMOTE_AGENT_TOOL_NAMES.filter(
    (toolName) => !containsTrimmedString(disabledRemoteTools, toolName),
  );
  return {
    availableTools: enabledRemoteTools,
    disabledTools: [
      ...disabledLocalTools,
      ...disabledRemoteTools,
    ],
    enabledRemoteTools,
  };
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
  appendFlowDiagnostic = appendAgentDefinitionFlowDiagnostic,
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
  const toolConfig = resolveAgentToolConfig(latestDesktopUiConfig);
  const workspacePath = typeof payload.workspace_path === 'string'
    ? payload.workspace_path.trim()
    : '';
  const agentsMd = workspacePath
    ? resolveWorkspaceRepoInstructionPromptLayers(workspacePath)
    : [];
  const extensionPromptLayers = loadExtensionSkillPromptLayers();
  const hostOperatingSystem = resolveDesktopHostOperatingSystem(platformName);
  const generatedAgentDefinition = buildAgentDefinition(buildElectronAgentDefinitionInputs({
    includeToolManifest: false,
    includeExtensionPromptLayers: false,
    systemPrompt: customInstructions,
    availableTools: toolConfig.availableTools,
    disabledTools: toolConfig.disabledTools,
    enabledRemoteTools: toolConfig.enabledRemoteTools,
    promptLayers: extensionPromptLayers,
    agentsMd,
    workspacePath,
    operatingSystem: hostOperatingSystem,
  }));
  const suppliedAgentDefinition = isPlainObject(payload.agent_definition)
    ? payload.agent_definition
    : null;
  if (isDefaultAgentDefinition(generatedAgentDefinition) && !suppliedAgentDefinition) {
    emitAgentDefinitionFlow(buildAgentDefinitionFlowSummary({
      latestDesktopUiConfig,
      customInstructions,
      toolConfig,
      workspacePath,
      agentsMd,
      extensionPromptLayers,
      platformName,
      hostOperatingSystem,
      generatedAgentDefinition,
      suppliedAgentDefinition,
      finalAgentDefinition: null,
    }), {
      append: appendFlowDiagnostic,
      turnRef: typeof payload.turn_ref === 'string' ? payload.turn_ref : null,
    });
    return payload;
  }

  const finalAgentDefinition = mergeAgentDefinitionContext(
    generatedAgentDefinition,
    suppliedAgentDefinition,
  );
  emitAgentDefinitionFlow(buildAgentDefinitionFlowSummary({
    latestDesktopUiConfig,
    customInstructions,
    toolConfig,
    workspacePath,
    agentsMd,
    extensionPromptLayers,
    platformName,
    hostOperatingSystem,
    generatedAgentDefinition,
    suppliedAgentDefinition,
    finalAgentDefinition,
  }), {
    append: appendFlowDiagnostic,
    turnRef: typeof payload.turn_ref === 'string' ? payload.turn_ref : null,
  });
  return {
    ...payload,
    agent_definition: finalAgentDefinition,
  };
}

function createAgentDefinitionContextRuntime({
  getLatestDesktopUiConfig = () => null,
  platformName = process.platform,
  buildAgentDefinition,
  isDefaultAgentDefinition,
  appendFlowDiagnostic,
} = {}) {
  function attach(payload) {
    return attachAgentDefinitionContext(payload, {
      latestDesktopUiConfig: getLatestDesktopUiConfig(),
      platformName,
      buildAgentDefinition,
      isDefaultAgentDefinition,
      appendFlowDiagnostic,
    });
  }

  return {
    attach,
  };
}

module.exports = {
  createAgentDefinitionContextRuntime,
};
