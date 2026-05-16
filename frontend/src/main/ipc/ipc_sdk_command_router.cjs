const CONNECT_REQUIRED_COMMANDS = new Set([
  'query',
  'wakeword-detected',
  'compact-history',
  'rehydrate',
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
  if (type === 'stop-query' && typeof runtime.sendStopQuery === 'function') {
    return runtime.sendStopQuery(payload, messageId);
  }
  if (type === 'update-settings' && typeof runtime.sendUpdateSettings === 'function') {
    return runtime.sendUpdateSettings(payload, messageId);
  }
  if (type === 'list-models' && typeof runtime.sendListModels === 'function') {
    return runtime.sendListModels(payload, messageId);
  }
  if (type === 'rehydrate' && typeof runtime.rehydrateConversation === 'function') {
    return runtime.rehydrateConversation(payload, messageId);
  }
  if (type === 'compact-history' && typeof runtime.sendCompactHistory === 'function') {
    return runtime.sendCompactHistory(payload, messageId);
  }
  return null;
}

module.exports = {
  normalizeSdkRuntimeCommand,
  shouldConnectForSdkRuntimeCommand,
  shouldLogRendererSdkRuntimeCommand,
  shouldQueueUntilConnected,
  shouldSyncSettingsBeforeSdkRuntimeCommand,
  sendSdkRuntimeCommand,
};
