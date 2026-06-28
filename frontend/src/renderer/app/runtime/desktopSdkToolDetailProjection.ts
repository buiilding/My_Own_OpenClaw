/**
 * Sanitizes SDK tool detail records before renderer message presentation.
 */

const sdkToolDetailDisplayStringKeys = [
  'bundleId',
  'correlationId',
  'displayCorrelationId',
  'displaySource',
  'requestId',
  'sourceEventType',
  'toolCallId',
  'toolName',
];

const sdkToolDetailDisplayBooleanKeys = [
  'success',
];

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function exactString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    ? value
    : null;
}

function sanitizeSdkToolDetailRecord(value: unknown): Record<string, unknown> | null {
  const record = recordFromUnknown(value);
  if (!record) {
    return null;
  }
  const sanitized: Record<string, unknown> = {};
  sdkToolDetailDisplayStringKeys.forEach((key) => {
    const entryValue = exactString(record[key]);
    if (entryValue) {
      sanitized[key] = entryValue;
    }
  });
  sdkToolDetailDisplayBooleanKeys.forEach((key) => {
    const entryValue = record[key];
    if (typeof entryValue === 'boolean') {
      sanitized[key] = entryValue;
    }
  });
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

export const DesktopSdkToolDetailProjection = Object.freeze({
  sanitizeSdkToolDetailRecord,
});
