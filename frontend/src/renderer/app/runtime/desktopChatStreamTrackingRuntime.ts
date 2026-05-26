export type StreamTrackingEventType = string;

export type StreamPhase = 'idle'
  | 'awaiting-first-chunk'
  | 'streaming'
  | 'tool-call'
  | 'tool-output'
  | 'complete'
  | 'error';

export type StreamTracking = {
  activeTurnRef: string | null;
  phase: StreamPhase;
  startedAt: string | null;
  firstChunkAt: string | null;
  completedAt: string | null;
  lastEventAt: string | null;
  lastEventType: StreamTrackingEventType | null;
  eventCount: number;
  chunkCount: number;
  toolCallCount: number;
  toolOutputCount: number;
  lastChunkSize: number;
  lastError: string | null;
};

export type StreamTrackingOptions = {
  phase?: StreamPhase;
  chunkSize?: number;
  toolCall?: boolean;
  toolOutput?: boolean;
  errorText?: string | null;
  resetForTurn?: boolean;
};

function createTrackingForNewTurn(
  eventType: StreamTrackingEventType,
  now: string,
  turnRef: string | null,
): StreamTracking {
  return {
    activeTurnRef: turnRef,
    phase: 'awaiting-first-chunk',
    startedAt: now,
    firstChunkAt: null,
    completedAt: null,
    lastEventAt: now,
    lastEventType: eventType,
    eventCount: 1,
    chunkCount: 0,
    toolCallCount: 0,
    toolOutputCount: 0,
    lastChunkSize: 0,
    lastError: null,
  };
}

export function applyTrackingEvent(
  current: StreamTracking,
  eventType: StreamTrackingEventType,
  turnRef: string | null | undefined,
  now: string,
  options: StreamTrackingOptions = {},
): StreamTracking {
  const resolvedTurnRef = turnRef ?? current.activeTurnRef;
  const base = options.resetForTurn
    ? createTrackingForNewTurn(eventType, now, resolvedTurnRef ?? null)
    : {
      ...current,
      activeTurnRef: resolvedTurnRef ?? current.activeTurnRef,
      lastEventAt: now,
      lastEventType: eventType,
      eventCount: current.eventCount + 1,
    };

  const next: StreamTracking = {
    ...base,
  };

  if (options.phase) {
    next.phase = options.phase;
  }

  if (eventType === 'streaming-response') {
    next.chunkCount += 1;
    next.lastChunkSize = options.chunkSize ?? 0;
    if (!next.firstChunkAt) {
      next.firstChunkAt = now;
    }
    if (!options.phase) {
      next.phase = 'streaming';
    }
  }

  if (options.toolCall) {
    next.toolCallCount += 1;
    if (!options.phase) {
      next.phase = 'tool-call';
    }
  }

  if (options.toolOutput) {
    next.toolOutputCount += 1;
    if (!options.phase) {
      next.phase = 'tool-output';
    }
  }

  // Error events terminate the current turn and stamp completion metadata.
  if (options.errorText !== undefined) {
    next.lastError = options.errorText;
    next.phase = options.phase ?? 'error';
    next.completedAt = now;
  }

  if (next.phase === 'complete' && !next.completedAt) {
    next.completedAt = now;
  }

  return next;
}
