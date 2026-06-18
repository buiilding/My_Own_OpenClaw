/**
 * Coordinates desktop client session and transport snapshot commands.
 */

import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS } from '../../infrastructure/ipc/bridge';

export type DesktopIpcStatusPayload = {
  isConnected?: boolean;
};

export type DesktopIpcStatusListener = (payload: DesktopIpcStatusPayload | null | undefined) => void;

export const DesktopClientSessionRuntimeClient = {
  loadMainSessionSnapshot(): Promise<unknown> {
    if (!INVOKE_CHANNELS?.GET_CLIENT_USER_ID) {
      return Promise.resolve(undefined);
    }
    return IpcBridge.invoke(INVOKE_CHANNELS.GET_CLIENT_USER_ID);
  },

  onIpcStatus(listener: DesktopIpcStatusListener): (() => void) | undefined {
    if (!ON_CHANNELS?.IPC_STATUS) {
      return undefined;
    }
    return IpcBridge.on(ON_CHANNELS.IPC_STATUS, listener);
  },
};
