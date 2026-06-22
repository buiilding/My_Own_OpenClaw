/**
 * Provides renderer diagnostic trace helpers for desktop chat surfaces.
 */

import { DesktopLiveSurfaceTraceRuntimeClient } from './desktopLiveSurfaceTraceRuntimeClient';
import { DesktopResponseOverlayLayoutRuntime } from './desktopResponseOverlayLayoutRuntime';

export type RendererTraceWorkspaceSnapshot = {
  activeConversationRef?: string | null;
  workspaceMessageCount?: number;
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
  conversationRef?: unknown;
  visible: boolean;
  layoutMode?: string | null;
  responseVisible?: boolean;
  thinkingText?: unknown;
  thinkingTextLength?: unknown;
  compactHover?: boolean;
  turnRef?: unknown;
  staleGuardRef?: unknown;
  width: unknown;
  height: unknown;
};

export type RendererResponseOverlayLifecycleTraceValues = {
  source?: string;
  action: 'mount' | 'unmount';
  conversationRef?: unknown;
  turnRef?: unknown;
  staleGuardRef?: unknown;
};

export type RendererResponseOverlayHitTestTraceValues = {
  source?: string;
  conversationRef?: unknown;
  active?: boolean;
};

export type RendererResponseOverlayTypingRenderedTraceValues = {
  source?: string;
  typingRendered?: boolean;
  currentTurnProjection?: {
    turnRef?: unknown;
    conversationRef?: unknown;
    phase?: unknown;
  } | null;
  currentTurnId?: unknown;
  overlayIntent?: {
    mode?: unknown;
    turnRef?: unknown;
    staleGuardRef?: unknown;
  } | null;
  overlayLayoutMode?: unknown;
  isVisible?: boolean;
  awaitingVisible?: boolean;
  responseVisible?: boolean;
  responseOverlayEntryCount?: unknown;
};

export type RendererChatPillStateTraceValues = {
  source?: string;
  action?: string;
  conversationRef?: unknown;
  turnRef?: unknown;
  currentTurnPhase?: unknown;
  liveTurnPhase?: unknown;
  liveTurnSource?: unknown;
  busy?: boolean;
  stopAvailable?: boolean;
  messageCount?: unknown;
};

export type RendererChatSendLifecycleTraceValues = {
  source?: string;
  action: 'send-start' | 'screenshot-decision' | 'query-dispatched';
  conversationRef?: unknown;
  turnId?: unknown;
  includeQueryScreenshot?: boolean;
  reason?: unknown;
};

export type RendererChatPillResetTraceValues = {
  source?: string;
  conversationRef?: unknown;
  previousTurnRef?: unknown;
  previousPhase?: unknown;
  attachmentCount?: unknown;
  includeQueryScreenshot?: boolean;
};

export type RendererChatPillLifecycleTraceValues = {
  source?: string;
  action: 'mount' | 'unmount';
  conversationRef?: unknown;
  turnRef?: unknown;
  phase?: unknown;
};

export type RendererChatPillHitTestTraceValues = {
  source?: string;
  conversationRef?: unknown;
  active?: boolean;
};

export type RendererCurrentTurnAppliedTraceValues = {
  source?: string;
  conversationRef?: unknown;
  currentTurn?: {
    turnRef?: unknown;
    phase?: unknown;
    assistantText?: unknown;
    reasoningText?: unknown;
    toolEvents?: readonly unknown[];
    presentation?: {
      overlayIntent?: {
        mode?: unknown;
        staleGuardRef?: unknown;
        turnRef?: unknown;
      } | null;
      hasVisibleContent?: boolean;
      entries?: readonly unknown[];
    } | null;
  } | null;
  skipDerivedSideEffects?: boolean;
};

export type RendererDisplayRowsProjectionTraceValues = {
  source?: string;
  conversationRef?: unknown;
  currentMessageCount?: unknown;
  currentOptimisticUserCount?: unknown;
  mergedMessageCount?: unknown;
  mergedUserImageCount?: unknown;
  mergedUserMessageCount?: unknown;
  mergedUserMessagesWithImages?: unknown;
  rowCount?: unknown;
  sdkMessageCount?: unknown;
  sdkProjectedUserImageCount?: unknown;
  sdkProjectedUserMessageCount?: unknown;
  sdkProjectedUserMessagesWithImages?: unknown;
  sdkUserImageCount?: unknown;
  sdkUserRowCount?: unknown;
  sdkUserRowsWithImages?: unknown;
};

