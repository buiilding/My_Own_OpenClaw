/**
 * Owns active query context state for Electron main query/close coordination.
 */

function createActiveQueryContextState(initialContext = null) {
  let activeQueryContext = initialContext;

  function get() {
    return activeQueryContext;
  }

  function set(nextContext) {
    activeQueryContext = nextContext || null;
  }

  function reset() {
    activeQueryContext = null;
  }

  return {
    get,
    set,
    reset,
  };
}

module.exports = {
  createActiveQueryContextState,
};
