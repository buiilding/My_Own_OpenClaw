/**
 * Owns Electron-main backend connection and first-query gate state.
 */

function createBackendConnectionGateState({
  initialConnected = false,
  initialFirstQuery = true,
} = {}) {
  let isConnected = initialConnected;
  let isFirstQuery = initialFirstQuery;

  function getConnected() {
    return isConnected;
  }

  function setConnected(nextValue) {
    isConnected = nextValue;
  }

  function getFirstQuery() {
    return isFirstQuery;
  }

  function setFirstQuery(nextValue) {
    isFirstQuery = nextValue;
  }

  function getSnapshot() {
    return {
      isConnected,
      isFirstQuery,
    };
  }

  function reset() {
    isConnected = false;
    isFirstQuery = true;
  }

  return {
    getConnected,
    getFirstQuery,
    getSnapshot,
    reset,
    setConnected,
    setFirstQuery,
  };
}

module.exports = {
  createBackendConnectionGateState,
};
