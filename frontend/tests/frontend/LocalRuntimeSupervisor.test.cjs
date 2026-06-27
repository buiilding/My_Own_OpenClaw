/** @jest-environment node */

const {
  createLocalRuntimeSupervisor,
} = require('../../src/main/sidecar/local_runtime_supervisor.cjs');

describe('local_runtime_supervisor', () => {
  test('exports only the local runtime supervisor factory', () => {
    const supervisorModule = require('../../src/main/sidecar/local_runtime_supervisor.cjs');

    expect(createLocalRuntimeSupervisor).toBeDefined();
    expect(supervisorModule[['createLocal', 'BackendSupervisor'].join('')]).toBeUndefined();
  });

  test('tracks starting ready stopping and error states with generation bumps', () => {
    const supervisor = createLocalRuntimeSupervisor();
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

    supervisor.markError('readiness failed');
    expect(supervisor.getSnapshot()).toEqual(expect.objectContaining({
      process: processRef,
      status: 'error',
      ready: false,
      generation: 1,
      lastError: 'readiness failed',
    }));

    supervisor.markReady();
    expect(supervisor.getSnapshot()).toEqual(expect.objectContaining({
      status: 'ready',
      ready: true,
      lastError: '',
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
