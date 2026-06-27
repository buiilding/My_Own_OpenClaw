/**
 * Covers chat workspace state. behavior in the frontend test suite.
 */

import type { StreamTracking } from '../../src/renderer/features/chat/stores/chatStore';
import {
  buildActiveConversationWorkspaceUpdate,
  buildNoViewSdkLiveTurnStorageUpdate,
  buildWorkspaceUpdate,
  createInitialWorkspaceRecord,
  createInitialWorkspaceState,
  isActiveWorkspaceRef,
  normalizeConversationRef,
  projectWorkspaceReadModelState,
  readNoViewSdkLiveTurnStorage,
  readWorkspaceState,
  resolveChatWorkspaceRef,
  resolveWorkspaceConversationRef,
  resolveWorkspaceMutationTarget,
  resolveWorkspaceKey,
  selectActiveWorkspaceReadModelState,
  selectActiveWorkspaceState,
} from '../../src/renderer/app/runtime/desktopChatWorkspaceStateRuntime';

function createStreamTracking(overrides: Partial<StreamTracking> = {}): StreamTracking {
  return {
    activeTurnRef: null,
    phase: 'idle',
    startedAt: null,
    firstChunkAt: null,
    completedAt: null,
    lastEventAt: null,
    lastEventType: null,
    eventCount: 0,
    chunkCount: 0,
    toolCallCount: 0,
    toolOutputCount: 0,
    lastChunkSize: 0,
    lastError: null,
    ...overrides,
  };
}

