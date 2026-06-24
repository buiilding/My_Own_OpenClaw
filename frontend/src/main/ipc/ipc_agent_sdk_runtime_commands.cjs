/**
 * Owns Electron main Agent SDK command execution helpers.
 */

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function createAgentSdkRuntimeCommandsRuntime(deps = {}) {
  const {
    ensureAgent,
    getActiveAgent = () => null,
    resolveConversationRefFromPayload = () => null,
    resolveWorkspacePathForAgent = () => null,
    clearLatestPendingTurn = () => {},
    log = () => {},
  } = deps;

  async function sendQueryThroughAgentSdkRuntime({ payload = {}, messageId = null } = {}) {
    try {
      const sourcePayload = isPlainObject(payload) ? payload : {};
      const resources = Array.isArray(sourcePayload.resources) ? sourcePayload.resources : undefined;
      const metadata = isPlainObject(sourcePayload.metadata) ? sourcePayload.metadata : undefined;
      const model = isPlainObject(sourcePayload.model) ? { ...sourcePayload.model } : undefined;
      const runtimeCommandPayload = { ...sourcePayload };
      delete runtimeCommandPayload.resources;
      delete runtimeCommandPayload.metadata;
      delete runtimeCommandPayload.model;
      const agent = await ensureAgent({
        reason: 'query',
        conversationRef: resolveConversationRefFromPayload(runtimeCommandPayload),
        workspacePath: resolveWorkspacePathForAgent(runtimeCommandPayload),
      });
      const text = typeof runtimeCommandPayload.text === 'string'
        ? runtimeCommandPayload.text
        : '';
      const queryInput = {
        text,
        conversationRef: optionalString(runtimeCommandPayload.conversation_ref) || undefined,
        turnRef: messageId || undefined,
        backendPayload: runtimeCommandPayload,
        agentDefinition: isPlainObject(runtimeCommandPayload.agent_definition)
          ? runtimeCommandPayload.agent_definition
          : undefined,
        content: optionalString(runtimeCommandPayload.content) || undefined,
        screenshotRef: optionalString(runtimeCommandPayload.screenshot_ref) || undefined,
        screenshotRefs: Array.isArray(runtimeCommandPayload.screenshot_refs)
          ? runtimeCommandPayload.screenshot_refs
          : undefined,
        attachmentContext: optionalString(runtimeCommandPayload.attachment_context) || undefined,
        attachmentFilenames: Array.isArray(runtimeCommandPayload.attachment_filenames)
          ? runtimeCommandPayload.attachment_filenames
          : undefined,
        systemStateInternal: isPlainObject(runtimeCommandPayload.system_state_internal)
          ? runtimeCommandPayload.system_state_internal
          : undefined,
        workspacePath: optionalString(runtimeCommandPayload.workspace_path) || undefined,
        resources,
        metadata,
      };
      const result = model
        ? await agent.run(queryInput, { model })
        : await agent.run(queryInput);
      return result?.queryMessageId || result?.turnRef || null;
    } catch (error) {
      log(`Failed to send query through Agent SDK runtime: ${error?.message || error}`);
      return null;
    }
  }

  async function stopQueryThroughAgentSdkRuntime(payload = {}) {
    const agent = getActiveAgent();
    if (!agent) {
      return false;
    }
    const stopTurnRef = payload && typeof payload.turn_ref === 'string'
      ? payload.turn_ref
      : null;
    const stopConversationRef = resolveConversationRefFromPayload(payload);
    clearLatestPendingTurn({
      conversationRef: stopConversationRef,
      turnRef: stopTurnRef,
      broadcast: true,
    });
    await agent.stop({
      conversation_ref: stopConversationRef,
      turn_ref: stopTurnRef,
    });
    return true;
  }

  async function updateSettingsThroughAgentSdkRuntime(payload = {}) {
    const agent = await ensureAgent({ reason: 'update-settings' });
    return agent.updateSettings(payload);
  }

  async function requestModelListThroughAgentSdkRuntime() {
    const agent = await ensureAgent({ reason: 'list-models' });
    return agent.requestModelList();
  }

  async function sendWakewordDetectedThroughAgentSdkRuntime(payload = {}) {
    const agent = await ensureAgent({ reason: 'wakeword-detected' });
    return agent.wakewordDetected(payload);
  }

  return {
    sendQueryThroughAgentSdkRuntime,
    stopQueryThroughAgentSdkRuntime,
    updateSettingsThroughAgentSdkRuntime,
    requestModelListThroughAgentSdkRuntime,
    sendWakewordDetectedThroughAgentSdkRuntime,
  };
}

module.exports = {
  createAgentSdkRuntimeCommandsRuntime,
};
