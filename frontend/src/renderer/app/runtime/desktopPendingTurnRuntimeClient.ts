/**
 * Coordinates desktop pending-turn sync for renderer UI surfaces.
 */

import { IpcBridge } from '../../infrastructure/ipc/bridge';
import { DESKTOP_RUNTIME_SEND_CHANNELS } from '../../infrastructure/ipc/channels';

export type DesktopPendingTurn = {
  conversationRef: string | null;
  turnRef: string | null;
  userMessageId?: string | null;
  text?: string | null;
  timestamp?: string | null;
  attachmentFilenames?: string[] | null;
};

export type DesktopPendingTurnClearInput = {
  conversationRef?: string | null;
  turnRef?: string | null;
};

export const DesktopPendingTurnRuntimeClient = {
  setPending(pendingTurn: DesktopPendingTurn): void {
    IpcBridge.send(DESKTOP_RUNTIME_SEND_CHANNELS.PENDING_TURN, {
      type: 'pending',
      pendingTurn,
    });
  },

  clear(input: DesktopPendingTurnClearInput = {}): void {
    IpcBridge.send(DESKTOP_RUNTIME_SEND_CHANNELS.PENDING_TURN, {
      type: 'clear',
      conversationRef: input.conversationRef ?? null,
      turnRef: input.turnRef ?? null,
    });
  },
};
