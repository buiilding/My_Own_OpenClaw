/**
 * Covers desktop chat stream terminal handoff runtime. behavior in the frontend test suite.
 */

import { DesktopChatStreamTerminalHandoffRuntime } from '../../src/renderer/app/runtime/desktopChatStreamTerminalHandoffRuntime';

const {
  hasTerminalPendingHandoff,
  isAwaitingFirstChunkMismatch,
  normalizeTurnRef,
  shouldIgnoreForTerminalPendingHandoff,
} = DesktopChatStreamTerminalHandoffRuntime;

function createWorkspace({
  phase = 'complete',
  pendingTurn = { turnRef: 'turn-new' },
} = {}) {
  return {
    pendingTurn,
    streamTracking: {
      phase,
    },
  } as any;
}

describe('DesktopChatStreamTerminalHandoffRuntime', () => {
  test('normalizes empty and whitespace turn refs', () => {
    expect(normalizeTurnRef(undefined)).toBe('');
    expect(normalizeTurnRef(null)).toBe('');
    expect(normalizeTurnRef(' turn-1 ')).toBe('turn-1');
  });

  test('detects awaiting-first-chunk mismatch only with a renderer pending turn', () => {
    expect(isAwaitingFirstChunkMismatch(
      createWorkspace({ phase: 'awaiting-first-chunk', pendingTurn: { turnRef: 'turn-new' } }),
      'turn-new',
      'turn-old',
    )).toBe(true);

    expect(isAwaitingFirstChunkMismatch(
      createWorkspace({
        phase: 'awaiting-first-chunk',
        pendingTurn: null,
      }),
      'turn-new',
      'turn-old',
    )).toBe(false);

    expect(isAwaitingFirstChunkMismatch(
      createWorkspace({
        phase: 'awaiting-first-chunk',
        pendingTurn: { turnRef: 'turn-new' },
      }),
      'turn-unrelated',
      'turn-old',
    )).toBe(false);
  });

  test('detects terminal pending handoff only for pending-turn terminal phases', () => {
    expect(hasTerminalPendingHandoff(createWorkspace({ phase: 'idle' }))).toBe(true);
    expect(hasTerminalPendingHandoff(createWorkspace({ phase: 'complete' }))).toBe(true);
    expect(hasTerminalPendingHandoff(createWorkspace({ phase: 'error' }))).toBe(true);
    expect(hasTerminalPendingHandoff(createWorkspace({ phase: 'streaming' }))).toBe(false);
    expect(hasTerminalPendingHandoff(createWorkspace({
      phase: 'complete',
      pendingTurn: null,
    }))).toBe(false);
  });

  test.each([
    {
      caseName: 'complete phase ignores same-turn packets when pending bridge targets a different turn',
      phase: 'complete',
      activeTurnRef: 'turn-current',
      eventTurnRef: 'turn-current',
      pendingTurn: { turnRef: 'turn-new' },
      expected: true,
    },
    {
      caseName: 'complete phase keeps same-turn packets when pending bridge owns the same turn',
      phase: 'complete',
      activeTurnRef: 'turn-current',
      eventTurnRef: 'turn-current',
      pendingTurn: { turnRef: 'turn-current' },
      expected: false,
    },
    {
      caseName: 'complete phase allows next-turn packets during handoff',
      phase: 'complete',
      activeTurnRef: 'turn-old',
      eventTurnRef: 'turn-new',
      pendingTurn: { turnRef: 'turn-new' },
      expected: false,
    },
    {
      caseName: 'complete phase ignores unrelated non-pending packets during handoff',
      phase: 'complete',
      activeTurnRef: 'turn-old',
      eventTurnRef: 'turn-unrelated',
      pendingTurn: { turnRef: 'turn-new' },
      expected: true,
    },
    {
      caseName: 'idle phase never ignores same-turn packets during handoff',
      phase: 'idle',
      activeTurnRef: 'turn-current',
      eventTurnRef: 'turn-current',
      pendingTurn: { turnRef: 'turn-new' },
      expected: false,
    },
    {
      caseName: 'error phase ignores same-turn packets when pending bridge targets a different turn',
      phase: 'error',
      activeTurnRef: 'turn-current',
      eventTurnRef: 'turn-current',
      pendingTurn: { turnRef: 'turn-new' },
      expected: true,
    },
    {
      caseName: 'error phase keeps same-turn packets when pending bridge owns the same turn',
      phase: 'error',
      activeTurnRef: 'turn-current',
      eventTurnRef: 'turn-current',
      pendingTurn: { turnRef: 'turn-current' },
      expected: false,
    },
    {
      caseName: 'missing active turn never ignores same-turn packets during handoff',
      phase: 'complete',
      activeTurnRef: '',
      eventTurnRef: 'turn-new',
      pendingTurn: { turnRef: 'turn-new' },
      expected: false,
    },
  ])('$caseName', ({ phase, activeTurnRef, eventTurnRef, pendingTurn, expected }) => {
    expect(shouldIgnoreForTerminalPendingHandoff(
      createWorkspace({ phase, pendingTurn }),
      eventTurnRef,
      activeTurnRef,
    )).toBe(expected);
  });
});
