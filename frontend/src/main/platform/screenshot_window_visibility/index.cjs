/**
 * Exposes the package entrypoint for the Electron main process.
 */

const linuxRuntime = require('./linux.cjs');
const macosRuntime = require('./macos.cjs');
const windowsRuntime = require('./windows.cjs');

function createScreenshotWindowVisibilityRuntime(platform) {
  if (platform === 'win32') {
    return windowsRuntime;
  }
  if (platform === 'darwin') {
    return macosRuntime;
  }
  return linuxRuntime;
}

module.exports = {
  createScreenshotWindowVisibilityRuntime,
};
