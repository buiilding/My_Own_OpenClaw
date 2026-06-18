/**
 * Coordinates desktop MCP registry commands for renderer surfaces.
 */

import { IpcBridge, INVOKE_CHANNELS } from '../../infrastructure/ipc/bridge';

export type McpServerEnablementInput = {
  id: string;
  enabled: boolean;
};

export const DesktopMcpRuntimeClient = {
  listMcpServers(): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.LIST_MCP_SERVERS);
  },

  refreshMcpServers(): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.REFRESH_MCP_SERVERS);
  },

  setMcpServerEnabled(input: McpServerEnablementInput): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.SET_MCP_SERVER_ENABLED, input);
  },
};
