/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');
const {
  createMainStopTargetRuntime,
  isStoppableCurrentTurnProjection,
  resolveMainStopTarget,
  triggerMainStopTarget,
} = require('../../frontend/src/main/ipc/ipc_stop_target_runtime.cjs');

describe('ipc_stop_target_runtime', () => {
  test('treats busy SDK current-turn projections as stoppable', () => {
    expect(isStoppableCurrentTurnProjection({ phase: 'streaming' })).toBe(true);
    expect(isStoppableCurrentTurnProjection({ phase: 'tool_call' })).toBe(true);
    expect(isStoppableCurrentTurnProjection({ phase: 'idle' })).toBe(false);
    expect(isStoppableCurrentTurnProjection({
      phase: 'idle',
      presentation: { isBusy: true },
    })).toBe(true);
  });

  test('targets the latest SDK current turn before pending or idle fallback', () => {
    expect(resolveMainStopTarget({
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
    })).toEqual({
      source: 'sdk-current-turn',
      conversationRef: 'conv-current',
      turnRef: 'turn-current',
      canStop: true,
    });
  });

  test('falls back to current conversation when a stoppable current turn lacks a conversation ref', () => {
    expect(resolveMainStopTarget({
      latestCurrentTurnProjection: {
        turnRef: 'turn-current',
        phase: 'awaiting',
      },
      currentConversationRef: ' conv-active ',
    })).toEqual({
      source: 'sdk-current-turn',
      conversationRef: 'conv-active',
      turnRef: 'turn-current',
      canStop: true,
    });
  });

  test('uses pending turns before idle conversation fallback', () => {
    expect(resolveMainStopTarget({
      latestCurrentTurnProjection: { phase: 'complete' },
      latestPendingTurn: {
        conversationRef: 'conv-pending',
        turnRef: 'turn-pending',
      },
      currentConversationRef: 'conv-idle',
    })).toEqual({
      source: 'pending-turn',
      conversationRef: 'conv-pending',
      turnRef: 'turn-pending',
      canStop: true,
    });
  });

  test('uses idle conversation fallback only when no active current or pending turn exists', () => {
    expect(resolveMainStopTarget({
      latestCurrentTurnProjection: { phase: 'idle' },
      currentConversationRef: ' conv-idle ',
    })).toEqual({
      source: 'idle',
      conversationRef: 'conv-idle',
      turnRef: null,
      canStop: true,
    });
    expect(resolveMainStopTarget()).toEqual({
      source: 'idle',
      conversationRef: null,
      turnRef: null,
      canStop: false,
    });
  });

  test('sends the resolved stop target through the Agent SDK runtime and completes the overlay phase', async () => {
    const stopQueryThroughAgentSdkRuntime = jest.fn(async () => true);
    const setResponseOverlayPhase = jest.fn();

    await expect(triggerMainStopTarget({
      stopTarget: {
        canStop: true,
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
      },
      stopQueryThroughAgentSdkRuntime,
      setResponseOverlayPhase,
    })).resolves.toBe(true);

    expect(stopQueryThroughAgentSdkRuntime).toHaveBeenCalledWith({
      conversation_ref: 'conv-1',
      turn_ref: 'turn-1',
    });
    expect(setResponseOverlayPhase).toHaveBeenCalledWith('complete', 'stop-query');
  });

  test('does not complete the overlay phase when no stop target or stop result exists', async () => {
    const stopQueryThroughAgentSdkRuntime = jest.fn(async () => false);
    const setResponseOverlayPhase = jest.fn();

    await expect(triggerMainStopTarget({
      stopTarget: { canStop: false },
      stopQueryThroughAgentSdkRuntime,
      setResponseOverlayPhase,
    })).resolves.toBe(false);
    expect(stopQueryThroughAgentSdkRuntime).not.toHaveBeenCalled();

    await expect(triggerMainStopTarget({
      stopTarget: {
        canStop: true,
        conversationRef: 'conv-1',
        turnRef: null,
      },
      stopQueryThroughAgentSdkRuntime,
      setResponseOverlayPhase,
    })).resolves.toBe(false);
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
  });
});
