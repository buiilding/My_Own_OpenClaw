/**
 * Coordinates the desktop chat stream event runtime for the renderer UI.
 */

import {
  DesktopChatStreamTrackingRuntime,
  type StreamTrackingEventType,
  type StreamTrackingOptions,
} from './desktopChatStreamTrackingRuntime';
import { DesktopChatStreamTurnGuardRuntime } from './desktopChatStreamTurnGuardRuntime';
import {
  DesktopChatStreamTerminalHandoffRuntime,
  type StreamGuardWorkspace,
} from './desktopChatStreamTerminalHandoffRuntime';

const {
  isStaleTurnForActiveStream,
} = DesktopChatStreamTurnGuardRuntime;
const {
  applyTrackingEvent,
} = DesktopChatStreamTrackingRuntime;
const {
  hasTerminalPendingHandoff,
  isAwaitingFirstChunkMismatch,
  normalizeTurnRef,
  shouldIgnoreForTerminalPendingHandoff,
} = DesktopChatStreamTerminalHandoffRuntime;

type ShouldIgnoreForStaleTurnDeps = {
  getWorkspaceState: (conversationRef?: string | null) => StreamGuardWorkspace;
};

type TurnRefEvent = {
  turn_ref?: string | null;
};

type ConversationTurnRefEvent = {
  turnRef?: string | null;
};

type ConversationStreamEventIdentityEvent = {
  conversationRef?: string | null;
  turnRef?: string | null;
};

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function resolveConversationStreamEventConversationRef(
  event: ConversationStreamEventIdentityEvent | null | undefined,
): string | null {
  return optionalString(event?.conversationRef);
}

function resolveConversationStreamEventTurnRef(
  event: ConversationStreamEventIdentityEvent | null | undefined,
): string | null {
  return optionalString(event?.turnRef);
}

function resolveConversationStreamEventTurnRefForUpdate(
  event: ConversationStreamEventIdentityEvent | null | undefined,
): string | undefined {
  return resolveConversationStreamEventTurnRef(event) ?? undefined;
}

const SUPPORTED_CONVERSATION_STREAM_EVENT_TYPES = new Set([
  'user_message',
  'turn_completed',
  'tool_call',
  'tool_output',
  'tool_bundle_call',
  'tool_bundle_output',
  'compaction_started',
  'compaction_applied',
  'compaction_skipped',
  'compaction_failed',
  'system_prompt',
  'user_message_metadata',
  'assistant_message',
  'tool_schemas_metadata',
  'turn_error',
  'usage_updated',
]);

const TOOL_DISPLAY_ONLY_CONVERSATION_STREAM_EVENT_TYPES = new Set([
  'tool_call',
  'tool_output',
  'tool_bundle_call',
  'tool_bundle_output',
]);

const COMPACTION_COMPLETED_CONVERSATION_STREAM_EVENT_TYPES = new Set([
  'compaction_applied',
  'compaction_skipped',
]);

type ConversationTypeEvent = {
  type?: string | null;
};

function isSupportedConversationStreamEvent(
  event: ConversationTypeEvent | null | undefined,
): boolean {
  return typeof event?.type === 'string'
    && SUPPORTED_CONVERSATION_STREAM_EVENT_TYPES.has(event.type);
}

function isToolDisplayOnlyConversationStreamEvent(
  event: ConversationTypeEvent | null | undefined,
): boolean {
  return typeof event?.type === 'string'
    && TOOL_DISPLAY_ONLY_CONVERSATION_STREAM_EVENT_TYPES.has(event.type);
}

function isCompactionStartedConversationStreamEvent(
  event: ConversationTypeEvent | null | undefined,
): boolean {
  return event?.type === 'compaction_started';
}

function isCompactionCompletedConversationStreamEvent(
  event: ConversationTypeEvent | null | undefined,
): boolean {
  return typeof event?.type === 'string'
    && COMPACTION_COMPLETED_CONVERSATION_STREAM_EVENT_TYPES.has(event.type);
}

function isCompactionSkippedConversationStreamEvent(
  event: ConversationTypeEvent | null | undefined,
): boolean {
  return event?.type === 'compaction_skipped';
}

function isCompactionFailedConversationStreamEvent(
  event: ConversationTypeEvent | null | undefined,
): boolean {
  return event?.type === 'compaction_failed';
}

function isSystemPromptConversationStreamEvent(
  event: ConversationTypeEvent | null | undefined,
): boolean {
  return event?.type === 'system_prompt';
}

