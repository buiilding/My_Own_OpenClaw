/**
 * Provides renderer diagnostic trace helpers for desktop chat surfaces.
 */

import { DesktopLiveSurfaceTraceRuntimeClient } from './desktopLiveSurfaceTraceRuntimeClient';

export type RendererTraceWorkspaceSnapshot = {
  activeConversationRef?: string | null;
  workspaceMessageCount?: number;
  isSending?: boolean;
  thinkingStatus?: string | null;
  phase?: string | null;
  activeTurnRef?: string | null;
  lastMessage?: {
    sender?: string | null;
    type?: string | null;
    textLength?: number;
    turnRef?: string | null;
    sourceEventType?: string | null;
  } | null;
};

type RendererTraceWorkspaceSnapshotResolver = (
  conversationRef: string | null,
) => RendererTraceWorkspaceSnapshot;

export type RendererResponseSurfaceSizeTraceValues = {
  source?: string;
  action: string;
  visible: boolean;
  layoutMode?: string | null;
  showResponse?: boolean;
  thinkingText?: unknown;
  thinkingTextLength?: unknown;
  compactHover?: boolean;
  turnRef?: unknown;
  staleGuardRef?: unknown;
  width: unknown;
  height: unknown;
};

export type RendererChatPillStateTraceValues = {
  source?: string;
  action?: string;
  conversationRef?: unknown;
  turnRef?: unknown;
  currentTurnPhase?: unknown;
  liveTurnPhase?: unknown;
  liveTurnSource?: unknown;
  isSending?: boolean;
  busy?: boolean;
  stopAvailable?: boolean;
  messageCount?: unknown;
};

export type RendererResponseOverlayStateTraceValues = {
  source?: string;
  action?: string;
  turnRef?: unknown;
  phase?: unknown;
  isVisible?: boolean;
  showAwaitingReply?: boolean;
  showResponse?: boolean;
  responseLayoutMode?: unknown;
  visibleResponseId?: unknown;
  responseEntryCount?: unknown;
  activeResponseTextLength?: unknown;
  thinkingText?: unknown;
  thinkingTextLength?: unknown;
  isSending?: boolean;
  messageCount?: unknown;
};

export type RendererResponseSurfaceRenderTraceValues = {
  source?: string;
  action?: string;
  turnRef?: unknown;
  phase?: unknown;
  responseLayoutMode?: unknown;
  showResponse?: boolean;
  showAwaitingReply?: boolean;
};

let workspaceSnapshotResolver: RendererTraceWorkspaceSnapshotResolver | null = null;

export function configureRendererTraceWorkspaceSnapshotResolver(
  resolver: RendererTraceWorkspaceSnapshotResolver | null,
): void {
  workspaceSnapshotResolver = typeof resolver === 'function' ? resolver : null;
}

function getRendererSearch(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  return typeof window.location?.search === 'string' ? window.location.search : '';
}

function isRendererStreamTraceEnabled(): boolean {
  const search = getRendererSearch();
  return search.includes('debug_stream=1') || search.includes('debug_chat_pill=1');
}

function isRendererLiveSurfaceTraceEnabled(): boolean {
  const search = getRendererSearch();
  return (
    search.includes('debug_live_surface=1')
    || search.includes('debug_stream=1')
    || search.includes('debug_chat_pill=1')
    || search.includes('dev_ui=1')
  );
}

function getRendererTraceView(): string {
  if (typeof window === 'undefined') {
    return 'unknown';
  }
  const params = new URLSearchParams(getRendererSearch());
  return params.get('view') || 'main';
}

function summarizeWorkspaceForTrace(conversationRef: string | null): RendererTraceWorkspaceSnapshot {
  return workspaceSnapshotResolver?.(conversationRef) ?? {};
}

export function logRendererResponseSurfaceTrace(data: Record<string, unknown>): void {
  if (!isRendererStreamTraceEnabled()) {
    return;
  }
  console.log('[StreamTrace][renderer][response-surface]', {
    view: getRendererTraceView(),
    ...data,
  });
}

function traceString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function traceNumberOrZero(value: unknown): number {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : 0;
}

function traceTextLength(values: {
  thinkingText?: unknown;
  thinkingTextLength?: unknown;
}): number | null {
  if (typeof values.thinkingTextLength === 'number' && Number.isFinite(values.thinkingTextLength)) {
    return values.thinkingTextLength;
  }
  return typeof values.thinkingText === 'string' ? values.thinkingText.length : null;
}

export function buildRendererResponseSurfaceSizeTracePayload(
  values: RendererResponseSurfaceSizeTraceValues,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    source: traceString(values.source) || 'renderer-response-window-sync',
    action: traceString(values.action) || 'size-report',
    visible: values.visible === true,
    layout_mode: traceString(values.layoutMode) || 'hidden',
    width: traceNumberOrZero(values.width),
    height: traceNumberOrZero(values.height),
  };
  if (typeof values.showResponse === 'boolean') {
    payload.show_response = values.showResponse;
  }
  const thinkingTextLength = traceTextLength(values);
  if (thinkingTextLength !== null) {
    payload.thinking_text_length = thinkingTextLength;
  }
  if (typeof values.compactHover === 'boolean') {
    payload.compact_hover = values.compactHover;
  }
  if (values.turnRef !== undefined) {
    payload.turn_ref = traceString(values.turnRef) || null;
  }
  if (values.staleGuardRef !== undefined) {
    payload.stale_guard_ref = traceString(values.staleGuardRef) || null;
  }
  return payload;
}

