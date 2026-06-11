const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CONVERSATION_METADATA_LIST_DIAGNOSTICS_PATH = 'conversation.metadata.list';
const BROWSER_SESSION_CONTROL_DIAGNOSTICS_PATH = 'browser.session_control';
const APP_DIAGNOSTICS_PATH = CONVERSATION_METADATA_LIST_DIAGNOSTICS_PATH;

const ALLOWED_DATA_KEYS = new Set([
  'hasUserId',
  'userIdSource',
  'userIdMatchesActive',
  'limit',
  'resultCount',
  'canonicalHistoryDbExists',
  'legacyEpisodicDbExists',
  'backendConnected',
  'sidecarReady',
  'storeKind',
  'ready',
  'status',
  'localBackendReady',
  'connected',
  'busyAction',
  'action',
  'hasProvider',
  'hasClient',
  'hasDiscoveryPath',
  'wakeRequested',
  'wakeSucceeded',
  'alreadyReady',
  'suppressed',
  'reason',
  'success',
  'tabCount',
  'responseKeyCount',
  'durationMs',
  'requestId',
  'shortError',
  'errorCode',
]);

function diagnosticsDatabasePath() {
  if (process.env.WINDIE_APP_DIAGNOSTICS_DB) {
    return process.env.WINDIE_APP_DIAGNOSTICS_DB;
  }
  return path.join(
    os.homedir(),
    'Library',
    'Application Support',
    'desktop-assistant',
    'diagnostics',
    'diagnostics.db',
  );
}

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix) {
  if (typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}

function sqlString(value) {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlNumber(value) {
  return Number.isFinite(value) ? String(Math.max(0, Math.floor(value))) : 'NULL';
}

function runSqlite(dbPath, sql, { json = false } = {}) {
  const args = json ? ['-json', dbPath, sql] : [dbPath, sql];
  const result = childProcess.spawnSync('sqlite3', args, {
    encoding: 'utf8',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || `sqlite3 exited with status ${result.status}`);
  }
  return result.stdout || '';
}

function ensureDiagnosticsSchema(dbPath = diagnosticsDatabasePath()) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  runSqlite(dbPath, `
    CREATE TABLE IF NOT EXISTS diagnostic_events (
      id TEXT PRIMARY KEY,
      trace_id TEXT NOT NULL,
      span_id TEXT NOT NULL,
      parent_span_id TEXT,
      path TEXT NOT NULL,
      stage TEXT NOT NULL,
      status TEXT NOT NULL,
      runtime TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      duration_ms INTEGER,
      request_id TEXT,
      session_id TEXT,
      conversation_ref TEXT,
      data TEXT,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_diagnostic_events_path_time
    ON diagnostic_events(path, timestamp);
    CREATE INDEX IF NOT EXISTS idx_diagnostic_events_trace
    ON diagnostic_events(trace_id, timestamp);
  `);
}

function normalizeString(value, fallback = null) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function classifyErrorCode(value) {
  const message = String(value || '').toLowerCase();
  if (message.includes('active user id') || message.includes('active user')) {
    return 'active_user_id_required';
  }
  if (message.includes('does not match')) {
    return 'user_id_mismatch';
  }
  if (message.includes('sqlite') || message.includes('database')) {
    return 'sqlite_error';
  }
  if (message.includes('memory store not initialized')) {
    return 'memory_store_not_initialized';
  }
  if (message.includes('local runtime') || message.includes('sidecar')) {
    return 'sidecar_unavailable';
  }
  return 'runtime_error';
}

function sanitizeError(error) {
  if (!error) {
    return null;
  }
  const rawMessage = typeof error === 'string' ? error : error.message;
  const message = String(rawMessage || 'Diagnostic event failed')
    .replace(/[A-Za-z]:\\[^\s'"]+/g, '[path]')
    .replace(/\/(?:Users|private|var|tmp|Volumes|Applications)\/[^\s'"]+/g, '[path]')
    .replace(/\s+/g, ' ')
    .trim();
  const shortMessage = message.length > 160 ? `${message.slice(0, 157)}...` : message;
  return {
    code: normalizeString(error.code) || classifyErrorCode(shortMessage),
    message: shortMessage,
  };
}

function sanitizeData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {};
  }
  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    if (!ALLOWED_DATA_KEYS.has(key)) {
      continue;
    }
    if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string' || value === null) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function normalizeDiagnosticEvent(input = {}) {
  const traceId = normalizeString(input.traceId) || randomId('diag');
  const spanId = normalizeString(input.spanId) || randomId('span');
  const error = sanitizeError(input.error);
  const data = sanitizeData({
    ...input.data,
    ...(input.requestId ? { requestId: input.requestId } : {}),
    ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
    ...(error ? { shortError: error.message, errorCode: error.code } : {}),
  });
  return {
    id: normalizeString(input.id) || randomId('evt'),
    traceId,
    spanId,
    parentSpanId: normalizeString(input.parentSpanId),
    path: normalizeString(input.path) || APP_DIAGNOSTICS_PATH,
    stage: normalizeString(input.stage) || 'unknown',
    status: normalizeString(input.status) || 'succeeded',
    runtime: normalizeString(input.runtime) || 'electron-main',
    timestamp: normalizeString(input.timestamp) || nowIso(),
    durationMs: Number.isFinite(input.durationMs) ? Math.max(0, Math.floor(input.durationMs)) : null,
    requestId: normalizeString(input.requestId),
    sessionId: normalizeString(input.sessionId),
    conversationRef: normalizeString(input.conversationRef),
    data,
    error,
  };
}

function appendDiagnosticEvent(input = {}, options = {}) {
  const dbPath = options.dbPath || diagnosticsDatabasePath();
  const event = normalizeDiagnosticEvent(input);
  ensureDiagnosticsSchema(dbPath);
  runSqlite(dbPath, `
    INSERT INTO diagnostic_events (
      id,
      trace_id,
      span_id,
      parent_span_id,
      path,
      stage,
      status,
      runtime,
      timestamp,
      duration_ms,
      request_id,
      session_id,
      conversation_ref,
      data,
      error
    ) VALUES (
      ${sqlString(event.id)},
      ${sqlString(event.traceId)},
      ${sqlString(event.spanId)},
      ${sqlString(event.parentSpanId)},
      ${sqlString(event.path)},
      ${sqlString(event.stage)},
      ${sqlString(event.status)},
      ${sqlString(event.runtime)},
      ${sqlString(event.timestamp)},
      ${sqlNumber(event.durationMs)},
      ${sqlString(event.requestId)},
      ${sqlString(event.sessionId)},
      ${sqlString(event.conversationRef)},
      ${sqlString(JSON.stringify(event.data))},
      ${sqlString(event.error ? JSON.stringify(event.error) : null)}
    );
  `);
  return {
    stored: true,
    database: dbPath,
    traceId: event.traceId,
    spanId: event.spanId,
  };
}

function parseJsonField(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseDiagnosticRows(rows) {
  return rows.map(row => ({
    id: row.id,
    traceId: row.traceId,
    spanId: row.spanId,
    parentSpanId: row.parentSpanId || null,
    path: row.path,
    stage: row.stage,
    status: row.status,
    runtime: row.runtime,
    timestamp: row.timestamp,
    durationMs: Number.isFinite(row.durationMs) ? row.durationMs : null,
    requestId: row.requestId || null,
    sessionId: row.sessionId || null,
    conversationRef: row.conversationRef || null,
    data: parseJsonField(row.data) || {},
    error: parseJsonField(row.error),
  }));
}

function queryDiagnosticEvents({ pathFilter = '', limit = 50 } = {}, options = {}) {
  const dbPath = options.dbPath || diagnosticsDatabasePath();
  if (!fs.existsSync(dbPath)) {
    return [];
  }
  const safeLimit = Math.min(Math.max(Number.parseInt(String(limit), 10) || 50, 1), 1000);
  const where = pathFilter ? `WHERE path = ${sqlString(pathFilter)}` : '';
  const rows = JSON.parse(runSqlite(dbPath, `
    SELECT id,
           trace_id AS traceId,
           span_id AS spanId,
           parent_span_id AS parentSpanId,
           path,
           stage,
           status,
           runtime,
           timestamp,
           duration_ms AS durationMs,
           request_id AS requestId,
           session_id AS sessionId,
           conversation_ref AS conversationRef,
           data,
           error
    FROM diagnostic_events
    ${where}
    ORDER BY timestamp DESC
    LIMIT ${safeLimit}
  `, { json: true }) || '[]');
  return parseDiagnosticRows(rows);
}

function inspectDiagnosticTrace(traceId, options = {}) {
  const normalizedTraceId = normalizeString(traceId);
  const dbPath = options.dbPath || diagnosticsDatabasePath();
  if (!normalizedTraceId || !fs.existsSync(dbPath)) {
    return [];
  }
  const rows = JSON.parse(runSqlite(dbPath, `
    SELECT id,
           trace_id AS traceId,
           span_id AS spanId,
           parent_span_id AS parentSpanId,
           path,
           stage,
           status,
           runtime,
           timestamp,
           duration_ms AS durationMs,
           request_id AS requestId,
           session_id AS sessionId,
           conversation_ref AS conversationRef,
           data,
           error
    FROM diagnostic_events
    WHERE trace_id = ${sqlString(normalizedTraceId)}
    ORDER BY timestamp ASC
  `, { json: true }) || '[]');
  return parseDiagnosticRows(rows);
}

module.exports = {
  APP_DIAGNOSTICS_PATH,
  BROWSER_SESSION_CONTROL_DIAGNOSTICS_PATH,
  CONVERSATION_METADATA_LIST_DIAGNOSTICS_PATH,
  appendDiagnosticEvent,
  diagnosticsDatabasePath,
  ensureDiagnosticsSchema,
  inspectDiagnosticTrace,
  queryDiagnosticEvents,
  sanitizeData,
  sanitizeError,
};
