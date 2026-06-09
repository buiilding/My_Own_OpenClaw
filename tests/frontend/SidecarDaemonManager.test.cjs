/** @jest-environment node */

const EventEmitter = require('events');
const fs = require('fs');
const fsPromises = require('fs/promises');
const os = require('os');
const path = require('path');

function loadManager() {
  jest.resetModules();
  jest.doMock('../../frontend/src/main/app/runtime_paths.cjs', () => ({
    resolveSidecarLaunchTarget: jest.fn(() => ({
      kind: 'python',
      command: 'python3',
      args: ['src/main/python/sidecar_daemon.py'],
      cwd: process.cwd(),
      resolvedPath: 'src/main/python/sidecar_daemon.py',
      runtimeRoot: null,
    })),
  }));
  return require('../../frontend/src/main/sidecar/sidecar_daemon_manager.cjs');
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

class FakeWebSocket extends EventEmitter {
  constructor(url, options) {
    super();
    this.url = url;
    this.options = options;
    this.close = jest.fn(() => {
      this.emit('close');
    });
    FakeWebSocket.instances.push(this);
  }
}

FakeWebSocket.instances = [];

const TEST_DAEMON_LAUNCH = {
  WINDIE_BACKEND_HTTP_URL: 'https://backend.example',
  WINDIE_BACKEND_AUTH_STATE_PATH: '/tmp/windie-install-auth.json',
  WINDIE_ENABLE_SEMANTIC_SUMMARIZER: '',
  WINDIE_PACKAGED_APP: '0',
  WINDIE_ENABLE_BROWSER_FEATURE_PACK_AUTOINSTALL: '1',
};

const TEST_DAEMON_LAUNCH_OPTIONS = {
  isPackaged: false,
  backendEndpoints: {
    httpUrl: TEST_DAEMON_LAUNCH.WINDIE_BACKEND_HTTP_URL,
  },
  authStatePath: TEST_DAEMON_LAUNCH.WINDIE_BACKEND_AUTH_STATE_PATH,
};

describe('sidecar daemon manager', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
  });

  test('reuses an existing healthy daemon from discovery metadata', async () => {
    const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'windie-daemon-'));
    const discoveryPath = path.join(tempDir, 'sidecar-daemon.json');
    await fsPromises.writeFile(
      discoveryPath,
      JSON.stringify({
        pid: 123,
        base_url: 'http://127.0.0.1:4567',
        token: 'token-123',
        launch: TEST_DAEMON_LAUNCH,
      }),
      'utf8',
    );
    const fetchImpl = jest.fn(async () => jsonResponse({ status: 'ok' }));
    const spawnImpl = jest.fn();
    const {
      createSidecarDaemonManager,
      readDiscoveryFile,
    } = loadManager();

    const manager = createSidecarDaemonManager({
      discoveryPath,
      fetchImpl,
      spawnImpl,
      startTimeoutMs: 50,
    });
    const client = await manager.ensureDaemon(TEST_DAEMON_LAUNCH_OPTIONS);

    expect(client).toBeDefined();
    expect(spawnImpl).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:4567/health',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-windie-sidecar-token': 'token-123',
        }),
      }),
    );
    expect(readDiscoveryFile(discoveryPath)).toMatchObject({
      baseUrl: 'http://127.0.0.1:4567',
      token: 'token-123',
    });
  });

  test('replaces healthy daemon discovery with stale launch metadata', async () => {
    const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'windie-daemon-'));
    const discoveryPath = path.join(tempDir, 'sidecar-daemon.json');
    await fsPromises.writeFile(
      discoveryPath,
      JSON.stringify({
        pid: 123,
        base_url: 'http://127.0.0.1:4567',
        token: 'token-old',
        launch: {
          ...TEST_DAEMON_LAUNCH,
          WINDIE_BACKEND_AUTH_STATE_PATH: '',
        },
      }),
      'utf8',
    );
    const fetchImpl = jest.fn(async (url) => {
      if (url === 'http://127.0.0.1:4567/shutdown') {
        return jsonResponse({ success: true });
      }
      if (url === 'http://127.0.0.1:7654/health') {
        return jsonResponse({ status: 'ok' });
      }
      throw new Error(`unexpected request: ${url}`);
    });
    const proc = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = jest.fn();
    proc.pid = 456;
    const spawnImpl = jest.fn(() => {
      setTimeout(() => {
        fs.writeFileSync(
          discoveryPath,
          JSON.stringify({
            pid: 456,
            base_url: 'http://127.0.0.1:7654',
            token: 'token-new',
            launch: TEST_DAEMON_LAUNCH,
          }),
          'utf8',
        );
      }, 0);
      return proc;
    });
    const {
      createSidecarDaemonManager,
    } = loadManager();

    const manager = createSidecarDaemonManager({
      discoveryPath,
      fetchImpl,
      spawnImpl,
      startTimeoutMs: 1000,
      pollIntervalMs: 5,
    });

    await expect(manager.ensureDaemon(TEST_DAEMON_LAUNCH_OPTIONS)).resolves.toBeDefined();
    expect(spawnImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:4567/shutdown',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchImpl).not.toHaveBeenCalledWith(
      'http://127.0.0.1:4567/health',
      expect.anything(),
    );
  });

  test('rejects discovery metadata that points outside loopback origins', async () => {
    const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'windie-daemon-'));
    const discoveryPath = path.join(tempDir, 'sidecar-daemon.json');
    const {
      readDiscoveryFile,
    } = loadManager();

    for (const baseUrl of [
      'http://example.com:4567',
      'https://192.168.1.10:4567',
      'file:///tmp/sidecar.sock',
      'http://127.0.0.1:4567/prefix',
      'http://token@127.0.0.1:4567',
    ]) {
      await fsPromises.writeFile(
        discoveryPath,
        JSON.stringify({
          pid: 123,
          base_url: baseUrl,
          token: 'token-123',
        }),
        'utf8',
      );

      expect(readDiscoveryFile(discoveryPath)).toBeNull();
    }
  });

  test('deletes invalid discovery metadata without probing its base url', async () => {
    const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'windie-daemon-'));
    const discoveryPath = path.join(tempDir, 'sidecar-daemon.json');
    await fsPromises.writeFile(
      discoveryPath,
      JSON.stringify({
        pid: 123,
        base_url: 'http://example.com:4567',
        token: 'token-old',
      }),
      'utf8',
    );
    const fetchImpl = jest.fn(async (url) => {
      if (url === 'http://127.0.0.1:7654/health') {
        return jsonResponse({ status: 'ok' });
      }
      throw new Error(`unexpected probe: ${url}`);
    });
    const proc = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = jest.fn();
    proc.pid = 456;
    const spawnImpl = jest.fn(() => {
      expect(fs.existsSync(discoveryPath)).toBe(false);
      setTimeout(() => {
        fs.writeFileSync(
          discoveryPath,
          JSON.stringify({
            pid: 456,
            base_url: 'http://127.0.0.1:7654',
            token: 'token-new',
            launch: TEST_DAEMON_LAUNCH,
          }),
          'utf8',
        );
      }, 0);
      return proc;
    });
    const {
      createSidecarDaemonManager,
    } = loadManager();

    const manager = createSidecarDaemonManager({
      discoveryPath,
      fetchImpl,
      spawnImpl,
      startTimeoutMs: 1000,
      pollIntervalMs: 5,
    });

    await expect(manager.ensureDaemon(TEST_DAEMON_LAUNCH_OPTIONS)).resolves.toBeDefined();
    expect(spawnImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).not.toHaveBeenCalledWith(
      'http://example.com:4567/health',
      expect.anything(),
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:7654/health',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-windie-sidecar-token': 'token-new',
        }),
      }),
    );
  });

  test('accepts loopback discovery origins', async () => {
    const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'windie-daemon-'));
    const discoveryPath = path.join(tempDir, 'sidecar-daemon.json');
    const {
      readDiscoveryFile,
    } = loadManager();

    for (const [baseUrl, expectedBaseUrl] of [
      ['http://localhost:4567/', 'http://localhost:4567'],
      ['http://127.9.8.7:4567', 'http://127.9.8.7:4567'],
      ['http://[::1]:4567', 'http://[::1]:4567'],
    ]) {
      await fsPromises.writeFile(
        discoveryPath,
        JSON.stringify({
          pid: 123,
          base_url: baseUrl,
          token: 'token-123',
        }),
        'utf8',
      );

      expect(readDiscoveryFile(discoveryPath)).toMatchObject({
        baseUrl: expectedBaseUrl,
        token: 'token-123',
      });
    }
  });

  test('spawns daemon and waits for discovery when no reusable daemon exists', async () => {
    const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'windie-daemon-'));
    const discoveryPath = path.join(tempDir, 'sidecar-daemon.json');
    const fetchImpl = jest.fn(async () => jsonResponse({ status: 'ok' }));
    const proc = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = jest.fn();
    proc.pid = 456;
    const spawnImpl = jest.fn(() => {
      setTimeout(() => {
        fs.writeFileSync(
          discoveryPath,
          JSON.stringify({
            pid: 456,
            base_url: 'http://127.0.0.1:7654',
            token: 'token-456',
            launch: TEST_DAEMON_LAUNCH,
          }),
          'utf8',
        );
      }, 0);
      return proc;
    });
    const {
      createSidecarDaemonManager,
    } = loadManager();

    const manager = createSidecarDaemonManager({
      discoveryPath,
      fetchImpl,
      spawnImpl,
      startTimeoutMs: 1000,
      pollIntervalMs: 5,
    });
    const client = await manager.ensureDaemon(TEST_DAEMON_LAUNCH_OPTIONS);

    expect(client).toBeDefined();
    expect(spawnImpl).toHaveBeenCalledTimes(1);
    expect(spawnImpl.mock.calls[0][1]).toEqual(expect.arrayContaining([
      '--discovery-file',
      discoveryPath,
    ]));
    expect(manager.getSnapshot()).toMatchObject({
      hasClient: true,
      pid: 456,
    });
  });

  test('deletes stale discovery metadata before spawning a replacement daemon', async () => {
    const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'windie-daemon-'));
    const discoveryPath = path.join(tempDir, 'sidecar-daemon.json');
    await fsPromises.writeFile(
      discoveryPath,
      JSON.stringify({
        pid: 123,
        base_url: 'http://127.0.0.1:4567',
        token: 'token-old',
        launch: TEST_DAEMON_LAUNCH,
      }),
      'utf8',
    );
    const fetchImpl = jest.fn(async (url) => {
      if (url === 'http://127.0.0.1:4567/health') {
        throw new Error('connect ECONNREFUSED 127.0.0.1:4567');
      }
      return jsonResponse({ status: 'ok' });
    });
    const proc = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = jest.fn();
    proc.pid = 456;
    const spawnImpl = jest.fn(() => {
      expect(fs.existsSync(discoveryPath)).toBe(false);
      setTimeout(() => {
        fs.writeFileSync(
          discoveryPath,
          JSON.stringify({
            pid: 456,
            base_url: 'http://127.0.0.1:7654',
            token: 'token-new',
            launch: TEST_DAEMON_LAUNCH,
          }),
          'utf8',
        );
      }, 0);
      return proc;
    });
    const {
      createSidecarDaemonManager,
    } = loadManager();

    const manager = createSidecarDaemonManager({
      discoveryPath,
      fetchImpl,
      spawnImpl,
      startTimeoutMs: 1000,
      pollIntervalMs: 5,
    });

    await expect(manager.ensureDaemon(TEST_DAEMON_LAUNCH_OPTIONS)).resolves.toBeDefined();
    expect(spawnImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:4567/health',
      expect.any(Object),
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:7654/health',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-windie-sidecar-token': 'token-new',
        }),
      }),
    );
  });

  test('rpc posts json-rpc requests through healthy daemon client', async () => {
    const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'windie-daemon-'));
    const discoveryPath = path.join(tempDir, 'sidecar-daemon.json');
    await fsPromises.writeFile(
      discoveryPath,
      JSON.stringify({
        pid: 123,
        base_url: 'http://127.0.0.1:4567',
        token: 'token-123',
        launch: TEST_DAEMON_LAUNCH,
      }),
      'utf8',
    );
    const fetchImpl = jest.fn(async (url) => {
      if (url.endsWith('/health')) {
        return jsonResponse({ status: 'ok' });
      }
      return jsonResponse({ jsonrpc: '2.0', id: 'rpc-1', result: { status: 'ok' } });
    });
    const {
      createSidecarDaemonManager,
    } = loadManager();

    const manager = createSidecarDaemonManager({
      discoveryPath,
      fetchImpl,
      spawnImpl: jest.fn(),
      startTimeoutMs: 50,
    });
    await expect(manager.rpc({
      id: 'rpc-1',
      method: 'ping',
      params: {},
    }, TEST_DAEMON_LAUNCH_OPTIONS)).resolves.toEqual({
      jsonrpc: '2.0',
      id: 'rpc-1',
      result: { status: 'ok' },
    });

    expect(fetchImpl).toHaveBeenLastCalledWith(
      'http://127.0.0.1:4567/rpc',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'rpc-1',
          method: 'ping',
          params: {},
        }),
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'x-windie-sidecar-token': 'token-123',
        }),
      }),
    );
  });

  test('forwards sidecar daemon websocket events to the event callback', async () => {
    const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'windie-daemon-'));
    const discoveryPath = path.join(tempDir, 'sidecar-daemon.json');
    await fsPromises.writeFile(
      discoveryPath,
      JSON.stringify({
        pid: 123,
        base_url: 'http://127.0.0.1:4567',
        token: 'token-123',
        launch: TEST_DAEMON_LAUNCH,
      }),
      'utf8',
    );
    const fetchImpl = jest.fn(async () => jsonResponse({ status: 'ok' }));
    const onEvent = jest.fn();
    const {
      createSidecarDaemonManager,
    } = loadManager();

    const manager = createSidecarDaemonManager({
      discoveryPath,
      fetchImpl,
      spawnImpl: jest.fn(),
      startTimeoutMs: 50,
      WebSocketImpl: FakeWebSocket,
    });
    const unsubscribe = manager.subscribeEvents(onEvent);
    await manager.ensureDaemon(TEST_DAEMON_LAUNCH_OPTIONS);

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].url).toBe('ws://127.0.0.1:4567/events');
    expect(FakeWebSocket.instances[0].options).toMatchObject({
      headers: {
        'x-windie-sidecar-token': 'token-123',
      },
    });

    FakeWebSocket.instances[0].emit('message', JSON.stringify({
      type: 'conversation-title-updated',
      payload: { conversation_id: 'conv-1', title: 'Generated Title' },
    }));

    expect(onEvent).toHaveBeenCalledWith({
      type: 'conversation-title-updated',
      payload: { conversation_id: 'conv-1', title: 'Generated Title' },
    });
    unsubscribe();
  });

  test('rediscovers daemon when cached client becomes stale', async () => {
    const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'windie-daemon-'));
    const discoveryPath = path.join(tempDir, 'sidecar-daemon.json');
    await fsPromises.writeFile(
      discoveryPath,
      JSON.stringify({
        pid: 123,
        base_url: 'http://127.0.0.1:4567',
        token: 'token-old',
        launch: TEST_DAEMON_LAUNCH,
      }),
      'utf8',
    );
    let oldHealthCalls = 0;
    const fetchImpl = jest.fn(async (url, init = {}) => {
      const token = init.headers?.['x-windie-sidecar-token'];
      if (url.endsWith('/health') && token === 'token-old') {
        oldHealthCalls += 1;
        return oldHealthCalls === 1
          ? jsonResponse({ status: 'ok' })
          : jsonResponse({ error: 'stale' }, 401);
      }
      if (url.endsWith('/health') && token === 'token-new') {
        return jsonResponse({ status: 'ok' });
      }
      return jsonResponse({ error: 'unauthorized' }, 401);
    });
    const {
      createSidecarDaemonManager,
    } = loadManager();

    const manager = createSidecarDaemonManager({
      discoveryPath,
      fetchImpl,
      spawnImpl: jest.fn(),
      startTimeoutMs: 50,
    });
    await manager.ensureDaemon(TEST_DAEMON_LAUNCH_OPTIONS);
    await fsPromises.writeFile(
      discoveryPath,
      JSON.stringify({
        pid: 456,
        base_url: 'http://127.0.0.1:7654',
        token: 'token-new',
        launch: TEST_DAEMON_LAUNCH,
      }),
      'utf8',
    );

    await expect(manager.ensureDaemon(TEST_DAEMON_LAUNCH_OPTIONS)).resolves.toBeDefined();

    const healthCalls = fetchImpl.mock.calls
      .filter(([url]) => String(url).endsWith('/health'))
      .map(([url, init]) => [url, init?.headers?.['x-windie-sidecar-token']]);
    expect(healthCalls.some(([url, token]) => (
      url === 'http://127.0.0.1:4567/health' && token === 'token-old'
    ))).toBe(true);
    expect(healthCalls.some(([url, token]) => (
      url === 'http://127.0.0.1:7654/health' && token === 'token-new'
    ))).toBe(true);
  });
});
