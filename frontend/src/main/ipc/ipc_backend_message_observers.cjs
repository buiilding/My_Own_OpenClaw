/**
 * Owns backend-message observer registration and fan-out for Electron main.
 */

function createBackendMessageObserverRegistry(deps = {}) {
  const {
    log = () => {},
  } = deps;
  const observers = new Set();

  function notify(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return;
    }
    for (const observer of observers) {
      try {
        observer(data);
      } catch (error) {
        log(`Backend message observer error: ${error}`);
      }
    }
  }

  function register(observer) {
    if (typeof observer !== 'function') {
      return () => {};
    }
    observers.add(observer);
    return () => {
      observers.delete(observer);
    };
  }

  function reset() {
    observers.clear();
  }

  return {
    notify,
    register,
    reset,
  };
}

module.exports = {
  createBackendMessageObserverRegistry,
};
