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
import {
  DesktopConversationViewWorkspaceRuntime,
} from './desktopConversationViewWorkspaceRuntime';

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

function exactOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    ? value
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

const {
  hasWorkspaceConversationView,
} = DesktopConversationViewWorkspaceRuntime;

function normalizeCurrentTurnProjectionEvent(
  payload: unknown,
): DesktopCurrentTurnProjectionEvent {
  const source = recordOrEmpty(payload);
  const currentTurn = isCurrentTurnProjection(payload)
    ? payload
    : source.currentTurn;
  const view = hasWorkspaceConversationView({ conversationView: source.view })
    ? (source.view as ConversationView)
    : null;
  const envelopeConversationRef = exactOptionalString(source.conversationRef)
    ?? view?.conversationRef
    ?? null;
  if (!isCurrentTurnProjection(currentTurn)) {
    return {
      currentTurn: null,
      conversationRef: envelopeConversationRef,
      view,
    };
  }
  return {
    currentTurn,
    conversationRef: envelopeConversationRef ?? currentTurn.conversationRef,
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
