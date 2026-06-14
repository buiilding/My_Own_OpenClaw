/**
 * Provides the supported module for the Electron main process.
 */

function normalizeWindowLabel(windowLabel) {
  if (typeof windowLabel !== 'string') {
    return 'window';
  }
  const trimmed = windowLabel.trim();
  return trimmed.length > 0 ? trimmed : 'window';
}

module.exports = function enableSupportedContentProtection({
  targetWindow,
  windowLabel,
  enabled = true,
  warn = console.warn,
}) {
  const label = normalizeWindowLabel(windowLabel);
  const nextEnabled = enabled !== false;
  const action = nextEnabled ? 'enable' : 'disable';

  if (!targetWindow || typeof targetWindow.setContentProtection !== 'function') {
    warn(
      `[Main] Cannot ${action} ${label} content protection: ` +
      'BrowserWindow.setContentProtection is unavailable.',
    );
    return;
  }

  try {
    targetWindow.setContentProtection(nextEnabled);
  } catch (error) {
    warn(
      `[Main] Failed to ${action} ${label} content protection:`,
      error?.message || error,
    );
  }
};
