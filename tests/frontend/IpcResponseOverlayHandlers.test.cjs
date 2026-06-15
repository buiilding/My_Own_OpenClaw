/**
 * Covers ipc response overlay handlers. behavior in the frontend test suite.
 */

const {
  registerResponseOverlayHandlers,
} = require('../../frontend/src/main/ipc/ipc_response_overlay_handlers.cjs');
const {
  RESPONSE_OVERLAY_PREFLIGHT_SOURCE,
} = require('../../frontend/src/main/ipc/ipc_overlay_phase_contract.cjs');

function createHarness(phase) {
  const handlers = {};
  const ipcMain = {
    handle: jest.fn((channel, handler) => {
      handlers[channel] = handler;
    }),
  };
  const setResponseOverlayPhase = jest.fn();
  registerResponseOverlayHandlers({
    ipcMain,
    getResponseOverlayPhase: () => phase,
    setResponseOverlayPhase,
  });
  return {
    handlers,
    setResponseOverlayPhase,
  };
}

describe('ipc_response_overlay_handlers', () => {
  test('primes awaiting phase outside active backend loop phases', async () => {
    const { handlers, setResponseOverlayPhase } = createHarness('hidden');

    await expect(handlers['prime-response-overlay-awaiting']()).resolves.toEqual({
      success: true,
    });

    expect(setResponseOverlayPhase).toHaveBeenCalledWith(
      'awaiting-first-chunk',
      RESPONSE_OVERLAY_PREFLIGHT_SOURCE,
    );
  });

  test.each(['streaming', 'tool-call', 'tool-output'])(
    'does not override active %s phase',
    async (phase) => {
      const { handlers, setResponseOverlayPhase } = createHarness(phase);

      await expect(handlers['prime-response-overlay-awaiting']()).resolves.toEqual({
        success: true,
      });

      expect(setResponseOverlayPhase).not.toHaveBeenCalled();
    },
  );
});
