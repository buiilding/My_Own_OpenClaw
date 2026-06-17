/**
 * Exposes the package entrypoint for the Electron main process.
 */

const supportedRuntime = require('./supported.cjs');

function noopContentProtectionRuntime() {}

function createContentProtectionRuntime(platform) {
  if (platform === 'win32') {
    return supportedRuntime;
  }
  if (platform === 'darwin') {
    return supportedRuntime;
  }
  return noopContentProtectionRuntime;
}

module.exports = {
  createContentProtectionRuntime,
};
