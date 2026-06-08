const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '../..');
const cliPath = path.join(repoRoot, 'scripts/windie-cli.cjs');
const {
  buildFrontendLogTailArgs,
  getSpawnPlan,
  resolveFrontendLogFile,
} = require('../../scripts/windie/commands.cjs');
const frontendDevUrl = process.env.WINDIE_FRONTEND_DEV_URL || 'http://localhost:5173/';

function runCli(args, env = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

describe('windie CLI', () => {
  test('prints grouped help', () => {
    const result = runCli(['--help']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('windie status --all --json');
    expect(result.stdout).toContain('windie start frontend');
    expect(result.stdout).toContain('windie start dev');
    expect(result.stdout).toContain('windie start customer');
    expect(result.stdout).toContain('windie start all');
    expect(result.stdout).toContain('windie logs frontend');
    expect(result.stdout).toContain('windie docs list');
    expect(result.stdout).toContain('windie docs search <query>');
  });

  test('returns machine-readable status', () => {
    const result = runCli(['status', '--json']);

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.detail.repoRoot).toBe(repoRoot);
    expect(parsed.checks.map((check) => check.name)).toContain('repo root');
    expect(parsed.detail.endpoint.httpUrl).toBeTruthy();
  });

  test('routes lifecycle commands to existing scripts', () => {
    expect(getSpawnPlan(['start', 'backend'])).toMatchObject({
      command: path.join(repoRoot, 'scripts/run-backend'),
      args: [],
      cwd: repoRoot,
    });
    expect(getSpawnPlan(['start', 'frontend'])).toMatchObject({
      command: path.join(repoRoot, 'scripts/run-frontend-dev'),
      args: [],
      cwd: repoRoot,
    });
    expect(getSpawnPlan(['start', 'desktop'])).toMatchObject({
      command: path.join(repoRoot, 'scripts/run-frontend-electron'),
      args: [],
      cwd: repoRoot,
    });
    expect(getSpawnPlan(['start', 'dev'])).toMatchObject({
      concurrent: [
        { label: 'frontend', command: path.join(repoRoot, 'scripts/run-frontend-dev'), cwd: repoRoot },
        {
          label: 'desktop',
          command: path.join(repoRoot, 'scripts/run-frontend-electron'),
          cwd: repoRoot,
          waitFor: { type: 'http', url: frontendDevUrl, timeoutMs: 30000 },
        },
      ],
    });
    expect(getSpawnPlan(['start', 'customer'])).toMatchObject({
      concurrent: [
        { label: 'frontend', command: path.join(repoRoot, 'scripts/run-frontend-dev'), cwd: repoRoot },
        {
          label: 'customer',
          command: 'npm',
          args: ['--prefix', path.join(repoRoot, 'frontend'), 'run', 'electron'],
          cwd: repoRoot,
          waitFor: { type: 'http', url: frontendDevUrl, timeoutMs: 30000 },
        },
      ],
    });
  });

  test('routes test commands without requiring callers to cd frontend', () => {
    expect(getSpawnPlan(['test', 'backend', '--', 'tests/backend/test_websocket_route.py', '-q']))
      .toMatchObject({
        command: path.join(repoRoot, 'scripts/test-backend'),
        args: ['tests/backend/test_websocket_route.py', '-q'],
        cwd: repoRoot,
      });
    expect(getSpawnPlan(['test', 'sidecar', '--', 'tests/sidecar/test_tool_registry.py', '-q']))
      .toMatchObject({
        command: path.join(repoRoot, 'scripts/test-sidecar'),
        args: ['tests/sidecar/test_tool_registry.py', '-q'],
        cwd: repoRoot,
      });
    expect(getSpawnPlan(['test', 'frontend', '--', 'WindieCli'])).toMatchObject({
      command: 'npm',
      args: ['--prefix', path.join(repoRoot, 'frontend'), 'run', 'test:ci', '--', 'WindieCli'],
      cwd: repoRoot,
    });
  });

  test('resolves frontend log tail arguments', () => {
    const defaultLog = path.join(repoRoot, '.windie', 'logs', 'frontend.log');
    expect(resolveFrontendLogFile({})).toBe(defaultLog);
    expect(resolveFrontendLogFile({ WINDIE_FRONTEND_LOG_FILE: '/tmp/frontend.log' }))
      .toBe('/tmp/frontend.log');
    expect(resolveFrontendLogFile({ WINDIE_FRONTEND_LOG_FILE: 'logs/frontend.log' }))
      .toBe(path.join(repoRoot, 'logs', 'frontend.log'));
    expect(resolveFrontendLogFile({ WINDIE_FRONTEND_LOG_FILE: '0' })).toBeNull();

    expect(buildFrontendLogTailArgs(['--tail', '50'], {})).toEqual({
      logFile: defaultLog,
      tailArgs: ['-n', '50', '-F', defaultLog],
    });
    expect(buildFrontendLogTailArgs(['--tail', '10', '--no-follow'], {})).toEqual({
      logFile: defaultLog,
      tailArgs: ['-n', '10', defaultLog],
    });
    expect(() => buildFrontendLogTailArgs(['--tail', 'nope'], {}))
      .toThrow('--tail must be a positive integer.');
  });

  test('prints current frontend logs without following', () => {
    const testLogFile = path.join(repoRoot, '.windie', 'logs', `windie-cli-test-${process.pid}.log`);
    fs.rmSync(testLogFile, { force: true });

    const result = runCli(
      ['logs', 'frontend', '--no-follow', '--tail', '3'],
      { WINDIE_FRONTEND_LOG_FILE: testLogFile },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[WindieOS] frontend log');
  });

  test('finds docs outside the canonical navigation map', () => {
    const result = runCli(['docs', 'open', 'test selection']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('docs/debug/test_selection.md');
  });

  test('searches docs with explicit and shorthand docs query forms', () => {
    const explicit = runCli(['docs', 'search', 'Desktop Assistant Documentation']);
    const shorthand = runCli(['docs', 'Desktop Assistant Documentation']);

    expect(explicit.status).toBe(0);
    expect(explicit.stdout).toContain('docs/README.md');
    expect(shorthand.status).toBe(0);
    expect(shorthand.stdout).toContain('docs/README.md');
  });
});
