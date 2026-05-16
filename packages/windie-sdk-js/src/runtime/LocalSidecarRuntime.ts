import type { JsonRecord } from '../conversation/types.js';

type FetchLike = typeof fetch;

export type WindieToolDefinition = {
  name: string;
  description?: string;
  schema: JsonRecord;
  execution_target?: 'sidecar';
  argument_resolution?: string;
  module?: string;
  workspacePath?: string;
};

export type WindieSkillDefinition = JsonRecord & {
  id?: string;
  type?: string;
  content?: string;
  priority?: number;
};

export type WindieMcpDefinition = JsonRecord & {
  id?: string;
  name?: string;
  command?: string;
  args?: string[];
};

export type WindiePluginDefinition = JsonRecord & {
  path?: string;
  pluginPath?: string;
};

export type WindieLocalRuntimeClient = {
  status?: () => Promise<JsonRecord>;
  listTools?: () => Promise<{ version?: number; tools?: JsonRecord[] }>;
  registerModuleTool?: (tool: WindieToolDefinition, context: { workspacePath?: string }) => Promise<JsonRecord>;
  registerPlugin?: (plugin: WindiePluginDefinition) => Promise<JsonRecord>;
  registerMcp?: (mcp: WindieMcpDefinition) => Promise<JsonRecord>;
  executeTool?: (payload: { toolName: string; args: JsonRecord }) => Promise<{ success?: boolean; data?: JsonRecord; error?: string }>;
  shutdown?: () => Promise<void>;
};

export type WindieLocalRuntimeProviderContext<TWakeUpOptions = unknown> = {
  wakeUp: TWakeUpOptions;
  needsLocalRuntime: boolean;
};

export type WindieLocalRuntimeProvider<TWakeUpOptions = unknown> = (
  context: WindieLocalRuntimeProviderContext<TWakeUpOptions>,
) => Promise<WindieLocalRuntimeClient | undefined> | WindieLocalRuntimeClient | undefined;

export type SidecarDaemonClientOptions = {
  baseUrl: string;
  token: string;
  fetchImpl?: FetchLike;
};

export type WindieAutoSidecarOptions = {
  discoveryFile?: string;
  daemonScript?: string;
  pythonCommand?: string;
  pythonArgs?: string[];
  host?: string;
  port?: number;
  startTimeoutMs?: number;
  pollIntervalMs?: number;
  fetchImpl?: FetchLike;
};

function resolveFetchImplementation(fetchImpl?: FetchLike): FetchLike {
  if (fetchImpl) {
    return fetchImpl;
  }
  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch.bind(globalThis);
  }
  throw new Error('WindieSdkClient requires a fetch implementation');
}

function normalizeHttpBaseUrl(httpBaseUrl: string): string {
  return httpBaseUrl.replace(/\/+$/, '');
}

function buildErrorMessage(status: number, statusText: string, bodyText: string): string {
  const trimmedBody = bodyText.trim();
  if (!trimmedBody) {
    return `Windie SDK request failed (${status} ${statusText})`;
  }
  return `Windie SDK request failed (${status} ${statusText}): ${trimmedBody}`;
}

export function moduleTool(tool: WindieToolDefinition & { module: string }): WindieToolDefinition {
  return {
    ...tool,
    execution_target: 'sidecar',
    argument_resolution: tool.argument_resolution ?? 'passthrough',
  };
}

export class SidecarDaemonHttpClient implements WindieLocalRuntimeClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: SidecarDaemonClientOptions) {
    this.baseUrl = normalizeHttpBaseUrl(options.baseUrl);
    this.token = options.token;
    this.fetchImpl = resolveFetchImplementation(options.fetchImpl);
  }

  async status(): Promise<JsonRecord> {
    return this.request('/status', { method: 'GET' });
  }

  async listTools(): Promise<{ version?: number; tools?: JsonRecord[] }> {
    return this.request('/tools', { method: 'GET' });
  }

  async registerModuleTool(tool: WindieToolDefinition, context: { workspacePath?: string }): Promise<JsonRecord> {
    return this.post('/tools/register-module', {
      name: tool.name,
      description: tool.description,
      module: tool.module,
      schema: tool.schema,
      workspace_path: tool.workspacePath ?? context.workspacePath,
    });
  }

  async registerPlugin(plugin: WindiePluginDefinition): Promise<JsonRecord> {
    return this.post('/plugins/register', plugin);
  }

  async registerMcp(mcp: WindieMcpDefinition): Promise<JsonRecord> {
    return this.post('/mcps/register', mcp);
  }

  async executeTool(payload: { toolName: string; args: JsonRecord }): Promise<{ success?: boolean; data?: JsonRecord; error?: string }> {
    return this.post('/execute-tool', {
      tool_name: payload.toolName,
      args: payload.args,
    });
  }

  async shutdown(): Promise<void> {
    await this.post('/shutdown', {});
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
    headers.set('x-windie-sidecar-token', this.token);
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
  spawn(command: string, args: string[], options?: JsonRecord): {
    kill?: (signal?: string) => void;
    unref?: () => void;
  };
};

async function importNodeModule<TModule>(specifier: string): Promise<TModule> {
  return import(/* @vite-ignore */ specifier) as Promise<TModule>;
}