export type RendererResponseOverlayStateTraceValues = {
  source?: string;
  action?: string;
  turnRef?: unknown;
  phase?: unknown;
  isVisible?: boolean;
  awaitingVisible?: boolean;
  responseVisible?: boolean;
  responseLayoutMode?: unknown;
  visibleResponseId?: unknown;
  responseEntryCount?: unknown;
  activeResponseTextLength?: unknown;
  thinkingText?: unknown;
  thinkingTextLength?: unknown;
  messageCount?: unknown;
};

export type RendererResponseSurfaceRenderTraceValues = {
  source?: string;
  action?: string;
  turnRef?: unknown;
  phase?: unknown;
  responseLayoutMode?: unknown;
  responseVisible?: boolean;
  awaitingVisible?: boolean;
};

export type RendererResponseSurfaceSnapshotTraceValues = {
  source?: string;
  phase?: unknown;
  messageCount?: unknown;
  activeResponseTextLength?: unknown;
  responseType?: unknown;
  visibleResponseId?: unknown;
  responseOverlayEntryCount?: unknown;
  awaitingVisible?: boolean;
  responseVisible?: boolean;
  thinkingText?: unknown;
  thinkingTextLength?: unknown;
};

export type RendererOverlayViewModelTraceValues = {
  currentTurnProjection?: {
    turnRef?: unknown;
    conversationRef?: unknown;
    phase?: unknown;
  } | null;
  currentTurnPhase?: unknown;
  overlayIntent?: {
    mode?: unknown;
    conversationRef?: unknown;
    turnRef?: unknown;
    staleGuardRef?: unknown;
  } | null;
  currentTurnPresentationState?: {
    awaitingDotTargetMessageId?: unknown;
    hasVisibleReply?: boolean;
    isBusy?: boolean;
  } | null;
  responseOverlayEntries?: unknown[];
  viewIntent?: {
    awaitingVisible?: boolean;
    responseVisible?: boolean;
    visibleResponse?: {
      id?: unknown;
    } | null;
    latestResponseOverlayEntryId?: unknown;
  } | null;
  useSdkLiveTurnPresentation?: boolean;
  useLocalPendingTurn?: boolean;
};

type RendererOverlayViewModelTraceEvent = {
  event: string;
  mode: 'awaiting' | 'response' | 'hidden';
  reason: string;
};

let workspaceSnapshotResolver: RendererTraceWorkspaceSnapshotResolver | null = null;

function configureRendererTraceWorkspaceSnapshotResolver(
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
  const snapshot = workspaceSnapshotResolver?.(conversationRef) ?? {};
  const summary: RendererTraceWorkspaceSnapshot = {};
  if (snapshot.activeConversationRef !== undefined) {
    summary.activeConversationRef = snapshot.activeConversationRef;
  }
  if (snapshot.workspaceMessageCount !== undefined) {
    summary.workspaceMessageCount = snapshot.workspaceMessageCount;
  }
  if (snapshot.activeTurnRef !== undefined) {
    summary.activeTurnRef = snapshot.activeTurnRef;
  }
  if (snapshot.lastMessage !== undefined) {
    summary.lastMessage = snapshot.lastMessage;
  }
  return summary;
}

