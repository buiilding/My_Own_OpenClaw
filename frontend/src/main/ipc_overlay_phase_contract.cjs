const RESPONSE_OVERLAY_PHASES = new Set([
  'idle',
  'awaiting-first-chunk',
  'streaming',
  'tool-call',
  'tool-output',
  'complete',
  'error',
]);

const RESPONSE_OVERLAY_METADATA_KEYS = [
  'correlation_id',
  'attempt',
  'max_attempts',
  'recovery_stage',
  'failure_reason',
];

function normalizeOverlayString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOverlayNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

module.exports = {
  RESPONSE_OVERLAY_METADATA_KEYS,
  RESPONSE_OVERLAY_PHASES,
  normalizeOverlayNumber,
  normalizeOverlayString,
};
