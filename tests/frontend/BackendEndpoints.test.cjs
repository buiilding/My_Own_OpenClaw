const {
  resolveBackendEndpointCandidates,
  resolveBackendEndpoints,
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

describe('backend_endpoints hosted defaults', () => {
  test('uses canonical hosted-default override pair', () => {
    const env = {
      WINDIE_DEFAULT_BACKEND_HTTP_URL: 'https://staging.windieos.com/',
      WINDIE_DEFAULT_BACKEND_WS_URL: 'wss://staging.windieos.com/ws',
    };

    expect(resolveBackendEndpoints(env)).toEqual({
      httpUrl: 'https://staging.windieos.com',
      wsUrl: 'wss://staging.windieos.com/ws',
      wsOrigin: 'https://staging.windieos.com',
    });
  });

  test('ignores removed packaged hosted-default override names', () => {
    const candidates = resolveBackendEndpointCandidates({
      WINDIE_DEFAULT_PACKAGED_BACKEND_HTTP_URL: 'https://packaged.example.com',
      WINDIE_DEFAULT_PACKAGED_BACKEND_WS_URL: 'wss://packaged.example.com/ws',
    });

    expect(candidates).toEqual([
      {
        httpUrl: 'https://api.windieos.com',
        wsUrl: 'wss://api.windieos.com/ws',
        wsOrigin: 'https://api.windieos.com',
      },
    ]);
  });
});
