/**
 * Covers chat workspace clear/reset state updates.
 */

import { DesktopChatClearMessagesRuntime } from '../../src/renderer/app/runtime/desktopChatClearMessagesRuntime';

const { buildClearMessagesStateUpdate } = DesktopChatClearMessagesRuntime;

describe('DesktopChatClearMessagesRuntime', () => {
  test('buildClearMessagesStateUpdate resolves workspace and resets clear-message fields', () => {
    const initialStreamTracking = {
      phase: 'idle',
      eventCount: 0,
    };
    const state = {
      activeConversationRef: 'conv-1',
      workspaces: {
        'conv-1': {
          messages: [{ id: 'm-1' }],
          isSending: true,
          thinkingStatus: 'keep-thinking-status',
          thinkingSourceEventType: 'llm-thought',
          compactionDebugInfo: { reason: 'manual' },
          tokenCounts: { total_tokens: 42 },
          streamTracking: { phase: 'streaming', eventCount: 2 },
          sdkLiveTurn: { turnRef: 'turn-1' },
          conversationView: { conversationRef: 'conv-1' },
          pendingTurn: { turnRef: 'turn-1' },
        },
      },
    };
    const deps = {
      buildWorkspaceUpdate: jest.fn((currentState, workspaceRef, nextWorkspace) => ({
        ...currentState,
        workspaces: {
          ...currentState.workspaces,
          [workspaceRef]: nextWorkspace,
        },
      })),
      createInitialStreamTracking: jest.fn(() => initialStreamTracking),
      readWorkspaceState: jest.fn((currentState, workspaceRef) => currentState.workspaces[workspaceRef]),
      resolveWorkspaceKey: jest.fn(() => 'conv-1'),
    };

    const nextState = buildClearMessagesStateUpdate({
      conversationRef: 'conv-1',
      deps,
      state,
    });

    expect(deps.resolveWorkspaceKey).toHaveBeenCalledWith('conv-1', 'conv-1');
    expect(deps.readWorkspaceState).toHaveBeenCalledWith(state, 'conv-1');
    expect(deps.createInitialStreamTracking).toHaveBeenCalled();
    expect(deps.buildWorkspaceUpdate).toHaveBeenCalledWith(
      state,
      'conv-1',
      expect.objectContaining({
        messages: [],
        isSending: false,
        thinkingStatus: 'keep-thinking-status',
        thinkingSourceEventType: null,
        compactionDebugInfo: null,
        tokenCounts: { total_tokens: 42 },
        streamTracking: initialStreamTracking,
        sdkLiveTurn: null,
        conversationView: null,
        pendingTurn: null,
      }),
    );
    expect(nextState).toEqual(expect.objectContaining({
      workspaces: {
        'conv-1': expect.objectContaining({
          messages: [],
          isSending: false,
          thinkingStatus: 'keep-thinking-status',
          tokenCounts: { total_tokens: 42 },
          streamTracking: initialStreamTracking,
          sdkLiveTurn: null,
          conversationView: null,
          pendingTurn: null,
        }),
      },
    }));
  });
});
