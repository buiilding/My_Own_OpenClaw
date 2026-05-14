/** @jest-environment node */

const EventEmitter = require('events');
const fs = require('fs');
const fsPromises = require('fs/promises');
const os = require('os');
const path = require('path');

function loadManager() {
  jest.resetModules();
  jest.doMock('../../frontend/src/main/runtime_paths.cjs', () => ({
    resolveSidecarLaunchTarget: jest.fn(() => ({
      kind: 'python',
      command: 'python3',
      args: ['src/main/python/sidecar_daemon.py'],
      cwd: process.cwd(),
      resolvedPath: 'src/main/python/sidecar_daemon.py',
      runtimeRoot: null,
    })),
  }));
  return require('../../frontend/src/main/sidecar_daemon_manager.cjs');
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

describe('sidecar daemon manager', () => {
  test('reuses an existing healthy daemon from discovery metadata', async () => {
    const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'windie-daemon-'));
    const discoveryPath = path.join(tempDir, 'sidecar-daemon.json');
    await fsPromises.writeFile(
      discoveryPath,
      JSON.stringify({
        pid: 123,
        base_url: 'http://127.0.0.1:4567',
        token: 'token-123',
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
    const client = await manager.ensureDaemon();

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
    const client = await manager.ensureDaemon({ isPackaged: false });

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
});
