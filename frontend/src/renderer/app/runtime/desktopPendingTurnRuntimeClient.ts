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

export type DesktopPendingTurnBroadcastAction =
  | {
    kind: 'pending';
    pendingTurn: unknown;
  }
  | {
    kind: 'clear';
    conversationRef: string | null;
    turnRef: string | null;
  };

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : null;
}

function resolveDesktopPendingTurnBroadcastAction(
  payload: unknown,
): DesktopPendingTurnBroadcastAction {
  const source = recordOrEmpty(payload);
  if (source.type === 'clear') {
    return {
      kind: 'clear',
      conversationRef: normalizeOptionalString(source.conversationRef),
      turnRef: normalizeOptionalString(source.turnRef),
    };
  }
  return {
    kind: 'pending',
    pendingTurn: source.pendingTurn,
  };
}

export const DesktopPendingTurnRuntimeClient = {
  resolveBroadcastAction(payload: unknown): DesktopPendingTurnBroadcastAction {
    return resolveDesktopPendingTurnBroadcastAction(payload);
  },

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
