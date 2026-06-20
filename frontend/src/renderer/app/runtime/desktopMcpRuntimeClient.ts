/**
 * Coordinates desktop MCP registry commands for renderer surfaces.
 */

import { IpcBridge, INVOKE_CHANNELS } from '../../infrastructure/ipc/bridge';

export type McpServerEnablementInput = {
  id: string;
  enabled: boolean;
};

export type DesktopMcpRegistry = {
  mcps: unknown[];
  errors: unknown[];
  mcp_errors: unknown[];
  enabled_mcp_servers: string[];
};

export type DesktopMcpEnablementResult = {
  ok: boolean;
  errorMessage: string | null;
  registry: DesktopMcpRegistry;
};

export type DesktopMcpServerPresentation = {
  key: string;
  name: string;
  enablementId: string;
  enabled: boolean;
  statusLabel: string;
  statusClassName: string;
  statusText: string;
  debugSpec: Record<string, unknown>;
};

export type DesktopMcpRegistryErrorPresentation = {
  key: string;
  text: string;
};

export const EMPTY_DESKTOP_MCP_REGISTRY: DesktopMcpRegistry = {
  mcps: [],
  errors: [],
  mcp_errors: [],
  enabled_mcp_servers: [],
};

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function textOrFallback(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = textOrFallback(value);
    if (text) {
      return text;
    }
  }
  return '';
}

export function normalizeDesktopMcpRegistry(payload: unknown): DesktopMcpRegistry {
  const source = recordOrEmpty(payload);
  return {
    ...EMPTY_DESKTOP_MCP_REGISTRY,
    mcps: Array.isArray(source.mcps) ? source.mcps : EMPTY_DESKTOP_MCP_REGISTRY.mcps,
    errors: Array.isArray(source.errors) ? source.errors : EMPTY_DESKTOP_MCP_REGISTRY.errors,
    mcp_errors: Array.isArray(source.mcp_errors)
      ? source.mcp_errors
      : EMPTY_DESKTOP_MCP_REGISTRY.mcp_errors,
    enabled_mcp_servers: Array.isArray(source.enabled_mcp_servers)
      ? source.enabled_mcp_servers.filter((serverId): serverId is string => typeof serverId === 'string')
      : EMPTY_DESKTOP_MCP_REGISTRY.enabled_mcp_servers,
  };
}

export function normalizeDesktopMcpEnablementResult(payload: unknown): DesktopMcpEnablementResult {
  const source = recordOrEmpty(payload);
  const errorMessage = typeof source.error === 'string' && source.error.trim()
    ? source.error.trim()
    : null;
  return {
    ok: source.success !== false,
    errorMessage,
    registry: normalizeDesktopMcpRegistry(source.registry),
  };
}

export function resolveDesktopMcpEnablementRegistry(payload: unknown): DesktopMcpRegistry {
  const result = normalizeDesktopMcpEnablementResult(payload);
  if (!result.ok) {
    throw new Error(result.errorMessage || 'Unable to update MCP server.');
  }
  return result.registry;
}

export function getDesktopMcpServerPresentation(server: unknown): DesktopMcpServerPresentation {
  const source = recordOrEmpty(server);
  const status = recordOrEmpty(source.status);
  const id = firstText(source.extension_id, source.mcp_id, source.id);
  const name = firstText(source.name, source.id) || 'Unknown MCP';
  const command = textOrFallback(source.command);
  const statusLabel = textOrFallback(status.label, 'Unknown');
  const statusState = textOrFallback(status.state);
  const statusReason = textOrFallback(status.reason);
  const tools = Array.isArray(source.tools)
    ? source.tools.map((tool) => recordOrEmpty(tool).name)
    : [];
  return {
    key: id || name,
    name,
    enablementId: id,
    enabled: source.effective_enabled === true,
    statusLabel,
    statusClassName: statusState === 'error'
      ? 'settings-surface-tool-status settings-surface-tool-status-error'
      : 'settings-surface-tool-status',
    statusText: statusReason || command,
    debugSpec: {
      id: source.id,
      command: source.command,
      args: Array.isArray(source.args) ? source.args : [],
      tool_prefix: source.tool_prefix || null,
      tools,
    },
  };
}

export function getDesktopMcpRegistryErrorPresentation(
  registryError: unknown,
): DesktopMcpRegistryErrorPresentation {
  const source = recordOrEmpty(registryError);
  const kind = firstText(source.kind) || 'extension';
  const id = firstText(source.id) || 'unknown';
  const reason = firstText(source.reason);
  return {
    key: `${kind}-${id}-${reason}`,
    text: reason ? `${kind} ${id}: ${reason}` : `${kind} ${id}`,
  };
}

export const DesktopMcpRuntimeClient = {
  async listMcpServers(): Promise<DesktopMcpRegistry> {
    return normalizeDesktopMcpRegistry(await IpcBridge.invoke(INVOKE_CHANNELS.LIST_MCP_SERVERS));
  },

  async refreshMcpServers(): Promise<DesktopMcpRegistry> {
    return normalizeDesktopMcpRegistry(await IpcBridge.invoke(INVOKE_CHANNELS.REFRESH_MCP_SERVERS));
  },

  async setMcpServerEnabled(input: McpServerEnablementInput): Promise<DesktopMcpRegistry> {
    return resolveDesktopMcpEnablementRegistry(
      await IpcBridge.invoke(INVOKE_CHANNELS.SET_MCP_SERVER_ENABLED, input),
    );
  },

  getMcpServerPresentation(server: unknown): DesktopMcpServerPresentation {
    return getDesktopMcpServerPresentation(server);
  },

  getMcpRegistryErrorPresentation(
    registryError: unknown,
  ): DesktopMcpRegistryErrorPresentation {
    return getDesktopMcpRegistryErrorPresentation(registryError);
  },
};
