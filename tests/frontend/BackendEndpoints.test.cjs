/**
 * Covers backend endpoints. behavior in the frontend test suite.
 */

const fs = require('fs');
const path = require('path');

const {
  configureBackendEndpointRuntime,
  resolveBackendEndpointCandidates,
  resolveBackendEndpoints,
  resolvePreferredArtifactHttpUrl,
} = require('../../frontend/src/main/app/backend_endpoints.cjs');
const {
  mainHostSkin,
} = require('../../frontend/src/main/app/main_host_skin.cjs');

describe('backend_endpoints artifact url selection', () => {
  beforeEach(() => {
    configureBackendEndpointRuntime(mainHostSkin.hostedBackend);
  });

  afterEach(() => {
    configureBackendEndpointRuntime();
  });

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
  beforeEach(() => {
    configureBackendEndpointRuntime(mainHostSkin.hostedBackend);
  });

  afterEach(() => {
    configureBackendEndpointRuntime();
  });

  test('uses host config for hosted endpoint defaults and loopback fallback naming', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../frontend/src/main/app/backend_endpoints.cjs'),
      'utf8',
    );

    expect(source).toContain('DEFAULT_LOOPBACK_BACKEND_HOST');
    expect(source).toContain('DEFAULT_LOOPBACK_BACKEND_PORT');
    expect(source).toContain('configureBackendEndpointRuntime');
    expect(source).not.toContain('mainHostSkin');
    expect(source).toContain('normalizeHostedBackendConfig');
    expect(source).toContain(
      'Backend endpoint resolution for Electron main process and local runtime consumers.',
    );
    expect(source).toContain('resolveLoopbackFallbackEndpoints');
    expect(source).toContain('explicitHostOrPortOverride');
    expect(source).toContain('loopbackCandidates');
    expect(source).not.toContain('Backend endpoint resolution for Electron main process + sidecar.');
    expect(source).not.toContain(['DEFAULT', 'LOCAL', 'BACKEND', 'HOST'].join('_'));
    expect(source).not.toContain(['DEFAULT', 'LOCAL', 'BACKEND', 'PORT'].join('_'));
    expect(source).not.toContain(['resolveLocal', 'FallbackEndpoints'].join(''));
    expect(source).not.toContain(['explicitLocal', 'HostOrPort'].join(''));
    expect(source).not.toContain(['local', 'Candidates'].join(''));
    expect(source).not.toContain('WINDIE_DEFAULT_BACKEND_HTTP_URL');
    expect(source).not.toContain('WINDIE_DEFAULT_BACKEND_WS_URL');
  });

  test('generic resolver defaults to loopback without host configuration', () => {
    configureBackendEndpointRuntime();

    expect(resolveBackendEndpoints({})).toEqual({
      httpUrl: 'http://127.0.0.1:8765',
      wsUrl: 'ws://127.0.0.1:8765/ws',
      wsOrigin: 'http://127.0.0.1:8765',
    });
    expect(resolvePreferredArtifactHttpUrl(null, [])).toBe('http://127.0.0.1:8765');
  });

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

  test('supports non-Windie hosted-default override env names from host config', () => {
    const env = {
      AGENT_DEFAULT_BACKEND_HTTP_URL: 'https://agent.example.com/',
      AGENT_DEFAULT_BACKEND_WS_URL: 'wss://agent.example.com/ws',
    };
    const hostedBackend = {
      httpUrl: 'https://default.example.com',
      wsUrl: 'wss://default.example.com/ws',
      env: {
        defaultHttpUrl: 'AGENT_DEFAULT_BACKEND_HTTP_URL',
        defaultWsUrl: 'AGENT_DEFAULT_BACKEND_WS_URL',
      },
    };

    expect(resolveBackendEndpoints(env, { hostedBackend })).toEqual({
      httpUrl: 'https://agent.example.com',
      wsUrl: 'wss://agent.example.com/ws',
      wsOrigin: 'https://agent.example.com',
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

  test('active endpoint docs do not list removed packaged default env names', () => {
    const docs = [
      'docs/help/doctor_checklist.md',
      'docs/operations/runtime_configuration_matrix.md',
      'docs/operations/configuration.md',
      'docs/operations/sidecar_runtime_packaging.md',
      'docs/getting-started/installation.md',
      'docs/install/local_backend_and_endpoint_setup.md',
    ];

    for (const docPath of docs) {
      const content = fs.readFileSync(path.resolve(__dirname, '../..', docPath), 'utf8');
      expect(content).not.toContain('WINDIE_DEFAULT_PACKAGED_BACKEND_HTTP_URL');
      expect(content).not.toContain('WINDIE_DEFAULT_PACKAGED_BACKEND_WS_URL');
    }
  });

  test('falls back to hosted defaults when local host or port override is invalid', () => {
    const env = {
      BACKEND_PORT: 'not-a-port',
    };

    expect(resolveBackendEndpointCandidates(env)).toEqual([
      {
        httpUrl: 'https://api.windieos.com',
        wsUrl: 'wss://api.windieos.com/ws',
        wsOrigin: 'https://api.windieos.com',
      },
    ]);
    expect(resolveBackendEndpoints(env)).toEqual({
      httpUrl: 'https://api.windieos.com',
      wsUrl: 'wss://api.windieos.com/ws',
      wsOrigin: 'https://api.windieos.com',
    });
  });
});
