function createStoppedToolExecutor() {
  return async () => ({
    success: false,
    error: 'Local backend bridge is stopped.',
  });
}

function createLocalBackendStopController({
  clearDaemonRuntime,
  getDaemonManager,
  getProcess,
  resetBackendProcessState,
  setRuntimeExecuteTool,
  supervisor,
  logger = console,
  setTimeoutFn = setTimeout,
} = {}) {
  function stop() {
    setRuntimeExecuteTool?.(createStoppedToolExecutor());

    const daemonManager = typeof getDaemonManager === 'function'
      ? getDaemonManager()
      : null;
    if (daemonManager) {
      void daemonManager.shutdown?.();
      clearDaemonRuntime?.();
      resetBackendProcessState?.({
        reason: 'Sidecar daemon stopped',
        status: 'stopped',
      });
    }

    const processToStop = typeof getProcess === 'function'
      ? getProcess()
      : null;
    if (!processToStop) {
      return;
    }

    supervisor?.beginStop?.();
    logger.log?.('[LocalBackend] Stopping Python process...');
    processToStop.kill?.('SIGTERM');

    setTimeoutFn(() => {
      const currentProcess = typeof getProcess === 'function'
        ? getProcess()
        : null;
      if (currentProcess && currentProcess === processToStop) {
        logger.log?.('[LocalBackend] Force killing Python process');
        processToStop.kill?.('SIGKILL');
      }
    }, 5000);
  }

  return {
    stop,
  };
}

module.exports = {
  createLocalBackendStopController,
  createStoppedToolExecutor,
};
