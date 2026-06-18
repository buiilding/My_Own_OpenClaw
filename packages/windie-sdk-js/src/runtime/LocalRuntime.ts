/**
 * Coordinates the local runtime provider for the TypeScript SDK runtime.
 */

import type { JsonRecord } from '../conversation/types.js';
import {
  AGENT_LOCAL_RUNTIME_DAEMON_DISCOVERY_FILE_ENV_KEYS,
  AGENT_LOCAL_RUNTIME_DAEMON_SCRIPT_REQUIRED_MESSAGE,
  AGENT_LOCAL_RUNTIME_DAEMON_SCRIPT_ENV_KEYS,
  AGENT_LOCAL_RUNTIME_PYTHON_ENV_KEYS,
  readRuntimeEnv,
} from './RuntimeEnv.js';

const LOCAL_RUNTIME_TOKEN_HEADER = 'x-agent-local-runtime-token';

type FetchLike = typeof fetch;
type EventWebSocketLike = {
  close?: () => void;
  addEventListener?: (event: string, listener: (payload: unknown) => void) => void;
  removeEventListener?: (event: string, listener: (payload: unknown) => void) => void;
  on?: (event: string, listener: (payload: unknown) => void) => void;
  off?: (event: string, listener: (payload: unknown) => void) => void;
};
type EventWebSocketConstructor = new (url: string, options?: JsonRecord) => EventWebSocketLike;

export type AgentToolDefinition = {
  name: string;
  description?: string;
  schema: JsonRecord;
  execution_target?: 'local_runtime';
  argument_resolution?: string;
  module?: string;
  workspacePath?: string;
};

export type AgentSkillDefinition = JsonRecord & {
  id?: string;
  type?: string;
  content?: string;
  priority?: number;
};

export type AgentMcpDefinition = JsonRecord & {
  id?: string;
  name?: string;
  command?: string;
  args?: string[];
};

export type AgentPluginDefinition = JsonRecord & {
  path?: string;
  pluginPath?: string;
};

export type AgentLocalRuntimeClient = {
  status?: () => Promise<JsonRecord>;
  listTools?: () => Promise<{ version?: number; tools?: JsonRecord[] }>;
  registerModuleTool?: (tool: AgentToolDefinition, context: { workspacePath?: string }) => Promise<JsonRecord>;
  registerPlugin?: (plugin: AgentPluginDefinition) => Promise<JsonRecord>;
  registerMcp?: (mcp: AgentMcpDefinition) => Promise<JsonRecord>;
  executeTool?: (payload: AgentLocalToolExecutionPayload) => Promise<{ success?: boolean; data?: JsonRecord; error?: string }>;
  rpc?: (payload: { method: string; params?: JsonRecord; id?: string | number }) => Promise<JsonRecord>;
  subscribeEvents?: (listener: AgentLocalRuntimeEventListener) => () => void;
  shutdown?: () => Promise<void>;
};

export type AgentLocalToolExecutionPayload = {
  toolName: string;
  args: JsonRecord;
  requestId?: string | null;
  bundleId?: string | null;
  toolCallId?: string | null;
  correlationId?: string | null;
  turnRef?: string | null;
  conversationRef?: string | null;
};

export type AgentLocalRuntimeEvent = JsonRecord & {
  type: string;
  payload?: JsonRecord;
};

export type AgentLocalRuntimeEventListener = (event: AgentLocalRuntimeEvent) => void;

export type AgentLocalRuntimeProviderContext<TWakeUpOptions = unknown> = {
  wakeUp: TWakeUpOptions;
  needsLocalRuntime: boolean;
};

export type AgentLocalRuntimeProvider<TWakeUpOptions = unknown> = (
  context: AgentLocalRuntimeProviderContext<TWakeUpOptions>,
) => Promise<AgentLocalRuntimeClient | undefined> | AgentLocalRuntimeClient | undefined;

export type AgentLocalRuntimeHttpClientOptions = {
  baseUrl: string;
  token: string;
  fetchImpl?: FetchLike;
  WebSocketImpl?: EventWebSocketConstructor;
};

type LocalRuntimeLaunchEnvironment = Record<string, string | undefined>;

type AgentLocalRuntimeDiscovery = AgentLocalRuntimeHttpClientOptions & {
  launch?: Record<string, string> | null;
};