function logRendererResponseSurfaceTrace(data: Record<string, unknown>): void {
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

function buildRendererResponseSurfaceSizeTracePayload(
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
  if (typeof values.responseVisible === 'boolean') {
    payload.response_visible = values.responseVisible;
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

function buildRendererResponseSurfaceSizeLiveTracePayload(
  values: RendererResponseSurfaceSizeTraceValues,
): Record<string, unknown> {
  const layoutMode = traceString(values.layoutMode) || 'hidden';
  const payload: Record<string, unknown> = {
    source: traceString(values.source) || 'renderer-response-window-sync',
    reason: traceString(values.action) || 'size-report',
    visible: values.visible === true,
    layoutMode,
    turnRef: traceString(values.turnRef) || null,
    guardRef: traceString(values.staleGuardRef) || null,
    width: traceNumberOrZero(values.width),
    height: traceNumberOrZero(values.height),
  };
  if (values.visible === true) {
    payload.overlayMode = DesktopResponseOverlayLayoutRuntime.resolveResponseOverlayNativeMode(
      layoutMode,
    );
    if (typeof values.responseVisible === 'boolean') {
      payload.responseVisible = values.responseVisible;
    }
    const thinkingTextLength = traceTextLength(values);
    if (thinkingTextLength !== null) {
      payload.thinkingTextLength = thinkingTextLength;
    }
    if (typeof values.compactHover === 'boolean') {
      payload.compactHover = values.compactHover;
    }
  }
  return payload;
}

function logRendererResponseSurfaceSizeTrace(
  values: RendererResponseSurfaceSizeTraceValues,
): void {
  logRendererResponseSurfaceTrace(buildRendererResponseSurfaceSizeTracePayload(values));
  logRendererLiveSurfaceTrace(
    'response_overlay.renderer.size_report',
    buildRendererResponseSurfaceSizeLiveTracePayload(values),
    traceString(values.conversationRef) || null,
  );
}

function logRendererResponseOverlayLifecycleTrace(
  values: RendererResponseOverlayLifecycleTraceValues,
): void {
  const action = values.action === 'unmount' ? 'unmount' : 'mount';
  logRendererLiveSurfaceTrace(
    `renderer.response_overlay.${action}`,
    {
      source: traceString(values.source) || 'renderer-response-window-sync',
      turnRef: traceString(values.turnRef) || null,
      guardRef: traceString(values.staleGuardRef) || null,
    },
    traceString(values.conversationRef) || null,
  );
}

function buildRendererResponseOverlayHitTestTracePayload(
  values: RendererResponseOverlayHitTestTraceValues,
): Record<string, unknown> {
  const active = values.active === true;
  return {
    source: traceString(values.source) || 'minimal-response-overlay-renderer',
    reason: 'renderer-normal-hit-test-request',
    active,
    ignoreMouseEvents: !active,
  };
}

function logRendererResponseOverlayHitTestTrace(
  values: RendererResponseOverlayHitTestTraceValues,
): void {
  logRendererLiveSurfaceTrace(
    'response_overlay.hit_test.set',
    buildRendererResponseOverlayHitTestTracePayload(values),
    traceString(values.conversationRef) || null,
  );
}

function buildRendererResponseOverlayTypingRenderedTracePayload(
  values: RendererResponseOverlayTypingRenderedTraceValues,
): Record<string, unknown> {
  const typingRendered = values.typingRendered === true;
  const currentTurnProjection = values.currentTurnProjection;
  const overlayIntent = values.overlayIntent;
  const turnRef = (
    traceString(currentTurnProjection?.turnRef)
    || traceString(values.currentTurnId)
    || null
  );
  return {
    source: traceString(values.source) || 'minimal-response-overlay',
    reason: typingRendered ? 'awaiting-indicator-rendered' : 'awaiting-indicator-not-rendered',
    turnRef,
    conversationRef: traceString(currentTurnProjection?.conversationRef) || null,
    phase: traceString(currentTurnProjection?.phase) || 'idle',
    overlayMode: (
      traceString(overlayIntent?.mode)
      || traceString(values.overlayLayoutMode)
      || null
    ),
    guardRef: (
      traceString(overlayIntent?.staleGuardRef)
      || traceString(overlayIntent?.turnRef)
      || traceString(currentTurnProjection?.turnRef)
      || traceString(values.currentTurnId)
      || null
    ),
    isVisible: values.isVisible === true,
    awaitingVisible: values.awaitingVisible === true,
    responseVisible: values.responseVisible === true,
    layoutMode: traceString(values.overlayLayoutMode) || null,
    entryCount: traceNumberOrZero(values.responseOverlayEntryCount),
    hasVisibleContent: traceNumberOrZero(values.responseOverlayEntryCount) > 0,
  };
}

function logRendererResponseOverlayTypingRenderedTrace(
  values: RendererResponseOverlayTypingRenderedTraceValues,
): void {
  const typingRendered = values.typingRendered === true;
  logRendererLiveSurfaceTrace(
    typingRendered ? 'typing.rendered.show' : 'typing.rendered.hide',
    buildRendererResponseOverlayTypingRenderedTracePayload(values),
    traceString(values.currentTurnProjection?.conversationRef) || null,
  );
}

function buildRendererResponseOverlayStateTracePayload(
  values: RendererResponseOverlayStateTraceValues,
): Record<string, unknown> {
  return {
    source: traceString(values.source) || 'renderer-response-overlay-state',
    action: traceString(values.action) || 'state-changed',
    turn_id: traceString(values.turnRef) || null,
    phase: traceString(values.phase) || 'idle',
    is_visible: values.isVisible === true,
    awaiting_visible: values.awaitingVisible === true,
    response_visible: values.responseVisible === true,
    response_layout_mode: traceString(values.responseLayoutMode) || 'hidden',
    visible_response_id: traceString(values.visibleResponseId) || null,
    response_entry_count: traceNumberOrZero(values.responseEntryCount),
    active_response_text_length: traceNumberOrZero(values.activeResponseTextLength),
    thinking_text_length: traceTextLength(values),
    message_count: traceNumberOrZero(values.messageCount),
  };
}

function logRendererResponseOverlayStateTrace(
  values: RendererResponseOverlayStateTraceValues,
): void {
  logRendererResponseSurfaceTrace(buildRendererResponseOverlayStateTracePayload(values));
}

function buildRendererResponseSurfaceSnapshotTracePayload(
  values: RendererResponseSurfaceSnapshotTraceValues,
): Record<string, unknown> {
  return {
    source: traceString(values.source) || 'minimal-response-overlay',
    overlayPhase: traceString(values.phase) || 'idle',
    messageCount: traceNumberOrZero(values.messageCount),
    activeResponseTextLength: traceNumberOrZero(values.activeResponseTextLength),
    activeResponseType: traceString(values.responseType) || null,
    visibleResponseId: traceString(values.visibleResponseId) || null,
    responseOverlayEntryCount: traceNumberOrZero(values.responseOverlayEntryCount),
    awaitingVisible: values.awaitingVisible === true,
    responseVisible: values.responseVisible === true,
    thinkingTextLength: traceTextLength(values) ?? 0,
  };
}

function logRendererResponseSurfaceSnapshotTrace(
  values: RendererResponseSurfaceSnapshotTraceValues,
): void {
  logRendererResponseSurfaceTrace(buildRendererResponseSurfaceSnapshotTracePayload(values));
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

function logRendererChatPillTrace(
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

function buildRendererChatPillStateTracePayload(
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
    busy: values.busy === true,
    stop_available: values.stopAvailable === true,
    message_count: traceNumberOrZero(values.messageCount),
  };
}

function logRendererChatPillStateTrace(
  values: RendererChatPillStateTraceValues,
): void {
  logRendererChatPillTrace(
    buildRendererChatPillStateTracePayload(values),
    traceString(values.conversationRef) || null,
  );
}

function buildRendererChatSendLifecycleTracePayload(
  values: RendererChatSendLifecycleTraceValues,
): Record<string, unknown> {
  return {
    source: traceString(values.source) || 'renderer-send',
    action: values.action,
    turn_id: traceString(values.turnId) || null,
    include_query_screenshot: values.includeQueryScreenshot === true,
    reason: traceString(values.reason) || null,
  };
}

function logRendererChatSendLifecycleTrace(
  values: RendererChatSendLifecycleTraceValues,
): void {
  logRendererChatPillTrace(
    buildRendererChatSendLifecycleTracePayload(values),
    traceString(values.conversationRef) || null,
  );
}

function buildRendererChatPillResetTracePayload(
  values: RendererChatPillResetTraceValues,
): Record<string, unknown> {
  return {
    source: traceString(values.source) || 'minimal-chat-pill',
    reason: 'user-send',
    conversationRef: traceString(values.conversationRef) || null,
    previousTurnRef: traceString(values.previousTurnRef) || null,
    previousPhase: traceString(values.previousPhase) || null,
    attachmentCount: traceNumberOrZero(values.attachmentCount),
    includeQueryScreenshot: values.includeQueryScreenshot === true,
  };
}

function logRendererChatPillResetTrace(
  values: RendererChatPillResetTraceValues,
): void {
  logRendererLiveSurfaceTrace(
    'turn_surface.reset',
    buildRendererChatPillResetTracePayload(values),
    traceString(values.conversationRef) || null,
  );
}

function buildRendererChatPillLifecycleTracePayload(
  values: RendererChatPillLifecycleTraceValues,
): Record<string, unknown> {
  return {
    source: traceString(values.source) || 'minimal-chat-pill',
    conversationRef: traceString(values.conversationRef) || null,
    turnRef: traceString(values.turnRef) || null,
    phase: traceString(values.phase) || null,
  };
}

function logRendererChatPillLifecycleTrace(
  values: RendererChatPillLifecycleTraceValues,
): void {
  const action = values.action === 'unmount' ? 'unmount' : 'mount';
  logRendererLiveSurfaceTrace(
    `renderer.chat_pill.${action}`,
    buildRendererChatPillLifecycleTracePayload(values),
    traceString(values.conversationRef) || null,
  );
}

function buildRendererChatPillHitTestTracePayload(
  values: RendererChatPillHitTestTraceValues,
): Record<string, unknown> {
  const active = values.active === true;
  return {
    source: traceString(values.source) || 'minimal-chat-pill-renderer',
    reason: 'renderer-normal-hit-test-request',
    active,
    ignoreMouseEvents: !active,
  };
}

function logRendererChatPillHitTestTrace(
  values: RendererChatPillHitTestTraceValues,
): void {
  logRendererLiveSurfaceTrace(
    'chat_pill.hit_test.set',
    buildRendererChatPillHitTestTracePayload(values),
    traceString(values.conversationRef) || null,
  );
}

function buildRendererCurrentTurnAppliedTracePayload(
  values: RendererCurrentTurnAppliedTraceValues,
): Record<string, unknown> {
  const currentTurn = values.currentTurn;
  const presentation = currentTurn?.presentation;
  const overlayIntent = presentation?.overlayIntent;
  return {
    source: traceString(values.source) || 'sdk:current-turn',
    turnRef: traceString(currentTurn?.turnRef) || null,
    conversationRef: traceString(values.conversationRef) || null,
    phase: traceString(currentTurn?.phase) || null,
    overlayMode: traceString(overlayIntent?.mode) || null,
    guardRef: (
      traceString(overlayIntent?.staleGuardRef)
      || traceString(overlayIntent?.turnRef)
      || traceString(currentTurn?.turnRef)
      || null
    ),
    hasVisibleContent: presentation?.hasVisibleContent === true,
    entryCount: Array.isArray(presentation?.entries) ? presentation.entries.length : 0,
    assistantLength: typeof currentTurn?.assistantText === 'string'
      ? currentTurn.assistantText.length
      : 0,
    reasoningLength: typeof currentTurn?.reasoningText === 'string'
      ? currentTurn.reasoningText.length
      : 0,
    toolEventCount: Array.isArray(currentTurn?.toolEvents) ? currentTurn.toolEvents.length : 0,
    staleSideEffectsSkipped: values.skipDerivedSideEffects === true,
  };
}

function logRendererCurrentTurnAppliedTrace(
  values: RendererCurrentTurnAppliedTraceValues,
): void {
  logRendererLiveSurfaceTrace(
    'renderer.current_turn.applied',
    buildRendererCurrentTurnAppliedTracePayload(values),
    traceString(values.conversationRef) || null,
  );
}

function buildRendererDisplayRowsProjectionTracePayload(
  values: RendererDisplayRowsProjectionTraceValues,
): Record<string, unknown> {
  return {
    source: traceString(values.source) || 'sdk-display-rows',
    conversationRef: traceString(values.conversationRef) || null,
    rowCount: traceNumberOrZero(values.rowCount),
    sdkUserRowCount: traceNumberOrZero(values.sdkUserRowCount),
    sdkUserRowsWithImages: traceNumberOrZero(values.sdkUserRowsWithImages),
    sdkUserImageCount: traceNumberOrZero(values.sdkUserImageCount),
    sdkMessageCount: traceNumberOrZero(values.sdkMessageCount),
    sdkProjectedUserMessageCount: traceNumberOrZero(values.sdkProjectedUserMessageCount),
    sdkProjectedUserMessagesWithImages: traceNumberOrZero(values.sdkProjectedUserMessagesWithImages),
    sdkProjectedUserImageCount: traceNumberOrZero(values.sdkProjectedUserImageCount),
    currentMessageCount: traceNumberOrZero(values.currentMessageCount),
    currentOptimisticUserCount: traceNumberOrZero(values.currentOptimisticUserCount),
    mergedMessageCount: traceNumberOrZero(values.mergedMessageCount),
    mergedUserMessageCount: traceNumberOrZero(values.mergedUserMessageCount),
    mergedUserMessagesWithImages: traceNumberOrZero(values.mergedUserMessagesWithImages),
    mergedUserImageCount: traceNumberOrZero(values.mergedUserImageCount),
  };
}

function logRendererDisplayRowsProjectionTrace(
  values: RendererDisplayRowsProjectionTraceValues,
): void {
  logRendererLiveSurfaceTrace(
    'renderer.display_rows.projected',
    buildRendererDisplayRowsProjectionTracePayload(values),
    traceString(values.conversationRef) || null,
  );
}

function buildRendererResponseSurfaceRenderTracePayload(
  values: RendererResponseSurfaceRenderTraceValues,
): Record<string, unknown> {
  return {
    source: traceString(values.source) || 'renderer-response-surface',
    action: traceString(values.action) || 'render',
    turn_id: traceString(values.turnRef) || null,
    phase: traceString(values.phase) || 'idle',
    response_layout_mode: traceString(values.responseLayoutMode) || 'hidden',
    response_visible: values.responseVisible === true,
    awaiting_visible: values.awaitingVisible === true,
  };
}

function logRendererResponseSurfaceRenderTrace(
  values: RendererResponseSurfaceRenderTraceValues,
): void {
  logRendererChatPillTrace(buildRendererResponseSurfaceRenderTracePayload(values));
}

function buildRendererOverlayViewModelTracePayload(
  values: RendererOverlayViewModelTraceValues,
): Record<string, unknown> {
  const currentTurnProjection = values.currentTurnProjection;
  const overlayIntent = values.overlayIntent;
  const currentTurnPresentationState = values.currentTurnPresentationState;
  const responseOverlayEntries = Array.isArray(values.responseOverlayEntries)
    ? values.responseOverlayEntries
    : [];
  const viewIntent = values.viewIntent;
  return {
    source: 'renderer-overlay-view-model',
    turnRef: traceString(currentTurnProjection?.turnRef) || null,
    conversationRef: (
      traceString(currentTurnProjection?.conversationRef)
      || traceString(overlayIntent?.conversationRef)
      || null
    ),
    phase: traceString(currentTurnProjection?.phase) || traceString(values.currentTurnPhase) || null,
    overlayMode: traceString(overlayIntent?.mode) || null,
    guardRef: (
      traceString(overlayIntent?.staleGuardRef)
      || traceString(overlayIntent?.turnRef)
      || traceString(currentTurnProjection?.turnRef)
      || null
    ),
    awaitingVisible: viewIntent?.awaitingVisible === true,
    responseVisible: viewIntent?.responseVisible === true,
    showAwaitingDot: (
      viewIntent?.awaitingVisible === true
      && traceString(currentTurnPresentationState?.awaitingDotTargetMessageId) !== null
    ),
    hasVisibleReply: currentTurnPresentationState?.hasVisibleReply === true,
    isBusy: currentTurnPresentationState?.isBusy === true,
    entryCount: responseOverlayEntries.length,
    visibleResponseId: traceString(viewIntent?.visibleResponse?.id) || null,
    latestEntryId: traceString(viewIntent?.latestResponseOverlayEntryId) || null,
    useSdkLiveTurnPresentation: values.useSdkLiveTurnPresentation === true,
    useLocalPendingTurn: values.useLocalPendingTurn === true,
  };
}

function buildRendererOverlayTypingTraceEvent(
  tracePayload: Record<string, unknown>,
): RendererOverlayViewModelTraceEvent {
  const awaitingVisible = tracePayload.awaitingVisible === true;
  const responseVisible = tracePayload.responseVisible === true;
  const useLocalPendingTurn = tracePayload.useLocalPendingTurn === true;
  return {
    event: awaitingVisible ? 'typing.show' : 'typing.hide',
    mode: awaitingVisible ? 'awaiting' : (responseVisible ? 'response' : 'hidden'),
    reason: awaitingVisible
      ? (useLocalPendingTurn ? 'local-pending-awaiting' : 'sdk-awaiting')
      : (responseVisible ? 'response-visible' : 'not-awaiting'),
  };
}

function buildRendererOverlayIntentTraceEvent(
  tracePayload: Record<string, unknown>,
): RendererOverlayViewModelTraceEvent {
  const awaitingVisible = tracePayload.awaitingVisible === true;
  const responseVisible = tracePayload.responseVisible === true;
  const mode = awaitingVisible ? 'awaiting' : (responseVisible ? 'response' : 'hidden');
  return {
    mode,
    event: mode === 'awaiting'
      ? 'response_overlay.intent.show_awaiting'
      : (mode === 'response'
        ? 'response_overlay.intent.show_response'
        : 'response_overlay.intent.hide'),
    reason: mode === 'awaiting'
      ? 'renderer-view-model-awaiting'
      : (mode === 'response'
        ? 'renderer-view-model-response'
        : 'renderer-view-model-hidden'),
  };
}

function logRendererOverlayViewModelTrace(
  event: string,
  tracePayload: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): void {
  logRendererLiveSurfaceTrace(
    event,
    {
      ...tracePayload,
      ...extra,
    },
    traceString(tracePayload.conversationRef) || null,
  );
}

function logRendererOverlayViewModelResolvedTrace(
  tracePayload: Record<string, unknown>,
): void {
  logRendererOverlayViewModelTrace('renderer.overlay_view_model.resolved', tracePayload);
}

function logRendererLiveSurfaceTrace(
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

export const DesktopRendererTraceRuntime = Object.freeze({
  buildRendererChatPillHitTestTracePayload,
  buildRendererChatPillLifecycleTracePayload,
  buildRendererChatPillResetTracePayload,
  buildRendererChatPillStateTracePayload,
  buildRendererChatSendLifecycleTracePayload,
  buildRendererCurrentTurnAppliedTracePayload,
  buildRendererDisplayRowsProjectionTracePayload,
  buildRendererOverlayIntentTraceEvent,
  buildRendererOverlayTypingTraceEvent,
  buildRendererOverlayViewModelTracePayload,
  buildRendererResponseOverlayHitTestTracePayload,
  buildRendererResponseOverlayStateTracePayload,
  buildRendererResponseOverlayTypingRenderedTracePayload,
  buildRendererResponseSurfaceRenderTracePayload,
  buildRendererResponseSurfaceSizeLiveTracePayload,
  buildRendererResponseSurfaceSizeTracePayload,
  buildRendererResponseSurfaceSnapshotTracePayload,
  configureRendererTraceWorkspaceSnapshotResolver,
  logRendererChatPillHitTestTrace,
  logRendererChatPillLifecycleTrace,
  logRendererChatPillResetTrace,
  logRendererChatPillStateTrace,
  logRendererChatPillTrace,
  logRendererChatSendLifecycleTrace,
  logRendererCurrentTurnAppliedTrace,
  logRendererDisplayRowsProjectionTrace,
  logRendererLiveSurfaceTrace,
  logRendererOverlayViewModelResolvedTrace,
  logRendererOverlayViewModelTrace,
  logRendererResponseOverlayHitTestTrace,
  logRendererResponseOverlayLifecycleTrace,
  logRendererResponseOverlayStateTrace,
  logRendererResponseOverlayTypingRenderedTrace,
  logRendererResponseSurfaceRenderTrace,
  logRendererResponseSurfaceSizeTrace,
  logRendererResponseSurfaceSnapshotTrace,
  logRendererResponseSurfaceTrace,
});
