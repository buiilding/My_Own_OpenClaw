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
