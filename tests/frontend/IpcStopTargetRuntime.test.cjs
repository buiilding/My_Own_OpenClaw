/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');
const {
  createMainStopTargetRuntime,
} = require('../../frontend/src/main/ipc/ipc_stop_target_runtime.cjs');

function createResolverRuntime({
  latestConversationView = null,
  latestPendingTurn = null,
} = {}) {
  return createMainStopTargetRuntime({
    getLatestConversationView: () => latestConversationView,
    getLatestPendingTurn: () => latestPendingTurn,
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
    }).resolve()).toBeNull();
  });

  test('pending turn remains stoppable through non-stoppable view bridge', () => {
    expect(createResolverRuntime({
      latestConversationView: conversationView({
        conversationRef: 'conv-view',
        turnRef: 'turn-view',
        phase: 'idle',
        canStop: false,
      }),
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

  test('does not expose missing SDK view state as a fallback stop target', () => {
    expect(createResolverRuntime().resolve()).toBeNull();
  });

  test('targets pending without active conversation fallback', () => {
    expect(createResolverRuntime({
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

  test('does not fall back to current conversation without a view or pending turn', () => {
    expect(createResolverRuntime().resolve()).toBeNull();
  });

  test('rejects padded ConversationView and pending refs as stoppable targets', () => {
    expect(createResolverRuntime({
      latestConversationView: conversationView({
        conversationRef: ' conv-view ',
        turnRef: 'turn-view',
      }),
    }).resolve()).toBeNull();

    expect(createResolverRuntime({
      latestPendingTurn: {
        conversationRef: 'conv-pending',
        turnRef: ' turn-pending ',
      },
    }).resolve()).toBeNull();
  });

  test('uses pending turns as the only no-view stop target', () => {
    expect(createResolverRuntime({
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

  test('missing SDK and pending targets resolve to null', () => {
    expect(createResolverRuntime().resolve()).toBeNull();
  });

  test('sends the resolved stop target through the Agent SDK runtime and completes the overlay phase', async () => {
    const stopQueryThroughAgentSdkRuntime = jest.fn(async () => true);
    const setResponseOverlayPhase = jest.fn();
    const runtime = createMainStopTargetRuntime({
      getLatestConversationView: () => conversationView({
        conversationRef: 'conv-view',
        turnRef: 'turn-view',
      }),
      getLatestPendingTurn: () => null,
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
      getLatestPendingTurn: () => null,
      stopQueryThroughAgentSdkRuntime,
      setResponseOverlayPhase,
    });

    await expect(noStopRuntime.trigger()).resolves.toBe(false);
    expect(stopQueryThroughAgentSdkRuntime).not.toHaveBeenCalled();

    const rejectedStopRuntime = createMainStopTargetRuntime({
      getLatestPendingTurn: () => null,
      stopQueryThroughAgentSdkRuntime,
      setResponseOverlayPhase,
    });

    await expect(rejectedStopRuntime.trigger()).resolves.toBe(false);
    expect(setResponseOverlayPhase).not.toHaveBeenCalled();
  });

  test('composed runtime resolves current main-process stop state lazily', async () => {
    const stopQueryThroughAgentSdkRuntime = jest.fn(async () => true);
    const setResponseOverlayPhase = jest.fn();
    let latestPendingTurn = null;
    const runtime = createMainStopTargetRuntime({
      getLatestConversationView: () => null,
      getLatestPendingTurn: () => latestPendingTurn,
      stopQueryThroughAgentSdkRuntime,
      setResponseOverlayPhase,
    });

    expect(runtime.resolve()).toBeNull();

    latestPendingTurn = {
      conversationRef: 'conv-pending',
      turnRef: 'turn-pending',
    };

    await expect(runtime.trigger()).resolves.toBe(true);

    expect(stopQueryThroughAgentSdkRuntime).toHaveBeenCalledWith({
      conversation_ref: 'conv-pending',
      turn_ref: 'turn-pending',
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
    expect(helperSource).not.toContain('latestCurrentTurnProjection:');
    expect(helperSource).not.toContain('latestSdkLiveTurn:');
    expect(helperSource).not.toContain("source: 'sdk-current-turn'");
    expect(helperSource).toContain('return resolveMainStopTarget({');
    expect(helperSource).toContain('return triggerMainStopTarget({');
    expect(helperSource).not.toContain('  triggerMainStopTarget,');
    expect(helperSource).not.toContain('  isStoppableCurrentTurnProjection,');
    expect(helperSource).not.toContain('  resolveMainStopTarget,');
  });
});
