/**
 * Covers chat workspace state. behavior in the frontend test suite.
 */

import type { StreamTracking } from '../../frontend/src/renderer/features/chat/stores/chatStore';
import type { ConversationView } from '../../frontend/src/renderer/app/runtime/desktopConversationRuntimeContracts';
import {
  buildActiveConversationWorkspaceUpdate,
  buildNoViewSdkLiveTurnStorageUpdate,
  buildWorkspaceUpdate,
  createInitialWorkspaceRecord,
  createInitialWorkspaceState,
  normalizeConversationRef,
  projectWorkspaceReadModelState,
  readNoViewSdkLiveTurnStorage,
  readWorkspaceState,
  resolveChatWorkspaceRef,
  resolveWorkspaceConversationRef,
  resolveWorkspaceMutationTarget,
  resolveWorkspaceKey,
  selectActiveWorkspaceReadModelState,
} from '../../frontend/src/renderer/app/runtime/desktopChatWorkspaceStateRuntime';

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

function buildConversationView(
  conversationRef: string,
  overrides: Partial<ConversationView> = {},
): ConversationView {
  const base: ConversationView = {
    conversationRef,
    revisionId: null,
    displayRows: [],
    liveTurn: {
      turnRef: null,
      phase: 'idle',
      entries: [],
      isBusy: false,
      isTerminal: true,
      canStop: false,
    },
    surfaces: {
      pill: { mode: 'idle' },
      dashboard: { mode: 'idle' },
      responseOverlay: {
        mode: 'hidden',
        visible: false,
        guardRef: null,
        ownerConversationRef: conversationRef,
        turnRef: null,
      },
    },
    actions: {
      canEdit: false,
      canRetry: false,
      canFork: false,
    },
  };
  return {
    ...base,
    ...overrides,
    liveTurn: overrides.liveTurn ?? base.liveTurn,
    surfaces: {
      ...base.surfaces,
      ...overrides.surfaces,
    },
    actions: {
      ...base.actions,
      ...overrides.actions,
    },
  };
}

