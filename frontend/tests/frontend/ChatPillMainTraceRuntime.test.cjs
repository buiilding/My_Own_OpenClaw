/** @jest-environment node */

const {
  logChatPillMainTrace,
} = require('../../src/main/debug/chat_pill_trace_runtime.cjs');

describe('chat pill main trace runtime', () => {
  const originalEnv = process.env.AGENT_DEBUG_CHAT_PILL;
  let consoleLog;

  beforeEach(() => {
    process.env.AGENT_DEBUG_CHAT_PILL = '1';
    consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    if (typeof originalEnv === 'undefined') {
      delete process.env.AGENT_DEBUG_CHAT_PILL;
    } else {
      process.env.AGENT_DEBUG_CHAT_PILL = originalEnv;
    }
    consoleLog.mockRestore();
  });

  test('emits explicit response overlay visibility fields', () => {
    logChatPillMainTrace({
      source: 'ipc',
      action: 'set-phase',
      phase: 'streaming',
      responseLayoutMode: 'response',
      responseVisible: true,
      awaitingVisible: false,
    });

    expect(consoleLog).toHaveBeenCalledWith('[ChatPillTrace][main]', expect.objectContaining({
      response_layout_mode: 'response',
      response_visible: true,
      awaiting_visible: false,
    }));
    const payload = consoleLog.mock.calls[0][1];
    expect(payload).not.toHaveProperty('show_response');
    expect(payload).not.toHaveProperty('show_awaiting_reply');
  });
});
