/**
 * Owns IPC-facing app diagnostic append error handling.
 */

const {
  APP_DIAGNOSTICS_PATH,
  appendDiagnosticEvent: appendDiagnosticEventDefault,
} = require('../diagnostics/app_diagnostics_store.cjs');

function createIpcAppDiagnosticsRuntime(deps = {}) {
  const {
    appendDiagnosticEvent = appendDiagnosticEventDefault,
    defaultDiagnosticsPath = APP_DIAGNOSTICS_PATH,
    log = () => {},
  } = deps;

  function appendAppDiagnostic(input = {}) {
    try {
      return appendDiagnosticEvent(input);
    } catch (error) {
      const reason = error?.message || String(error);
      log(`[AppDiagnostics] failed to persist ${input.path || defaultDiagnosticsPath}: ${reason}`);
      return { stored: false, reason };
    }
  }

  return {
    appendAppDiagnostic,
  };
}

module.exports = {
  createIpcAppDiagnosticsRuntime,
};
