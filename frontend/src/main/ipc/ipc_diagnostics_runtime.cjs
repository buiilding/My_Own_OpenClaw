/**
 * Coordinates the ipc diagnostics runtime for the Electron main process.
 */

const {
  appendFrontendInteractionDiagnostic: appendFrontendInteractionDiagnosticRuntime,
} = require('../diagnostics/app_diagnostics_runtime.cjs');
const {
  appendLayerLogLine,
  formatConsoleArgs,
} = require('../logging/layer_log_sink.cjs');

const INTERACTION_SCHEMA_VERSION = 1;
const MESSAGE_TEXT_REDACTION = '[redacted]';

function shouldIncludeMessageText({
  allowMessageText = false,
  isDev = process.env.NODE_ENV !== 'production',
} = {}) {
  return allowMessageText === true && isDev === true;
}

function normalizeFrontendInteractionEntry(entry = {}, options = {}) {
  const source = (
    entry
    && typeof entry === 'object'
    && !Array.isArray(entry)
  ) ? entry : {};
  const normalized = {
    schemaVersion: INTERACTION_SCHEMA_VERSION,
    source: 'frontend-interaction',
    action: typeof source.action === 'string' ? source.action : 'unknown',
    event: typeof source.event === 'string' ? source.event : 'unknown',
    view: typeof source.view === 'string' ? source.view : 'unknown',
    timestamp: typeof source.timestamp === 'string'
      ? source.timestamp
      : new Date(0).toISOString(),
    ...source,
  };

  if (Object.prototype.hasOwnProperty.call(normalized, 'messageText')) {
    const rawMessageText = typeof normalized.messageText === 'string'
      ? normalized.messageText
      : '';
    normalized.messageTextLength = typeof normalized.messageTextLength === 'number'
      ? normalized.messageTextLength
      : rawMessageText.length;
    if (!shouldIncludeMessageText(options)) {
      normalized.messageText = MESSAGE_TEXT_REDACTION;
      normalized.messageTextRedacted = true;
    } else {
      normalized.messageTextRedacted = false;
    }
  }

  return normalized;
}

function compactDiagnosticValue(value, maxLength = 80) {
  if (typeof value !== 'string') {
    return '-';
  }
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '-';
  }
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}…`
    : normalized;
}

function formatFrontendInteractionSummary(entry = {}) {
  const target = entry.target && typeof entry.target === 'object' && !Array.isArray(entry.target)
    ? entry.target
    : {};
  return [
    `action=${compactDiagnosticValue(entry.action, 48)}`,
    `event=${compactDiagnosticValue(entry.event, 32)}`,
    `view=${compactDiagnosticValue(entry.view, 48)}`,
    `label=${JSON.stringify(compactDiagnosticValue(target.label, 64))}`,
    `target=${compactDiagnosticValue(target.tagName, 24)}`,
  ].join(' ');
}

function handleRendererLog(payload = {}, {
  log = console.log,
  diagnosticsOptions = {},
  appendFrontendInteractionDiagnostic = appendFrontendInteractionDiagnosticRuntime,
  writeRendererLogLine = appendLayerLogLine,
} = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }
  if (payload.source === 'frontend-interaction') {
    const entry = normalizeFrontendInteractionEntry(payload.entry || {}, diagnosticsOptions);
    appendFrontendInteractionDiagnostic(entry);
    writeRendererLogLine('renderer', `[Renderer][interaction] ${formatFrontendInteractionSummary(entry)}`);
    if (process.env.WINDIE_DEBUG_SURFACE_STDOUT === '1') {
      log(`[FrontendInteraction][renderer] ${formatFrontendInteractionSummary(entry)}`);
    }
    return true;
  }
  writeRendererLogLine('renderer', `[Renderer][ipc] ${formatConsoleArgs([payload])}`);
  if (process.env.WINDIE_DEBUG_SURFACE_STDOUT === '1') {
    log('[RendererLog]', payload);
  }
  return true;
}

module.exports = {
  handleRendererLog,
};
