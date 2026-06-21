/**
 * Defines ipc settings sync configuration for the Electron main process.
 */

function isValidConfigPayload(config) {
  return Boolean(config) && typeof config === 'object' && !Array.isArray(config);
}

module.exports = {
  isValidConfigPayload,
};
