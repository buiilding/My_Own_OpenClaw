/**
 * Covers renderer pending-turn state runtime helpers.
 */

import {
  DesktopChatPendingTurnStateRuntime,
} from '../../frontend/src/renderer/app/runtime/desktopChatPendingTurnStateRuntime';

const {
  addSupersededTurnRef,
  doesPendingTurnMatch,
  normalizePendingTurn,
  removeSupersededTurnRef,
} = DesktopChatPendingTurnStateRuntime;

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
});
