/**
 * Coordinates the desktop chat stream tracking runtime for the renderer UI.
 */

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

type StreamTrackingWorkspace = {
  streamTracking: StreamTracking;
};

type StreamTrackingStateSnapshot = {
  activeConversationRef: string | null;
};

type StreamTrackingStateDependencies<
  TState extends StreamTrackingStateSnapshot,
  TWorkspace extends StreamTrackingWorkspace,
> = {
  buildWorkspaceUpdate: (
    state: TState,
    workspaceRef: string,
    workspace: TWorkspace,
  ) => Partial<TState> | TState;
  readWorkspaceState: (state: TState, workspaceRef: string) => TWorkspace;
  resolveWorkspaceKey: (
    requestedConversationRef: string | null | undefined,
    activeConversationRef: string | null,
  ) => string;
};

export type StreamTrackingOptions = {
  phase?: StreamPhase;
  chunkSize?: number;
  toolCall?: boolean;
  toolOutput?: boolean;
  errorText?: string | null;
  resetForTurn?: boolean;
};

function createInitialStreamTracking(): StreamTracking {
  return {
    activeTurnRef: null,
    phase: 'idle',
    startedAt: null,
    firstChunkAt: null,
    completedAt: null,
    lastEventAt: null,
    lastEventType: null,
    eventCount: 0,
    chunkCount: 0,
    toolCallCount: 0,
    toolOutputCount: 0,
    lastChunkSize: 0,
    lastError: null,
  };
}

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

function applyTrackingEvent(
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

function buildUpdateStreamTrackingStateUpdate<
  TState extends StreamTrackingStateSnapshot,
  TWorkspace extends StreamTrackingWorkspace,
>({
  conversationRef = null,
  deps,
  state,
  updater,
}: {
  conversationRef?: string | null;
  deps: StreamTrackingStateDependencies<TState, TWorkspace>;
  state: TState;
  updater: (current: StreamTracking) => StreamTracking;
}): Partial<TState> | TState | null {
  const targetWorkspaceRef = deps.resolveWorkspaceKey(conversationRef, state.activeConversationRef);
  const currentWorkspace = deps.readWorkspaceState(state, targetWorkspaceRef);
  const nextStreamTracking = updater(currentWorkspace.streamTracking);
  if (nextStreamTracking === currentWorkspace.streamTracking) {
    return null;
  }
  return deps.buildWorkspaceUpdate(state, targetWorkspaceRef, {
    ...currentWorkspace,
    streamTracking: nextStreamTracking,
  });
}

export const DesktopChatStreamTrackingRuntime = Object.freeze({
  applyTrackingEvent,
  createInitialStreamTracking,
  buildUpdateStreamTrackingStateUpdate,
});
