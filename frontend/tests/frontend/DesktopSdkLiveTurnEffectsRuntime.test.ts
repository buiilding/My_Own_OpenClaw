/**
 * Covers SDK live-turn side effects for chat UI state.
 */

import type { SdkLiveTurnEffectsInput } from '../../src/renderer/app/runtime/desktopSdkLiveTurnEffectsRuntime';
import { DesktopSdkLiveTurnEffectsRuntime } from '../../src/renderer/app/runtime/desktopSdkLiveTurnEffectsRuntime';

const {
  applySdkLiveTurnSideEffects,
  createProjectionCursor,
} = DesktopSdkLiveTurnEffectsRuntime;

function projection(
  overrides: Partial<SdkLiveTurnEffectsInput> = {},
): SdkLiveTurnEffectsInput {
  return {
    conversationRef: 'conv-1',
    turnRef: 'turn-1',
    phase: 'awaiting',
    userMessageRowId: null,
    presentation: {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'awaiting',
      entries: [],
      hasVisibleContent: false,
      isBusy: true,
      isTerminal: false,
      lastError: null,
      awaitingAnchor: null,
      overlayIntent: {
        visible: false,
        mode: 'awaiting',
        turnRef: 'turn-1',
        conversationRef: 'conv-1',
        staleGuardRef: 'turn-1',
      },
    },
    ...overrides,
  };
}

function createDeps() {
  return {
    getWorkspaceState: jest.fn(() => ({ thinkingStatus: null })),
    setIsSending: jest.fn(),
    setThinkingStatus: jest.fn(),
    setThinkingSourceEventType: jest.fn(),
    updateStreamTracking: jest.fn(),
    recordTrackingEvent: jest.fn(),
  };
}