export type AgentAutoLocalRuntimeOptions = {
  discoveryFile?: string;
  command?: string;
  args?: string[];
  daemonScript?: string;
  pythonCommand?: string;
  pythonArgs?: string[];
  cwd?: string;
  env?: LocalRuntimeLaunchEnvironment;
  envMode?: 'merge' | 'replace';
  launchContext?: Record<string, string | undefined> | null;
  host?: string;
  port?: number;
  reuseExisting?: boolean;
  startTimeoutMs?: number;
  pollIntervalMs?: number;
  onProcessSpawn?: (details: { command: string; args: string[]; cwd?: string }) => void;
  onStdoutLine?: (line: string) => void;
  onStderrLine?: (line: string) => void;
  fetchImpl?: FetchLike;
  WebSocketImpl?: EventWebSocketConstructor;
};

function resolveFetchImplementation(fetchImpl?: FetchLike): FetchLike {
  if (fetchImpl) {
    return fetchImpl;
  }
  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch.bind(globalThis);
  }
  throw new Error('Agent SDK local runtime client requires a fetch implementation');
}

function normalizeHttpBaseUrl(httpBaseUrl: string): string {
  return httpBaseUrl.replace(/\/+$/, '');
}

function buildEventWebSocketUrl(baseUrl: string): string {
  const normalized = normalizeHttpBaseUrl(baseUrl);
  if (normalized.startsWith('https://')) {
    return `wss://${normalized.slice('https://'.length)}/events`;
  }
  if (normalized.startsWith('http://')) {
    return `ws://${normalized.slice('http://'.length)}/events`;
  }
  return `${normalized}/events`;
}

function buildErrorMessage(status: number, statusText: string, bodyText: string): string {
  const trimmedBody = bodyText.trim();
  if (!trimmedBody) {
    return `Agent SDK request failed (${status} ${statusText})`;
  }
  return `Agent SDK request failed (${status} ${statusText}): ${trimmedBody}`;
}

export function moduleTool(tool: AgentToolDefinition & { module: string }): AgentToolDefinition {
  return {
    ...tool,
    execution_target: 'local_runtime',
    argument_resolution: tool.argument_resolution ?? 'passthrough',
  };
}

