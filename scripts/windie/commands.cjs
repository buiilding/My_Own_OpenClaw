const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { findDocs } = require('./docs.cjs');
const { printCheckList, printJson, printSection } = require('./output.cjs');
const { FRONTEND_DIR, REPO_ROOT, repoPath } = require('./paths.cjs');
const { collectStatus, getEndpointSnapshot } = require('./status.cjs');
const { capture, runConcurrent, runForeground, runSync } = require('./run.cjs');
const {
  APP_DIAGNOSTICS_PATH,
  diagnosticsDatabasePath,
  inspectDiagnosticTrace,
  queryDiagnosticEvents,
} = require('../../frontend/src/main/diagnostics/app_diagnostics_store.cjs');

const HELP = `WindieOS command line

Usage:
  windie <command> [options]

Status and diagnostics:
  windie status
  windie status --all
  windie status --all --json
  windie doctor
  windie doctor --fix
  windie doctor --deep
  windie doctor --json
  windie diagnostics list [--path <path>] [--limit <n>] [--json]
  windie diagnostics inspect <trace-id> [--json]
  windie trace <conversation-ref> <turn-ref> [--path <path>] [--json]
  windie conversation list [--limit <n>] [--json]
  windie conversation inspect <conversation-ref> [--json]
  windie conversation messages <conversation-ref> [--limit <n>] [--json]
  windie conversation events <conversation-ref> [--turn <turn-ref>] [--type <event-type>] [--limit <n>] [--json]
  windie conversation turns <conversation-ref> [--json]
  windie conversation traces <conversation-ref> [--turn <turn-ref>] [--path <path>] [--limit <n>] [--json]

Lifecycle and logs:
  windie start backend
  windie start frontend
  windie start desktop
  windie start dev
  windie start customer
  windie start all
  windie stop
  windie restart desktop
  windie logs backend [--remote --host <host>] [--service backend|tunnel|both]
  windie logs frontend [--tail <lines>] [--no-follow]
  windie logs desktop
  windie logs sidecar

Tests and docs:
  windie test backend [args...]
  windie test sidecar [args...]
  windie test frontend [args...]
  windie test all
  windie test pick <area>
  windie docs list
  windie docs check
  windie docs search <query>
  windie docs <query>
  windie docs open <topic>

Build and package:
  windie build frontend
  windie build sidecar-runtime
  windie package mac
  windie package win
  windie package linux
  windie reinstall mac
  windie reinstall win
  windie reinstall linux

Backend, endpoint, and self-host:
  windie backend health [--url <url>]
  windie backend deploy --host <host> [options]
  windie backend deploy --local [options]
  windie backend service status|start|stop|restart [--scope system|user] [--host <host>]
  windie endpoint show
  windie endpoint local
  windie endpoint hosted
  windie endpoint probe
  windie self-host bootstrap [options]
  windie self-host tunnel setup [options]
  windie self-host service install-backend [options]
  windie self-host service install-cloudflared [options]
  windie self-host status

Developer helpers:
  windie extension create <id> [options]
  windie tools manifest generate
  windie mock backend
`;

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

function historyDatabasePath() {
  const historyPath = path.join(
    os.homedir(),
    'Library',
    'Application Support',
    'desktop-assistant',
    'history',
    'history.db',
  );
  if (fs.existsSync(historyPath)) {
    return historyPath;
  }
  return path.join(
    os.homedir(),
    'Library',
    'Application Support',
    'desktop-assistant',
    'memory',
    'episodic.db',
  );
}

