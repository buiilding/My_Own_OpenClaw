/** @jest-environment node */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  appendLayerLogLine,
  appendLayerLogSessionBanner,
  appendRendererVerboseLogLine,
  appendRendererVerboseLogSessionBanner,
  attachLineStream,
  ensureLogFile,
  installConsoleLayerLog,
  resolveLayerLogFile,
  resolveRendererVerboseLogFile,
} = require('../../frontend/src/main/logging/layer_log_sink.cjs');

describe('layer_log_sink', () => {
  test('resolves layer log files and environment overrides', () => {
    const repoRoot = path.resolve(__dirname, '../..');

    expect(resolveLayerLogFile('main', {})).toBe(path.join(repoRoot, '.windie', 'logs', 'main.log'));
    expect(resolveLayerLogFile('renderer', { WINDIE_RENDERER_LOG_FILE: '/tmp/renderer.log' }))
      .toBe('/tmp/renderer.log');
    expect(resolveLayerLogFile('vite', { WINDIE_VITE_LOG_FILE: 'logs/vite.log' }))
      .toBe(path.join(repoRoot, 'logs', 'vite.log'));
    expect(resolveLayerLogFile('sidecar', { WINDIE_SIDECAR_LOG_FILE: '0' })).toBeNull();
    expect(resolveRendererVerboseLogFile({})).toBe(path.join(repoRoot, '.windie', 'logs', 'renderer.verbose.log'));
    expect(resolveRendererVerboseLogFile({ WINDIE_RENDERER_VERBOSE_LOG_FILE: '/tmp/renderer.verbose.log' }))
      .toBe('/tmp/renderer.verbose.log');
    expect(resolveRendererVerboseLogFile({ WINDIE_RENDERER_VERBOSE_LOG_FILE: '0' })).toBeNull();
  });

  test('ensures and appends layer-owned lines', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windie-layer-log-'));
    const logFile = path.join(tempDir, 'main.log');

    ensureLogFile(logFile, {
      initialLines: ['initial', ''],
    });
    appendLayerLogLine('main', 'plain main message', {
      env: { WINDIE_MAIN_LOG_FILE: logFile },
    });

    expect(fs.readFileSync(logFile, 'utf8')).toContain('initial\n[Main] plain main message\n');
  });

  test('appends layer session banners', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windie-layer-banner-'));
    const logFile = path.join(tempDir, 'vite.log');

    expect(appendLayerLogSessionBanner('vite', {
      env: { WINDIE_VITE_LOG_FILE: logFile },
      now: () => new Date('2026-06-14T00:00:00.000Z'),
      sessionLabel: 'frontend child process log session',
    })).toBe(true);

    expect(fs.readFileSync(logFile, 'utf8')).toContain(
      '[WindieOS] frontend child process log session 2026-06-14T00:00:00.000Z',
    );
  });

  test('appends renderer verbose log lines and banners', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windie-renderer-verbose-log-'));
    const logFile = path.join(tempDir, 'renderer.verbose.log');
    const env = { WINDIE_RENDERER_VERBOSE_LOG_FILE: logFile };

    expect(appendRendererVerboseLogSessionBanner({
      env,
      now: () => new Date('2026-06-14T00:00:00.000Z'),
      sessionLabel: 'main renderer verbose console log session',
    })).toBe(true);
    expect(appendRendererVerboseLogLine('[Renderer][main][console:0] [vite] connected.', { env }))
      .toBe(true);

    const log = fs.readFileSync(logFile, 'utf8');
    expect(log).toContain('[WindieOS] main renderer verbose console log session 2026-06-14T00:00:00.000Z');
    expect(log).toContain('[Renderer][main][console:0] [vite] connected.');
  });

  test('line-buffers stream chunks', () => {
    const handlers = {};
    const stream = {
      setEncoding: jest.fn(),
      on: jest.fn((event, handler) => {
        handlers[event] = handler;
      }),
    };
    const lines = [];

    attachLineStream(stream, {
      onLine: (line) => lines.push(line),
    });

    handlers.data('one\nt');
    handlers.data('wo\nthree');
    handlers.end();

    expect(lines).toEqual(['one', 'two', 'three']);
  });

  test('installs console logging without changing console output behavior', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windie-console-layer-log-'));
    const logFile = path.join(tempDir, 'main.log');
    const originalLog = jest.fn();
    const consoleObject = { log: originalLog };

    expect(installConsoleLayerLog({
      consoleObject,
      env: { WINDIE_MAIN_LOG_FILE: logFile },
      methods: ['log'],
    })).toBe(true);

    consoleObject.log('hello', { ok: true });

    expect(originalLog).toHaveBeenCalledWith('hello', { ok: true });
    expect(fs.readFileSync(logFile, 'utf8')).toContain('[Main] hello { ok: true }');
  });
});
