/**
 * Coordinates SDK conversation runtime event subscriptions for renderer clients.
 */

import { IpcBridge } from '../../infrastructure/ipc/bridge';
import { DESKTOP_RUNTIME_ON_CHANNELS } from '../../infrastructure/ipc/channels';
import type {
  CurrentTurnProjection,
  SdkDisplayRow,
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

export type DesktopDisplayRowsProjectionEvent = {
  rows: SdkDisplayRow[];
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

function isSdkDisplayRow(value: unknown): value is SdkDisplayRow {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const row = value as Partial<SdkDisplayRow>;
  return typeof row.id === 'string'
    && typeof row.conversationRef === 'string'
    && typeof row.type === 'string'
    && typeof row.role === 'string';
}

function isSdkDisplayRows(value: unknown): value is SdkDisplayRow[] {
  return Array.isArray(value) && value.every(isSdkDisplayRow);
}

function resolveRowsConversationRef(rows: SdkDisplayRow[]): string | null {
  for (const row of rows) {
    const conversationRef = normalizeOptionalString(row.conversationRef);
    if (conversationRef) {
      return conversationRef;
    }
  }
  return null;
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

function normalizeDisplayRowsProjectionEvent(
  payload: unknown,
): DesktopDisplayRowsProjectionEvent {
  const source = recordOrEmpty(payload);
  const rows = Array.isArray(source.rows) ? source.rows : payload;
  if (!isSdkDisplayRows(rows)) {
    return {
      rows: [],
      conversationRef: null,
    };
  }
  return {
    rows,
    conversationRef: normalizeOptionalString(source.conversationRef) ?? resolveRowsConversationRef(rows),
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

  onDisplayRows(listener: DesktopRuntimeEventListener): (() => void) | undefined {
    return subscribe(DESKTOP_RUNTIME_ON_CHANNELS.ROWS, listener);
  },

  onDisplayRowsProjection(
    listener: (event: DesktopDisplayRowsProjectionEvent) => void,
  ): (() => void) | undefined {
    return subscribe(
      DESKTOP_RUNTIME_ON_CHANNELS.ROWS,
      (payload: unknown) => listener(normalizeDisplayRowsProjectionEvent(payload)),
    );
  },
};
