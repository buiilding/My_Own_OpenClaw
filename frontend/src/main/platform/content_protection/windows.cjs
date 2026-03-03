module.exports = function enableContentProtectionSafely({
  targetWindow,
  windowLabel,
  warn = console.warn,
}) {
  const label = (
    typeof windowLabel === 'string' && windowLabel.trim().length > 0
      ? windowLabel.trim()
      : 'window'
  );

  if (!targetWindow || typeof targetWindow.setContentProtection !== 'function') {
    warn(
      `[Main] Cannot enable ${label} content protection: ` +
      'BrowserWindow.setContentProtection is unavailable.',
    );
    return;
  }

  try {
    targetWindow.setContentProtection(true);
  } catch (error) {
    warn(
      `[Main] Failed to enable ${label} content protection:`,
      error?.message || error,
    );
  }
};
