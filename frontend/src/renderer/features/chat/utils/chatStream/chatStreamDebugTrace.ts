import { useChatStore } from '../../stores/chatStore';

function getRendererSearch(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  return typeof window.location?.search === 'string' ? window.location.search : '';
}

function isRendererStreamTraceEnabled(): boolean {
  return getRendererSearch().includes('debug_stream=1');
}

function getRendererTraceView(): string {
  if (typeof window === 'undefined') {
    return 'unknown';
  }
  const params = new URLSearchParams(getRendererSearch());
  return params.get('view') || 'main';
}

function summarizeWorkspaceForTrace(conversationRef: string | null) {
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
  }: {
    eventType: string;
    turnRef?: string | null;
    conversationRef: string | null;
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
