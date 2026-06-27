/**
 * Runs the commands workflow for the developer CLI and automation tooling.
 */

const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { findCommits } = require('./commits.cjs');
const { findDocs } = require('./docs.cjs');
const { printCheckList, printJson, printSection } = require('./output.cjs');
const { FRONTEND_DIR, REPO_ROOT, repoPath } = require('./paths.cjs');
const { collectStatus, getEndpointSnapshot } = require('./status.cjs');
const { capture, runConcurrent, runForeground, runSync } = require('./run.cjs');
const { mainHostSkin } = require('../../frontend/src/main/app/main_host_skin.cjs');
const {
  APP_DIAGNOSTICS_PATH,
  configureAppDiagnosticsStore,
  diagnosticsDatabasePath,
  inspectDiagnosticTrace,
  listDiagnosticPathDefinitions,
  queryDiagnosticEvents,
} = require('../../frontend/src/main/diagnostics/app_diagnostics_store.cjs');
const {
  configureLayerLogSink,
  ensureLogFile,
  resolveLayerLogEnvKey,
  resolveLayerLogFile,
  resolveRendererVerboseLogEnvKey,
  resolveRendererVerboseLogFile,
} = require('../../frontend/src/main/logging/layer_log_sink.cjs');

configureLayerLogSink(mainHostSkin.logging);
configureAppDiagnosticsStore(mainHostSkin.diagnostics);

let DatabaseSync = null;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (_) {
  DatabaseSync = null;
}

const HELP = `WindieOS command line

Usage:
  <windie> <command> [options]

Run with bin\\windie.cmd on Windows PowerShell/CMD or bin/windie.sh on macOS/Linux.
Documentation uses <windie> for that active platform shim.

Status and diagnostics:
  <windie> status
  <windie> status --all
  <windie> status --all --json
  <windie> doctor
  <windie> doctor --fix
  <windie> doctor --deep
  <windie> doctor --json
  <windie> diagnostics paths [--json]
  <windie> diagnostics list [--path <path>] [--limit <n>] [--json]
  <windie> diagnostics inspect <trace-id> [--json]
  <windie> trace <conversation-ref> <turn-ref> [--path <path>] [--json]
  <windie> capability trace <conversation-ref> [--turn <turn-ref>] [--limit <n>] [--json]
  <windie> conversation list [--limit <n>] [--json]
  <windie> conversation inspect <conversation-ref> [--json]
  <windie> conversation state <conversation-ref> [--revision <revision-id>] [--json]
  <windie> conversation view <conversation-ref> [--revision <revision-id>] [--json]
  <windie> conversation messages <conversation-ref> [--limit <n>] [--json]
  <windie> conversation events <conversation-ref> [--turn <turn-ref>] [--type <event-type>] [--limit <n>] [--json]
  <windie> conversation turns <conversation-ref> [--json]
  <windie> conversation traces <conversation-ref> [--turn <turn-ref>] [--path <path>] [--limit <n>] [--json]

Lifecycle and logs:
  <windie> start backend
  <windie> start frontend
  <windie> start desktop
  <windie> start dev
  <windie> start customer
  <windie> start all
  <windie> stop
  <windie> restart desktop
  <windie> logs backend [--remote --host <host>] [--service backend|tunnel|both]
  <windie> logs frontend [--tail <lines>] [--follow] [--no-follow]
  <windie> logs vite [--tail <lines>] [--follow] [--no-follow]
  <windie> logs main [--tail <lines>] [--follow] [--no-follow]
  <windie> logs renderer [--verbose] [--tail <lines>] [--follow] [--no-follow]
  <windie> logs local-runtime [--tail <lines>] [--follow] [--no-follow]

Tests and docs:
  <windie> test backend [args...]
  <windie> test local-runtime [args...]
  <windie> test frontend [args...]
  <windie> test core-loop [jest args...]
  <windie> test user-facing
  <windie> test all
  <windie> test pick <area>
  <windie> docs list
  <windie> docs check
  <windie> docs search <query>
  <windie> docs <query>
  <windie> commits search <query> [--limit <n>] [--json]

Build and package:
  <windie> build frontend
  <windie> build local-runtime
  <windie> package mac
  <windie> package win
  <windie> package linux
  <windie> reinstall mac
  <windie> reinstall win
  <windie> reinstall linux

Backend, endpoint, and self-host:
  <windie> backend health [--url <url>]
  <windie> backend deploy --host <host> [options]
  <windie> backend deploy --local [options]
  <windie> backend service status|start|stop|restart [--scope system|user] [--host <host>]
  <windie> endpoint show
  <windie> endpoint local
  <windie> endpoint hosted
  <windie> endpoint probe
  <windie> self-host bootstrap [options]
  <windie> self-host tunnel setup [options]
  <windie> self-host service install-backend [options]
  <windie> self-host service install-cloudflared [options]
  <windie> self-host status

Developer helpers:
  <windie> extension create <id> [options]
  <windie> tools manifest generate
  <windie> mock backend
`;

const SDK_JS_DIR = repoPath('packages', 'windie-sdk-js');
const FRONTEND_NODE_MODULES_DIR = path.join(FRONTEND_DIR, 'node_modules');
const SDK_WS_MODULE_DIR = path.join(SDK_JS_DIR, 'node_modules', 'ws');

const CORE_LOOP_REGRESSION_PACK_TESTS = Object.freeze([
  'DesktopVisibleTurnLifecycleRuntime.test.js',
  'DesktopCurrentTurnProjectionEffectsRuntime.test.ts',
  'LiveTurnSurfaceState.test.js',
  'ChatMessageSender.test.tsx',
  'AttachmentDisplayComponents.test.jsx',
  'DesktopResolvedMessageScreenshotsRuntime.test.jsx',
  'DesktopConversationDisplayProjection.test.ts',
  'DesktopConversationRuntimeEventClient.test.ts',
  'SdkDisplayChatMessageProjection.test.ts',
  'ChatStore.test.ts',
  'ChatSurfaceController.test.jsx',
  'ChatInterfaceWiring.test.jsx',
  'MessageListAssistantActions.test.jsx',
  'ConversationReplayActions.test.jsx',
  'UseDashboardConversations.test.jsx',
  'DesktopConversationLibraryClient.test.ts',
  'DesktopConversationStore.test.ts',
  'DesktopConversationContinuityService.test.ts',
  'AgentConversationStoreApi.test.ts',
  'AgentSdkClient.test.ts',
  'AgentSdkConversationRuntime.test.ts',
  'AgentSdkCjsConversationRuntime.test.cjs',
  'ConversationRuntimeProjectionStream.test.ts',
  'IpcRendererWindows.test.cjs',
  'IpcMainSdkRuntimeBoundary.test.cjs',
  'IpcDirectWakeUpAgentAdapter.test.cjs',
  'IpcPendingTurnHandlers.test.cjs',
  'PendingTurnLiveSurfaceIntegration.test.js',
  'ChatPillSessionFlow.test.ts',
  'PendingStopLiveSurfaceIntegration.test.jsx',
  'DesktopStopTurnRuntime.test.js',
  'IpcStopTargetRuntime.test.cjs',
  'DesktopLiveTurnRuntimeClient.test.ts',
  'IpcConversationEventProjection.test.cjs',
  'IpcLiveTurnState.test.cjs',
  'ChatBoxResponse.state.test.jsx',
  'SdkLiveTurnSurfaceController.test.cjs',
  'ResponseOverlayPhaseHandler.test.cjs',
  'ResponseOverlayVisibilityPolicy.test.cjs',
  'ToolCallMessageState.test.js',
  'ToolOutputMessageState.test.ts',
  'LocalRuntimeExecuteToolRuntime.test.cjs',
  'SurfaceRuntime.test.cjs',
]);

const SCRIPTED_PROVIDER_USER_FACING_REGRESSION_TESTS = Object.freeze([
  'tests/backend/test_scripted_provider.py',
  '-q',
]);

const RENDERER_LIGHT_APPEARANCE_USER_FACING_REGRESSION_TESTS = Object.freeze([
  'DesktopAppearanceThemeRuntime.test.js',
  'SettingsSection.test.jsx',
  'RendererSkinConfigBoundary.test.cjs',
  'ThemeCss.test.js',
  'ChatHeaderAppearanceCss.test.cjs',
  'ChatBoxAppearanceCss.test.cjs',
  'ChatBoxResponseAppearanceCss.test.cjs',
  'ToolCallRenderingCss.test.js',
  'SettingsSurfaceCss.test.js',
]);

const SETTINGS_STARTUP_USER_FACING_REGRESSION_TESTS = Object.freeze([
  'AppConfigProvider.storageAndIpc.test.tsx',
  'IpcChatQueryHandlers.test.cjs',
  'IpcSettingsSyncRuntime.test.cjs',
  'IpcAgentDefinitionContext.test.cjs',
  'IpcDesktopUiConfigStore.test.cjs',
  'IpcAgentSdkRuntimeCommands.test.cjs',
]);

const MODEL_SEND_SELECTION_USER_FACING_REGRESSION_TESTS = Object.freeze([
  'DesktopSettingsRuntimeClient.test.ts',
  'ChatMessageSender.test.tsx',
  'DesktopManualCompactionRuntime.test.js',
  'IpcAgentSdkRuntimeCommands.test.cjs',
]);

const PROVIDER_CREDENTIAL_PERSISTENCE_USER_FACING_REGRESSION_TESTS = Object.freeze([
  'AppConfigPersistence.test.js',
  'IpcDesktopUiConfigStore.test.cjs',
  'IpcProviderCredentialPersistence.test.cjs',
]);

function coreLoopRegressionPackCommand(extraArgs = []) {
  return {
    command: 'npm',
    args: [
      '--prefix',
      FRONTEND_DIR,
      'run',
      'test:ci',
      '--',
      ...CORE_LOOP_REGRESSION_PACK_TESTS,
      ...extraArgs,
    ],
    cwd: REPO_ROOT,
  };
}

function userFacingRegressionPackProcesses() {
  return [
    { label: 'core-loop', ...coreLoopRegressionPackCommand() },
    {
      label: 'startup-cli',
      command: 'npm',
      args: ['--prefix', FRONTEND_DIR, 'run', 'test:ci', '--', 'WindieCli.test.cjs'],
      cwd: REPO_ROOT,
    },
    {
      label: 'renderer-light-appearance',
      command: 'npm',
      args: [
        '--prefix',
        FRONTEND_DIR,
        'run',
        'test:ci',
        '--',
        ...RENDERER_LIGHT_APPEARANCE_USER_FACING_REGRESSION_TESTS,
      ],
      cwd: REPO_ROOT,
    },
    {
      label: 'settings-startup',
      command: 'npm',
      args: [
        '--prefix',
        FRONTEND_DIR,
        'run',
        'test:ci',
        '--',
        ...SETTINGS_STARTUP_USER_FACING_REGRESSION_TESTS,
      ],
      cwd: REPO_ROOT,
    },
    {
      label: 'model-send-selection',
      command: 'npm',
      args: [
        '--prefix',
        FRONTEND_DIR,
        'run',
        'test:ci',
        '--',
        ...MODEL_SEND_SELECTION_USER_FACING_REGRESSION_TESTS,
      ],
      cwd: REPO_ROOT,
    },
    {
      label: 'provider-credential-persistence',
      command: 'npm',
      args: [
        '--prefix',
        FRONTEND_DIR,
        'run',
        'test:ci',
        '--',
        ...PROVIDER_CREDENTIAL_PERSISTENCE_USER_FACING_REGRESSION_TESTS,
      ],
      cwd: REPO_ROOT,
    },
    {
      label: 'scripted-provider',
      command: script('scripts/test-backend.sh'),
      args: [...SCRIPTED_PROVIDER_USER_FACING_REGRESSION_TESTS],
      cwd: REPO_ROOT,
    },
  ];
}

