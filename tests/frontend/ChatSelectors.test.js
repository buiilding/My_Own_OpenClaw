/**
 * Covers chat selectors. behavior in the frontend test suite.
 */

import {
  selectChatInterfaceState,
  selectLiveTurnSurfaceState,
} from '../../frontend/src/renderer/features/chat/stores/chatStore';
import { DesktopChatSurfaceSelectorRuntime } from '../../frontend/src/renderer/app/runtime/desktopChatSurfaceSelectorRuntime';

const {
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
    const liveProjection = { turnRef: 'live-turn' };

    expect(projectDesktopChatInterfaceState(activeWorkspace)).toEqual({
      messages: activeWorkspace.messages,
      thinkingStatus: 'thinking',
      thinkingSourceEventType: 'reasoning_delta',
      compactionDebugInfo: activeWorkspace.compactionDebugInfo,
      tokenCounts: activeWorkspace.tokenCounts,
      streamTracking: activeWorkspace.streamTracking,
      currentTurnProjection: activeWorkspace.currentTurnProjection,
      pendingTurn: activeWorkspace.pendingTurn,
    });
    expect(projectDesktopLiveTurnSurfaceState({
      activeWorkspace,
      latestCurrentTurnProjection: liveProjection,
    })).toEqual(expect.objectContaining({
      currentTurnProjection: liveProjection,
      isSending: true,
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
      streamTracking: state.streamTracking,
      currentTurnProjection: null,
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
    expect(chatInterface.tokenCounts).toBe(tokenCounts);
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

  test('selects latest SDK live turn for minimal surfaces over active workspace projection', () => {
    const workspaceProjection = {
      conversationRef: 'conv-dashboard',
      turnRef: 'turn-dashboard',
      phase: 'awaiting',
      assistantText: '',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
    };
    const liveProjection = {
      conversationRef: 'conv-live',
      turnRef: 'turn-live',
      phase: 'streaming',
      assistantText: 'live answer',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
    };
    const selected = selectLiveTurnSurfaceState({
      messages: [],
      isSending: true,
      thinkingStatus: null,
      currentTurnProjection: workspaceProjection,
      latestCurrentTurnProjection: liveProjection,
      tokenCounts: null,
      streamTracking: { phase: 'awaiting-first-chunk' },
    });

    expect(selected.currentTurnProjection).toBe(liveProjection);
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
    }));
    expect(selected.streamTracking).toEqual(expect.objectContaining({
      phase: 'idle',
    }));
  });

});
