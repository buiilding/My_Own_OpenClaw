/**
 * Provides the macos module for the Electron main process.
 */

module.exports = async function withHiddenWindowForScreenshot({ task }) {
  return task();
};
