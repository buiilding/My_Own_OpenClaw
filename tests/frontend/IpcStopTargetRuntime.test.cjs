/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');
const {
  createMainStopTargetRuntime,
} = require('../../frontend/src/main/ipc/ipc_stop_target_runtime.cjs');

function createResolverRuntime({
  latestConversationView = null,
  latestCurrentTurnProjection = null,
  latestPendingTurn = null,
  currentConversationRef = null,
} = {}) {
  return createMainStopTargetRuntime({
    getLatestConversationView: () => latestConversationView,
    getLatestCurrentTurnProjection: () => latestCurrentTurnProjection,
    getLatestPendingTurn: () => latestPendingTurn,
    getCurrentConversationRef: () => currentConversationRef,
    stopQueryThroughAgentSdkRuntime: jest.fn(),
    setResponseOverlayPhase: jest.fn(),
  });
}

function conversationView({
  conversationRef = 'conv-view',
  turnRef = 'turn-view',
  phase = 'streaming',
  canStop = true,
} = {}) {
  return {
    conversationRef,
    liveTurn: {
      turnRef,
      phase,
      canStop,
      entries: [],
      isBusy: phase !== 'complete' && phase !== 'idle',
      isTerminal: phase === 'complete',
      lastError: null,
    },
    surfaces: {
      responseOverlay: {
        mode: phase === 'streaming' ? 'response' : 'hidden',
        visible: phase === 'streaming',
        guardRef: turnRef,
        ownerConversationRef: conversationRef,
        turnRef,
      },
    },
  };
}

