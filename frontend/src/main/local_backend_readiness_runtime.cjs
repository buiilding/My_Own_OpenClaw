function getReadinessRetryDelay(attempt) {
  return Math.min(50 * Math.pow(2, attempt - 1), 1000);
}

function createLocalBackendReadinessRuntime({
  getProcess,
  supervisor,
  sendStatus,
  logger = console,
  isTestEnv = false,
  setTimeoutFn = setTimeout,
} = {}) {
  let readinessCheckCallback = null;
  let readinessCheckToken = 0;

  function getCallback() {
    return readinessCheckCallback;
  }

  function resetToGeneration(generation) {
    readinessCheckCallback = null;
    readinessCheckToken = typeof generation === 'number'
      ? generation
      : supervisor?.getSnapshot?.().generation || 0;
  }

  function scheduleRetry(mainWindow, attempt, maxAttempts, checkToken) {
    if (attempt < maxAttempts) {
      const delay = getReadinessRetryDelay(attempt);
      setTimeoutFn(() => {
        if (typeof checkToken === 'number' && checkToken !== readinessCheckToken) {
          return;
        }
        check(mainWindow, attempt + 1, maxAttempts);
      }, delay);
      return true;
    }
    return false;
  }

  function markReady(mainWindow) {
    supervisor?.markReady?.();
    sendStatus?.(mainWindow, { ready: true });
  }

  function markFailed(mainWindow, error) {
    const errorMessage = typeof error === 'string' && error.trim()
      ? error.trim()
      : 'Local backend readiness check failed';
    readinessCheckCallback = null;
    supervisor?.markError?.(errorMessage);
    sendStatus?.(mainWindow, {
      ready: false,
      status: 'error',
      error: errorMessage,
    });
  }

  function check(mainWindow, attempt = 1, maxAttempts = 10) {
    const processRef = typeof getProcess === 'function' ? getProcess() : null;
    if (!processRef) {
      return;
    }
    const checkToken = ++readinessCheckToken;

    const requestId = `__readiness_check_${attempt}__`;
    const request = {
      jsonrpc: '2.0',
      id: requestId,
      method: 'ping',
      params: {},
    };

    try {
      const jsonStr = JSON.stringify(request);
      processRef.stdin.write(`${jsonStr}\n`);
    } catch (error) {
      logger.error?.('[LocalBackend] Failed to send ping:', error);
      scheduleRetry(mainWindow, attempt, maxAttempts, checkToken);
      return;
    }

    readinessCheckCallback = (response) => {
      if (checkToken !== readinessCheckToken) {
        return;
      }
      if (response.id !== requestId) {
        return;
      }

      readinessCheckCallback = null;

      if (response.result && response.result.status === 'ok') {
        if (process.env.NODE_ENV !== 'production') {
          logger.log?.('[LocalBackend] Python service ready (verified via ping)');
        }
        markReady(mainWindow);
        return;
      }

      if (!scheduleRetry(mainWindow, attempt, maxAttempts, checkToken)) {
        if (!isTestEnv) {
          logger.warn?.('[LocalBackend] Backend readiness check failed after max attempts');
        }
        markFailed(
          mainWindow,
          'Local backend readiness check failed after max attempts',
        );
      }
    };

    setTimeoutFn(() => {
      if (checkToken !== readinessCheckToken) {
        return;
      }
      if (readinessCheckCallback) {
        readinessCheckCallback = null;
        if (!scheduleRetry(mainWindow, attempt, maxAttempts, checkToken)) {
          if (!isTestEnv) {
            logger.warn?.('[LocalBackend] Backend readiness check timed out after max attempts');
          }
          markFailed(
            mainWindow,
            'Local backend readiness check timed out after max attempts',
          );
        }
      }
    }, 500);
  }

  return {
    check,
    getCallback,
    markFailed,
    markReady,
    resetToGeneration,
  };
}

module.exports = {
  createLocalBackendReadinessRuntime,
  getReadinessRetryDelay,
};