describe('chatWorkspaceState', () => {
  test('normalizes conversation refs and falls back for empty values', () => {
    expect(normalizeConversationRef('conversation-1')).toBe('conversation-1');
    expect(normalizeConversationRef(' conversation-1 ')).toBeNull();
    expect(normalizeConversationRef('   ')).toBeNull();
    expect(normalizeConversationRef(undefined)).toBeNull();
    expect(resolveChatWorkspaceRef('conversation-2')).toBe('conversation-2');
    expect(resolveChatWorkspaceRef(' conversation-2 ')).toBe('__default__');
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
    expect(resolveWorkspaceConversationRef('ref-1', 'active-ref')).toBe('ref-1');
    expect(resolveWorkspaceConversationRef(' ref-1 ', 'active-ref')).toBeNull();
    expect(resolveWorkspaceConversationRef(undefined, 'active-ref')).toBe('active-ref');
    expect(resolveWorkspaceConversationRef(undefined, ' active-ref ')).toBeNull();
    expect(resolveWorkspaceConversationRef(undefined, null)).toBeNull();
    expect(resolveWorkspaceKey(undefined, 'active-ref')).toBe('active-ref');
    expect(resolveWorkspaceKey(undefined, ' active-ref ')).toBe('__default__');
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
    expect(readModel).not.toHaveProperty('isSending');
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
    const conversationView = buildConversationView('thread-1', {
      displayRows: [{ id: 'sdk-row', role: 'assistant' }],
    } as never);
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
        sender: 'assistant' as const,
        fullAssistantMessage: 'full response',
        feedback: 'dislike',
      }],
      rendererAnnotations: [{
        id: 'sdk-row',
        feedback: 'like' as const,
      }],
      thinkingStatus: 'Compacting conversation history...',
      thinkingSourceEventType: 'compaction_started',
      compactionDebugInfo: { strategy: 'summarize' } as never,
      tokenCounts: { total_tokens: 42 },
      streamTracking: createStreamTracking({ phase: 'streaming' }),
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
    expect(readModel).not.toHaveProperty('isSending');
    expect(readModel).not.toHaveProperty('currentTurnProjection');
    expect(readModel.sdkLiveTurn).toBeNull();
    expect(readModel.thinkingStatus).toBeNull();
    expect(readModel.thinkingSourceEventType).toBeNull();
    expect(readModel.compactionDebugInfo).toBeNull();
    expect(readModel.tokenCounts).toBeNull();
    expect(readModel.streamTracking).toEqual(expect.objectContaining({
      phase: 'idle',
      activeTurnRef: null,
      eventCount: 0,
    }));
    expect(readModel.streamTracking).not.toBe(workspace.streamTracking);
    expect(readModel.conversationView).toBe(conversationView);
    expect(readModel.pendingTurn).toBe(pendingTurn);
    expect(readModel.rendererAnnotations).toEqual([{
      id: 'sdk-row',
      feedback: 'like',
    }]);
    expect(selectedReadModel).toBe(readModel);
    expect(projectWorkspaceReadModelState(workspace)).toBe(readModel);
  });

  test('keeps empty renderer annotations stable across raw message churn with ConversationView', () => {
    const conversationView = buildConversationView('thread-1', {
      displayRows: [{ id: 'sdk-row', role: 'assistant' }],
    } as never);
    const firstWorkspace = {
      ...createInitialWorkspaceState(),
      conversationView,
      messages: [{
        id: 'raw-a',
        text: 'raw fallback a',
        sender: 'assistant' as const,
      }],
    };
    const secondWorkspace = {
      ...createInitialWorkspaceState(),
      conversationView,
      messages: [{
        id: 'raw-b',
        text: 'raw fallback b',
        sender: 'assistant' as const,
      }],
    };

    const firstReadModel = projectWorkspaceReadModelState(firstWorkspace);
    const secondReadModel = projectWorkspaceReadModelState(secondWorkspace);

    expect(firstReadModel.messages).toEqual([]);
    expect(secondReadModel.messages).toEqual([]);
    expect(firstReadModel.rendererAnnotations).toEqual([]);
    expect(secondReadModel.rendererAnnotations).toBe(firstReadModel.rendererAnnotations);
    expect(secondReadModel.streamTracking).toBe(firstReadModel.streamTracking);
  });

  test('does not let display timeline rows claim ConversationView read-model authority', () => {
    const workspace = {
      ...createInitialWorkspaceState(),
      messages: [{ id: 'raw-row', text: 'raw fallback', sender: 'assistant' as const }],
      sdkLiveTurn: { turnRef: 'turn-raw' } as never,
      conversationView: {
        conversationRef: 'thread-1',
        rows: [],
      } as never,
    };

    const readModel = projectWorkspaceReadModelState(workspace);

    expect(readModel.messages).toBe(workspace.messages);
    expect(readModel.sdkLiveTurn).toBe(workspace.sdkLiveTurn);
    expect(readModel.rendererAnnotations).toEqual([]);
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
    expect(resolveWorkspaceMutationTarget(state, 'other-thread')).toEqual({
      normalizedConversationRef: 'other-thread',
      workspaceRef: 'other-thread',
      workspace: otherWorkspace,
    });
    expect(resolveWorkspaceMutationTarget(state, ' other-thread ')).toEqual({
      normalizedConversationRef: null,
      workspaceRef: '__default__',
      workspace: expect.objectContaining({
        messages: [],
      }),
    });
  });

  test('builds active conversation workspace switch updates', () => {
    const nextWorkspace = {
      ...createInitialWorkspaceState(),
      messages: [{ id: 'next', text: 'next', sender: 'assistant' as const }],
      conversationView: buildConversationView('next-thread'),
    };
    const state = {
      activeConversationRef: 'active-thread',
      workspaces: {
        'next-thread': nextWorkspace,
      },
      messages: [{ id: 'active', text: 'active', sender: 'assistant' as const }],
    };

    expect(buildActiveConversationWorkspaceUpdate(state, 'next-thread')).toEqual({
      activeConversationRef: 'next-thread',
      workspaces: state.workspaces,
    });
    expect(buildActiveConversationWorkspaceUpdate(state, ' next-thread ')).toEqual({
      activeConversationRef: null,
      workspaces: {
        ...state.workspaces,
        __default__: expect.objectContaining({
          messages: [],
        }),
      },
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
