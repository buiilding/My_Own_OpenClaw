/**
 * Coordinates SDK conversation runtime event subscriptions for renderer clients.
 */

import { IpcBridge } from '../../infrastructure/ipc/bridge';
import { DESKTOP_RUNTIME_ON_CHANNELS } from '../../infrastructure/ipc/channels';
import type {
  CurrentTurnProjection,
} from './desktopConversationRuntimeContracts';
import {
  DesktopPendingTurnRuntimeClient,
  type DesktopPendingTurnBroadcastAction,
} from './desktopPendingTurnRuntimeClient';

export type DesktopRuntimeEventListener = (payload: unknown) => void;

export type DesktopCurrentTurnProjectionEvent = {
  currentTurn: CurrentTurnProjection | null;
  conversationRef: string | null;
};

function subscribe(channel: string | undefined, listener: DesktopRuntimeEventListener): (() => void) | undefined {
  if (!channel) {
    return undefined;
  }
  return IpcBridge.on(channel, listener);
}

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

function isCurrentTurnProjection(value: unknown): value is CurrentTurnProjection {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const projection = value as Partial<CurrentTurnProjection>;
  return typeof projection.conversationRef === 'string'
    && typeof projection.phase === 'string'
    && typeof projection.assistantText === 'string'
    && Array.isArray(projection.toolEvents);
}

function normalizeCurrentTurnProjectionEvent(
  payload: unknown,
): DesktopCurrentTurnProjectionEvent {
  const source = recordOrEmpty(payload);
  const currentTurn = isCurrentTurnProjection(payload)
    ? payload
    : source.currentTurn;
  if (!isCurrentTurnProjection(currentTurn)) {
    return {
      currentTurn: null,
      conversationRef: null,
    };
  }
  return {
    currentTurn,
    conversationRef: normalizeOptionalString(source.conversationRef) ?? currentTurn.conversationRef,
  };
}

export const DesktopConversationRuntimeEventClient = {
  onConversationEvent(listener: DesktopRuntimeEventListener): (() => void) | undefined {
    return subscribe(DESKTOP_RUNTIME_ON_CHANNELS.CONVERSATION_EVENT, listener);
  },

  onPendingTurn(
    listener: (action: DesktopPendingTurnBroadcastAction) => void,
  ): (() => void) | undefined {
    return subscribe(
      DESKTOP_RUNTIME_ON_CHANNELS.PENDING_TURN,
      (payload: unknown) => listener(DesktopPendingTurnRuntimeClient.resolveBroadcastAction(payload)),
    );
  },

  onCurrentTurn(listener: DesktopRuntimeEventListener): (() => void) | undefined {
    return subscribe(DESKTOP_RUNTIME_ON_CHANNELS.CURRENT_TURN, listener);
  },

  onCurrentTurnProjection(
    listener: (event: DesktopCurrentTurnProjectionEvent) => void,
  ): (() => void) | undefined {
    return subscribe(
      DESKTOP_RUNTIME_ON_CHANNELS.CURRENT_TURN,
      (payload: unknown) => listener(normalizeCurrentTurnProjectionEvent(payload)),
    );
  },

};
