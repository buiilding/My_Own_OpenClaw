const mockInvoke = jest.fn();
const SEMANTIC_MEMORY_USER_ID = 'peter-bui';

jest.mock('../../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: (...args) => mockInvoke(...args),
  },
  INVOKE_CHANNELS: {
    LIST_SEMANTIC_MEMORIES: 'list-semantic-memories',
    DELETE_SEMANTIC_MEMORY: 'delete-semantic-memory',
  },
}));

jest.mock('../../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter', () => ({
  getTranscriptSessionInfo: () => ({ conversationRef: null, userId: SEMANTIC_MEMORY_USER_ID }),
}));

function resetSemanticMemoryHarness() {
  mockInvoke.mockReset();
}

module.exports = {
  mockInvoke,
  resetSemanticMemoryHarness,
  SEMANTIC_MEMORY_USER_ID,
};
