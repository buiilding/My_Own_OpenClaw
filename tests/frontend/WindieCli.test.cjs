const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '../..');
const cliPath = path.join(repoRoot, 'scripts/windie-cli.cjs');
const { getSpawnPlan } = require('../../scripts/windie/commands.cjs');

function runCli(args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
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
    expect(result.stdout).toContain('windie start all');
    expect(result.stdout).toContain('windie docs list');
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
        { label: 'desktop', command: path.join(repoRoot, 'scripts/run-frontend-electron'), cwd: repoRoot },
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

  test('finds docs outside the canonical navigation map', () => {
    const result = runCli(['docs', 'open', 'test selection']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('docs/debug/test_selection.md');
  });
});