export function logRendererResponseSurfaceSizeTrace(
  values: RendererResponseSurfaceSizeTraceValues,
): void {
  logRendererResponseSurfaceTrace(buildRendererResponseSurfaceSizeTracePayload(values));
}

export function buildRendererResponseOverlayStateTracePayload(
  values: RendererResponseOverlayStateTraceValues,
): Record<string, unknown> {
  return {
    source: traceString(values.source) || 'renderer-response-overlay-state',
    action: traceString(values.action) || 'state-changed',
    turn_id: traceString(values.turnRef) || null,
    phase: traceString(values.phase) || 'idle',
    is_visible: values.isVisible === true,
    show_awaiting_reply: values.showAwaitingReply === true,
    show_response: values.showResponse === true,
    response_layout_mode: traceString(values.responseLayoutMode) || 'hidden',
    visible_response_id: traceString(values.visibleResponseId) || null,
    response_entry_count: traceNumberOrZero(values.responseEntryCount),
    active_response_text_length: traceNumberOrZero(values.activeResponseTextLength),
    thinking_text_length: traceTextLength(values),
    is_sending: values.isSending === true,
    message_count: traceNumberOrZero(values.messageCount),
  };
}

export function logRendererResponseOverlayStateTrace(
  values: RendererResponseOverlayStateTraceValues,
): void {
  logRendererResponseSurfaceTrace(buildRendererResponseOverlayStateTracePayload(values));
}

function getRendererPlatform(): string | null {
  if (typeof navigator === 'undefined') {
    return null;
  }
  const userAgentDataPlatform = (
    navigator as Navigator & { userAgentData?: { platform?: unknown } }
  ).userAgentData?.platform;
  const platform = typeof userAgentDataPlatform === 'string' && userAgentDataPlatform.trim()
    ? userAgentDataPlatform.trim()
    : typeof navigator.userAgent === 'string' && navigator.userAgent.trim()
      ? navigator.userAgent.trim()
      : '';
  return platform.length > 0 ? platform : null;
}

export function logRendererChatPillTrace(
  data: Record<string, unknown>,
  conversationRef: string | null = null,
): void {
  if (!isRendererStreamTraceEnabled()) {
    return;
  }
  console.log('[ChatPillTrace][renderer]', {
    view: getRendererTraceView(),
    platform: getRendererPlatform(),
    ...summarizeWorkspaceForTrace(conversationRef),
    ...data,
  });
}

export function buildRendererChatPillStateTracePayload(
  values: RendererChatPillStateTraceValues,
): Record<string, unknown> {
  return {
    source: traceString(values.source) || 'renderer-chat-pill-state',
    action: traceString(values.action) || 'state-changed',
    conversation_ref: traceString(values.conversationRef) || null,
    turn_id: traceString(values.turnRef) || null,
    current_turn_phase: traceString(values.currentTurnPhase) || null,
    live_turn_phase: traceString(values.liveTurnPhase) || null,
    live_turn_source: traceString(values.liveTurnSource) || null,
    is_sending: values.isSending === true,
    busy: values.busy === true,
    stop_available: values.stopAvailable === true,
    message_count: traceNumberOrZero(values.messageCount),
  };
}

export function logRendererChatPillStateTrace(
  values: RendererChatPillStateTraceValues,
): void {
  logRendererChatPillTrace(
    buildRendererChatPillStateTracePayload(values),
    traceString(values.conversationRef) || null,
  );
}

export function buildRendererResponseSurfaceRenderTracePayload(
  values: RendererResponseSurfaceRenderTraceValues,
): Record<string, unknown> {
  return {
    source: traceString(values.source) || 'renderer-response-surface',
    action: traceString(values.action) || 'render',
    turn_id: traceString(values.turnRef) || null,
    phase: traceString(values.phase) || 'idle',
    response_layout_mode: traceString(values.responseLayoutMode) || 'hidden',
    show_response: values.showResponse === true,
    show_awaiting_reply: values.showAwaitingReply === true,
  };
}

export function logRendererResponseSurfaceRenderTrace(
  values: RendererResponseSurfaceRenderTraceValues,
): void {
  logRendererChatPillTrace(buildRendererResponseSurfaceRenderTracePayload(values));
}

export function logRendererLiveSurfaceTrace(
  event: string,
  data: Record<string, unknown> = {},
  conversationRef: string | null = null,
): void {
  if (!isRendererLiveSurfaceTraceEnabled()) {
    return;
  }
  const payload = {
    ts: new Date().toISOString(),
    process: 'renderer',
    event,
    view: getRendererTraceView(),
    platform: getRendererPlatform(),
    ...summarizeWorkspaceForTrace(conversationRef),
    ...data,
  };
  console.log('[LiveSurfaceTrace]', payload);
  try {
    DesktopLiveSurfaceTraceRuntimeClient.send(payload);
  } catch (_error) {
    // Dev-only trace forwarding should never break renderer presentation.
  }
}
