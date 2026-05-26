const { v4: uuidv4 } = require('uuid');

const {
  getErrorMessage,
} = require('./local_backend_bridge_utils.cjs');

function createLocalBackendRpcTransport({
  getDaemonManager,
  getDaemonLaunchOptions,
  legacyTransport,
  createRequestId = uuidv4,
} = {}) {
  function sendRequest(method, params = {}, options = {}) {
    const daemonManager = typeof getDaemonManager === 'function'
      ? getDaemonManager()
      : null;
    if (daemonManager && typeof daemonManager.rpc === 'function') {
      const requestId = createRequestId();
      const launchOptions = typeof getDaemonLaunchOptions === 'function'
        ? getDaemonLaunchOptions() || {}
        : {};
      return daemonManager
        .rpc({
          id: requestId,
          method,
          params,
        }, launchOptions)
        .then((response) => {
          if (response?.error) {
            throw new Error(response.error.message || 'JSON-RPC error');
          }
          return response?.result;
        });
    }
    return legacyTransport.sendRequest(method, params, options);
  }

  async function sendRequestOrError(method, params = {}, options = {}) {
    try {
      return await sendRequest(method, params, options);
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }

  return {
    sendRequest,
    sendRequestOrError,
  };
}

module.exports = {
  createLocalBackendRpcTransport,
};
