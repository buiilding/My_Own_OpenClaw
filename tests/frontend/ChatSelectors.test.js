/**
 * Covers chat selectors. behavior in the frontend test suite.
 */

import {
  selectChatInterfaceState,
  selectChatInterfaceSurfaceState,
  selectLiveTurnSurfaceState,
} from '../../frontend/src/renderer/features/chat/stores/chatStore';
import { DesktopChatSurfaceSelectorRuntime } from '../../frontend/src/renderer/app/runtime/desktopChatSurfaceSelectorRuntime';

const {
  projectDesktopChatSurfaceState,
  projectDesktopChatInterfaceState,
  projectDesktopLiveTurnSurfaceState,
} = DesktopChatSurfaceSelectorRuntime;

describe('chatSelectors', () => {
  test('projects shared chat surface fields through app runtime helpers', () => {
    const activeWorkspace = {
      messages: [{ id: '1', text: 'hello', sender: 'assistant' }],
      isSending: true,
      thinkingStatus: 'thinking',
      thinkingSourceEventType: 'reasoning_delta',
      compactionDebugInfo: { strategy: 'summarize' },
      tokenCounts: { total_tokens: 7 },
      streamTracking: { phase: 'streaming' },
      currentTurnProjection: { turnRef: 'workspace-turn' },
      pendingTurn: { turnRef: 'pending-turn' },
    };

    const interfaceState = projectDesktopChatInterfaceState(activeWorkspace);
    expect(interfaceState).toEqual({
      messages: activeWorkspace.messages,
      thinkingStatus: 'thinking',
      thinkingSourceEventType: 'reasoning_delta',
      compactionDebugInfo: activeWorkspace.compactionDebugInfo,
      tokenCounts: activeWorkspace.tokenCounts,
      currentTurnProjection: activeWorkspace.currentTurnProjection,
      conversationView: null,
      pendingTurn: activeWorkspace.pendingTurn,
    });
    expect(interfaceState).not.toHaveProperty('streamTracking');
    expect(projectDesktopChatSurfaceState({
      activeWorkspace,
    })).toEqual({
      messages: activeWorkspace.messages,
      currentTurnProjection: activeWorkspace.currentTurnProjection,
      conversationView: null,
      pendingTurn: activeWorkspace.pendingTurn,
    });
    expect(projectDesktopLiveTurnSurfaceState({
      activeWorkspace,
    })).toEqual(expect.objectContaining({
      currentTurnProjection: activeWorkspace.currentTurnProjection,
    }));
    expect(projectDesktopLiveTurnSurfaceState({
      activeWorkspace,
    })).not.toHaveProperty('isSending');
    expect(projectDesktopLiveTurnSurfaceState({
      activeWorkspace,
    })).not.toHaveProperty('thinkingStatus');
    expect(projectDesktopLiveTurnSurfaceState({
      activeWorkspace,
    })).not.toHaveProperty('thinkingSourceEventType');
  });

  test('drops raw surface messages once ConversationView owns the live surface', () => {
    const activeWorkspace = {
      messages: [{ id: 'stale-user', text: 'stale', sender: 'user' }],
      currentTurnProjection: { turnRef: 'raw-turn', phase: 'streaming' },
      conversationView: {
        conversationRef: 'conv-view',
        liveTurn: {
          turnRef: 'view-turn',
          phase: 'complete',
          entries: [{ id: 'view-entry', text: 'done', sender: 'assistant' }],
          isBusy: false,
          isTerminal: true,
        },
        surfaces: {
          pill: { mode: 'idle' },
          responseOverlay: { mode: 'response', visible: true },
        },
      },
      pendingTurn: null,
    };

    expect(projectDesktopChatSurfaceState({
      activeWorkspace,
    })).toEqual(expect.objectContaining({
      messages: [],
      currentTurnProjection: null,
      conversationView: activeWorkspace.conversationView,
    }));
  });

  test('drops raw surface messages while carrying the pending bridge under ConversationView', () => {
    const activeWorkspace = {
      messages: [{ id: 'pending-user', text: 'pending', sender: 'user' }],
      currentTurnProjection: null,
      conversationView: {
        conversationRef: 'conv-view',
        liveTurn: null,
        surfaces: {
          pill: { mode: 'idle' },
        },
      },
      pendingTurn: {
        conversationRef: 'conv-view',
        turnRef: 'turn-pending',
        userMessageId: 'pending-user',
      },
    };

    expect(projectDesktopChatSurfaceState({
      activeWorkspace,
    })).toEqual(expect.objectContaining({
      messages: [],
      currentTurnProjection: null,
      conversationView: activeWorkspace.conversationView,
      pendingTurn: activeWorkspace.pendingTurn,
    }));
  });

  test('selects only chat interface state fields', () => {
    const state = {
      messages: [{ id: '1', text: 'hello', sender: 'user' }],
      isSending: true,
      thinkingStatus: 'thinking',
      tokenCounts: { total_tokens: 42 },
      streamTracking: { phase: 'streaming' },
      addMessage: jest.fn(),
      clearMessages: jest.fn(),
    };

    expect(selectChatInterfaceState(state)).toEqual({
      messages: state.messages,
      thinkingStatus: 'thinking',
      thinkingSourceEventType: null,
      compactionDebugInfo: null,
      tokenCounts: { total_tokens: 42 },
      currentTurnProjection: null,
      conversationView: null,
      pendingTurn: null,
      activeRevisionId: null,
      canEditMessages: true,
      canRetryMessages: true,
      renderedMessages: state.messages,
      replayFallbackMessages: state.messages,
      chatSurfaceState: {
        messages: state.messages,
        currentTurnProjection: null,
        conversationView: null,
        pendingTurn: null,
      },
    });
    expect(selectChatInterfaceState(state)).not.toHaveProperty('streamTracking');
    expect(selectChatInterfaceSurfaceState(state)).toEqual({
      messages: state.messages,
      currentTurnProjection: null,
      conversationView: null,
      pendingTurn: null,
    });
  });

  test('keeps selected object references (no cloning)', () => {
    const messages = [{ id: '1', text: 'hello', sender: 'assistant' }];
    const tokenCounts = { total_tokens: 42 };
    const state = {
      messages,
      isSending: false,
      thinkingStatus: null,
      tokenCounts,
      streamTracking: { phase: 'idle' },
      addMessage: jest.fn(),
    };

    const chatInterface = selectChatInterfaceState(state);

    expect(chatInterface.messages).toBe(messages);
    expect(chatInterface.renderedMessages).toBe(messages);
    expect(chatInterface.replayFallbackMessages).toBe(messages);
    expect(chatInterface.tokenCounts).toBe(tokenCounts);
    expect(selectChatInterfaceSurfaceState(state).messages).toBe(messages);
  });

  test('does not rebuild active dashboard rows from SDK current-turn state', () => {
    const messages = [
      { id: 'user-1', text: 'old question', sender: 'user', turnRef: 'turn-old' },
      { id: 'assistant-1', text: 'old answer', sender: 'assistant', type: 'llm-text', turnRef: 'turn-old' },
      { id: 'user-2', text: 'new question', sender: 'user', turnRef: 'turn-new' },
      { id: 'stale-active-assistant', text: 'stale partial', sender: 'assistant', type: 'llm-text', turnRef: 'turn-new' },
    ];
    const selected = selectChatInterfaceState({
      messages,
      isSending: true,
      thinkingStatus: null,
      currentTurnProjection: {
        conversationRef: 'conv-1',
        turnRef: 'turn-new',
        phase: 'streaming',
        assistantText: 'projected answer',
        reasoningText: null,
        toolEvents: [],
        lastError: null,
      },
      tokenCounts: null,
      streamTracking: { phase: 'streaming' },
    });

    expect(selected.messages).toBe(messages);
  });

  test('keeps dashboard message references stable without projection cloning', () => {
    const messages = [
      { id: 'user-1', text: 'question', sender: 'user', turnRef: 'turn-1' },
      { id: 'assistant-1', text: 'stale partial', sender: 'assistant', type: 'llm-text', turnRef: 'turn-1' },
    ];
    const currentTurnProjection = {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'streaming',
      assistantText: 'projected answer',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
    };
    const state = {
      messages,
      isSending: true,
      thinkingStatus: null,
      currentTurnProjection,
      tokenCounts: null,
      streamTracking: { phase: 'streaming' },
    };

    const first = selectChatInterfaceState(state);
    const second = selectChatInterfaceState(state);

    expect(first.messages).toBe(second.messages);
  });

  test('does not dedupe dashboard rows in the selector', () => {
    const messages = [
      { id: 'user-1', text: 'question', sender: 'user', turnRef: 'turn-1' },
      {
        id: 'conv-1:turn-1:assistant',
        text: 'older projected answer',
        sender: 'assistant',
        type: 'llm-text',
        turnRef: 'turn-1',
      },
      {
        id: 'conv-1:turn-1:assistant',
        text: 'newer projected answer',
        sender: 'assistant',
        type: 'llm-text',
        turnRef: 'turn-1',
      },
    ];
    const selected = selectChatInterfaceState({
      messages,
      isSending: false,
      thinkingStatus: null,
      currentTurnProjection: null,
      tokenCounts: null,
      streamTracking: { phase: 'complete' },
    });

    expect(selected.messages).toBe(messages);
  });

  test('uses only active workspace raw current turn for no-view minimal surfaces', () => {
    const workspaceProjection = {
      conversationRef: 'conv-dashboard',
      turnRef: 'turn-dashboard',
      phase: 'awaiting',
      assistantText: '',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
    };
    const selected = selectLiveTurnSurfaceState({
      messages: [],
      isSending: true,
      thinkingStatus: null,
      currentTurnProjection: workspaceProjection,
      tokenCounts: null,
      streamTracking: { phase: 'awaiting-first-chunk' },
    });

    expect(selected.currentTurnProjection).toBe(workspaceProjection);
    expect(selected).not.toHaveProperty('isSending');
    expect(selected).not.toHaveProperty('thinkingStatus');
    expect(selected).not.toHaveProperty('thinkingSourceEventType');
  });

  test('ConversationView suppresses raw current-turn authority for minimal surfaces', () => {
    const workspaceProjection = {
      conversationRef: 'conv-dashboard',
      turnRef: 'turn-dashboard',
      phase: 'streaming',
    };
    const view = {
      conversationRef: 'conv-view',
      liveTurn: {
        turnRef: 'turn-view',
        phase: 'complete',
        entries: [{ id: 'entry-view' }],
        isBusy: false,
        isTerminal: true,
        canStop: false,
      },
      surfaces: {
        pill: { mode: 'idle' },
        dashboard: { mode: 'idle' },
        responseOverlay: {
          mode: 'response',
          visible: true,
          guardRef: 'turn-view',
          ownerConversationRef: 'conv-view',
          turnRef: 'turn-view',
        },
      },
    };

    const selected = selectLiveTurnSurfaceState({
      messages: [{ id: 'stale-user', text: 'stale', sender: 'user' }],
      currentTurnProjection: workspaceProjection,
      conversationView: null,
      latestConversationView: view,
      pendingTurn: null,
    });

    expect(selected.conversationView).toBe(view);
    expect(selected.currentTurnProjection).toBeNull();
    expect(selected.messages).toEqual([]);
    expect(selected).toEqual({
      messages: [],
      currentTurnProjection: null,
      conversationView: view,
      pendingTurn: null,
    });
  });

  test('ConversationView suppresses raw current-turn authority for dashboard chat state', () => {
    const workspaceProjection = {
      conversationRef: 'conv-dashboard',
      turnRef: 'turn-stale',
      phase: 'streaming',
      assistantText: 'stale raw current turn',
    };
    const view = {
      conversationRef: 'conv-dashboard',
      revisionId: 'rev-view',
      displayRows: [{ id: 'display-user-1', role: 'user' }],
      liveTurn: {
        turnRef: 'turn-view',
        phase: 'streaming',
        entries: [{ id: 'entry-view', text: 'view live answer' }],
        isBusy: true,
        isTerminal: false,
        canStop: true,
      },
      surfaces: {
        pill: { mode: 'busy' },
        dashboard: { mode: 'busy' },
        responseOverlay: {
          mode: 'response',
          visible: true,
          guardRef: 'turn-view',
          ownerConversationRef: 'conv-dashboard',
          turnRef: 'turn-view',
        },
      },
    };

    const selected = selectChatInterfaceState({
      messages: [{ id: 'display-user-1', text: 'question', sender: 'user' }],
      thinkingStatus: null,
      currentTurnProjection: workspaceProjection,
      conversationView: view,
      pendingTurn: null,
    });

    expect(selected.conversationView).toBe(view);
    expect(selected.currentTurnProjection).toBeNull();
    expect(selected.messages).toEqual([{ id: 'display-user-1', text: 'question', sender: 'user' }]);
    expect(selected.renderedMessages).toEqual([
      expect.objectContaining({
        id: 'entry-view',
        text: 'view live answer',
      }),
    ]);
    expect(selected.replayFallbackMessages).toEqual([]);
    expect(selected.chatSurfaceState).toEqual({
      messages: [],
      currentTurnProjection: null,
      conversationView: view,
      pendingTurn: null,
    });
  });

  test('defaults optional active-workspace fields when not present', () => {
    const selected = selectChatInterfaceState({
      messages: [],
      isSending: false,
      thinkingStatus: null,
    });

    expect(selected).toEqual(expect.objectContaining({
      messages: [],
      thinkingStatus: null,
      thinkingSourceEventType: null,
      compactionDebugInfo: null,
      tokenCounts: null,
      currentTurnProjection: null,
      pendingTurn: null,
      activeRevisionId: null,
      canEditMessages: true,
      canRetryMessages: true,
      renderedMessages: [],
      replayFallbackMessages: [],
    }));
    expect(selected).not.toHaveProperty('streamTracking');
  });

});
