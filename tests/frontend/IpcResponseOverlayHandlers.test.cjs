const {
  registerResponseOverlayHandlers,
} = require('../../frontend/src/main/ipc/ipc_response_overlay_handlers.cjs');

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
      'renderer-send-preflight',
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
