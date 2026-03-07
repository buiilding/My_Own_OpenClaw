import type { StreamTracking } from '../../frontend/src/renderer/features/chat/stores/chatStore';
import {
  createInitialWorkspaceState,
  normalizeConversationRef,
  readWorkspaceState,
  resolveChatWorkspaceRef,
  resolveWorkspaceConversationRef,
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

  test('resolves workspace conversation refs using explicit then active value', () => {
    expect(resolveWorkspaceConversationRef(' ref-1 ', 'active-ref')).toBe('ref-1');
    expect(resolveWorkspaceConversationRef(undefined, ' active-ref ')).toBe('active-ref');
    expect(resolveWorkspaceConversationRef(undefined, null)).toBeNull();
    expect(resolveWorkspaceKey(undefined, ' active-ref ')).toBe('active-ref');
    expect(resolveWorkspaceKey(undefined, null)).toBe('__default__');
  });

  test('returns active root snapshot when active workspace entry is stale', () => {
    const staleWorkspace = {
      ...createInitialWorkspaceState(),
      messages: [{ id: 'stale', text: 'stale', sender: 'assistant' as const }],
    };
    const rootMessages = [{ id: 'root', text: 'root', sender: 'assistant' as const }];
    const state = {
      activeConversationRef: 'thread-1',
      workspaces: {
        'thread-1': staleWorkspace,
      },
      messages: rootMessages,
      isSending: true,
      thinkingStatus: 'thinking',
      thinkingSourceEventType: 'llm-thought',
      tokenCounts: { total_tokens: 4 },
      streamTracking: createStreamTracking({ phase: 'streaming', eventCount: 2 }),
    };

    const resolved = readWorkspaceState(state, 'thread-1');
    expect(resolved.messages).toBe(rootMessages);
    expect(resolved.isSending).toBe(true);
    expect(resolved.thinkingStatus).toBe('thinking');
    expect(resolved.streamTracking.phase).toBe('streaming');
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

  test('selects active workspace through the shared active-workspace projection', () => {
    const staleWorkspace = {
      ...createInitialWorkspaceState(),
      messages: [{ id: 'stale', text: 'stale', sender: 'assistant' as const }],
    };
    const rootMessages = [{ id: 'root', text: 'root', sender: 'assistant' as const }];
    const state = {
      activeConversationRef: 'thread-1',
      workspaces: {
        'thread-1': staleWorkspace,
      },
      messages: rootMessages,
      isSending: true,
      thinkingStatus: 'thinking',
      thinkingSourceEventType: 'llm-thought',
      tokenCounts: { total_tokens: 4 },
      streamTracking: createStreamTracking({ phase: 'streaming', eventCount: 2 }),
    };

    const resolved = selectActiveWorkspaceState(state);
    expect(resolved.messages).toBe(rootMessages);
    expect(resolved.isSending).toBe(true);
    expect(resolved.thinkingStatus).toBe('thinking');
    expect(resolved.streamTracking.phase).toBe('streaming');
  });
});
