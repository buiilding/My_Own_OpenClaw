import { useChatStore } from '../../stores/chatStore';

export function getRendererSearch(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  return typeof window.location?.search === 'string' ? window.location.search : '';
}

export function isRendererStreamTraceEnabled(): boolean {
  const search = getRendererSearch();
  return search.includes('debug_stream=1') || search.includes('debug_chat_pill=1');
}

export function isRendererLiveSurfaceTraceEnabled(): boolean {
  const search = getRendererSearch();
  return (
    search.includes('debug_live_surface=1')
    || search.includes('debug_stream=1')
    || search.includes('debug_chat_pill=1')
    || search.includes('dev_ui=1')
  );
}

export function getRendererTraceView(): string {
  if (typeof window === 'undefined') {
    return 'unknown';
  }
  const params = new URLSearchParams(getRendererSearch());
  return params.get('view') || 'main';
}

export function summarizeWorkspaceForTrace(conversationRef: string | null) {
  const store = useChatStore.getState();
  const workspace = store.getWorkspaceState(conversationRef);
  const lastMessage = workspace.messages[workspace.messages.length - 1] || null;
  return {
    activeConversationRef: store.activeConversationRef,
    workspaceMessageCount: workspace.messages.length,
    isSending: workspace.isSending,
    thinkingStatus: workspace.thinkingStatus,
    phase: workspace.streamTracking.phase,
    activeTurnRef: workspace.streamTracking.activeTurnRef,
    lastMessage: lastMessage ? {
      sender: lastMessage.sender,
      type: lastMessage.type || null,
      textLength: typeof lastMessage.text === 'string' ? lastMessage.text.length : 0,
      turnRef: lastMessage.turnRef || null,
      sourceEventType: lastMessage.sourceEventType || null,
    } : null,
  };
}

export function logRendererStreamTrace(
  stage: 'before' | 'after',
  {
    eventType,
    turnRef,
    conversationRef,
    sdkEventType,
  }: {
    eventType: string;
    turnRef?: string | null;
    conversationRef: string | null;
    sdkEventType?: string | null;
  },
): void {
  if (!isRendererStreamTraceEnabled()) {
    return;
  }
  console.log(`[StreamTrace][renderer][${stage}]`, {
    view: getRendererTraceView(),
    eventType,
    turnRef: turnRef || null,
    conversationRef,
    sdkEventType: sdkEventType || null,
    ...summarizeWorkspaceForTrace(conversationRef),
  });
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
  if (typeof navigator === 'undefined' || typeof navigator.platform !== 'string') {
    return null;
  }
  const platform = navigator.platform.trim();
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
  console.log('[LiveSurfaceTrace]', {
    ts: new Date().toISOString(),
    process: 'renderer',
    event,
    view: getRendererTraceView(),
    platform: getRendererPlatform(),
    ...summarizeWorkspaceForTrace(conversationRef),
    ...data,
  });
}
