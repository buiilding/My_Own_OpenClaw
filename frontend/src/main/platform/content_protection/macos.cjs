module.exports = function enableContentProtectionSafely({
  targetWindow,
  windowLabel,
  warn = console.warn,
}) {
  try {
    targetWindow.setContentProtection(true);
  } catch (error) {
    warn(
      `[Main] Failed to enable ${windowLabel} content protection:`,
      error?.message || error,
    );
  }
};
