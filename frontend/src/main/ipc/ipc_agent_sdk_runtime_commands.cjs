/**
 * Owns Electron main Agent SDK command execution helpers.
 */

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function createAgentSdkRuntimeCommands(deps = {}) {
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
      const runtimeCommandPayload = { ...sourcePayload };
      delete runtimeCommandPayload.resources;
      delete runtimeCommandPayload.metadata;
      const agent = await ensureAgent({
        reason: 'query',
        conversationRef: resolveConversationRefFromPayload(runtimeCommandPayload),
        workspacePath: resolveWorkspacePathForAgent(runtimeCommandPayload),
      });
      const text = typeof runtimeCommandPayload.text === 'string'
        ? runtimeCommandPayload.text
        : '';
      const result = await agent.run({
        text,
        turnRef: messageId || undefined,
        payload: runtimeCommandPayload,
        resources,
        metadata,
      });
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
  createAgentSdkRuntimeCommands,
};
