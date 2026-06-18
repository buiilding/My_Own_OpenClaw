/** @jest-environment node */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  appendLayerLogLine,
  appendLayerLogSessionBanner,
  appendRendererVerboseLogLine,
  appendRendererVerboseLogSessionBanner,
  configureLayerLogSink,
  getLayerLogDirectory,
  installConsoleLayerLog,
  resolveLayerLogEnvKey,
  resolveLayerLogFile,
  resolveLogEnvConfig,
  resolveRendererVerboseLogEnvKey,
  resolveRendererVerboseLogFile,
} = require('../../frontend/src/main/logging/layer_log_sink.cjs');
const {
  mainHostSkin,
} = require('../../frontend/src/main/app/main_host_skin.cjs');

const retiredDesktopAgentMarker = (suffix) => `__desktop${'Agent'}${suffix}`;

describe('layer_log_sink', () => {
  beforeEach(() => {
    configureLayerLogSink();
  });

  test('uses desktop-runtime private console guard markers', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../frontend/src/main/logging/layer_log_sink.cjs'),
      'utf8',
    );

    expect(source).toContain('__desktopRuntimeConsoleStreamErrorGuardInstalled');
    expect(source).toContain('__desktopRuntimeLayerLogInstalled');
    expect(source).toContain('__desktopRuntimeLayerLogOriginals');
    expect(source).not.toContain(retiredDesktopAgentMarker('ConsoleStreamErrorGuardInstalled'));
    expect(source).not.toContain(retiredDesktopAgentMarker('LayerLogInstalled'));
    expect(source).not.toContain(retiredDesktopAgentMarker('LayerLogOriginals'));
  });

  test('resolves layer log files and environment overrides', () => {
    const repoRoot = path.resolve(__dirname, '../..');

    expect(resolveLayerLogFile('main', {})).toBe(
      path.join(repoRoot, '.desktop-runtime', 'logs', 'main.log'),
    );
    expect(resolveRendererVerboseLogFile({})).toBe(
      path.join(repoRoot, '.desktop-runtime', 'logs', 'renderer.verbose.log'),
    );
    expect(resolveLayerLogFile('renderer', { AGENT_RENDERER_LOG_FILE: '/tmp/renderer.log' }))
      .toBe('/tmp/renderer.log');
    expect(resolveLayerLogFile('vite', { AGENT_VITE_LOG_FILE: 'logs/vite.log' }))
      .toBe(path.join(repoRoot, 'logs', 'vite.log'));
    expect(resolveLayerLogFile('sidecar', { AGENT_SIDECAR_LOG_FILE: '0' })).toBeNull();
    expect(resolveLayerLogEnvKey('main')).toBe('AGENT_MAIN_LOG_FILE');
    expect(resolveRendererVerboseLogEnvKey()).toBe('AGENT_RENDERER_VERBOSE_LOG_FILE');
    expect(resolveLogEnvConfig()).toEqual({
      layerLogFilePrefix: 'AGENT',
      rendererVerboseLogFile: 'AGENT_RENDERER_VERBOSE_LOG_FILE',
    });
  });

  test('accepts host-provided log directory config', () => {
    const repoRoot = path.resolve(__dirname, '../..');

    expect(configureLayerLogSink({ logDirSegments: ['.windie', 'logs'] }))
      .toBe(path.join(repoRoot, '.windie', 'logs'));
    expect(getLayerLogDirectory()).toBe(path.join(repoRoot, '.windie', 'logs'));
    expect(resolveLayerLogFile('main', {})).toBe(
      path.join(repoRoot, '.windie', 'logs', 'main.log'),
    );
    expect(resolveRendererVerboseLogFile({})).toBe(
      path.join(repoRoot, '.windie', 'logs', 'renderer.verbose.log'),
    );
  });

  test('accepts host-provided log env config', () => {
    configureLayerLogSink(mainHostSkin.logging);

    expect(resolveLayerLogEnvKey('main')).toBe('WINDIE_MAIN_LOG_FILE');
    expect(resolveRendererVerboseLogEnvKey()).toBe('WINDIE_RENDERER_VERBOSE_LOG_FILE');
    expect(resolveLayerLogFile('renderer', { WINDIE_RENDERER_LOG_FILE: '/tmp/renderer.log' }))
      .toBe('/tmp/renderer.log');
    expect(resolveRendererVerboseLogFile({ WINDIE_RENDERER_VERBOSE_LOG_FILE: '0' }))
      .toBeNull();
  });

  test('generic log sink source does not hardcode WindieOS log env names', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../frontend/src/main/logging/layer_log_sink.cjs'),
      'utf8',
    );

    expect(source).toContain('AGENT_RENDERER_VERBOSE_LOG_FILE');
    expect(source).not.toContain('WINDIE_RENDERER_VERBOSE_LOG_FILE');
    expect(source).not.toContain('WINDIE_');
  });

  test('appends layer-owned lines', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windie-layer-log-'));
    const logFile = path.join(tempDir, 'main.log');

    appendLayerLogLine('main', 'plain main message', {
      env: { AGENT_MAIN_LOG_FILE: logFile },
    });

    expect(fs.readFileSync(logFile, 'utf8')).toContain('[Main] plain main message\n');
  });

  test('appends layer session banners', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windie-layer-banner-'));
    const logFile = path.join(tempDir, 'vite.log');

    expect(appendLayerLogSessionBanner('vite', {
      env: { AGENT_VITE_LOG_FILE: logFile },
      now: () => new Date('2026-06-14T00:00:00.000Z'),
      sessionLabel: 'frontend child process log session',
      logPrefix: '[WindieOS]',
    })).toBe(true);

    expect(fs.readFileSync(logFile, 'utf8')).toContain(
      '[WindieOS] frontend child process log session 2026-06-14T00:00:00.000Z',
    );
  });

  test('uses desktop-runtime default layer session prefix', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windie-layer-default-prefix-'));
    const logFile = path.join(tempDir, 'main.log');

    expect(appendLayerLogSessionBanner('main', {
      env: { AGENT_MAIN_LOG_FILE: logFile },
      now: () => new Date('2026-06-14T00:00:00.000Z'),
    })).toBe(true);

    expect(fs.readFileSync(logFile, 'utf8')).toContain(
      '[Desktop Runtime] main log session 2026-06-14T00:00:00.000Z',
    );
  });

  test('appends renderer verbose log lines and banners', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windie-renderer-verbose-log-'));
    const logFile = path.join(tempDir, 'renderer.verbose.log');
    const env = { AGENT_RENDERER_VERBOSE_LOG_FILE: logFile };

    expect(appendRendererVerboseLogSessionBanner({
      env,
      now: () => new Date('2026-06-14T00:00:00.000Z'),
      sessionLabel: 'main renderer verbose console log session',
      logPrefix: '[WindieOS]',
    })).toBe(true);
    expect(appendRendererVerboseLogLine('[Renderer][main][console:0] [vite] connected.', { env }))
      .toBe(true);

    const log = fs.readFileSync(logFile, 'utf8');
    expect(log).toContain('[WindieOS] main renderer verbose console log session 2026-06-14T00:00:00.000Z');
    expect(log).toContain('[Renderer][main][console:0] [vite] connected.');
  });

  test('skips renderer verbose log lines when disabled', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windie-renderer-verbose-disabled-'));
    const logFile = path.join(tempDir, 'renderer.verbose.log');

    expect(appendRendererVerboseLogLine('hidden', {
      env: {
        AGENT_RENDERER_VERBOSE_LOG_FILE: '0',
        AGENT_RENDERER_LOG_FILE: logFile,
      },
    })).toBe(false);
    expect(fs.existsSync(logFile)).toBe(false);
  });

  test('installs console logging without changing console output behavior', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windie-console-layer-log-'));
    const logFile = path.join(tempDir, 'main.log');
    const originalLog = jest.fn();
    const consoleObject = { log: originalLog };

    expect(installConsoleLayerLog({
      consoleObject,
      env: { AGENT_MAIN_LOG_FILE: logFile },
      methods: ['log'],
    })).toBe(true);

    consoleObject.log('hello', { ok: true });

    expect(originalLog).toHaveBeenCalledWith('hello', { ok: true });
    expect(fs.readFileSync(logFile, 'utf8')).toContain('[Main] hello { ok: true }');
  });

  test('ignores closed stdout write failures from wrapped console output', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windie-console-epipe-log-'));
    const logFile = path.join(tempDir, 'main.log');
    const epipeError = new Error('write EPIPE');
    epipeError.code = 'EPIPE';
    const consoleObject = {
      log: jest.fn(() => {
        throw epipeError;
      }),
    };

    installConsoleLayerLog({
      consoleObject,
      env: { AGENT_MAIN_LOG_FILE: logFile },
      methods: ['log'],
    });

    expect(() => consoleObject.log('during shutdown')).not.toThrow();
    expect(fs.readFileSync(logFile, 'utf8')).toContain('[Main] during shutdown');
  });

  test('rethrows unexpected wrapped console output failures', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windie-console-unexpected-log-'));
    const logFile = path.join(tempDir, 'main.log');
    const consoleObject = {
      log: jest.fn(() => {
        throw new TypeError('unexpected console failure');
      }),
    };

    installConsoleLayerLog({
      consoleObject,
      env: { AGENT_MAIN_LOG_FILE: logFile },
      methods: ['log'],
    });

    expect(() => consoleObject.log('still logged')).toThrow('unexpected console failure');
    expect(fs.readFileSync(logFile, 'utf8')).toContain('[Main] still logged');
  });

  test('installs stdout and stderr guards for async closed-pipe errors', () => {
    const handlers = {};
    const stdout = {
      on: jest.fn((event, handler) => {
        handlers.stdout = { event, handler };
      }),
    };
    const stderr = {
      on: jest.fn((event, handler) => {
        handlers.stderr = { event, handler };
      }),
    };
    const epipeError = new Error('write EPIPE');
    epipeError.code = 'EPIPE';

    expect(installConsoleLayerLog({
      consoleObject: { log: jest.fn() },
      env: { AGENT_MAIN_LOG_FILE: '0' },
      methods: ['log'],
      processObject: { stdout, stderr },
    })).toBe(true);

    expect(handlers.stdout.event).toBe('error');
    expect(handlers.stderr.event).toBe('error');
    expect(() => handlers.stdout.handler(epipeError)).not.toThrow();
    expect(() => handlers.stderr.handler(epipeError)).not.toThrow();
  });

  test('stream error guards still rethrow unexpected stream errors', () => {
    const handlers = {};
    const stdout = {
      on: jest.fn((event, handler) => {
        handlers.stdout = { event, handler };
      }),
    };

    installConsoleLayerLog({
      consoleObject: { log: jest.fn() },
      env: { AGENT_MAIN_LOG_FILE: '0' },
      methods: ['log'],
      processObject: { stdout, stderr: null },
    });

    expect(() => handlers.stdout.handler(new Error('unexpected stream failure')))
      .toThrow('unexpected stream failure');
  });
});