function historyTableNames() {
  const dbPath = historyDatabasePath();
  const usingCanonicalHistory = dbPath.endsWith(path.join('history', 'history.db'));
  return {
    events: usingCanonicalHistory ? 'conversation_events' : 'chat_events',
    revisions: usingCanonicalHistory ? 'conversation_revisions' : 'chat_conversation_revisions',
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

function getFrontendDevUrl() {
  return process.env.WINDIE_FRONTEND_DEV_URL || 'http://localhost:5173/';
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
    waitFor: ({ isShuttingDown } = {}) => waitForHttp(url, { isShuttingDown }),
    waitMessage: `waiting for ${url}`,
  };
}

function frontendReadyPlan() {
  return {
    type: 'http',
    url: getFrontendDevUrl(),
    timeoutMs: 30000,
  };
}

function printNoTrackedProcesses() {
  console.log('No tracked WindieOS background processes found.');
  console.log('Current `windie start ...` commands run in the foreground; use Ctrl-C in that terminal.');
}

function resolveFrontendLogFile(env = process.env) {
  const configured = env.WINDIE_FRONTEND_LOG_FILE;
  if (configured === '0' || configured === 'false') {
    return null;
  }
  if (typeof configured === 'string' && configured.trim()) {
    const value = configured.trim();
    return path.isAbsolute(value) ? value : repoPath(value);
  }
  return repoPath('.windie', 'logs', 'frontend.log');
}

function normalizeTailLines(value, fallback = '200') {
  const raw = value || fallback;
  if (!/^\d+$/.test(String(raw)) || Number(raw) < 1) {
    throw new Error('--tail must be a positive integer.');
  }
  return String(raw);
}

function ensureFrontendLogFile(logFile) {
  if (!logFile) {
    throw new Error('Frontend log capture is disabled by WINDIE_FRONTEND_LOG_FILE.');
  }
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  if (!fs.existsSync(logFile)) {
    fs.writeFileSync(
      logFile,
      [
        '[WindieOS] frontend log file initialized.',
        'Start a desktop run with: bin/windie start dev',
        '',
      ].join('\n'),
    );
  }
}

function buildFrontendLogTailArgs(args, env = process.env) {
  const logFile = resolveFrontendLogFile(env);
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
    throw new Error('Usage: windie trace <conversation-ref> <turn-ref> [--path <path>] [--json]');
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

function runDiagnostics(args) {
  const subcommand = args[0];
  const rest = args.slice(1);
  const json = hasFlag(rest, '--json');
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
      throw new Error('Usage: windie diagnostics inspect <trace-id> [--json]');
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
  throw new Error('Usage: windie diagnostics list [--path <path>] [--limit <n>] [--json] | inspect <trace-id> [--json]');
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

  const [conversationRef] = positionalArgs(rest, ['--turn', '--type', '--path', '--limit']);
  if (!conversationRef) {
    throw new Error('Usage: windie conversation list|inspect|messages|events|turns|traces <conversation-ref>');
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

  throw new Error('Usage: windie conversation list|inspect|messages|events|turns|traces <conversation-ref>');
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
      name: 'local backend port',
      ok: backendPortOpen,
      detail: backendPortOpen ? '127.0.0.1:8765 is accepting connections' : '127.0.0.1:8765 is closed',
    });
    const sidecarImport = capture(
      script('scripts/python-in-env'),
      [
        'sidecar',
        'python',
        '-c',
        'import sys; sys.path.insert(0, "frontend/src/main/python"); import local_backend; print("ok")',
      ],
      { cwd: REPO_ROOT },
    );
    diagnostics.push({
      name: 'sidecar import',
      ok: sidecarImport.ok,
      detail: sidecarImport.ok ? 'local_backend imports' : sidecarImport.stderr || sidecarImport.error,
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
  if (target === 'backend') {
    return runForeground(script('scripts/run-backend'), [], { cwd: REPO_ROOT });
  }
  if (target === 'frontend') {
    return runForeground(script('scripts/run-frontend-dev'), [], { cwd: REPO_ROOT });
  }
  if (target === 'desktop') {
    return runForeground(script('scripts/run-frontend-electron'), [], { cwd: REPO_ROOT });
  }
  if (target === 'dev') {
    return runConcurrent([
      { label: 'frontend', command: script('scripts/run-frontend-dev'), cwd: REPO_ROOT },
      afterFrontendReady({
        label: 'desktop',
        command: script('scripts/run-frontend-electron'),
        cwd: REPO_ROOT,
      }),
    ]).then((code) => process.exit(code));
  }
  if (target === 'customer') {
    return runConcurrent([
      { label: 'frontend', command: script('scripts/run-frontend-dev'), cwd: REPO_ROOT },
      afterFrontendReady({
        label: 'customer',
        command: 'npm',
        args: ['--prefix', FRONTEND_DIR, 'run', 'electron'],
        cwd: REPO_ROOT,
      }),
    ]).then((code) => process.exit(code));
  }
  if (target === 'all') {
    return runConcurrent([
      { label: 'backend', command: script('scripts/run-backend'), cwd: REPO_ROOT },
      { label: 'frontend', command: script('scripts/run-frontend-dev'), cwd: REPO_ROOT },
      { label: 'desktop', command: script('scripts/run-frontend-electron'), cwd: REPO_ROOT },
    ]).then((code) => process.exit(code));
  }
  throw new Error('Usage: windie start backend|frontend|desktop|dev|customer|all');
}

function runRestart(target) {
  if (target !== 'desktop') {
    throw new Error('Usage: windie restart desktop');
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
    return runForeground(script('scripts/dev/backend-logs'), forwarded, { cwd: REPO_ROOT });
  }
  if (target === 'frontend' || target === 'desktop') {
    const { logFile, tailArgs } = buildFrontendLogTailArgs(args.slice(1));
    ensureFrontendLogFile(logFile);
    return runForeground('tail', tailArgs, { cwd: REPO_ROOT });
  }
  if (target === 'sidecar') {
    console.log('Sidecar logs are forwarded through Electron main stderr in desktop runs.');
    console.log('Run: WINDIE_SIDECAR_LOG_LEVEL=DEBUG windie start desktop');
    return;
  }
  throw new Error('Usage: windie logs backend|frontend|desktop|sidecar');
}

function runTest(args) {
  const target = args[0];
  const rest = stripSeparator(args.slice(1));
  if (target === 'backend') {
    return runForeground(script('scripts/test-backend'), rest, { cwd: REPO_ROOT });
  }
  if (target === 'sidecar') {
    return runForeground(script('scripts/test-sidecar'), rest, { cwd: REPO_ROOT });
  }
  if (target === 'frontend') {
    return runForeground('npm', ['--prefix', FRONTEND_DIR, 'run', 'test:ci', '--', ...rest], {
      cwd: REPO_ROOT,
    });
  }
  if (target === 'all') {
    return runForeground(script('scripts/test'), rest, { cwd: REPO_ROOT });
  }
  if (target === 'pick') {
    const area = rest.join(' ').trim();
    if (!area) {
      throw new Error('Usage: windie test pick <area>');
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
  throw new Error('Usage: windie test backend|sidecar|frontend|all|pick <area>');
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
    return runForeground(script('bin/docs-list'), args.slice(1), { cwd: REPO_ROOT });
  }
  if (action === 'check') {
    runSync(script('bin/docs-list'), [], { cwd: REPO_ROOT });
    return runForeground('git', ['diff', '--check'], { cwd: REPO_ROOT });
  }
  if (action === 'open') {
    return printDocsSearch(args.slice(1).join(' '), 'Usage: windie docs open <topic>');
  }
  if (action === 'search') {
    return printDocsSearch(args.slice(1).join(' '), 'Usage: windie docs search <query>');
  }
  if (action) {
    return printDocsSearch(args.join(' '), 'Usage: windie docs <query>');
  }
  throw new Error('Usage: windie docs list|check|search <query>|open <topic>|<query>');
}

function runBuild(args) {
  const target = args[0];
  if (target === 'frontend') {
    return runForeground('npm', ['--prefix', FRONTEND_DIR, 'run', 'build'], { cwd: REPO_ROOT });
  }
  if (target === 'sidecar-runtime') {
    return runForeground('npm', ['--prefix', FRONTEND_DIR, 'run', 'build:sidecar-runtime'], {
      cwd: REPO_ROOT,
    });
  }
  throw new Error('Usage: windie build frontend|sidecar-runtime');
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
  throw new Error('Usage: windie package mac|win|linux');
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
  throw new Error('Usage: windie reinstall mac|win|linux');
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
        'scripts/deploy/update-remote-backend',
        ...forwarded.map((value) => `'${String(value).replace(/'/g, "'\\''")}'`),
      ].join(' ');
      return runForeground('ssh', [host, remoteCommand], { cwd: REPO_ROOT });
    }
    if (local) {
      return runForeground(script('scripts/deploy/update-remote-backend'), forwarded, {
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
      throw new Error('Usage: windie backend service status|start|stop|restart');
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
  throw new Error('Usage: windie backend health|deploy|service');
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
  throw new Error('Usage: windie endpoint show|local|hosted|probe');
}

function runSelfHost(args) {
  const action = args[0];
  if (action === 'bootstrap') {
    return runForeground(script('scripts/cloudflared/bootstrap-windieos-host'), args.slice(1), {
      cwd: REPO_ROOT,
    });
  }
  if (action === 'tunnel' && args[1] === 'setup') {
    return runForeground(script('scripts/cloudflared/setup-windieos-tunnel'), args.slice(2), {
      cwd: REPO_ROOT,
    });
  }
  if (action === 'service') {
    const serviceAction = args[1];
    if (serviceAction === 'install-backend') {
      return runForeground(script('scripts/cloudflared/install-backend-user-service'), args.slice(2), {
        cwd: REPO_ROOT,
      });
    }
    if (serviceAction === 'install-cloudflared') {
      return runForeground(script('scripts/cloudflared/install-cloudflared-user'), args.slice(2), {
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
  throw new Error('Usage: windie self-host bootstrap|tunnel setup|service install-backend|service install-cloudflared|status');
}

function runExtension(args) {
  if (args[0] === 'create') {
    return runForeground('node', [script('scripts/create-windie-extension.cjs'), ...args.slice(1)], {
      cwd: REPO_ROOT,
    });
  }
  throw new Error('Usage: windie extension create <id>');
}

function runTools(args) {
  if (args[0] === 'manifest' && args[1] === 'generate') {
    return runForeground(script('scripts/generate-builtin-tool-manifest'), args.slice(2), {
      cwd: REPO_ROOT,
    });
  }
  throw new Error('Usage: windie tools manifest generate');
}

function runMock(args) {
  if (args[0] === 'backend') {
    return runForeground('node', [script('scripts/mock-backend.cjs'), ...args.slice(1)], {
      cwd: REPO_ROOT,
    });
  }
  throw new Error('Usage: windie mock backend');
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
    return { command: script('scripts/run-backend'), args: [], cwd: REPO_ROOT };
  }
  if (command === 'start' && args[0] === 'frontend') {
    return { command: script('scripts/run-frontend-dev'), args: [], cwd: REPO_ROOT };
  }
  if (command === 'start' && args[0] === 'desktop') {
    return { command: script('scripts/run-frontend-electron'), args: [], cwd: REPO_ROOT };
  }
  if (command === 'start' && args[0] === 'dev') {
    return {
      concurrent: [
        { label: 'frontend', command: script('scripts/run-frontend-dev'), cwd: REPO_ROOT },
        {
          label: 'desktop',
          command: script('scripts/run-frontend-electron'),
          cwd: REPO_ROOT,
          waitFor: frontendReadyPlan(),
        },
      ],
    };
  }
  if (command === 'start' && args[0] === 'customer') {
    return {
      concurrent: [
        { label: 'frontend', command: script('scripts/run-frontend-dev'), cwd: REPO_ROOT },
        {
          label: 'customer',
          command: 'npm',
          args: ['--prefix', FRONTEND_DIR, 'run', 'electron'],
          cwd: REPO_ROOT,
          waitFor: frontendReadyPlan(),
        },
      ],
    };
  }
  if (command === 'test' && args[0] === 'backend') {
    return { command: script('scripts/test-backend'), args: stripSeparator(args.slice(1)), cwd: REPO_ROOT };
  }
  if (command === 'test' && args[0] === 'sidecar') {
    return { command: script('scripts/test-sidecar'), args: stripSeparator(args.slice(1)), cwd: REPO_ROOT };
  }
  if (command === 'test' && args[0] === 'frontend') {
    return {
      command: 'npm',
      args: ['--prefix', FRONTEND_DIR, 'run', 'test:ci', '--', ...stripSeparator(args.slice(1))],
      cwd: REPO_ROOT,
    };
  }
  if (command === 'docs' && args[0] === 'list') {
    return { command: script('bin/docs-list'), args: args.slice(1), cwd: REPO_ROOT };
  }
  return null;
}

module.exports = {
  HELP,
  dispatch,
  getSpawnPlan,
  buildFrontendLogTailArgs,
  optionValue,
  resolveFrontendLogFile,
  stripSeparator,
};
