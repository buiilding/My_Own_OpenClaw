/**
 * Covers response overlay view contract. behavior in the frontend test suite.
 */

import { DesktopResponseOverlayViewRuntime } from '../../src/renderer/app/runtime/desktopResponseOverlayViewRuntime';

describe('desktopResponseOverlayViewRuntime', () => {
  const {
    buildDismissResponseOverlayEntryStateUpdate,
    buildDismissResponseOverlayAction,
    buildResponseOverlayEntrySignature,
    buildResponseOverlayDismissalKey,
    buildResponseOverlayTraceSummary,
    buildResponseOverlayWindowLifecycleTraceValues,
    buildResponseOverlayWindowSizeTraceValues,
    buildResponseOverlayWindowSizeValues,
    createResponseOverlayWindowGuardSnapshot,
    isResponseOverlayEntryDismissedInState,
    resolveDismissedResponseOverlayEntryId,
    resolveLatestSourceTaggedResponseOverlayEntry,
    resolveResponseOverlayCloseable,
    resolveResponseOverlayEntries,
    resolveResponseOverlayPresentationState,
    resolveResponseOverlayPresentationStateForSurfaceState,
    resolveResponseOverlaySurfaceState,
    resolveResponseOverlayViewContract,
    resolveResponseOverlayWindowGuardSnapshot,
    resolveResponseOverlayWindowSizeIdentity,
  } = DesktopResponseOverlayViewRuntime;

  test('builds normalized response overlay dismissal keys', () => {
    expect(buildResponseOverlayDismissalKey({
      conversationRef: ' conv-overlay ',
      turnRef: ' turn-overlay ',
      responseEntryId: ' assistant-entry ',
    })).toBe('conv-overlay\u0001turn-overlay\u0001assistant-entry');

    expect(buildResponseOverlayDismissalKey({
      responseEntryId: ' assistant-entry ',
    })).toBe('\u0001\u0001assistant-entry');

    expect(buildResponseOverlayDismissalKey({
      conversationRef: 'conv-overlay',
      turnRef: 'turn-overlay',
      responseEntryId: '   ',
    })).toBeNull();
  });

  test('owns response overlay dismissal state updates and reads', () => {
    const dismissalTarget = {
      conversationRef: ' conv-overlay ',
      turnRef: ' turn-overlay ',
      responseEntryId: ' assistant-entry ',
    };
    const initialState = {
      dismissedResponseOverlayEntries: {
        existing: true as const,
      },
    };

    const update = buildDismissResponseOverlayEntryStateUpdate(
      initialState,
      dismissalTarget,
    );

    expect(update).toEqual({
      dismissedResponseOverlayEntries: {
        existing: true,
        ['conv-overlay\u0001turn-overlay\u0001assistant-entry']: true,
      },
    });
    expect(isResponseOverlayEntryDismissedInState(
      update || {},
      dismissalTarget,
    )).toBe(true);
    expect(buildDismissResponseOverlayEntryStateUpdate(
      update || {},
      dismissalTarget,
    )).toBeNull();
    expect(buildDismissResponseOverlayEntryStateUpdate(
      initialState,
      {
        ...dismissalTarget,
        responseEntryId: '   ',
      },
    )).toBeNull();
    expect(isResponseOverlayEntryDismissedInState(
      initialState,
      dismissalTarget,
    )).toBe(false);
    expect(resolveDismissedResponseOverlayEntryId(
      update || {},
      dismissalTarget,
    )).toBe('assistant-entry');
    expect(resolveDismissedResponseOverlayEntryId(
      update || {},
      {
        ...dismissalTarget,
        responseEntryId: 'missing-entry',
      },
    )).toBeNull();
    expect(resolveDismissedResponseOverlayEntryId(
      update || {},
      null,
    )).toBeNull();
  });

  test('builds close actions for response overlay dismissal and responsebox hide', () => {
    expect(buildDismissResponseOverlayAction({
      responseOverlayDismissalTarget: {
        conversationRef: ' conv-overlay ',
        turnRef: ' turn-overlay ',
        guardRef: ' guard-overlay ',
      },
      responseEntryId: ' entry-overlay ',
    })).toEqual({
      dismissalTarget: {
        conversationRef: ' conv-overlay ',
        turnRef: ' turn-overlay ',
        guardRef: ' guard-overlay ',
        responseEntryId: 'entry-overlay',
      },
      responseboxDismissalValues: {
        turnRef: 'turn-overlay',
        guardRef: 'guard-overlay',
      },
    });

    expect(buildDismissResponseOverlayAction({
      responseOverlayDismissalTarget: {
        conversationRef: 'conv-overlay',
        turnRef: 'turn-overlay',
      },
      responseEntryId: '   ',
    })).toBeNull();
  });

  test('builds response overlay trace summaries from view model state', () => {
    const traceSummary = buildResponseOverlayTraceSummary({
      awaitingVisible: false,
      currentTurnPhase: ' streaming ',
      isVisible: true,
      latestResponseOverlayEntryId: ' assistant-entry ',
      latestSourceTaggedResponseEntry: {
        id: 'assistant-entry',
        type: 'llm-text',
        text: 'final answer',
      },
      messageCount: 3,
      overlayLayoutMode: ' response ',
      responseOverlayEntries: [
        { id: 'thinking', type: 'thinking', text: 'think' },
        { id: 'assistant-entry', type: 'llm-text', text: 'final answer' },
      ],
      responseVisible: true,
      thinkingText: 'think',
      turnId: ' turn-overlay ',
    });

    expect(traceSummary.signature).toBe(JSON.stringify({
      isVisible: true,
      awaitingVisible: false,
      responseVisible: true,
      overlayLayoutMode: 'response',
      phase: 'streaming',
      turnId: 'turn-overlay',
      visibleResponseId: 'assistant-entry',
      activeResponseTextLength: 'final answer'.length,
    }));
    expect(traceSummary.stateTrace).toEqual({
      turnRef: 'turn-overlay',
      phase: 'streaming',
      isVisible: true,
      awaitingVisible: false,
      responseVisible: true,
      responseLayoutMode: 'response',
      visibleResponseId: 'assistant-entry',
      responseEntryCount: 2,
      activeResponseTextLength: 'final answer'.length,
      thinkingText: 'think',
      messageCount: 3,
    });
    expect(traceSummary.snapshotTrace).toEqual({
      phase: 'streaming',
      messageCount: 3,
      activeResponseTextLength: 'final answer'.length,
      responseType: 'llm-text',
      visibleResponseId: 'assistant-entry',
      responseOverlayEntryCount: 2,
      awaitingVisible: false,
      responseVisible: true,
      thinkingTextLength: 'think'.length,
    });
    expect(traceSummary.renderTrace).toEqual({
      turnRef: 'turn-overlay',
      phase: 'streaming',
      responseLayoutMode: 'response',
      responseVisible: true,
      awaitingVisible: false,
    });
  });

  test('owns response overlay entry selection, signature, and closeability', () => {
    const responseOverlayEntries = [
      {
        id: 'progress-entry',
        sender: 'assistant',
        type: 'tool-explanation',
        text: 'Searching',
      },
      {
        id: 'assistant-entry',
        sender: 'assistant',
        type: 'llm-text',
        text: 'Final answer',
        isComplete: true,
      },
      {
        id: 'tool-source',
        sender: 'assistant',
        sourceEventType: 'tool-output',
        text: 'Tool source',
      },
    ];

    expect(resolveLatestSourceTaggedResponseOverlayEntry({
      responseOverlayEntries,
    })).toBe(responseOverlayEntries[2]);
    expect(buildResponseOverlayEntrySignature({
      responseOverlayEntries,
    })).toBe('progress-entry:Searching\u0001assistant-entry:Final answer\u0001tool-source:Tool source');
    expect(resolveResponseOverlayCloseable({
      responseOverlayEntries,
      latestSourceTaggedResponseEntry: responseOverlayEntries[1],
      responseVisible: true,
      isBusy: false,
    })).toBe(true);
    expect(resolveResponseOverlayCloseable({
      responseOverlayEntries,
      latestSourceTaggedResponseEntry: responseOverlayEntries[1],
      responseVisible: true,
      isBusy: true,
    })).toBe(false);
    expect(resolveResponseOverlayCloseable({
      responseOverlayEntries,
      latestSourceTaggedResponseEntry: responseOverlayEntries[1],
      responseVisible: false,
      isBusy: false,
    })).toBe(false);
    expect(resolveResponseOverlayCloseable({
      responseOverlayEntries: [{
        id: 'progress-entry',
        sender: 'assistant',
        type: 'tool-explanation',
        text: 'Still working',
      }],
      latestSourceTaggedResponseEntry: null,
      responseVisible: true,
      isBusy: false,
    })).toBe(true);
  });

  test('keeps response overlay window guard identity in app runtime', () => {
    const initialSnapshot = createResponseOverlayWindowGuardSnapshot();
    expect(initialSnapshot).toEqual({
      conversationRef: null,
      turnRef: null,
      staleGuardRef: null,
    });

    const activeSnapshot = resolveResponseOverlayWindowGuardSnapshot({
      overlayIntent: {
        conversationRef: ' conv-active ',
        turnRef: ' turn-active ',
      },
      previousSnapshot: initialSnapshot,
    });
    expect(activeSnapshot).toEqual({
      conversationRef: 'conv-active',
      turnRef: 'turn-active',
      staleGuardRef: 'turn-active',
    });

    expect(resolveResponseOverlayWindowGuardSnapshot({
      overlayIntent: null,
      previousSnapshot: activeSnapshot,
    })).toEqual({
      conversationRef: null,
      turnRef: 'turn-active',
      staleGuardRef: 'turn-active',
    });

    expect(resolveResponseOverlayWindowGuardSnapshot({
      overlayIntent: {
        conversationRef: ' conv-guard ',
        staleGuardRef: ' guard-only ',
      },
      previousSnapshot: activeSnapshot,
    })).toEqual({
      conversationRef: 'conv-guard',
      turnRef: null,
      staleGuardRef: 'guard-only',
    });
  });

  test('resolves response overlay native size identity from SDK intent before guard fallback', () => {
    expect(resolveResponseOverlayWindowSizeIdentity({
      overlayIntent: {
        conversationRef: ' conv-current ',
        turnRef: ' turn-current ',
        staleGuardRef: ' guard-current ',
      },
      guardSnapshot: {
        turnRef: 'turn-previous',
        staleGuardRef: 'guard-previous',
      },
    })).toEqual({
      conversationRef: 'conv-current',
      turnRef: 'turn-current',
      staleGuardRef: 'guard-current',
    });

    expect(resolveResponseOverlayWindowSizeIdentity({
      overlayIntent: null,
      guardSnapshot: {
        conversationRef: 'conv-previous',
        turnRef: 'turn-previous',
        staleGuardRef: 'guard-previous',
      },
    })).toEqual({
      conversationRef: null,
      turnRef: 'turn-previous',
      staleGuardRef: 'guard-previous',
    });

    expect(resolveResponseOverlayWindowSizeIdentity({
      overlayIntent: {
        conversationRef: ' conv-current ',
        turnRef: ' turn-current ',
      },
      guardSnapshot: {
        turnRef: 'turn-previous',
        staleGuardRef: 'guard-previous',
      },
    })).toEqual({
      conversationRef: 'conv-current',
      turnRef: 'turn-current',
      staleGuardRef: 'turn-current',
    });
  });

  test('builds response overlay window trace and IPC values from runtime identity', () => {
    const sizeIdentity = resolveResponseOverlayWindowSizeIdentity({
      overlayIntent: {
        conversationRef: ' conv-current ',
        turnRef: ' turn-current ',
        staleGuardRef: ' guard-current ',
      },
    });

    expect(buildResponseOverlayWindowSizeTraceValues({
      action: 'show-or-resize-requested',
      visible: true,
      layoutMode: 'compact-hover',
      responseVisible: true,
      thinkingText: 'Thinking',
      compactHover: true,
      sizeIdentity,
      width: 320,
      height: 48,
    })).toEqual({
      action: 'show-or-resize-requested',
      conversationRef: 'conv-current',
      visible: true,
      layoutMode: 'compact-hover',
      responseVisible: true,
      thinkingText: 'Thinking',
      compactHover: true,
      turnRef: 'turn-current',
      staleGuardRef: 'guard-current',
      width: 320,
      height: 48,
    });

    expect(buildResponseOverlayWindowSizeValues({
      visible: true,
      compactHover: true,
      sizeIdentity,
      width: 320,
      height: 48,
    })).toEqual({
      visible: true,
      width: 320,
      height: 48,
      compactHover: true,
      turnRef: 'turn-current',
      staleGuardRef: 'guard-current',
    });

    expect(buildResponseOverlayWindowSizeValues({
      visible: false,
      compactHover: true,
      sizeIdentity,
      width: 0,
      height: 0,
    })).toEqual({
      visible: false,
      width: 0,
      height: 0,
      turnRef: 'turn-current',
      staleGuardRef: 'guard-current',
    });
  });

  test('builds response overlay window lifecycle trace values from runtime guard snapshots', () => {
    expect(buildResponseOverlayWindowLifecycleTraceValues({
      action: 'mount',
      guardSnapshot: {
        conversationRef: ' conv-current ',
        turnRef: ' turn-current ',
        staleGuardRef: ' guard-current ',
      },
    })).toEqual({
      action: 'mount',
      conversationRef: 'conv-current',
      turnRef: 'turn-current',
      staleGuardRef: 'guard-current',
    });
  });

  test('selects conversation view live-turn entries before raw projection rows', () => {
    expect(resolveResponseOverlayEntries({
      conversationView: {
        conversationRef: 'conv-view',
        liveTurn: {
          turnRef: 'turn-view',
          entries: [{
            id: 'entry-view',
            kind: 'assistant_text',
            text: 'from view',
          }],
        },
      },
      sdkLiveTurn: {
        conversationRef: 'conv-raw',
        turnRef: 'turn-raw',
        assistantText: 'from raw projection',
      },
      liveTurnPresentationInput: {
        source: 'conversation-view',
      },
    })).toEqual([
      expect.objectContaining({
        id: 'entry-view',
        text: 'from view',
      }),
    ]);
  });

  test('keeps materialized current-turn tool rows visible in the response overlay', () => {
    const entries = resolveResponseOverlayEntries({
      conversationView: {
        conversationRef: 'conv-view',
        displayRows: [
          {
            id: 'row-user',
            conversationRef: 'conv-view',
            turnRef: 'turn-view',
            index: 0,
            role: 'user',
            type: 'user_message',
            content: '@script tool screenshot',
          },
          {
            id: 'row-tool-call',
            conversationRef: 'conv-view',
            turnRef: 'turn-view',
            index: 1,
            role: 'assistant',
            type: 'tool_call',
            content: {
              id: 'scripted_call_1',
              name: 'screenshot',
              arguments: {
                explanation: 'Validate the scripted model tool path.',
              },
            },
          },
          {
            id: 'row-tool-output',
            conversationRef: 'conv-view',
            turnRef: 'turn-view',
            index: 2,
            role: 'tool',
            type: 'tool_output',
            content: 'Screenshot captured successfully.',
            metadata: {
              toolName: 'screenshot',
            },
          },
          {
            id: 'row-assistant-final',
            conversationRef: 'conv-view',
            turnRef: 'turn-view',
            index: 3,
            role: 'assistant',
            type: 'assistant_message',
            content: 'Scripted runtime completed 1 tool call(s): screenshot.',
          },
        ],
        liveTurn: {
          turnRef: 'turn-view',
          phase: 'complete',
          isBusy: false,
          entries: [{
            id: 'live-assistant-final',
            type: 'llm-text',
            text: 'Scripted runtime completed 1 tool call(s): screenshot.',
            sourceEventType: 'assistant_delta',
            turnRef: 'turn-view',
          }],
        },
      },
      liveTurnPresentationInput: {
        source: 'conversation-view',
      },
    });

    expect(entries).toEqual([
      expect.objectContaining({
        id: 'row-tool-call',
        type: 'tool-call',
        sourceEventType: 'tool_call',
      }),
      expect.objectContaining({
        id: 'row-tool-output',
        type: 'tool-output',
        sourceEventType: 'tool_output',
      }),
      expect.objectContaining({
        id: 'row-assistant-final',
        type: 'llm-text',
        text: 'Scripted runtime completed 1 tool call(s): screenshot.',
        sourceEventType: 'assistant_message',
      }),
    ]);
    expect(entries).toHaveLength(3);
  });

  test('does not require a source flag before ConversationView blocks raw overlay rows', () => {
    expect(resolveResponseOverlayEntries({
      conversationView: {
        conversationRef: 'conv-view',
        liveTurn: {
          turnRef: 'turn-view',
          entries: [],
        },
      },
      sdkLiveTurn: {
        conversationRef: 'conv-raw',
        turnRef: 'turn-raw',
        assistantText: 'stale raw projection',
      },
      liveTurnPresentationInput: {},
    })).toEqual([]);
  });

  test('does not treat action-only metadata as ConversationView overlay authority', () => {
    expect(resolveResponseOverlayEntries({
      conversationView: {
        actions: {
          canEdit: true,
          canRetry: true,
        },
      },
      sdkLiveTurn: {
        conversationRef: 'conv-raw',
        turnRef: 'turn-raw',
        phase: 'streaming',
        assistantText: 'raw fallback remains visible',
      },
      liveTurnPresentationInput: {},
    })).toEqual([
      expect.objectContaining({
        text: 'raw fallback remains visible',
      }),
    ]);
  });

  test('falls back to raw current-turn projection only when sdk presentation is absent', () => {
    expect(resolveResponseOverlayEntries({
      sdkLiveTurn: {
        conversationRef: 'conv-sdk',
        turnRef: 'turn-sdk',
        phase: 'streaming',
        assistantText: 'visible raw fallback',
      },
      liveTurnPresentationInput: {
        useSdkLiveTurnPresentation: false,
      },
    })).toEqual([
      expect.objectContaining({
        text: 'visible raw fallback',
      }),
    ]);

    expect(resolveResponseOverlayEntries({
      sdkLiveTurn: {
        conversationRef: 'conv-sdk',
        turnRef: 'turn-sdk',
        phase: 'streaming',
        assistantText: 'hidden raw fallback',
        presentation: {
          entries: [],
        },
      },
      liveTurnPresentationInput: {
        useSdkLiveTurnPresentation: true,
      },
    })).toEqual([]);
  });

  test('suppresses response entries during local pending bridge display', () => {
    expect(resolveResponseOverlayEntries({
      conversationView: {
        conversationRef: 'conv-view',
        liveTurn: {
          turnRef: 'turn-view',
          entries: [{
            id: 'entry-view',
            kind: 'assistant_text',
            text: 'from view',
          }],
        },
      },
      liveTurnPresentationInput: {
        source: 'conversation-view',
        useLocalPendingTurn: true,
      },
    })).toEqual([]);
  });

  test('projects response overlay surface state from ConversationView without raw fallback', () => {
    const state = resolveResponseOverlaySurfaceState({
      chatSurfaceState: {
        messages: [{
          id: 'stale-raw-message',
          sender: 'assistant',
          text: 'stale renderer answer',
        }],
        conversationView: {
          conversationRef: 'conv-view',
          liveTurn: {
            turnRef: 'turn-view',
            phase: 'streaming',
            isBusy: true,
            entries: [{
              id: 'entry-view',
              kind: 'assistant_text',
              text: 'from view',
            }],
          },
          surfaces: {
            responseOverlay: {
              mode: 'response',
              visible: true,
              turnRef: 'turn-view',
              conversationRef: 'conv-view',
            },
          },
        },
        sdkLiveTurn: null,
      },
    });

    expect(state.responseOverlayEntries).toEqual([
      expect.objectContaining({
        id: 'entry-view',
        text: 'from view',
      }),
    ]);
    expect(state).not.toHaveProperty('traceState');
    expect(state).not.toHaveProperty('projectionInput');
    expect(state.pendingTurn).toBeNull();
    expect(state.sdkLiveTurn).toBeNull();
    expect(state).not.toHaveProperty('currentTurnProjection');
    expect(state.responseOverlayDismissalTarget).toEqual(expect.objectContaining({
      conversationRef: 'conv-view',
      turnRef: 'turn-view',
      guardRef: 'turn-view',
      responseEntryId: 'entry-view',
    }));
    expect(state.thinkingText).toBe('');
    expect(state.useLocalPendingTurn).toBe(false);
  });

  test('projects response overlay thinking text from SDK presentation entries', () => {
    const state = resolveResponseOverlaySurfaceState({
      chatSurfaceState: {
        sdkLiveTurn: {
          conversationRef: 'conv-sdk',
          turnRef: 'turn-sdk',
          phase: 'streaming',
          reasoningText: 'raw reasoning fallback',
          presentation: {
            entries: [{
              id: 'thinking-sdk',
              type: 'thinking',
              text: 'presentation thinking',
              turnRef: 'turn-sdk',
            }],
            lastError: null,
          },
        },
      },
    });

    expect(state.thinkingText).toBe('presentation thinking');
    expect(state.responseOverlayEntries).toEqual([
      expect.objectContaining({
        id: 'thinking-sdk',
        thinkingText: 'presentation thinking',
      }),
    ]);

    const hiddenPresentationState = resolveResponseOverlaySurfaceState({
      chatSurfaceState: {
        sdkLiveTurn: {
          conversationRef: 'conv-sdk',
          turnRef: 'turn-sdk',
          phase: 'streaming',
          reasoningText: 'raw reasoning fallback',
          presentation: {
            entries: [],
            lastError: null,
          },
        },
      },
    });

    expect(hiddenPresentationState.thinkingText).toBe('');
  });

  test('response overlay surface state blanks raw fallback under direct ConversationView input', () => {
    const state = resolveResponseOverlaySurfaceState({
      chatSurfaceState: {
        messages: [{
          id: 'stale-user',
          sender: 'user',
          text: 'stale raw user',
        }],
        pendingTurn: {
          conversationRef: 'conv-view',
          turnRef: 'turn-pending',
        },
        conversationView: {
          conversationRef: 'conv-view',
          liveTurn: null,
          surfaces: {
            responseOverlay: {
              mode: 'hidden',
              visible: false,
            },
          },
        },
        sdkLiveTurn: {
          conversationRef: 'conv-view',
          turnRef: 'turn-sdk',
          phase: 'streaming',
          assistantText: 'stale SDK fallback',
        },
      },
    });

    expect(state.messages).toEqual([]);
    expect(state.sdkLiveTurn).toBeNull();
    expect(state.useLocalPendingTurn).toBe(true);
    expect(state.responseOverlayEntries).toEqual([]);
    expect(state.responseOverlayMessages).toEqual([]);
    expect(state.visibleTurnLifecycle).toEqual(expect.objectContaining({
      source: 'local',
      status: 'local_pending',
      awaitingAnchor: null,
    }));
  });

  test('projects local pending bridge surface state before SDK view exists', () => {
    const state = resolveResponseOverlaySurfaceState({
      chatSurfaceState: {
        messages: [{
          id: 'pending-user',
          sender: 'user',
          text: 'pending prompt',
          sourceEventType: 'renderer-compose',
        }],
        pendingTurn: {
          conversationRef: 'conv-pending',
          turnRef: 'turn-pending',
          text: 'pending prompt',
          timestamp: '2026-06-25T12:00:00.000Z',
        },
      },
    });

    expect(state.useLocalPendingTurn).toBe(true);
    expect(state.responseOverlayEntries).toEqual([]);
    expect(state.responseOverlayMessages).toEqual([
      expect.objectContaining({
        id: 'pending-user',
      }),
    ]);
    expect(state.liveTurnPresentationInput).toMatchObject({
      source: 'pending-turn',
      turnRef: 'turn-pending',
    });
    expect(state.pendingTurn).toEqual(expect.objectContaining({
      turnRef: 'turn-pending',
    }));
  });

  test('resolves SDK projection presentation state before visible lifecycle stamping', () => {
    expect(resolveResponseOverlayPresentationState({
      currentTurnPresentationState: {
        activeResponse: null,
        hasVisibleReply: false,
        visibleResponse: null,
        chatboxSurfaceState: 'compact',
      },
      sdkLiveTurn: {
        conversationRef: 'conv-sdk',
        turnRef: 'turn-sdk',
        presentation: {
          hasVisibleContent: true,
          entries: [{
            id: 'assistant-sdk',
            sender: 'assistant',
            type: 'llm-text',
            text: 'from sdk',
          }],
          overlayIntent: {
            visible: true,
            mode: 'response',
            conversationRef: 'conv-sdk',
            turnRef: 'turn-sdk',
            staleGuardRef: 'turn-sdk',
          },
        },
      },
      responseOverlayEntries: [{
        id: 'assistant-sdk',
        sender: 'assistant',
        type: 'llm-text',
        text: 'from sdk',
      }],
      liveTurnPresentationInput: {
        source: 'sdk',
        useSdkLiveTurnPresentation: true,
        useLocalPendingTurn: false,
      },
      visibleTurnLifecycle: {
        status: 'active',
        isBusy: true,
      },
    })).toMatchObject({
      activeResponse: {
        id: 'assistant-sdk',
        text: 'from sdk',
      },
      visibleResponse: {
        id: 'assistant-sdk',
      },
      overlayIntent: expect.objectContaining({
        mode: 'response',
        turnRef: 'turn-sdk',
      }),
      visibleTurnLifecycle: {
        status: 'active',
      },
      isBusy: true,
      awaitingDotTargetMessageId: null,
    });
  });

  test('resolves presentation state from sanitized surface state', () => {
    const responseOverlaySurfaceState = resolveResponseOverlaySurfaceState({
      chatSurfaceState: {
        sdkLiveTurn: {
          conversationRef: 'conv-sdk',
          turnRef: 'turn-sdk',
          phase: 'streaming',
          presentation: {
            hasVisibleContent: true,
            entries: [{
              id: 'assistant-sdk',
              sender: 'assistant',
              type: 'llm-text',
              text: 'from sdk',
            }],
            overlayIntent: {
              visible: true,
              mode: 'response',
              turnRef: 'turn-sdk',
              staleGuardRef: 'guard-sdk',
              conversationRef: 'conv-sdk',
            },
          },
        },
      },
    });

    expect(resolveResponseOverlayPresentationStateForSurfaceState({
      currentTurnPresentationState: {
        activeResponse: null,
        hasVisibleReply: false,
        visibleResponse: null,
        chatboxSurfaceState: 'compact',
      },
      responseOverlaySurfaceState,
    })).toEqual(expect.objectContaining({
      activeResponse: expect.objectContaining({
        id: 'assistant-sdk',
        text: 'from sdk',
      }),
      overlayIntent: expect.objectContaining({
        turnRef: 'turn-sdk',
        staleGuardRef: 'guard-sdk',
      }),
    }));
  });

  test('keeps ConversationView presentation state instead of replaying stale projection state', () => {
    expect(resolveResponseOverlayPresentationState({
      currentTurnPresentationState: {
        activeResponse: {
          id: 'assistant-view',
          sender: 'assistant',
          type: 'llm-text',
          text: 'from view',
        },
        hasVisibleReply: true,
        visibleResponse: {
          id: 'assistant-view',
          sender: 'assistant',
          type: 'llm-text',
          text: 'from view',
        },
        chatboxSurfaceState: 'response',
      },
      sdkLiveTurn: {
        presentation: {
          overlayIntent: {
            visible: true,
            mode: 'response',
            turnRef: 'turn-stale',
          },
        },
      },
      responseOverlayEntries: [{
        id: 'assistant-view',
        sender: 'assistant',
        type: 'llm-text',
        text: 'from view',
      }],
      liveTurnPresentationInput: {
        source: 'conversation-view',
        useSdkLiveTurnPresentation: true,
        overlayIntent: {
          visible: true,
          mode: 'response',
          turnRef: 'turn-view',
        },
      },
      visibleTurnLifecycle: {
        status: 'active',
        isBusy: false,
      },
    })).toMatchObject({
      activeResponse: {
        id: 'assistant-view',
        text: 'from view',
      },
      visibleResponse: {
        id: 'assistant-view',
      },
      overlayIntent: {
        visible: true,
        mode: 'response',
        turnRef: 'turn-view',
      },
      visibleTurnLifecycle: {
        status: 'active',
      },
    });
  });

  test('shows response when entries exist and are not dismissed', () => {
    expect(resolveResponseOverlayViewContract({
      currentTurnPresentationState: {
        visibleTurnLifecycle: {
          status: 'awaiting',
        },
      },
      responseOverlayEntries: [{ id: 'assistant-1' }],
      dismissedResponseId: null,
    })).toMatchObject({
      latestResponseOverlayEntryId: 'assistant-1',
      responseVisible: true,
      awaitingVisible: false,
      overlayLayoutMode: 'response',
      isVisible: true,
    });
  });

  test('falls back to awaiting typing when no response entry is visible', () => {
    expect(resolveResponseOverlayViewContract({
      currentTurnPresentationState: {
        visibleTurnLifecycle: {
          status: 'awaiting',
        },
        visibleResponse: null,
      },
      responseOverlayEntries: [],
      dismissedResponseId: null,
    })).toMatchObject({
      latestResponseOverlayEntryId: null,
      responseVisible: false,
      awaitingVisible: true,
      overlayLayoutMode: 'awaiting-typing',
      isVisible: true,
    });
  });

  test('prefers awaiting typing over a stale visible response during new-turn preflight', () => {
    expect(resolveResponseOverlayViewContract({
      currentTurnPresentationState: {
        visibleTurnLifecycle: {
          status: 'local_pending',
        },
        visibleResponse: {
          id: 'assistant-1',
        },
      },
      responseOverlayEntries: [{ id: 'assistant-1' }],
      dismissedResponseId: null,
    })).toMatchObject({
      latestResponseOverlayEntryId: 'assistant-1',
      responseVisible: false,
      awaitingVisible: true,
      overlayLayoutMode: 'awaiting-typing',
      isVisible: true,
    });
  });

  test('keeps the current-turn response visible during active tool phases', () => {
    expect(resolveResponseOverlayViewContract({
      currentTurnPresentationState: {
        visibleTurnLifecycle: {
          status: 'active',
        },
        visibleResponse: {
          id: 'assistant-1',
        },
      },
      responseOverlayEntries: [{ id: 'assistant-1' }],
      dismissedResponseId: null,
    })).toMatchObject({
      latestResponseOverlayEntryId: 'assistant-1',
      responseVisible: true,
      awaitingVisible: false,
      overlayLayoutMode: 'response',
      isVisible: true,
    });
  });

  test('hides overlay when no response or awaiting state is active', () => {
    expect(resolveResponseOverlayViewContract({
      currentTurnPresentationState: {
        visibleTurnLifecycle: {
          status: 'idle',
        },
      },
      responseOverlayEntries: [],
      dismissedResponseId: null,
    })).toMatchObject({
      responseVisible: false,
      awaitingVisible: false,
      overlayLayoutMode: 'hidden',
      isVisible: false,
    });
  });
});
