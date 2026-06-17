/**
 * Provides local runtime process supervision for the Electron main process.
 */

function createLocalRuntimeSupervisor({
  onStateChange = () => {},
} = {}) {
  const state = {
    process: null,
    status: 'stopped',
    ready: false,
    generation: 0,
    lastError: '',
  };

  function snapshot() {
    return {
      process: state.process,
      status: state.status,
      ready: state.ready,
      generation: state.generation,
      lastError: state.lastError,
    };
  }

  function notify() {
    onStateChange(snapshot());
  }

  function attachProcess(processRef) {
    state.process = processRef || null;
    state.ready = false;
    state.status = processRef ? 'starting' : 'stopped';
    state.lastError = '';
    state.generation += 1;
    notify();
    return state.generation;
  }

  function markReady() {
    if (!state.process) {
      return snapshot();
    }
    state.ready = true;
    state.status = 'ready';
    state.lastError = '';
    notify();
    return snapshot();
  }

  function markError(error = '') {
    if (!state.process) {
      return snapshot();
    }
    state.ready = false;
    state.status = 'error';
    state.lastError = error;
    notify();
    return snapshot();
  }

  function beginStop() {
    if (!state.process) {
      return snapshot();
    }
    state.status = 'stopping';
    notify();
    return snapshot();
  }

  function clear({ status = 'stopped', error = '' } = {}) {
    state.process = null;
    state.ready = false;
    state.status = status;
    state.lastError = error;
    state.generation += 1;
    notify();
    return snapshot();
  }

  function isActiveProcess(processRef) {
    return Boolean(processRef) && state.process === processRef;
  }

  return {
    attachProcess,
    beginStop,
    clear,
    getSnapshot: snapshot,
    isActiveProcess,
    markError,
    markReady,
  };
}

module.exports = {
  createLocalRuntimeSupervisor,
};
