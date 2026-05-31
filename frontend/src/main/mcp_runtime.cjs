const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');

const { buildClientToolManifest } = require('./tool_manifest.cjs');
const { loadExtensionMcpServers } = require('./extension_manifest.cjs');

const DEFAULT_MCP_PROTOCOL_VERSION = '2024-11-05';
const DEFAULT_MCP_REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_MCP_CLIENT_INFO = Object.freeze({
  name: 'WindieOS',
  version: '0.6.23',
});

const clientCache = new Map();
const toolRegistry = new Map();

function normalizeString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
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

function normalizeMcpServerSpec(server) {
  if (!server || typeof server !== 'object' || Array.isArray(server)) {
    return null;
  }
  const id = normalizeString(server.id || server.name);
  const command = normalizeString(server.command);
  if (!id || !command || server.enabled === false) {
    return null;
  }
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
    timeout_ms: Number.isFinite(Number(server.timeout_ms || server.timeoutMs))
      ? Number(server.timeout_ms || server.timeoutMs)
      : DEFAULT_MCP_REQUEST_TIMEOUT_MS,
    tool_prefix: normalizeString(server.tool_prefix || server.toolPrefix),
    tools: Array.isArray(server.tools) ? server.tools : [],
    extension_id: normalizeString(server.extension_id),
  };
}

function loadMcpServerSpecs(options = {}) {
  const configuredServers = Array.isArray(options.mcpServers)
    ? options.mcpServers
    : loadExtensionMcpServers({ contributionsDir: options.contributionsDir });
  return configuredServers.map(normalizeMcpServerSpec).filter(Boolean);
}

function cacheKeyForServer(server) {
  const envEntries = Object.keys(server.env || {})
    .sort()
    .map((key) => [key, String(server.env[key])]);
  const envFingerprint = crypto
    .createHash('sha256')
    .update(JSON.stringify(envEntries))
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
    this.proc = null;
    this.buffer = '';
    this.nextRequestId = 1;
    this.pending = new Map();
    this.initialized = false;
    this.stderrTail = [];
  }

  async ensureStarted() {
    if (this.proc) {
      return;
    }
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
      this.rejectAll(new Error(`MCP server ${this.server.id} exited with ${reason}`));
      this.proc = null;
      this.initialized = false;
    });
    this.proc.on?.('error', (error) => {
      this.rejectAll(error);
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
    const id = this.nextRequestId;
    this.nextRequestId += 1;
    const message = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP ${method} timed out for ${this.server.id}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
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
  const cacheKey = cacheKeyForServer(server);
  if (!clientCache.has(cacheKey)) {
    clientCache.set(cacheKey, new McpStdioClient(server, options));
  }
  return clientCache.get(cacheKey);
}

function normalizeDiscoveredTool(server, tool, registry = toolRegistry) {
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
  registry.set(exposedName, {
    server,
    originalToolName,
  });
  return manifestTool;
}

async function discoverMcpTools(options = {}) {
  const servers = loadMcpServerSpecs(options);
  const tools = [];
  const errors = [];
  const nextToolRegistry = new Map();
  for (const server of servers) {
    try {
      const client = getMcpClient(server, options);
      const discoveredTools = options.discover === false
        ? server.tools
        : await client.listTools();
      for (const tool of discoveredTools) {
        const manifestTool = normalizeDiscoveredTool(server, tool, nextToolRegistry);
        if (manifestTool) {
          tools.push(manifestTool);
        }
      }
    } catch (error) {
      errors.push({
        server_id: server.id,
        reason: error?.message || String(error),
      });
      for (const fallbackTool of server.tools) {
        const manifestTool = normalizeDiscoveredTool(server, fallbackTool, nextToolRegistry);
        if (manifestTool) {
          tools.push(manifestTool);
        }
      }
    }
  }
  toolRegistry.clear();
  for (const [name, registration] of nextToolRegistry.entries()) {
    toolRegistry.set(name, registration);
  }
  return { tools, errors };
}

async function buildClientToolManifestWithMcp(options = {}) {
  const disabledTools = new Set(Array.isArray(options.disabledTools) ? options.disabledTools : []);
  const baseManifest = options.baseManifest || buildClientToolManifest(options);
  const seenNames = new Set((baseManifest.tools || []).map((tool) => tool.name));
  const discovered = await discoverMcpTools(options);
  const mcpTools = discovered.tools.filter((tool) => {
    if (!tool?.name || disabledTools.has(tool.name) || seenNames.has(tool.name)) {
      toolRegistry.delete(tool?.name);
      return false;
    }
    seenNames.add(tool.name);
    return true;
  });
  return {
    version: baseManifest.version || 1,
    tools: [
      ...(baseManifest.tools || []),
      ...mcpTools,
    ],
    mcp_errors: discovered.errors,
  };
}

function formatMcpContent(content) {
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return '';
      }
      if (item.type === 'text' && typeof item.text === 'string') {
        return item.text;
      }
      if (item.type === 'resource' && item.resource) {
        return JSON.stringify(item.resource);
      }
      return JSON.stringify(item);
    })
    .filter(Boolean)
    .join('\n\n');
}

async function executeMcpTool(toolName, args = {}, context = {}, options = {}) {
  const normalizedToolName = normalizeString(toolName);
  if (!normalizedToolName) {
    return null;
  }
  if (!toolRegistry.has(normalizedToolName)) {
    await discoverMcpTools(options);
  }
  const registration = toolRegistry.get(normalizedToolName);
  if (!registration) {
    return null;
  }
  try {
    const client = getMcpClient(registration.server, options);
    const result = await client.callTool(registration.originalToolName, args, context);
    const text = formatMcpContent(result?.content);
    if (result?.isError) {
      return {
        success: false,
        error: text || `MCP tool ${registration.originalToolName} failed`,
      };
    }
    return {
      success: true,
      data: {
        output: text || JSON.stringify(result || {}),
        mcp_result: result || null,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error?.message || String(error),
    };
  }
}

function hasDiscoveredMcpTool(toolName) {
  return toolRegistry.has(normalizeString(toolName));
}

function clearMcpRuntimeCache() {
  for (const client of clientCache.values()) {
    client.close?.();
  }
  clientCache.clear();
  toolRegistry.clear();
}

module.exports = {
  McpStdioClient,
  buildClientToolManifestWithMcp,
  clearMcpRuntimeCache,
  createMcpToolName,
  discoverMcpTools,
  executeMcpTool,
  formatMcpContent,
  hasDiscoveredMcpTool,
  loadMcpServerSpecs,
  normalizeMcpServerSpec,
};
