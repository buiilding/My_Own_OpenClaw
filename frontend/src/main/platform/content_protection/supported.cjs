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
  warn = console.warn,
}) {
  const label = normalizeWindowLabel(windowLabel);

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
