const {
  resolvePreferredArtifactHttpUrl,
} = require('../../frontend/src/main/backend_endpoints.cjs');

describe('backend_endpoints artifact url selection', () => {
  test('prefers loopback artifact base when hosted backend is primary', () => {
    expect(resolvePreferredArtifactHttpUrl('https://api.windieos.com', [
      { httpUrl: 'https://api.windieos.com' },
      { httpUrl: 'http://127.0.0.1:8765' },
    ])).toBe('http://127.0.0.1:8765');
  });

  test('falls back to active backend http url when no loopback candidate exists', () => {
    expect(resolvePreferredArtifactHttpUrl('https://api.windieos.com', [
      { httpUrl: 'https://api.windieos.com' },
    ])).toBe('https://api.windieos.com');
  });

  test('uses canonical hosted artifact base when no endpoint data exists', () => {
    expect(resolvePreferredArtifactHttpUrl(null, [])).toBe('https://api.windieos.com');
  });
});