function hasFlag(args, flag) {
  return args.includes(flag);
}

function optionValue(args, name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) {
    return fallback;
  }
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    return fallback;
  }
  return value;
}

function stripSeparator(args) {
  return args[0] === '--' ? args.slice(1) : args;
}

function script(relativePath) {
  return repoPath(relativePath);
}

function nodeScriptArgs(relativePath, args = []) {
  return [script(relativePath), ...args];
}

function envString(env, key) {
  return typeof env[key] === 'string' && env[key].trim() ? env[key].trim() : '';
}

function localRuntimeUserDataRoot(env = process.env, platformName = process.platform) {
  const override = envString(env, 'AGENT_USER_DATA_DIR') || envString(env, 'WINDIE_USER_DATA_DIR');
  if (override) {
    return override;
  }
  if (platformName === 'win32') {
    const appData = envString(env, 'APPDATA');
    if (!appData) {
      throw new Error('APPDATA environment variable is not set on Windows');
    }
    return path.join(appData, 'desktop-runtime');
  }
  if (platformName === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'desktop-runtime');
  }
  return path.join(os.homedir(), '.config', 'desktop-runtime');
}

function historyDatabasePath() {
  return path.join(localRuntimeUserDataRoot(), 'history', 'history.db');
}

function historyTableNames() {
  const dbPath = historyDatabasePath();
  const usingCanonicalHistory = dbPath.endsWith(path.join('history', 'history.db'));
  return {
    events: usingCanonicalHistory ? 'conversation_events' : 'chat_events',
    revisions: usingCanonicalHistory ? 'conversation_revisions' : 'chat_conversation_revisions',
    displayTimeline: 'conversation_display_timeline',
    modelHistory: 'conversation_model_history',
    titles: 'conversation_titles',
  };
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlLimit(value, fallback = 100) {
  const raw = value === null || value === undefined ? fallback : value;
  if (!/^\d+$/.test(String(raw)) || Number(raw) < 1) {
    throw new Error('--limit must be a positive integer.');
  }
  return Math.min(Number(raw), 1000);
}

function positionalArgs(args, valueFlags = []) {
  const valueFlagSet = new Set(valueFlags);
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (valueFlagSet.has(arg)) {
      index += 1;
      continue;
    }
    if (arg.startsWith('--')) {
      continue;
    }
    positional.push(arg);
  }
  return positional;
}

function queryHistoryDatabase(sql) {
  const dbPath = historyDatabasePath();
  if (!fs.existsSync(dbPath)) {
    throw new Error(`history database not found: ${dbPath}`);
  }
  if (DatabaseSync) {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      return db.prepare(sql).all();
    } finally {
      db.close();
    }
  }
  const result = capture('sqlite3', ['-json', dbPath, sql], { cwd: REPO_ROOT });
  if (!result.ok) {
    throw new Error(result.stderr || result.error || 'Failed to query history database');
  }
  return JSON.parse(result.stdout || '[]');
}

function historyObjectExists(name) {
  const rows = queryHistoryDatabase(`
    SELECT name
    FROM sqlite_master
    WHERE name = ${sqlString(name)}
      AND type IN ('table', 'view')
    LIMIT 1
  `);
  return rows.length > 0;
}

function historyObjectColumns(name) {
  return new Set(queryHistoryDatabase(`PRAGMA table_info(${name})`).map((row) => row.name));
}

function revisionBranchOrderExpression(alias = 'r') {
  return `
    CASE
      WHEN ${alias}.parent_revision_id IN (
        SELECT r_active.revision_id
        FROM conversation_revisions r_active
        WHERE r_active.user_id = ${alias}.user_id
          AND r_active.conversation_id = ${alias}.conversation_id
          AND r_active.active = 1
      ) THEN 2
      WHEN ${alias}.active = 1 THEN 1
      ELSE 0
    END DESC,
    ${alias}.updated_at DESC,
    ${alias}.revision_id DESC
  `;
}

function parseTraceRow(row, pathFilter = '') {
  let event = {};
  try {
    event = JSON.parse(row.eventPayload || '{}');
  } catch {
    return null;
  }
  const payload = event && typeof event === 'object' ? event.payload : null;
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  if (pathFilter && payload.path !== pathFilter) {
    return null;
  }
  return {
    ...payload,
    eventId: event.eventId,
    timestamp: event.timestamp || row.timestamp,
    messageIndex: row.messageIndex,
    turnRef: row.turnRef || payload.turnRef || null,
  };
}

function loadTraceEvents({ conversationRef, turnRef = '', pathFilter = '', limit = 1000 }) {
  const tables = historyTableNames();
  const where = [
    `conversation_id = ${sqlString(conversationRef)}`,
    "event_type = 'trace_event'",
  ];
  if (turnRef) {
    where.push(`turn_ref = ${sqlString(turnRef)}`);
  }
  const rows = queryHistoryDatabase(`
    SELECT event_payload AS eventPayload,
           timestamp AS timestamp,
           message_index AS messageIndex,
           turn_ref AS turnRef
    FROM ${tables.events}
    WHERE ${where.join(' AND ')}
    ORDER BY message_index ASC, timestamp ASC
    LIMIT ${sqlLimit(limit, 1000)}
  `);
  return rows.map((row) => parseTraceRow(row, pathFilter)).filter(Boolean);
}

function printTraceEvents(events, emptyMessage) {
  if (events.length === 0) {
    console.log(emptyMessage);
    return;
  }
  for (const event of events) {
    const duration = typeof event.durationMs === 'number' ? ` ${event.durationMs}ms` : '';
    const turn = event.turnRef ? ` turn=${event.turnRef}` : '';
    const error = event.error?.message ? ` error="${event.error.message}"` : '';
    console.log(`${event.path} ${event.status}${duration} runtime=${event.runtime} stage=${event.stage}${turn}${error}`);
  }
}

const CAPABILITY_TRACE_PATHS = new Set([
  'capability_manifest.rebuild',
  'capability_manifest.persist',
  'capability_manifest.send',
  'client_capability_manifest.validate',
  'client_capability_manifest.apply',
  'client_capability_manifest.policy',
  'client_tool_manifest.validate',
  'client_tool_manifest.apply',
  'client_prompt_layers.validate',
  'client_prompt_layers.apply',
  'backend.prompt',
  'mcp.tool',
]);

function traceCapabilityRevision(event) {
  const data = event && typeof event.data === 'object' && event.data !== null ? event.data : {};
  const revision = data.capabilityRevision || data.revision;
  return typeof revision === 'string' && revision.trim() ? revision.trim() : null;
}

