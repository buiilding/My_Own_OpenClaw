/**
 * Normalizes Electron Agent query inputs into the SDK ConversationRuntime send envelope.
 */

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function withDefinedValue(target, key, value) {
  if (value !== undefined) {
    target[key] = value;
  }
}

function normalizeRuntimeSendInput(input = {}, options = {}) {
  const source = typeof input === 'string' ? { text: input } : input;
  const backendPayload = isPlainObject(source.backendPayload) ? source.backendPayload : {};
  const payload = { ...backendPayload };
  withDefinedValue(payload, 'conversation_ref', source.conversation_ref);
  withDefinedValue(payload, 'content', source.content);
  withDefinedValue(payload, 'screenshot_ref', source.screenshotRef);
  withDefinedValue(payload, 'screenshot_refs', source.screenshotRefs);
  withDefinedValue(payload, 'attachment_context', source.attachmentContext);
  withDefinedValue(payload, 'attachment_filenames', source.attachmentFilenames);
  withDefinedValue(payload, 'system_state_internal', source.systemStateInternal);
  withDefinedValue(payload, 'workspace_path', source.workspacePath);
  withDefinedValue(
    payload,
    'agent_definition',
    isPlainObject(source.agentDefinition)
      ? source.agentDefinition
      : backendPayload.agent_definition,
  );

  return {
    text: typeof source.text === 'string' ? source.text : '',
    turnRef: source.turnRef,
    payload,
    resources: source.resources,
    metadata: source.metadata,
    model: isPlainObject(options.model) ? options.model : source.model,
  };
}

module.exports = {
  normalizeRuntimeSendInput,
};
