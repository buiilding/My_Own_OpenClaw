export type ArtifactImageContentType = 'image/jpeg' | 'image/png';

export function normalizeArtifactImageContentType(contentType?: string | null): ArtifactImageContentType {
  const normalized = (contentType || '').toLowerCase();
  if (normalized.includes('png')) {
    return 'image/png';
  }
  return 'image/jpeg';
}

export function resolveArtifactImageExtension(contentType?: string | null): 'jpg' | 'png' {
  return normalizeArtifactImageContentType(contentType) === 'image/png' ? 'png' : 'jpg';
}
