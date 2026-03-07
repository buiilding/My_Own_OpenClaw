import { useChatStore } from '../../frontend/src/renderer/features/chat/stores/chatStore';
import {
  resolveExecutionConversationRef,
  shouldAcceptExecutionResult,
} from '../../frontend/src/renderer/features/chat/utils/toolRunner/toolRunnerExecutionState';

describe('toolRunnerExecutionState', () => {
  beforeEach(() => {
    useChatStore.setState((state) => ({
      ...state,
      workspaces: {
        ...state.workspaces,
        'conv-a': {
          ...state.getWorkspaceState('conv-a'),
          streamTracking: {
            ...state.getWorkspaceState('conv-a').streamTracking,
            activeTurnRef: 'turn-a',
            phase: 'streaming',
          },
        },
      },
    }));
  });

  test('resolves tracked execution conversation by correlation id', () => {
    const tracked = new Map<string, any>([
      ['corr-1', { turnRef: 'turn-a', conversationRef: 'conv-a' }],
    ]);
    expect(resolveExecutionConversationRef(tracked, 'corr-1')).toBe('conv-a');
    expect(resolveExecutionConversationRef(tracked, 'missing')).toBeNull();
  });

  test('accepts tracked execution while turn is active and streaming', () => {
    const tracked = new Map<string, any>([
      ['corr-2', { turnRef: 'turn-a', conversationRef: 'conv-a' }],
    ]);
    expect(shouldAcceptExecutionResult(tracked, 'corr-2')).toBe(true);
    expect(tracked.has('corr-2')).toBe(true);
  });

  test('drops tracked execution when active turn diverges', () => {
    const tracked = new Map<string, any>([
      ['corr-3', { turnRef: 'turn-old', conversationRef: 'conv-a' }],
    ]);
    expect(shouldAcceptExecutionResult(tracked, 'corr-3')).toBe(false);
    expect(tracked.has('corr-3')).toBe(false);
  });

  test('drops tracked execution when turn is terminal', () => {
    useChatStore.setState((state) => ({
      ...state,
      workspaces: {
        ...state.workspaces,
        'conv-a': {
          ...state.getWorkspaceState('conv-a'),
          streamTracking: {
            ...state.getWorkspaceState('conv-a').streamTracking,
            activeTurnRef: 'turn-a',
            phase: 'complete',
          },
        },
      },
    }));
    const tracked = new Map<string, any>([
      ['corr-4', { turnRef: 'turn-a', conversationRef: 'conv-a' }],
    ]);
    expect(shouldAcceptExecutionResult(tracked, 'corr-4')).toBe(false);
    expect(tracked.has('corr-4')).toBe(false);
  });

  test('keeps tracked execution during terminal handoff when current turn still has an incomplete assistant placeholder', () => {
    useChatStore.setState((state) => ({
      ...state,
      workspaces: {
        ...state.workspaces,
        'conv-a': {
          ...state.getWorkspaceState('conv-a'),
          isSending: true,
          messages: [
            {
              id: 'assistant-placeholder',
              sender: 'assistant',
              text: '',
              type: 'llm-text',
              isComplete: false,
              turnRef: 'turn-a',
              sourceEventType: 'streaming-response',
            },
          ],
          streamTracking: {
            ...state.getWorkspaceState('conv-a').streamTracking,
            activeTurnRef: 'turn-a',
            phase: 'complete',
          },
        },
      },
    }));
    const tracked = new Map<string, any>([
      ['corr-5', { turnRef: 'turn-a', conversationRef: 'conv-a' }],
    ]);

    expect(shouldAcceptExecutionResult(tracked, 'corr-5')).toBe(true);
    expect(tracked.has('corr-5')).toBe(true);
  });
});
