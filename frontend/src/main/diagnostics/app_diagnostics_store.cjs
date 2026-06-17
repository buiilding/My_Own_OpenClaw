/**
 * Stores and retrieves app diagnostics state for the Electron main process.
 */

const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CONVERSATION_METADATA_LIST_DIAGNOSTICS_PATH = 'conversation.metadata.list';
const BROWSER_SESSION_CONTROL_DIAGNOSTICS_PATH = 'browser.session_control';
const MCP_DISCOVERY_DIAGNOSTICS_PATH = 'mcp.discovery';
const MCP_ENABLEMENT_DIAGNOSTICS_PATH = 'mcp.enablement';
const MCP_EXECUTION_DIAGNOSTICS_PATH = 'mcp.execution';
const MCP_REGISTRATION_DIAGNOSTICS_PATH = 'mcp.registration';
const PERMISSION_PROBE_DIAGNOSTICS_PATH = 'permission.probe';
const DESKTOP_STARTUP_DIAGNOSTICS_PATH = 'desktop.startup';
const IPC_BRIDGE_DIAGNOSTICS_PATH = 'ipc.bridge';
const LOCAL_RUNTIME_LIFECYCLE_DIAGNOSTICS_PATH = 'local_runtime.lifecycle';
const WAKEWORD_LIFECYCLE_DIAGNOSTICS_PATH = 'wakeword.lifecycle';
const SURFACE_VISIBILITY_DIAGNOSTICS_PATH = 'surface.visibility';
const FRONTEND_INTERACTION_DIAGNOSTICS_PATH = 'frontend.interaction';
const APP_DIAGNOSTICS_PATH = CONVERSATION_METADATA_LIST_DIAGNOSTICS_PATH;
const APP_DATA_DIR_NAME = 'windieos';

const DIAGNOSTIC_PATH_DEFINITIONS = Object.freeze({
  [CONVERSATION_METADATA_LIST_DIAGNOSTICS_PATH]: {
    owner: 'SDK + local runtime conversation store',
    purpose: 'Dashboard/sidebar conversation list lifecycle and local history-store reads.',
  },
  [BROWSER_SESSION_CONTROL_DIAGNOSTICS_PATH]: {
    owner: 'Electron main local runtime bridge',
    purpose: 'Browser runtime readiness and chat-header browser action lifecycle before a turn exists.',
  },
  [DESKTOP_STARTUP_DIAGNOSTICS_PATH]: {
    owner: 'Electron main process lifecycle',
    purpose: 'Desktop startup samples, process metrics, single-instance routing, and app quit cleanup.',
  },
  [FRONTEND_INTERACTION_DIAGNOSTICS_PATH]: {
    owner: 'Renderer interaction logger through Electron main',
    purpose: 'Sanitized UI interaction breadcrumbs without labels, chat text, or message content.',
  },
  [IPC_BRIDGE_DIAGNOSTICS_PATH]: {
    owner: 'Electron main IPC bridge',
    purpose: 'Backend connection and settings/update bridge milestones that are not owned by one conversation turn.',
  },
  [LOCAL_RUNTIME_LIFECYCLE_DIAGNOSTICS_PATH]: {
    owner: 'Electron main local runtime bridge',
    purpose: 'Local runtime bridge initialization and lifecycle status outside a specific browser action.',
  },
  [MCP_DISCOVERY_DIAGNOSTICS_PATH]: {
    owner: 'Electron main and sidecar MCP runtime',
    purpose: 'MCP stdio discovery, initialization, timeout, and sanitized startup failure evidence.',
  },
  [MCP_ENABLEMENT_DIAGNOSTICS_PATH]: {
    owner: 'Electron main MCP config runtime',
    purpose: 'MCP dashboard enablement toggles and frontend-config persistence lifecycle.',
  },
  [MCP_EXECUTION_DIAGNOSTICS_PATH]: {
    owner: 'Python sidecar MCP runtime',
    purpose: 'MCP tool call execution lifecycle with tool ids, correlation ids, and sanitized transport failures.',
  },
  [MCP_REGISTRATION_DIAGNOSTICS_PATH]: {
    owner: 'Python sidecar MCP runtime',
    purpose: 'SDK/local-runtime MCP registration, reconciliation, and registered tool counts.',
  },
  [PERMISSION_PROBE_DIAGNOSTICS_PATH]: {
    owner: 'Electron main permission runtime',
    purpose: 'Permission probe/request and workspace activation diagnostics before or outside a turn.',
  },
  [SURFACE_VISIBILITY_DIAGNOSTICS_PATH]: {
    owner: 'Electron main surface runtime',
    purpose: 'Chat pill and response-overlay show/hide decisions, phase decisions, guard refs, and final visibility.',
  },
  [WAKEWORD_LIFECYCLE_DIAGNOSTICS_PATH]: {
    owner: 'Electron main wakeword bridge',
    purpose: 'Wakeword service enable/disable, process start/exit, readiness, frame parsing, and detection lifecycle.',
  },
});

