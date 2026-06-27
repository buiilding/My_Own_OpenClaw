/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');

const {
  createIpcLiveTurnState,
} = require('../../src/main/ipc/ipc_live_turn_state.cjs');

describe('ipc_live_turn_state', () => {
  test('stores ConversationView, current-turn, and pending-turn caches independently', () => {
    const currentTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'streaming',
    };
    const conversationView = {
      conversationRef: 'conv-1',
      liveTurn: {
        turnRef: 'turn-1',
        canStop: true,
      },
    };
    const pendingTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-2',
    };
    const state = createIpcLiveTurnState({
      initialSdkLiveTurn: currentTurn,
      initialConversationView: conversationView,
      initialPendingTurn: pendingTurn,
    });

    expect(state.getLatestCurrentTurn()).toBe(currentTurn);
    expect(state.getLatestConversationView()).toBe(conversationView);
    expect(state.getLatestPendingTurn()).toBe(pendingTurn);

    const nextCurrentTurn = { ...currentTurn, turnRef: 'turn-3' };
    const nextConversationView = {
      ...conversationView,
      liveTurn: {
        turnRef: 'turn-3',
        canStop: false,
      },
    };
    const nextPendingTurn = { ...pendingTurn, turnRef: 'turn-4' };
    state.setLatestCurrentTurn(nextCurrentTurn);
    state.setLatestConversationView(nextConversationView);
    state.setLatestPendingTurn(nextPendingTurn);

    expect(state.getLatestCurrentTurn()).toBe(nextCurrentTurn);
    expect(state.getLatestConversationView()).toBe(nextConversationView);
    expect(state.getLatestPendingTurn()).toBe(nextPendingTurn);

    state.resetPendingTurn();
    expect(state.getLatestCurrentTurn()).toBe(nextCurrentTurn);
    expect(state.getLatestConversationView()).toBe(nextConversationView);
    expect(state.getLatestPendingTurn()).toBeNull();

    state.setLatestPendingTurn(nextPendingTurn);
    state.reset();
    expect(state.getLatestCurrentTurn()).toBeNull();
    expect(state.getLatestConversationView()).toBeNull();
    expect(state.getLatestPendingTurn()).toBeNull();
  });

  test('ipc.cjs delegates live-turn cache storage to the helper', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_live_turn_state.cjs'),
      'utf8',
    );
    const pendingTurnHelperSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_pending_turn_handlers.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createIpcLiveTurnState()');
    expect(mainSource).toContain('liveTurnState.getLatestCurrentTurn()');
    expect(mainSource).toContain('liveTurnState.setLatestCurrentTurn(');
    expect(mainSource).toContain('getLatestConversationView: () => liveTurnState.getLatestConversationView()');
    expect(mainSource).toContain('liveTurnState.getLatestConversationView()');
    expect(mainSource).toContain('liveTurnState.setLatestConversationView(');
    expect(mainSource).toContain('liveTurnState.getLatestPendingTurn()');
    expect(mainSource).toContain('createPendingTurnRuntime({');
    expect(mainSource).not.toContain('liveTurnState.setLatestPendingTurn(');
    expect(pendingTurnHelperSource).toContain('liveTurnState.setLatestPendingTurn(pendingTurn)');
    expect(mainSource).not.toContain('let latestSdkLiveTurn = null');
    expect(mainSource).not.toContain('let latestPendingTurn = null');
    expect(mainSource).not.toContain('latestCurrentTurnProjection');
    expect(mainSource).not.toContain('currentTurnProjection');
    expect(mainSource).not.toContain('latestPendingTurn = pendingTurn');
    expect(helperSource).toContain('let latestSdkLiveTurn = initialSdkLiveTurn;');
    expect(helperSource).toContain('let latestConversationView = initialConversationView;');
    expect(helperSource).toContain('let latestPendingTurn = initialPendingTurn;');
  });
});
