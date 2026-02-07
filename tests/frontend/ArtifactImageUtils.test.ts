import {
  normalizeArtifactImageContentType,
  resolveArtifactImageExtension,
} from '../../frontend/src/renderer/infrastructure/services/ArtifactImageUtils';

describe('ArtifactImageUtils', () => {
  test('normalizes image content type with jpeg fallback', () => {
    expect(normalizeArtifactImageContentType(undefined)).toBe('image/jpeg');
    expect(normalizeArtifactImageContentType('')).toBe('image/jpeg');
    expect(normalizeArtifactImageContentType('image/jpeg')).toBe('image/jpeg');
    expect(normalizeArtifactImageContentType('IMAGE/JPG')).toBe('image/jpeg');
  });

  test('normalizes png content type', () => {
    expect(normalizeArtifactImageContentType('image/png')).toBe('image/png');
    expect(normalizeArtifactImageContentType('IMAGE/PNG')).toBe('image/png');
  });

  test('resolves extension from normalized content type', () => {
    expect(resolveArtifactImageExtension(undefined)).toBe('jpg');
    expect(resolveArtifactImageExtension('image/jpeg')).toBe('jpg');
    expect(resolveArtifactImageExtension('image/png')).toBe('png');
  });
});
