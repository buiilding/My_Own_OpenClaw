/**
 * Covers renderer trace runtime behavior in the frontend test suite.
 */

const mockSendLiveSurfaceTrace = jest.fn();
const mockInvokeAgentSdkCommand = jest.fn();

jest.mock('../../frontend/src/renderer/app/runtime/desktopLiveSurfaceTraceRuntimeClient', () => ({
  DesktopLiveSurfaceTraceRuntimeClient: {
    send: (...args: unknown[]) => mockSendLiveSurfaceTrace(...args),
  },
}));

jest.mock('../../frontend/src/renderer/app/runtime/agentSdkCommandInvokeClient', () => ({
  AgentSdkCommandInvokeClient: {
    invokeAgentSdkCommand: (...args: unknown[]) => mockInvokeAgentSdkCommand(...args),
  },
}));

import { DesktopRendererTraceRuntime } from '../../frontend/src/renderer/app/runtime/desktopRendererTraceRuntime';

const {
  buildRendererChatSendLifecycleTracePayload,
  buildRendererChatPillHitTestTracePayload,
  buildRendererChatPillLifecycleTracePayload,
  buildRendererChatPillResetTracePayload,
  buildRendererCurrentTurnAppliedTracePayload,
  buildRendererDisplayRowsProjectionTracePayload,
  buildRendererOverlayIntentTraceEvent,
  buildRendererOverlayTypingTraceEvent,
  buildRendererOverlayViewModelTracePayload,
  buildRendererResponseOverlayHitTestTracePayload,
  buildRendererResponseOverlayTypingRenderedTracePayload,
  buildRendererResponseSurfaceSnapshotTracePayload,
  buildRendererResponseSurfaceSizeLiveTracePayload,
  buildRendererResponseSurfaceSizeTracePayload,
  configureRendererTraceWorkspaceSnapshotResolver,
  logRendererChatSendLifecycleTrace,
  logRendererChatPillHitTestTrace,
  logRendererChatPillLifecycleTrace,
  logRendererChatPillResetTrace,
  logRendererCurrentTurnAppliedTrace,
  logRendererDisplayRowsProjectionTrace,
  logRendererOverlayViewModelTrace,
  logRendererOverlayViewModelResolvedTrace,
  logRendererChatPillTrace,
  logRendererLiveSurfaceTrace,
  logRendererResponseOverlayHitTestTrace,
  logRendererResponseOverlayLifecycleTrace,
  logRendererResponseOverlayTypingRenderedTrace,
  logRendererResponseSurfaceTrace,
  logRendererResponseSurfaceSnapshotTrace,
  logRendererResponseSurfaceSizeTrace,
} = DesktopRendererTraceRuntime;

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

  test('builds and emits display-row projection image-count traces', () => {
    setSearch('?debug_live_surface=1&view=main');
    mockInvokeAgentSdkCommand.mockResolvedValue({ stored: true });

    expect(buildRendererDisplayRowsProjectionTracePayload({
      source: 'sdk-display-rows-stream',
      conversationRef: 'conv-1',
      rowCount: 2,
      sdkUserRowCount: 1,
      sdkUserRowsWithImages: 1,
      sdkUserImageCount: 1,
      sdkMessageCount: 2,
      sdkProjectedUserImageCount: 1,
      currentMessageCount: 1,
      currentOptimisticUserCount: 1,
      mergedMessageCount: 2,
      mergedUserImageCount: 1,
    })).toEqual(expect.objectContaining({
      source: 'sdk-display-rows-stream',
      conversationRef: 'conv-1',
      sdkUserImageCount: 1,
      currentOptimisticUserCount: 1,
      mergedUserImageCount: 1,
    }));

    logRendererDisplayRowsProjectionTrace({
      source: 'sdk-display-rows-stream',
      conversationRef: 'conv-1',
      rowCount: 2,
      sdkUserRowCount: 1,
      sdkUserImageCount: 1,
      mergedUserImageCount: 1,
    });

    expect(mockSendLiveSurfaceTrace).toHaveBeenCalledWith(expect.objectContaining({
      event: 'renderer.display_rows.projected',
      source: 'sdk-display-rows-stream',
      conversationRef: 'conv-1',
      sdkUserImageCount: 1,
      mergedUserImageCount: 1,
    }));
    expect(mockInvokeAgentSdkCommand).toHaveBeenCalledWith('diagnostics.append', expect.objectContaining({
      _diagnostics: expect.objectContaining({
        path: 'renderer.display_projection',
        traceId: expect.stringMatching(/^diag_/),
        requestId: expect.stringMatching(/^req_/),
        conversationRef: 'conv-1',
      }),
      stage: 'projected',
      status: 'succeeded',
      runtime: 'renderer',
      data: expect.objectContaining({
        action: 'display_rows_projected',
        event: 'renderer.display_rows.projected',
        source: 'sdk-display-rows-stream',
        sdkUserImageCount: 1,
        mergedUserImageCount: 1,
      }),
    }));
  });

  test('persists display-row projection diagnostics when live tracing is disabled', () => {
    mockInvokeAgentSdkCommand.mockResolvedValue({ stored: true });

    logRendererDisplayRowsProjectionTrace({
      source: 'dashboard-open-conversation',
      conversationRef: 'conv-2',
      rowCount: 1,
      sdkUserRowCount: 1,
      sdkUserRowsWithImages: 1,
      sdkUserImageCount: 1,
      sdkProjectedUserImageCount: 1,
      currentOptimisticUserCount: 1,
      mergedUserImageCount: 1,
    });

    expect(mockSendLiveSurfaceTrace).not.toHaveBeenCalled();
    expect(mockInvokeAgentSdkCommand).toHaveBeenCalledWith('diagnostics.append', expect.objectContaining({
      _diagnostics: expect.objectContaining({
        path: 'renderer.display_projection',
        conversationRef: 'conv-2',
      }),
      data: expect.objectContaining({
        source: 'dashboard-open-conversation',
        rowCount: 1,
        sdkUserRowsWithImages: 1,
        sdkUserImageCount: 1,
        sdkProjectedUserImageCount: 1,
        currentOptimisticUserCount: 1,
        mergedUserImageCount: 1,
      }),
    }));
  });

  test('builds chat send lifecycle trace payloads', () => {
    expect(buildRendererChatSendLifecycleTracePayload({
      action: 'query-dispatched',
      turnId: ' turn-send ',
      includeQueryScreenshot: true,
      reason: ' overlay-chatbox ',
    })).toEqual({
      source: 'renderer-send',
      action: 'query-dispatched',
      turn_id: 'turn-send',
      include_query_screenshot: true,
      reason: 'overlay-chatbox',
    });
  });

  test('logs chat send lifecycle traces through chat-pill trace channel', () => {
    setSearch('?debug_chat_pill=1&view=minimal-chat-pill');

    logRendererChatSendLifecycleTrace({
      action: 'send-start',
      conversationRef: 'conv-send',
      turnId: 'turn-send',
      includeQueryScreenshot: false,
      reason: 'overlay-chatbox',
    });

    expect(consoleLog).toHaveBeenCalledWith('[ChatPillTrace][renderer]', expect.objectContaining({
      view: 'minimal-chat-pill',
      source: 'renderer-send',
      action: 'send-start',
      turn_id: 'turn-send',
      include_query_screenshot: false,
      reason: 'overlay-chatbox',
    }));
  });

  test('builds chat pill reset, lifecycle, and hit-test live trace payloads', () => {
    expect(buildRendererChatPillResetTracePayload({
      conversationRef: ' conv-reset ',
      previousTurnRef: ' turn-prev ',
      previousPhase: ' awaiting ',
      attachmentCount: '2',
      includeQueryScreenshot: true,
    })).toEqual({
      source: 'minimal-chat-pill',
      reason: 'user-send',
      conversationRef: 'conv-reset',
      previousTurnRef: 'turn-prev',
      previousPhase: 'awaiting',
      attachmentCount: 2,
      includeQueryScreenshot: true,
    });

    expect(buildRendererChatPillLifecycleTracePayload({
      action: 'mount',
      conversationRef: ' conv-life ',
      turnRef: ' turn-life ',
      phase: ' streaming ',
    })).toEqual({
      source: 'minimal-chat-pill',
      conversationRef: 'conv-life',
      turnRef: 'turn-life',
      phase: 'streaming',
    });

    expect(buildRendererChatPillHitTestTracePayload({
      active: false,
    })).toEqual({
      source: 'minimal-chat-pill-renderer',
      reason: 'renderer-normal-hit-test-request',
      active: false,
      ignoreMouseEvents: true,
    });
  });

  test('logs chat pill reset, lifecycle, and hit-test traces through live surface channel', () => {
    setSearch('?debug_live_surface=1&view=minimal-chat-pill');

    logRendererChatPillResetTrace({
      conversationRef: 'conv-reset',
      previousTurnRef: 'turn-prev',
      previousPhase: 'streaming',
      attachmentCount: 1,
      includeQueryScreenshot: false,
    });
    logRendererChatPillLifecycleTrace({
      action: 'unmount',
      conversationRef: 'conv-life',
      turnRef: 'turn-life',
      phase: 'complete',
    });
    logRendererChatPillHitTestTrace({
      conversationRef: 'conv-hit',
      active: true,
    });

    expect(mockSendLiveSurfaceTrace).toHaveBeenCalledWith(expect.objectContaining({
      event: 'turn_surface.reset',
      source: 'minimal-chat-pill',
      reason: 'user-send',
      conversationRef: 'conv-reset',
      previousTurnRef: 'turn-prev',
    }));
    expect(mockSendLiveSurfaceTrace).toHaveBeenCalledWith(expect.objectContaining({
      event: 'renderer.chat_pill.unmount',
      source: 'minimal-chat-pill',
      turnRef: 'turn-life',
      phase: 'complete',
    }));
    expect(mockSendLiveSurfaceTrace).toHaveBeenCalledWith(expect.objectContaining({
      event: 'chat_pill.hit_test.set',
      source: 'minimal-chat-pill-renderer',
      active: true,
      ignoreMouseEvents: false,
    }));
  });

  test('builds current-turn applied live trace payloads', () => {
    expect(buildRendererCurrentTurnAppliedTracePayload({
      source: ' sdk:current-turn ',
      conversationRef: ' conv-turn ',
      currentTurn: {
        turnRef: ' turn-1 ',
        phase: ' streaming ',
        assistantText: 'answer',
        reasoningText: 'step',
        toolEvents: [{ id: 'tool-1' }, { id: 'tool-2' }],
        presentation: {
          overlayIntent: {
            mode: ' response ',
            staleGuardRef: ' guard-1 ',
            turnRef: ' turn-intent ',
          },
          typingVisible: false,
          overlayVisible: true,
          hasVisibleContent: true,
          entries: [{ id: 'entry-1' }],
        },
      },
      skipDerivedSideEffects: true,
    })).toEqual({
      source: 'sdk:current-turn',
      turnRef: 'turn-1',
      conversationRef: 'conv-turn',
      phase: 'streaming',
      overlayMode: 'response',
      guardRef: 'guard-1',
      typingVisible: false,
      overlayVisible: true,
      hasVisibleContent: true,
      entryCount: 1,
      assistantLength: 6,
      reasoningLength: 4,
      toolEventCount: 2,
      staleSideEffectsSkipped: true,
    });
  });

  test('logs current-turn applied traces through live surface channel', () => {
    setSearch('?debug_live_surface=1&view=main');

    logRendererCurrentTurnAppliedTrace({
      conversationRef: 'conv-turn',
      currentTurn: {
        turnRef: 'turn-1',
        phase: 'awaiting',
        assistantText: '',
        reasoningText: '',
        toolEvents: [],
      },
      skipDerivedSideEffects: false,
    });

    expect(mockSendLiveSurfaceTrace).toHaveBeenCalledWith(expect.objectContaining({
      event: 'renderer.current_turn.applied',
      source: 'sdk:current-turn',
      conversationRef: 'conv-turn',
      turnRef: 'turn-1',
      phase: 'awaiting',
      staleSideEffectsSkipped: false,
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
      conversationRef: 'conv-size',
      visible: false,
      layoutMode: 'hidden',
      turnRef: 'turn-size',
      staleGuardRef: 'guard-size',
      width: 0,
      height: 0,
    });

    expect(consoleLog).toHaveBeenCalledWith('[StreamTrace][renderer][response-surface]', expect.objectContaining({
      view: 'response-overlay',
      source: 'renderer-response-window-sync',
      action: 'hide-requested',
      visible: false,
      layout_mode: 'hidden',
      turn_ref: 'turn-size',
      stale_guard_ref: 'guard-size',
      width: 0,
      height: 0,
    }));
    expect(mockSendLiveSurfaceTrace).toHaveBeenCalledWith(expect.objectContaining({
      event: 'response_overlay.renderer.size_report',
      reason: 'hide-requested',
      visible: false,
      layoutMode: 'hidden',
      turnRef: 'turn-size',
      guardRef: 'guard-size',
      width: 0,
      height: 0,
    }));
  });

  test('builds response overlay live size trace payloads', () => {
    expect(buildRendererResponseSurfaceSizeLiveTracePayload({
      source: ' custom-source ',
      action: ' show-or-resize-requested ',
      visible: true,
      layoutMode: ' awaiting-typing ',
      showResponse: false,
      thinkingText: 'abc',
      compactHover: true,
      turnRef: ' turn-1 ',
      staleGuardRef: ' guard-1 ',
      width: '12',
      height: '24',
    })).toEqual({
      source: 'custom-source',
      reason: 'show-or-resize-requested',
      visible: true,
      layoutMode: 'awaiting-typing',
      overlayMode: 'awaiting',
      showResponse: false,
      thinkingTextLength: 3,
      compactHover: true,
      turnRef: 'turn-1',
      guardRef: 'guard-1',
      width: 12,
      height: 24,
    });
  });

  test('logs response overlay lifecycle traces through the live surface channel', () => {
    setSearch('?debug_live_surface=1&view=minimal-response-overlay');

    logRendererResponseOverlayLifecycleTrace({
      action: 'unmount',
      conversationRef: ' conv-life ',
      turnRef: ' turn-life ',
      staleGuardRef: ' guard-life ',
    });

    expect(mockSendLiveSurfaceTrace).toHaveBeenCalledWith(expect.objectContaining({
      event: 'renderer.response_overlay.unmount',
      source: 'renderer-response-window-sync',
      turnRef: 'turn-life',
      guardRef: 'guard-life',
    }));
  });

  test('builds response overlay hit-test live trace payloads', () => {
    expect(buildRendererResponseOverlayHitTestTracePayload({
      source: ' custom-hit-test ',
      active: true,
    })).toEqual({
      source: 'custom-hit-test',
      reason: 'renderer-normal-hit-test-request',
      active: true,
      ignoreMouseEvents: false,
    });
  });

  test('builds response overlay rendered-typing live trace payloads', () => {
    expect(buildRendererResponseOverlayTypingRenderedTracePayload({
      typingRendered: false,
      currentTurnProjection: {
        turnRef: ' turn-projection ',
        conversationRef: ' conv-projection ',
        phase: ' streaming ',
      },
      currentTurnId: ' turn-fallback ',
      overlayIntent: {
        mode: ' response ',
        turnRef: ' turn-intent ',
        staleGuardRef: ' guard-intent ',
      },
      overlayLayoutMode: ' response ',
      isVisible: true,
      showAwaitingReply: false,
      showResponse: true,
      responseOverlayEntryCount: 2,
    })).toEqual({
      source: 'minimal-response-overlay',
      reason: 'awaiting-indicator-not-rendered',
      turnRef: 'turn-projection',
      conversationRef: 'conv-projection',
      phase: 'streaming',
      overlayMode: 'response',
      guardRef: 'guard-intent',
      isVisible: true,
      showAwaitingReply: false,
      showResponse: true,
      layoutMode: 'response',
      entryCount: 2,
      hasVisibleContent: true,
    });
  });

  test('builds response surface snapshot trace payloads', () => {
    expect(buildRendererResponseSurfaceSnapshotTracePayload({
      source: ' custom-snapshot ',
      phase: ' streaming ',
      isSending: true,
      messageCount: '3',
      activeResponseTextLength: '12',
      responseType: ' llm-text ',
      visibleResponseId: ' visible-1 ',
      responseOverlayEntryCount: '2',
      showAwaitingReply: false,
      showResponse: true,
      thinkingText: 'abcd',
    })).toEqual({
      source: 'custom-snapshot',
      overlayPhase: 'streaming',
      isSending: true,
      messageCount: 3,
      activeResponseTextLength: 12,
      activeResponseType: 'llm-text',
      visibleResponseId: 'visible-1',
      responseOverlayEntryCount: 2,
      showAwaitingReply: false,
      showResponse: true,
      thinkingTextLength: 4,
    });
  });

  test('logs response surface snapshot traces through the response-surface stream', () => {
    setSearch('?debug_stream=1&view=minimal-response-overlay');

    logRendererResponseSurfaceSnapshotTrace({
      phase: 'awaiting',
      messageCount: 1,
      activeResponseTextLength: 0,
      responseOverlayEntryCount: 0,
      thinkingTextLength: 0,
    });

    expect(consoleLog).toHaveBeenCalledWith(
      '[StreamTrace][renderer][response-surface]',
      expect.objectContaining({
        view: 'minimal-response-overlay',
        source: 'minimal-response-overlay',
        overlayPhase: 'awaiting',
        messageCount: 1,
        activeResponseTextLength: 0,
        responseOverlayEntryCount: 0,
        thinkingTextLength: 0,
      }),
    );
  });

  test('logs response overlay hit-test and rendered-typing traces through live surface channel', () => {
    setSearch('?debug_live_surface=1&view=minimal-response-overlay');

    logRendererResponseOverlayHitTestTrace({
      conversationRef: 'conv-hit',
      active: false,
    });
    logRendererResponseOverlayTypingRenderedTrace({
      typingRendered: true,
      currentTurnProjection: {
        turnRef: 'turn-rendered',
        conversationRef: 'conv-rendered',
        phase: 'awaiting',
      },
      overlayLayoutMode: 'awaiting-typing',
      isVisible: true,
      showAwaitingReply: true,
      showResponse: false,
      responseOverlayEntryCount: 0,
    });

    expect(mockSendLiveSurfaceTrace).toHaveBeenCalledWith(expect.objectContaining({
      event: 'response_overlay.hit_test.set',
      source: 'minimal-response-overlay-renderer',
      active: false,
      ignoreMouseEvents: true,
    }));
    expect(mockSendLiveSurfaceTrace).toHaveBeenCalledWith(expect.objectContaining({
      event: 'typing.rendered.show',
      source: 'minimal-response-overlay',
      reason: 'awaiting-indicator-rendered',
      turnRef: 'turn-rendered',
      conversationRef: 'conv-rendered',
    }));
  });

  test('builds response overlay view-model live trace payloads', () => {
    expect(buildRendererOverlayViewModelTracePayload({
      currentTurnProjection: {
        conversationRef: ' conv-projection ',
        turnRef: ' turn-projection ',
        phase: ' streaming ',
      },
      currentTurnPhase: 'awaiting-first-chunk',
      overlayIntent: {
        conversationRef: ' conv-intent ',
        turnRef: ' turn-intent ',
        staleGuardRef: ' guard-intent ',
        mode: ' response ',
      },
      currentTurnPresentationState: {
        showAssistantAwaitingDot: true,
        hasVisibleReply: true,
        isBusy: true,
        overlayTurnLifecycle: ' active ',
      },
      responseOverlayEntries: [{ id: 'entry-1' }, { id: 'entry-2' }],
      viewIntent: {
        showAwaitingReply: false,
        showResponse: true,
        visibleResponse: { id: ' visible-entry ' },
        latestResponseOverlayEntryId: ' latest-entry ',
      },
      useSdkLiveTurnPresentation: true,
      useLocalSendLatch: false,
    })).toEqual({
      source: 'renderer-overlay-view-model',
      turnRef: 'turn-projection',
      conversationRef: 'conv-projection',
      phase: 'streaming',
      overlayMode: 'response',
      guardRef: 'guard-intent',
      awaitingVisible: false,
      responseVisible: true,
      showAwaitingDot: true,
      hasVisibleReply: true,
      isBusy: true,
      overlayTurnLifecycle: 'active',
      entryCount: 2,
      visibleResponseId: 'visible-entry',
      latestEntryId: 'latest-entry',
      useSdkLiveTurnPresentation: true,
      useLocalSendLatch: false,
    });
  });

  test('resolves response overlay view-model trace event labels and reasons', () => {
    expect(buildRendererOverlayTypingTraceEvent({
      awaitingVisible: true,
      responseVisible: false,
      useSdkLiveTurnPresentation: true,
    })).toEqual({
      event: 'typing.show',
      mode: 'awaiting',
      reason: 'sdk-awaiting',
    });

    expect(buildRendererOverlayTypingTraceEvent({
      awaitingVisible: false,
      responseVisible: true,
    })).toEqual({
      event: 'typing.hide',
      mode: 'response',
      reason: 'response-visible',
    });

    expect(buildRendererOverlayIntentTraceEvent({
      awaitingVisible: false,
      responseVisible: false,
    })).toEqual({
      event: 'response_overlay.intent.hide',
      mode: 'hidden',
      reason: 'renderer-view-model-hidden',
    });
  });

  test('logs response overlay view-model traces with normalized conversation refs', () => {
    setSearch('?debug_live_surface=1&view=minimal-response-overlay');

    logRendererOverlayViewModelResolvedTrace({
      conversationRef: ' conv-1 ',
      awaitingVisible: true,
    });

    expect(consoleLog).toHaveBeenCalledWith('[LiveSurfaceTrace]', expect.objectContaining({
      event: 'renderer.overlay_view_model.resolved',
      view: 'minimal-response-overlay',
      conversationRef: ' conv-1 ',
      awaitingVisible: true,
    }));
    expect(mockSendLiveSurfaceTrace).toHaveBeenCalledWith(expect.objectContaining({
      event: 'renderer.overlay_view_model.resolved',
    }));

    logRendererOverlayViewModelTrace('typing.show', {
      conversationRef: 'conv-2',
      awaitingVisible: true,
    }, {
      reason: 'custom-reason',
    });

    expect(mockSendLiveSurfaceTrace).toHaveBeenCalledWith(expect.objectContaining({
      event: 'typing.show',
      conversationRef: 'conv-2',
      awaitingVisible: true,
      reason: 'custom-reason',
    }));
  });
});