export class AgentLocalRuntimeHttpClient implements AgentLocalRuntimeClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: FetchLike;
  private readonly WebSocketImpl?: EventWebSocketConstructor;
  private eventSocket: EventWebSocketLike | null = null;
  private eventListeners = new Set<AgentLocalRuntimeEventListener>();

  constructor(options: AgentLocalRuntimeHttpClientOptions) {
    this.baseUrl = normalizeHttpBaseUrl(options.baseUrl);
    this.token = options.token;
    this.fetchImpl = resolveFetchImplementation(options.fetchImpl);
    this.WebSocketImpl = options.WebSocketImpl;
  }

  async status(): Promise<JsonRecord> {
    return this.request('/status', { method: 'GET' });
  }

  async listTools(): Promise<{ version?: number; tools?: JsonRecord[] }> {
    return this.request('/tools', { method: 'GET' });
  }

  async registerModuleTool(tool: AgentToolDefinition, context: { workspacePath?: string }): Promise<JsonRecord> {
    return this.post('/tools/register-module', {
      name: tool.name,
      description: tool.description,
      module: tool.module,
      schema: tool.schema,
      workspace_path: tool.workspacePath ?? context.workspacePath,
    });
  }

  async registerPlugin(plugin: AgentPluginDefinition): Promise<JsonRecord> {
    return this.post('/plugins/register', plugin);
  }

  async registerMcp(mcp: AgentMcpDefinition): Promise<JsonRecord> {
    return this.post('/mcps/register', mcp);
  }

  async executeTool(payload: AgentLocalToolExecutionPayload): Promise<{ success?: boolean; data?: JsonRecord; error?: string }> {
    return this.post('/execute-tool', {
      tool_name: payload.toolName,
      args: payload.args,
      request_id: payload.requestId,
      bundle_id: payload.bundleId,
      tool_call_id: payload.toolCallId,
      correlation_id: payload.correlationId,
      turn_ref: payload.turnRef,
      conversation_ref: payload.conversationRef,
    });
  }

  async rpc(payload: { method: string; params?: JsonRecord; id?: string | number }): Promise<JsonRecord> {
    const response = await this.post<JsonRecord>('/rpc', {
      jsonrpc: '2.0',
      id: payload.id ?? `sdk-${Date.now()}`,
      method: payload.method,
      params: payload.params ?? {},
    });
    if (response.error && typeof response.error === 'object' && !Array.isArray(response.error)) {
      const error = response.error as JsonRecord;
      throw new Error(
        typeof error.message === 'string' && error.message.trim()
          ? error.message
          : JSON.stringify(error),
      );
    }
    if (response.result && typeof response.result === 'object' && !Array.isArray(response.result)) {
      return response.result as JsonRecord;
    }
    return response;
  }

  async shutdown(): Promise<void> {
    this.closeEventSocket();
    await this.post('/shutdown', {});
  }

  subscribeEvents(listener: AgentLocalRuntimeEventListener): () => void {
    this.eventListeners.add(listener);
    void this.ensureEventSocket();
    return () => {
      this.eventListeners.delete(listener);
      if (this.eventListeners.size === 0) {
        this.closeEventSocket();
      }
    };
  }

  private async ensureEventSocket(): Promise<void> {
    if (this.eventSocket || this.eventListeners.size === 0) {
      return;
    }
    const WebSocketImpl = await this.resolveWebSocketImpl();
    if (!WebSocketImpl || this.eventSocket || this.eventListeners.size === 0) {
      return;
    }
    const socket = new WebSocketImpl(buildEventWebSocketUrl(this.baseUrl), {
      headers: {
        [LOCAL_RUNTIME_TOKEN_HEADER]: this.token,
      },
    });
    this.eventSocket = socket;
    const onMessage = (raw: unknown) => {
      const event = this.parseEventPayload(raw);
      if (!event) {
        return;
      }
      for (const eventListener of this.eventListeners) {
        eventListener(event);
      }
    };
    const onClose = () => {
      if (this.eventSocket === socket) {
        this.eventSocket = null;
      }
    };
    socket.addEventListener?.('message', onMessage);
    socket.addEventListener?.('close', onClose);
    socket.on?.('message', onMessage);
    socket.on?.('close', onClose);
    socket.on?.('error', () => {});
  }

  private closeEventSocket(): void {
    const socket = this.eventSocket;
    this.eventSocket = null;
    socket?.close?.();
  }

  private async resolveWebSocketImpl(): Promise<EventWebSocketConstructor | null> {
    if (this.WebSocketImpl) {
      return this.WebSocketImpl;
    }
    const globalWebSocket = (globalThis as unknown as {
      WebSocket?: EventWebSocketConstructor;
    }).WebSocket;
    if (globalWebSocket) {
      return globalWebSocket;
    }
    try {
      const module = await importNodeModule<{ default?: EventWebSocketConstructor } & EventWebSocketConstructor>('ws');
      return module.default ?? module;
    } catch {
      return null;
    }
  }

  private parseEventPayload(raw: unknown): AgentLocalRuntimeEvent | null {
    try {
      const text = typeof raw === 'string'
        ? raw
        : typeof (raw as { data?: unknown })?.data === 'string'
          ? String((raw as { data: string }).data)
          : raw instanceof Uint8Array
            ? new TextDecoder().decode(raw)
            : String(raw ?? '');
      const payload = JSON.parse(text);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return null;
      }
      const type = (payload as JsonRecord).type;
      if (typeof type !== 'string' || !type.trim()) {
        return null;
      }
      return payload as AgentLocalRuntimeEvent;
    } catch {
      return null;
    }
  }

  private async post<TResponse>(path: string, body: unknown): Promise<TResponse> {
    return this.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private async request<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
    const headers = new Headers(init.headers);
    headers.set(LOCAL_RUNTIME_TOKEN_HEADER, this.token);
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });
    if (!response.ok) {
      throw new Error(buildErrorMessage(response.status, response.statusText, await response.text()));
    }
    return response.json() as Promise<TResponse>;
  }
}

type NodeFsLike = {
  existsSync(path: string): boolean;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
  readFileSync(path: string, encoding: string): string;
  unlinkSync(path: string): void;
};

type NodeOsLike = {
  tmpdir(): string;
};

type NodePathLike = {
  dirname(path: string): string;
  join(...parts: string[]): string;
  resolve(...parts: string[]): string;
};

type NodeChildProcessLike = {
  spawn(command: string, args: string[], options?: Record<string, unknown>): {
    kill?: (signal?: string) => void;
    unref?: () => void;
    stdout?: {
      on?: (event: string, listener: (payload: unknown) => void) => void;
    };
    stderr?: {
      on?: (event: string, listener: (payload: unknown) => void) => void;
    };
  };
};

type NodeSpawnedProcessLike = ReturnType<NodeChildProcessLike['spawn']>;

