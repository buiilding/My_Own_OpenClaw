const DEFAULT_LARGE_JSON_PARSE_OFFLOAD_THRESHOLD_BYTES = 128 * 1024;

function shouldOffloadJsonParse(
  line,
  thresholdBytes = DEFAULT_LARGE_JSON_PARSE_OFFLOAD_THRESHOLD_BYTES,
) {
  return Buffer.byteLength(line, 'utf8') >= thresholdBytes;
}

function parseJsonInWorker(line) {
  let WorkerClass;
  try {
    ({ Worker: WorkerClass } = require('worker_threads'));
  } catch (_error) {
    return Promise.resolve(JSON.parse(line));
  }

  return new Promise((resolve, reject) => {
    const worker = new WorkerClass(
      `
const { parentPort } = require('worker_threads');
parentPort.on('message', (payload) => {
  try {
    parentPort.postMessage({ ok: true, value: JSON.parse(payload) });
  } catch (error) {
    parentPort.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
`,
      { eval: true },
    );

    let settled = false;
    const finish = (resolver, value) => {
      if (settled) {
        return;
      }
      settled = true;
      Promise.resolve(worker.terminate())
        .catch(() => {})
        .finally(() => resolver(value));
    };

    worker.once('message', (message) => {
      if (message && message.ok === true) {
        finish(resolve, message.value);
        return;
      }
      const errorMessage = (
        message
        && typeof message === 'object'
        && typeof message.error === 'string'
        && message.error.trim()
      ) ? message.error : 'JSON parse worker failed';
      finish(reject, new Error(errorMessage));
    });

    worker.once('error', (error) => {
      finish(reject, error);
    });

    worker.once('exit', (code) => {
      if (!settled && code !== 0) {
        finish(reject, new Error(`JSON parse worker exited with code ${code}`));
      }
    });

    worker.postMessage(line);
  });
}

function createLocalBackendStdoutTransport({
  handleResponse,
  isActiveProcessReference,
  logger = console,
  thresholdBytes = DEFAULT_LARGE_JSON_PARSE_OFFLOAD_THRESHOLD_BYTES,
} = {}) {
  let stdoutBuffer = '';
  let pendingStdoutLines = [];
  let isDrainingStdoutLines = false;

  function reset() {
    stdoutBuffer = '';
    pendingStdoutLines = [];
    isDrainingStdoutLines = false;
  }

  async function drainStdoutLines(processRef) {
    if (isDrainingStdoutLines) {
      return;
    }
    isDrainingStdoutLines = true;

    try {
      while (pendingStdoutLines.length > 0) {
        if (
          typeof isActiveProcessReference === 'function'
          && !isActiveProcessReference(processRef)
        ) {
          pendingStdoutLines = [];
          return;
        }

        const line = pendingStdoutLines.shift();
        try {
          const response = shouldOffloadJsonParse(line, thresholdBytes)
            ? await parseJsonInWorker(line)
            : JSON.parse(line);
          handleResponse(response);
        } catch (error) {
          logger.error?.('[LocalBackend] Error parsing response:', error, 'Line:', line);
        }
      }
    } finally {
      isDrainingStdoutLines = false;
      if (
        pendingStdoutLines.length > 0
        && (
          typeof isActiveProcessReference !== 'function'
          || isActiveProcessReference(processRef)
        )
      ) {
        void drainStdoutLines(processRef);
      }
    }
  }

  function handleData(processRef, data) {
    if (
      typeof isActiveProcessReference === 'function'
      && !isActiveProcessReference(processRef)
    ) {
      return;
    }
    try {
      stdoutBuffer += data.toString();

      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }

        const queueLine = (
          isDrainingStdoutLines
          || pendingStdoutLines.length > 0
          || shouldOffloadJsonParse(line, thresholdBytes)
        );

        if (queueLine) {
          pendingStdoutLines.push(line);
          continue;
        }

        try {
          const response = JSON.parse(line);
          handleResponse(response);
        } catch (error) {
          logger.error?.('[LocalBackend] Error parsing response:', error, 'Line:', line);
        }
      }

      if (pendingStdoutLines.length > 0) {
        void drainStdoutLines(processRef);
      }
    } catch (error) {
      logger.error?.('[LocalBackend] Error processing stdout:', error);
    }
  }

  function attach(processRef) {
    if (!processRef?.stdout || typeof processRef.stdout.on !== 'function') {
      return;
    }
    processRef.stdout.on('data', (data) => {
      handleData(processRef, data);
    });
  }

  return {
    attach,
    handleData,
    reset,
  };
}

module.exports = {
  DEFAULT_LARGE_JSON_PARSE_OFFLOAD_THRESHOLD_BYTES,
  createLocalBackendStdoutTransport,
  parseJsonInWorker,
  shouldOffloadJsonParse,
};