describe('SDK live-turn side effects', () => {
  test('keeps awaiting phase authoritative when SDK typing presentation is false', () => {
    const deps = createDeps();

    applySdkLiveTurnSideEffects({
      conversationRef: 'conv-1',
      currentTurn: projection({
        presentation: {
          conversationRef: 'conv-1',
          turnRef: 'turn-1',
          phase: 'awaiting',
          entries: [],
          hasVisibleContent: false,
          typingVisible: false,
          isBusy: false,
          isTerminal: false,
          lastError: null,
          awaitingAnchor: null,
          overlayIntent: {
            visible: false,
            mode: 'awaiting',
            turnRef: 'turn-1',
            conversationRef: 'conv-1',
            staleGuardRef: 'turn-1',
          },
        },
      }),
      cursor: createProjectionCursor(),
      deps,
    });

    expect(deps.setIsSending).toHaveBeenCalledWith(true, 'conv-1');
  });

  test('does not clear sending for presentation flags without visible content', () => {
    const deps = createDeps();
    const awaitingCursor = applySdkLiveTurnSideEffects({
      conversationRef: 'conv-1',
      currentTurn: projection(),
      cursor: createProjectionCursor(),
      deps,
    });
    deps.setIsSending.mockClear();

    applySdkLiveTurnSideEffects({
      conversationRef: 'conv-1',
      currentTurn: projection({
        phase: 'streaming',
        presentation: {
          conversationRef: 'conv-1',
          turnRef: 'turn-1',
          phase: 'streaming',
          entries: [],
          hasVisibleContent: true,
          isBusy: true,
          isTerminal: false,
          lastError: null,
          awaitingAnchor: null,
          overlayIntent: {
            visible: true,
            mode: 'response',
            turnRef: 'turn-1',
            conversationRef: 'conv-1',
            staleGuardRef: 'turn-1',
          },
        },
      }),
      cursor: awaitingCursor,
      deps,
    });

    expect(deps.setIsSending).not.toHaveBeenCalledWith(false, 'conv-1');
  });

  test('clears sending when SDK presentation contains visible entries', () => {
    const deps = createDeps();
    const awaitingCursor = applySdkLiveTurnSideEffects({
      conversationRef: 'conv-1',
      currentTurn: projection(),
      cursor: createProjectionCursor(),
      deps,
    });
    deps.setIsSending.mockClear();

    applySdkLiveTurnSideEffects({
      conversationRef: 'conv-1',
      currentTurn: projection({
        phase: 'streaming',
        presentation: {
          conversationRef: 'conv-1',
          turnRef: 'turn-1',
          phase: 'streaming',
          entries: [{
            id: 'entry-1',
            type: 'llm-text',
            text: 'Visible reply',
          }],
          isBusy: true,
          isTerminal: false,
          lastError: null,
          awaitingAnchor: null,
          overlayIntent: {
            visible: true,
            mode: 'response',
            turnRef: 'turn-1',
            conversationRef: 'conv-1',
            staleGuardRef: 'turn-1',
          },
        },
      }),
      cursor: awaitingCursor,
      deps,
    });

    expect(deps.setIsSending).toHaveBeenCalledWith(false, 'conv-1');
  });

  test('records accepted and streaming deltas without duplicating already-seen text', () => {
    const deps = createDeps();

    const awaitingCursor = applySdkLiveTurnSideEffects({
      conversationRef: 'conv-1',
      currentTurn: projection(),
      cursor: createProjectionCursor(),
      deps,
    });

    expect(deps.setIsSending).toHaveBeenCalledWith(true, 'conv-1');
    expect(deps.recordTrackingEvent).toHaveBeenCalledWith(
      deps.updateStreamTracking,
      'query-accepted',
      'turn-1',
      { phase: 'awaiting-first-chunk', resetForTurn: true },
      'conv-1',
    );

    deps.recordTrackingEvent.mockClear();
    const streamingCursor = applySdkLiveTurnSideEffects({
      conversationRef: 'conv-1',
      currentTurn: projection({
        phase: 'streaming',
        presentation: {
          conversationRef: 'conv-1',
          turnRef: 'turn-1',
          phase: 'streaming',
          entries: [{
            id: 'entry-assistant',
            type: 'llm-text',
            text: 'hello',
          }],
          isBusy: true,
          isTerminal: false,
          lastError: null,
          awaitingAnchor: null,
          overlayIntent: {
            visible: true,
            mode: 'response',
            turnRef: 'turn-1',
            conversationRef: 'conv-1',
            staleGuardRef: 'turn-1',
          },
        },
      }),
      cursor: awaitingCursor,
      deps,
    });

    expect(deps.recordTrackingEvent).toHaveBeenCalledWith(
      deps.updateStreamTracking,
      'streaming-response',
      'turn-1',
      { phase: 'streaming', chunkSize: 5 },
      'conv-1',
    );

    deps.recordTrackingEvent.mockClear();
    applySdkLiveTurnSideEffects({
      conversationRef: 'conv-1',
      currentTurn: projection({
        phase: 'streaming',
        presentation: {
          conversationRef: 'conv-1',
          turnRef: 'turn-1',
          phase: 'streaming',
          entries: [{
            id: 'entry-assistant',
            type: 'llm-text',
            text: 'hello',
          }],
          isBusy: true,
          isTerminal: false,
          lastError: null,
          awaitingAnchor: null,
          overlayIntent: {
            visible: true,
            mode: 'response',
            turnRef: 'turn-1',
            conversationRef: 'conv-1',
            staleGuardRef: 'turn-1',
          },
        },
      }),
      cursor: streamingCursor,
      deps,
    });

    expect(deps.recordTrackingEvent).not.toHaveBeenCalledWith(
      deps.updateStreamTracking,
      'streaming-response',
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  test('records thinking deltas from SDK presentation entries', () => {
    const deps = createDeps();
    deps.getWorkspaceState.mockReturnValue({ thinkingStatus: 'Reading context' });

    applySdkLiveTurnSideEffects({
      conversationRef: 'conv-1',
      currentTurn: projection({
        phase: 'streaming',
        presentation: {
          entries: [{
            id: 'entry-thinking',
            type: 'thinking',
            text: 'Checking files.',
          }],
          lastError: null,
        },
      }),
      cursor: createProjectionCursor(),
      deps,
    });

    expect(deps.setThinkingStatus).toHaveBeenCalledWith(
      'Reading contextChecking files.',
      'conv-1',
    );
    expect(deps.setThinkingSourceEventType).toHaveBeenCalledWith('llm-thought', 'conv-1');
    expect(deps.recordTrackingEvent).toHaveBeenCalledWith(
      deps.updateStreamTracking,
      'llm-thought',
      'turn-1',
      {},
      'conv-1',
    );
  });

  test('deduplicates tool entries and preserves execution-skipped typing state', () => {
    const deps = createDeps();
    const cursor = applySdkLiveTurnSideEffects({
      conversationRef: 'conv-1',
      currentTurn: projection({
        phase: 'tool_call',
        presentation: {
          entries: [{
            id: 'tool-1',
            type: 'tool-call',
            text: 'Using read_file',
            executionSkipped: true,
            toolName: 'read_file',
          }],
        },
      }),
      cursor: createProjectionCursor(),
      deps,
    });

    expect(deps.recordTrackingEvent).toHaveBeenCalledWith(
      deps.updateStreamTracking,
      'tool-call',
      'turn-1',
      { phase: 'tool-call', toolCall: true },
      'conv-1',
    );
    expect(deps.setThinkingStatus).not.toHaveBeenCalledWith(null, 'conv-1');

    deps.recordTrackingEvent.mockClear();
    applySdkLiveTurnSideEffects({
      conversationRef: 'conv-1',
      currentTurn: projection({
        phase: 'tool_call',
        presentation: {
          entries: [{
            id: 'tool-1',
            type: 'tool-call',
            text: 'Using read_file',
            toolName: 'read_file',
          }],
        },
      }),
      cursor,
      deps,
    });

    expect(deps.recordTrackingEvent).not.toHaveBeenCalled();
  });
});
