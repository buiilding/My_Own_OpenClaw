/**
 * Covers chat stream thinking status.state. behavior in the frontend test suite.
 */

import { act } from '@testing-library/react';
import {
  useChatStore,
} from '../../src/renderer/features/chat/stores/chatStore';
import {
  setNoViewSdkLiveTurnInChatStore,
  setThinkingSourceEventTypeInChatStore,
  setThinkingStatusInChatStore,
  updateStreamTrackingInChatStore,
} from '../../src/renderer/features/chat/stores/chatStoreAdapters';
import {
  getActiveWorkspaceStateForTest,
  registerBackendAndProjectionListeners,
  registerBackendListener,
  resetChatStreamTestState,
  setActiveWorkspaceStateForTest,
  setMockConfig,
} from './ChatStreamThinkingStatus.testUtils';

describe('useChatStream state + stream handling', () => {
  beforeEach(() => {
    resetChatStreamTestState();
  });

  test('preserves thinking status on streaming response chunks', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      setActiveWorkspaceStateForTest({ thinkingStatus: 'thinking' });
      emitBackendEvent({
        type: 'streaming-response',
        payload: { text: 'hi' },
      });
    });

    expect(getActiveWorkspaceStateForTest().thinkingStatus).toBe('thinking');
  });

  test('does not update thinking status from raw llm-thought events', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      setActiveWorkspaceStateForTest({ thinkingStatus: null });
      emitBackendEvent({
        type: 'llm-thought',
        payload: { status: 'thinking...' },
      });
    });

    expect(getActiveWorkspaceStateForTest().thinkingStatus).toBeNull();
  });

  test('ignores stale llm-thought event when a newer active turn is in progress', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      setActiveWorkspaceStateForTest({
        messages: [
          {
            id: 'assistant-new-turn',
            text: '',
            sender: 'assistant',
            type: 'llm-text',
            isComplete: false,
            turnRef: 'turn-new',
            thinkingText: 'current step',
            thinkingSourceEventType: 'llm-thought',
          },
        ],
        thinkingStatus: 'current step',
        thinkingSourceEventType: 'llm-thought',
        streamTracking: {
          activeTurnRef: 'turn-new',
          phase: 'streaming',
          startedAt: '2026-03-05T00:00:00.000Z',
          firstChunkAt: '2026-03-05T00:00:01.000Z',
          completedAt: null,
          lastEventAt: '2026-03-05T00:00:01.000Z',
          lastEventType: 'streaming-response',
          eventCount: 2,
          chunkCount: 1,
          toolCallCount: 0,
          toolOutputCount: 0,
          lastChunkSize: 7,
          lastError: null,
        },
      });

      emitBackendEvent({
        type: 'llm-thought',
        turn_ref: 'turn-old',
        payload: { status: 'stale step' },
      });
    });

    const state = getActiveWorkspaceStateForTest();
    expect(state.thinkingStatus).toBe('current step');
    expect(state.thinkingSourceEventType).toBe('llm-thought');
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toEqual(
      expect.objectContaining({
        id: 'assistant-new-turn',
        turnRef: 'turn-new',
        thinkingText: 'current step',
      }),
    );
    expect(state.streamTracking).toEqual(
      expect.objectContaining({
        activeTurnRef: 'turn-new',
        phase: 'streaming',
        eventCount: 2,
      }),
    );
  });

  test('stores stale SDK current-turn projection while guarding derived side effects', () => {
    const { emitConversationRuntimeUpdated } = registerBackendAndProjectionListeners();

    act(() => {
      const store = useChatStore.getState();
      setNoViewSdkLiveTurnInChatStore({
        conversationRef: 'conv-test',
        turnRef: 'turn-new',
        phase: 'streaming',
        assistantText: 'current answer',
        reasoningText: 'current step',
        toolEvents: [],
        lastError: null,
      }, 'conv-test');
      setThinkingStatusInChatStore('current step', 'conv-test');
      setThinkingSourceEventTypeInChatStore('llm-thought', 'conv-test');
      updateStreamTrackingInChatStore(() => ({
        activeTurnRef: 'turn-new',
        phase: 'streaming',
        startedAt: '2026-03-05T00:00:00.000Z',
        firstChunkAt: '2026-03-05T00:00:01.000Z',
        completedAt: null,
        lastEventAt: '2026-03-05T00:00:01.000Z',
        lastEventType: 'streaming-response',
        eventCount: 2,
        chunkCount: 1,
        toolCallCount: 0,
        toolOutputCount: 0,
        lastChunkSize: 14,
        lastError: null,
      }), 'conv-test');

      emitConversationRuntimeUpdated({
        conversationRef: 'conv-test',
        currentTurn: {
          conversationRef: 'conv-test',
          turnRef: 'turn-old',
          phase: 'streaming',
          assistantText: 'stale answer',
          reasoningText: 'stale step',
          toolEvents: [],
          lastError: null,
        },
      });
    });

    const state = getActiveWorkspaceStateForTest();
    expect(state).not.toHaveProperty('latestCurrentTurnProjection');
    expect(state.thinkingStatus).toBe('current step');
    expect(state.streamTracking).toEqual(expect.objectContaining({
      activeTurnRef: 'turn-new',
      eventCount: 2,
    }));
  });

  test('hides typing state when SDK presentation exposes visible thinking content', () => {
    const { emitConversationRuntimeUpdated } = registerBackendAndProjectionListeners();

    act(() => {
      emitConversationRuntimeUpdated({
        conversationRef: 'conv-test',
        currentTurn: {
          conversationRef: 'conv-test',
          turnRef: 'turn-thinking',
          phase: 'awaiting',
          assistantText: '',
          reasoningText: '',
          toolEvents: [],
          lastError: null,
          presentation: {
            conversationRef: 'conv-test',
            turnRef: 'turn-thinking',
            phase: 'awaiting',
            entries: [],
            typingVisible: true,
            overlayVisible: true,
            hasVisibleContent: false,
            isBusy: true,
            isTerminal: false,
            awaitingAnchor: {
              kind: 'user-message',
              rowId: 'user-row-thinking',
              turnRef: 'turn-thinking',
              conversationRef: 'conv-test',
            },
            overlayIntent: {
              visible: true,
              mode: 'awaiting',
              turnRef: 'turn-thinking',
              conversationRef: 'conv-test',
              staleGuardRef: 'turn-thinking',
            },
          },
        },
      });
    });

    expect(getActiveWorkspaceStateForTest().isSending).toBe(true);

    act(() => {
      emitConversationRuntimeUpdated({
        conversationRef: 'conv-test',
        currentTurn: {
          conversationRef: 'conv-test',
          turnRef: 'turn-thinking',
          phase: 'awaiting',
          assistantText: '',
          reasoningText: 'Inspecting the screen.',
          toolEvents: [],
          lastError: null,
          presentation: {
            conversationRef: 'conv-test',
            turnRef: 'turn-thinking',
            phase: 'awaiting',
            entries: [{
              id: 'turn-thinking:thinking:0',
              type: 'thinking',
              text: 'Inspecting the screen.',
              turnRef: 'turn-thinking',
              eventId: null,
              toolName: null,
            }],
            typingVisible: false,
            overlayVisible: true,
            hasVisibleContent: true,
            isBusy: true,
            isTerminal: false,
          },
        },
      });
    });

    expect(getActiveWorkspaceStateForTest()).toEqual(expect.objectContaining({
      isSending: false,
      thinkingStatus: 'Inspecting the screen.',
      thinkingSourceEventType: 'llm-thought',
    }));
  });

  test('does not track live thinking from raw llm-thought events', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      setActiveWorkspaceStateForTest({ messages: [] });
      emitBackendEvent({
        type: 'llm-thought',
        turn_ref: 'turn-live',
        payload: { status: 'drafting plan' },
      });
    });

    const state = getActiveWorkspaceStateForTest();
    expect(state.messages).toEqual([]);
    expect(state.thinkingStatus).toBeNull();
    expect(state.thinkingSourceEventType).toBeNull();
  });

  test('does not track streaming response chunks from backend-wire events', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      setActiveWorkspaceStateForTest({ messages: [], isSending: true });
      emitBackendEvent({
        type: 'llm-thought',
        turn_ref: 'turn-live',
        payload: { status: 'step 1' },
      });
      emitBackendEvent({
        type: 'streaming-response',
        turn_ref: 'turn-live',
        payload: { text: 'Final answer' },
      });
    });

    const state = getActiveWorkspaceStateForTest();
    expect(state.messages).toEqual([]);
    expect(state.isSending).toBe(true);
    expect(state.thinkingStatus).toBeNull();
    expect(state.streamTracking).toEqual(expect.objectContaining({
      activeTurnRef: null,
      phase: 'idle',
      lastEventType: null,
    }));
  });

  test('skips raw live assistant chunks when SDK current-turn projection owns the turn', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      setActiveWorkspaceStateForTest({
        messages: [
          { id: 'user-live', text: 'hello', sender: 'user', turnRef: 'turn-live' },
        ],
        sdkLiveTurn: {
          conversationRef: 'conv-test',
          turnRef: 'turn-live',
          phase: 'streaming',
          assistantText: 'Projected answer',
          reasoningText: null,
          toolEvents: [],
          lastError: null,
        },
      });
      emitBackendEvent({
        type: 'streaming-response',
        turn_ref: 'turn-live',
        payload: { text: 'raw duplicate chunk' },
      });
    });

    expect(getActiveWorkspaceStateForTest().messages).toEqual([
      { id: 'user-live', text: 'hello', sender: 'user', turnRef: 'turn-live' },
    ]);
  });

  test('does not render raw live assistant chunks without an SDK projection', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      setActiveWorkspaceStateForTest({
        messages: [],
        sdkLiveTurn: null,
      });
      emitBackendEvent({
        type: 'streaming-response',
        turn_ref: 'turn-live',
        payload: { text: 'raw chunk without sdk projection' },
      });
    });

    expect(getActiveWorkspaceStateForTest().messages).toEqual([]);
  });

  test('does not commit SDK current-turn projection into message history on completion', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      setActiveWorkspaceStateForTest({
        messages: [
          { id: 'user-live', text: 'hello', sender: 'user', turnRef: 'turn-live' },
        ],
        sdkLiveTurn: {
          conversationRef: 'conv-test',
          turnRef: 'turn-live',
          phase: 'complete',
          assistantText: 'Projected answer',
          reasoningText: 'Projected thought',
          toolEvents: [],
          lastError: null,
        },
      });
      emitBackendEvent({
        type: 'streaming-complete',
        turn_ref: 'turn-live',
        payload: {},
      });
    });

    expect(getActiveWorkspaceStateForTest().messages).toEqual([
      { id: 'user-live', text: 'hello', sender: 'user', turnRef: 'turn-live' },
    ]);
  });

  test('does not consume raw llm-thought content fallback in the renderer stream', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      setActiveWorkspaceStateForTest({ thinkingStatus: null });
      emitBackendEvent({
        type: 'llm-thought',
        payload: { content: 'reasoning step' },
      });
    });

    expect(getActiveWorkspaceStateForTest().thinkingStatus).toBeNull();
  });

  test('shows compacting status while context compaction is running', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      setActiveWorkspaceStateForTest({ thinkingStatus: null });
      emitBackendEvent({
        type: 'context-compaction-started',
        payload: { reason: 'auto-pre', strategy: 'inline' },
      });
    });

    expect(getActiveWorkspaceStateForTest().thinkingStatus).toBe('Compacting conversation history...');
  });

  test('replaces compacting status with compacted status when context compaction completes', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      setActiveWorkspaceStateForTest({ thinkingStatus: 'Compacting conversation history...' });
      emitBackendEvent({
        type: 'context-compaction-completed',
        payload: {
          reason: 'auto-pre',
          strategy: 'inline',
          replacement_history_entries: [
            {
              role: 'assistant',
              content: 'summary',
              message_type: 'context_compaction',
            },
          ],
        },
      });
    });

    expect(getActiveWorkspaceStateForTest().thinkingStatus).toBe('Conversation history compacted.');
    expect(getActiveWorkspaceStateForTest().thinkingSourceEventType).toBe('context-compaction-completed');
  });

  test('clears compaction status when compaction completes with skipped_reason', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      setActiveWorkspaceStateForTest({
        thinkingStatus: 'Compacting conversation history...',
        thinkingSourceEventType: 'context-compaction-started',
      });
      emitBackendEvent({
        type: 'context-compaction-completed',
        payload: { reason: 'manual', strategy: 'inline', skipped_reason: 'below-threshold' },
      });
    });

    expect(getActiveWorkspaceStateForTest().thinkingStatus).toBeNull();
    expect(getActiveWorkspaceStateForTest().thinkingSourceEventType).toBeNull();
  });

  test('replaces compacting status with failure status when context compaction fails', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      setActiveWorkspaceStateForTest({ thinkingStatus: 'Compacting conversation history...' });
      emitBackendEvent({
        type: 'context-compaction-failed',
        payload: { reason: 'auto-pre', strategy: 'inline', error: 'boom' },
      });
    });

    expect(getActiveWorkspaceStateForTest().thinkingStatus).toBe('boom');
    expect(getActiveWorkspaceStateForTest().thinkingSourceEventType).toBe('context-compaction-failed');
  });

  test('ignores stale context-compaction lifecycle events for old turns', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      setActiveWorkspaceStateForTest({
        thinkingStatus: 'current thinking',
        thinkingSourceEventType: 'llm-thought',
        streamTracking: {
          activeTurnRef: 'turn-new',
          phase: 'streaming',
          startedAt: '2026-03-05T00:00:00.000Z',
          firstChunkAt: '2026-03-05T00:00:01.000Z',
          completedAt: null,
          lastEventAt: '2026-03-05T00:00:01.000Z',
          lastEventType: 'streaming-response',
          eventCount: 2,
          chunkCount: 1,
          toolCallCount: 0,
          toolOutputCount: 0,
          lastChunkSize: 7,
          lastError: null,
        },
      });

      emitBackendEvent({
        type: 'context-compaction-started',
        turn_ref: 'turn-old',
        payload: { reason: 'manual', strategy: 'inline' },
      });
      emitBackendEvent({
        type: 'context-compaction-completed',
        turn_ref: 'turn-old',
        payload: { reason: 'manual', strategy: 'inline' },
      });
      emitBackendEvent({
        type: 'context-compaction-failed',
        turn_ref: 'turn-old',
        payload: { reason: 'manual', strategy: 'inline', error: 'stale' },
      });
    });

    expect(getActiveWorkspaceStateForTest().thinkingStatus).toBe('current thinking');
    expect(getActiveWorkspaceStateForTest().thinkingSourceEventType).toBe('llm-thought');
    expect(getActiveWorkspaceStateForTest().streamTracking).toEqual(
      expect.objectContaining({
        activeTurnRef: 'turn-new',
        phase: 'streaming',
        eventCount: 2,
      }),
    );
  });

  test('clears thinking status on SDK projected tool call', () => {
    const { emitConversationRuntimeUpdated } = registerBackendAndProjectionListeners();

    act(() => {
      setActiveWorkspaceStateForTest({ thinkingStatus: 'thinking' });
      emitConversationRuntimeUpdated({
        conversationRef: 'conv-test',
        currentTurn: {
          conversationRef: 'conv-test',
          turnRef: 'turn-tool',
          phase: 'tool_call',
          assistantText: '',
          reasoningText: null,
          toolEvents: [{
            id: 'tool-call-1',
            kind: 'tool_call',
            toolName: 'screenshot',
            payload: { toolName: 'screenshot', args: {} },
          }],
          lastError: null,
        },
      });
    });

    expect(getActiveWorkspaceStateForTest()).toEqual(expect.objectContaining({
      isSending: false,
      thinkingStatus: null,
      thinkingSourceEventType: null,
    }));
    expect(getActiveWorkspaceStateForTest().streamTracking).toEqual(expect.objectContaining({
      activeTurnRef: 'turn-tool',
      phase: 'tool-call',
      lastEventType: 'tool-call',
      toolCallCount: 1,
    }));
  });

  test('clears sending state on SDK projected tool output so awaiting dot cannot stick', () => {
    const { emitConversationRuntimeUpdated } = registerBackendAndProjectionListeners();

    act(() => {
      setActiveWorkspaceStateForTest({
        isSending: true,
        thinkingStatus: 'thinking',
      });
      emitConversationRuntimeUpdated({
        conversationRef: 'conv-test',
        currentTurn: {
          conversationRef: 'conv-test',
          turnRef: 'turn-tool',
          phase: 'tool_output',
          assistantText: '',
          reasoningText: null,
          toolEvents: [{
            id: 'tool-output-1',
            kind: 'tool_output',
            toolName: 'screenshot',
            text: 'ok',
            payload: { toolName: 'screenshot', output: 'ok' },
          }],
          lastError: null,
        },
      });
    });

    const state = getActiveWorkspaceStateForTest();
    expect(state.isSending).toBe(false);
    expect(state.thinkingStatus).toBeNull();
    expect(state.streamTracking).toEqual(expect.objectContaining({
      activeTurnRef: 'turn-tool',
      phase: 'tool-output',
      lastEventType: 'tool-output',
      toolOutputCount: 1,
    }));
  });

  test('tracks SDK projected tool progress without raw stream ownership', () => {
    const { emitBackendEvent, emitConversationRuntimeUpdated } = registerBackendAndProjectionListeners();

    act(() => {
      emitBackendEvent({
        type: 'web-search-progress',
        turn_ref: 'turn-search',
        payload: { text: 'Searching docs' },
      });
      emitConversationRuntimeUpdated({
        conversationRef: 'conv-test',
        currentTurn: {
          conversationRef: 'conv-test',
          turnRef: 'turn-search',
          phase: 'tool_call',
          assistantText: '',
          reasoningText: null,
          toolEvents: [{
            id: 'tool-progress-1',
            kind: 'tool_progress',
            toolName: 'web_search',
            text: 'Searching docs',
            payload: { toolName: 'web_search', text: 'Searching docs' },
          }],
          lastError: null,
        },
      });
    });

    expect(getActiveWorkspaceStateForTest().streamTracking).toEqual(expect.objectContaining({
      activeTurnRef: 'turn-search',
      phase: 'tool-call',
      lastEventType: 'web-search-progress',
      toolCallCount: 1,
    }));
  });

  test('ignores stale tool-call event when a newer active turn is in progress', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      setActiveWorkspaceStateForTest({
        messages: [
          {
            id: 'assistant-new-turn',
            text: 'working',
            sender: 'assistant',
            type: 'llm-text',
            isComplete: false,
            turnRef: 'turn-new',
          },
        ],
        isSending: true,
        thinkingStatus: 'thinking',
        streamTracking: {
          activeTurnRef: 'turn-new',
          phase: 'streaming',
          startedAt: '2026-03-05T00:00:00.000Z',
          firstChunkAt: '2026-03-05T00:00:01.000Z',
          completedAt: null,
          lastEventAt: '2026-03-05T00:00:01.000Z',
          lastEventType: 'streaming-response',
          eventCount: 2,
          chunkCount: 1,
          toolCallCount: 0,
          toolOutputCount: 0,
          lastChunkSize: 7,
          lastError: null,
        },
      });

      emitBackendEvent({
        type: 'tool-call',
        turn_ref: 'turn-old',
        payload: { tool_name: 'screenshot', parameters: {} },
      });
    });

    const state = getActiveWorkspaceStateForTest();
    expect(state.isSending).toBe(true);
    expect(state.thinkingStatus).toBe('thinking');
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toEqual(
      expect.objectContaining({
        id: 'assistant-new-turn',
        turnRef: 'turn-new',
      }),
    );
    expect(state.streamTracking).toEqual(
      expect.objectContaining({
        activeTurnRef: 'turn-new',
        phase: 'streaming',
        eventCount: 2,
        toolCallCount: 0,
      }),
    );
  });

  test('ignores stale tool-output event when a newer active turn is in progress', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      setActiveWorkspaceStateForTest({
        messages: [
          {
            id: 'assistant-new-turn',
            text: 'working',
            sender: 'assistant',
            type: 'llm-text',
            isComplete: false,
            turnRef: 'turn-new',
          },
        ],
        isSending: true,
        thinkingStatus: 'thinking',
        streamTracking: {
          activeTurnRef: 'turn-new',
          phase: 'streaming',
          startedAt: '2026-03-05T00:00:00.000Z',
          firstChunkAt: '2026-03-05T00:00:01.000Z',
          completedAt: null,
          lastEventAt: '2026-03-05T00:00:01.000Z',
          lastEventType: 'streaming-response',
          eventCount: 2,
          chunkCount: 1,
          toolCallCount: 0,
          toolOutputCount: 0,
          lastChunkSize: 7,
          lastError: null,
        },
      });

      emitBackendEvent({
        type: 'tool-output',
        turn_ref: 'turn-old',
        payload: {
          tool_name: 'screenshot',
          output: 'stale output',
        },
      });
    });

    const state = getActiveWorkspaceStateForTest();
    expect(state.isSending).toBe(true);
    expect(state.thinkingStatus).toBe('thinking');
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toEqual(
      expect.objectContaining({
        id: 'assistant-new-turn',
        turnRef: 'turn-new',
      }),
    );
    expect(state.streamTracking).toEqual(
      expect.objectContaining({
        activeTurnRef: 'turn-new',
        phase: 'streaming',
        eventCount: 2,
        toolOutputCount: 0,
      }),
    );
  });

  test('ignores stale tool-bundle event when a newer active turn is in progress', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      setActiveWorkspaceStateForTest({
        messages: [
          {
            id: 'assistant-new-turn',
            text: 'working',
            sender: 'assistant',
            type: 'llm-text',
            isComplete: false,
            turnRef: 'turn-new',
          },
        ],
        thinkingStatus: 'thinking',
        streamTracking: {
          activeTurnRef: 'turn-new',
          phase: 'streaming',
          startedAt: '2026-03-05T00:00:00.000Z',
          firstChunkAt: '2026-03-05T00:00:01.000Z',
          completedAt: null,
          lastEventAt: '2026-03-05T00:00:01.000Z',
          lastEventType: 'streaming-response',
          eventCount: 2,
          chunkCount: 1,
          toolCallCount: 0,
          toolOutputCount: 0,
          lastChunkSize: 7,
          lastError: null,
        },
      });

      emitBackendEvent({
        type: 'tool-bundle',
        turn_ref: 'turn-old',
        payload: {
          bundle_id: 'bundle-old',
          tools: [{ name: 'screenshot', args: {} }],
        },
      });
    });

    const state = getActiveWorkspaceStateForTest();
    expect(state.thinkingStatus).toBe('thinking');
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toEqual(
      expect.objectContaining({
        id: 'assistant-new-turn',
        turnRef: 'turn-new',
      }),
    );
    expect(state.streamTracking).toEqual(
      expect.objectContaining({
        activeTurnRef: 'turn-new',
        phase: 'streaming',
        eventCount: 2,
        toolCallCount: 0,
      }),
    );
  });

  test('clears thinking status on SDK projected completion', () => {
    const { emitConversationRuntimeUpdated } = registerBackendAndProjectionListeners();

    act(() => {
      setActiveWorkspaceStateForTest({ thinkingStatus: 'thinking' });
      emitConversationRuntimeUpdated({
        conversationRef: 'conv-test',
        currentTurn: {
          conversationRef: 'conv-test',
          turnRef: 'turn-complete',
          phase: 'complete',
          assistantText: 'done',
          reasoningText: null,
          toolEvents: [],
          lastError: null,
        },
      });
    });

    expect(getActiveWorkspaceStateForTest()).toEqual(expect.objectContaining({
      isSending: false,
      thinkingStatus: null,
      thinkingSourceEventType: null,
    }));
    expect(getActiveWorkspaceStateForTest().streamTracking).toEqual(expect.objectContaining({
      activeTurnRef: 'turn-complete',
      phase: 'complete',
      lastEventType: 'streaming-complete',
    }));
  });

  test('replayed SDK projected completion clears stale composer busy state', () => {
    const { emitConversationRuntimeUpdated } = registerBackendAndProjectionListeners();
    const projectedCompletion = {
      conversationRef: 'conv-test',
      currentTurn: {
        conversationRef: 'conv-test',
        turnRef: 'turn-stop',
        phase: 'complete',
        assistantText: 'stopped',
        reasoningText: null,
        toolEvents: [],
        lastError: null,
      },
    };

    act(() => {
      setActiveWorkspaceStateForTest({
        messages: [
          {
            id: 'user-turn-stop',
            text: 'stop this',
            sender: 'user',
            turnRef: 'turn-stop',
          },
        ],
      });
      emitConversationRuntimeUpdated(projectedCompletion);
    });

    act(() => {
      setActiveWorkspaceStateForTest({
        isSending: true,
        thinkingStatus: 'thinking',
        thinkingSourceEventType: 'llm-thought',
      });
      emitConversationRuntimeUpdated(projectedCompletion);
    });

    expect(getActiveWorkspaceStateForTest()).toEqual(expect.objectContaining({
      isSending: false,
      thinkingStatus: null,
      thinkingSourceEventType: null,
    }));
    expect(getActiveWorkspaceStateForTest().streamTracking).toEqual(expect.objectContaining({
      activeTurnRef: 'turn-stop',
      phase: 'complete',
      lastEventType: 'streaming-complete',
    }));
  });

  test('streaming-complete clears busy state without a terminal current-turn projection', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      setActiveWorkspaceStateForTest({
        messages: [
          {
            id: 'user-turn-complete',
            text: 'hello',
            sender: 'user',
            turnRef: 'turn-complete',
          },
          {
            id: 'assistant-turn-complete',
            text: 'done',
            sender: 'assistant',
            type: 'llm-text',
            isComplete: false,
            turnRef: 'turn-complete',
          },
        ],
        isSending: true,
        thinkingStatus: 'thinking',
        thinkingSourceEventType: 'llm-thought',
        streamTracking: {
          activeTurnRef: 'turn-complete',
          phase: 'streaming',
          startedAt: '2026-03-05T00:00:00.000Z',
          firstChunkAt: '2026-03-05T00:00:01.000Z',
          completedAt: null,
          lastEventAt: '2026-03-05T00:00:01.000Z',
          lastEventType: 'streaming-response',
          eventCount: 2,
          chunkCount: 1,
          toolCallCount: 0,
          toolOutputCount: 0,
          lastChunkSize: 4,
          lastError: null,
        },
        sdkLiveTurn: {
          conversationRef: 'conv-test',
          turnRef: 'turn-complete',
          phase: 'streaming',
          assistantText: 'done',
          reasoningText: null,
          toolEvents: [],
          lastError: null,
        },
      });

      emitBackendEvent({
        type: 'streaming-complete',
        conversation_ref: 'conv-test',
        turn_ref: 'turn-complete',
        payload: {
          final_response: 'done',
        },
      });
    });

    const state = getActiveWorkspaceStateForTest();
    expect(state.isSending).toBe(false);
    expect(state.thinkingStatus).toBeNull();
    expect(state.thinkingSourceEventType).toBeNull();
    expect(state.streamTracking).toEqual(expect.objectContaining({
      activeTurnRef: 'turn-complete',
      phase: 'complete',
      lastEventType: 'streaming-complete',
    }));
    expect(state.messages.at(-1)).toEqual(expect.objectContaining({
      isComplete: false,
      text: 'done',
    }));
  });

  test('ignores stale streaming-complete turn when a newer active turn is in progress', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      setActiveWorkspaceStateForTest({
        messages: [
          {
            id: 'assistant-new-turn',
            text: 'working',
            sender: 'assistant',
            type: 'llm-text',
            isComplete: false,
            turnRef: 'turn-new',
          },
        ],
        isSending: true,
        thinkingStatus: 'thinking',
        streamTracking: {
          activeTurnRef: 'turn-new',
          phase: 'streaming',
          startedAt: '2026-03-05T00:00:00.000Z',
          firstChunkAt: '2026-03-05T00:00:01.000Z',
          completedAt: null,
          lastEventAt: '2026-03-05T00:00:01.000Z',
          lastEventType: 'streaming-response',
          eventCount: 2,
          chunkCount: 1,
          toolCallCount: 0,
          toolOutputCount: 0,
          lastChunkSize: 7,
          lastError: null,
        },
      });

      emitBackendEvent({
        type: 'streaming-complete',
        turn_ref: 'turn-old',
        payload: {},
      });
    });

    const state = getActiveWorkspaceStateForTest();
    expect(state.isSending).toBe(true);
    expect(state.thinkingStatus).toBe('thinking');
    expect(state.streamTracking).toEqual(
      expect.objectContaining({
        activeTurnRef: 'turn-new',
        phase: 'streaming',
        eventCount: 2,
      }),
    );
    expect(state.messages[0]).toEqual(
      expect.objectContaining({
        id: 'assistant-new-turn',
        isComplete: false,
      }),
    );
  });

  test('clears streamed thinking on SDK projected completion without mutating raw assistant rows', () => {
    const { emitConversationRuntimeUpdated } = registerBackendAndProjectionListeners();

    act(() => {
      setActiveWorkspaceStateForTest({
        messages: [
          {
            id: 'assistant-turn-1',
            text: 'final answer',
            sender: 'assistant',
            type: 'llm-text',
            isComplete: false,
            turnRef: 'turn-1',
          },
        ],
        thinkingStatus: 'step 1\nstep 2',
        thinkingSourceEventType: 'llm-thought',
      });
      emitConversationRuntimeUpdated({
        conversationRef: 'conv-test',
        currentTurn: {
          conversationRef: 'conv-test',
          turnRef: 'turn-1',
          phase: 'complete',
          assistantText: 'final answer',
          reasoningText: 'step 1\nstep 2',
          toolEvents: [],
          lastError: null,
        },
      });
    });

    const state = getActiveWorkspaceStateForTest();
    expect(state.messages[0]).toEqual(expect.objectContaining({
      id: 'assistant-turn-1',
      text: 'final answer',
    }));
    expect(state.messages[0].thinkingText).toBeUndefined();
    expect(state.thinkingStatus).toBeNull();
  });

  test('local user event updates send state without adding transcript rows', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      emitBackendEvent({
        type: 'local-user-message',
        payload: { text: 'hello from chatbox', screenshot: null },
      });
    });

    const messages = getActiveWorkspaceStateForTest().messages;
    const last = messages[messages.length - 1];
    expect(last).not.toEqual(expect.objectContaining({
      sender: 'user',
      text: 'hello from chatbox',
    }));
    expect(getActiveWorkspaceStateForTest().isSending).toBe(true);
  });

  test('does not set generic thinking status for gemini when thought-text streaming is supported', () => {
    setMockConfig({
      selected_model_id: 'gemini-3.1-pro-preview',
      model_provider: 'gemini',
    });
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      emitBackendEvent({
        type: 'local-user-message',
        payload: { text: 'hello from chatbox', screenshot: null },
      });
    });

    expect(getActiveWorkspaceStateForTest().thinkingStatus).toBeNull();
  });

  test('shows generic thinking status for models explicitly marked without thought-text stream', () => {
    setMockConfig(
      {
        selected_model_id: 'gemini-3.1-pro-preview',
        model_provider: 'gemini',
      },
      {
        local: [],
        online: [
          {
            id: 'gemini-3.1-pro-preview',
            provider: 'gemini',
            supports_thinking: true,
            supports_thinking_text_stream: false,
          },
        ],
      },
    );
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      emitBackendEvent({
        type: 'local-user-message',
        payload: { text: 'hello from chatbox', screenshot: null },
      });
    });

    expect(getActiveWorkspaceStateForTest().thinkingStatus).toBe('Thinking...');
  });

  test('replaces generic thinking fallback when SDK projection reasoning arrives', () => {
    setMockConfig({
      selected_model_id: 'gemini-3.1-pro-preview',
      model_provider: 'gemini',
    });
    const { emitBackendEvent, emitConversationRuntimeUpdated } = registerBackendAndProjectionListeners();

    act(() => {
      emitBackendEvent({
        type: 'local-user-message',
        turn_ref: 'turn-live',
        payload: { text: 'hello from chatbox', screenshot: null },
      });
      emitConversationRuntimeUpdated({
        conversationRef: 'conv-test',
        currentTurn: {
          conversationRef: 'conv-test',
          turnRef: 'turn-live',
          phase: 'awaiting',
          assistantText: '',
          reasoningText: 'reasoning chunk',
          toolEvents: [],
          lastError: null,
        },
      });
    });

    expect(getActiveWorkspaceStateForTest().thinkingStatus).toBe('reasoning chunk');
  });

  test('updates token counts from token-count events', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      emitBackendEvent({
        type: 'token-count',
        payload: {
          prompt_tokens: 12,
          visible_output_tokens: 3,
          thinking_tokens: 2,
          output_tokens_total: 5,
          total_tokens: 17,
          conversation_tokens: 120,
          usage_source: 'provider',
        },
      });
    });

    expect(getActiveWorkspaceStateForTest().tokenCounts).toEqual({
      prompt_tokens: 12,
      visible_output_tokens: 3,
      thinking_tokens: 2,
      output_tokens_total: 5,
      total_tokens: 17,
      conversation_tokens: 120,
      usage_source: 'provider',
    });
  });

  test('attaches provider token counts to the completed assistant message for the same turn', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      setActiveWorkspaceStateForTest({
        messages: [
          {
            id: 'assistant-1',
            text: 'Final answer',
            sender: 'assistant',
            type: 'llm-text',
            isComplete: true,
            turnRef: 'turn-provider',
            sourceEventType: 'streaming-complete',
            sourceChannel: 'sdk:conversation-event',
          },
        ],
      });

      emitBackendEvent({
        type: 'token-count',
        turn_ref: 'turn-provider',
        payload: {
          prompt_tokens: 12,
          visible_output_tokens: 3,
          thinking_tokens: 2,
          output_tokens_total: 5,
          total_tokens: 17,
          conversation_tokens: 120,
          usage_source: 'provider',
        },
      });
    });

    expect(getActiveWorkspaceStateForTest().messages[0]).toEqual(expect.objectContaining({
      tokenCounts: {
        prompt_tokens: 12,
        visible_output_tokens: 3,
        thinking_tokens: 2,
        output_tokens_total: 5,
        total_tokens: 17,
        conversation_tokens: 120,
        usage_source: 'provider',
      },
    }));
  });

  test('ignores stale token-count event when a newer active turn is in progress', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      setActiveWorkspaceStateForTest({
        tokenCounts: {
          prompt_tokens: 5,
          visible_output_tokens: 2,
          output_tokens_total: 2,
          total_tokens: 7,
          conversation_tokens: 70,
          usage_source: 'provider',
        },
        streamTracking: {
          activeTurnRef: 'turn-new',
          phase: 'streaming',
          startedAt: '2026-03-05T00:00:00.000Z',
          firstChunkAt: '2026-03-05T00:00:01.000Z',
          completedAt: null,
          lastEventAt: '2026-03-05T00:00:01.000Z',
          lastEventType: 'streaming-response',
          eventCount: 2,
          chunkCount: 1,
          toolCallCount: 0,
          toolOutputCount: 0,
          lastChunkSize: 7,
          lastError: null,
        },
      });

      emitBackendEvent({
        type: 'token-count',
        turn_ref: 'turn-old',
        payload: {
          prompt_tokens: 99,
          visible_output_tokens: 99,
          output_tokens_total: 99,
          total_tokens: 198,
          conversation_tokens: 198,
          usage_source: 'provider',
        },
      });
    });

    expect(getActiveWorkspaceStateForTest().tokenCounts).toEqual({
      prompt_tokens: 5,
      visible_output_tokens: 2,
      output_tokens_total: 2,
      total_tokens: 7,
      conversation_tokens: 70,
      usage_source: 'provider',
    });
  });

  test('does not append raw chunks to existing assistant streaming messages', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      setActiveWorkspaceStateForTest({
        messages: [
          {
            id: 'assistant-1',
            text: 'hello',
            sender: 'assistant',
            type: 'llm-text',
            isComplete: false,
          },
        ],
      });
      emitBackendEvent({
        type: 'streaming-response',
        payload: { text: ' world' },
      });
    });

    expect(getActiveWorkspaceStateForTest().messages).toEqual([
      expect.objectContaining({
        id: 'assistant-1',
        text: 'hello',
        type: 'llm-text',
      }),
    ]);
  });

  test('does not create raw assistant messages from streaming chunks', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      setActiveWorkspaceStateForTest({
        messages: [
          {
            id: 'assistant-1',
            text: 'existing',
            sender: 'assistant',
            type: 'llm-text',
            isComplete: true,
          },
        ],
      });
      emitBackendEvent({
        type: 'streaming-response',
        payload: { text: 'new chunk' },
      });
    });

    const messages = getActiveWorkspaceStateForTest().messages;
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual(expect.objectContaining({
      id: 'assistant-1',
      text: 'existing',
      isComplete: true,
    }));
  });

  test('ignores stale streaming-response event when a newer active turn is in progress', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      setActiveWorkspaceStateForTest({
        messages: [
          {
            id: 'assistant-new-turn',
            text: 'new answer',
            sender: 'assistant',
            type: 'llm-text',
            isComplete: false,
            turnRef: 'turn-new',
          },
        ],
        isSending: true,
        thinkingStatus: 'thinking',
        streamTracking: {
          activeTurnRef: 'turn-new',
          phase: 'streaming',
          startedAt: '2026-03-05T00:00:00.000Z',
          firstChunkAt: '2026-03-05T00:00:01.000Z',
          completedAt: null,
          lastEventAt: '2026-03-05T00:00:01.000Z',
          lastEventType: 'streaming-response',
          eventCount: 2,
          chunkCount: 1,
          toolCallCount: 0,
          toolOutputCount: 0,
          lastChunkSize: 10,
          lastError: null,
        },
      });

      emitBackendEvent({
        type: 'streaming-response',
        turn_ref: 'turn-old',
        payload: { text: 'stale chunk' },
      });
    });

    const state = getActiveWorkspaceStateForTest();
    expect(state.isSending).toBe(true);
    expect(state.thinkingStatus).toBe('thinking');
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toEqual(
      expect.objectContaining({
        id: 'assistant-new-turn',
        text: 'new answer',
        turnRef: 'turn-new',
      }),
    );
    expect(state.streamTracking).toEqual(
      expect.objectContaining({
        activeTurnRef: 'turn-new',
        phase: 'streaming',
        eventCount: 2,
        chunkCount: 1,
      }),
    );
  });

  test('accepts next-turn first SDK projection chunk after local send when previous turn is terminal', () => {
    const { emitConversationRuntimeUpdated } = registerBackendAndProjectionListeners();

    act(() => {
      setActiveWorkspaceStateForTest({
        activeConversationRef: 'conv-test',
        messages: [
          {
            id: 'assistant-old',
            text: 'old final answer',
            sender: 'assistant',
            type: 'llm-text',
            isComplete: true,
            turnRef: 'turn-old',
          },
          {
            id: 'user-new',
            text: 'follow up',
            sender: 'user',
            turnRef: 'turn-new',
          },
        ],
        isSending: true,
        pendingTurn: {
          conversationRef: 'conv-test',
          turnRef: 'turn-new',
          userMessageId: 'user-new',
          text: 'follow up',
          timestamp: '2026-03-05T00:00:04.000Z',
          attachmentFilenames: null,
        },
        streamTracking: {
          activeTurnRef: 'turn-old',
          phase: 'complete',
          startedAt: '2026-03-05T00:00:00.000Z',
          firstChunkAt: '2026-03-05T00:00:01.000Z',
          completedAt: '2026-03-05T00:00:03.000Z',
          lastEventAt: '2026-03-05T00:00:03.000Z',
          lastEventType: 'streaming-complete',
          eventCount: 3,
          chunkCount: 1,
          toolCallCount: 0,
          toolOutputCount: 0,
          lastChunkSize: 14,
          lastError: null,
        },
      });

      emitConversationRuntimeUpdated({
        conversationRef: 'conv-test',
        currentTurn: {
          conversationRef: 'conv-test',
          turnRef: 'turn-new',
          phase: 'streaming',
          assistantText: 'next answer',
          reasoningText: null,
          toolEvents: [],
          lastError: null,
        },
      });
    });

    const state = getActiveWorkspaceStateForTest();
    expect(state.isSending).toBe(false);
    expect(state.messages.at(-1)).toEqual(expect.objectContaining({
      id: 'user-new',
      sender: 'user',
      text: 'follow up',
      turnRef: 'turn-new',
    }));
    expect(state.streamTracking).toEqual(
      expect.objectContaining({
        activeTurnRef: 'turn-new',
        phase: 'streaming',
      }),
    );
  });

  test('accepts next-turn awaiting SDK projection before local user event reaches overlay renderer', () => {
    const { emitConversationRuntimeUpdated } = registerBackendAndProjectionListeners();

    act(() => {
      setActiveWorkspaceStateForTest({
        messages: [
          {
            id: 'user-old',
            text: 'hello',
            sender: 'user',
            turnRef: 'turn-old',
          },
          {
            id: 'assistant-old',
            text: 'old final answer',
            sender: 'assistant',
            type: 'llm-text',
            isComplete: true,
            turnRef: 'turn-old',
          },
        ],
        isSending: false,
        sdkLiveTurn: {
          conversationRef: 'conv-test',
          turnRef: 'turn-old',
          phase: 'complete',
          assistantText: 'old final answer',
          reasoningText: null,
          toolEvents: [],
          lastError: null,
        },
        streamTracking: {
          activeTurnRef: 'turn-old',
          phase: 'complete',
          startedAt: '2026-03-05T00:00:00.000Z',
          firstChunkAt: '2026-03-05T00:00:01.000Z',
          completedAt: '2026-03-05T00:00:03.000Z',
          lastEventAt: '2026-03-05T00:00:03.000Z',
          lastEventType: 'streaming-complete',
          eventCount: 3,
          chunkCount: 1,
          toolCallCount: 0,
          toolOutputCount: 0,
          lastChunkSize: 14,
          lastError: null,
        },
      });

      emitConversationRuntimeUpdated({
        conversationRef: 'conv-test',
        currentTurn: {
          conversationRef: 'conv-test',
          turnRef: 'turn-new',
          phase: 'awaiting',
          assistantText: '',
          reasoningText: null,
          toolEvents: [],
          lastError: null,
        },
      });
    });

    let state = getActiveWorkspaceStateForTest();
    expect(state.sdkLiveTurn).toEqual(expect.objectContaining({
      turnRef: 'turn-new',
      phase: 'awaiting',
    }));
    expect(state.isSending).toBe(true);
    expect(state.streamTracking).toEqual(expect.objectContaining({
      activeTurnRef: 'turn-new',
      phase: 'awaiting-first-chunk',
      lastEventType: 'query-accepted',
    }));

    act(() => {
      emitConversationRuntimeUpdated({
        conversationRef: 'conv-test',
        currentTurn: {
          conversationRef: 'conv-test',
          turnRef: 'turn-new',
          phase: 'streaming',
          assistantText: 'new answer',
          reasoningText: null,
          toolEvents: [],
          lastError: null,
        },
      });
    });

    state = getActiveWorkspaceStateForTest();
    expect(state.isSending).toBe(false);
    expect(state.sdkLiveTurn).toEqual(expect.objectContaining({
      turnRef: 'turn-new',
      phase: 'streaming',
      assistantText: 'new answer',
    }));
    expect(state.streamTracking).toEqual(expect.objectContaining({
      activeTurnRef: 'turn-new',
      phase: 'streaming',
      lastEventType: 'streaming-response',
    }));
  });

  test('ignores benign settings update errors', () => {
    const { emitBackendEvent } = registerBackendListener();
    act(() => {
      setActiveWorkspaceStateForTest({
        isSending: true,
        thinkingStatus: 'thinking',
        messages: [{ id: 'init', text: 'Hello!', sender: 'assistant' }],
      });
    });

    act(() => {
      emitBackendEvent({
        type: 'error',
        payload: {
          message: 'Failed to update settings: timeout',
        },
      });
    });

    expect(getActiveWorkspaceStateForTest().isSending).toBe(true);
    expect(getActiveWorkspaceStateForTest().thinkingStatus).toBe('thinking');
    expect(getActiveWorkspaceStateForTest().messages).toHaveLength(1);
  });

  test('suppresses recoverable streamed tool-call parse errors in chat banner', () => {
    const { emitBackendEvent } = registerBackendListener();
    act(() => {
      setActiveWorkspaceStateForTest({
        isSending: true,
        thinkingStatus: 'thinking',
        messages: [{ id: 'init', text: 'Hello!', sender: 'assistant' }],
      });
    });

    act(() => {
      emitBackendEvent({
        type: 'error',
        payload: {
          content: (
            'Unexpected system error: Invalid response from stream: '
            + 'failed to parse streamed tool-call arguments for id=tool_bad name=run_shell_command. '
            + 'Raw arguments preview: \'{"command":"cat > index.html << \\"EOF\\""}\''
          ),
        },
      });
    });

    expect(getActiveWorkspaceStateForTest().isSending).toBe(true);
    expect(getActiveWorkspaceStateForTest().thinkingStatus).toBe('thinking');
    expect(getActiveWorkspaceStateForTest().messages).toHaveLength(1);
  });

  test('tracks SDK projected real errors even when error text is in payload content', () => {
    const { emitBackendEvent, emitConversationRuntimeUpdated } = registerBackendAndProjectionListeners();
    act(() => {
      setActiveWorkspaceStateForTest({ isSending: true, thinkingStatus: 'thinking' });
    });

    act(() => {
      emitConversationRuntimeUpdated({
        conversationRef: 'conv-test',
        currentTurn: {
          conversationRef: 'conv-test',
          turnRef: 'turn-error',
          phase: 'error',
          assistantText: '',
          reasoningText: null,
          toolEvents: [],
          lastError: 'Gateway request failed',
        },
      });
      emitBackendEvent({
        type: 'error',
        turn_ref: 'turn-error',
        payload: {
          content: 'Gateway request failed',
        },
      });
    });

    const state = getActiveWorkspaceStateForTest();
    expect(state.isSending).toBe(false);
    expect(state.thinkingStatus).toBe('');
    expect(state.streamTracking).toEqual(expect.objectContaining({
      activeTurnRef: 'turn-error',
      phase: 'error',
      lastEventType: 'error',
      lastError: 'Gateway request failed',
    }));
    expect(state.messages.at(-1)).not.toEqual(expect.objectContaining({
      text: 'Gateway request failed',
      type: 'error',
    }));
  });

  test('ignores stale error event when a newer active turn is in progress', () => {
    const { emitBackendEvent } = registerBackendListener();
    act(() => {
      setActiveWorkspaceStateForTest({
        messages: [
          {
            id: 'assistant-new-turn',
            text: 'working',
            sender: 'assistant',
            type: 'llm-text',
            isComplete: false,
            turnRef: 'turn-new',
          },
        ],
        isSending: true,
        thinkingStatus: 'thinking',
        streamTracking: {
          activeTurnRef: 'turn-new',
          phase: 'streaming',
          startedAt: '2026-03-05T00:00:00.000Z',
          firstChunkAt: '2026-03-05T00:00:01.000Z',
          completedAt: null,
          lastEventAt: '2026-03-05T00:00:01.000Z',
          lastEventType: 'streaming-response',
          eventCount: 2,
          chunkCount: 1,
          toolCallCount: 0,
          toolOutputCount: 0,
          lastChunkSize: 7,
          lastError: null,
        },
      });

      emitBackendEvent({
        type: 'error',
        turn_ref: 'turn-old',
        payload: { message: 'stale failure' },
      });
    });

    const state = getActiveWorkspaceStateForTest();
    expect(state.isSending).toBe(true);
    expect(state.thinkingStatus).toBe('thinking');
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toEqual(
      expect.objectContaining({
        id: 'assistant-new-turn',
        type: 'llm-text',
      }),
    );
    expect(state.streamTracking).toEqual(
      expect.objectContaining({
        activeTurnRef: 'turn-new',
        phase: 'streaming',
        eventCount: 2,
      }),
    );
  });

  test('ignores local-user-message when text is missing', () => {
    const { emitBackendEvent } = registerBackendListener();
    const before = getActiveWorkspaceStateForTest().messages.length;

    act(() => {
      emitBackendEvent({
        type: 'local-user-message',
        payload: { text: '' },
      });
    });

    expect(getActiveWorkspaceStateForTest().messages).toHaveLength(before);
  });

  test('does not append chunk to non-contiguous older llm-text for same turn_ref', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      setActiveWorkspaceStateForTest({
        messages: [
          { id: 'user-1', sender: 'user', text: 'old', turnRef: 'turn-old' },
          {
            id: 'assistant-old',
            sender: 'assistant',
            text: 'old answer',
            type: 'llm-text',
            isComplete: false,
            turnRef: 'turn-old',
          },
          { id: 'user-2', sender: 'user', text: 'new', turnRef: 'turn-new' },
        ],
      });

      emitBackendEvent({
        type: 'streaming-response',
        turn_ref: 'turn-old',
        payload: { text: ' +next' },
      });
    });

    const messages = getActiveWorkspaceStateForTest().messages;
    const assistantOld = messages.find((message) => message.id === 'assistant-old');
    expect(assistantOld).toEqual(expect.objectContaining({ text: 'old answer' }));
    expect(messages.at(-1)).toEqual(
      expect.objectContaining({
        sender: 'user',
        text: 'new',
        turnRef: 'turn-new',
      }),
    );
  });

  test('creates a new llm-text message when latest turn message is tool output', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      setActiveWorkspaceStateForTest({
        messages: [
          { id: 'user-1', sender: 'user', text: 'check', turnRef: 'turn-1' },
          {
            id: 'assistant-preface',
            sender: 'assistant',
            text: 'I will check that.',
            type: 'llm-text',
            isComplete: false,
            turnRef: 'turn-1',
          },
          {
            id: 'tool-output-1',
            sender: 'assistant',
            text: 'tool output',
            type: 'tool-output',
            turnRef: 'turn-1',
          },
        ],
      });

      emitBackendEvent({
        type: 'streaming-response',
        turn_ref: 'turn-1',
        payload: { text: 'Here is the final answer.' },
      });
    });

    const messages = getActiveWorkspaceStateForTest().messages;
    const preface = messages.find((message) => message.id === 'assistant-preface');
    expect(preface).toEqual(expect.objectContaining({ text: 'I will check that.' }));
    expect(messages.at(-1)).toEqual(
      expect.objectContaining({
        sender: 'assistant',
        type: 'tool-output',
        text: 'tool output',
        turnRef: 'turn-1',
      }),
    );
  });

  test('tracks stream lifecycle fields across local-user-message and chunks', () => {
    const { emitBackendEvent, emitConversationRuntimeUpdated } = registerBackendAndProjectionListeners();

    act(() => {
      emitBackendEvent({
        type: 'local-user-message',
        turn_ref: 'turn-123',
        payload: { text: 'hello' },
      });
      emitConversationRuntimeUpdated({
        conversationRef: 'conv-test',
        currentTurn: {
          conversationRef: 'conv-test',
          turnRef: 'turn-123',
          phase: 'streaming',
          assistantText: 'chunk',
          reasoningText: null,
          toolEvents: [],
          lastError: null,
        },
      });
      emitConversationRuntimeUpdated({
        conversationRef: 'conv-test',
        currentTurn: {
          conversationRef: 'conv-test',
          turnRef: 'turn-123',
          phase: 'complete',
          assistantText: 'chunk',
          reasoningText: null,
          toolEvents: [],
          lastError: null,
        },
      });
      emitBackendEvent({
        type: 'streaming-complete',
        turn_ref: 'turn-123',
        payload: {},
      });
    });

    expect(getActiveWorkspaceStateForTest().streamTracking).toEqual(
      expect.objectContaining({
        activeTurnRef: 'turn-123',
        phase: 'complete',
        chunkCount: 1,
        eventCount: 3,
      }),
    );
  });
});
