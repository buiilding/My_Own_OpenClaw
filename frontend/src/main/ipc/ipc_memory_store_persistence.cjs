function mapMemoryStoreEventPayload(eventData = {}) {
  const payload = eventData?.payload || {};
  return {
    user_query: payload.user_query,
    assistant_response: payload.assistant_response,
    memory_type: payload.memory_type || 'episodic',
    user_id: payload.user_id || eventData?.user_id,
    session_id: payload.session_id || eventData?.session_id || eventData?.conversation_ref,
  };
}

function persistMemoryStoreEvent(eventData, deps = {}) {
  const {
    storeMemory,
    log = () => {},
  } = deps;

  if (typeof storeMemory !== 'function') {
    return;
  }

  void storeMemory(mapMemoryStoreEventPayload(eventData)).catch((error) => {
    log(`Main-process memory-store persistence failed: ${error.message}`);
  });
}

module.exports = {
  persistMemoryStoreEvent,
};