const ALLOWED_DATA_KEYS = new Set([
  'hasUserId',
  'userIdSource',
  'userIdMatchesActive',
  'limit',
  'resultCount',
  'canonicalHistoryDbExists',
  'backendConnected',
  'ready',
  'status',
  'statusReason',
  'localRuntimeReady',
  'connected',
  'busyAction',
  'action',
  'event',
  'view',
  'targetTag',
  'targetType',
  'targetRole',
  'hasTargetLabel',
  'messageTextLength',
  'textLength',
  'resourceCount',
  'finalLength',
  'contentLength',
  'attachmentCount',
  'imageCount',
  'readableFileCount',
  'senderSurface',
  'eventType',
  'updatedKeys',
  'provider',
  'model',
  'modelMode',
  'toolsMode',
  'toolName',
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
  'serverId',
  'command',
  'args',
  'phase',
  'mode',
  'source',
  'userHidden',
  'focus',
  'restoreResponseOverlay',
  'resultReason',
  'chatWindowVisible',
  'responseWindowVisible',
  'responseOverlayVisible',
  'responseOverlayVisibleFlag',
  'requestedVisible',
  'responseLayoutMode',
  'width',
  'height',
  'activeGuardRef',
  'staleGuardRef',
  'guardRef',
  'enabled',
  'requestedEnabled',
  'payloadHasEnabledKey',
  'latestHasEnabledKey',
  'diskHasEnabledKey',
  'preserveMcpEnablement',
  'preserveSource',
  'enabledServerCount',
  'previousEnabledServerCount',
  'persistedEnabledServerCount',
  'payloadEnabledServerCount',
  'latestEnabledServerCount',
  'diskEnabledServerCount',
  'registryServerCount',
  'registryReadyCount',
  'registryErrorCount',
  'mcpServerCount',
  'mcpToolCount',
  'replace',
  'requestedServerCount',
  'registeredServerCount',
  'registeredToolCount',
  'errorCount',
  'timeoutMs',
  'elapsedMs',
  'stderrTail',
  'toolCount',
  'exposedToolName',
  'mcpToolName',
  'toolCallId',
  'correlationId',
  'bundleId',
  'turnRef',
  'exitCode',
  'signal',
  'permissionId',
  'permissionStatus',
  'granted',
  'hasDetails',
  'platform',
  'hasWorkspacePath',
  'requestedCount',
  'statusCount',
  'grantedCount',
  'startupLabel',
  'pid',
  'rssMb',
  'heapUsedMb',
  'appProcessCount',
  'browserProcessCount',
  'rendererProcessCount',
  'gpuProcessCount',
  'utilityProcessCount',
  'appWorkingSetMb',
  'singleInstanceLockAcquired',
  'duplicateInstance',
  'focusCooldownMs',
  'vmMode',
  'launchKind',
  'packaged',
  'processPid',
  'exitCode',
  'frameBytes',
  'maxFrameBytes',
  'chunkCount',
  'modelId',
  'confidence',
  'score',
  'audioReady',
  'audioEnabled',
]);

function diagnosticsDatabasePath() {
  if (process.env.WINDIE_APP_DIAGNOSTICS_DB) {
    return process.env.WINDIE_APP_DIAGNOSTICS_DB;
  }
  return path.join(appUserDataRoot(), 'diagnostics', 'diagnostics.db');
}

function appUserDataRoot() {
  if (process.env.WINDIE_USER_DATA_DIR) {
    return process.env.WINDIE_USER_DATA_DIR;
  }
  if (process.platform === 'win32') {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
      APP_DATA_DIR_NAME,
    );
  }
  if (process.platform === 'darwin') {
    return path.join(
      os.homedir(),
      'Library',
      'Application Support',
      APP_DATA_DIR_NAME,
    );
  }
  return path.join(
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
    APP_DATA_DIR_NAME,
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
    return 'local_runtime_unavailable';
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

function listDiagnosticPathDefinitions() {
  return Object.entries(DIAGNOSTIC_PATH_DEFINITIONS)
    .map(([diagnosticPath, definition]) => ({
      path: diagnosticPath,
      owner: definition.owner,
      purpose: definition.purpose,
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

module.exports = {
  APP_DIAGNOSTICS_PATH,
  BROWSER_SESSION_CONTROL_DIAGNOSTICS_PATH,
  DESKTOP_STARTUP_DIAGNOSTICS_PATH,
  FRONTEND_INTERACTION_DIAGNOSTICS_PATH,
  IPC_BRIDGE_DIAGNOSTICS_PATH,
  LOCAL_RUNTIME_LIFECYCLE_DIAGNOSTICS_PATH,
  MCP_DISCOVERY_DIAGNOSTICS_PATH,
  MCP_ENABLEMENT_DIAGNOSTICS_PATH,
  PERMISSION_PROBE_DIAGNOSTICS_PATH,
  SURFACE_VISIBILITY_DIAGNOSTICS_PATH,
  WAKEWORD_LIFECYCLE_DIAGNOSTICS_PATH,
  appendDiagnosticEvent,
  appUserDataRoot,
  diagnosticsDatabasePath,
  inspectDiagnosticTrace,
  listDiagnosticPathDefinitions,
  queryDiagnosticEvents,
};
