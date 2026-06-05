function formatLocalBackendProcessError(error, launchTarget = {}) {
  if (error?.code !== 'ENOENT') {
    return error?.message || 'Local backend process error';
  }

  if (launchTarget.kind === 'binary') {
    return `Bundled sidecar executable '${launchTarget.command}' not found. Reinstall WindieOS.`;
  }

  return `Python executable '${launchTarget.command}' not found. Please install Python 3 or ensure it is in your PATH.`;
}

function createLocalBackendProcessEvents({
  isActiveProcessReference,
  notifyBackendUnavailable,
  resetBackendProcessState,
  logger = console,
} = {}) {
  function handleExit({
    processRef,
    mainWindow,
    code,
    signal,
  } = {}) {
    if (
      typeof isActiveProcessReference === 'function'
      && !isActiveProcessReference(processRef)
    ) {
      return;
    }

    logger.log?.(`[LocalBackend] Python process exited with code ${code}, signal ${signal}`);
    const isErrorExit = code !== 0 && code !== null;
    resetBackendProcessState?.({
      reason: 'Local backend process exited',
      status: isErrorExit ? 'error' : 'stopped',
    });
    if (isErrorExit) {
      notifyBackendUnavailable?.(mainWindow, `Python process exited with code ${code}`);
    }
  }

  function handleError({
    processRef,
    mainWindow,
    launchTarget,
    error,
  } = {}) {
    if (
      typeof isActiveProcessReference === 'function'
      && !isActiveProcessReference(processRef)
    ) {
      return;
    }

    logger.error?.('[LocalBackend] Failed to start Python process:', error);
    resetBackendProcessState?.({
      reason: 'Local backend process error',
      status: 'error',
    });
    notifyBackendUnavailable?.(
      mainWindow,
      formatLocalBackendProcessError(error, launchTarget),
    );
  }

  function attach({
    processRef,
    mainWindow,
    launchTarget,
  } = {}) {
    if (!processRef || typeof processRef.on !== 'function') {
      return;
    }
    processRef.on('exit', (code, signal) => {
      handleExit({
        processRef,
        mainWindow,
        code,
        signal,
      });
    });
    processRef.on('error', (error) => {
      handleError({
        processRef,
        mainWindow,
        launchTarget,
        error,
      });
    });
  }

  return {
    attach,
    handleError,
    handleExit,
  };
}

module.exports = {
  createLocalBackendProcessEvents,
  formatLocalBackendProcessError,
};
