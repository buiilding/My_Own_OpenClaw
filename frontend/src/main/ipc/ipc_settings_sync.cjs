/**
 * Defines ipc settings sync configuration for the Electron main process.
 */

function isValidConfigPayload(config) {
  return Boolean(config) && typeof config === 'object' && !Array.isArray(config);
}

function clearPendingSettingsSyncs(pendingSettingsSyncs) {
  for (const { resolve, timer } of pendingSettingsSyncs.values()) {
    clearTimeout(timer);
    resolve(false);
  }
  pendingSettingsSyncs.clear();
}

function resolveSettingsSync(pendingSettingsSyncs, msgId, wasSuccessful) {
  const pending = pendingSettingsSyncs.get(msgId);
  if (!pending) {
    return;
  }
  clearTimeout(pending.timer);
  pendingSettingsSyncs.delete(msgId);
  pending.resolve(Boolean(wasSuccessful));
}

function waitForSettingsAck(
  pendingSettingsSyncs,
  msgId,
  source,
  log,
  timeoutMs,
) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingSettingsSyncs.delete(msgId);
      log(`Settings sync timeout (${source}) for message ${msgId}`);
      resolve(false);
    }, timeoutMs);
    timer.unref?.();
    pendingSettingsSyncs.set(msgId, { resolve, timer });
  });
}

module.exports = {
  clearPendingSettingsSyncs,
  isValidConfigPayload,
  resolveSettingsSync,
  waitForSettingsAck,
};
