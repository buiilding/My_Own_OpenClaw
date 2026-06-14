/**
 * Provides the capture payload utils module for the renderer UI.
 */

export function sanitizeCaptureMeta<T extends Record<string, unknown> = Record<string, unknown>>(
  value: unknown,
): T | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const { screenshot_id: _ignoredScreenshotId, ...rest } = value as Record<string, unknown>;
  return rest as T;
}

export function resolveScreenshotContentType(data: Record<string, unknown>): string | null {
  const rawFormat = (
    data.screenshot_content_type
    || data.compression
    || data.format
    || ''
  );
  const format = String(rawFormat).toLowerCase();
  if (format === 'image/png' || format === 'png') {
    return 'image/png';
  }
  if (format === 'image/jpeg' || format === 'jpeg' || format === 'jpg') {
    return 'image/jpeg';
  }
  return null;
}
