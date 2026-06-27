/**
 * Covers windie cli. behavior in the frontend test suite.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

let DatabaseSync = null;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (_) {
  DatabaseSync = null;
}

const repoRoot = path.resolve(__dirname, '../..');
const cliPath = path.join(repoRoot, 'scripts/windie-cli.cjs');
const {
  buildLayerLogTailArgs,
  buildFrontendLogTailArgs,
  collectMissingStartNodeInstallTargets,
  getSpawnPlan,
  normalizeWindieLogTarget,
  resolveFrontendLogFile,
  resolveWindieLogFile,
} = require('../../scripts/windie/commands.cjs');
const {
  getEndpointSnapshot,
} = require('../../scripts/windie/status.cjs');
const frontendDevUrl = process.env.WINDIE_FRONTEND_DEV_URL || 'http://localhost:5173/';

function runCli(args, env = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

const staleWindiePathPattern = /bin[\\/]+windie(?!\.(?:sh|cmd))/;

function collectFiles(root, predicate) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      return collectFiles(fullPath, predicate);
    }
    return predicate(fullPath) ? [fullPath] : [];
  });
}

function createSqliteDatabase(dbPath, sql) {
  if (DatabaseSync) {
    const db = new DatabaseSync(dbPath);
    try {
      db.exec(sql);
    } finally {
      db.close();
    }
    return;
  }
  const sqlite = spawnSync('sqlite3', [dbPath, sql], { encoding: 'utf8' });
  expect(sqlite.status).toBe(0);
}

describe('windie CLI', () => {
  test('uses platform-specific windie shims instead of an extensionless Windows trap', () => {
    expect(fs.existsSync(path.join(repoRoot, 'bin/windie'))).toBe(false);
    expect(fs.existsSync(path.join(repoRoot, 'bin/windie.cmd'))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, 'bin/windie.sh'))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, 'bin/docs-list'))).toBe(false);
    expect(fs.existsSync(path.join(repoRoot, 'bin/docs-list.cmd'))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, 'bin/docs-list.sh'))).toBe(true);
    for (const scriptName of [
      'build-sidecar-runtime',
      'committer',
      'create-windie-extension',
      'generate-builtin-tool-manifest',
      'python-in-env',
      'run-backend',
      'run-frontend-dev',
      'run-frontend-customer',
      'run-frontend-electron',
      'test',
      'test-backend',
      'test-sidecar',
    ]) {
      expect(fs.existsSync(path.join(repoRoot, 'scripts', scriptName))).toBe(false);
    }
    expect(fs.existsSync(path.join(repoRoot, 'scripts/python-in-env.cmd'))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, 'scripts/python-in-env.sh'))).toBe(true);
  });

  test('deploy workflow streams the platform-explicit backend update script', () => {
    const workflow = fs.readFileSync(
      path.join(repoRoot, '.github/workflows/deploy-remote-backend.yml'),
      'utf8',
    );

    expect(fs.existsSync(path.join(repoRoot, 'scripts/deploy/update-remote-backend'))).toBe(false);
    expect(fs.existsSync(path.join(repoRoot, 'scripts/deploy/update-remote-backend.sh'))).toBe(true);
    expect(workflow).toContain('< scripts/deploy/update-remote-backend.sh');
    expect(workflow).not.toContain('< scripts/deploy/update-remote-backend\n');
  });

  test('prints grouped help', () => {
    const result = runCli(['--help']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('<windie> <command> [options]');
    expect(result.stdout).toContain('bin\\windie.cmd on Windows PowerShell/CMD');
    expect(result.stdout).toContain('bin/windie.sh on macOS/Linux');
    expect(result.stdout).toContain('<windie> status --all --json');
    expect(result.stdout).toContain('<windie> conversation messages <conversation-ref> [--limit <n>] [--json]');
    expect(result.stdout).toContain('<windie> conversation state <conversation-ref> [--revision <revision-id>] [--json]');
    expect(result.stdout).toContain('<windie> conversation view <conversation-ref> [--revision <revision-id>] [--json]');
    expect(result.stdout).toContain('<windie> start frontend');
    expect(result.stdout).toContain('<windie> start dev');
    expect(result.stdout).toContain('<windie> start customer');
    expect(result.stdout).toContain('<windie> start all');
    expect(result.stdout).toContain('<windie> test local-runtime');
    expect(result.stdout).toContain('<windie> test core-loop [jest args...]');
    expect(result.stdout).toContain('<windie> test user-facing');
    expect(result.stdout).not.toContain('<windie> test sidecar');
    expect(result.stdout).toContain('<windie> logs frontend');
    expect(result.stdout).toContain('<windie> logs vite');
    expect(result.stdout).toContain('<windie> logs main');
    expect(result.stdout).toContain('<windie> logs renderer [--verbose]');
    expect(result.stdout).toContain('<windie> logs local-runtime');
    expect(result.stdout).not.toContain('<windie> logs sidecar');
    expect(result.stdout).toContain('<windie> build local-runtime');
    expect(result.stdout).not.toContain('<windie> build sidecar-runtime');
    expect(result.stdout).not.toContain('<windie> logs desktop');
    expect(result.stdout).toContain('<windie> commits search <query> [--limit <n>] [--json]');
  });

  test('keeps user-facing docs and CLI strings off the removed extensionless shim', () => {
    const docs = collectFiles(path.join(repoRoot, 'docs'), (file) => file.endsWith('.md'));
    const userFacingFiles = [
      path.join(repoRoot, 'README.md'),
      path.join(repoRoot, 'AGENTS.md'),
      path.join(repoRoot, 'agents.md'),
      path.join(repoRoot, 'backend/src/llm/prompts/system_prompt.txt'),
      path.join(repoRoot, 'scripts/create-windie-extension.cjs'),
      path.join(repoRoot, 'scripts/windie/commands.cjs'),
      ...docs,
    ].filter((file) => fs.existsSync(file));

    const offenders = userFacingFiles
      .filter((file) => staleWindiePathPattern.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(repoRoot, file));

    expect(offenders).toEqual([]);
  });

  test('returns machine-readable status', () => {
    const result = runCli(['status', '--json']);

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.detail.repoRoot).toBe(repoRoot);
    expect(parsed.checks.map((check) => check.name)).toEqual(expect.arrayContaining([
      'repo root',
      'local-runtime python',
    ]));
    expect(parsed.checks.find((check) => check.name === 'test scripts')?.detail)
      .toBe('backend, local-runtime, frontend test wrappers');
    expect(parsed.detail.commands.localRuntimePython).toEqual(parsed.detail.commands.sidecarPython);
    expect(parsed.detail.endpoint.httpUrl).toBeTruthy();
  });

  test('returns local-runtime labels for deep doctor diagnostics', () => {
    const result = runCli(['doctor', '--deep', '--json']);

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    const checksByName = Object.fromEntries(
      parsed.checks.map((check) => [check.name, check]),
    );
    const retiredLocalBackendPort = ['local', 'backend', 'port'].join(' ');
    const retiredSidecarImport = ['sidecar', 'import'].join(' ');
    const retiredImportDetail = ['local_backend', 'imports'].join(' ');

    expect(checksByName['backend port']).toBeDefined();
    expect(checksByName['local-runtime import']).toBeDefined();
    expect(checksByName['local-runtime import'].detail).not.toBe(retiredImportDetail);
    expect(checksByName[retiredSidecarImport]).toBeUndefined();
    expect(checksByName[retiredLocalBackendPort]).toBeUndefined();
  });

  test('status endpoint snapshot ignores removed packaged default env aliases', () => {
    expect(getEndpointSnapshot({
      WINDIE_DEFAULT_PACKAGED_BACKEND_HTTP_URL: 'https://packaged.example.com',
      WINDIE_DEFAULT_PACKAGED_BACKEND_WS_URL: 'wss://packaged.example.com/ws',
    })).toEqual({
      httpUrl: 'https://api.windieos.com',
      wsUrl: 'wss://api.windieos.com/ws',
    });
  });

  test('routes lifecycle commands to existing scripts', () => {
    expect(getSpawnPlan(['start', 'backend'])).toMatchObject({
      command: path.join(repoRoot, 'scripts/run-backend.sh'),
      args: [],
      cwd: repoRoot,
    });
    expect(getSpawnPlan(['start', 'frontend'])).toMatchObject({
      concurrent: [
        { label: 'frontend', command: path.join(repoRoot, 'scripts/run-frontend-dev.sh'), cwd: repoRoot, logLayer: 'vite' },
      ],
    });
    expect(getSpawnPlan(['start', 'desktop'])).toMatchObject({
      command: path.join(repoRoot, 'scripts/run-frontend-electron.sh'),
      args: [],
      cwd: repoRoot,
    });
    expect(getSpawnPlan(['start', 'dev'])).toMatchObject({
      concurrent: [
        { label: 'frontend', command: path.join(repoRoot, 'scripts/run-frontend-dev.sh'), cwd: repoRoot, logLayer: 'vite' },
        {
          label: 'desktop',
          command: path.join(repoRoot, 'scripts/run-frontend-electron.sh'),
          cwd: repoRoot,
          waitFor: { type: 'http', url: frontendDevUrl, timeoutMs: 90000 },
        },
      ],
    });
    expect(getSpawnPlan(['start', 'customer'])).toMatchObject({
      concurrent: [
        { label: 'frontend', command: path.join(repoRoot, 'scripts/run-frontend-dev.sh'), cwd: repoRoot, logLayer: 'vite' },
        {
          label: 'customer',
          command: path.join(repoRoot, 'scripts/run-frontend-customer.sh'),
          args: [],
          cwd: repoRoot,
          waitFor: { type: 'http', url: frontendDevUrl, timeoutMs: 90000 },
        },
      ],
    });
  });

  test('exposes scripted provider model only for start dev children', () => {
    const devPlan = getSpawnPlan(['start', 'dev']);
    const customerPlan = getSpawnPlan(['start', 'customer']);

    expect(devPlan.concurrent[0].env.WINDIE_ENABLE_SCRIPTED_PROVIDER).toBe('1');
    expect(devPlan.concurrent[1].env.WINDIE_ENABLE_SCRIPTED_PROVIDER).toBe('1');
    expect(customerPlan.concurrent[0].env).toBeUndefined();
    expect(customerPlan.concurrent[1].env).toBeUndefined();
  });

  test('preflights dev node installs across frontend and SDK package boundaries', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'windie-cli-node-preflight-'));
    const frontendDir = path.join(tempRoot, 'frontend');
    const sdkJsDir = path.join(tempRoot, 'packages', 'windie-sdk-js');
    fs.mkdirSync(frontendDir, { recursive: true });
    fs.mkdirSync(sdkJsDir, { recursive: true });

    expect(collectMissingStartNodeInstallTargets('dev', {
      frontendDir,
      sdkJsDir,
      frontendNodeModulesDir: path.join(frontendDir, 'node_modules'),
      sdkWsModuleDir: path.join(sdkJsDir, 'node_modules', 'ws'),
    }).map((target) => target.label)).toEqual(['frontend', 'SDK websocket']);

    fs.mkdirSync(path.join(frontendDir, 'node_modules'), { recursive: true });
    fs.mkdirSync(path.join(sdkJsDir, 'node_modules', 'ws'), { recursive: true });

    expect(collectMissingStartNodeInstallTargets('dev', {
      frontendDir,
      sdkJsDir,
      frontendNodeModulesDir: path.join(frontendDir, 'node_modules'),
      sdkWsModuleDir: path.join(sdkJsDir, 'node_modules', 'ws'),
    })).toEqual([]);
  });

  test('does not require SDK websocket install for frontend-only start', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'windie-cli-node-preflight-'));
    const frontendDir = path.join(tempRoot, 'frontend');
    const sdkJsDir = path.join(tempRoot, 'packages', 'windie-sdk-js');
    fs.mkdirSync(path.join(frontendDir, 'node_modules'), { recursive: true });
    fs.mkdirSync(sdkJsDir, { recursive: true });

    expect(collectMissingStartNodeInstallTargets('frontend', {
      frontendDir,
      sdkJsDir,
      frontendNodeModulesDir: path.join(frontendDir, 'node_modules'),
      sdkWsModuleDir: path.join(sdkJsDir, 'node_modules', 'ws'),
    })).toEqual([]);
  });

  test('routes customer Electron launches through the frontend Python environment', () => {
    const customerPlan = getSpawnPlan(['start', 'customer']);
    const customerProcess = customerPlan.concurrent.find((processPlan) => processPlan.label === 'customer');

    expect(customerProcess).toMatchObject({
      command: path.join(repoRoot, 'scripts/run-frontend-customer.sh'),
      args: [],
      cwd: repoRoot,
    });
    expect(fs.readFileSync(customerProcess.command, 'utf8')).toContain(
      'scripts/python-in-env.sh" frontend npm --prefix "$ROOT/frontend" run electron',
    );
  });

  test('allows frontend readiness timeout override for cold dev startup', () => {
    const previous = process.env.WINDIE_FRONTEND_READY_TIMEOUT_MS;
    process.env.WINDIE_FRONTEND_READY_TIMEOUT_MS = '120000';
    try {
      expect(getSpawnPlan(['start', 'dev']).concurrent[1].waitFor).toMatchObject({
        type: 'http',
        url: frontendDevUrl,
        timeoutMs: 120000,
      });
    } finally {
      if (previous === undefined) {
        delete process.env.WINDIE_FRONTEND_READY_TIMEOUT_MS;
      } else {
        process.env.WINDIE_FRONTEND_READY_TIMEOUT_MS = previous;
      }
    }
  });

  test('routes test commands without requiring callers to cd frontend', () => {
    expect(getSpawnPlan(['test', 'backend', '--', 'tests/backend/test_websocket_route.py', '-q']))
      .toMatchObject({
        command: path.join(repoRoot, 'scripts/test-backend.sh'),
        args: ['tests/backend/test_websocket_route.py', '-q'],
        cwd: repoRoot,
      });
    expect(getSpawnPlan(['test', 'sidecar', '--', 'tests/sidecar/test_tool_registry.py', '-q']))
      .toMatchObject({
        command: path.join(repoRoot, 'scripts/test-sidecar.sh'),
        args: ['tests/sidecar/test_tool_registry.py', '-q'],
        cwd: repoRoot,
      });
    expect(getSpawnPlan(['test', 'local-runtime', '--', 'tests/sidecar/test_tool_registry.py', '-q']))
      .toMatchObject({
        command: path.join(repoRoot, 'scripts/test-sidecar.sh'),
        args: ['tests/sidecar/test_tool_registry.py', '-q'],
        cwd: repoRoot,
      });
    expect(getSpawnPlan(['test', 'frontend', '--', 'WindieCli'])).toMatchObject({
      command: 'npm',
      args: ['--prefix', path.join(repoRoot, 'frontend'), 'run', 'test:ci', '--', 'WindieCli'],
      cwd: repoRoot,
    });
    const coreLoopPlan = getSpawnPlan(['test', 'core-loop', '--', '--listTests']);
    expect(coreLoopPlan).toMatchObject({
      command: 'npm',
      cwd: repoRoot,
    });
    expect(coreLoopPlan.args.slice(0, 5)).toEqual([
      '--prefix',
      path.join(repoRoot, 'frontend'),
      'run',
      'test:ci',
      '--',
    ]);
    expect(coreLoopPlan.args).toEqual(expect.arrayContaining([
      'AgentSdkConversationRuntime.test.ts',
      'PendingTurnLiveSurfaceIntegration.test.js',
      'ResponseOverlayPhaseHandler.test.cjs',
      'LocalRuntimeExecuteToolRuntime.test.cjs',
      '--listTests',
    ]));
    const userFacingPlan = getSpawnPlan(['test', 'user-facing']);
    expect(userFacingPlan.concurrent).toHaveLength(7);
    expect(userFacingPlan.concurrent[0]).toMatchObject({
      label: 'core-loop',
      command: 'npm',
      cwd: repoRoot,
    });
    expect(userFacingPlan.concurrent[0].args).toEqual(expect.arrayContaining([
      'AgentSdkConversationRuntime.test.ts',
      'PendingTurnLiveSurfaceIntegration.test.js',
    ]));
    expect(userFacingPlan.concurrent[1]).toMatchObject({
      label: 'startup-cli',
      command: 'npm',
      cwd: repoRoot,
    });
    expect(userFacingPlan.concurrent[1].args).toEqual([
      '--prefix',
      path.join(repoRoot, 'frontend'),
      'run',
      'test:ci',
      '--',
      'WindieCli.test.cjs',
    ]);
    expect(userFacingPlan.concurrent[2]).toMatchObject({
      label: 'renderer-light-appearance',
      command: 'npm',
      cwd: repoRoot,
    });
    expect(userFacingPlan.concurrent[2].args).toEqual(expect.arrayContaining([
      'DesktopAppearanceThemeRuntime.test.js',
      'SettingsSection.test.jsx',
      'ChatMarkdownAppearanceCss.test.cjs',
      'ChatBoxAppearanceCss.test.cjs',
      'ChatBoxResponseAppearanceCss.test.cjs',
      'SettingsSurfaceCss.test.js',
    ]));
    expect(userFacingPlan.concurrent[3]).toMatchObject({
      label: 'settings-startup',
      command: 'npm',
      cwd: repoRoot,
    });
    expect(userFacingPlan.concurrent[3].args).toEqual(expect.arrayContaining([
      'AppConfigProvider.storageAndIpc.test.tsx',
      'IpcChatQueryHandlers.test.cjs',
      'IpcSettingsSyncRuntime.test.cjs',
      'IpcAgentDefinitionContext.test.cjs',
      'IpcDesktopUiConfigStore.test.cjs',
      'IpcAgentSdkRuntimeCommands.test.cjs',
    ]));
    expect(userFacingPlan.concurrent[4]).toMatchObject({
      label: 'model-send-selection',
      command: 'npm',
      cwd: repoRoot,
    });
    expect(userFacingPlan.concurrent[4].args).toEqual(expect.arrayContaining([
      'DesktopSettingsRuntimeClient.test.ts',
      'ChatMessageSender.test.tsx',
      'DesktopManualCompactionRuntime.test.js',
      'IpcAgentSdkRuntimeCommands.test.cjs',
    ]));
    expect(userFacingPlan.concurrent[5]).toMatchObject({
      label: 'provider-credential-persistence',
      command: 'npm',
      cwd: repoRoot,
    });
    expect(userFacingPlan.concurrent[5].args).toEqual(expect.arrayContaining([
      'AppConfigPersistence.test.js',
      'IpcDesktopUiConfigStore.test.cjs',
      'IpcProviderCredentialPersistence.test.cjs',
    ]));
    expect(userFacingPlan.concurrent[6]).toMatchObject({
      label: 'scripted-provider',
      command: path.join(repoRoot, 'scripts/test-backend.sh'),
      args: ['tests/backend/test_scripted_provider.py', '-q'],
      cwd: repoRoot,
    });
  });

  test('routes docs list through node instead of the platform shell shim', () => {
    expect(getSpawnPlan(['docs', 'list'])).toMatchObject({
      command: process.execPath,
      args: [path.join(repoRoot, 'scripts/docs-list.js')],
      cwd: repoRoot,
    });
  });

  test('routes build commands without requiring callers to cd frontend', () => {
    expect(getSpawnPlan(['build', 'frontend'])).toMatchObject({
      command: 'npm',
      args: ['--prefix', path.join(repoRoot, 'frontend'), 'run', 'build'],
      cwd: repoRoot,
    });
    expect(getSpawnPlan(['build', 'local-runtime'])).toMatchObject({
      command: 'npm',
      args: ['--prefix', path.join(repoRoot, 'frontend'), 'run', 'build:sidecar-runtime'],
      cwd: repoRoot,
    });
    expect(getSpawnPlan(['build', 'sidecar-runtime'])).toMatchObject({
      command: 'npm',
      args: ['--prefix', path.join(repoRoot, 'frontend'), 'run', 'build:sidecar-runtime'],
      cwd: repoRoot,
    });
  });

  test('searches recent commits with a limit', () => {
    const result = runCli(['commits', 'search', 'docs search', '--limit', '2']);

    expect(result.status).toBe(0);
    const commitLines = result.stdout
      .split(/\r?\n/)
      .filter((line) => /^[0-9a-f]{7,12}\s+\d{4}-\d{2}-\d{2}\s+/.test(line));
    expect(commitLines.length).toBeGreaterThan(0);
    expect(commitLines.length).toBeLessThanOrEqual(2);
  });

  test('prints commit search results as json', () => {
    const result = runCli(['commits', 'search', 'docs search', '--limit', '1', '--json']);

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toMatchObject({
      query: 'docs search',
      limit: 1,
    });
    expect(parsed.scanned).toBeGreaterThan(0);
    expect(parsed.matches.length).toBeLessThanOrEqual(1);
    expect(parsed.matches[0]).toEqual(expect.objectContaining({
      hash: expect.any(String),
      shortHash: expect.any(String),
      date: expect.any(String),
      subject: expect.any(String),
      paths: expect.any(Array),
      score: expect.any(Number),
    }));
  });

  test('conversation state reports display/model/revision ownership diagnostics', () => {
    const userDataDir = path.join(os.tmpdir(), `windie-cli-state-${process.pid}-${Date.now()}`);
    const historyDir = path.join(userDataDir, 'history');
    const dbPath = path.join(historyDir, 'history.db');
    fs.mkdirSync(historyDir, { recursive: true });
    createSqliteDatabase(dbPath, `
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
        tool_name TEXT,
        correlation_id TEXT,
        workspace_path TEXT,
        workspace_name TEXT,
        producer TEXT,
        producer_event_id TEXT,
        producer_sequence INTEGER,
        metadata TEXT,
        attachments TEXT,
        event_payload TEXT NOT NULL,
        compaction_checkpoint TEXT
      );
      CREATE TABLE conversation_revisions (
        user_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        revision_id TEXT NOT NULL,
        parent_revision_id TEXT,
        operation TEXT NOT NULL DEFAULT 'send',
        display_timeline_id TEXT,
        model_history_checkpoint_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (user_id, conversation_id, revision_id)
      );
      CREATE TABLE conversation_display_timeline (
        user_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        revision_id TEXT NOT NULL,
        row_index INTEGER NOT NULL,
        row_id TEXT NOT NULL,
        role TEXT NOT NULL,
        row_type TEXT NOT NULL,
        content TEXT,
        turn_ref TEXT,
        metadata TEXT,
        reason TEXT,
        base_revision_id TEXT,
        created_at TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (user_id, conversation_id, revision_id, row_index)
      );
      CREATE TABLE conversation_model_history (
        user_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        revision_id TEXT NOT NULL,
        checkpoint_id TEXT NOT NULL,
        row_index INTEGER NOT NULL,
        row_id TEXT NOT NULL,
        role TEXT NOT NULL,
        message_type TEXT NOT NULL,
        content TEXT,
        tool_call_id TEXT,
        tool_calls TEXT,
        tool_name TEXT,
        image_refs TEXT,
        compaction_facts TEXT,
        source_display_row_ids TEXT,
        created_at TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (user_id, conversation_id, checkpoint_id, row_index)
      );
      INSERT INTO conversation_events
      (id, user_id, conversation_id, event_type, role, content, timestamp, message_index,
       revision_id, turn_ref, metadata, attachments, event_payload)
      VALUES
      ('evt-user-parent', 'user-1', 'conv-state', 'user_message', 'user', 'old',
       '2026-06-22T12:00:00+00:00', 1, 'rev-parent', 'turn-parent', '{}', '[]', '{}'),
      ('evt-assistant-parent', 'user-1', 'conv-state', 'assistant_message', 'assistant', 'stale',
       '2026-06-22T12:00:01+00:00', 2, 'rev-parent', 'turn-parent', '{}', '[]', '{}'),
      ('evt-superseded-parent', 'user-1', 'conv-state', 'turn_superseded', 'system', '',
       '2026-06-22T12:00:30+00:00', 3, 'rev-child', 'turn-parent', '{}', '[]',
       '{"payload":{"supersededTurnRef":"turn-parent","replacementTurnRef":"turn-child","revisionId":"rev-child","reason":"user_edit","createdAt":"2026-06-22T12:00:30+00:00"}}'),
      ('evt-user-child', 'user-1', 'conv-state', 'user_message', 'user', 'new',
       '2026-06-22T12:01:00+00:00', 4, 'rev-child', 'turn-child', '{}', '[]', '{}'),
      ('evt-internal-lane', 'user-1', 'conv-agent-worker', 'user_message', 'user', 'internal',
       '2026-06-22T12:01:05+00:00', 1, 'rev-internal', 'turn-internal', '{}', '[]', '{}');
      INSERT INTO conversation_revisions
      (user_id, conversation_id, revision_id, parent_revision_id, operation,
       display_timeline_id, model_history_checkpoint_id, created_at, updated_at, active)
      VALUES
      ('user-1', 'conv-state', 'rev-parent', NULL, 'send', NULL, 'mh-parent',
       '2026-06-22T12:00:00+00:00', '2026-06-22T12:02:00+00:00', 1),
      ('user-1', 'conv-state', 'rev-child', 'rev-parent', 'edit', 'rev-child', 'mh-child',
       '2026-06-22T12:01:00+00:00', '2026-06-22T12:01:30+00:00', 0);
      INSERT INTO conversation_model_history
      (user_id, conversation_id, revision_id, checkpoint_id, row_index, row_id,
       role, message_type, content, created_at, active)
      VALUES
      ('user-1', 'conv-state', 'rev-child', 'mh-child', 1, 'mh-user',
       'user', 'user_query', '"new"', '2026-06-22T12:01:30+00:00', 1),
      ('user-1', 'conv-state', 'rev-child', 'mh-child', 2, 'mh-assistant',
       'assistant', 'assistant_response', '"answer"', '2026-06-22T12:01:30+00:00', 1);
    `);

    const result = runCli(['conversation', 'state', 'conv-state', '--json'], {
      AGENT_USER_DATA_DIR: userDataDir,
    });

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.selectedRevision).toMatchObject({
      revisionId: 'rev-child',
      parentRevisionId: 'rev-parent',
      operation: 'edit',
      active: false,
    });
    expect(parsed.displayTimeline).toMatchObject({
      revisionId: 'rev-child',
      rowCount: 0,
      reason: 'user_edit',
      source: 'revision_graph',
    });
    expect(parsed.modelHistory).toMatchObject({
      checkpointId: 'mh-child',
      revisionId: 'rev-child',
      rowCount: 2,
      source: 'row_storage',
    });
    expect(parsed.rawEvents).toMatchObject({
      eventCount: 4,
      userMessageCount: 2,
      assistantMessageCount: 1,
    });
    expect(parsed.supersededLive).toMatchObject({
      activeTurnRef: 'turn-child',
      activePhase: 'awaiting',
      supersededTurnCount: 1,
      latestSupersededTurnPair: expect.objectContaining({
        supersededTurnRef: 'turn-parent',
        replacementTurnRef: 'turn-child',
        revisionId: 'rev-child',
        reason: 'user_edit',
      }),
      visibleTypingTurnSuperseded: false,
      supersededWithoutTerminalCompletion: ['turn-parent'],
      supersededWithoutTerminalCompletionCount: 1,
    });
    expect(parsed.diagnostics).toMatchObject({
      staleParentActive: true,
      rawEventFallbackRequired: false,
      visibleTypingTurnSuperseded: false,
      supersededWithoutTerminalCompletion: true,
    });

    const viewResult = runCli(['conversation', 'view', 'conv-state', '--json'], {
      AGENT_USER_DATA_DIR: userDataDir,
    });
    expect(viewResult.status).toBe(0);
    const view = JSON.parse(viewResult.stdout);
    expect(view).toMatchObject({
      conversationRef: 'conv-state',
      activeRevisionId: 'rev-child',
      displayRowCount: 0,
      liveTurnRef: 'turn-child',
      liveTurnPhase: 'awaiting',
      responseOverlayMode: 'typing',
      responseOverlayGuardRef: 'turn-child',
      pendingTurnRef: 'turn-child',
      supersededTurnCount: 1,
      filteredInternalLaneCount: 1,
      modelHistoryCheckpointId: 'mh-child',
      lastEventRef: 'evt-user-child',
      lastSdkEventRef: null,
      lastBackendEventRef: null,
    });

    const parentViewResult = runCli(['conversation', 'view', 'conv-state', '--revision', 'rev-parent', '--json'], {
      AGENT_USER_DATA_DIR: userDataDir,
    });
    expect(parentViewResult.status).toBe(0);
    const parentView = JSON.parse(parentViewResult.stdout);
    expect(parentView).toMatchObject({
      conversationRef: 'conv-state',
      activeRevisionId: 'rev-parent',
      displayRowCount: 0,
      liveTurnRef: 'turn-parent',
      liveTurnPhase: 'awaiting',
      responseOverlayMode: 'typing',
      responseOverlayGuardRef: 'turn-parent',
      pendingTurnRef: 'turn-parent',
      supersededTurnCount: 0,
      modelHistoryCheckpointId: 'mh-parent',
      lastEventRef: 'evt-assistant-parent',
      lastSdkEventRef: null,
      lastBackendEventRef: null,
    });
  });

  test('rejects commit search limit without a value', () => {
    const result = runCli(['commits', 'search', 'docs search', '--limit']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--limit requires a value.');
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
    expect(resolveWindieLogFile('vite', {})).toBe(path.join(logsDir, 'vite.log'));
    expect(resolveWindieLogFile('main', {})).toBe(path.join(logsDir, 'main.log'));
    expect(resolveWindieLogFile('renderer', {})).toBe(path.join(logsDir, 'renderer.log'));
    expect(resolveWindieLogFile('renderer', {}, { verbose: true }))
      .toBe(path.join(logsDir, 'renderer.verbose.log'));
    expect(resolveWindieLogFile('local-runtime', {})).toBe(path.join(logsDir, 'sidecar.log'));
    expect(resolveWindieLogFile('local-runtime', { WINDIE_LOCAL_RUNTIME_LOG_FILE: '/tmp/local-runtime.log' }))
      .toBe('/tmp/local-runtime.log');
    expect(resolveWindieLogFile('sidecar', {})).toBe(path.join(logsDir, 'sidecar.log'));
    expect(resolveWindieLogFile('sidecar', { WINDIE_SIDECAR_LOG_FILE: '/tmp/sidecar.log' }))
      .toBe('/tmp/sidecar.log');
    expect(resolveWindieLogFile('sidecar', { WINDIE_SIDECAR_LOG_FILE: 'logs/sidecar.log' }))
      .toBe(path.join(repoRoot, 'logs', 'sidecar.log'));
    expect(resolveWindieLogFile('sidecar', { WINDIE_SIDECAR_LOG_FILE: 'false' })).toBeNull();
    expect(resolveWindieLogFile('renderer', { WINDIE_RENDERER_VERBOSE_LOG_FILE: '/tmp/renderer.verbose.log' }, { verbose: true }))
      .toBe('/tmp/renderer.verbose.log');

    expect(buildLayerLogTailArgs('local-runtime', ['--tail', '10', '--no-follow'], {})).toEqual({
      logFile: path.join(logsDir, 'sidecar.log'),
      tailArgs: ['-n', '10', path.join(logsDir, 'sidecar.log')],
    });
    expect(buildLayerLogTailArgs('sidecar', ['--tail', '10', '--no-follow'], {})).toEqual({
      logFile: path.join(logsDir, 'sidecar.log'),
      tailArgs: ['-n', '10', path.join(logsDir, 'sidecar.log')],
    });
    expect(buildLayerLogTailArgs('renderer', ['--verbose', '--tail', '20', '--no-follow'], {})).toEqual({
      logFile: path.join(logsDir, 'renderer.verbose.log'),
      tailArgs: ['-n', '20', path.join(logsDir, 'renderer.verbose.log')],
    });
    expect(() => normalizeWindieLogTarget('desktop'))
      .toThrow('Usage: <windie> logs backend|frontend|vite|main|renderer|local-runtime');
    expect(() => resolveWindieLogFile('desktop', {}))
      .toThrow('Usage: <windie> logs backend|frontend|vite|main|renderer|local-runtime');
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

  test('prints current renderer verbose logs without following', () => {
    const testLogFile = path.join(repoRoot, '.windie', 'logs', `windie-renderer-verbose-cli-test-${process.pid}.log`);
    fs.rmSync(testLogFile, { force: true });

    const result = runCli(
      ['logs', 'renderer', '--verbose', '--no-follow', '--tail', '3'],
      { WINDIE_RENDERER_VERBOSE_LOG_FILE: testLogFile },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[WindieOS] renderer verbose log file initialized.');
  });

  test('prints current local-runtime logs through the sidecar alias without following', () => {
    const testLogFile = path.join(repoRoot, '.windie', 'logs', `windie-sidecar-cli-test-${process.pid}.log`);
    fs.rmSync(testLogFile, { force: true });

    const result = runCli(
      ['logs', 'sidecar', '--no-follow', '--tail', '3'],
      { WINDIE_SIDECAR_LOG_FILE: testLogFile },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[WindieOS] local-runtime log');
  });

  test('prints current local runtime logs without following', () => {
    const testLogFile = path.join(repoRoot, '.windie', 'logs', `windie-local-runtime-cli-test-${process.pid}.log`);
    fs.rmSync(testLogFile, { force: true });

    const result = runCli(
      ['logs', 'local-runtime', '--no-follow', '--tail', '3'],
      { WINDIE_LOCAL_RUNTIME_LOG_FILE: testLogFile },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[WindieOS] local-runtime log');
  });

  test('prints registered diagnostic paths', () => {
    const result = runCli(['diagnostics', 'paths', '--json']);

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.paths).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: 'desktop.startup',
        purpose: expect.stringContaining('Desktop startup'),
      }),
      expect.objectContaining({
        path: 'surface.visibility',
        owner: expect.stringContaining('surface runtime'),
      }),
      expect.objectContaining({
        path: 'renderer.display_projection',
        purpose: expect.stringContaining('display-row projection image-count'),
      }),
    ]));
  });

  test('exports display conversation messages from the canonical history database', () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-cli-history-'));
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
    createSqliteDatabase(dbPath, sql);

    const result = runCli(['conversation', 'messages', 'conv-1', '--json'], {
      HOME: homeDir,
      WINDIE_USER_DATA_DIR: path.join(homeDir, 'Library', 'Application Support', 'windieos'),
    });

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.database).toBe(dbPath);
    expect(parsed.messages.map((message) => message.eventId)).toEqual(['evt-user', 'evt-assistant']);
    expect(parsed.messages.map((message) => message.role)).toEqual(['user', 'assistant']);
  });

  test('conversation messages defaults to local-runtime desktop-runtime history root', () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-cli-runtime-history-'));
    const appDataDir = path.join(homeDir, 'AppData', 'Roaming');
    const historyRoot =
      process.platform === 'win32'
        ? path.join(appDataDir, 'desktop-runtime')
        : path.join(homeDir, 'Library', 'Application Support', 'desktop-runtime');
    const historyDir = path.join(historyRoot, 'history');
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
      ('evt-runtime-user', 'user-1', 'conv-runtime', 'user_message', 'user', 'hello', '2026-06-11T12:00:00+00:00', 1, 'rev-1', 'turn-1', '{}', '[]', '{}');
    `;
    createSqliteDatabase(dbPath, sql);

    const result = runCli(['conversation', 'messages', 'conv-runtime', '--json'], {
      HOME: homeDir,
      APPDATA: appDataDir,
      AGENT_USER_DATA_DIR: '',
      WINDIE_USER_DATA_DIR: '',
    });

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.database).toBe(dbPath);
    expect(parsed.messages.map((message) => message.eventId)).toEqual(['evt-runtime-user']);
  });

  test('exports display conversation messages from older history schemas without the view', () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-cli-history-legacy-'));
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
    createSqliteDatabase(dbPath, sql);

    const result = runCli(['conversation', 'messages', 'conv-1', '--json'], {
      HOME: homeDir,
      WINDIE_USER_DATA_DIR: path.join(homeDir, 'Library', 'Application Support', 'windieos'),
    });

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.messages.map((message) => message.eventId)).toEqual(['evt-user', 'evt-error']);
    expect(parsed.messages.map((message) => message.role)).toEqual(['user', 'error']);
    expect(parsed.messages.map((message) => message.attachments)).toEqual(['[]', '[]']);
  });
});