function attachProcessLineReader(
  stream: { on?: (event: string, listener: (payload: unknown) => void) => void } | undefined,
  onLine: ((line: string) => void) | undefined,
) {
  if (!stream || typeof stream.on !== 'function' || typeof onLine !== 'function') {
    return;
  }
  let remainder = '';
  stream.on('data', (payload: unknown) => {
    const text = payload instanceof Uint8Array
      ? new TextDecoder().decode(payload)
      : String(payload ?? '');
    const lines = `${remainder}${text}`.split(/\r?\n/);
    remainder = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim()) {
        onLine(line);
      }
    }
  });
}

async function importNodeModule<TModule>(specifier: string): Promise<TModule> {
  return import(/* @vite-ignore */ specifier) as Promise<TModule>;
}

async function loadNodeLocalRuntimeModules(): Promise<{
  fs: NodeFsLike;
  os: NodeOsLike;
  path: NodePathLike;
  childProcess: NodeChildProcessLike;
}> {
  const [fs, os, path, childProcess] = await Promise.all([
    importNodeModule<NodeFsLike>('node:fs'),
    importNodeModule<NodeOsLike>('node:os'),
    importNodeModule<NodePathLike>('node:path'),
    importNodeModule<NodeChildProcessLike>('node:child_process'),
  ]);
  return { fs, os, path, childProcess };
}

function isLoopbackHostname(hostname: string): boolean {
  const host = String(hostname || '').toLowerCase();
  if (host === 'localhost' || host === '::1' || host === '[::1]' || host === '0:0:0:0:0:0:0:1') {
    return true;
  }
  const ipv4Match = host.match(/^(\d{1,3})(?:\.(\d{1,3})){3}$/);
  if (!ipv4Match) {
    return false;
  }
  const octets = host.split('.').map(part => Number(part));
  return octets.length === 4
    && octets.every(octet => Number.isInteger(octet) && octet >= 0 && octet <= 255)
    && octets[0] === 127;
}

function normalizeDaemonBaseUrl(value: unknown): string | null {
  const rawBaseUrl = typeof value === 'string' ? value.trim() : '';
  if (!rawBaseUrl) {
    return null;
  }
  try {
    const parsed = new URL(rawBaseUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    if (!isLoopbackHostname(parsed.hostname)) {
      return null;
    }
    if (parsed.username || parsed.password) {
      return null;
    }
    if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function normalizeLaunchContext(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const normalized: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!key) {
      continue;
    }
    normalized[key] = typeof raw === 'string' ? raw.trim() : '';
  }
  return normalized;
}

function launchContextsEqual(
  left: Record<string, string> | null,
  right: Record<string, string> | null,
): boolean {
  if (!left || !right) {
    return false;
  }
  return Object.entries(right).every(([key, value]) => (left[key] ?? '') === value);
}

function normalizeDiscovery(raw: unknown): AgentLocalRuntimeDiscovery | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const payload = raw as JsonRecord;
  if (Object.prototype.hasOwnProperty.call(payload, 'baseUrl')) {
    return null;
  }
  const baseUrl = normalizeDaemonBaseUrl(payload.base_url);
  const token = typeof payload.token === 'string' ? payload.token.trim() : '';
  if (!baseUrl || !token) {
    return null;
  }
  return {
    baseUrl,
    token,
    launch: normalizeLaunchContext(payload.launch),
  };
}

function readDaemonDiscovery(fs: NodeFsLike, discoveryFile: string): AgentLocalRuntimeDiscovery | null {
  try {
    if (!fs.existsSync(discoveryFile)) {
      return null;
    }
    return normalizeDiscovery(JSON.parse(fs.readFileSync(discoveryFile, 'utf8')));
  } catch {
    return null;
  }
}

