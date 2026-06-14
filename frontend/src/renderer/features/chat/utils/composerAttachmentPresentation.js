/**
 * Provides the composer attachment presentation module for the renderer UI.
 */

export function resolveReadableFileTypeLabel(filename) {
  if (typeof filename !== 'string') {
    return 'FILE';
  }
  const normalized = filename.trim();
  const lastDotIndex = normalized.lastIndexOf('.');
  if (lastDotIndex < 0 || lastDotIndex === normalized.length - 1) {
    return 'FILE';
  }
  const extension = normalized.slice(lastDotIndex + 1).trim();
  if (extension.length === 0) {
    return 'FILE';
  }
  const upper = extension.toUpperCase();
  return upper.length <= 8 ? upper : upper.slice(0, 8);
}