describe('chatWorkspaceState', () => {
  test('normalizes conversation refs and falls back for empty values', () => {
    expect(normalizeConversationRef(' conversation-1 ')).toBe('conversation-1');
    expect(normalizeConversationRef('   ')).toBeNull();
    expect(normalizeConversationRef(undefined)).toBeNull();
    expect(resolveChatWorkspaceRef(' conversation-2 ')).toBe('conversation-2');
    expect(resolveChatWorkspaceRef('')).toBe('__default__');
  });

  test('creates the default workspace record through the workspace-state owner', () => {
    expect(createInitialWorkspaceRecord()).toEqual({
      __default__: expect.objectContaining({
        messages: [],
        isSending: false,
        thinkingStatus: null,
        streamTracking: expect.objectContaining({
          phase: 'idle',
        }),
      }),
    });
  });

  test('resolves workspace conversation refs using explicit then active value', () => {
    expect(resolveWorkspaceConversationRef(' ref-1 ', 'active-ref')).toBe('ref-1');
    expect(resolveWorkspaceConversationRef(undefined, ' active-ref ')).toBe('active-ref');
    expect(resolveWorkspaceConversationRef(undefined, null)).toBeNull();
    expect(resolveWorkspaceKey(undefined, ' active-ref ')).toBe('active-ref');
    expect(resolveWorkspaceKey(undefined, null)).toBe('__default__');
  });

  test('returns workspace record when active top-level mirror is stale', () => {
    const workspace = {
      ...createInitialWorkspaceState(),
      messages: [{ id: 'workspace', text: 'workspace', sender: 'assistant' as const }],
    };
    const rootMessages = [{ id: 'root', text: 'root', sender: 'assistant' as const }];
    const state = {
      activeConversationRef: 'thread-1',
      workspaces: {
        'thread-1': workspace,
      },
      messages: rootMessages,
      isSending: true,
      thinkingStatus: 'thinking',
      thinkingSourceEventType: 'llm-thought',
      tokenCounts: { total_tokens: 4 },
      streamTracking: createStreamTracking({ phase: 'streaming', eventCount: 2 }),
    };

    const resolved = readWorkspaceState(state, 'thread-1');
    expect(resolved).toBe(workspace);
    expect(resolved.messages).toEqual([
      { id: 'workspace', text: 'workspace', sender: 'assistant' },
    ]);
    expect(resolved.isSending).toBe(false);
    expect(resolved.thinkingStatus).toBeNull();
    expect(resolved.streamTracking.phase).toBe('idle');
  });

  test('returns initial workspace when active workspace is missing despite top-level mirror', () => {
    const state = {
      activeConversationRef: 'active-thread',
      workspaces: {},
      messages: [{ id: 'root', text: 'root', sender: 'assistant' as const }],
      isSending: true,
      thinkingStatus: 'thinking',
      thinkingSourceEventType: 'llm-thought',
      tokenCounts: { total_tokens: 4 },
      streamTracking: createStreamTracking({ phase: 'streaming', eventCount: 2 }),
    };

    const resolved = readWorkspaceState(state, 'active-thread');
    expect(resolved).toEqual(expect.objectContaining({
      messages: [],
      isSending: false,
      thinkingStatus: null,
      thinkingSourceEventType: null,
      tokenCounts: null,
      streamTracking: expect.objectContaining({
        phase: 'idle',
        eventCount: 0,
      }),
    }));
  });

  test('returns initial workspace when inactive workspace is missing', () => {
    const state = {
      activeConversationRef: 'active-thread',
      workspaces: {},
      messages: [{ id: 'm-1', text: 'active', sender: 'assistant' as const }],
      isSending: true,
      thinkingStatus: 'thinking',
      thinkingSourceEventType: 'streaming-response',
      tokenCounts: { total_tokens: 10 },
      streamTracking: createStreamTracking({ phase: 'streaming' }),
    };

    const missingWorkspace = readWorkspaceState(state, 'inactive-thread');

    expect(missingWorkspace).toEqual(expect.objectContaining({
      messages: [],
      isSending: false,
      thinkingStatus: null,
      thinkingSourceEventType: null,
      tokenCounts: null,
      streamTracking: expect.objectContaining({
        phase: 'idle',
        eventCount: 0,
      }),
    }));
  });

  test('selects active workspace from the workspace record, not top-level mirrors', () => {
    const workspace = {
      ...createInitialWorkspaceState(),
      messages: [{ id: 'workspace', text: 'workspace', sender: 'assistant' as const }],
    };
    const rootMessages = [{ id: 'root', text: 'root', sender: 'assistant' as const }];
    const state = {
      activeConversationRef: 'thread-1',
      workspaces: {
        'thread-1': workspace,
      },
      messages: rootMessages,
      isSending: true,
      thinkingStatus: 'thinking',
      thinkingSourceEventType: 'llm-thought',
      tokenCounts: { total_tokens: 4 },
      streamTracking: createStreamTracking({ phase: 'streaming', eventCount: 2 }),
    };

    const resolved = selectActiveWorkspaceState(state);
    expect(resolved).toBe(workspace);
    expect(resolved.messages).toEqual([
      { id: 'workspace', text: 'workspace', sender: 'assistant' },
    ]);
    expect(resolved.isSending).toBe(false);
    expect(resolved.thinkingStatus).toBeNull();
    expect(resolved.streamTracking.phase).toBe('idle');
  });

  test('projects no-view workspace read model with only sdk live-turn fallback', () => {
    const workspace = {
      ...createInitialWorkspaceState(),
      messages: [{ id: 'workspace', text: 'workspace', sender: 'assistant' as const }],
      sdkLiveTurn: { turnRef: 'turn-raw' } as never,
    };
    const state = {
      activeConversationRef: 'thread-1',
      workspaces: {
        'thread-1': workspace,
      },
    };

    const readModel = projectWorkspaceReadModelState(workspace);

    expect(readModel).not.toBe(workspace);
    expect(readModel.messages).toBe(workspace.messages);
    expect(readModel).not.toHaveProperty('currentTurnProjection');
    expect(readModel.sdkLiveTurn).toBe(workspace.sdkLiveTurn);
    expect(readModel.rendererAnnotations).toEqual([]);
    expect(selectActiveWorkspaceReadModelState(state)).toBe(readModel);
  });

  test('centralizes no-view SDK live-turn storage access', () => {
    const sdkLiveTurn = { turnRef: 'turn-sdk' } as never;
    const workspace = {
      ...createInitialWorkspaceState(),
      sdkLiveTurn: sdkLiveTurn,
    };

    expect(readNoViewSdkLiveTurnStorage(workspace)).toBe(sdkLiveTurn);
    expect(buildNoViewSdkLiveTurnStorageUpdate(workspace, null)).toEqual({
      ...workspace,
      sdkLiveTurn: null,
    });
  });

  test('projects ConversationView workspace read model without raw fallback authorities', () => {
    const conversationView = {
      conversationRef: 'thread-1',
      displayRows: [{ id: 'sdk-row', role: 'user' }],
      liveTurn: null,
      surfaces: {
        pill: { mode: 'idle' },
      },
    };
    const pendingTurn = {
      conversationRef: 'thread-1',
      turnRef: 'turn-pending',
      userMessageId: 'pending-user',
    };
    const workspace = {
      ...createInitialWorkspaceState(),
      messages: [{
        id: 'sdk-row',
        text: 'raw fallback',
        sender: 'user' as const,
        fullUserMessage: 'full prompt',
        feedback: 'like',
      }],
      sdkLiveTurn: { turnRef: 'turn-raw' } as never,
      conversationView,
      pendingTurn: pendingTurn as never,
    };
    const state = {
      activeConversationRef: 'thread-1',
      workspaces: {
        'thread-1': workspace,
      },
    };

    const readModel = projectWorkspaceReadModelState(workspace);
    const selectedReadModel = selectActiveWorkspaceReadModelState(state);

    expect(readModel).not.toBe(workspace);
    expect(readModel.messages).toEqual([]);
    expect(readModel).not.toHaveProperty('currentTurnProjection');
    expect(readModel.sdkLiveTurn).toBeNull();
    expect(readModel.conversationView).toBe(conversationView);
    expect(readModel.pendingTurn).toBe(pendingTurn);
    expect(readModel.rendererAnnotations).toEqual([{
      id: 'sdk-row',
      feedback: 'like',
    }]);
    expect(selectedReadModel).toBe(readModel);
    expect(projectWorkspaceReadModelState(workspace)).toBe(readModel);
  });

  test('builds workspace updates without projecting inactive workspace fields', () => {
    const workspace = {
      ...createInitialWorkspaceState(),
      messages: [{ id: 'inactive', text: 'inactive', sender: 'assistant' as const }],
    };
    const state = {
      activeConversationRef: 'active-thread',
      workspaces: {},
      messages: [{ id: 'active', text: 'active', sender: 'assistant' as const }],
    };

    expect(isActiveWorkspaceRef(state, 'active-thread')).toBe(true);
    expect(isActiveWorkspaceRef(state, 'inactive-thread')).toBe(false);
    expect(buildWorkspaceUpdate(state, 'inactive-thread', workspace, {
      extraUiState: true,
    })).toEqual({
      workspaces: {
        'inactive-thread': workspace,
      },
      extraUiState: true,
    });
  });

  test('builds workspace updates without projecting active workspace fields', () => {
    const workspace = {
      ...createInitialWorkspaceState(),
      messages: [{ id: 'active-next', text: 'next', sender: 'assistant' as const }],
      isSending: true,
    };
    const state = {
      activeConversationRef: 'active-thread',
      workspaces: {},
      messages: [{ id: 'active-prev', text: 'prev', sender: 'assistant' as const }],
    };

    expect(buildWorkspaceUpdate(state, 'active-thread', workspace)).toEqual({
      workspaces: {
        'active-thread': workspace,
      },
    });
  });

  test('resolves workspace mutation targets from explicit and active refs', () => {
    const activeWorkspace = {
      ...createInitialWorkspaceState(),
      messages: [{ id: 'active', text: 'active', sender: 'assistant' as const }],
    };
    const otherWorkspace = {
      ...createInitialWorkspaceState(),
      messages: [{ id: 'other', text: 'other', sender: 'assistant' as const }],
    };
    const state = {
      activeConversationRef: 'active-thread',
      workspaces: {
        'active-thread': activeWorkspace,
        'other-thread': otherWorkspace,
      },
    };

    expect(resolveWorkspaceMutationTarget(state, undefined)).toEqual({
      normalizedConversationRef: 'active-thread',
      workspaceRef: 'active-thread',
      workspace: activeWorkspace,
    });
    expect(resolveWorkspaceMutationTarget(state, ' other-thread ')).toEqual({
      normalizedConversationRef: 'other-thread',
      workspaceRef: 'other-thread',
      workspace: otherWorkspace,
    });
  });

  test('builds active conversation workspace switch updates', () => {
    const nextWorkspace = {
      ...createInitialWorkspaceState(),
      messages: [{ id: 'next', text: 'next', sender: 'assistant' as const }],
      conversationView: {
        conversationRef: 'next-thread',
        rows: [],
        actions: {
          canEdit: false,
          canRetry: false,
        },
        revisions: [],
        activeRevisionId: null,
        liveTurn: null,
      },
    };
    const state = {
      activeConversationRef: 'active-thread',
      workspaces: {
        'next-thread': nextWorkspace,
      },
      messages: [{ id: 'active', text: 'active', sender: 'assistant' as const }],
    };

    expect(buildActiveConversationWorkspaceUpdate(state, ' next-thread ')).toEqual({
      activeConversationRef: 'next-thread',
      workspaces: state.workspaces,
    });
  });

  test('keeps active conversation switch as no-op when workspace already exists', () => {
    const workspace = {
      ...createInitialWorkspaceState(),
      messages: [{ id: 'active', text: 'active', sender: 'assistant' as const }],
    };
    const state = {
      activeConversationRef: 'active-thread',
      workspaces: {
        'active-thread': workspace,
      },
      messages: [{ id: 'stale-root', text: 'stale-root', sender: 'assistant' as const }],
      isSending: true,
    };

    expect(buildActiveConversationWorkspaceUpdate(state, 'active-thread')).toBe(state);
  });
});
