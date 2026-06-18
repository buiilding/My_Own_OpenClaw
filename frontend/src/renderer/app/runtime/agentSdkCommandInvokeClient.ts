/**
 * Implements the agent SDK command invoke client integration for the renderer UI.
 */

import { IpcBridge } from '../../infrastructure/ipc/bridge';
import { DESKTOP_AGENT_INVOKE_CHANNELS } from '../../infrastructure/ipc/channels';

type AgentSdkCommandResult<T = unknown> = {
  ok?: boolean;
  data?: T;
  error?: string;
};

type AgentSdkCommandBridge = {
  invoke: (
    command: string,
    payload?: Record<string, unknown>,
  ) => Promise<AgentSdkCommandResult>;
};

declare global {
  interface Window {
    desktopAgent?: AgentSdkCommandBridge;
  }
}

function getAgentSdkCommandBridge(): AgentSdkCommandBridge | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.desktopAgent ?? null;
}

export async function invokeAgentSdkCommand<T = unknown>(
  command: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const bridge = getAgentSdkCommandBridge();
  const result = bridge
    ? await bridge.invoke(command, payload)
    : await IpcBridge.invoke<AgentSdkCommandResult<T>>(
      DESKTOP_AGENT_INVOKE_CHANNELS.INVOKE,
      { command, payload },
    );

  if (!result || result.ok === false) {
    throw new Error(result?.error || `Agent SDK command failed: ${command}`);
  }

  return result.data as T;
}
