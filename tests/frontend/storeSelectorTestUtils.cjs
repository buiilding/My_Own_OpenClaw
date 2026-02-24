function selectMockStoreState(selector, state) {
  return typeof selector === 'function' ? selector(state) : state;
}

module.exports = {
  selectMockStoreState,
};
