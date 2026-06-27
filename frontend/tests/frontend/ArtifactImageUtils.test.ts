/**
 * Covers artifact image utils. behavior in the frontend test suite.
 */

import {
  inferArtifactRefFromUrl,
  normalizeArtifactImageContentType,
  resolveArtifactImageExtension,
} from '../../src/renderer/infrastructure/services/ArtifactImageUtils';

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

  test('normalizes additional image content types', () => {
    expect(normalizeArtifactImageContentType('image/webp')).toBe('image/webp');
    expect(normalizeArtifactImageContentType('image/gif')).toBe('image/gif');
    expect(normalizeArtifactImageContentType('image/tiff')).toBe('image/tiff');
    expect(normalizeArtifactImageContentType('image/svg+xml')).toBe('image/svg+xml');
    expect(normalizeArtifactImageContentType('image/x-icon')).toBe('image/x-icon');
  });

  test('resolves extension from normalized content type', () => {
    expect(resolveArtifactImageExtension(undefined)).toBe('jpg');
    expect(resolveArtifactImageExtension('image/jpeg')).toBe('jpg');
    expect(resolveArtifactImageExtension('image/png')).toBe('png');
    expect(resolveArtifactImageExtension('image/webp')).toBe('webp');
    expect(resolveArtifactImageExtension('image/gif')).toBe('gif');
    expect(resolveArtifactImageExtension('image/tiff')).toBe('tiff');
    expect(resolveArtifactImageExtension('image/x-icon')).toBe('ico');
    expect(resolveArtifactImageExtension('image/svg+xml')).toBe('svg');
  });

  test('infers artifact ids from backend artifact urls', () => {
    expect(inferArtifactRefFromUrl('http://127.0.0.1:8765/api/artifacts/artifact-77')).toBe('artifact-77');
    expect(inferArtifactRefFromUrl('https://cdn.example/not-an-artifact.png')).toBeNull();
    expect(inferArtifactRefFromUrl('')).toBeNull();
  });
});
