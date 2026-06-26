import {
  DesktopConversationProjectionStreamRuntime,
} from '../../frontend/src/renderer/app/runtime/desktopConversationProjectionStreamRuntime';

const {
  applyCurrentTurnProjectionEvent,
  applyDisplayRowsProjectionEvent,
  buildDisplayRowsProjection,
  buildReplayProjectionTracePayload,
  normalizeTurnRef,
} = DesktopConversationProjectionStreamRuntime;

describe('DesktopConversationProjectionStreamRuntime', () => {
  test('normalizes turn refs', () => {
    expect(normalizeTurnRef(' turn-old ')).toBe('turn-old');
    expect(normalizeTurnRef('   ')).toBeNull();
  });

  test('builds display-row projection while preserving pending optimistic user rows', () => {
    const optimisticUser = {
      id: 'turn-1-sdk-evt-000002-user_message',
      sender: 'user' as const,
      text: 'inspect recent commits',
      turnRef: 'turn-1',
      sourceEventType: 'renderer-compose',
      sourceChannel: 'renderer-local',
      isComplete: true,
    };

    const projection = buildDisplayRowsProjection({
      rows: [{
        id: 'tool-row',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        index: 0,
        role: 'assistant' as const,
        type: 'tool_call' as const,
        content: {
          id: 'call-1',
          name: 'read_file',
          arguments: {
            path: 'CHANGELOG.md',
          },
        },
        metadata: {
          toolName: 'read_file',
          requestId: 'request-1',
        },
      }],
      workspace: {
        messages: [optimisticUser],
        pendingTurn: {
          turnRef: 'turn-1',
        },
      },
    });

    expect(projection.projectedRows).toHaveLength(1);
    expect(projection.sdkMessages).toEqual([
      expect.objectContaining({
        id: 'tool-row',
        sender: 'assistant',
        type: 'tool-call',
      }),
    ]);
    expect(projection.mergedMessages).toEqual([
      optimisticUser,
      expect.objectContaining({
        id: 'tool-row',
        sender: 'assistant',
        type: 'tool-call',
      }),
    ]);
    expect(projection.traceSummary).toEqual(expect.objectContaining({
      rowCount: 1,
      currentMessageCount: 1,
      mergedMessageCount: 2,
    }));
    expect(projection.shouldApplyMessages).toBe(true);
  });

  test('keeps display-row projection as row-count trace only once ConversationView exists', () => {
    const projection = buildDisplayRowsProjection({
      rows: [{
        id: 'assistant-row',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        index: 0,
        role: 'assistant' as const,
        type: 'assistant_message' as const,
        content: 'sdk row',
      }],
      workspace: {
        conversationView: {
          conversationRef: 'conv-1',
          displayRows: [],
        },
        messages: [{
          id: 'existing',
          sender: 'user' as const,
          text: 'existing pending bridge',
        }],
      },
    });

    expect(projection.shouldApplyMessages).toBe(false);
    expect(projection.sdkMessages).toEqual([]);
    expect(projection.mergedMessages).toEqual([]);
    expect(projection.traceSummary).toEqual(expect.objectContaining({
      rowCount: 1,
      sdkMessageCount: 0,
      currentMessageCount: 0,
      mergedMessageCount: 0,
    }));
  });

  test('builds replay trace payloads from workspace state', () => {
    expect(buildReplayProjectionTracePayload({
      action: 'sdk_current_turn_applied',
      conversationRef: 'conv-1',
      workspace: {
        messages: [{ id: 'm-1', sender: 'user', text: 'hello' }],
        pendingTurn: { turnRef: ' turn-new ' },
        currentTurnProjection: {
          turnRef: 'turn-new',
          phase: 'streaming',
        },
        streamTracking: {
          activeTurnRef: 'turn-new',
          phase: 'streaming',
        },
      },
      values: {
        newTurnRef: 'turn-new',
        oldTurnRef: 'turn-old',
      },
    })).toEqual(expect.objectContaining({
      action: 'sdk_current_turn_applied',
      conversationRef: 'conv-1',
      pendingTurnRef: 'turn-new',
      currentTurnRef: 'turn-new',
      pendingMatchesNewTurn: true,
      currentMatchesNewTurn: true,
      currentMatchesOldTurn: false,
      messageCount: 1,
    }));
  });

  test('builds replay trace payloads from ConversationView instead of stale raw state', () => {
    expect(buildReplayProjectionTracePayload({
      action: 'sdk_current_turn_applied',
      conversationRef: 'conv-1',
      workspace: {
        conversationView: {
          liveTurn: {
            turnRef: 'turn-view',
            phase: 'complete',
          },
          displayRows: [
            { id: 'view-user' },
            { id: 'view-assistant' },
          ],
        },
        messages: [{ id: 'stale-message', sender: 'user', text: 'stale' }],
        pendingTurn: { turnRef: 'turn-new' },
        currentTurnProjection: {
          turnRef: 'turn-stale',
          phase: 'streaming',
        },
        streamTracking: {
          activeTurnRef: 'turn-stale',
          phase: 'streaming',
        },
      },
      values: {
        newTurnRef: 'turn-new',
        oldTurnRef: 'turn-view',
      },
    })).toEqual(expect.objectContaining({
      currentTurnRef: 'turn-view',
      currentTurnPhase: 'complete',
      currentMatchesOldTurn: true,
      currentMatchesNewTurn: false,
      displayRowCount: 2,
      messageCount: 0,
    }));
  });

  test('reports replay cleanup traces when current projection still points at the old turn', () => {
    expect(buildReplayProjectionTracePayload({
      action: 'sdk_replay_after_cleanup',
      conversationRef: 'conv-1',
      workspace: {
        messages: [],
        pendingTurn: { turnRef: 'turn-new' },
        currentTurnProjection: {
          turnRef: 'turn-old',
          phase: 'completed',
        },
        streamTracking: {
          activeTurnRef: 'turn-old',
          phase: 'completed',
        },
      },
      values: {
        newTurnRef: 'turn-new',
        oldTurnRef: 'turn-old',
      },
    })).toEqual(expect.objectContaining({
      action: 'sdk_replay_after_cleanup',
      conversationRef: 'conv-1',
      pendingTurnRef: 'turn-new',
      currentTurnRef: 'turn-old',
      pendingMatchesNewTurn: true,
      currentMatchesNewTurn: false,
      currentMatchesOldTurn: true,
    }));
  });

  test('applies accepted current-turn projection events through runtime side effects', () => {
    const deps = {
      getWorkspaceState: jest.fn(() => ({
        messages: [],
        pendingTurn: null,
        currentTurnProjection: {
          turnRef: 'turn-1',
          phase: 'streaming',
        },
        streamTracking: {
          activeTurnRef: 'turn-1',
          phase: 'streaming',
        },
      })),
      setCurrentTurnProjection: jest.fn(),
      setIsSending: jest.fn(),
      setThinkingStatus: jest.fn(),
      setThinkingSourceEventType: jest.fn(),
      updateStreamTracking: jest.fn((updater) => updater({})),
    };
    const projectionCursors = new Map();

    applyCurrentTurnProjectionEvent({
      conversationRef: 'conv-1',
      currentTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        phase: 'streaming',
        assistantText: 'hello',
        reasoningText: null,
        toolEvents: [],
        lastError: null,
      },
      deps,
      projectionCursors,
    });

    expect(deps.setCurrentTurnProjection).toHaveBeenCalledWith(
      expect.objectContaining({ turnRef: 'turn-1' }),
      'conv-1',
    );
    expect(deps.setIsSending).toHaveBeenCalledWith(false, 'conv-1');
    expect(deps.updateStreamTracking).toHaveBeenCalled();
    expect(projectionCursors.size).toBe(1);
  });

  test('applies display-row projection events only while ConversationView is absent', () => {
    const setMessages = jest.fn();

    applyDisplayRowsProjectionEvent({
      conversationRef: 'conv-1',
      rows: [{
        id: 'assistant-row',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        index: 0,
        role: 'assistant' as const,
        type: 'assistant_message' as const,
        content: 'sdk row',
      }],
      deps: {
        getWorkspaceState: jest.fn(() => ({
          conversationView: {
            conversationRef: 'conv-1',
            displayRows: [],
          },
          messages: [],
        })),
        setMessages,
      },
    });

    expect(setMessages).not.toHaveBeenCalled();

    applyDisplayRowsProjectionEvent({
      conversationRef: 'conv-1',
      rows: [{
        id: 'assistant-row',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        index: 0,
        role: 'assistant' as const,
        type: 'assistant_message' as const,
        content: 'sdk row',
      }],
      deps: {
        getWorkspaceState: jest.fn(() => ({
          messages: [],
        })),
        setMessages,
      },
    });

    expect(setMessages).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'assistant-row',
        text: 'sdk row',
      }),
    ], 'conv-1');
  });
});
