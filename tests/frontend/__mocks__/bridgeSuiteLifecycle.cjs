/**
 * Covers bridge suite lifecycle behavior in the frontend test suite.
 */

function createBridgeSuiteLifecycle({
  originalEnv,
  useRealTimersAfterEach = false,
}) {
  function resetBackendEnv() {
    process.env = { ...originalEnv };
    delete process.env.BACKEND_HOST;
    delete process.env.BACKEND_PORT;
    delete process.env.BACKEND_HTTP_URL;
    delete process.env.BACKEND_WS_URL;
  }

  function restoreBackendEnv() {
    process.env = originalEnv;
  }

  function silenceBridgeLogs() {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  }

  function registerBridgeSuiteLifecycleHooks() {
    beforeEach(() => {
      resetBackendEnv();
      silenceBridgeLogs();
    });

    afterEach(() => {
      if (useRealTimersAfterEach) {
        jest.useRealTimers();
      }
      jest.restoreAllMocks();
    });

    afterAll(() => {
      restoreBackendEnv();
    });
  }

  return {
    resetBackendEnv,
    restoreBackendEnv,
    silenceBridgeLogs,
    registerBridgeSuiteLifecycleHooks,
  };
}

module.exports = {
  createBridgeSuiteLifecycle,
};
