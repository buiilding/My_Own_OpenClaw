const { v4: uuidv4 } = require('uuid');

const {
  toErrorResponse,
} = require('./local_backend_bridge_utils.cjs');
const {
  DEFAULT_REQUEST_TIMEOUT_MS,
} = require('./local_backend_bridge_timeout_policy.cjs');

function createLocalBackendRequestTransport({
  getProcess,
  isBackendReady,
  getReadinessCallback,
} = {}) {
  const pendingRequests = new Map();

  function rejectPendingRequests(reason) {
    const pendingEntries = Array.from(pendingRequests.entries());
    for (const [requestId, pending] of pendingEntries) {
      clearTimeout(pending.timeout);
      pendingRequests.delete(requestId);
      pending.reject(new Error(reason));
    }
  }

  function handlePythonResponse(response) {
    const requestId = response?.id;
    const readinessCallback = typeof getReadinessCallback === 'function'
      ? getReadinessCallback()
      : null;

    if (readinessCallback && requestId && requestId.startsWith('__readiness_check_')) {
      readinessCallback(response);
      return;
    }

    if (requestId && requestId.startsWith('__readiness_check_')) {
      return;
    }

    if (requestId && pendingRequests.has(requestId)) {
      const { resolve, reject, timeout } = pendingRequests.get(requestId);
      clearTimeout(timeout);
      pendingRequests.delete(requestId);

      if (response.error) {
        reject(new Error(response.error.message || 'JSON-RPC error'));
      } else {
        resolve(response.result);
      }
      return;
    }

    console.warn('[LocalBackend] Received response for unknown request:', requestId);
  }

  function sendRequest(method, params = {}, options = {}) {
    const processRef = typeof getProcess === 'function' ? getProcess() : null;
    if (!processRef || typeof isBackendReady !== 'function' || !isBackendReady()) {
      throw new Error('Local backend not ready');
    }

    const requestId = uuidv4();
    const request = {
      jsonrpc: '2.0',
      id: requestId,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timeoutMs =
        typeof options.timeoutMs === 'number' ? options.timeoutMs : DEFAULT_REQUEST_TIMEOUT_MS;
      const timeout = setTimeout(() => {
        if (pendingRequests.has(requestId)) {
          pendingRequests.delete(requestId);
          reject(new Error('Request timed out'));
        }
      }, timeoutMs);

      pendingRequests.set(requestId, { resolve, reject, timeout });

      try {
        const jsonStr = JSON.stringify(request);
        processRef.stdin.write(jsonStr + '\n');
      } catch (error) {
        clearTimeout(timeout);
        pendingRequests.delete(requestId);
        reject(error);
      }
    });
  }

  async function sendRequestOrError(method, params = {}, options = {}) {
    try {
      return await sendRequest(method, params, options);
    } catch (error) {
      return toErrorResponse(error);
    }
  }

  return {
    handlePythonResponse,
    rejectPendingRequests,
    sendRequest,
    sendRequestOrError,
  };
}

module.exports = {
  createLocalBackendRequestTransport,
};
