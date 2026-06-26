/**
 * Provides the artifact image utils module for the renderer UI.
 */

const IMAGE_CONTENT_TYPE_TO_EXTENSION: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/svg+xml': 'svg',
};

export function inferArtifactRefFromUrl(url?: string | null): string | null {
  const normalizedUrl = (url || '').trim();
  if (!normalizedUrl) {
    return null;
  }
  const match = normalizedUrl.match(/\/api\/artifacts\/([^/?#]+)/i);
  return match?.[1] || null;
}

export function normalizeArtifactImageContentType(contentType?: string | null): string {
  const normalized = (contentType || '').toLowerCase().trim();
  if (!normalized) {
    return 'image/jpeg';
  }
  for (const knownType of Object.keys(IMAGE_CONTENT_TYPE_TO_EXTENSION)) {
    if (normalized === knownType || normalized.startsWith(`${knownType};`)) {
      return knownType === 'image/jpg' ? 'image/jpeg' : knownType;
    }
  }
  if (normalized.includes('png')) {
    return 'image/png';
  }
  if (normalized.includes('webp')) {
    return 'image/webp';
  }
  if (normalized.includes('gif')) {
    return 'image/gif';
  }
  if (normalized.includes('bmp')) {
    return 'image/bmp';
  }
  if (normalized.includes('tiff') || normalized.includes('tif')) {
    return 'image/tiff';
  }
  if (normalized.includes('icon') || normalized.includes('ico')) {
    return 'image/x-icon';
  }
  if (normalized.includes('svg')) {
    return 'image/svg+xml';
  }
  return 'image/jpeg';
}

export function resolveArtifactImageExtension(contentType?: string | null): string {
  const normalized = normalizeArtifactImageContentType(contentType);
  return IMAGE_CONTENT_TYPE_TO_EXTENSION[normalized] || 'jpg';
}
