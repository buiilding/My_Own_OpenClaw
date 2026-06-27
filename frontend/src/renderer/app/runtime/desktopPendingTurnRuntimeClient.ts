/**
 * Coordinates desktop pending-turn sync for renderer UI surfaces.
 */

import { IpcBridge } from '../../infrastructure/ipc/bridge';
import { DESKTOP_RUNTIME_SEND_CHANNELS } from '../../infrastructure/ipc/channels';

export type DesktopPendingTurn = {
  conversationRef: string;
  turnRef: string;
  userMessageId: string;
  text: string;
  timestamp: string;
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

function readExactOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    ? value
    : null;
}

const PENDING_TURN_FIELDS = new Set([
  'conversationRef',
  'text',
  'timestamp',
  'turnRef',
  'userMessageId',
]);

function hasOnlyPendingTurnFields(source: Record<string, unknown>): boolean {
  return Object.keys(source).every((key) => PENDING_TURN_FIELDS.has(key));
}

function normalizePendingTurn(value: unknown): DesktopPendingTurn | undefined {
  const source = recordOrEmpty(value);
  if (!hasOnlyPendingTurnFields(source)) {
    return undefined;
  }
  const conversationRef = readExactOptionalString(source.conversationRef);
  const turnRef = readExactOptionalString(source.turnRef);
  const userMessageId = readExactOptionalString(source.userMessageId);
  const text = typeof source.text === 'string' ? source.text : null;
  const timestamp = typeof source.timestamp === 'string' && source.timestamp.trim()
    ? source.timestamp
    : null;
  if (!conversationRef || !turnRef || !userMessageId || text === null || !timestamp) {
    return undefined;
  }
  return {
    conversationRef,
    turnRef,
    userMessageId,
    text,
    timestamp,
  };
}

function resolveDesktopPendingTurnBroadcastAction(
  payload: unknown,
): DesktopPendingTurnBroadcastAction {
  const source = recordOrEmpty(payload);
  if (source.type === 'clear') {
    return {
      kind: 'clear',
      conversationRef: readExactOptionalString(source.conversationRef),
      turnRef: readExactOptionalString(source.turnRef),
    };
  }
  return {
    kind: 'pending',
    pendingTurn: normalizePendingTurn(source.pendingTurn),
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