function traceDataNumber(data, key) {
  const value = data && typeof data === 'object' ? data[key] : undefined;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function summarizeCapabilityTrace(events) {
  const latestByPath = new Map();
  const revisions = [];
  const seenRevisions = new Set();
  for (const event of events) {
    latestByPath.set(event.path, event);
    const revision = traceCapabilityRevision(event);
    if (revision && !seenRevisions.has(revision)) {
      seenRevisions.add(revision);
      revisions.push(revision);
    }
  }

  const latest = Object.fromEntries(latestByPath.entries());
  const validate = latest['client_capability_manifest.validate'];
  const apply = latest['client_capability_manifest.apply'];
  const policy = latest['client_capability_manifest.policy'];
  const prompt = latest['backend.prompt'];
  const validateData = validate?.data || {};
  const applyData = apply?.data || {};
  const policyData = policy?.data || {};
  const promptData = prompt?.data || {};

  return {
    revision: revisions[revisions.length - 1] || null,
    revisions,
    rawToolCount: traceDataNumber(validateData, 'rawToolCount'),
    acceptedToolCount: traceDataNumber(validateData, 'acceptedToolCount'),
    rejectedToolCount: traceDataNumber(validateData, 'rejectedToolCount'),
    acceptedPromptLayerCount: traceDataNumber(validateData, 'acceptedPromptLayerCount'),
    rejectedPromptLayerCount: traceDataNumber(validateData, 'rejectedPromptLayerCount'),
    effectiveAvailableToolCount: traceDataNumber(applyData, 'effectiveAvailableToolCount'),
    policyAllowedCount: traceDataNumber(policyData, 'policyAllowedCount'),
    policyRejectedCount: traceDataNumber(policyData, 'policyRejectedCount'),
    finalToolSchemaCount: traceDataNumber(promptData, 'toolSchemaCount'),
    finalPromptLayerCount: traceDataNumber(promptData, 'finalPromptLayerCount'),
    sourceCounts: promptData.finalToolSourceCounts || validateData.sourceCounts || null,
    pathCounts: events.reduce((acc, event) => {
      acc[event.path] = (acc[event.path] || 0) + 1;
      return acc;
    }, {}),
  };
}

function loadCapabilityTrace({ conversationRef, turnRef = '', limit = 1000 }) {
  return loadTraceEvents({ conversationRef, turnRef, limit })
    .filter((event) => CAPABILITY_TRACE_PATHS.has(event.path));
}

function printCapabilityTrace(payload) {
  const events = payload.events || [];
  if (events.length === 0) {
    console.log(`No capability trace events found for ${payload.conversationRef}.`);
    return;
  }
  const summary = payload.summary || {};
  printSection('Capability Trace', [
    `conversation: ${payload.conversationRef}`,
    payload.turnRef ? `turn: ${payload.turnRef}` : null,
    `revision: ${summary.revision || 'unknown'}`,
    `raw tools: ${summary.rawToolCount ?? 'unknown'}`,
    `accepted tools: ${summary.acceptedToolCount ?? 'unknown'}`,
    `rejected tools: ${summary.rejectedToolCount ?? 'unknown'}`,
    `policy allowed: ${summary.policyAllowedCount ?? 'unknown'}`,
    `policy rejected: ${summary.policyRejectedCount ?? 'unknown'}`,
    `final schemas: ${summary.finalToolSchemaCount ?? 'unknown'}`,
    `prompt layers: ${summary.finalPromptLayerCount ?? 'unknown'}`,
    summary.sourceCounts ? `source counts: ${JSON.stringify(summary.sourceCounts)}` : null,
  ].filter(Boolean));
  printSection(
    'Capability Trace Events',
    events.map((event) => {
      const revision = traceCapabilityRevision(event);
      const turn = event.turnRef ? ` turn=${event.turnRef}` : '';
      const rev = revision ? ` revision=${revision}` : '';
      return `${event.timestamp} ${event.path} ${event.stage} ${event.status}${turn}${rev}`;
    }),
  );
}

function getFrontendDevUrl() {
  return process.env.WINDIE_FRONTEND_DEV_URL || 'http://localhost:5173/';
}

function getFrontendReadyTimeoutMs() {
  const raw = process.env.WINDIE_FRONTEND_READY_TIMEOUT_MS;
  if (!raw) {
    return 90000;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 90000;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForHttp(url, options = {}) {
  const timeoutMs = options.timeoutMs || 30000;
  const intervalMs = options.intervalMs || 250;
  const probeTimeoutMs = options.probeTimeoutMs || 1000;
  const isShuttingDown = options.isShuttingDown || (() => false);
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    if (isShuttingDown()) {
      throw new Error(`Stopped while waiting for ${url}`);
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, probeTimeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      await response.body?.cancel().catch(() => {});
      if (response.status < 500) {
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
    await sleep(intervalMs);
  }

  const detail = lastError ? `: ${lastError.message}` : '';
  throw new Error(`Timed out waiting for ${url}${detail}`);
}

function afterFrontendReady(item) {
  const url = getFrontendDevUrl();
  return {
    ...item,
    waitFor: ({ isShuttingDown } = {}) => waitForHttp(url, {
      isShuttingDown,
      timeoutMs: getFrontendReadyTimeoutMs(),
    }),
    waitMessage: `waiting for ${url}`,
  };
}

function frontendReadyPlan() {
  return {
    type: 'http',
    url: getFrontendDevUrl(),
    timeoutMs: getFrontendReadyTimeoutMs(),
  };
}

function printNoTrackedProcesses() {
  console.log('No tracked WindieOS background processes found.');
  console.log('Current `windie start ...` commands run in the foreground; use Ctrl-C in that terminal.');
}

function resolveFrontendLogFile(env = process.env) {
  return resolveLayerLogFile('frontend', env);
}

function normalizeWindieLogTarget(target) {
  const normalized = String(target || '').trim().toLowerCase();
  if (['frontend', 'vite', 'main', 'renderer', 'local-runtime', 'sidecar'].includes(normalized)) {
    return normalized;
  }
  throw new Error('Usage: <windie> logs backend|frontend|vite|main|renderer|local-runtime');
}

function resolveWindieLogFile(target, env = process.env, { verbose = false } = {}) {
  if (normalizeWindieLogTarget(target) === 'renderer' && verbose) {
    return resolveRendererVerboseLogFile(env);
  }
  return resolveLayerLogFile(normalizeWindieLogTarget(target), env);
}

function normalizeTailLines(value, fallback = '200') {
  const raw = value || fallback;
  if (!/^\d+$/.test(String(raw)) || Number(raw) < 1) {
    throw new Error('--tail must be a positive integer.');
  }
  return String(raw);
}

function ensureWindieLayerLogFile(target, logFile, { verbose = false } = {}) {
  const normalizedTarget = normalizeWindieLogTarget(target);
  let displayTarget = normalizedTarget;
  if (normalizedTarget === 'renderer' && verbose) {
    displayTarget = 'renderer verbose';
  } else if (normalizedTarget === 'sidecar') {
    displayTarget = 'local-runtime';
  }
  const windieCommand = process.platform === 'win32' ? 'bin\\windie.cmd' : 'bin/windie.sh';
  if (!logFile) {
    const envKey = normalizedTarget === 'renderer' && verbose
      ? resolveRendererVerboseLogEnvKey()
      : resolveLayerLogEnvKey(normalizedTarget);
    throw new Error(`${displayTarget} log capture is disabled by ${envKey}.`);
  }
  ensureLogFile(logFile, {
    logPrefix: '[WindieOS]',
    initialLines: [
      `[WindieOS] ${displayTarget} log file initialized.`,
      `Start a desktop run with: ${windieCommand} start dev`,
      '',
    ],
  });
}

function buildFrontendLogTailArgs(args, env = process.env) {
  return buildLayerLogTailArgs('frontend', args, env);
}

function buildLayerLogTailArgs(target, args, env = process.env) {
  const verbose = normalizeWindieLogTarget(target) === 'renderer' && hasFlag(args, '--verbose');
  const logFile = resolveWindieLogFile(target, env, { verbose });
  const tailLines = normalizeTailLines(optionValue(args, '--tail', '200'));
  const tailArgs = ['-n', tailLines];
  if (!hasFlag(args, '--no-follow')) {
    tailArgs.push('-F');
  }
  tailArgs.push(logFile);
  return { logFile, tailArgs };
}

function runStatus(args) {
  const all = hasFlag(args, '--all');
  const json = hasFlag(args, '--json');
  const status = collectStatus({ all });
  if (json) {
    printJson(status);
    return;
  }
  printCheckList(all ? 'WindieOS status --all' : 'WindieOS status', status.checks);
  if (all) {
    printSection('Endpoint', [
      `http: ${status.detail.endpoint.httpUrl}`,
      `ws:   ${status.detail.endpoint.wsUrl}`,
    ]);
  }
}

function runTrace(args) {
  const json = hasFlag(args, '--json');
  const pathFilter = optionValue(args, '--path', '');
  const positional = positionalArgs(args, ['--path']);
  const [conversationRef, turnRef] = positional;
  if (!conversationRef || !turnRef) {
    throw new Error('Usage: <windie> trace <conversation-ref> <turn-ref> [--path <path>] [--json]');
  }

  const payload = {
    ok: true,
    database: historyDatabasePath(),
    events: loadTraceEvents({ conversationRef, turnRef, pathFilter }),
  };
  if (json) {
    printJson(payload);
    return;
  }
  printTraceEvents(payload.events, `No trace events found for ${conversationRef} ${turnRef}.`);
}

function runCapability(args) {
  const subcommand = args[0];
  if (subcommand !== 'trace') {
    throw new Error('Usage: <windie> capability trace <conversation-ref> [--turn <turn-ref>] [--limit <n>] [--json]');
  }
  const rest = args.slice(1);
  const json = hasFlag(rest, '--json');
  const limit = sqlLimit(optionValue(rest, '--limit', '1000'), 1000);
  const turnRef = optionValue(rest, '--turn', '');
  const [conversationRef] = positionalArgs(rest, ['--turn', '--limit']);
  if (!conversationRef) {
    throw new Error('Usage: <windie> capability trace <conversation-ref> [--turn <turn-ref>] [--limit <n>] [--json]');
  }

  const events = loadCapabilityTrace({ conversationRef, turnRef, limit });
  const payload = {
    ok: true,
    database: historyDatabasePath(),
    conversationRef,
    turnRef: turnRef || null,
    summary: summarizeCapabilityTrace(events),
    events,
  };
  if (json) {
    printJson(payload);
    return;
  }
  printCapabilityTrace(payload);
}

function loadConversationList(args) {
  const tables = historyTableNames();
  const limit = sqlLimit(optionValue(args, '--limit', '25'), 25);
  return queryHistoryDatabase(`
    SELECT conversation_id AS conversationId,
           MIN(timestamp) AS createdAt,
           MAX(timestamp) AS updatedAt,
           COUNT(*) AS eventCount,
           COUNT(DISTINCT turn_ref) AS turnCount,
           SUM(CASE WHEN event_type = 'trace_event' THEN 1 ELSE 0 END) AS traceCount,
           MAX(workspace_name) AS workspaceName,
           MAX(workspace_path) AS workspacePath,
           (
             SELECT title
             FROM ${tables.titles}
             WHERE ${tables.titles}.conversation_id = ${tables.events}.conversation_id
             ORDER BY updated_at DESC
             LIMIT 1
           ) AS title
    FROM ${tables.events}
    WHERE conversation_id IS NOT NULL
    GROUP BY conversation_id
    ORDER BY updatedAt DESC
    LIMIT ${limit}
  `);
}

function loadConversationTurns(conversationRef) {
  const tables = historyTableNames();
  return queryHistoryDatabase(`
    SELECT turn_ref AS turnRef,
           MIN(timestamp) AS startedAt,
           MAX(timestamp) AS updatedAt,
           COUNT(*) AS eventCount,
           SUM(CASE WHEN event_type = 'trace_event' THEN 1 ELSE 0 END) AS traceCount,
           SUM(CASE WHEN event_type = 'tool_call' THEN 1 ELSE 0 END) AS toolCallCount,
           CASE
             WHEN SUM(CASE WHEN event_type = 'turn_error' THEN 1 ELSE 0 END) > 0 THEN 'failed'
             WHEN SUM(CASE WHEN event_type = 'turn_completed' THEN 1 ELSE 0 END) > 0 THEN 'completed'
             ELSE 'open'
           END AS status
    FROM ${tables.events}
    WHERE conversation_id = ${sqlString(conversationRef)}
      AND turn_ref IS NOT NULL
    GROUP BY turn_ref
    ORDER BY MIN(message_index) ASC, MIN(timestamp) ASC
  `);
}

function loadConversationEvents(args, conversationRef) {
  const tables = historyTableNames();
  const turnRef = optionValue(args, '--turn', '');
  const eventType = optionValue(args, '--type', '');
  const limit = sqlLimit(optionValue(args, '--limit', '200'), 200);
  const where = [`conversation_id = ${sqlString(conversationRef)}`];
  if (turnRef) {
    where.push(`turn_ref = ${sqlString(turnRef)}`);
  }
  if (eventType) {
    where.push(`event_type = ${sqlString(eventType)}`);
  }
  return queryHistoryDatabase(`
    SELECT id,
           user_id AS userId,
           conversation_id AS conversationId,
           event_type AS eventType,
           role,
           content,
           timestamp,
           message_index AS messageIndex,
           revision_id AS revisionId,
           turn_ref AS turnRef,
           tool_name AS toolName,
           correlation_id AS correlationId,
           workspace_path AS workspacePath,
           workspace_name AS workspaceName,
           producer,
           producer_event_id AS producerEventId,
           producer_sequence AS producerSequence,
           metadata,
           attachments,
           event_payload AS eventPayload,
           compaction_checkpoint AS compactionCheckpoint
    FROM ${tables.events}
    WHERE ${where.join(' AND ')}
    ORDER BY message_index ASC, timestamp ASC
    LIMIT ${limit}
  `);
}

function loadConversationMessages(args, conversationRef) {
  const tables = historyTableNames();
  const limit = sqlLimit(optionValue(args, '--limit', '200'), 200);
  if (historyObjectExists('conversation_display_messages')) {
    return queryHistoryDatabase(`
      SELECT event_id AS eventId,
             user_id AS userId,
             conversation_id AS conversationId,
             message_index AS messageIndex,
             timestamp,
             turn_ref AS turnRef,
             revision_id AS revisionId,
             display_role AS role,
             source_role AS sourceRole,
             event_type AS eventType,
             content,
             metadata,
             attachments
      FROM conversation_display_messages
      WHERE conversation_id = ${sqlString(conversationRef)}
      ORDER BY message_index ASC, timestamp ASC
      LIMIT ${limit}
    `);
  }
  const columns = historyObjectColumns(tables.events);
  const metadataSelect = columns.has('metadata') ? 'metadata' : "'{}' AS metadata";
  const attachmentsSelect = columns.has('attachments') ? 'attachments' : "'[]' AS attachments";
  return queryHistoryDatabase(`
    SELECT id AS eventId,
           user_id AS userId,
           conversation_id AS conversationId,
           message_index AS messageIndex,
           timestamp,
           turn_ref AS turnRef,
           revision_id AS revisionId,
           CASE
             WHEN event_type = 'turn_error' THEN 'error'
             WHEN role IS NOT NULL AND role != '' THEN role
             WHEN event_type = 'user_message' THEN 'user'
             WHEN event_type = 'assistant_message' THEN 'assistant'
             ELSE event_type
           END AS role,
           role AS sourceRole,
           event_type AS eventType,
           content,
           ${metadataSelect},
           ${attachmentsSelect}
    FROM ${tables.events}
    WHERE conversation_id = ${sqlString(conversationRef)}
      AND event_type IN ('user_message', 'assistant_message', 'turn_error')
      AND content IS NOT NULL
      AND content != ''
    ORDER BY message_index ASC, timestamp ASC
    LIMIT ${limit}
  `);
}

function loadConversationInspect(conversationRef) {
  const tables = historyTableNames();
  const overviewRows = queryHistoryDatabase(`
    SELECT conversation_id AS conversationId,
           MIN(timestamp) AS createdAt,
           MAX(timestamp) AS updatedAt,
           COUNT(*) AS eventCount,
           COUNT(DISTINCT turn_ref) AS turnCount,
           SUM(CASE WHEN event_type = 'trace_event' THEN 1 ELSE 0 END) AS traceCount,
           MAX(workspace_name) AS workspaceName,
           MAX(workspace_path) AS workspacePath
    FROM ${tables.events}
    WHERE conversation_id = ${sqlString(conversationRef)}
    GROUP BY conversation_id
  `);
  const eventTypeCounts = queryHistoryDatabase(`
    SELECT event_type AS eventType,
           COUNT(*) AS count
    FROM ${tables.events}
    WHERE conversation_id = ${sqlString(conversationRef)}
    GROUP BY event_type
    ORDER BY count DESC, event_type ASC
  `);
  const tracePathCounts = queryHistoryDatabase(`
    SELECT json_extract(event_payload, '$.payload.path') AS path,
           json_extract(event_payload, '$.payload.status') AS status,
           COUNT(*) AS count
    FROM ${tables.events}
    WHERE conversation_id = ${sqlString(conversationRef)}
      AND event_type = 'trace_event'
      AND json_valid(event_payload)
    GROUP BY path, status
    ORDER BY path ASC, status ASC
  `);
  const titles = queryHistoryDatabase(`
    SELECT title,
           source,
           is_locked AS isLocked,
           created_at AS createdAt,
           updated_at AS updatedAt
    FROM ${tables.titles}
    WHERE conversation_id = ${sqlString(conversationRef)}
    ORDER BY updated_at DESC
  `);
  const revisions = queryHistoryDatabase(`
    SELECT revision_id AS revisionId,
           updated_at AS updatedAt
    FROM ${tables.revisions}
    WHERE conversation_id = ${sqlString(conversationRef)}
    ORDER BY updated_at DESC
  `);
  return {
    ok: true,
    database: historyDatabasePath(),
    conversation: overviewRows[0] || null,
    titles,
    latestRevision: revisions[0] || null,
    turns: loadConversationTurns(conversationRef),
    eventTypeCounts,
    tracePathCounts,
  };
}

function loadSelectedConversationRevision(conversationRef, {
  requireDisplayTimeline = false,
  revisionId = null,
} = {}) {
  const tables = historyTableNames();
  if (!historyObjectExists(tables.revisions)) {
    return null;
  }
  const revisionClause = revisionId ? `AND revision_id = ${sqlString(revisionId)}` : '';
  const columns = historyObjectColumns(tables.revisions);
  const hasRevisionGraph = [
    'user_id',
    'parent_revision_id',
    'operation',
    'display_timeline_id',
    'model_history_checkpoint_id',
    'created_at',
    'active',
  ].every((column) => columns.has(column));
  if (!hasRevisionGraph || tables.revisions !== 'conversation_revisions') {
    const rows = queryHistoryDatabase(`
      SELECT revision_id AS revisionId,
             NULL AS parentRevisionId,
             NULL AS operation,
             revision_id AS displayTimelineId,
             NULL AS modelHistoryCheckpointId,
             updated_at AS createdAt,
             updated_at AS updatedAt,
             1 AS active,
             NULL AS userId
      FROM ${tables.revisions}
      WHERE conversation_id = ${sqlString(conversationRef)}
        ${revisionClause}
      ORDER BY updated_at DESC, revision_id DESC
      LIMIT 1
    `);
    return rows[0] || null;
  }
  const displayClause = requireDisplayTimeline ? 'AND r.display_timeline_id IS NOT NULL' : '';
  const graphRevisionClause = revisionId ? `AND r.revision_id = ${sqlString(revisionId)}` : '';
  const rows = queryHistoryDatabase(`
    SELECT r.user_id AS userId,
           r.revision_id AS revisionId,
           r.parent_revision_id AS parentRevisionId,
           r.operation,
           r.display_timeline_id AS displayTimelineId,
           r.model_history_checkpoint_id AS modelHistoryCheckpointId,
           r.created_at AS createdAt,
           r.updated_at AS updatedAt,
           r.active AS active
    FROM ${tables.revisions} r
    WHERE r.conversation_id = ${sqlString(conversationRef)}
      ${displayClause}
      ${graphRevisionClause}
    ORDER BY ${revisionBranchOrderExpression('r')}
    LIMIT 1
  `);
  return rows[0] || null;
}

function loadActiveRevisionRows(conversationRef) {
  const tables = historyTableNames();
  if (!historyObjectExists(tables.revisions)) {
    return [];
  }
  const columns = historyObjectColumns(tables.revisions);
  const hasRevisionGraph = [
    'user_id',
    'parent_revision_id',
    'operation',
    'display_timeline_id',
    'model_history_checkpoint_id',
    'created_at',
    'active',
  ].every((column) => columns.has(column));
  if (!hasRevisionGraph) {
    return [];
  }
  return queryHistoryDatabase(`
    SELECT user_id AS userId,
           revision_id AS revisionId,
           parent_revision_id AS parentRevisionId,
           operation,
           display_timeline_id AS displayTimelineId,
           model_history_checkpoint_id AS modelHistoryCheckpointId,
           created_at AS createdAt,
           updated_at AS updatedAt,
           active AS active
    FROM ${tables.revisions}
    WHERE conversation_id = ${sqlString(conversationRef)}
      AND active = 1
    ORDER BY updated_at DESC, revision_id DESC
  `);
}

function displayReasonFromRevisionOperation(operation) {
  if (operation === 'edit') {
    return 'user_edit';
  }
  if (['retry', 'fork', 'manual_rewrite'].includes(operation)) {
    return operation;
  }
  return null;
}

function loadDisplayTimelineState(conversationRef, selectedRevision) {
  const tables = historyTableNames();
  const displayRevision = selectedRevision?.displayTimelineId || null;
  if (!displayRevision) {
    return {
      revisionId: null,
      rowCount: 0,
      reason: null,
      baseRevisionId: null,
      createdAt: null,
      source: 'missing',
    };
  }
  if (!historyObjectExists(tables.displayTimeline)) {
    return {
      revisionId: displayRevision,
      rowCount: 0,
      reason: displayReasonFromRevisionOperation(selectedRevision?.operation),
      baseRevisionId: selectedRevision?.parentRevisionId || null,
      createdAt: selectedRevision?.createdAt || null,
      source: 'revision_graph',
    };
  }
  const rows = queryHistoryDatabase(`
    SELECT revision_id AS revisionId,
           COUNT(*) AS rowCount,
           MIN(created_at) AS createdAt,
           MAX(reason) AS reason,
           MAX(base_revision_id) AS baseRevisionId
    FROM ${tables.displayTimeline}
    WHERE conversation_id = ${sqlString(conversationRef)}
      AND revision_id = ${sqlString(displayRevision)}
    GROUP BY revision_id
  `);
  const row = rows[0] || null;
  return {
    revisionId: displayRevision,
    rowCount: Number(row?.rowCount || 0),
    reason: row?.reason || displayReasonFromRevisionOperation(selectedRevision?.operation),
    baseRevisionId: row?.baseRevisionId || selectedRevision?.parentRevisionId || null,
    createdAt: row?.createdAt || selectedRevision?.createdAt || null,
    source: row ? 'row_storage' : 'revision_graph',
  };
}

function loadModelHistoryState(conversationRef, selectedRevision) {
  const tables = historyTableNames();
  const checkpointId = selectedRevision?.modelHistoryCheckpointId || null;
  if (!checkpointId) {
    return {
      checkpointId: null,
      revisionId: selectedRevision?.revisionId || null,
      rowCount: 0,
      createdAt: null,
      source: 'missing',
    };
  }
  if (!historyObjectExists(tables.modelHistory)) {
    return {
      checkpointId,
      revisionId: selectedRevision?.revisionId || null,
      rowCount: 0,
      createdAt: null,
      source: 'revision_graph',
    };
  }
  const rows = queryHistoryDatabase(`
    SELECT checkpoint_id AS checkpointId,
           revision_id AS revisionId,
           COUNT(*) AS rowCount,
           MIN(created_at) AS createdAt
    FROM ${tables.modelHistory}
    WHERE conversation_id = ${sqlString(conversationRef)}
      AND checkpoint_id = ${sqlString(checkpointId)}
    GROUP BY checkpoint_id, revision_id
  `);
  const row = rows[0] || null;
  return {
    checkpointId,
    revisionId: row?.revisionId || selectedRevision?.revisionId || null,
    rowCount: Number(row?.rowCount || 0),
    createdAt: row?.createdAt || null,
    source: row ? 'row_storage' : 'revision_graph',
  };
}

function loadRawEventState(conversationRef, { revisionId = null } = {}) {
  const tables = historyTableNames();
  const revisionClause = revisionId ? `AND revision_id = ${sqlString(revisionId)}` : '';
  const rows = queryHistoryDatabase(`
    SELECT COUNT(*) AS eventCount,
           COUNT(DISTINCT turn_ref) AS turnCount,
           SUM(CASE WHEN event_type = 'trace_event' THEN 1 ELSE 0 END) AS traceCount,
           SUM(CASE WHEN event_type = 'user_message' THEN 1 ELSE 0 END) AS userMessageCount,
           SUM(CASE WHEN event_type = 'assistant_message' THEN 1 ELSE 0 END) AS assistantMessageCount,
           SUM(CASE WHEN event_type IN ('tool_output', 'tool_bundle_output') THEN 1 ELSE 0 END) AS toolOutputCount,
           MIN(timestamp) AS createdAt,
           MAX(timestamp) AS updatedAt
    FROM ${tables.events}
    WHERE conversation_id = ${sqlString(conversationRef)}
      ${revisionClause}
  `);
  const row = rows[0] || {};
  return {
    eventCount: Number(row.eventCount || 0),
    turnCount: Number(row.turnCount || 0),
    traceCount: Number(row.traceCount || 0),
    userMessageCount: Number(row.userMessageCount || 0),
    assistantMessageCount: Number(row.assistantMessageCount || 0),
    toolOutputCount: Number(row.toolOutputCount || 0),
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
  };
}

function parseEventPayload(value) {
  if (!value || typeof value !== 'string') {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function eventPayloadObject(row) {
  const envelope = parseEventPayload(row.eventPayload);
  const payload = envelope.payload && typeof envelope.payload === 'object' && !Array.isArray(envelope.payload)
    ? envelope.payload
    : envelope;
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
}

function normalizedTurnRef(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function loadSupersededLiveState(conversationRef, { revisionId = null } = {}) {
  const tables = historyTableNames();
  const revisionClause = revisionId ? `AND revision_id = ${sqlString(revisionId)}` : '';
  const rows = queryHistoryDatabase(`
    SELECT event_type AS eventType,
           revision_id AS revisionId,
           turn_ref AS turnRef,
           timestamp,
           message_index AS messageIndex,
           event_payload AS eventPayload
    FROM ${tables.events}
    WHERE conversation_id = ${sqlString(conversationRef)}
      ${revisionClause}
    ORDER BY message_index ASC, timestamp ASC, id ASC
  `);
  const supersededTurns = new Map();
  const terminalTurns = new Set();
  let activeTurnRef = null;
  let activePhase = 'idle';
  for (const row of rows) {
    const turnRef = normalizedTurnRef(row.turnRef);
    if (row.eventType === 'turn_superseded') {
      const payload = eventPayloadObject(row);
      const supersededTurnRef = turnRef;
      const replacementTurnRef = normalizedTurnRef(payload.replacementTurnRef);
      if (supersededTurnRef) {
        supersededTurns.set(supersededTurnRef, {
          supersededTurnRef,
          replacementTurnRef,
          revisionId: row.revisionId || null,
          reason: typeof payload.reason === 'string' ? payload.reason : null,
          createdAt: typeof payload.createdAt === 'string' ? payload.createdAt : row.timestamp,
        });
        if (activeTurnRef === supersededTurnRef) {
          activeTurnRef = null;
          activePhase = 'complete';
        }
      }
      continue;
    }
    if (turnRef && supersededTurns.has(turnRef)) {
      if (['turn_completed', 'turn_stopped', 'turn_error', 'runtime_error'].includes(row.eventType)) {
        terminalTurns.add(turnRef);
      }
      continue;
    }
    if (row.eventType === 'turn_started' || row.eventType === 'user_message') {
      activeTurnRef = turnRef;
      activePhase = turnRef ? 'awaiting' : activePhase;
      continue;
    }
    if (!turnRef || (activeTurnRef && activeTurnRef !== turnRef)) {
      continue;
    }
    if (!activeTurnRef) {
      activeTurnRef = turnRef;
    }
    if (row.eventType === 'assistant_delta') {
      activePhase = 'streaming';
    } else if (row.eventType === 'tool_call' || row.eventType === 'tool_bundle_call') {
      activePhase = 'tool_call';
    } else if (row.eventType === 'tool_output' || row.eventType === 'tool_bundle_output') {
      activePhase = 'tool_output';
    } else if (row.eventType === 'turn_completed' || row.eventType === 'turn_stopped') {
      activePhase = 'complete';
      terminalTurns.add(turnRef);
    } else if (row.eventType === 'turn_error' || row.eventType === 'runtime_error') {
      activePhase = 'error';
      terminalTurns.add(turnRef);
    }
  }
  const records = Array.from(supersededTurns.values());
  const latest = records[records.length - 1] || null;
  const supersededWithoutTerminalCompletion = records
    .filter(record => !terminalTurns.has(record.supersededTurnRef))
    .map(record => record.supersededTurnRef);
  return {
    activeTurnRef,
    activePhase,
    supersededTurnCount: records.length,
    latestSupersededTurnPair: latest ? {
      supersededTurnRef: latest.supersededTurnRef,
      replacementTurnRef: latest.replacementTurnRef,
      revisionId: latest.revisionId,
      reason: latest.reason,
      createdAt: latest.createdAt,
    } : null,
    visibleTypingTurnSuperseded: Boolean(activeTurnRef && activePhase === 'awaiting' && supersededTurns.has(activeTurnRef)),
    supersededWithoutTerminalCompletion,
    supersededWithoutTerminalCompletionCount: supersededWithoutTerminalCompletion.length,
  };
}

function loadConversationState(conversationRef, {
  revisionId = null,
  scopeEventsToSelectedRevision = false,
} = {}) {
  const selectedRevision = loadSelectedConversationRevision(conversationRef, { revisionId });
  const selectedDisplayRevision = selectedRevision?.displayTimelineId
    ? selectedRevision
    : loadSelectedConversationRevision(conversationRef, { requireDisplayTimeline: true, revisionId });
  const selectedRevisionId = selectedRevision?.revisionId || revisionId || null;
  const eventRevisionId = revisionId || (scopeEventsToSelectedRevision ? selectedRevisionId : null);
  const activeRevisions = loadActiveRevisionRows(conversationRef);
  const activeRevisionIds = new Set(activeRevisions.map((row) => row.revisionId));
  const staleParentActive = Boolean(
    selectedRevision
    && !Boolean(Number(selectedRevision.active))
    && selectedRevision.parentRevisionId
    && activeRevisionIds.has(selectedRevision.parentRevisionId),
  );
  const displayTimeline = loadDisplayTimelineState(
    conversationRef,
    selectedDisplayRevision || selectedRevision,
  );
  const modelHistory = loadModelHistoryState(conversationRef, selectedRevision);
  const rawEvents = loadRawEventState(conversationRef, { revisionId: eventRevisionId });
  const supersededLive = loadSupersededLiveState(conversationRef, { revisionId: eventRevisionId });
  return {
    ok: true,
    database: historyDatabasePath(),
    conversationRef,
    selectedRevision: selectedRevision ? {
      revisionId: selectedRevision.revisionId,
      parentRevisionId: selectedRevision.parentRevisionId || null,
      operation: selectedRevision.operation || null,
      displayTimelineId: selectedRevision.displayTimelineId || null,
      modelHistoryCheckpointId: selectedRevision.modelHistoryCheckpointId || null,
      active: Boolean(Number(selectedRevision.active)),
      createdAt: selectedRevision.createdAt || null,
      updatedAt: selectedRevision.updatedAt || null,
      userId: selectedRevision.userId || null,
    } : null,
    activeRevisions: activeRevisions.map((row) => ({
      revisionId: row.revisionId,
      parentRevisionId: row.parentRevisionId || null,
      operation: row.operation || null,
      updatedAt: row.updatedAt || null,
    })),
    displayTimeline,
    modelHistory,
    rawEvents,
    supersededLive,
    diagnostics: {
      staleParentActive,
      displayTimelineMissing: !displayTimeline.revisionId,
      modelHistoryMissing: !modelHistory.checkpointId,
      rawEventFallbackRequired: !displayTimeline.revisionId,
      visibleTypingTurnSuperseded: supersededLive.visibleTypingTurnSuperseded,
      supersededWithoutTerminalCompletion: supersededLive.supersededWithoutTerminalCompletionCount > 0,
    },
  };
}

function conversationViewLivePhase(phase) {
  if (phase === 'tool_call' || phase === 'tool_output') {
    return 'tool';
  }
  if (['idle', 'awaiting', 'streaming', 'complete', 'error'].includes(phase)) {
    return phase;
  }
  return 'idle';
}

function conversationViewOverlayMode(phase) {
  if (phase === 'awaiting') {
    return 'typing';
  }
  if (phase === 'streaming' || phase === 'tool_call' || phase === 'tool_output') {
    return 'response';
  }
  return 'hidden';
}

function eventEnvelopeObject(row) {
  const parsed = parseEventPayload(row.eventPayload);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

function eventRefFromRow(row) {
  const envelope = eventEnvelopeObject(row);
  return typeof envelope.eventId === 'string' && envelope.eventId.trim()
    ? envelope.eventId.trim()
    : row.id || null;
}

function eventSourceFromRow(row) {
  const envelope = eventEnvelopeObject(row);
  return (
    row.producer
    || (typeof envelope.source === 'string' ? envelope.source : null)
    || null
  );
}

function loadConversationViewEventRefs(conversationRef, { revisionId = null } = {}) {
  const tables = historyTableNames();
  const revisionClause = revisionId ? `AND revision_id = ${sqlString(revisionId)}` : '';
  const rows = queryHistoryDatabase(`
    SELECT id,
           event_type AS eventType,
           producer,
           event_payload AS eventPayload,
           message_index AS messageIndex,
           timestamp
    FROM ${tables.events}
    WHERE conversation_id = ${sqlString(conversationRef)}
      ${revisionClause}
    ORDER BY message_index DESC, timestamp DESC, id DESC
    LIMIT 1000
  `);
  const lastEvent = rows[0] || null;
  const lastSdkEvent = rows.find(row => eventSourceFromRow(row) === 'sdk') || null;
  const lastBackendEvent = rows.find(row => eventSourceFromRow(row) === 'backend') || null;
  return {
    lastEventRef: lastEvent ? eventRefFromRow(lastEvent) : null,
    lastSdkEventRef: lastSdkEvent ? eventRefFromRow(lastSdkEvent) : null,
    lastBackendEventRef: lastBackendEvent ? eventRefFromRow(lastBackendEvent) : null,
  };
}

function loadFilteredInternalLaneCount() {
  const tables = historyTableNames();
  if (!historyObjectExists(tables.events)) {
    return 0;
  }
  const rows = queryHistoryDatabase(`
    SELECT COUNT(*) AS count
    FROM ${tables.events}
    WHERE conversation_id LIKE 'conv-agent-%'
  `);
  return Number(rows[0]?.count || 0);
}

function loadConversationView(conversationRef, { revisionId = null } = {}) {
  const state = loadConversationState(conversationRef, {
    revisionId,
    scopeEventsToSelectedRevision: true,
  });
  const activeRevisionId = state.selectedRevision?.revisionId || state.displayTimeline.revisionId || revisionId || null;
  const activePhase = state.supersededLive.activePhase || 'idle';
  const liveTurnPhase = conversationViewLivePhase(activePhase);
  const responseOverlayMode = conversationViewOverlayMode(activePhase);
  const isBusy = ['awaiting', 'streaming', 'tool'].includes(liveTurnPhase);
  const eventRefs = loadConversationViewEventRefs(conversationRef, { revisionId: activeRevisionId });
  return {
    ok: true,
    database: state.database,
    conversationRef,
    activeRevisionId,
    displayRowCount: state.displayTimeline.rowCount,
    liveTurnRef: state.supersededLive.activeTurnRef || null,
    liveTurnPhase,
    responseOverlayMode,
    responseOverlayGuardRef: responseOverlayMode === 'hidden' ? null : state.supersededLive.activeTurnRef || null,
    pendingTurnRef: isBusy ? state.supersededLive.activeTurnRef || null : null,
    supersededTurnCount: state.supersededLive.supersededTurnCount,
    filteredInternalLaneCount: loadFilteredInternalLaneCount(),
    modelHistoryCheckpointId: state.modelHistory.checkpointId || null,
    lastEventRef: eventRefs.lastEventRef,
    lastSdkEventRef: eventRefs.lastSdkEventRef,
    lastBackendEventRef: eventRefs.lastBackendEventRef,
  };
}

function printConversationRows(rows) {
  if (rows.length === 0) {
    console.log('No conversations found.');
    return;
  }
  for (const row of rows) {
    const title = row.title ? ` title="${row.title}"` : '';
    console.log(
      `${row.conversationId} events=${row.eventCount} turns=${row.turnCount} traces=${row.traceCount} updated=${row.updatedAt}${title}`,
    );
  }
}

function printTurnRows(rows) {
  if (rows.length === 0) {
    console.log('No turns found.');
    return;
  }
  for (const row of rows) {
    console.log(
      `${row.turnRef} ${row.status} events=${row.eventCount} traces=${row.traceCount} tools=${row.toolCallCount} started=${row.startedAt} updated=${row.updatedAt}`,
    );
  }
}

function summarizeEvent(row) {
  const summary = row.content || row.eventPayload || '';
  const normalized = String(summary).replace(/\s+/g, ' ').trim();
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

function printEventRows(rows) {
  if (rows.length === 0) {
    console.log('No conversation events found.');
    return;
  }
  for (const row of rows) {
    const turn = row.turnRef ? ` turn=${row.turnRef}` : '';
    const role = row.role ? ` role=${row.role}` : '';
    console.log(`#${row.messageIndex} ${row.eventType}${role}${turn} ${row.timestamp} ${summarizeEvent(row)}`);
  }
}

function printMessageRows(rows) {
  if (rows.length === 0) {
    console.log('No conversation messages found.');
    return;
  }
  for (const row of rows) {
    console.log(`#${row.messageIndex} ${row.role} ${row.timestamp} ${summarizeEvent(row)}`);
  }
}

function printConversationInspect(payload) {
  if (!payload.conversation) {
    console.log('Conversation not found.');
    return;
  }
  const conversation = payload.conversation;
  printSection('Conversation', [
    `id: ${conversation.conversationId}`,
    `created: ${conversation.createdAt}`,
    `updated: ${conversation.updatedAt}`,
    `events: ${conversation.eventCount}`,
    `turns: ${conversation.turnCount}`,
    `traces: ${conversation.traceCount}`,
  ]);
  if (payload.titles.length > 0) {
    const title = payload.titles[0];
    printSection('Title', [
      `title: ${title.title}`,
      `source: ${title.source}`,
      `locked: ${Boolean(title.isLocked)}`,
      `updated: ${title.updatedAt}`,
    ]);
  }
  if (payload.latestRevision) {
    printSection('Revision', [
      `revision: ${payload.latestRevision.revisionId}`,
      `updated: ${payload.latestRevision.updatedAt}`,
    ]);
  }
  printSection(
    'Event Types',
    payload.eventTypeCounts.map((row) => `${row.eventType}: ${row.count}`),
  );
  if (payload.tracePathCounts.length > 0) {
    printSection(
      'Trace Paths',
      payload.tracePathCounts.map((row) => `${row.path} ${row.status}: ${row.count}`),
    );
  }
}

function printConversationState(payload) {
  console.log(`database: ${payload.database}`);
  printSection('Conversation State', [
    `id: ${payload.conversationRef}`,
    `selected revision: ${payload.selectedRevision?.revisionId || 'none'}`,
    `parent revision: ${payload.selectedRevision?.parentRevisionId || 'none'}`,
    `operation: ${payload.selectedRevision?.operation || 'none'}`,
    `selected active flag: ${payload.selectedRevision ? payload.selectedRevision.active : false}`,
  ]);
  printSection('Display Timeline', [
    `revision: ${payload.displayTimeline.revisionId || 'none'}`,
    `rows: ${payload.displayTimeline.rowCount}`,
    `reason: ${payload.displayTimeline.reason || 'none'}`,
    `base revision: ${payload.displayTimeline.baseRevisionId || 'none'}`,
    `source: ${payload.displayTimeline.source}`,
  ]);
  printSection('Model History', [
    `checkpoint: ${payload.modelHistory.checkpointId || 'none'}`,
    `revision: ${payload.modelHistory.revisionId || 'none'}`,
    `rows: ${payload.modelHistory.rowCount}`,
    `source: ${payload.modelHistory.source}`,
  ]);
  printSection('Raw Events', [
    `events: ${payload.rawEvents.eventCount}`,
    `turns: ${payload.rawEvents.turnCount}`,
    `traces: ${payload.rawEvents.traceCount}`,
    `user messages: ${payload.rawEvents.userMessageCount}`,
    `assistant messages: ${payload.rawEvents.assistantMessageCount}`,
    `tool outputs: ${payload.rawEvents.toolOutputCount}`,
  ]);
  printSection('Superseded Live Turns', [
    `active turn: ${payload.supersededLive.activeTurnRef || 'none'}`,
    `active phase: ${payload.supersededLive.activePhase}`,
    `superseded turns: ${payload.supersededLive.supersededTurnCount}`,
    `latest pair: ${payload.supersededLive.latestSupersededTurnPair
      ? `${payload.supersededLive.latestSupersededTurnPair.supersededTurnRef}->${payload.supersededLive.latestSupersededTurnPair.replacementTurnRef || 'none'}`
      : 'none'}`,
    `visible typing turn superseded: ${payload.supersededLive.visibleTypingTurnSuperseded}`,
    `superseded without terminal completion: ${payload.supersededLive.supersededWithoutTerminalCompletionCount}`,
  ]);
  printSection('Diagnostics', [
    `stale parent active: ${payload.diagnostics.staleParentActive}`,
    `display timeline missing: ${payload.diagnostics.displayTimelineMissing}`,
    `model history missing: ${payload.diagnostics.modelHistoryMissing}`,
    `raw event fallback required: ${payload.diagnostics.rawEventFallbackRequired}`,
    `visible typing turn superseded: ${payload.diagnostics.visibleTypingTurnSuperseded}`,
    `superseded without terminal completion: ${payload.diagnostics.supersededWithoutTerminalCompletion}`,
  ]);
  if (payload.activeRevisions.length > 0) {
    printSection(
      'Active Revision Rows',
      payload.activeRevisions.map((row) => (
        `${row.revisionId} parent=${row.parentRevisionId || 'none'} operation=${row.operation || 'none'} updated=${row.updatedAt || 'unknown'}`
      )),
    );
  }
}

function printConversationView(payload) {
  console.log(`database: ${payload.database}`);
  printSection('Conversation View', [
    `id: ${payload.conversationRef}`,
    `active revision: ${payload.activeRevisionId || 'none'}`,
    `display rows: ${payload.displayRowCount}`,
    `live turn: ${payload.liveTurnRef || 'none'}`,
    `live phase: ${payload.liveTurnPhase}`,
    `response overlay: ${payload.responseOverlayMode}`,
    `response overlay guard: ${payload.responseOverlayGuardRef || 'none'}`,
    `pending turn: ${payload.pendingTurnRef || 'none'}`,
    `superseded turns: ${payload.supersededTurnCount}`,
    `filtered internal lanes: ${payload.filteredInternalLaneCount}`,
    `model-history checkpoint: ${payload.modelHistoryCheckpointId || 'none'}`,
    `last event: ${payload.lastEventRef || 'none'}`,
    `last sdk event: ${payload.lastSdkEventRef || 'none'}`,
    `last backend event: ${payload.lastBackendEventRef || 'none'}`,
  ]);
}

function printDiagnosticEvents(events, emptyMessage) {
  if (events.length === 0) {
    console.log(emptyMessage);
    return;
  }
  for (const event of events) {
    const request = event.requestId ? ` request=${event.requestId}` : '';
    const duration = Number.isFinite(event.durationMs) ? ` duration=${event.durationMs}ms` : '';
    const error = event.error?.code ? ` error=${event.error.code}` : '';
    console.log(
      `${event.timestamp} ${event.traceId} ${event.runtime} ${event.path} ${event.stage} ${event.status}${request}${duration}${error}`,
    );
  }
}

function printDiagnosticPathDefinitions(paths) {
  if (paths.length === 0) {
    console.log('No diagnostic paths are registered.');
    return;
  }
  for (const pathDefinition of paths) {
    console.log(`${pathDefinition.path}`);
    console.log(`  owner: ${pathDefinition.owner}`);
    console.log(`  purpose: ${pathDefinition.purpose}`);
  }
}

function runDiagnostics(args) {
  const subcommand = args[0];
  const rest = args.slice(1);
  const json = hasFlag(rest, '--json');
  if (subcommand === 'paths') {
    const paths = listDiagnosticPathDefinitions();
    if (json) {
      printJson({
        ok: true,
        database: diagnosticsDatabasePath(),
        paths,
      });
      return;
    }
    console.log(`database: ${diagnosticsDatabasePath()}`);
    printDiagnosticPathDefinitions(paths);
    return;
  }
  if (subcommand === 'list') {
    const pathFilter = optionValue(rest, '--path', APP_DIAGNOSTICS_PATH);
    const limit = sqlLimit(optionValue(rest, '--limit', '50'), 50);
    const events = queryDiagnosticEvents({ pathFilter, limit });
    if (json) {
      printJson({
        ok: true,
        database: diagnosticsDatabasePath(),
        events,
      });
      return;
    }
    console.log(`database: ${diagnosticsDatabasePath()}`);
    printDiagnosticEvents(events, `No diagnostics found for ${pathFilter || 'all paths'}.`);
    return;
  }
  if (subcommand === 'inspect') {
    const [traceId] = positionalArgs(rest);
    if (!traceId) {
      throw new Error('Usage: <windie> diagnostics inspect <trace-id> [--json]');
    }
    const events = inspectDiagnosticTrace(traceId);
    if (json) {
      printJson({
        ok: true,
        database: diagnosticsDatabasePath(),
        traceId,
        events,
      });
      return;
    }
    console.log(`database: ${diagnosticsDatabasePath()}`);
    printDiagnosticEvents(events, `No diagnostics found for trace ${traceId}.`);
    return;
  }
  throw new Error('Usage: <windie> diagnostics paths [--json] | list [--path <path>] [--limit <n>] [--json] | inspect <trace-id> [--json]');
}

function runConversation(args) {
  const subcommand = args[0];
  const rest = args.slice(1);
  const json = hasFlag(rest, '--json');
  if (subcommand === 'list') {
    const conversations = loadConversationList(rest);
    if (json) {
      printJson({ ok: true, database: historyDatabasePath(), conversations });
      return;
    }
    printConversationRows(conversations);
    return;
  }

  const [conversationRef] = positionalArgs(rest, ['--turn', '--type', '--path', '--limit', '--revision']);
  const revisionId = optionValue(rest, '--revision', null);
  if (!conversationRef) {
    throw new Error('Usage: <windie> conversation list|inspect|state|view|messages|events|turns|traces <conversation-ref>');
  }

  if (subcommand === 'inspect') {
    const payload = loadConversationInspect(conversationRef);
    if (json) {
      printJson(payload);
      return;
    }
    printConversationInspect(payload);
    return;
  }

  if (subcommand === 'state') {
    const payload = loadConversationState(conversationRef, { revisionId });
    if (json) {
      printJson(payload);
      return;
    }
    printConversationState(payload);
    return;
  }

  if (subcommand === 'view') {
    const payload = loadConversationView(conversationRef, { revisionId });
    if (json) {
      printJson(payload);
      return;
    }
    printConversationView(payload);
    return;
  }

  if (subcommand === 'events') {
    const events = loadConversationEvents(rest, conversationRef);
    if (json) {
      printJson({ ok: true, database: historyDatabasePath(), events });
      return;
    }
    printEventRows(events);
    return;
  }

  if (subcommand === 'messages') {
    const messages = loadConversationMessages(rest, conversationRef);
    if (json) {
      printJson({ ok: true, database: historyDatabasePath(), messages });
      return;
    }
    printMessageRows(messages);
    return;
  }

  if (subcommand === 'turns') {
    const turns = loadConversationTurns(conversationRef);
    if (json) {
      printJson({ ok: true, database: historyDatabasePath(), turns });
      return;
    }
    printTurnRows(turns);
    return;
  }

  if (subcommand === 'traces') {
    const turnRef = optionValue(rest, '--turn', '');
    const pathFilter = optionValue(rest, '--path', '');
    const limit = sqlLimit(optionValue(rest, '--limit', '1000'), 1000);
    const events = loadTraceEvents({ conversationRef, turnRef, pathFilter, limit });
    if (json) {
      printJson({ ok: true, database: historyDatabasePath(), events });
      return;
    }
    printTraceEvents(events, `No trace events found for ${conversationRef}.`);
    return;
  }

  throw new Error('Usage: <windie> conversation list|inspect|state|view|messages|events|turns|traces <conversation-ref>');
}

function portOpen(host, port, timeoutMs = 750) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function runDoctor(args) {
  const json = hasFlag(args, '--json');
  const deep = hasFlag(args, '--deep');
  const fix = hasFlag(args, '--fix');
  const status = collectStatus({ all: true });
  const diagnostics = [...status.checks];

  if (fix) {
    diagnostics.push({
      name: 'safe repairs',
      ok: true,
      detail: 'no automatic repairs are currently needed',
    });
  }

  if (deep) {
    const backendPortOpen = await portOpen('127.0.0.1', 8765);
    diagnostics.push({
      name: 'backend port',
      ok: backendPortOpen,
      detail: backendPortOpen ? '127.0.0.1:8765 is accepting connections' : '127.0.0.1:8765 is closed',
    });
    const localRuntimeImport = capture(
      script(process.platform === 'win32' ? 'scripts/python-in-env.cmd' : 'scripts/python-in-env.sh'),
      [
        'local-runtime',
        'python',
        '-c',
        'import sys; sys.path.insert(0, "frontend/src/main/python"); import local_backend; print("ok")',
      ],
      { cwd: REPO_ROOT },
    );
    diagnostics.push({
      name: 'local-runtime import',
      ok: localRuntimeImport.ok,
      detail: localRuntimeImport.ok
        ? 'local-runtime service imports'
        : localRuntimeImport.stderr || localRuntimeImport.error,
    });
  }

  const result = {
    ok: diagnostics.every((item) => item.ok),
    fix,
    deep,
    checks: diagnostics,
    endpoint: getEndpointSnapshot(),
  };
  if (json) {
    printJson(result);
    return;
  }
  printCheckList(deep ? 'WindieOS doctor --deep' : 'WindieOS doctor', diagnostics);
}

function runStart(target) {
  const scriptedProviderEnv = {
    ...process.env,
    WINDIE_ENABLE_SCRIPTED_PROVIDER: '1',
  };
  if (target === 'backend') {
    return runForeground(script('scripts/run-backend.sh'), [], { cwd: REPO_ROOT });
  }
  ensureStartNodeDependencies(target);
  if (target === 'frontend') {
    return runConcurrent([
      { label: 'frontend', command: script('scripts/run-frontend-dev.sh'), cwd: REPO_ROOT, logLayer: 'vite' },
    ]).then((code) => process.exit(code));
  }
  if (target === 'desktop') {
    return runForeground(script('scripts/run-frontend-electron.sh'), [], { cwd: REPO_ROOT });
  }
  if (target === 'dev') {
    return runConcurrent([
      { label: 'frontend', command: script('scripts/run-frontend-dev.sh'), cwd: REPO_ROOT, logLayer: 'vite', env: scriptedProviderEnv },
      afterFrontendReady({
        label: 'desktop',
        command: script('scripts/run-frontend-electron.sh'),
        cwd: REPO_ROOT,
        env: scriptedProviderEnv,
      }),
    ]).then((code) => process.exit(code));
  }
  if (target === 'customer') {
    return runConcurrent([
      { label: 'frontend', command: script('scripts/run-frontend-dev.sh'), cwd: REPO_ROOT, logLayer: 'vite' },
      afterFrontendReady({
        label: 'customer',
        command: script('scripts/run-frontend-customer.sh'),
        cwd: REPO_ROOT,
      }),
    ]).then((code) => process.exit(code));
  }
  if (target === 'all') {
    return runConcurrent([
      { label: 'backend', command: script('scripts/run-backend.sh'), cwd: REPO_ROOT },
      { label: 'frontend', command: script('scripts/run-frontend-dev.sh'), cwd: REPO_ROOT, logLayer: 'vite' },
      { label: 'desktop', command: script('scripts/run-frontend-electron.sh'), cwd: REPO_ROOT },
    ]).then((code) => process.exit(code));
  }
  throw new Error('Usage: <windie> start backend|frontend|desktop|dev|customer|all');
}

function collectMissingStartNodeInstallTargets(target, options = {}) {
  const frontendNodeModulesDir = options.frontendNodeModulesDir || FRONTEND_NODE_MODULES_DIR;
  const sdkWsModuleDir = options.sdkWsModuleDir || SDK_WS_MODULE_DIR;
  const frontendDir = options.frontendDir || FRONTEND_DIR;
  const sdkJsDir = options.sdkJsDir || SDK_JS_DIR;
  const needsFrontend = ['frontend', 'desktop', 'dev', 'customer', 'all'].includes(target);
  const needsSdkWebsocket = ['desktop', 'dev', 'customer', 'all'].includes(target);
  const missingTargets = [];

  if (needsFrontend && !fs.existsSync(frontendNodeModulesDir)) {
    missingTargets.push({
      label: 'frontend',
      cwd: frontendDir,
      requiredPath: frontendNodeModulesDir,
    });
  }
  if (needsSdkWebsocket && !fs.existsSync(sdkWsModuleDir)) {
    missingTargets.push({
      label: 'SDK websocket',
      cwd: sdkJsDir,
      requiredPath: sdkWsModuleDir,
    });
  }

  return missingTargets;
}

function ensureStartNodeDependencies(target) {
  const missingTargets = collectMissingStartNodeInstallTargets(target);
  for (const installTarget of missingTargets) {
    console.log(`[windie] Installing ${installTarget.label} Node dependencies in ${installTarget.cwd}`);
    runSync('npm', ['install'], { cwd: installTarget.cwd });
  }
}

function runRestart(target) {
  if (target !== 'desktop') {
    throw new Error('Usage: <windie> restart desktop');
  }
  return runStart('desktop');
}

function runLogs(args) {
  const target = args[0];
  if (target === 'backend') {
    const remote = hasFlag(args, '--remote');
    const host = optionValue(args, '--host', process.env.WINDIE_BACKEND_SSH_HOST || null);
    const service = optionValue(args, '--service', null);
    const scope = optionValue(args, '--scope', null);
    const tail = optionValue(args, '--tail', null);
    const noFollow = hasFlag(args, '--no-follow');
    if (remote && !host) {
      throw new Error('Remote backend logs require --host or WINDIE_BACKEND_SSH_HOST.');
    }
    const forwarded = [];
    if (host) {
      forwarded.push('--host', host);
    }
    if (service) {
      forwarded.push('--service', service);
    }
    if (scope) {
      forwarded.push('--scope', scope);
    }
    if (tail) {
      forwarded.push('--tail', tail);
    }
    if (noFollow) {
      forwarded.push('--no-follow');
    }
    return runForeground(script('scripts/dev/backend-logs.sh'), forwarded, { cwd: REPO_ROOT });
  }
  if (['frontend', 'vite', 'main', 'renderer', 'local-runtime', 'sidecar'].includes(target)) {
    const verbose = normalizeWindieLogTarget(target) === 'renderer' && hasFlag(args.slice(1), '--verbose');
    const { logFile, tailArgs } = buildLayerLogTailArgs(target, args.slice(1));
    ensureWindieLayerLogFile(target, logFile, { verbose });
    return runForeground('tail', tailArgs, { cwd: REPO_ROOT });
  }
  throw new Error('Usage: <windie> logs backend|frontend|vite|main|renderer|local-runtime');
}

function runTest(args) {
  const target = args[0];
  const rest = stripSeparator(args.slice(1));
  if (target === 'backend') {
    return runForeground(script('scripts/test-backend.sh'), rest, { cwd: REPO_ROOT });
  }
  if (target === 'local-runtime' || target === 'sidecar') {
    return runForeground(script('scripts/test-sidecar.sh'), rest, { cwd: REPO_ROOT });
  }
  if (target === 'frontend') {
    return runForeground('npm', ['--prefix', FRONTEND_DIR, 'run', 'test:ci', '--', ...rest], {
      cwd: REPO_ROOT,
    });
  }
  if (target === 'core-loop') {
    const plan = coreLoopRegressionPackCommand(rest);
    return runForeground(plan.command, plan.args, { cwd: plan.cwd });
  }
  if (target === 'user-facing') {
    if (rest.length) {
      throw new Error('Usage: <windie> test user-facing');
    }
    return runConcurrent(userFacingRegressionPackProcesses()).then((code) => process.exit(code));
  }
  if (target === 'all') {
    return runForeground(script('scripts/test.sh'), rest, { cwd: REPO_ROOT });
  }
  if (target === 'pick') {
    const area = rest.join(' ').trim();
    if (!area) {
      throw new Error('Usage: <windie> test pick <area>');
    }
    const docs = fs.readFileSync(repoPath('docs/debug/test_selection.md'), 'utf8');
    const lines = docs
      .split(/\r?\n/)
      .filter((line) => line.toLowerCase().includes(area.toLowerCase()));
    if (!lines.length) {
      console.log(`No focused test preset found for: ${area}`);
      console.log('Open docs/debug/test_selection.md for the full matrix.');
      return;
    }
    console.log(`Focused test matches for "${area}":`);
    for (const line of lines) {
      console.log(line);
    }
    return;
  }
  throw new Error('Usage: <windie> test backend|local-runtime|frontend|core-loop|user-facing|all|pick <area>');
}

function printDocsSearch(topic, usage) {
  const query = String(topic || '').trim();
  if (!query) {
    throw new Error(usage);
  }
  const matches = findDocs(query);
  if (!matches.length) {
    console.log(`No docs match found for: ${query}`);
    return;
  }
  for (const match of matches) {
    console.log(`${match.path} - ${match.title}`);
    if (match.summary) {
      console.log(`  ${match.summary}`);
    }
  }
}

function runDocs(args) {
  const action = args[0];
  if (action === 'list') {
    return runForeground(process.execPath, nodeScriptArgs('scripts/docs-list.js', args.slice(1)), { cwd: REPO_ROOT });
  }
  if (action === 'check') {
    runSync(process.execPath, nodeScriptArgs('scripts/docs-list.js'), { cwd: REPO_ROOT });
    return runForeground('git', ['diff', '--check'], { cwd: REPO_ROOT });
  }
  if (action === 'search') {
    return printDocsSearch(args.slice(1).join(' '), 'Usage: <windie> docs search <query>');
  }
  if (action) {
    return printDocsSearch(args.join(' '), 'Usage: <windie> docs <query>');
  }
  throw new Error('Usage: <windie> docs list|check|search <query>|<query>');
}

function commitSearchArgs(args) {
  const queryParts = [];
  let limit = null;
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--limit') {
      if (!args[index + 1] || args[index + 1].startsWith('--')) {
        throw new Error('--limit requires a value.');
      }
      limit = args[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown commits search option: ${arg}`);
    }
    queryParts.push(arg);
  }
  return { query: queryParts.join(' ').trim(), limit, json };
}

function printCommitSearchText(result) {
  if (!result.matches.length) {
    console.log(`No commits match found for: ${result.query}`);
    return;
  }
  for (const commit of result.matches) {
    console.log(`${commit.shortHash} ${commit.date} ${commit.subject}`);
    console.log(`  ${commit.author}`);
    if (commit.paths.length > 0) {
      const shownPaths = commit.paths.slice(0, 6).join(', ');
      const suffix = commit.paths.length > 6 ? `, +${commit.paths.length - 6} more` : '';
      console.log(`  ${shownPaths}${suffix}`);
    }
  }
}

function runCommits(args) {
  const action = args[0];
  if (action !== 'search') {
    throw new Error('Usage: <windie> commits search <query> [--limit <n>] [--json]');
  }
  const { query, limit, json } = commitSearchArgs(args.slice(1));
  if (!query) {
    throw new Error('Usage: <windie> commits search <query> [--limit <n>] [--json]');
  }
  const result = findCommits(query, { limit });
  if (json) {
    printJson(result);
    return;
  }
  printCommitSearchText(result);
}

function runBuild(args) {
  const target = args[0];
  if (target === 'frontend') {
    return runForeground('npm', ['--prefix', FRONTEND_DIR, 'run', 'build'], { cwd: REPO_ROOT });
  }
  if (target === 'local-runtime' || target === 'sidecar-runtime') {
    return runForeground('npm', ['--prefix', FRONTEND_DIR, 'run', 'build:sidecar-runtime'], {
      cwd: REPO_ROOT,
    });
  }
  throw new Error('Usage: <windie> build frontend|local-runtime');
}

function runPackage(args) {
  const target = args[0];
  if (target === 'mac') {
    return runForeground('npm', ['--prefix', FRONTEND_DIR, 'run', 'package:mac'], { cwd: REPO_ROOT });
  }
  if (target === 'win') {
    return runForeground('npm', ['--prefix', FRONTEND_DIR, 'run', 'package:win'], { cwd: REPO_ROOT });
  }
  if (target === 'linux') {
    return runForeground('npm', ['--prefix', FRONTEND_DIR, 'run', 'package:linux'], { cwd: REPO_ROOT });
  }
  throw new Error('Usage: <windie> package mac|win|linux');
}

function runReinstall(args) {
  const target = args[0];
  if (target === 'mac') {
    console.log('Reinstalling macOS app can reset app state and TCC permissions.');
    return runForeground(script('scripts/reinstall-windieos-macos.sh'), args.slice(1), { cwd: REPO_ROOT });
  }
  if (target === 'linux') {
    console.log('Reinstalling Linux app can remove installed packages and app state.');
    return runForeground(script('scripts/reinstall-windieos-linux.sh'), args.slice(1), { cwd: REPO_ROOT });
  }
  if (target === 'win') {
    console.log('Reinstalling Windows app can uninstall and reinstall packaged WindieOS.');
    return runForeground(
      'powershell',
      ['-ExecutionPolicy', 'Bypass', '-File', script('scripts/reinstall-windieos-windows.ps1'), ...args.slice(1)],
      { cwd: REPO_ROOT },
    );
  }
  throw new Error('Usage: <windie> reinstall mac|win|linux');
}

async function fetchHealth(url) {
  const response = await fetch(url);
  return {
    ok: response.ok || [401, 403].includes(response.status),
    status: response.status,
    url,
    text: await response.text().catch(() => ''),
  };
}

async function runBackend(args) {
  const action = args[0];
  if (action === 'health') {
    const endpoint = getEndpointSnapshot();
    const baseUrl = optionValue(args, '--url', endpoint.httpUrl);
    const healthUrl = baseUrl.endsWith('/api/embeddings/health')
      ? baseUrl
      : `${baseUrl.replace(/\/$/, '')}/api/embeddings/health`;
    const json = hasFlag(args, '--json');
    const result = await fetchHealth(healthUrl).catch((error) => ({
      ok: false,
      status: null,
      url: healthUrl,
      error: error.message,
    }));
    if (json) {
      printJson(result);
      return;
    }
    console.log(`Backend health: ${result.ok ? 'ok' : 'failed'} ${result.status || ''}`);
    console.log(`  ${result.url}`);
    if (result.error) {
      console.log(`  ${result.error}`);
    }
    return;
  }
  if (action === 'deploy') {
    const host = optionValue(args, '--host', null);
    const local = hasFlag(args, '--local');
    const forwarded = [];
    for (let index = 1; index < args.length; index += 1) {
      const arg = args[index];
      if (arg === '--host') {
        index += 1;
        continue;
      }
      if (arg === '--local') {
        continue;
      }
      forwarded.push(arg);
    }
    if (host) {
      const remoteCommand = [
        'cd /opt/windieos-live',
        '&&',
        'scripts/deploy/update-remote-backend.sh',
        ...forwarded.map((value) => `'${String(value).replace(/'/g, "'\\''")}'`),
      ].join(' ');
      return runForeground('ssh', [host, remoteCommand], { cwd: REPO_ROOT });
    }
    if (local) {
      return runForeground(script('scripts/deploy/update-remote-backend.sh'), forwarded, {
        cwd: REPO_ROOT,
      });
    }
    console.log('Backend deploy updates a backend-host checkout and restarts its service.');
    console.log('Use one of:');
    console.log('  windie backend deploy --host windie-prod');
    console.log('  windie backend deploy --local --repo-root /opt/windieos-live');
    return;
  }
  if (action === 'service') {
    const verb = args[1];
    if (!['status', 'start', 'stop', 'restart'].includes(verb)) {
      throw new Error('Usage: <windie> backend service status|start|stop|restart');
    }
    const scope = optionValue(args, '--scope', 'system');
    const service = optionValue(args, '--service', 'windieos-backend.service');
    const host = optionValue(args, '--host', null);
    const systemctl = scope === 'user' ? ['systemctl', '--user'] : ['systemctl'];
    const commandArgs = [...systemctl.slice(1), verb, service];
    if (host) {
      return runForeground('ssh', [host, systemctl[0], ...commandArgs], { cwd: REPO_ROOT });
    }
    return runForeground(systemctl[0], commandArgs, { cwd: REPO_ROOT });
  }
  throw new Error('Usage: <windie> backend health|deploy|service');
}

async function runEndpoint(args) {
  const action = args[0];
  const endpoint = getEndpointSnapshot();
  if (action === 'show') {
    printSection('WindieOS endpoint', [`http: ${endpoint.httpUrl}`, `ws:   ${endpoint.wsUrl}`]);
    return;
  }
  if (action === 'local') {
    console.log('BACKEND_HTTP_URL=http://127.0.0.1:8765');
    console.log('BACKEND_WS_URL=ws://127.0.0.1:8765/ws');
    console.log('windie start dev');
    return;
  }
  if (action === 'hosted') {
    console.log('BACKEND_HTTP_URL=https://api.windieos.com');
    console.log('BACKEND_WS_URL=wss://api.windieos.com/ws');
    console.log('windie start dev');
    return;
  }
  if (action === 'probe') {
    return runBackend(['health', '--url', endpoint.httpUrl, ...(hasFlag(args, '--json') ? ['--json'] : [])]);
  }
  throw new Error('Usage: <windie> endpoint show|local|hosted|probe');
}

function runSelfHost(args) {
  const action = args[0];
  if (action === 'bootstrap') {
    return runForeground(script('scripts/cloudflared/bootstrap-windieos-host.sh'), args.slice(1), {
      cwd: REPO_ROOT,
    });
  }
  if (action === 'tunnel' && args[1] === 'setup') {
    return runForeground(script('scripts/cloudflared/setup-windieos-tunnel.sh'), args.slice(2), {
      cwd: REPO_ROOT,
    });
  }
  if (action === 'service') {
    const serviceAction = args[1];
    if (serviceAction === 'install-backend') {
      return runForeground(script('scripts/cloudflared/install-backend-user-service.sh'), args.slice(2), {
        cwd: REPO_ROOT,
      });
    }
    if (serviceAction === 'install-cloudflared') {
      return runForeground(script('scripts/cloudflared/install-cloudflared-user.sh'), args.slice(2), {
        cwd: REPO_ROOT,
      });
    }
  }
  if (action === 'status') {
    const hasSystemctl = capture('systemctl', ['--version'], { cwd: REPO_ROOT }).ok;
    if (!hasSystemctl) {
      console.log('systemctl is not available on this machine.');
      console.log('Self-host status is only available on Linux hosts with systemd user services.');
      return;
    }
    runSync('systemctl', ['--user', 'status', 'windieos-backend.service', '--no-pager'], {
      cwd: REPO_ROOT,
      allowFailure: true,
    });
    return runForeground('systemctl', ['--user', 'status', 'windieos-cloudflared.service', '--no-pager'], {
      cwd: REPO_ROOT,
    });
  }
  throw new Error('Usage: <windie> self-host bootstrap|tunnel setup|service install-backend|service install-cloudflared|status');
}

function runExtension(args) {
  if (args[0] === 'create') {
    return runForeground('node', [script('scripts/create-windie-extension.cjs'), ...args.slice(1)], {
      cwd: REPO_ROOT,
    });
  }
  throw new Error('Usage: <windie> extension create <id>');
}

function runTools(args) {
  if (args[0] === 'manifest' && args[1] === 'generate') {
    return runForeground('python', [script('scripts/generate-builtin-tool-manifest.py'), ...args.slice(2)], {
      cwd: REPO_ROOT,
    });
  }
  throw new Error('Usage: <windie> tools manifest generate');
}

function runMock(args) {
  if (args[0] === 'backend') {
    return runForeground('node', [script('scripts/mock-backend.cjs'), ...args.slice(1)], {
      cwd: REPO_ROOT,
    });
  }
  throw new Error('Usage: <windie> mock backend');
}

async function dispatch(argv) {
  const args = [...argv];
  if (!args.length || args[0] === '--help' || args[0] === '-h') {
    console.log(HELP);
    return;
  }

  const command = args.shift();
  switch (command) {
    case 'status':
      return runStatus(args);
    case 'doctor':
      return runDoctor(args);
    case 'diagnostics':
      return runDiagnostics(args);
    case 'trace':
      return runTrace(args);
    case 'capability':
      return runCapability(args);
    case 'conversation':
      return runConversation(args);
    case 'start':
      return runStart(args[0]);
    case 'stop':
      return printNoTrackedProcesses();
    case 'restart':
      return runRestart(args[0]);
    case 'logs':
      return runLogs(args);
    case 'test':
      return runTest(args);
    case 'docs':
      return runDocs(args);
    case 'commits':
      return runCommits(args);
    case 'build':
      return runBuild(args);
    case 'package':
      return runPackage(args);
    case 'reinstall':
      return runReinstall(args);
    case 'backend':
      return runBackend(args);
    case 'endpoint':
      return runEndpoint(args);
    case 'self-host':
      return runSelfHost(args);
    case 'extension':
      return runExtension(args);
    case 'tools':
      return runTools(args);
    case 'mock':
      return runMock(args);
    default:
      throw new Error(`Unknown command: ${command}\n\n${HELP}`);
  }
}

function getSpawnPlan(argv) {
  const args = [...argv];
  const command = args.shift();
  if (command === 'start' && args[0] === 'backend') {
    return { command: script('scripts/run-backend.sh'), args: [], cwd: REPO_ROOT };
  }
  if (command === 'start' && args[0] === 'frontend') {
    return {
      concurrent: [
        { label: 'frontend', command: script('scripts/run-frontend-dev.sh'), cwd: REPO_ROOT, logLayer: 'vite' },
      ],
    };
  }
  if (command === 'start' && args[0] === 'desktop') {
    return { command: script('scripts/run-frontend-electron.sh'), args: [], cwd: REPO_ROOT };
  }
  if (command === 'start' && args[0] === 'dev') {
    const scriptedProviderEnv = {
      ...process.env,
      WINDIE_ENABLE_SCRIPTED_PROVIDER: '1',
    };
    return {
      concurrent: [
        { label: 'frontend', command: script('scripts/run-frontend-dev.sh'), cwd: REPO_ROOT, logLayer: 'vite', env: scriptedProviderEnv },
        {
          label: 'desktop',
          command: script('scripts/run-frontend-electron.sh'),
          cwd: REPO_ROOT,
          waitFor: frontendReadyPlan(),
          env: scriptedProviderEnv,
        },
      ],
    };
  }
  if (command === 'start' && args[0] === 'customer') {
    return {
      concurrent: [
        { label: 'frontend', command: script('scripts/run-frontend-dev.sh'), cwd: REPO_ROOT, logLayer: 'vite' },
        {
          label: 'customer',
          command: script('scripts/run-frontend-customer.sh'),
          args: [],
          cwd: REPO_ROOT,
          waitFor: frontendReadyPlan(),
        },
      ],
    };
  }
  if (command === 'test' && args[0] === 'backend') {
    return { command: script('scripts/test-backend.sh'), args: stripSeparator(args.slice(1)), cwd: REPO_ROOT };
  }
  if (command === 'test' && (args[0] === 'local-runtime' || args[0] === 'sidecar')) {
    return { command: script('scripts/test-sidecar.sh'), args: stripSeparator(args.slice(1)), cwd: REPO_ROOT };
  }
  if (command === 'test' && args[0] === 'frontend') {
    return {
      command: 'npm',
      args: ['--prefix', FRONTEND_DIR, 'run', 'test:ci', '--', ...stripSeparator(args.slice(1))],
      cwd: REPO_ROOT,
    };
  }
  if (command === 'test' && args[0] === 'core-loop') {
    return coreLoopRegressionPackCommand(stripSeparator(args.slice(1)));
  }
  if (command === 'test' && args[0] === 'user-facing') {
    return {
      concurrent: userFacingRegressionPackProcesses(),
    };
  }
  if (command === 'docs' && args[0] === 'list') {
    return { command: process.execPath, args: nodeScriptArgs('scripts/docs-list.js', args.slice(1)), cwd: REPO_ROOT };
  }
  if (command === 'build' && args[0] === 'frontend') {
    return { command: 'npm', args: ['--prefix', FRONTEND_DIR, 'run', 'build'], cwd: REPO_ROOT };
  }
  if (command === 'build' && (args[0] === 'local-runtime' || args[0] === 'sidecar-runtime')) {
    return {
      command: 'npm',
      args: ['--prefix', FRONTEND_DIR, 'run', 'build:sidecar-runtime'],
      cwd: REPO_ROOT,
    };
  }
  return null;
}

module.exports = {
  HELP,
  collectMissingStartNodeInstallTargets,
  dispatch,
  getSpawnPlan,
  buildLayerLogTailArgs,
  buildFrontendLogTailArgs,
  normalizeWindieLogTarget,
  optionValue,
  resolveFrontendLogFile,
  resolveWindieLogFile,
  summarizeCapabilityTrace,
  stripSeparator,
};
