/** @jest-environment node */

const {
  createLocalBackendSupervisor,
} = require('../../frontend/src/main/local_backend_supervisor.cjs');

describe('local_backend_supervisor', () => {
  test('tracks starting ready stopping and error states with generation bumps', () => {
    const supervisor = createLocalBackendSupervisor();
    const processRef = { pid: 101 };

    expect(supervisor.getSnapshot()).toEqual(expect.objectContaining({
      status: 'stopped',
      ready: false,
      generation: 0,
    }));

    supervisor.attachProcess(processRef);
    expect(supervisor.getSnapshot()).toEqual(expect.objectContaining({
      process: processRef,
      status: 'starting',
      ready: false,
      generation: 1,
    }));
    expect(supervisor.isActiveProcess(processRef)).toBe(true);

    supervisor.markReady();
    expect(supervisor.getSnapshot()).toEqual(expect.objectContaining({
      status: 'ready',
      ready: true,
    }));

    supervisor.beginStop();
    expect(supervisor.getSnapshot()).toEqual(expect.objectContaining({
      status: 'stopping',
      ready: true,
    }));

    supervisor.clear({ status: 'error', error: 'boom' });
    expect(supervisor.getSnapshot()).toEqual(expect.objectContaining({
      process: null,
      status: 'error',
      ready: false,
      generation: 2,
      lastError: 'boom',
    }));
  });
});
