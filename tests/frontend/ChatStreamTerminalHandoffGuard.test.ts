import {
  hasTerminalPendingHandoff,
  isAwaitingFirstChunkMismatch,
  normalizeTurnRef,
  shouldIgnoreForTerminalPendingHandoff,
} from '../../frontend/src/renderer/features/chat/utils/chatStream/chatStreamTerminalHandoffGuard';

function createWorkspace({
  phase = 'complete',
  isSending = true,
  lastMessage = null,
} = {}) {
  return {
    isSending,
    messages: lastMessage ? [lastMessage] : [],
    streamTracking: {
      phase,
    },
  } as any;
}

describe('chatStreamTerminalHandoffGuard', () => {
  test('normalizes empty and whitespace turn refs', () => {
    expect(normalizeTurnRef(undefined)).toBe('');
    expect(normalizeTurnRef(null)).toBe('');
    expect(normalizeTurnRef(' turn-1 ')).toBe('turn-1');
  });

  test('detects awaiting-first-chunk mismatch only while actively sending', () => {
    expect(isAwaitingFirstChunkMismatch(
      createWorkspace({ phase: 'awaiting-first-chunk', isSending: true }),
      'turn-new',
      'turn-old',
    )).toBe(true);

    expect(isAwaitingFirstChunkMismatch(
      createWorkspace({ phase: 'awaiting-first-chunk', isSending: false }),
      'turn-new',
      'turn-old',
    )).toBe(false);
  });

  test('detects terminal pending handoff only for sending terminal phases', () => {
    expect(hasTerminalPendingHandoff(createWorkspace({ phase: 'idle', isSending: true }))).toBe(true);
    expect(hasTerminalPendingHandoff(createWorkspace({ phase: 'complete', isSending: true }))).toBe(true);
    expect(hasTerminalPendingHandoff(createWorkspace({ phase: 'error', isSending: true }))).toBe(true);
    expect(hasTerminalPendingHandoff(createWorkspace({ phase: 'streaming', isSending: true }))).toBe(false);
    expect(hasTerminalPendingHandoff(createWorkspace({ phase: 'complete', isSending: false }))).toBe(false);
  });

  test.each([
    {
      caseName: 'complete phase ignores same-turn packets when completed assistant tail remains',
      phase: 'complete',
      activeTurnRef: 'turn-current',
      eventTurnRef: 'turn-current',
      lastMessage: {
        id: 'assistant-old',
        sender: 'assistant',
        text: 'done',
        type: 'llm-text',
        isComplete: true,
        turnRef: 'turn-current',
      },
      expected: true,
    },
    {
      caseName: 'complete phase keeps same-turn packets when optimistic user tail is present',
      phase: 'complete',
      activeTurnRef: 'turn-current',
      eventTurnRef: 'turn-current',
      lastMessage: {
        id: 'user-new',
        sender: 'user',
        text: 'next turn',
        turnRef: 'turn-current',
      },
      expected: false,
    },
    {
      caseName: 'complete phase keeps same-turn packets when incomplete assistant placeholder is present',
      phase: 'complete',
      activeTurnRef: 'turn-current',
      eventTurnRef: 'turn-current',
      lastMessage: {
        id: 'assistant-placeholder',
        sender: 'assistant',
        text: '',
        type: 'llm-text',
        isComplete: false,
        turnRef: 'turn-current',
      },
      expected: false,
    },
    {
      caseName: 'complete phase allows next-turn packets during handoff',
      phase: 'complete',
      activeTurnRef: 'turn-old',
      eventTurnRef: 'turn-new',
      lastMessage: null,
      expected: false,
    },
    {
      caseName: 'idle phase never ignores same-turn packets during handoff',
      phase: 'idle',
      activeTurnRef: 'turn-current',
      eventTurnRef: 'turn-current',
      lastMessage: {
        id: 'assistant-old',
        sender: 'assistant',
        text: 'done',
        type: 'llm-text',
        isComplete: true,
        turnRef: 'turn-current',
      },
      expected: false,
    },
    {
      caseName: 'error phase ignores same-turn packets when completed assistant tail remains',
      phase: 'error',
      activeTurnRef: 'turn-current',
      eventTurnRef: 'turn-current',
      lastMessage: {
        id: 'assistant-old',
        sender: 'assistant',
        text: 'done',
        type: 'llm-text',
        isComplete: true,
        turnRef: 'turn-current',
      },
      expected: true,
    },
    {
      caseName: 'error phase keeps same-turn packets when optimistic user tail is present',
      phase: 'error',
      activeTurnRef: 'turn-current',
      eventTurnRef: 'turn-current',
      lastMessage: {
        id: 'user-new',
        sender: 'user',
        text: 'retry',
        turnRef: 'turn-current',
      },
      expected: false,
    },
    {
      caseName: 'missing active turn never ignores same-turn packets during handoff',
      phase: 'complete',
      activeTurnRef: '',
      eventTurnRef: 'turn-new',
      lastMessage: null,
      expected: false,
    },
  ])('$caseName', ({ phase, activeTurnRef, eventTurnRef, lastMessage, expected }) => {
    expect(shouldIgnoreForTerminalPendingHandoff(
      createWorkspace({ phase, lastMessage }),
      eventTurnRef,
      activeTurnRef,
    )).toBe(expected);
  });
});
