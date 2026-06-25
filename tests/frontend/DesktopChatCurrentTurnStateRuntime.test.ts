/**
 * Covers renderer current-turn state runtime helpers.
 */

import {
  DesktopChatCurrentTurnStateRuntime,
} from '../../frontend/src/renderer/app/runtime/desktopChatCurrentTurnStateRuntime';

const {
  doesCurrentTurnProjectionMatch,
} = DesktopChatCurrentTurnStateRuntime;

describe('DesktopChatCurrentTurnStateRuntime', () => {
  test('matches current-turn projections by optional conversation and turn filters', () => {
    const currentTurnProjection = {
      conversationRef: ' conv-1 ',
      turnRef: ' turn-1 ',
      phase: 'streaming',
      assistantText: '',
      reasoningText: '',
      toolEvents: [],
      lastError: null,
      presentation: null,
    };

    expect(doesCurrentTurnProjectionMatch(currentTurnProjection, null)).toBe(false);
    expect(doesCurrentTurnProjectionMatch(currentTurnProjection, {
      conversationRef: 'conv-1',
    })).toBe(true);
    expect(doesCurrentTurnProjectionMatch(currentTurnProjection, {
      turnRef: 'turn-1',
    })).toBe(true);
    expect(doesCurrentTurnProjectionMatch(currentTurnProjection, {
      conversationRef: 'conv-1',
      turnRef: 'turn-other',
    })).toBe(false);
  });

  test('does not match missing current-turn projections', () => {
    expect(doesCurrentTurnProjectionMatch(null, {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
    })).toBe(false);
  });
});
