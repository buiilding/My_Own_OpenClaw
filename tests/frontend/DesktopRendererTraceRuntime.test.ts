/**
 * Covers renderer trace runtime behavior in the frontend test suite.
 */

const mockSendLiveSurfaceTrace = jest.fn();

jest.mock('../../frontend/src/renderer/app/runtime/desktopLiveSurfaceTraceRuntimeClient', () => ({
  DesktopLiveSurfaceTraceRuntimeClient: {
    send: (...args: unknown[]) => mockSendLiveSurfaceTrace(...args),
  },
}));

import {
  buildRendererResponseSurfaceSizeTracePayload,
  configureRendererTraceWorkspaceSnapshotResolver,
  logRendererChatPillTrace,
  logRendererLiveSurfaceTrace,
  logRendererResponseSurfaceTrace,
  logRendererResponseSurfaceSizeTrace,
} from '../../frontend/src/renderer/app/runtime/desktopRendererTraceRuntime';

function setSearch(search: string) {
  window.history.replaceState({}, '', `/${search}`);
}

describe('desktopRendererTraceRuntime', () => {
  const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});

  beforeEach(() => {
    jest.clearAllMocks();
    configureRendererTraceWorkspaceSnapshotResolver(null);
    setSearch('');
  });

  afterAll(() => {
    consoleLog.mockRestore();
  });

  test('does not emit stream traces when debug query flags are absent', () => {
    logRendererResponseSurfaceTrace({ event: 'size' });
    logRendererChatPillTrace({ event: 'pill' }, 'conv-1');
    logRendererLiveSurfaceTrace('typing.show', {}, 'conv-1');

    expect(consoleLog).not.toHaveBeenCalled();
    expect(mockSendLiveSurfaceTrace).not.toHaveBeenCalled();
  });

  test('adds injected workspace snapshots to chat-pill and live-surface traces', () => {
    setSearch('?debug_live_surface=1&debug_chat_pill=1&view=minimal-chat-pill');
    configureRendererTraceWorkspaceSnapshotResolver((conversationRef) => ({
      activeConversationRef: conversationRef,
      workspaceMessageCount: 2,
      isSending: true,
      thinkingStatus: 'Thinking...',
      phase: 'streaming',
      activeTurnRef: 'turn-1',
      lastMessage: {
        sender: 'assistant',
        type: 'llm-text',
        textLength: 12,
        turnRef: 'turn-1',
        sourceEventType: 'streaming-response',
      },
    }));

    logRendererChatPillTrace({ event: 'pill' }, 'conv-1');
    logRendererLiveSurfaceTrace('typing.show', { extra: true }, 'conv-1');

    expect(consoleLog).toHaveBeenCalledWith('[ChatPillTrace][renderer]', expect.objectContaining({
      view: 'minimal-chat-pill',
      activeConversationRef: 'conv-1',
      workspaceMessageCount: 2,
      event: 'pill',
    }));
    expect(consoleLog).toHaveBeenCalledWith('[LiveSurfaceTrace]', expect.objectContaining({
      event: 'typing.show',
      view: 'minimal-chat-pill',
      activeConversationRef: 'conv-1',
      workspaceMessageCount: 2,
      extra: true,
    }));
    expect(mockSendLiveSurfaceTrace).toHaveBeenCalledWith(expect.objectContaining({
      event: 'typing.show',
      activeConversationRef: 'conv-1',
      workspaceMessageCount: 2,
    }));
  });

  test('emits response-surface traces under the stream debug flag', () => {
    setSearch('?debug_stream=1&view=response-overlay');

    logRendererResponseSurfaceTrace({ event: 'resize' });

    expect(consoleLog).toHaveBeenCalledWith('[StreamTrace][renderer][response-surface]', {
      view: 'response-overlay',
      event: 'resize',
    });
  });

  test('builds response-surface size trace payloads from renderer values', () => {
    expect(buildRendererResponseSurfaceSizeTracePayload({
      action: 'show-or-resize-requested',
      visible: true,
      layoutMode: 'response',
      showResponse: true,
      thinkingText: 'thinking',
      compactHover: false,
      turnRef: ' turn-1 ',
      staleGuardRef: ' guard-1 ',
      width: '320.5',
      height: 236,
    })).toEqual({
      source: 'renderer-response-window-sync',
      action: 'show-or-resize-requested',
      visible: true,
      layout_mode: 'response',
      show_response: true,
      thinking_text_length: 8,
      compact_hover: false,
      turn_ref: 'turn-1',
      stale_guard_ref: 'guard-1',
      width: 320.5,
      height: 236,
    });

    expect(buildRendererResponseSurfaceSizeTracePayload({
      source: ' custom-source ',
      action: '',
      visible: false,
      layoutMode: '',
      thinkingTextLength: 4,
      turnRef: '',
      staleGuardRef: undefined,
      width: 'bad',
      height: null,
    })).toEqual({
      source: 'custom-source',
      action: 'size-report',
      visible: false,
      layout_mode: 'hidden',
      thinking_text_length: 4,
      turn_ref: null,
      width: 0,
      height: 0,
    });
  });

  test('emits normalized response-surface size traces under the stream debug flag', () => {
    setSearch('?debug_stream=1&view=response-overlay');

    logRendererResponseSurfaceSizeTrace({
      action: 'hide-requested',
      visible: false,
      layoutMode: 'hidden',
      width: 0,
      height: 0,
    });

    expect(consoleLog).toHaveBeenCalledWith('[StreamTrace][renderer][response-surface]', {
      view: 'response-overlay',
      source: 'renderer-response-window-sync',
      action: 'hide-requested',
      visible: false,
      layout_mode: 'hidden',
      width: 0,
      height: 0,
    });
  });
});
