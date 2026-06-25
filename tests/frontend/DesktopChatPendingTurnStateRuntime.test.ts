/**
 * Covers renderer pending-turn state runtime helpers.
 */

import {
  DesktopChatPendingTurnStateRuntime,
} from '../../frontend/src/renderer/app/runtime/desktopChatPendingTurnStateRuntime';

const {
  addSupersededTurnRef,
  buildPendingTurnWorkspaceMutation,
  doesPendingTurnMatch,
  normalizePendingTurn,
  removeSupersededTurnRef,
} = DesktopChatPendingTurnStateRuntime;

function workspace(overrides = {}) {
  return {
    messages: [],
    isSending: false,
    thinkingStatus: 'Thinking',
    thinkingSourceEventType: 'assistant_delta',
    currentTurnProjection: { turnRef: 'turn-old' },
    conversationView: { conversationRef: 'conv-1' },
    pendingTurn: null,
    supersededTurnRefs: {},
    ...overrides,
  };
}

describe('DesktopChatPendingTurnStateRuntime', () => {
  test('normalizes valid pending turns and strips empty attachment filenames', () => {
    expect(normalizePendingTurn({
      conversationRef: ' conv-1 ',
      turnRef: ' turn-1 ',
      userMessageId: ' user-row-1 ',
      text: '',
      timestamp: '2026-06-25T12:00:00.000Z',
      attachmentFilenames: [' one.png ', '', null, 'two.txt'],
    })).toEqual({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      userMessageId: 'user-row-1',
      text: '',
      timestamp: '2026-06-25T12:00:00.000Z',
      attachmentFilenames: [' one.png ', 'two.txt'],
    });
  });

  test('rejects pending turns missing identity fields', () => {
    expect(normalizePendingTurn(null)).toBeNull();
    expect(normalizePendingTurn({
      conversationRef: 'conv-1',
      turnRef: '',
      userMessageId: 'row-1',
      text: 'hello',
      timestamp: '2026-06-25T12:00:00.000Z',
    })).toBeNull();
    expect(normalizePendingTurn({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      userMessageId: 'row-1',
      timestamp: '2026-06-25T12:00:00.000Z',
    })).toBeNull();
  });

  test('matches pending turns by optional conversation and turn filters', () => {
    const pendingTurn = normalizePendingTurn({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      userMessageId: 'row-1',
      text: 'hello',
      timestamp: '2026-06-25T12:00:00.000Z',
    });

    expect(doesPendingTurnMatch(pendingTurn, null)).toBe(true);
    expect(doesPendingTurnMatch(pendingTurn, { conversationRef: ' conv-1 ' })).toBe(true);
    expect(doesPendingTurnMatch(pendingTurn, { turnRef: ' turn-1 ' })).toBe(true);
    expect(doesPendingTurnMatch(pendingTurn, {
      conversationRef: 'conv-other',
      turnRef: 'turn-1',
    })).toBe(false);
  });

  test('adds and removes superseded turn refs without changing no-op maps', () => {
    const current = { 'turn-old': true } as Record<string, true>;
    expect(addSupersededTurnRef(current, 'turn-old')).toBe(current);
    expect(addSupersededTurnRef(current, 'turn-new')).toEqual({
      'turn-old': true,
      'turn-new': true,
    });
    expect(removeSupersededTurnRef(current, 'turn-missing')).toBe(current);
    expect(removeSupersededTurnRef(current, 'turn-old')).toEqual({});
  });

  test('builds pending-turn workspace mutations with the renderer bridge row', () => {
    const mutation = buildPendingTurnWorkspaceMutation({
      currentWorkspace: workspace({
        supersededTurnRefs: { 'turn-old': true },
      }),
      pendingTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-new',
        userMessageId: 'user-row-new',
        text: 'hello',
        timestamp: '2026-06-25T12:00:00.000Z',
        attachmentFilenames: ['one.png'],
      },
      supersededTurnRef: 'turn-old',
    });

    expect(mutation).toEqual(expect.objectContaining({
      normalizedPendingTurn: expect.objectContaining({
        conversationRef: 'conv-1',
        turnRef: 'turn-new',
      }),
      optimisticMessage: expect.objectContaining({
        id: 'user-row-new',
        sender: 'user',
        sourceEventType: 'renderer-compose',
        sourceChannel: 'renderer-local',
      }),
    }));
    expect(mutation?.workspace).toEqual(expect.objectContaining({
      isSending: true,
      thinkingStatus: null,
      thinkingSourceEventType: null,
      currentTurnProjection: null,
      conversationView: null,
      pendingTurn: expect.objectContaining({
        turnRef: 'turn-new',
      }),
      supersededTurnRefs: { 'turn-old': true },
    }));
    expect(mutation?.messages).toHaveLength(1);
  });

  test('returns null for echoed pending turns when asked to skip them', () => {
    const pendingTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-new',
      userMessageId: 'user-row-new',
      text: 'hello',
      timestamp: '2026-06-25T12:00:00.000Z',
      attachmentFilenames: null,
    };
    const currentWorkspace = workspace({
      messages: [{
        id: 'user-row-new',
        sender: 'user',
        text: 'hello',
        turnRef: 'turn-new',
      }],
      pendingTurn,
    });

    expect(buildPendingTurnWorkspaceMutation({
      currentWorkspace,
      pendingTurn,
      skipEchoedPendingTurn: true,
    })).toBeNull();
  });
});
