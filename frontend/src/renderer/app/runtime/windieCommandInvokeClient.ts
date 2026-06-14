/**
 * Implements the windie command invoke client integration for the renderer UI.
 */

import { IpcBridge, INVOKE_CHANNELS } from '../../infrastructure/ipc/bridge';

type WindieCommandResult<T = unknown> = {
  ok?: boolean;
  data?: T;
  error?: string;
};

type WindieCommandBridge = {
  invoke: (
    command: string,
    payload?: Record<string, unknown>,
  ) => Promise<WindieCommandResult>;
};

declare global {
  interface Window {
    windie?: WindieCommandBridge;
  }
}

function getWindieBridge(): WindieCommandBridge | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.windie ?? null;
}

export async function invokeWindieCommand<T = unknown>(
  command: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const bridge = getWindieBridge();
  const result = bridge
    ? await bridge.invoke(command, payload)
    : await IpcBridge.invoke<WindieCommandResult<T>>(
      INVOKE_CHANNELS.WINDIE_INVOKE,
      { command, payload },
    );

  if (!result || result.ok === false) {
    throw new Error(result?.error || `Windie SDK command failed: ${command}`);
  }

  return result.data as T;
}
