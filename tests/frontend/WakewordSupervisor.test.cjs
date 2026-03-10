/** @jest-environment node */

const {
  createWakewordSupervisor,
} = require('../../frontend/src/main/wakeword_supervisor.cjs');

describe('wakeword_supervisor', () => {
  test('tracks process, ready state, enabled state, and errors explicitly', () => {
    const supervisor = createWakewordSupervisor();
    const processRef = { pid: 202 };

    supervisor.attachProcess(processRef);
    expect(supervisor.getSnapshot()).toEqual(expect.objectContaining({
      process: processRef,
      status: 'starting',
      ready: false,
      enabled: true,
      generation: 1,
    }));

    supervisor.markReady();
    supervisor.setEnabled(false);
    expect(supervisor.getSnapshot()).toEqual(expect.objectContaining({
      status: 'ready',
      ready: true,
      enabled: false,
    }));

    supervisor.beginStop();
    expect(supervisor.getSnapshot()).toEqual(expect.objectContaining({
      status: 'stopping',
    }));

    supervisor.clear({ status: 'error', error: 'wakeword failed' });
    expect(supervisor.getSnapshot()).toEqual(expect.objectContaining({
      process: null,
      status: 'error',
      ready: false,
      enabled: false,
      generation: 2,
      lastError: 'wakeword failed',
    }));
    expect(supervisor.isActiveProcess(processRef)).toBe(false);
  });
});
