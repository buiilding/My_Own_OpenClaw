/**
 * Covers chat workspace state. behavior in the frontend test suite.
 */

import type { StreamTracking } from '../../frontend/src/renderer/features/chat/stores/chatStore';
import {
  buildActiveConversationWorkspaceUpdate,
  buildWorkspaceUpdate,
  createInitialWorkspaceRecord,
  createInitialWorkspaceState,
  getProjectedWorkspaceFields,
  isActiveWorkspaceRef,
  normalizeConversationRef,
  readWorkspaceState,
  resolveChatWorkspaceRef,
  resolveWorkspaceConversationRef,
  resolveWorkspaceMutationTarget,
  resolveWorkspaceKey,
  selectActiveWorkspaceState,
} from '../../frontend/src/renderer/features/chat/stores/chatWorkspaceState';

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

  test('projects workspace fields through the shared workspace helper', () => {
    const workspace = {
      ...createInitialWorkspaceState(),
      messages: [{ id: 'm-1', text: 'hello', sender: 'user' as const }],
      isSending: true,
      thinkingStatus: 'thinking',
      streamTracking: createStreamTracking({ phase: 'awaiting-first-chunk' }),
    };

    expect(getProjectedWorkspaceFields(workspace)).toEqual(expect.objectContaining({
      messages: workspace.messages,
      isSending: true,
      thinkingStatus: 'thinking',
      streamTracking: workspace.streamTracking,
      currentTurnProjection: null,
      conversationView: null,
      pendingTurn: null,
    }));
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
      latestConversationView: null,
    })).toEqual({
      workspaces: {
        'inactive-thread': workspace,
      },
      latestConversationView: null,
    });
  });

  test('builds workspace updates with active workspace projection', () => {
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

    expect(buildWorkspaceUpdate(state, 'active-thread', workspace)).toEqual(expect.objectContaining({
      workspaces: {
        'active-thread': workspace,
      },
      messages: workspace.messages,
      isSending: true,
    }));
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
      ...getProjectedWorkspaceFields(activeWorkspace),
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
      latestConversationView: null,
    };

    expect(buildActiveConversationWorkspaceUpdate(state, ' next-thread ')).toEqual(expect.objectContaining({
      activeConversationRef: 'next-thread',
      workspaces: state.workspaces,
      messages: nextWorkspace.messages,
      conversationView: nextWorkspace.conversationView,
      latestConversationView: nextWorkspace.conversationView,
    }));
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
