/**
 * Implements the agent SDK command invoke client integration for the renderer UI.
 */

import { IpcBridge, INVOKE_CHANNELS } from '../../infrastructure/ipc/bridge';

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
    windie?: AgentSdkCommandBridge;
  }
}

function getAgentSdkBridge(): AgentSdkCommandBridge | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.windie ?? null;
}

export async function invokeAgentSdkCommand<T = unknown>(
  command: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const bridge = getAgentSdkBridge();
  const result = bridge
    ? await bridge.invoke(command, payload)
    : await IpcBridge.invoke<AgentSdkCommandResult<T>>(
      INVOKE_CHANNELS.WINDIE_INVOKE,
      { command, payload },
    );

  if (!result || result.ok === false) {
    throw new Error(result?.error || `Agent SDK command failed: ${command}`);
  }

  return result.data as T;
}
