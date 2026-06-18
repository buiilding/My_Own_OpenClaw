/**
 * Coordinates the ipc diagnostics runtime for the Electron main process.
 */

const {
  appendRendererInteractionDiagnostic: appendRendererInteractionDiagnosticRuntime,
} = require('../diagnostics/app_diagnostics_runtime.cjs');
const {
  appendLayerLogLine,
  formatConsoleArgs,
} = require('../logging/layer_log_sink.cjs');
const {
  isDebugFlagEnabled,
} = require('../app/debug_env.cjs');

const INTERACTION_SCHEMA_VERSION = 1;
const MESSAGE_TEXT_REDACTION = '[redacted]';

function shouldIncludeMessageText({
  allowMessageText = false,
  isDev = process.env.NODE_ENV !== 'production',
} = {}) {
  return allowMessageText === true && isDev === true;
}

function normalizeRendererInteractionEntry(entry = {}, options = {}) {
  const source = (
    entry
    && typeof entry === 'object'
    && !Array.isArray(entry)
  ) ? entry : {};
  const normalized = {
    schemaVersion: INTERACTION_SCHEMA_VERSION,
    source: 'renderer-interaction',
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

function formatRendererInteractionSummary(entry = {}) {
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
  appendRendererInteractionDiagnostic = appendRendererInteractionDiagnosticRuntime,
  writeRendererLogLine = appendLayerLogLine,
} = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }
  if (payload.source === 'renderer-interaction') {
    const entry = normalizeRendererInteractionEntry(payload.entry || {}, diagnosticsOptions);
    appendRendererInteractionDiagnostic(entry);
    writeRendererLogLine('renderer', `[Renderer][interaction] ${formatRendererInteractionSummary(entry)}`);
    if (isDebugFlagEnabled('surfaceStdout')) {
      log(`[RendererInteraction][renderer] ${formatRendererInteractionSummary(entry)}`);
    }
    return true;
  }
  writeRendererLogLine('renderer', `[Renderer][ipc] ${formatConsoleArgs([payload])}`);
  if (isDebugFlagEnabled('surfaceStdout')) {
    log('[RendererLog]', payload);
  }
  return true;
}

module.exports = {
  handleRendererLog,
};
