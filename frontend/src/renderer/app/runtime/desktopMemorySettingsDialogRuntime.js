/**
 * Owns memory settings browser-dialog adapters for renderer app runtime.
 */

function getDialogHost() {
  return globalThis.window || null;
}

function confirmMemorySettingsDestructiveAction(message) {
  const host = getDialogHost();
  return Boolean(
    host
      && typeof host.confirm === 'function'
      && host.confirm(message) === true,
  );
}

export const DesktopMemorySettingsDialogRuntime = Object.freeze({
  confirmMemorySettingsDestructiveAction,
});
