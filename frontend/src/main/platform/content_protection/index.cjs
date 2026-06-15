/**
 * Exposes the package entrypoint for the Electron main process.
 */

const linuxRuntime = require('./linux.cjs');
const supportedRuntime = require('./supported.cjs');

function createContentProtectionRuntime(platform) {
  if (platform === 'win32') {
    return supportedRuntime;
  }
  if (platform === 'darwin') {
    return supportedRuntime;
  }
  return linuxRuntime;
}

module.exports = {
  createContentProtectionRuntime,
};
