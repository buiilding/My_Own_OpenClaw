/**
 * Covers windie cli. behavior in the frontend test suite.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '../..');
const cliPath = path.join(repoRoot, 'scripts/windie-cli.cjs');
const {
  buildLayerLogTailArgs,
  buildFrontendLogTailArgs,
  getSpawnPlan,
  normalizeWindieLogTarget,
  resolveFrontendLogFile,
  resolveWindieLogFile,
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
    expect(result.stdout).toContain('windie conversation messages <conversation-ref> [--limit <n>] [--json]');
    expect(result.stdout).toContain('windie start frontend');
    expect(result.stdout).toContain('windie start dev');
    expect(result.stdout).toContain('windie start customer');
    expect(result.stdout).toContain('windie start all');
    expect(result.stdout).toContain('windie logs frontend');
    expect(result.stdout).toContain('windie docs list');
    expect(result.stdout).toContain('windie docs search <query>');
    expect(result.stdout).toContain('windie logs vite');
    expect(result.stdout).toContain('windie logs main');
    expect(result.stdout).toContain('windie logs renderer [--verbose]');
    expect(result.stdout).toContain('windie logs sidecar');
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
      concurrent: [
        { label: 'frontend', command: path.join(repoRoot, 'scripts/run-frontend-dev'), cwd: repoRoot, logLayer: 'vite' },
      ],
    });
    expect(getSpawnPlan(['start', 'desktop'])).toMatchObject({
      command: path.join(repoRoot, 'scripts/run-frontend-electron'),
      args: [],
      cwd: repoRoot,
    });
    expect(getSpawnPlan(['start', 'dev'])).toMatchObject({
      concurrent: [
        { label: 'frontend', command: path.join(repoRoot, 'scripts/run-frontend-dev'), cwd: repoRoot, logLayer: 'vite' },
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
        { label: 'frontend', command: path.join(repoRoot, 'scripts/run-frontend-dev'), cwd: repoRoot, logLayer: 'vite' },
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

  test('resolves layer-owned log tail arguments', () => {
    const logsDir = path.join(repoRoot, '.windie', 'logs');
    expect(normalizeWindieLogTarget('desktop')).toBe('main');
    expect(resolveWindieLogFile('vite', {})).toBe(path.join(logsDir, 'vite.log'));
    expect(resolveWindieLogFile('main', {})).toBe(path.join(logsDir, 'main.log'));
    expect(resolveWindieLogFile('renderer', {})).toBe(path.join(logsDir, 'renderer.log'));
    expect(resolveWindieLogFile('renderer', {}, { verbose: true }))
      .toBe(path.join(logsDir, 'renderer.verbose.log'));
    expect(resolveWindieLogFile('sidecar', {})).toBe(path.join(logsDir, 'sidecar.log'));
    expect(resolveWindieLogFile('desktop', {})).toBe(path.join(logsDir, 'main.log'));
    expect(resolveWindieLogFile('sidecar', { WINDIE_SIDECAR_LOG_FILE: '/tmp/sidecar.log' }))
      .toBe('/tmp/sidecar.log');
    expect(resolveWindieLogFile('sidecar', { WINDIE_SIDECAR_LOG_FILE: 'logs/sidecar.log' }))
      .toBe(path.join(repoRoot, 'logs', 'sidecar.log'));
    expect(resolveWindieLogFile('sidecar', { WINDIE_SIDECAR_LOG_FILE: 'false' })).toBeNull();
    expect(resolveWindieLogFile('renderer', { WINDIE_RENDERER_VERBOSE_LOG_FILE: '/tmp/renderer.verbose.log' }, { verbose: true }))
      .toBe('/tmp/renderer.verbose.log');

    expect(buildLayerLogTailArgs('sidecar', ['--tail', '10', '--no-follow'], {})).toEqual({
      logFile: path.join(logsDir, 'sidecar.log'),
      tailArgs: ['-n', '10', path.join(logsDir, 'sidecar.log')],
    });
    expect(buildLayerLogTailArgs('renderer', ['--verbose', '--tail', '20', '--no-follow'], {})).toEqual({
      logFile: path.join(logsDir, 'renderer.verbose.log'),
      tailArgs: ['-n', '20', path.join(logsDir, 'renderer.verbose.log')],
    });
    expect(buildLayerLogTailArgs('desktop', ['--tail', '5'], {})).toEqual({
      logFile: path.join(logsDir, 'main.log'),
      tailArgs: ['-n', '5', '-F', path.join(logsDir, 'main.log')],
    });
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

  test('prints current sidecar logs without following', () => {
    const testLogFile = path.join(repoRoot, '.windie', 'logs', `windie-sidecar-cli-test-${process.pid}.log`);
    fs.rmSync(testLogFile, { force: true });

    const result = runCli(
      ['logs', 'sidecar', '--no-follow', '--tail', '3'],
      { WINDIE_SIDECAR_LOG_FILE: testLogFile },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[WindieOS] sidecar log');
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

  test('exports display conversation messages from the canonical history database', () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windie-cli-history-'));
    const historyDir = path.join(homeDir, 'Library', 'Application Support', 'windieos', 'history');
    const dbPath = path.join(historyDir, 'history.db');
    fs.mkdirSync(historyDir, { recursive: true });
    const sql = `
      CREATE TABLE conversation_events (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        conversation_id TEXT,
        event_type TEXT NOT NULL,
        role TEXT,
        content TEXT,
        timestamp TEXT NOT NULL,
        message_index INTEGER NOT NULL,
        revision_id TEXT,
        turn_ref TEXT,
        metadata TEXT,
        attachments TEXT,
        event_payload TEXT NOT NULL
      );
      CREATE VIEW conversation_display_messages AS
      SELECT id AS event_id,
             user_id,
             conversation_id,
             message_index,
             timestamp,
             turn_ref,
             revision_id,
             role AS display_role,
             role AS source_role,
             event_type,
             content,
             metadata,
             attachments
      FROM conversation_events
      WHERE event_type IN ('user_message', 'assistant_message', 'turn_error')
        AND content IS NOT NULL
        AND content != '';
      INSERT INTO conversation_events
      (id, user_id, conversation_id, event_type, role, content, timestamp, message_index, revision_id, turn_ref, metadata, attachments, event_payload)
      VALUES
      ('evt-user', 'user-1', 'conv-1', 'user_message', 'user', 'hello', '2026-06-11T12:00:00+00:00', 1, 'rev-1', 'turn-1', '{}', '[]', '{}'),
      ('evt-trace', 'user-1', 'conv-1', 'trace_event', NULL, '[sdk event: trace_event]', '2026-06-11T12:00:01+00:00', 2, 'rev-1', 'turn-1', '{}', '[]', '{}'),
      ('evt-assistant', 'user-1', 'conv-1', 'assistant_message', 'assistant', 'hi', '2026-06-11T12:00:02+00:00', 3, 'rev-1', 'turn-1', '{}', '[]', '{}');
    `;
    const sqlite = spawnSync('sqlite3', [dbPath, sql], { encoding: 'utf8' });
    expect(sqlite.status).toBe(0);

    const result = runCli(['conversation', 'messages', 'conv-1', '--json'], {
      HOME: homeDir,
    });

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.database).toBe(dbPath);
    expect(parsed.messages.map((message) => message.eventId)).toEqual(['evt-user', 'evt-assistant']);
    expect(parsed.messages.map((message) => message.role)).toEqual(['user', 'assistant']);
  });

  test('exports display conversation messages from older history schemas without the view', () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windie-cli-history-legacy-'));
    const historyDir = path.join(homeDir, 'Library', 'Application Support', 'windieos', 'history');
    const dbPath = path.join(historyDir, 'history.db');
    fs.mkdirSync(historyDir, { recursive: true });
    const sql = `
      CREATE TABLE conversation_events (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        conversation_id TEXT,
        event_type TEXT NOT NULL,
        role TEXT,
        content TEXT,
        timestamp TEXT NOT NULL,
        message_index INTEGER NOT NULL,
        revision_id TEXT,
        turn_ref TEXT,
        metadata TEXT,
        event_payload TEXT NOT NULL
      );
      INSERT INTO conversation_events
      (id, user_id, conversation_id, event_type, role, content, timestamp, message_index, revision_id, turn_ref, metadata, event_payload)
      VALUES
      ('evt-user', 'user-1', 'conv-1', 'user_message', 'user', 'hello', '2026-06-11T12:00:00+00:00', 1, 'rev-1', 'turn-1', '{}', '{}'),
      ('evt-tool', 'user-1', 'conv-1', 'tool_output', 'tool', 'ignored', '2026-06-11T12:00:01+00:00', 2, 'rev-1', 'turn-1', '{}', '{}'),
      ('evt-error', 'user-1', 'conv-1', 'turn_error', NULL, 'failed', '2026-06-11T12:00:02+00:00', 3, 'rev-1', 'turn-1', '{}', '{}');
    `;
    const sqlite = spawnSync('sqlite3', [dbPath, sql], { encoding: 'utf8' });
    expect(sqlite.status).toBe(0);

    const result = runCli(['conversation', 'messages', 'conv-1', '--json'], {
      HOME: homeDir,
    });

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.messages.map((message) => message.eventId)).toEqual(['evt-user', 'evt-error']);
    expect(parsed.messages.map((message) => message.role)).toEqual(['user', 'error']);
    expect(parsed.messages.map((message) => message.attachments)).toEqual(['[]', '[]']);
  });
});
