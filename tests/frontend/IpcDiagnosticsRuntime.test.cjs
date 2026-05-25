/** @jest-environment node */

const {
  handleRendererLog,
} = require('../../frontend/src/main/ipc/ipc_diagnostics_runtime.cjs');

describe('ipc_diagnostics_runtime', () => {
  test('ignores malformed renderer log payloads', () => {
    const log = jest.fn();

    expect(handleRendererLog(null, { log })).toBe(false);
    expect(handleRendererLog([], { log })).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });

  test('routes frontend interaction logs through the interaction label', () => {
    const log = jest.fn();

    expect(handleRendererLog({
      source: 'frontend-interaction',
      entry: { event: 'send', messageText: '[redacted]' },
    }, { log })).toBe(true);

    expect(log).toHaveBeenCalledWith('[FrontendInteraction][renderer]', {
      event: 'send',
      messageText: '[redacted]',
    });
  });

  test('routes generic renderer logs through the renderer label', () => {
    const log = jest.fn();
    const payload = { source: 'chat', message: 'mounted' };

    expect(handleRendererLog(payload, { log })).toBe(true);

    expect(log).toHaveBeenCalledWith('[RendererLog]', payload);
  });
});