function deleteDaemonDiscovery(fs: NodeFsLike, discoveryFile: string): void {
  try {
    fs.unlinkSync(discoveryFile);
  } catch {
    // Missing or locked discovery files are handled by the following spawn/probe loop.
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function probeDaemon(
  discovery: AgentLocalRuntimeDiscovery | AgentLocalRuntimeHttpClientOptions | null,
  fetchImpl?: FetchLike,
  WebSocketImpl?: EventWebSocketConstructor,
): Promise<AgentLocalRuntimeHttpClient | null> {
  if (!discovery) {
    return null;
  }
  const client = new AgentLocalRuntimeHttpClient({
    ...discovery,
    fetchImpl,
    WebSocketImpl,
  });
  try {
    await client.status();
    return client;
  } catch {
    return null;
  }
}

async function waitForDaemonStop(
  discovery: AgentLocalRuntimeDiscovery | AgentLocalRuntimeHttpClientOptions | null,
  fetchImpl?: FetchLike,
  WebSocketImpl?: EventWebSocketConstructor,
  timeoutMs = 2000,
  pollIntervalMs = 100,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const running = await probeDaemon(discovery, fetchImpl, WebSocketImpl);
    if (!running) {
      return;
    }
    await sleep(pollIntervalMs);
  }
  throw new Error('Timed out waiting for existing local runtime to stop');
}

async function shutdownDiscoveredDaemon(
  discovery: AgentLocalRuntimeDiscovery | null,
  fetchImpl?: FetchLike,
  WebSocketImpl?: EventWebSocketConstructor,
  timeoutMs = 2000,
  pollIntervalMs = 100,
): Promise<boolean> {
  const existing = await probeDaemon(discovery, fetchImpl, WebSocketImpl);
  if (!existing) {
    return false;
  }
  await existing.shutdown();
  await waitForDaemonStop(discovery, fetchImpl, WebSocketImpl, timeoutMs, pollIntervalMs);
  return true;
}

function resolveDaemonScript(options: AgentAutoLocalRuntimeOptions, path: NodePathLike): string {
  const processLike = (globalThis as unknown as {
    process?: { env?: Record<string, string | undefined> };
  }).process;
  const explicit = options.daemonScript
    ?? readRuntimeEnv(processLike?.env, AGENT_LOCAL_RUNTIME_DAEMON_SCRIPT_ENV_KEYS);
  if (explicit) {
    return path.resolve(explicit);
  }
  throw new Error(AGENT_LOCAL_RUNTIME_DAEMON_SCRIPT_REQUIRED_MESSAGE);
}

function resolveProcessEnv(): LocalRuntimeLaunchEnvironment {
  const processLike = (globalThis as unknown as {
    process?: { env?: LocalRuntimeLaunchEnvironment };
  }).process;
  return processLike?.env ?? {};
}

function buildSpawnEnv(options: AgentAutoLocalRuntimeOptions): LocalRuntimeLaunchEnvironment {
  if (options.envMode === 'replace') {
    return { ...(options.env ?? {}) };
  }
  return {
    ...resolveProcessEnv(),
    ...(options.env ?? {}),
  };
}

function resolveDaemonLaunchCommand(
  options: AgentAutoLocalRuntimeOptions,
  path: NodePathLike,
  discoveryFile: string,
): { command: string; args: string[] } {
  if (typeof options.command === 'string' && options.command.trim()) {
    return {
      command: options.command,
      args: [
        ...(options.args ?? []),
        '--discovery-file',
        discoveryFile,
      ],
    };
  }
  const processEnv = resolveProcessEnv();
  const daemonScript = resolveDaemonScript(options, path);
  const pythonCommand = options.pythonCommand
    ?? readRuntimeEnv(processEnv, AGENT_LOCAL_RUNTIME_PYTHON_ENV_KEYS)
    ?? 'python3';
  return {
    command: pythonCommand,
    args: [
      ...(options.pythonArgs ?? []),
      daemonScript,
      '--discovery-file',
      discoveryFile,
    ],
  };
}

export function createAgentLocalRuntimeProvider<TWakeUpOptions = unknown>(
  options: AgentAutoLocalRuntimeOptions = {},
): AgentLocalRuntimeProvider<TWakeUpOptions> {
  let cachedRuntime: AgentLocalRuntimeClient | undefined;
  let pendingRuntimePromise: Promise<AgentLocalRuntimeClient | undefined> | null = null;
  let ownedProcess: NodeSpawnedProcessLike | null = null;

  async function resolveRuntime(): Promise<AgentLocalRuntimeClient | undefined> {
    if (cachedRuntime) {
      return cachedRuntime;
    }
    let modules: Awaited<ReturnType<typeof loadNodeLocalRuntimeModules>>;
    try {
      modules = await loadNodeLocalRuntimeModules();
    } catch (error) {
      throw new Error(
        `Agent SDK local tools require a Node local runtime provider: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const { fs, os, path, childProcess } = modules;
    const processEnv = resolveProcessEnv();
    const discoveryFile = path.resolve(
      options.discoveryFile
        ?? readRuntimeEnv(processEnv, AGENT_LOCAL_RUNTIME_DAEMON_DISCOVERY_FILE_ENV_KEYS)
        ?? path.join(os.tmpdir(), 'desktop-runtime', 'local-runtime-daemon.json'),
    );
    const fetchImpl = options.fetchImpl;
    const expectedLaunchContext = normalizeLaunchContext(options.launchContext);
    const initialDiscovery = readDaemonDiscovery(fs, discoveryFile);
    if (expectedLaunchContext && initialDiscovery && !launchContextsEqual(initialDiscovery.launch ?? null, expectedLaunchContext)) {
      await shutdownDiscoveredDaemon(
        initialDiscovery,
        fetchImpl,
        options.WebSocketImpl,
        options.startTimeoutMs ?? 10000,
        options.pollIntervalMs ?? 100,
      );
      deleteDaemonDiscovery(fs, discoveryFile);
    }
    const reusableDiscovery = expectedLaunchContext && initialDiscovery
      ? (launchContextsEqual(initialDiscovery.launch ?? null, expectedLaunchContext) ? initialDiscovery : null)
      : initialDiscovery;
    const existing = await probeDaemon(reusableDiscovery, fetchImpl, options.WebSocketImpl);
    if (existing) {
      if (options.reuseExisting === true) {
        cachedRuntime = existing;
        return cachedRuntime;
      }
      await existing.shutdown();
      await waitForDaemonStop(
        initialDiscovery,
        fetchImpl,
        options.WebSocketImpl,
        options.startTimeoutMs ?? 10000,
        options.pollIntervalMs ?? 100,
      );
    }

    fs.mkdirSync(path.dirname(discoveryFile), { recursive: true });
    const launchCommand = resolveDaemonLaunchCommand(options, path, discoveryFile);
    const args = [...launchCommand.args];
    if (options.host) {
      args.push('--host', options.host);
    }
    if (typeof options.port === 'number') {
      args.push('--port', String(options.port));
    }
    const pipeStdout = typeof options.onStdoutLine === 'function';
    const pipeStderr = typeof options.onStderrLine === 'function';
    ownedProcess = childProcess.spawn(launchCommand.command, args, {
      cwd: options.cwd,
      env: buildSpawnEnv(options),
      stdio: (pipeStdout || pipeStderr)
        ? ['ignore', pipeStdout ? 'pipe' : 'ignore', pipeStderr ? 'pipe' : 'ignore']
        : 'ignore',
      detached: true,
    });
    try {
      options.onProcessSpawn?.({
        command: launchCommand.command,
        args,
        cwd: options.cwd,
      });
    } catch {
      // Logging callbacks must not break daemon startup.
    }
    attachProcessLineReader(ownedProcess.stdout, options.onStdoutLine);
    attachProcessLineReader(ownedProcess.stderr, options.onStderrLine);
    ownedProcess.unref?.();

    const deadline = Date.now() + (options.startTimeoutMs ?? 10000);
    const pollIntervalMs = options.pollIntervalMs ?? 100;
    while (Date.now() < deadline) {
      const discovered = readDaemonDiscovery(fs, discoveryFile);
      if (expectedLaunchContext && discovered && !launchContextsEqual(discovered.launch ?? null, expectedLaunchContext)) {
        deleteDaemonDiscovery(fs, discoveryFile);
        await sleep(pollIntervalMs);
        continue;
      }
      const started = await probeDaemon(discovered, fetchImpl, options.WebSocketImpl);
      if (started) {
        cachedRuntime = {
          status: () => started.status(),
          listTools: () => started.listTools(),
          registerModuleTool: (tool, context) => started.registerModuleTool(tool, context),
          registerPlugin: plugin => started.registerPlugin(plugin),
          registerMcp: mcp => started.registerMcp(mcp),
          executeTool: payload => started.executeTool(payload),
          rpc: payload => started.rpc(payload),
          subscribeEvents: listener => started.subscribeEvents(listener),
          shutdown: async () => {
            try {
              await started.shutdown();
            } finally {
              ownedProcess?.kill?.('SIGTERM');
              ownedProcess = null;
              cachedRuntime = undefined;
            }
          },
        };
        return cachedRuntime;
      }
      await sleep(pollIntervalMs);
    }
    ownedProcess?.kill?.('SIGTERM');
    ownedProcess = null;
    throw new Error(`Timed out waiting for local runtime discovery at ${discoveryFile}`);
  }

  return async () => {
    if (cachedRuntime) {
      return cachedRuntime;
    }
    if (pendingRuntimePromise) {
      return pendingRuntimePromise;
    }
    pendingRuntimePromise = resolveRuntime();
    try {
      return await pendingRuntimePromise;
    } finally {
      pendingRuntimePromise = null;
    }
  };
}
