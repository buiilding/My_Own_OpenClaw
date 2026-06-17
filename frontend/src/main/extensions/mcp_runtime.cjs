/**
 * Coordinates the mcp runtime for the Electron main process.
 */

const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');

const { buildClientToolManifest } = require('./tool_manifest.cjs');
const { loadExtensionMcpServers } = require('./extension_manifest.cjs');

const DEFAULT_MCP_PROTOCOL_VERSION = '2024-11-05';
const DEFAULT_MCP_REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_MCP_CLIENT_INFO = Object.freeze({
  name: 'Desktop Agent',
  version: '0.0.0',
});

const clientCache = new Map();
const MAX_DIAGNOSTIC_TEXT_LENGTH = 240;

function normalizeString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function normalizeMcpEnablementIds(values) {
  const sourceValues = Array.isArray(values)
    ? values
    : (typeof values === 'string' ? values.split(',') : []);
  const normalized = new Set();
  for (const value of sourceValues) {
    const item = normalizeString(value);
    if (item) {
      normalized.add(item);
    }
  }
  return normalized;
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function sanitizeDiagnosticText(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const text = String(value)
    .replace(/[A-Za-z]:\\[^\s'"]+/g, '[path]')
    .replace(/\/(?:Users|private|var|tmp|Volumes|Applications)\/[^\s'"]+/g, '[path]')
    .replace(/(?:bearer|token|api[_-]?key|secret|password)=?[^\s'",)]+/gi, '$1=[redacted]')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > MAX_DIAGNOSTIC_TEXT_LENGTH
    ? `${text.slice(0, MAX_DIAGNOSTIC_TEXT_LENGTH - 3)}...`
    : text;
}

function serializeDiagnosticArgs(args = []) {
  const sanitizedArgs = (Array.isArray(args) ? args : [])
    .map((arg) => sanitizeDiagnosticText(arg))
    .filter(Boolean);
  return sanitizeDiagnosticText(JSON.stringify(sanitizedArgs));
}

function commandForDiagnostics(command) {
  const normalized = normalizeString(command);
  if (!normalized) {
    return '';
  }
  return sanitizeDiagnosticText(path.basename(normalized));
}

function methodPhase(method) {
  if (method === 'initialize') {
    return 'initialize';
  }
  if (method === 'tools/list') {
    return 'tools_list';
  }
  if (method === 'tools/call') {
    return 'tools_call';
  }
  return normalizeString(method).replace(/[^a-zA-Z0-9_-]+/g, '_') || 'request';
}

function emitMcpDiagnostic(diagnostics, event = {}) {
  const emit = diagnostics && typeof diagnostics.emit === 'function'
    ? diagnostics.emit
    : null;
  if (!emit) {
    return;
  }
  try {
    void Promise.resolve(emit(event)).catch(() => undefined);
  } catch {
    // Diagnostics must never affect MCP discovery or execution.
  }
}

function normalizeManifestVersion(value) {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : 1;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
  }
  return 1;
}

function normalizeToolNameSegment(value) {
  const normalized = normalizeString(value)
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || 'tool';
}

function createMcpToolName(serverId, toolName, prefix = '') {
  const normalizedPrefix = normalizeToolNameSegment(prefix || `mcp_${serverId}`);
  return `${normalizedPrefix}__${normalizeToolNameSegment(toolName)}`;
}

function normalizeMcpSchema(schema) {
  const normalized = normalizeObject(schema);
  if (normalized.type === 'object') {
    return normalized;
  }
  return {
    type: 'object',
    properties: {},
    additionalProperties: true,
  };
}

function readMcpTimeoutMs(server) {
  if (Object.prototype.hasOwnProperty.call(server, 'timeout_ms')) {
    return server.timeout_ms;
  }
  return server.timeoutMs;
}

function normalizeMcpServerSpec(server) {
  if (!server || typeof server !== 'object' || Array.isArray(server)) {
    return null;
  }
  const id = normalizeString(server.id || server.name);
  const command = normalizeString(server.command);
  if (!id || !command || server.enabled === false) {
    return null;
  }
  const timeoutMs = Number(readMcpTimeoutMs(server));
  const mcpId = normalizeString(server.mcp_id || server.mcpId);
  return {
    id,
    name: normalizeString(server.name) || id,
    description: normalizeString(server.description),
    command,
    args: Array.isArray(server.args)
      ? server.args.filter((arg) => typeof arg === 'string')
      : [],
    env: normalizeObject(server.env),
    cwd: normalizeString(server.cwd) || process.cwd(),
    timeout_ms: Number.isFinite(timeoutMs)
      ? timeoutMs
      : DEFAULT_MCP_REQUEST_TIMEOUT_MS,
    tool_prefix: normalizeString(server.tool_prefix || server.toolPrefix),
    requires_user_enable: server.requires_user_enable === true || server.requiresUserEnable === true,
    tools: Array.isArray(server.tools) ? server.tools : [],
    mcp_id: mcpId,
    extension_id: normalizeString(server.extension_id),
  };
}

function readEnabledMcpServersOption(options) {
  if (Object.prototype.hasOwnProperty.call(options, 'enabledMcpServers')) {
    return options.enabledMcpServers;
  }
  if (Object.prototype.hasOwnProperty.call(options, 'enabledMcpServerIds')) {
    return options.enabledMcpServerIds;
  }
  return process.env.WINDIE_ENABLED_MCPS;
}

function isMcpServerEnabled(server, enabledMcpIds = normalizeMcpEnablementIds()) {
  if (!server || server.enabled === false) {
    return false;
  }
  if (server.requires_user_enable !== true) {
    return true;
  }
  if (enabledMcpIds.has('*')) {
    return true;
  }
  return [server.id, server.mcp_id, server.extension_id]
    .filter(Boolean)
    .some((id) => enabledMcpIds.has(id));
}

function loadMcpServerSpecs(options = {}) {
  const configuredServers = Array.isArray(options.mcpServers)
    ? options.mcpServers
    : loadExtensionMcpServers({ contributionsDir: options.contributionsDir });
  const enabledMcpIds = normalizeMcpEnablementIds(readEnabledMcpServersOption(options));
  return configuredServers
    .map(normalizeMcpServerSpec)
    .filter((server) => server && isMcpServerEnabled(server, enabledMcpIds));
}

function cacheKeyForServer(server, options = {}) {
  const envEntries = Object.keys(server.env || {})
    .sort()
    .map((key) => [key, String(server.env[key])]);
  const clientInfo = normalizeObject(options.clientInfo || DEFAULT_MCP_CLIENT_INFO);
  const envFingerprint = crypto
    .createHash('sha256')
    .update(JSON.stringify({
      env: envEntries,
      clientInfo,
    }))
    .digest('hex');
  return [
    server.id,
    server.command,
    JSON.stringify(server.args),
    server.cwd,
    envFingerprint,
  ].join('|');
}

class McpStdioClient {
  constructor(server, options = {}) {
    this.server = server;
    this.spawnImpl = options.spawnImpl || spawn;
    this.protocolVersion = options.protocolVersion || DEFAULT_MCP_PROTOCOL_VERSION;
    this.clientInfo = options.clientInfo || DEFAULT_MCP_CLIENT_INFO;
    this.diagnostics = options.diagnostics || null;
    this.proc = null;
    this.buffer = '';
    this.nextRequestId = 1;
    this.pending = new Map();
    this.initialized = false;
    this.stderrTail = [];
    this.lastProcessError = null;
  }

  diagnosticData(extra = {}) {
    return {
      serverId: this.server.id,
      command: commandForDiagnostics(this.server.command),
      args: serializeDiagnosticArgs(this.server.args),
      stderrTail: sanitizeDiagnosticText(this.stderrTail.join('\n')),
      ...extra,
    };
  }

  emitDiagnostic(event = {}) {
    emitMcpDiagnostic(this.diagnostics, {
      runtime: 'electron-main',
      ...event,
      data: this.diagnosticData(event.data || {}),
    });
  }

  buildFailureMessage(message, data = {}) {
    const details = [];
    const command = commandForDiagnostics(this.server.command);
    const args = serializeDiagnosticArgs(this.server.args);
    const stderrTail = sanitizeDiagnosticText(this.stderrTail.join('\n'));
    const processError = sanitizeDiagnosticText(this.lastProcessError?.message);
    if (command) {
      details.push(`command=${command}`);
    }
    if (args) {
      details.push(`args=${args}`);
    }
    if (data.elapsedMs !== undefined) {
      details.push(`elapsed_ms=${data.elapsedMs}`);
    }
    if (data.timeoutMs !== undefined) {
      details.push(`timeout_ms=${data.timeoutMs}`);
    }
    if (stderrTail) {
      details.push(`stderr=${JSON.stringify(stderrTail)}`);
    }
    if (processError) {
      details.push(`process_error=${JSON.stringify(processError)}`);
    }
    return details.length > 0 ? `${message} (${details.join('; ')})` : message;
  }

  async ensureStarted() {
    if (this.proc) {
      return;
    }
    this.lastProcessError = null;
    this.emitDiagnostic({
      stage: 'process_spawn',
      status: 'started',
      data: {
        phase: 'spawn',
      },
    });
    this.proc = this.spawnImpl(this.server.command, this.server.args, {
      cwd: path.resolve(this.server.cwd || process.cwd()),
      env: {
        ...process.env,
        ...this.server.env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.proc.stdout?.on?.('data', (chunk) => this.handleStdout(chunk));
    this.proc.stderr?.on?.('data', (chunk) => this.handleStderr(chunk));
    this.proc.on?.('exit', (code, signal) => {
      const reason = signal ? `signal ${signal}` : `code ${code}`;
      this.emitDiagnostic({
        stage: 'process_exit',
        status: code === 0 && !signal ? 'succeeded' : 'failed',
        data: {
          phase: 'spawn',
          exitCode: Number.isFinite(code) ? code : null,
          signal: normalizeString(signal),
        },
        error: code === 0 && !signal ? null : new Error(`MCP server ${this.server.id} exited with ${reason}`),
      });
      this.rejectAll(new Error(this.buildFailureMessage(
        `MCP server ${this.server.id} exited with ${reason}`,
      )));
      this.proc = null;
      this.initialized = false;
    });
    this.proc.on?.('error', (error) => {
      this.lastProcessError = error;
      this.emitDiagnostic({
        stage: 'process_error',
        status: 'failed',
        data: {
          phase: 'spawn',
        },
        error,
      });
      this.rejectAll(new Error(this.buildFailureMessage(
        `MCP process error for ${this.server.id}: ${error?.message || error}`,
      )));
      this.proc = null;
      this.initialized = false;
    });
  }

  handleStdout(chunk) {
    this.buffer += chunk.toString('utf8');
    let newlineIndex = this.buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const rawLine = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (rawLine) {
        this.handleMessageLine(rawLine);
      }
      newlineIndex = this.buffer.indexOf('\n');
    }
  }

  handleStderr(chunk) {
    const text = chunk.toString('utf8').trim();
    if (!text) {
      return;
    }
    this.stderrTail.push(text);
    if (this.stderrTail.length > 20) {
      this.stderrTail.shift();
    }
  }

  handleMessageLine(rawLine) {
    let message;
    try {
      message = JSON.parse(rawLine);
    } catch (_error) {
      return;
    }
    if (message && Object.prototype.hasOwnProperty.call(message, 'id')) {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
        return;
      }
      pending.resolve(message.result);
    }
  }

  rejectAll(error) {
    for (const [requestId, pending] of this.pending.entries()) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(requestId);
    }
  }

  send(message) {
    this.proc?.stdin?.write?.(`${JSON.stringify(message)}\n`);
  }

  async request(method, params = {}, timeoutMs = this.server.timeout_ms) {
    await this.ensureStarted();
    if (this.lastProcessError) {
      throw new Error(this.buildFailureMessage(
        `MCP process error for ${this.server.id}: ${this.lastProcessError.message || this.lastProcessError}`,
      ));
    }
    const id = this.nextRequestId;
    this.nextRequestId += 1;
    const phase = methodPhase(method);
    const startedAt = Date.now();
    const message = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };
    this.emitDiagnostic({
      stage: 'request_start',
      status: 'started',
      data: {
        phase,
        timeoutMs,
      },
    });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        const elapsedMs = Date.now() - startedAt;
        const error = new Error(this.buildFailureMessage(
          `MCP ${method} timed out for ${this.server.id}`,
          { elapsedMs, timeoutMs },
        ));
        this.emitDiagnostic({
          stage: 'request_timeout',
          status: 'failed',
          durationMs: elapsedMs,
          data: {
            phase,
            timeoutMs,
            elapsedMs,
          },
          error,
        });
        reject(error);
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (result) => {
          const elapsedMs = Date.now() - startedAt;
          this.emitDiagnostic({
            stage: 'request_succeeded',
            status: 'succeeded',
            durationMs: elapsedMs,
            data: {
              phase,
              elapsedMs,
            },
          });
          resolve(result);
        },
        reject,
        timer,
      });
      this.send(message);
    });
  }

  async notify(method, params = {}) {
    await this.ensureStarted();
    this.send({
      jsonrpc: '2.0',
      method,
      params,
    });
  }

  async initialize() {
    if (this.initialized) {
      return;
    }
    await this.request('initialize', {
      protocolVersion: this.protocolVersion,
      capabilities: {
        roots: {
          listChanged: false,
        },
        sampling: {},
      },
      clientInfo: this.clientInfo,
    });
    await this.notify('notifications/initialized');
    this.initialized = true;
  }

  async listTools() {
    await this.initialize();
    const tools = [];
    let cursor = null;
    do {
      const result = await this.request(
        'tools/list',
        cursor ? { cursor } : {},
      );
      tools.push(...(Array.isArray(result?.tools) ? result.tools : []));
      cursor = normalizeString(result?.nextCursor);
    } while (cursor);
    return tools;
  }

  async callTool(name, args = {}) {
    await this.initialize();
    return this.request('tools/call', {
      name,
      arguments: normalizeObject(args),
    });
  }

  close() {
    this.rejectAll(new Error(`MCP server ${this.server.id} closed`));
    this.proc?.kill?.();
    this.proc = null;
    this.initialized = false;
  }
}

function getMcpClient(server, options = {}) {
  if (typeof options.createClient === 'function') {
    return options.createClient(server);
  }
  const cacheKey = cacheKeyForServer(server, options);
  if (!clientCache.has(cacheKey)) {
    clientCache.set(cacheKey, new McpStdioClient(server, options));
  }
  return clientCache.get(cacheKey);
}

function normalizeDiscoveredTool(server, tool) {
  if (!tool || typeof tool !== 'object' || Array.isArray(tool)) {
    return null;
  }
  const originalToolName = normalizeString(tool.name);
  if (!originalToolName) {
    return null;
  }
  const exposedName = createMcpToolName(server.id, originalToolName, server.tool_prefix);
  const description = normalizeString(tool.description)
    || `Tool ${originalToolName} exposed by MCP server ${server.name}.`;
  const manifestTool = {
    name: exposedName,
    description: `[MCP:${server.name}] ${description}`,
    execution_target: 'sidecar',
    schema: normalizeMcpSchema(tool.inputSchema || tool.input_schema || tool.schema),
    argument_resolution: 'passthrough',
    extension_id: server.extension_id || `mcp:${server.id}`,
    mcp_server_id: server.id,
    mcp_tool_name: originalToolName,
  };
  return manifestTool;
}

async function discoverMcpTools(options = {}) {
  const servers = loadMcpServerSpecs(options);
  const tools = [];
  const errors = [];
  for (const server of servers) {
    const startedAt = Date.now();
    emitMcpDiagnostic(options.diagnostics, {
      stage: 'server_discovery_start',
      status: 'started',
      runtime: 'electron-main',
      data: {
        serverId: server.id,
        command: commandForDiagnostics(server.command),
        args: serializeDiagnosticArgs(server.args),
        phase: 'discovery',
        timeoutMs: server.timeout_ms,
      },
    });
    try {
      const client = getMcpClient(server, options);
      const discoveredTools = options.discover === false
        ? server.tools
        : await client.listTools();
      const durationMs = Date.now() - startedAt;
      for (const tool of discoveredTools) {
        const manifestTool = normalizeDiscoveredTool(server, tool);
        if (manifestTool) {
          tools.push(manifestTool);
        }
      }
      emitMcpDiagnostic(options.diagnostics, {
        stage: 'server_discovery_succeeded',
        status: 'succeeded',
        runtime: 'electron-main',
        durationMs,
        data: {
          serverId: server.id,
          command: commandForDiagnostics(server.command),
          args: serializeDiagnosticArgs(server.args),
          phase: 'discovery',
          elapsedMs: durationMs,
          toolCount: discoveredTools.length,
        },
      });
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      emitMcpDiagnostic(options.diagnostics, {
        stage: 'server_discovery_failed',
        status: 'failed',
        runtime: 'electron-main',
        durationMs,
        data: {
          serverId: server.id,
          command: commandForDiagnostics(server.command),
          args: serializeDiagnosticArgs(server.args),
          phase: 'discovery',
          elapsedMs: durationMs,
        },
        error,
      });
      errors.push({
        server_id: server.id,
        reason: error?.message || String(error),
      });
      for (const fallbackTool of server.tools) {
        const manifestTool = normalizeDiscoveredTool(server, fallbackTool);
        if (manifestTool) {
          tools.push(manifestTool);
        }
      }
    }
  }
  return { tools, errors };
}

async function buildClientToolManifestWithMcp(options = {}) {
  const disabledTools = new Set(Array.isArray(options.disabledTools) ? options.disabledTools : []);
  const baseManifest = options.baseManifest || buildClientToolManifest(options);
  const baseTools = Array.isArray(baseManifest.tools) ? baseManifest.tools : [];
  const seenNames = new Set(baseTools.map((tool) => tool.name));
  const discovered = await discoverMcpTools(options);
  const mcpTools = discovered.tools.filter((tool) => {
    if (!tool?.name || disabledTools.has(tool.name) || seenNames.has(tool.name)) {
      return false;
    }
    seenNames.add(tool.name);
    return true;
  });
  return {
    version: normalizeManifestVersion(baseManifest.version),
    tools: [
      ...baseTools,
      ...mcpTools,
    ],
    mcp_errors: discovered.errors,
  };
}

function clearMcpRuntimeCache() {
  for (const client of clientCache.values()) {
    client.close?.();
  }
  clientCache.clear();
}

module.exports = {
  buildClientToolManifestWithMcp,
  clearMcpRuntimeCache,
  createMcpToolName,
};