describe('ipc_stop_target_runtime', () => {
  test('targets stoppable ConversationView before stale current or pending state', () => {
    expect(createResolverRuntime({
      latestConversationView: conversationView({
        conversationRef: 'conv-view',
        turnRef: 'turn-view',
      }),
      latestCurrentTurnProjection: {
        conversationRef: 'conv-current',
        turnRef: 'turn-current',
        phase: 'streaming',
      },
      latestPendingTurn: {
        conversationRef: 'conv-pending',
        turnRef: 'turn-pending',
      },
    }).resolve()).toEqual({
      source: 'conversation-view',
      conversationRef: 'conv-view',
      turnRef: 'turn-view',
      canStop: true,
    });
  });

  test('idle ConversationView suppresses stale current-turn stop state', () => {
    expect(createResolverRuntime({
      latestConversationView: conversationView({
        conversationRef: 'conv-view',
        turnRef: 'turn-complete',
        phase: 'complete',
        canStop: false,
      }),
      latestCurrentTurnProjection: {
        conversationRef: 'conv-current',
        turnRef: 'turn-current',
        phase: 'streaming',
      },
      currentConversationRef: 'conv-session',
    }).resolve()).toEqual({
      source: 'idle',
      conversationRef: 'conv-view',
      turnRef: 'turn-complete',
      canStop: false,
    });
  });

  test('pending turn remains stoppable through non-stoppable view bridge', () => {
    expect(createResolverRuntime({
      latestConversationView: conversationView({
        conversationRef: 'conv-view',
        turnRef: 'turn-view',
        phase: 'idle',
        canStop: false,
      }),
      latestCurrentTurnProjection: {
        conversationRef: 'conv-current',
        turnRef: 'turn-current',
        phase: 'streaming',
      },
      latestPendingTurn: {
        conversationRef: 'conv-pending',
        turnRef: 'turn-pending',
      },
    }).resolve()).toEqual({
      source: 'pending-turn',
      conversationRef: 'conv-pending',
      turnRef: 'turn-pending',
      canStop: true,
    });
  });

  test('treats active SDK current-turn projections as fallback stoppable state', () => {
    expect(createResolverRuntime({
      latestCurrentTurnProjection: { phase: 'streaming', conversationRef: 'conv-1' },
    }).resolve()).toEqual(expect.objectContaining({
      source: 'sdk-current-turn',
      canStop: true,
    }));
    expect(createResolverRuntime({
      latestCurrentTurnProjection: { phase: 'tool_call', conversationRef: 'conv-1' },
    }).resolve()).toEqual(expect.objectContaining({
      source: 'sdk-current-turn',
      canStop: true,
    }));
    expect(createResolverRuntime({
      latestCurrentTurnProjection: { phase: 'idle', conversationRef: 'conv-1' },
    }).resolve()).toEqual({
      source: 'idle',
      conversationRef: null,
      turnRef: null,
      canStop: false,
    });
    expect(createResolverRuntime({
      latestCurrentTurnProjection: {
        phase: 'idle',
        conversationRef: 'conv-1',
        presentation: { isBusy: true },
      },
    }).resolve()).toEqual({
      source: 'idle',
      conversationRef: null,
      turnRef: null,
      canStop: false,
    });
  });

  test('targets the latest SDK current turn before pending or idle fallback', () => {
    expect(createResolverRuntime({
      latestCurrentTurnProjection: {
        conversationRef: ' conv-current ',
        turnRef: ' turn-current ',
        phase: 'streaming',
      },
      latestPendingTurn: {
        conversationRef: 'conv-pending',
        turnRef: 'turn-pending',
      },
      currentConversationRef: 'conv-idle',
    }).resolve()).toEqual({
      source: 'sdk-current-turn',
      conversationRef: 'conv-current',
      turnRef: 'turn-current',
      canStop: true,
    });
  });

  test('falls back to current conversation when a stoppable current turn lacks a conversation ref', () => {
    expect(createResolverRuntime({
      latestCurrentTurnProjection: {
        turnRef: 'turn-current',
        phase: 'awaiting',
      },
      currentConversationRef: ' conv-active ',
    }).resolve()).toEqual({
      source: 'sdk-current-turn',
      conversationRef: 'conv-active',
      turnRef: 'turn-current',
      canStop: true,
    });
  });

  test('uses pending turns before idle conversation fallback', () => {
    expect(createResolverRuntime({
      latestCurrentTurnProjection: { phase: 'complete' },
      latestPendingTurn: {
        conversationRef: 'conv-pending',
        turnRef: 'turn-pending',
      },
      currentConversationRef: 'conv-idle',
    }).resolve()).toEqual({
      source: 'pending-turn',
      conversationRef: 'conv-pending',
      turnRef: 'turn-pending',
      canStop: true,
    });
  });

  test('uses idle conversation fallback only when no active current or pending turn exists', () => {
    expect(createResolverRuntime({
      latestCurrentTurnProjection: { phase: 'idle' },
      currentConversationRef: ' conv-idle ',
    }).resolve()).toEqual({
      source: 'idle',
      conversationRef: 'conv-idle',
      turnRef: null,
      canStop: true,
    });
    expect(createResolverRuntime().resolve()).toEqual({
      source: 'idle',
      conversationRef: null,
      turnRef: null,
      canStop: false,
    });
  });

  test('sends the resolved stop target through the Agent SDK runtime and completes the overlay phase', async () => {
    const stopQueryThroughAgentSdkRuntime = jest.fn(async () => true);
    const setResponseOverlayPhase = jest.fn();
    const runtime = createMainStopTargetRuntime({
      getLatestConversationView: () => conversationView({
        conversationRef: 'conv-view',
        turnRef: 'turn-view',
      }),
      getLatestCurrentTurnProjection: () => ({
        canStop: true,
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        phase: 'streaming',
      }),
      getLatestPendingTurn: () => null,
      getCurrentConversationRef: () => null,
      stopQueryThroughAgentSdkRuntime,
      setResponseOverlayPhase,
    });

    await expect(runtime.trigger()).resolves.toBe(true);

    expect(stopQueryThroughAgentSdkRuntime).toHaveBeenCalledWith({
      conversation_ref: 'conv-view',
      turn_ref: 'turn-view',
    });
    expect(setResponseOverlayPhase).toHaveBeenCalledWith('complete', 'stop-query');
  });

  test('does not complete the overlay phase when no stop target or stop result exists', async () => {
    const stopQueryThroughAgentSdkRuntime = jest.fn(async () => false);
    const setResponseOverlayPhase = jest.fn();
    const noStopRuntime = createMainStopTargetRuntime({
      getLatestCurrentTurnProjection: () => ({ phase: 'idle' }),
      getLatestPendingTurn: () => null,
      getCurrentConversationRef: () => null,
      stopQueryThroughAgentSdkRuntime,
      setResponseOverlayPhase,
    });

    await expect(noStopRuntime.trigger()).resolves.toBe(false);
    expect(stopQueryThroughAgentSdkRuntime).not.toHaveBeenCalled();

    const rejectedStopRuntime = createMainStopTargetRuntime({
      getLatestCurrentTurnProjection: () => ({ phase: 'idle' }),
      getLatestPendingTurn: () => null,
      getCurrentConversationRef: () => 'conv-1',
      stopQueryThroughAgentSdkRuntime,
      setResponseOverlayPhase,
    });

    await expect(rejectedStopRuntime.trigger()).resolves.toBe(false);
    expect(setResponseOverlayPhase).not.toHaveBeenCalled();
  });

  test('composed runtime resolves current main-process stop state lazily', async () => {
    const stopQueryThroughAgentSdkRuntime = jest.fn(async () => true);
    const setResponseOverlayPhase = jest.fn();
    let latestCurrentTurnProjection = { phase: 'idle' };
    let latestPendingTurn = null;
    let currentConversationRef = 'conv-idle';
    const runtime = createMainStopTargetRuntime({
      getLatestConversationView: () => null,
      getLatestCurrentTurnProjection: () => latestCurrentTurnProjection,
      getLatestPendingTurn: () => latestPendingTurn,
      getCurrentConversationRef: () => currentConversationRef,
      stopQueryThroughAgentSdkRuntime,
      setResponseOverlayPhase,
    });

    expect(runtime.resolve()).toEqual({
      source: 'idle',
      conversationRef: 'conv-idle',
      turnRef: null,
      canStop: true,
    });

    latestCurrentTurnProjection = {
      phase: 'streaming',
      conversationRef: 'conv-current',
      turnRef: 'turn-current',
    };
    latestPendingTurn = {
      conversationRef: 'conv-pending',
      turnRef: 'turn-pending',
    };
    currentConversationRef = 'conv-active';

    await expect(runtime.trigger()).resolves.toBe(true);

    expect(stopQueryThroughAgentSdkRuntime).toHaveBeenCalledWith({
      conversation_ref: 'conv-current',
      turn_ref: 'turn-current',
    });
    expect(setResponseOverlayPhase).toHaveBeenCalledWith('complete', 'stop-query');
  });

  test('ipc.cjs delegates stop-target dependency assembly to the runtime', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc/ipc_stop_target_runtime.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createMainStopTargetRuntime({');
    expect(mainSource).toContain('mainStopTargetRuntime.trigger()');
    expect(mainSource).not.toContain('function resolveMainStopTarget()');
    expect(mainSource).not.toContain('resolveMainStopTargetRuntime({');
    expect(mainSource).not.toContain('triggerMainStopTarget({');
    expect(helperSource).toContain('function createMainStopTargetRuntime');
    expect(helperSource).toContain('latestConversationView:');
    expect(helperSource).toContain("source: 'conversation-view'");
    expect(helperSource).toContain('return resolveMainStopTarget({');
    expect(helperSource).toContain('return triggerMainStopTarget({');
    expect(helperSource).not.toContain('  triggerMainStopTarget,');
    expect(helperSource).not.toContain('  isStoppableCurrentTurnProjection,');
    expect(helperSource).not.toContain('  resolveMainStopTarget,');
  });
});
