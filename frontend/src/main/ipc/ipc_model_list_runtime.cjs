function createModelListRequestRuntime() {
  let pending = false;

  function queue() {
    pending = true;
  }

  function hasPending() {
    return pending;
  }

  function clear() {
    pending = false;
  }

  function flush({ runtime, sendSdkRuntimeCommand }) {
    if (!pending) {
      return null;
    }
    const messageId = sendSdkRuntimeCommand(runtime, {
      type: 'list-models',
      payload: {},
    });
    if (messageId) {
      pending = false;
    }
    return messageId || null;
  }

  return {
    clear,
    flush,
    hasPending,
    queue,
  };
}

module.exports = {
  createModelListRequestRuntime,
};
