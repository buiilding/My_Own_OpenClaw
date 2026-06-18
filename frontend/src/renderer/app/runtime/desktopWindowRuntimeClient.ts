/**
 * Coordinates desktop window commands for renderer runtime clients.
 */

import { IpcBridge, INVOKE_CHANNELS } from '../../infrastructure/ipc/bridge';

export type ShowChatboxOptions = {
  focus?: boolean;
  reason?: string;
};

export type ShowMainWindowOptions = {
  focus?: boolean;
  maximize?: boolean;
  open?: string;
  reason?: string;
};

export const DesktopWindowRuntimeClient = {
  showChatbox(options: ShowChatboxOptions = {}): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.SHOW_CHATBOX, options);
  },

  showMainWindow(options: ShowMainWindowOptions = {}): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.SHOW_MAIN_WINDOW, options);
  },

  minimizeWindow(): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.WINDOW_MINIMIZE);
  },

  toggleMaximizeWindow(): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.WINDOW_TOGGLE_MAXIMIZE);
  },

  closeWindow(): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.WINDOW_CLOSE);
  },
};
