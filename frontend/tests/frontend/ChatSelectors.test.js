/**
 * Covers chat selectors. behavior in the frontend test suite.
 */

import {
  selectChatInterfaceState,
  selectChatInterfaceSurfaceState,
  selectChatSendReadModel,
  selectLiveTurnSurfaceState,
} from '../../src/renderer/features/chat/stores/chatStore';
import { DesktopChatInterfaceSelectorRuntime } from '../../src/renderer/app/runtime/desktopChatInterfaceSelectorRuntime';
import { DesktopChatSurfaceSelectorRuntime } from '../../src/renderer/app/runtime/desktopChatSurfaceSelectorRuntime';
import { projectWorkspaceReadModelState } from '../../src/renderer/app/runtime/desktopChatWorkspaceStateRuntime';

const {
  buildChatSendReadModelSelectorState,
} = DesktopChatInterfaceSelectorRuntime;
const {
  projectDesktopChatSurfaceState,
  projectDesktopChatInterfaceState,
  projectDesktopLiveTurnSurfaceState,
} = DesktopChatSurfaceSelectorRuntime;

const DEFAULT_CHAT_WORKSPACE_REF = '__default__';

function createWorkspace(overrides = {}) {
  return {
    messages: [],
    isSending: false,
    thinkingStatus: null,
    thinkingSourceEventType: null,
    compactionDebugInfo: null,
    tokenCounts: null,
    streamTracking: { phase: 'idle' },
    sdkLiveTurn: null,
    conversationView: null,
    pendingTurn: null,
    ...overrides,
  };
}

