/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');
const {
  createMainStopTargetRuntime,
} = require('../../frontend/src/main/ipc/ipc_stop_target_runtime.cjs');

function createResolverRuntime({
  latestCurrentTurnProjection = null,
  latestPendingTurn = null,
  currentConversationRef = null,
} = {}) {
  return createMainStopTargetRuntime({
    getLatestCurrentTurnProjection: () => latestCurrentTurnProjection,
    getLatestPendingTurn: () => latestPendingTurn,
    getCurrentConversationRef: () => currentConversationRef,
    stopQueryThroughAgentSdkRuntime: jest.fn(),
    setResponseOverlayPhase: jest.fn(),
  });
}

describe('ipc_stop_target_runtime', () => {
  test('treats busy SDK current-turn projections as stoppable through the runtime', () => {
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
    }).resolve()).toEqual(expect.objectContaining({
      source: 'sdk-current-turn',
      canStop: true,
    }));
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
      conversation_ref: 'conv-1',
      turn_ref: 'turn-1',
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
    expect(helperSource).toContain('return resolveMainStopTarget({');
    expect(helperSource).toContain('return triggerMainStopTarget({');
    expect(helperSource).not.toContain('  triggerMainStopTarget,');
    expect(helperSource).not.toContain('  isStoppableCurrentTurnProjection,');
    expect(helperSource).not.toContain('  resolveMainStopTarget,');
  });
});
