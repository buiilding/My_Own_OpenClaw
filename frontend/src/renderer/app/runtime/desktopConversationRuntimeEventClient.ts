/**
 * Coordinates SDK conversation runtime event subscriptions for renderer clients.
 */

import { IpcBridge } from '../../infrastructure/ipc/bridge';
import { DESKTOP_RUNTIME_ON_CHANNELS } from '../../infrastructure/ipc/channels';
import type {
  ConversationView,
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
  view: ConversationView | null;
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

function hasSdkPresentation(value: unknown): boolean {
  const presentation = recordOrEmpty(value);
  return Array.isArray(presentation.entries);
}

function hasLegacyCurrentTurnContent(value: unknown): boolean {
  const projection = recordOrEmpty(value);
  const assistantText = projection.assistantText;
  const toolEvents = projection.toolEvents;
  return typeof assistantText === 'string'
    && Array.isArray(toolEvents);
}

function isCurrentTurnProjection(value: unknown): value is CurrentTurnProjection {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const projection = value as Partial<CurrentTurnProjection>;
  return typeof projection.conversationRef === 'string'
    && typeof projection.phase === 'string'
    && (
      hasSdkPresentation(projection.presentation)
      || hasLegacyCurrentTurnContent(projection)
    );
}

function isConversationView(value: unknown): value is ConversationView {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const view = value as Partial<ConversationView>;
  return typeof view.conversationRef === 'string'
    && Array.isArray(view.displayRows)
    && Boolean(view.liveTurn && typeof view.liveTurn === 'object')
    && Boolean(view.surfaces && typeof view.surfaces === 'object');
}

function normalizeCurrentTurnProjectionEvent(
  payload: unknown,
): DesktopCurrentTurnProjectionEvent {
  const source = recordOrEmpty(payload);
  const currentTurn = isCurrentTurnProjection(payload)
    ? payload
    : source.currentTurn;
  const view = isConversationView(source.view) ? source.view : null;
  if (!isCurrentTurnProjection(currentTurn)) {
    return {
      currentTurn: null,
      conversationRef: null,
      view,
    };
  }
  return {
    currentTurn,
    conversationRef: normalizeOptionalString(source.conversationRef) ?? currentTurn.conversationRef,
    view,
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

  onCurrentTurnProjection(
    listener: (event: DesktopCurrentTurnProjectionEvent) => void,
  ): (() => void) | undefined {
    return subscribe(
      DESKTOP_RUNTIME_ON_CHANNELS.CURRENT_TURN,
      (payload: unknown) => listener(normalizeCurrentTurnProjectionEvent(payload)),
    );
  },

};