function createStateWithActiveWorkspace(overrides = {}) {
  const workspace = createWorkspace(overrides);
  return {
    activeConversationRef: null,
    workspaces: {
      [DEFAULT_CHAT_WORKSPACE_REF]: workspace,
    },
  };
}

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
      sdkLiveTurn: { turnRef: 'workspace-turn' },
      pendingTurn: { turnRef: 'pending-turn' },
    };

    const interfaceState = projectDesktopChatInterfaceState(
      projectWorkspaceReadModelState(activeWorkspace),
    );
    expect(interfaceState).toEqual({
      messages: activeWorkspace.messages,
      rendererAnnotations: [],
      thinkingStatus: 'thinking',
      thinkingSourceEventType: 'reasoning_delta',
      compactionDebugInfo: activeWorkspace.compactionDebugInfo,
      tokenCounts: activeWorkspace.tokenCounts,
      conversationView: null,
      pendingTurn: activeWorkspace.pendingTurn,
      sdkLiveTurn: activeWorkspace.sdkLiveTurn,
    });
    expect(interfaceState).not.toHaveProperty('currentTurnProjection');
    expect(interfaceState).not.toHaveProperty('streamTracking');
    expect(projectDesktopChatSurfaceState({
      activeWorkspace: projectWorkspaceReadModelState(activeWorkspace),
    })).toEqual({
      messages: activeWorkspace.messages,
      conversationView: null,
      pendingTurn: activeWorkspace.pendingTurn,
      sdkLiveTurn: activeWorkspace.sdkLiveTurn,
    });
    expect(projectDesktopLiveTurnSurfaceState({
      activeWorkspace: projectWorkspaceReadModelState(activeWorkspace),
    })).toEqual(expect.objectContaining({
      sdkLiveTurn: activeWorkspace.sdkLiveTurn,
    }));
    expect(projectDesktopLiveTurnSurfaceState({
      activeWorkspace: projectWorkspaceReadModelState(activeWorkspace),
    })).not.toHaveProperty('isSending');
    expect(projectDesktopLiveTurnSurfaceState({
      activeWorkspace: projectWorkspaceReadModelState(activeWorkspace),
    })).not.toHaveProperty('thinkingStatus');
    expect(projectDesktopLiveTurnSurfaceState({
      activeWorkspace: projectWorkspaceReadModelState(activeWorkspace),
    })).not.toHaveProperty('thinkingSourceEventType');
  });

  test('projects only renderer annotations beside ConversationView interface state', () => {
    const conversationView = {
      conversationRef: 'conv-view',
      displayRows: [{ id: 'sdk-row', role: 'user' }],
      liveTurn: null,
      surfaces: {
        pill: { mode: 'idle' },
      },
    };
    const activeWorkspace = {
      messages: [{
        id: 'sdk-row',
        text: 'raw fallback',
        sender: 'user',
        fullUserMessage: 'full prompt',
        feedback: 'like',
      }],
      thinkingStatus: null,
      sdkLiveTurn: { turnRef: 'raw-turn' },
      conversationView,
      pendingTurn: null,
    };

    const interfaceState = projectDesktopChatInterfaceState(
      projectWorkspaceReadModelState(activeWorkspace),
    );

    expect(interfaceState).toEqual(expect.objectContaining({
      messages: [],
      rendererAnnotations: [{
        id: 'sdk-row',
        feedback: 'like',
      }],
      conversationView,
      sdkLiveTurn: null,
    }));
    expect(interfaceState).not.toHaveProperty('currentTurnProjection');
  });

  test('drops raw surface messages once ConversationView owns the live surface', () => {
    const activeWorkspace = {
      messages: [{ id: 'stale-user', text: 'stale', sender: 'user' }],
      sdkLiveTurn: { turnRef: 'raw-turn', phase: 'streaming' },
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

    const readModelWorkspace = projectWorkspaceReadModelState(activeWorkspace);
    const firstSurfaceState = projectDesktopChatSurfaceState({
      activeWorkspace: readModelWorkspace,
    });
    const secondSurfaceState = projectDesktopChatSurfaceState({
      activeWorkspace: readModelWorkspace,
    });
    expect(firstSurfaceState).toEqual(expect.objectContaining({
      messages: [],
      conversationView: activeWorkspace.conversationView,
      sdkLiveTurn: null,
    }));
    expect(firstSurfaceState).not.toHaveProperty('currentTurnProjection');
    expect(secondSurfaceState.messages).toBe(firstSurfaceState.messages);
  });

  test('surface selector consumes the sanitized ConversationView read model', () => {
    const conversationView = {
      conversationRef: 'conv-view',
      liveTurn: {
        turnRef: 'turn-view',
        phase: 'streaming',
      },
    };
    const selected = projectDesktopChatSurfaceState({
      activeWorkspace: projectWorkspaceReadModelState({
        messages: [{ id: 'stale-user', text: 'stale', sender: 'user' }],
        sdkLiveTurn: {
          conversationRef: 'conv-raw',
          turnRef: 'turn-raw',
          phase: 'streaming',
        },
        conversationView,
        pendingTurn: {
          conversationRef: 'conv-view',
          turnRef: 'turn-pending',
        },
      }),
    });

    expect(selected).toEqual({
      messages: [],
      conversationView,
      pendingTurn: {
        conversationRef: 'conv-view',
        turnRef: 'turn-pending',
      },
      sdkLiveTurn: null,
    });
  });

  test('surface selector rejects raw messages under direct ConversationView input', () => {
    const conversationView = {
      conversationRef: 'conv-direct',
      liveTurn: {
        turnRef: 'turn-direct',
        phase: 'streaming',
      },
    };

    expect(projectDesktopChatSurfaceState({
      activeWorkspace: {
        messages: [{ id: 'stale-user', text: 'stale raw', sender: 'user' }],
        conversationView,
        pendingTurn: {
          conversationRef: 'conv-direct',
          turnRef: 'turn-pending',
        },
        sdkLiveTurn: { turnRef: 'raw-live-turn' },
      },
    })).toEqual({
      messages: [],
      conversationView,
      pendingTurn: {
        conversationRef: 'conv-direct',
        turnRef: 'turn-pending',
      },
      sdkLiveTurn: null,
    });
  });

  test('drops raw surface messages while carrying the pending bridge under ConversationView', () => {
    const activeWorkspace = {
      messages: [{ id: 'pending-user', text: 'pending', sender: 'user' }],
      sdkLiveTurn: null,
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
      activeWorkspace: projectWorkspaceReadModelState(activeWorkspace),
    })).toEqual(expect.objectContaining({
      messages: [],
      conversationView: activeWorkspace.conversationView,
      pendingTurn: activeWorkspace.pendingTurn,
      sdkLiveTurn: null,
    }));
  });

  test('selects only chat interface state fields', () => {
    const messages = [{ id: '1', text: 'hello', sender: 'user' }];
    const state = createStateWithActiveWorkspace({
      messages,
      isSending: true,
      thinkingStatus: 'thinking',
      tokenCounts: { total_tokens: 42 },
      streamTracking: { phase: 'streaming' },
    });
    Object.assign(state, {
      addMessage: jest.fn(),
      clearMessages: jest.fn(),
    });

    expect(selectChatInterfaceState(state)).toEqual({
      thinkingStatus: 'thinking',
      thinkingSourceEventType: null,
      compactionDebugInfo: null,
      tokenCounts: { total_tokens: 42 },
      activeRevisionId: null,
      renderedMessages: messages,
      stopTurnTarget: {
        source: 'idle',
        conversationRef: null,
        turnRef: null,
        canStop: false,
      },
      chatSurfaceState: {
        messages,
        conversationView: null,
        pendingTurn: null,
        sdkLiveTurn: null,
      },
    });
    expect(selectChatInterfaceState(state)).not.toHaveProperty('streamTracking');
    expect(selectChatInterfaceState(state)).not.toHaveProperty('messages');
    expect(selectChatInterfaceState(state)).not.toHaveProperty('currentTurnProjection');
    expect(selectChatInterfaceState(state)).not.toHaveProperty('conversationView');
    expect(selectChatInterfaceState(state)).not.toHaveProperty('pendingTurn');
    expect(selectChatInterfaceSurfaceState(state)).toEqual({
      messages,
      conversationView: null,
      pendingTurn: null,
      sdkLiveTurn: null,
    });
  });

  test('keeps selected object references (no cloning)', () => {
    const messages = [{ id: '1', text: 'hello', sender: 'assistant' }];
    const tokenCounts = { total_tokens: 42 };
    const state = createStateWithActiveWorkspace({
      messages,
      isSending: false,
      thinkingStatus: null,
      tokenCounts,
      streamTracking: { phase: 'idle' },
    });
    Object.assign(state, {
      addMessage: jest.fn(),
    });

    const chatInterface = selectChatInterfaceState(state);
    const nextChatInterface = selectChatInterfaceState(state);

    expect(chatInterface).not.toHaveProperty('messages');
    expect(chatInterface.renderedMessages).toBe(messages);
    expect(chatInterface).not.toHaveProperty('replayFallbackMessages');
    expect(chatInterface).not.toHaveProperty('replayReadModel');
    expect(nextChatInterface).not.toHaveProperty('replayReadModel');
    expect(nextChatInterface.renderedMessages).toBe(chatInterface.renderedMessages);
    expect(nextChatInterface.chatSurfaceState).toBe(chatInterface.chatSurfaceState);
    expect(chatInterface.tokenCounts).toBe(tokenCounts);
    expect(selectChatInterfaceSurfaceState(state).messages).toBe(messages);
  });

  test('keeps pending-turn dashboard projections stable across repeated snapshots', () => {
    const pendingTurn = {
      conversationRef: 'conv-pending',
      text: 'from minimal pill',
      timestamp: '2026-06-26T20:00:00.000Z',
      turnRef: 'turn-pending',
      userMessageId: 'pending-user',
    };
    const state = createStateWithActiveWorkspace({
      messages: [],
      pendingTurn,
    });

    const first = selectChatInterfaceState(state);
    const second = selectChatInterfaceState(state);

    expect(first.renderedMessages).toEqual([
      expect.objectContaining({
        id: 'pending-user',
        sender: 'user',
        text: 'from minimal pill',
      }),
    ]);
    expect(second.renderedMessages).toBe(first.renderedMessages);
    expect(second.chatSurfaceState).toBe(first.chatSurfaceState);
  });

  test('does not rebuild active dashboard rows from SDK current-turn state', () => {
    const messages = [
      { id: 'user-1', text: 'old question', sender: 'user', turnRef: 'turn-old' },
      { id: 'assistant-1', text: 'old answer', sender: 'assistant', type: 'llm-text', turnRef: 'turn-old' },
      { id: 'user-2', text: 'new question', sender: 'user', turnRef: 'turn-new' },
      { id: 'stale-active-assistant', text: 'stale partial', sender: 'assistant', type: 'llm-text', turnRef: 'turn-new' },
    ];
    const selected = selectChatInterfaceState({
      ...createStateWithActiveWorkspace({
        messages,
        isSending: true,
        thinkingStatus: null,
        sdkLiveTurn: {
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
      }),
    });

    expect(selected).not.toHaveProperty('messages');
    expect(selected.renderedMessages).toEqual(expect.arrayContaining(messages));
  });

  test('keeps dashboard read models stable without exposing raw messages', () => {
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
    const state = createStateWithActiveWorkspace({
      messages,
      isSending: true,
      thinkingStatus: null,
      sdkLiveTurn: currentTurnProjection,
      tokenCounts: null,
      streamTracking: { phase: 'streaming' },
    });

    const first = selectChatInterfaceState(state);
    const second = selectChatInterfaceState(state);

    expect(first).not.toHaveProperty('messages');
    expect(first).not.toHaveProperty('replayReadModel');
    expect(second).not.toHaveProperty('replayReadModel');
    expect(first.renderedMessages).toEqual(second.renderedMessages);
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
      ...createStateWithActiveWorkspace({
        messages,
        isSending: false,
        thinkingStatus: null,
        sdkLiveTurn: null,
        tokenCounts: null,
        streamTracking: { phase: 'complete' },
      }),
    });

    expect(selected).not.toHaveProperty('messages');
    expect(selected.renderedMessages).toBe(messages);
  });

  test('selects send read model separately from chat interface presentation state', () => {
    const messages = [{ id: 'user-1', text: 'question', sender: 'user' }];
    const conversationView = {
      conversationRef: 'conv-send',
      displayRows: [{ id: 'row-user', role: 'user' }],
    };
    const state = createStateWithActiveWorkspace({
      messages,
      conversationView,
      sdkLiveTurn: { turnRef: 'raw-turn' },
      pendingTurn: { turnRef: 'pending-turn' },
      thinkingStatus: null,
    });

    expect(selectChatSendReadModel(state)).toEqual({
      hasPriorUserMessages: true,
    });
    expect(selectChatInterfaceState(state)).not.toHaveProperty('messages');
    expect(selectChatInterfaceState(state)).not.toHaveProperty('conversationView');
    expect(selectChatInterfaceState(state)).not.toHaveProperty('currentTurnProjection');
    expect(selectChatInterfaceState(state)).not.toHaveProperty('pendingTurn');
  });

  test('send read model helper does not expose raw messages under ConversationView', () => {
    const conversationView = {
      conversationRef: 'conv-send',
      displayRows: [{ id: 'row-user', role: 'user' }],
    };

    expect(buildChatSendReadModelSelectorState({
      activeWorkspace: projectWorkspaceReadModelState(createWorkspace({
        messages: [{ id: 'stale-user', text: 'stale raw', sender: 'user' }],
        conversationView,
        sdkLiveTurn: { turnRef: 'raw-turn' },
      })),
    })).toEqual({
      hasPriorUserMessages: true,
    });
  });

  test('send read model helper rejects raw messages under direct ConversationView input', () => {
    const conversationView = {
      conversationRef: 'conv-direct',
      displayRows: [{ id: 'row-user', role: 'user' }],
    };

    expect(buildChatSendReadModelSelectorState({
      activeWorkspace: createWorkspace({
        messages: [{ id: 'stale-user', text: 'stale raw', sender: 'user' }],
        conversationView,
      }),
    })).toEqual({
      hasPriorUserMessages: true,
    });
  });

  test('keeps raw send history only for the no-view fallback path', () => {
    const messages = [{ id: 'user-1', text: 'question', sender: 'user' }];
    expect(selectChatSendReadModel({
      ...createStateWithActiveWorkspace({
        messages,
        conversationView: null,
      }),
    })).toEqual({
      hasPriorUserMessages: true,
    });
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
      ...createStateWithActiveWorkspace({
        messages: [],
        isSending: true,
        thinkingStatus: null,
        sdkLiveTurn: workspaceProjection,
        tokenCounts: null,
        streamTracking: { phase: 'awaiting-first-chunk' },
      }),
    });

    expect(selected.sdkLiveTurn).toBe(workspaceProjection);
    expect(selected).not.toHaveProperty('currentTurnProjection');
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
      ...createStateWithActiveWorkspace({
        messages: [{ id: 'stale-user', text: 'stale', sender: 'user' }],
        sdkLiveTurn: workspaceProjection,
        conversationView: view,
        pendingTurn: null,
      }),
    });

    expect(selected.conversationView).toBe(view);
    expect(selected.sdkLiveTurn).toBeNull();
    expect(selected).not.toHaveProperty('currentTurnProjection');
    expect(selected.messages).toEqual([]);
    expect(selected).toEqual({
      messages: [],
      conversationView: view,
      pendingTurn: null,
      sdkLiveTurn: null,
      stopTurnTarget: {
        source: 'idle',
        conversationRef: 'conv-view',
        turnRef: 'turn-view',
        canStop: false,
      },
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
      ...createStateWithActiveWorkspace({
        messages: [{ id: 'display-user-1', text: 'question', sender: 'user' }],
        thinkingStatus: null,
        sdkLiveTurn: workspaceProjection,
        conversationView: view,
        pendingTurn: null,
      }),
    });

    expect(selected).not.toHaveProperty('conversationView');
    expect(selected).not.toHaveProperty('currentTurnProjection');
    expect(selected).not.toHaveProperty('messages');
    expect(selected.renderedMessages).toEqual([
      expect.objectContaining({
        id: 'entry-view',
        text: 'view live answer',
      }),
    ]);
    expect(selected).not.toHaveProperty('replayFallbackMessages');
    expect(selected).not.toHaveProperty('replayReadModel');
    expect(selected.stopTurnTarget).toEqual({
      source: 'conversation-view',
      conversationRef: 'conv-dashboard',
      turnRef: 'turn-view',
      canStop: true,
    });
    expect(selected.chatSurfaceState).toEqual({
      messages: [],
      conversationView: view,
      pendingTurn: null,
      sdkLiveTurn: null,
    });
    expect(selected.chatSurfaceState).not.toHaveProperty('currentTurnProjection');
  });

  test('defaults optional active-workspace fields when not present', () => {
    const selected = selectChatInterfaceState({
      messages: [],
      isSending: false,
      thinkingStatus: null,
    });

    expect(selected).toEqual(expect.objectContaining({
      thinkingStatus: null,
      thinkingSourceEventType: null,
      compactionDebugInfo: null,
      tokenCounts: null,
      activeRevisionId: null,
      renderedMessages: [],
      stopTurnTarget: {
        source: 'idle',
        conversationRef: null,
        turnRef: null,
        canStop: false,
      },
    }));
    expect(selected).not.toHaveProperty('messages');
    expect(selected).not.toHaveProperty('currentTurnProjection');
    expect(selected).not.toHaveProperty('conversationView');
    expect(selected).not.toHaveProperty('streamTracking');
  });

});
