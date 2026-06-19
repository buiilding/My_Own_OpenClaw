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
  configureRendererTraceWorkspaceSnapshotResolver,
  logRendererChatPillTrace,
  logRendererLiveSurfaceTrace,
  logRendererResponseSurfaceTrace,
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
});
