/**
 * Sanitizes SDK tool detail records before renderer message presentation.
 */

const sdkToolDetailOwnedChannelKeys = new Set([
  'attachments',
  'modelFacingToolCall',
  'modelId',
  'modelProvider',
  'payload',
  'raw',
  'screenshot',
  'screenshotRef',
  'screenshotUrl',
  'screenshot_ref',
  'screenshot_refs',
  'screenshot_url',
  'screenshotRefs',
  'structuredPayload',
]);

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function sanitizeSdkToolDetailRecord(value: unknown): Record<string, unknown> | null {
  const record = recordFromUnknown(value);
  if (!record) {
    return null;
  }
  const sanitized: Record<string, unknown> = {};
  Object.entries(record).forEach(([key, entryValue]) => {
    if (!sdkToolDetailOwnedChannelKeys.has(key)) {
      sanitized[key] = entryValue;
    }
  });
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

export const DesktopSdkToolDetailProjection = Object.freeze({
  sanitizeSdkToolDetailRecord,
});
