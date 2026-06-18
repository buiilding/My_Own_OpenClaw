/**
 * Coordinates SDK conversation runtime event subscriptions for renderer clients.
 */

import { IpcBridge } from '../../infrastructure/ipc/bridge';
import { DESKTOP_RUNTIME_ON_CHANNELS } from '../../infrastructure/ipc/channels';

export type DesktopRuntimeEventListener = (payload: unknown) => void;

function subscribe(channel: string | undefined, listener: DesktopRuntimeEventListener): (() => void) | undefined {
  if (!channel) {
    return undefined;
  }
  return IpcBridge.on(channel, listener);
}

export const DesktopConversationRuntimeEventClient = {
  onConversationEvent(listener: DesktopRuntimeEventListener): (() => void) | undefined {
    return subscribe(DESKTOP_RUNTIME_ON_CHANNELS.CONVERSATION_EVENT, listener);
  },

  onPendingTurn(listener: DesktopRuntimeEventListener): (() => void) | undefined {
    return subscribe(DESKTOP_RUNTIME_ON_CHANNELS.PENDING_TURN, listener);
  },

  onCurrentTurn(listener: DesktopRuntimeEventListener): (() => void) | undefined {
    return subscribe(DESKTOP_RUNTIME_ON_CHANNELS.CURRENT_TURN, listener);
  },

  onDisplayRows(listener: DesktopRuntimeEventListener): (() => void) | undefined {
    return subscribe(DESKTOP_RUNTIME_ON_CHANNELS.ROWS, listener);
  },
};
