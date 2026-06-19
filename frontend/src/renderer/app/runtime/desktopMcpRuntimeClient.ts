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
};
