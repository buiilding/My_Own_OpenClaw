import {
  DesktopConversationProjectionStreamRuntime,
} from '../../frontend/src/renderer/app/runtime/desktopConversationProjectionStreamRuntime';

const {
  buildDisplayRowsProjection,
  buildReplayProjectionTracePayload,
  isSupersededTurn,
  normalizeTurnRef,
  withoutSupersededRows,
} = DesktopConversationProjectionStreamRuntime;

describe('DesktopConversationProjectionStreamRuntime', () => {
  test('normalizes and detects superseded turns', () => {
    const workspace = {
      supersededTurnRefs: {
        'turn-old': true as const,
      },
    };

    expect(normalizeTurnRef(' turn-old ')).toBe('turn-old');
    expect(normalizeTurnRef('   ')).toBeNull();
    expect(isSupersededTurn(workspace, ' turn-old ')).toBe(true);
    expect(isSupersededTurn(workspace, 'turn-new')).toBe(false);
  });

  test('filters superseded display rows', () => {
    const rows = [
      {
        id: 'old-user',
        conversationRef: 'conv-1',
        turnRef: 'turn-old',
        index: 0,
        role: 'user' as const,
        type: 'user_message' as const,
        content: 'old prompt',
      },
      {
        id: 'new-user',
        conversationRef: 'conv-1',
        turnRef: 'turn-new',
        index: 1,
        role: 'user' as const,
        type: 'user_message' as const,
        content: 'new prompt',
      },
    ];

    expect(withoutSupersededRows(rows, {
      supersededTurnRefs: {
        'turn-old': true,
      },
    })).toEqual([rows[1]]);
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

    expect(projection.filteredRows).toHaveLength(1);
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

  test('keeps display-row projection as trace-only once ConversationView exists', () => {
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
    expect(projection.mergedMessages).toEqual([
      expect.objectContaining({
        id: 'assistant-row',
        text: 'sdk row',
      }),
    ]);
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
      },
    })).toEqual(expect.objectContaining({
      action: 'sdk_current_turn_applied',
      conversationRef: 'conv-1',
      pendingTurnRef: 'turn-new',
      currentTurnRef: 'turn-new',
      pendingMatchesNewTurn: true,
      currentMatchesNewTurn: true,
      messageCount: 1,
    }));
  });
});
