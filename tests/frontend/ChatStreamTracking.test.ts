import {
  applyTrackingEvent,
} from '../../frontend/src/renderer/features/chat/utils/chatStream/chatStreamTracking';
import type { StreamTracking } from '../../frontend/src/renderer/features/chat/stores/chatStore';

function buildTracking(overrides: Partial<StreamTracking> = {}): StreamTracking {
  const seed: StreamTracking = {
    phase: 'idle',
    activeTurnRef: null,
    eventCount: 0,
    startedAt: null,
    lastEventAt: null,
    lastEventType: null,
    firstChunkAt: null,
    completedAt: null,
    chunkCount: 0,
    toolCallCount: 0,
    toolOutputCount: 0,
    lastChunkSize: 0,
    lastError: null,
  };
  return {
    ...seed,
    ...overrides,
  };
}

describe('chatStreamTracking', () => {
  test('resetForTurn seeds a fresh tracking state', () => {
    const now = '2026-02-24T00:00:00.000Z';
    const next = applyTrackingEvent(
      buildTracking({
        activeTurnRef: 'old-turn',
        phase: 'streaming',
        eventCount: 12,
      }),
      'local-user-message',
      'turn-1',
      now,
      { resetForTurn: true },
    );
    expect(next).toEqual(
      expect.objectContaining({
        activeTurnRef: 'turn-1',
        phase: 'awaiting-first-chunk',
        startedAt: now,
        firstChunkAt: null,
        eventCount: 1,
      }),
    );
  });

  test('streaming-response updates chunk counters and firstChunkAt', () => {
    const current = buildTracking({
      activeTurnRef: 'turn-1',
      phase: 'awaiting-first-chunk',
      eventCount: 1,
    });

    const next = applyTrackingEvent(
      current,
      'streaming-response',
      'turn-1',
      '2026-02-24T00:00:01.000Z',
      { chunkSize: 42 },
    );

    expect(next).toEqual(
      expect.objectContaining({
        phase: 'streaming',
        chunkCount: 1,
        lastChunkSize: 42,
        firstChunkAt: '2026-02-24T00:00:01.000Z',
        eventCount: 2,
      }),
    );
  });

  test('tool and completion events stamp counters and completedAt', () => {
    const current = buildTracking({
      activeTurnRef: 'turn-2',
      phase: 'streaming',
      eventCount: 2,
    });
    const withTool = applyTrackingEvent(
      current,
      'tool-call',
      'turn-2',
      '2026-02-24T00:00:02.000Z',
      { toolCall: true },
    );
    expect(withTool).toEqual(
      expect.objectContaining({
        phase: 'tool-call',
        toolCallCount: 1,
      }),
    );

    const completed = applyTrackingEvent(
      withTool,
      'streaming-complete',
      'turn-2',
      '2026-02-24T00:00:03.000Z',
      { phase: 'complete' },
    );
    expect(completed).toEqual(
      expect.objectContaining({
        phase: 'complete',
        completedAt: '2026-02-24T00:00:03.000Z',
      }),
    );
  });

  test('error updates terminal state and lastError', () => {
    const current = buildTracking({
      activeTurnRef: 'turn-3',
      phase: 'streaming',
      eventCount: 3,
    });

    const next = applyTrackingEvent(
      current,
      'error',
      'turn-3',
      '2026-02-24T00:00:04.000Z',
      { errorText: 'boom' },
    );

    expect(next).toEqual(
      expect.objectContaining({
        phase: 'error',
        lastError: 'boom',
        completedAt: '2026-02-24T00:00:04.000Z',
      }),
    );
  });
});