function isUserMessageMetadataConversationStreamEvent(
  event: ConversationTypeEvent | null | undefined,
): boolean {
  return event?.type === 'user_message_metadata';
}

function isAssistantMessageConversationStreamEvent(
  event: ConversationTypeEvent | null | undefined,
): boolean {
  return event?.type === 'assistant_message';
}

function isToolSchemasMetadataConversationStreamEvent(
  event: ConversationTypeEvent | null | undefined,
): boolean {
  return event?.type === 'tool_schemas_metadata';
}

function isLocalUserMessageConversationStreamEvent(
  event: ConversationTypeEvent | null | undefined,
): boolean {
  return event?.type === 'user_message';
}

function isTurnCompletedConversationStreamEvent(
  event: ConversationTypeEvent | null | undefined,
): boolean {
  return event?.type === 'turn_completed';
}

function isTurnErrorConversationStreamEvent(
  event: ConversationTypeEvent | null | undefined,
): boolean {
  return event?.type === 'turn_error';
}

function isUsageUpdatedConversationStreamEvent(
  event: ConversationTypeEvent | null | undefined,
): boolean {
  return event?.type === 'usage_updated';
}

function shouldIgnoreForStaleTurn(
  event: TurnRefEvent,
  conversationRef?: string | null,
  deps?: ShouldIgnoreForStaleTurnDeps,
): boolean {
  const eventTurnRef = normalizeTurnRef(event.turn_ref);
  if (!eventTurnRef) {
    return false;
  }
  const workspace = deps?.getWorkspaceState(conversationRef);
  if (!workspace) {
    return false;
  }
  const activeTurnRef = workspace.streamTracking.activeTurnRef;
  const normalizedActiveTurnRef = normalizeTurnRef(activeTurnRef);
  // During awaiting-first-chunk, fail-open on turn-ref mismatch so the first real
  // runtime packets can re-anchor stream state if optimistic local turn wiring
  // never seeded this workspace with the current turn ref.
  if (isAwaitingFirstChunkMismatch(workspace, eventTurnRef, normalizedActiveTurnRef)) {
    return false;
  }
  // Keep first packets of the next turn when UI has already entered "sending" but
  // stream-tracking still points at a completed previous turn.
  if (hasTerminalPendingHandoff(workspace)) {
    return shouldIgnoreForTerminalPendingHandoff(
      workspace,
      eventTurnRef,
      normalizedActiveTurnRef,
    );
  }
  return isStaleTurnForActiveStream(eventTurnRef, activeTurnRef);
}

function shouldIgnoreConversationEventForStaleTurn(
  event: ConversationTurnRefEvent,
  conversationRef?: string | null,
  deps?: ShouldIgnoreForStaleTurnDeps,
): boolean {
  return shouldIgnoreForStaleTurn({
    turn_ref: event.turnRef ?? undefined,
  }, conversationRef, deps);
}

type UpdateStreamTracking = (
  updater: (current: any) => any,
  conversationRef?: string | null,
) => void;

function recordTrackingEvent(
  updateStreamTracking: UpdateStreamTracking,
  eventType: StreamTrackingEventType,
  turnRef: string | null | undefined,
  options: StreamTrackingOptions = {},
  conversationRef?: string | null,
): void {
  const now = new Date().toISOString();
  updateStreamTracking(
    (current) => applyTrackingEvent(current, eventType, turnRef, now, options),
    conversationRef,
  );
}

export type DesktopChatStreamRecordTrackingEvent = typeof recordTrackingEvent;

export const DesktopChatStreamEventRuntime = Object.freeze({
  resolveConversationStreamEventConversationRef,
  resolveConversationStreamEventTurnRef,
  resolveConversationStreamEventTurnRefForUpdate,
  isSupportedConversationStreamEvent,
  isToolDisplayOnlyConversationStreamEvent,
  isCompactionStartedConversationStreamEvent,
  isCompactionCompletedConversationStreamEvent,
  isCompactionSkippedConversationStreamEvent,
  isCompactionFailedConversationStreamEvent,
  isSystemPromptConversationStreamEvent,
  isUserMessageMetadataConversationStreamEvent,
  isAssistantMessageConversationStreamEvent,
  isToolSchemasMetadataConversationStreamEvent,
  isLocalUserMessageConversationStreamEvent,
  isTurnCompletedConversationStreamEvent,
  isTurnErrorConversationStreamEvent,
  isUsageUpdatedConversationStreamEvent,
  shouldIgnoreConversationEventForStaleTurn,
  recordTrackingEvent,
});
