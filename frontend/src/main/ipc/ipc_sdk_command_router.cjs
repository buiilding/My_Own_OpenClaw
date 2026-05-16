const CONNECT_REQUIRED_COMMANDS = new Set([
  'query',
  'wakeword-detected',
  'compact-history',
  'rehydrate-conversation',
  'load-settings',
]);

const SETTINGS_SYNC_REQUIRED_COMMANDS = new Set([
  'query',
  'wakeword-detected',
]);

const LOGGED_RENDERER_COMMANDS = new Set([
  'query',
  'wakeword-detected',
]);

function normalizeSdkRuntimeCommand(message = {}) {
  const type = typeof message?.type === 'string' ? message.type : null;
  const payload = (
    message?.payload
    && typeof message.payload === 'object'
    && !Array.isArray(message.payload)
  ) ? { ...message.payload } : {};

  return { type, payload };
}

function shouldQueueUntilConnected(type) {
  return type === 'list-models';
}

function shouldConnectForSdkRuntimeCommand(type) {
  return CONNECT_REQUIRED_COMMANDS.has(type);
}

function shouldSyncSettingsBeforeSdkRuntimeCommand(type) {
  return SETTINGS_SYNC_REQUIRED_COMMANDS.has(type);
}

function shouldLogRendererSdkRuntimeCommand(type) {
  return LOGGED_RENDERER_COMMANDS.has(type);
}

function sendSdkRuntimeCommand(runtime, {
  type,
  payload,
  messageId = null,
} = {}) {
  if (!runtime || typeof type !== 'string') {
    return null;
  }
  if (type === 'query') {
    return runtime.sendQuery(payload, messageId);
  }
  if (type === 'wakeword-detected') {
    return runtime.sendWakewordDetected(payload, messageId);
  }
  return runtime.sendBackendMessage(type, payload, messageId);
}

module.exports = {
  normalizeSdkRuntimeCommand,
  shouldConnectForSdkRuntimeCommand,
  shouldLogRendererSdkRuntimeCommand,
  shouldQueueUntilConnected,
  shouldSyncSettingsBeforeSdkRuntimeCommand,
  sendSdkRuntimeCommand,
};
