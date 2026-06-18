/**
 * Coordinates desktop window commands for renderer runtime clients.
 */

import { IpcBridge, INVOKE_CHANNELS } from '../../infrastructure/ipc/bridge';

export type ShowChatboxOptions = {
  focus?: boolean;
  reason?: string;
};

export const DesktopWindowRuntimeClient = {
  showChatbox(options: ShowChatboxOptions = {}): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.SHOW_CHATBOX, options);
  },
};
