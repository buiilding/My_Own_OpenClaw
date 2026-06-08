function createLocalBackendStderrTransport({
  isActiveProcessReference,
  shouldForwardStderrLine,
  logger = console,
} = {}) {
  function handleData(processRef, data) {
    if (
      typeof isActiveProcessReference === 'function'
      && !isActiveProcessReference(processRef)
    ) {
      return;
    }

    const text = data?.toString?.() || '';
    const lines = text.split('\n');
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      if (
        typeof shouldForwardStderrLine === 'function'
        && !shouldForwardStderrLine(line)
      ) {
        continue;
      }
      logger.log?.(`[LocalBackend Python] ${line}`);
    }
  }

  function attach(processRef) {
    if (!processRef?.stderr || typeof processRef.stderr.on !== 'function') {
      return;
    }
    processRef.stderr.on('data', (data) => {
      handleData(processRef, data);
    });
  }

  return {
    attach,
    handleData,
  };
}

module.exports = {
  createLocalBackendStderrTransport,
};
