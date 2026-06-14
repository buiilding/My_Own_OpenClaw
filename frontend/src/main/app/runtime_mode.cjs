/**
 * Coordinates the runtime mode for the Electron main process.
 */

function isVmModeEnabled(env = process.env) {
  const rawValue = typeof env?.WINDIE_VM_MODE === 'string'
    ? env.WINDIE_VM_MODE.trim()
    : '';
  return rawValue === '1';
}

function isVmWorkerModeEnabled(env = process.env) {
  const rawValue = typeof env?.WINDIE_VM_WORKER_MODE === 'string'
    ? env.WINDIE_VM_WORKER_MODE.trim()
    : '';
  if (rawValue.length === 0) {
    return isVmModeEnabled(env);
  }
  return rawValue === '1';
}

module.exports = {
  isVmModeEnabled,
  isVmWorkerModeEnabled,
};
