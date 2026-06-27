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
} = require('../../src/main/app/backend_endpoints.cjs');

const sampleHostedBackend = Object.freeze({
  httpUrl: 'https://hosted.example.test',
  wsUrl: 'wss://hosted.example.test/ws',
  env: Object.freeze({
    defaultHttpUrl: 'SAMPLE_DEFAULT_BACKEND_HTTP_URL',
    defaultWsUrl: 'SAMPLE_DEFAULT_BACKEND_WS_URL',
  }),
});

const hostedDefaultHttpEnv = ['WINDIE', 'DEFAULT', 'BACKEND', 'HTTP', 'URL'].join('_');
const hostedDefaultWsEnv = ['WINDIE', 'DEFAULT', 'BACKEND', 'WS', 'URL'].join('_');
const retiredPackagedHttpEnv = ['WINDIE', 'DEFAULT', 'PACKAGED', 'BACKEND', 'HTTP', 'URL'].join('_');
const retiredPackagedWsEnv = ['WINDIE', 'DEFAULT', 'PACKAGED', 'BACKEND', 'WS', 'URL'].join('_');
const hostSkinSymbol = ['main', 'Host', 'Skin'].join('');

describe('backend_endpoints artifact url selection', () => {
  beforeEach(() => {
    configureBackendEndpointRuntime(sampleHostedBackend);
  });

  afterEach(() => {
    configureBackendEndpointRuntime();
  });

  test('prefers loopback artifact base when hosted backend is primary', () => {
    expect(resolvePreferredArtifactHttpUrl('https://hosted.example.test', [
      { httpUrl: 'https://hosted.example.test' },
      { httpUrl: 'http://127.0.0.1:8765' },
    ])).toBe('http://127.0.0.1:8765');
  });

  test('falls back to active backend http url when no loopback candidate exists', () => {
    expect(resolvePreferredArtifactHttpUrl('https://hosted.example.test', [
      { httpUrl: 'https://hosted.example.test' },
    ])).toBe('https://hosted.example.test');
  });

  test('uses canonical hosted artifact base when no endpoint data exists', () => {
    expect(resolvePreferredArtifactHttpUrl(null, [])).toBe('https://hosted.example.test');
  });
});

describe('backend_endpoints hosted defaults', () => {
  beforeEach(() => {
    configureBackendEndpointRuntime(sampleHostedBackend);
  });

  afterEach(() => {
    configureBackendEndpointRuntime();
  });

  test('uses host config for hosted endpoint defaults and loopback fallback naming', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../src/main/app/backend_endpoints.cjs'),
      'utf8',
    );

    expect(source).toContain('DEFAULT_LOOPBACK_BACKEND_HOST');
    expect(source).toContain('DEFAULT_LOOPBACK_BACKEND_PORT');
    expect(source).toContain('configureBackendEndpointRuntime');
    expect(source).not.toContain(hostSkinSymbol);
    expect(source).toContain('normalizeEndpointDefaults');
    expect(source).toContain('resolveConfiguredDefaultEndpoints');
    expect(source).not.toContain('DEFAULT_HOSTED_BACKEND');
    expect(source).not.toContain('normalizeHostedBackendConfig');
    expect(source).not.toContain('resolveHostedDefaultEndpoints');
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
    expect(source).not.toContain(hostedDefaultHttpEnv);
    expect(source).not.toContain(hostedDefaultWsEnv);
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

  test('uses configured hosted-default override pair', () => {
    const env = {
      SAMPLE_DEFAULT_BACKEND_HTTP_URL: 'https://staging.example.test/',
      SAMPLE_DEFAULT_BACKEND_WS_URL: 'wss://staging.example.test/ws',
    };

    expect(resolveBackendEndpoints(env)).toEqual({
      httpUrl: 'https://staging.example.test',
      wsUrl: 'wss://staging.example.test/ws',
      wsOrigin: 'https://staging.example.test',
    });
  });

  test('supports non-default hosted-default override env names from host config', () => {
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

  test('supports generic endpoint defaults without hosted naming', () => {
    const env = {
      AGENT_DEFAULT_BACKEND_HTTP_URL: 'https://agent-default.example.com/',
    };
    const endpointDefaults = {
      httpUrl: 'https://fallback.example.com',
      wsUrl: 'wss://fallback.example.com/ws',
      env: {
        defaultHttpUrl: 'AGENT_DEFAULT_BACKEND_HTTP_URL',
        defaultWsUrl: 'AGENT_DEFAULT_BACKEND_WS_URL',
      },
    };

    expect(resolveBackendEndpoints(env, { endpointDefaults })).toEqual({
      httpUrl: 'https://agent-default.example.com',
      wsUrl: 'wss://agent-default.example.com/ws',
      wsOrigin: 'https://agent-default.example.com',
    });
  });

  test('ignores removed packaged hosted-default override names', () => {
    const candidates = resolveBackendEndpointCandidates({
      [retiredPackagedHttpEnv]: 'https://packaged.example.com',
      [retiredPackagedWsEnv]: 'wss://packaged.example.com/ws',
    });

    expect(candidates).toEqual([
      {
        httpUrl: 'https://hosted.example.test',
        wsUrl: 'wss://hosted.example.test/ws',
        wsOrigin: 'https://hosted.example.test',
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
      expect(content).not.toContain(retiredPackagedHttpEnv);
      expect(content).not.toContain(retiredPackagedWsEnv);
    }
  });

  test('falls back to hosted defaults when local host or port override is invalid', () => {
    const env = {
      BACKEND_PORT: 'not-a-port',
    };

    expect(resolveBackendEndpointCandidates(env)).toEqual([
      {
        httpUrl: 'https://hosted.example.test',
        wsUrl: 'wss://hosted.example.test/ws',
        wsOrigin: 'https://hosted.example.test',
      },
    ]);
    expect(resolveBackendEndpoints(env)).toEqual({
      httpUrl: 'https://hosted.example.test',
      wsUrl: 'wss://hosted.example.test/ws',
      wsOrigin: 'https://hosted.example.test',
    });
  });
});