async function loadNodeSidecarModules(): Promise<{
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

function normalizeDiscovery(raw: unknown): SidecarDaemonClientOptions | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const payload = raw as JsonRecord;
  const baseUrl = typeof payload.base_url === 'string'
    ? payload.base_url.trim()
    : (typeof payload.baseUrl === 'string' ? payload.baseUrl.trim() : '');
  const token = typeof payload.token === 'string' ? payload.token.trim() : '';
  if (!baseUrl || !token) {
    return null;
  }
  return { baseUrl, token };
}

function readDaemonDiscovery(fs: NodeFsLike, discoveryFile: string): SidecarDaemonClientOptions | null {
  try {
    if (!fs.existsSync(discoveryFile)) {
      return null;
    }
    return normalizeDiscovery(JSON.parse(fs.readFileSync(discoveryFile, 'utf8')));
  } catch {
    return null;
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function probeDaemon(
  discovery: SidecarDaemonClientOptions | null,
  fetchImpl?: FetchLike,
): Promise<SidecarDaemonHttpClient | null> {
  if (!discovery) {
    return null;
  }
  const client = new SidecarDaemonHttpClient({
    ...discovery,
    fetchImpl,
  });
  try {
    await client.status();
    return client;
  } catch {
    return null;
  }
}

function resolveDaemonScript(options: WindieAutoSidecarOptions, fs: NodeFsLike, path: NodePathLike): string {
  const processLike = (globalThis as unknown as {
    process?: { cwd?: () => string; env?: Record<string, string | undefined> };
  }).process;
  const explicit = options.daemonScript
    ?? processLike?.env?.WINDIE_SIDECAR_DAEMON_SCRIPT;
  if (explicit) {
    return path.resolve(explicit);
  }
  const cwd = typeof processLike?.cwd === 'function'
    ? processLike.cwd()
    : '.';
  const candidates = [
    path.resolve(cwd, 'frontend/src/main/python/sidecar_daemon.py'),
    path.resolve(cwd, 'src/main/python/sidecar_daemon.py'),
  ];
  const found = candidates.find(candidate => fs.existsSync(candidate));
  if (found) {
    return found;
  }
  throw new Error(
    'WindieClient could not locate sidecar_daemon.py. Set WINDIE_SIDECAR_DAEMON_SCRIPT or pass autoSidecar.daemonScript.',
  );
}

export function createWindieLocalRuntimeProvider<TWakeUpOptions = unknown>(
  options: WindieAutoSidecarOptions = {},
): WindieLocalRuntimeProvider<TWakeUpOptions> {
  let cachedRuntime: WindieLocalRuntimeClient | undefined;
  let ownedProcess: { kill?: (signal?: string) => void; unref?: () => void } | null = null;
  return async () => {
    if (cachedRuntime) {
      return cachedRuntime;
    }
    let modules: Awaited<ReturnType<typeof loadNodeSidecarModules>>;
    try {
      modules = await loadNodeSidecarModules();
    } catch (error) {
      throw new Error(
        `WindieClient local tools require a Node sidecar runtime provider: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const { fs, os, path, childProcess } = modules;
    const processLike = (globalThis as unknown as {
      process?: { env?: Record<string, string | undefined> };
    }).process;
    const discoveryFile = path.resolve(
      options.discoveryFile
        ?? processLike?.env?.WINDIE_SIDECAR_DAEMON_DISCOVERY_FILE
        ?? path.join(os.tmpdir(), 'windieos', 'sidecar-daemon.json'),
    );
    const fetchImpl = options.fetchImpl;
    const existing = await probeDaemon(readDaemonDiscovery(fs, discoveryFile), fetchImpl);
    if (existing) {
      cachedRuntime = existing;
      return cachedRuntime;
    }

    const daemonScript = resolveDaemonScript(options, fs, path);
    fs.mkdirSync(path.dirname(discoveryFile), { recursive: true });
    const pythonCommand = options.pythonCommand
      ?? processLike?.env?.WINDIE_PYTHON
      ?? 'python3';
    const args = [
      ...(options.pythonArgs ?? []),
      daemonScript,
      '--discovery-file',
      discoveryFile,
    ];
    if (options.host) {
      args.push('--host', options.host);
    }
    if (typeof options.port === 'number') {
      args.push('--port', String(options.port));
    }
    ownedProcess = childProcess.spawn(pythonCommand, args, {
      stdio: 'ignore',
      detached: true,
    });
    ownedProcess.unref?.();

    const deadline = Date.now() + (options.startTimeoutMs ?? 10000);
    const pollIntervalMs = options.pollIntervalMs ?? 100;
    while (Date.now() < deadline) {
      const started = await probeDaemon(readDaemonDiscovery(fs, discoveryFile), fetchImpl);
      if (started) {
        cachedRuntime = {
          status: () => started.status(),
          listTools: () => started.listTools(),
          registerModuleTool: (tool, context) => started.registerModuleTool(tool, context),
          registerPlugin: plugin => started.registerPlugin(plugin),
          registerMcp: mcp => started.registerMcp(mcp),
          executeTool: payload => started.executeTool(payload),
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
    throw new Error(`Timed out waiting for Windie sidecar daemon discovery at ${discoveryFile}`);
  };
}
