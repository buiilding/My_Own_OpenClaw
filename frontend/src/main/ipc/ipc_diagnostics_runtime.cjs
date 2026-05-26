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

function handleRendererLog(payload = {}, {
  log = console.log,
  diagnosticsOptions = {},
} = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }
  if (payload.source === 'frontend-interaction') {
    log(
      '[FrontendInteraction][renderer]',
      normalizeFrontendInteractionEntry(payload.entry || {}, diagnosticsOptions),
    );
    return true;
  }
  log('[RendererLog]', payload);
  return true;
}

module.exports = {
  handleRendererLog,
  normalizeFrontendInteractionEntry,
  shouldIncludeMessageText,
};
