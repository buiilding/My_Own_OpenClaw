/**
 * Covers store selector utils behavior in the frontend test suite.
 */

function selectMockStoreState(selector, state) {
  return typeof selector === 'function' ? selector(state) : state;
}

module.exports = {
  selectMockStoreState,
};
