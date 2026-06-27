/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');

const {
  createActiveQueryContextState,
} = require('../../src/main/ipc/ipc_active_query_context.cjs');

describe('ipc_active_query_context', () => {
  test('stores, clears, and resets active query context state', () => {
    const initialContext = {
      queryMessageId: 'turn-initial',
      accepted: false,
    };
    const state = createActiveQueryContextState(initialContext);

    expect(state.get()).toBe(initialContext);

    const nextContext = {
      queryMessageId: 'turn-next',
      accepted: true,
    };
    state.set(nextContext);
    expect(state.get()).toBe(nextContext);

    state.set(null);
    expect(state.get()).toBeNull();

    state.set(nextContext);
    state.set(undefined);
    expect(state.get()).toBeNull();

    state.set(nextContext);
    state.reset();
    expect(state.get()).toBeNull();
  });

  test('ipc.cjs delegates active query context storage to the helper module', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_active_query_context.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createActiveQueryContextState()');
    expect(mainSource).toContain('activeQueryContextState.get()');
    expect(mainSource).toContain('activeQueryContextState.set(');
    expect(mainSource).toContain('activeQueryContextState.reset()');
    expect(mainSource).not.toContain('let activeQueryContext = null');
    expect(mainSource).not.toContain('activeQueryContext =');
    expect(helperSource).toContain('let activeQueryContext = initialContext;');
  });
});
