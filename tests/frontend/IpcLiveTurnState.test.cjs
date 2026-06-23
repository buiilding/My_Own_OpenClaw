/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');

const {
  createIpcLiveTurnState,
} = require('../../frontend/src/main/ipc/ipc_live_turn_state.cjs');

describe('ipc_live_turn_state', () => {
  test('stores current-turn and pending-turn caches independently', () => {
    const currentTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'streaming',
    };
    const pendingTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-2',
    };
    const state = createIpcLiveTurnState({
      initialCurrentTurn: currentTurn,
      initialPendingTurn: pendingTurn,
    });

    expect(state.getLatestCurrentTurn()).toBe(currentTurn);
    expect(state.getLatestPendingTurn()).toBe(pendingTurn);

    const nextCurrentTurn = { ...currentTurn, turnRef: 'turn-3' };
    const nextPendingTurn = { ...pendingTurn, turnRef: 'turn-4' };
    state.setLatestCurrentTurn(nextCurrentTurn);
    state.setLatestPendingTurn(nextPendingTurn);

    expect(state.getLatestCurrentTurn()).toBe(nextCurrentTurn);
    expect(state.getLatestPendingTurn()).toBe(nextPendingTurn);

    state.resetPendingTurn();
    expect(state.getLatestCurrentTurn()).toBe(nextCurrentTurn);
    expect(state.getLatestPendingTurn()).toBeNull();

    state.setLatestPendingTurn(nextPendingTurn);
    state.reset();
    expect(state.getLatestCurrentTurn()).toBeNull();
    expect(state.getLatestPendingTurn()).toBeNull();
  });

  test('ipc.cjs delegates live-turn cache storage to the helper', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc/ipc_live_turn_state.cjs'),
      'utf8',
    );
    const pendingTurnHelperSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc/ipc_pending_turn_handlers.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createIpcLiveTurnState()');
    expect(mainSource).toContain('liveTurnState.getLatestCurrentTurn()');
    expect(mainSource).toContain('liveTurnState.setLatestCurrentTurn(');
    expect(mainSource).toContain('liveTurnState.getLatestPendingTurn()');
    expect(mainSource).toContain('createPendingTurnRuntime({');
    expect(mainSource).not.toContain('liveTurnState.setLatestPendingTurn(');
    expect(pendingTurnHelperSource).toContain('liveTurnState.setLatestPendingTurn(pendingTurn)');
    expect(mainSource).not.toContain('let latestCurrentTurnProjection = null');
    expect(mainSource).not.toContain('let latestPendingTurn = null');
    expect(mainSource).not.toContain('latestCurrentTurnProjection = currentTurnProjection');
    expect(mainSource).not.toContain('latestPendingTurn = pendingTurn');
    expect(helperSource).toContain('let latestCurrentTurnProjection = initialCurrentTurn;');
    expect(helperSource).toContain('let latestPendingTurn = initialPendingTurn;');
  });
});
