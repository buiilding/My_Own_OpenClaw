/**
 * Covers renderer trace runtime behavior in the frontend test suite.
 */

const mockSendLiveSurfaceTrace = jest.fn();

jest.mock('../../src/renderer/app/runtime/desktopLiveSurfaceTraceRuntimeClient', () => ({
  DesktopLiveSurfaceTraceRuntimeClient: {
    send: (...args: unknown[]) => mockSendLiveSurfaceTrace(...args),
  },
}));

import { DesktopRendererTraceRuntime } from '../../src/renderer/app/runtime/desktopRendererTraceRuntime';

const {
  buildRendererChatSendLifecycleTracePayload,
  buildRendererChatPillHitTestTracePayload,
  buildRendererChatPillLifecycleTracePayload,
  buildRendererChatPillResetTracePayload,
  buildRendererCurrentTurnAppliedTracePayload,
  buildRendererReplayTracePayload,
  buildRendererOverlayIntentTraceEvent,
  buildRendererOverlayTypingTraceEvent,
  buildRendererOverlayViewModelTraceSignature,
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
  logRendererReplayTrace,
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
    const chatPillTrace = consoleLog.mock.calls.find(
      ([channel]) => channel === '[ChatPillTrace][renderer]',
    )?.[1];
    expect(chatPillTrace).not.toHaveProperty('isSending');
    expect(chatPillTrace).not.toHaveProperty('thinkingStatus');
    expect(chatPillTrace).not.toHaveProperty('phase');
    expect(consoleLog).not.toHaveBeenCalledWith('[LiveSurfaceTrace]', expect.anything());
    expect(mockSendLiveSurfaceTrace).toHaveBeenCalledWith(expect.objectContaining({
      event: 'typing.show',
      view: 'minimal-chat-pill',
      activeConversationRef: 'conv-1',
      workspaceMessageCount: 2,
      extra: true,
    }));
    expect(mockSendLiveSurfaceTrace.mock.calls[0]?.[0]).not.toHaveProperty('isSending');
    expect(mockSendLiveSurfaceTrace.mock.calls[0]?.[0]).not.toHaveProperty('thinkingStatus');
    expect(mockSendLiveSurfaceTrace.mock.calls[0]?.[0]).not.toHaveProperty('phase');
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

  test('builds and emits sanitized replay timeline traces', () => {
    setSearch('?debug_live_surface=1&view=main');

    expect(buildRendererReplayTracePayload({
      action: 'pending_published',
      conversationRef: ' conv-replay ',
      oldTurnRef: ' turn-old ',
      newTurnRef: ' turn-new ',
      pendingTurnRef: ' turn-new ',
      currentTurnRef: ' turn-old ',
      currentTurnPhase: ' streaming ',
      streamActiveTurnRef: ' turn-old ',
      streamPhase: ' awaiting-first-chunk ',
      targetUserMessageId: ' user-row-1 ',
      projectedRowCount: '2',
      sourceRowCount: '4',
      messageCount: '2',
      pendingMatchesNewTurn: true,
      currentMatchesOldTurn: true,
    })).toEqual({
      source: 'renderer-replay',
      action: 'pending_published',
      conversationRef: 'conv-replay',
      oldTurnRef: 'turn-old',
      newTurnRef: 'turn-new',
      pendingTurnRef: 'turn-new',
      currentTurnRef: 'turn-old',
      currentTurnPhase: 'streaming',
      latestCurrentTurnRef: null,
      latestCurrentTurnPhase: null,
      streamActiveTurnRef: 'turn-old',
      streamPhase: 'awaiting-first-chunk',
      targetUserMessageId: 'user-row-1',
      projectedRowCount: 2,
      sourceRowCount: 4,
      messageCount: 2,
      displayRowCount: 0,
      pendingMatchesNewTurn: true,
      currentMatchesNewTurn: false,
      currentMatchesOldTurn: true,
      pendingPresent: false,
      stopAttempted: false,
      stopSucceeded: false,
      sendSucceeded: false,
      errorKind: null,
    });

    logRendererReplayTrace({
      action: 'send_new_sent',
      conversationRef: 'conv-replay',
      newTurnRef: 'turn-new',
      pendingTurnRef: 'turn-new',
      pendingMatchesNewTurn: true,
      pendingPresent: true,
    });

    expect(mockSendLiveSurfaceTrace).toHaveBeenCalledWith(expect.objectContaining({
      event: 'renderer.replay.timeline',
      source: 'renderer-replay',
      action: 'send_new_sent',
      conversationRef: 'conv-replay',
      newTurnRef: 'turn-new',
      pendingTurnRef: 'turn-new',
      pendingMatchesNewTurn: true,
      pendingPresent: true,
    }));
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
        presentation: {
          overlayIntent: {
            mode: ' response ',
            staleGuardRef: ' guard-1 ',
            turnRef: ' turn-intent ',
          },
          hasVisibleContent: true,
          entries: [
            { id: 'entry-1', type: 'llm-text', text: 'answer' },
            { id: 'entry-2', type: 'thinking', text: 'step' },
            { id: 'tool-1', type: 'tool-call', text: 'Using tool' },
            { id: 'tool-2', type: 'tool-output', text: 'Tool done' },
          ],
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
      hasVisibleContent: true,
      entryCount: 4,
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
        presentation: {
          entries: [],
        },
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
      responseVisible: true,
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
      response_visible: true,
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
      responseVisible: false,
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
      responseVisible: false,
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
      phase: ' streaming ',
      currentTurnId: ' turn-fallback ',
      overlayIntent: {
        mode: ' response ',
        conversationRef: ' conv-projected ',
        turnRef: ' turn-intent ',
        staleGuardRef: ' guard-intent ',
      },
      overlayLayoutMode: ' response ',
      isVisible: true,
      awaitingVisible: false,
      responseVisible: true,
      responseOverlayEntryCount: 2,
    })).toEqual({
      source: 'minimal-response-overlay',
      reason: 'awaiting-indicator-not-rendered',
      turnRef: 'turn-fallback',
      conversationRef: 'conv-projected',
      phase: 'streaming',
      overlayMode: 'response',
      guardRef: 'guard-intent',
      isVisible: true,
      awaitingVisible: false,
      responseVisible: true,
      layoutMode: 'response',
      entryCount: 2,
      hasVisibleContent: true,
    });

    expect(buildRendererResponseOverlayTypingRenderedTracePayload({
      typingRendered: true,
      conversationRef: ' conv-explicit ',
      turnRef: ' turn-explicit ',
      phase: ' awaiting ',
      overlayLayoutMode: 'awaiting-typing',
    })).toMatchObject({
      turnRef: 'turn-explicit',
      conversationRef: 'conv-explicit',
      phase: 'awaiting',
      layoutMode: 'awaiting-typing',
    });
  });

  test('ignores stale raw current-turn projection in rendered-typing traces', () => {
    expect(buildRendererResponseOverlayTypingRenderedTracePayload({
      typingRendered: true,
      sdkLiveTurn: {
        turnRef: ' turn-stale ',
        conversationRef: ' conv-stale ',
        phase: ' streaming ',
      },
      currentTurnId: ' turn-rendered ',
      phase: ' awaiting ',
      overlayLayoutMode: 'awaiting-typing',
      isVisible: true,
      awaitingVisible: true,
      responseVisible: false,
    } as never)).toEqual(expect.objectContaining({
      turnRef: 'turn-rendered',
      conversationRef: null,
      phase: 'awaiting',
      guardRef: 'turn-rendered',
    }));
  });

  test('builds response surface snapshot trace payloads', () => {
    expect(buildRendererResponseSurfaceSnapshotTracePayload({
      source: ' custom-snapshot ',
      phase: ' streaming ',
      messageCount: '3',
      activeResponseTextLength: '12',
      responseType: ' llm-text ',
      visibleResponseId: ' visible-1 ',
      responseOverlayEntryCount: '2',
      awaitingVisible: false,
      responseVisible: true,
      thinkingText: 'abcd',
    })).toEqual({
      source: 'custom-snapshot',
      overlayPhase: 'streaming',
      messageCount: 3,
      activeResponseTextLength: 12,
      activeResponseType: 'llm-text',
      visibleResponseId: 'visible-1',
      responseOverlayEntryCount: 2,
      awaitingVisible: false,
      responseVisible: true,
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
      overlayIntent: {
        conversationRef: 'conv-hit',
      },
      active: false,
    });
    logRendererResponseOverlayTypingRenderedTrace({
      typingRendered: true,
      currentTurnId: 'turn-rendered',
      overlayIntent: {
        conversationRef: 'conv-rendered',
      },
      phase: 'awaiting',
      overlayLayoutMode: 'awaiting-typing',
      isVisible: true,
      awaitingVisible: true,
      responseVisible: false,
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
    const tracePayload = buildRendererOverlayViewModelTracePayload({
      pendingTurn: {
        conversationRef: ' conv-pending ',
        turnRef: ' turn-pending ',
        userMessageId: ' user-pending ',
      },
      visibleTurnLifecycle: {
        status: ' awaiting ',
        source: ' sdk ',
        conversationRef: ' conv-lifecycle ',
        turnRef: ' turn-lifecycle ',
        showTyping: true,
        isBusy: true,
        terminalReason: null,
        awaitingAnchor: {
          rowId: ' user-row-1 ',
        },
      },
      currentTurnPhase: 'awaiting-first-chunk',
      overlayIntent: {
        conversationRef: ' conv-intent ',
        turnRef: ' turn-intent ',
        staleGuardRef: ' guard-intent ',
        mode: ' response ',
      },
      currentTurnPresentationState: {
        awaitingDotTargetMessageId: ' user-row-1 ',
        hasVisibleReply: true,
        isBusy: true,
      },
      responseOverlayEntries: [{ id: 'entry-1' }, { id: 'entry-2' }],
      viewIntent: {
        awaitingVisible: false,
        responseVisible: true,
        visibleResponse: { id: ' visible-entry ' },
        latestResponseOverlayEntryId: ' latest-entry ',
      },
      useSdkLiveTurnPresentation: true,
      useLocalPendingTurn: false,
    });

    expect(tracePayload).toEqual({
      source: 'renderer-overlay-view-model',
      turnRef: 'turn-lifecycle',
      conversationRef: 'conv-lifecycle',
      phase: 'awaiting-first-chunk',
      pendingTurnRef: 'turn-pending',
      pendingUserMessageId: 'user-pending',
      visibleLifecycleStatus: 'awaiting',
      visibleLifecycleSource: 'sdk',
      visibleLifecycleTurnRef: 'turn-lifecycle',
      visibleLifecycleShowTyping: true,
      visibleLifecycleBusy: true,
      visibleLifecycleTerminalReason: null,
      visibleLifecycleAwaitingRowId: 'user-row-1',
      overlayMode: 'response',
      guardRef: 'guard-intent',
      awaitingVisible: false,
      responseVisible: true,
      showAwaitingDot: false,
      hasVisibleReply: true,
      isBusy: true,
      entryCount: 2,
      visibleResponseId: 'visible-entry',
      latestEntryId: 'latest-entry',
      useSdkLiveTurnPresentation: true,
      useLocalPendingTurn: false,
    });
    expect(buildRendererOverlayViewModelTraceSignature(tracePayload)).toBe(JSON.stringify(tracePayload));
  });

  test('ignores stale raw current-turn projection in overlay view-model traces', () => {
    expect(buildRendererOverlayViewModelTracePayload({
      sdkLiveTurn: {
        conversationRef: ' conv-stale ',
        turnRef: ' turn-stale ',
        phase: ' streaming ',
      },
      pendingTurn: {
        conversationRef: ' conv-pending ',
        turnRef: ' turn-pending ',
        userMessageId: ' user-pending ',
      },
      currentTurnPhase: 'awaiting',
      responseOverlayEntries: [],
      viewIntent: {
        awaitingVisible: true,
        responseVisible: false,
        visibleResponse: null,
        latestResponseOverlayEntryId: null,
      },
      useSdkLiveTurnPresentation: false,
      useLocalPendingTurn: true,
    } as never)).toEqual(expect.objectContaining({
      turnRef: 'turn-pending',
      conversationRef: 'conv-pending',
      guardRef: 'turn-pending',
      pendingTurnRef: 'turn-pending',
      phase: 'awaiting',
      useLocalPendingTurn: true,
    }));
  });

  test('does not fall back to raw current-turn projection identity in overlay view-model traces', () => {
    expect(buildRendererOverlayViewModelTracePayload({
      sdkLiveTurn: {
        conversationRef: ' conv-stale ',
        turnRef: ' turn-stale ',
        phase: ' streaming ',
      },
      responseOverlayEntries: [],
      viewIntent: {
        awaitingVisible: false,
        responseVisible: false,
        visibleResponse: null,
        latestResponseOverlayEntryId: null,
      },
      useSdkLiveTurnPresentation: false,
      useLocalPendingTurn: false,
    } as never)).toEqual(expect.objectContaining({
      turnRef: null,
      conversationRef: null,
      phase: null,
      guardRef: null,
    }));
  });

  test('resolves response overlay view-model trace event labels and reasons', () => {
    expect(buildRendererOverlayTypingTraceEvent({
      awaitingVisible: true,
      responseVisible: false,
      useLocalPendingTurn: false,
    })).toEqual({
      event: 'typing.show',
      mode: 'awaiting',
      reason: 'sdk-awaiting',
    });

    expect(buildRendererOverlayTypingTraceEvent({
      awaitingVisible: true,
      responseVisible: false,
      useSdkLiveTurnPresentation: false,
      useLocalPendingTurn: true,
    })).toEqual({
      event: 'typing.show',
      mode: 'awaiting',
      reason: 'local-pending-awaiting',
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

    expect(consoleLog).not.toHaveBeenCalledWith('[LiveSurfaceTrace]', expect.anything());
    expect(mockSendLiveSurfaceTrace).toHaveBeenCalledWith(expect.objectContaining({
      event: 'renderer.overlay_view_model.resolved',
      view: 'minimal-response-overlay',
      conversationRef: ' conv-1 ',
      awaitingVisible: true,
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
