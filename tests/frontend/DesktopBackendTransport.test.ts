import { createDesktopBackendTransport } from '../../frontend/src/renderer/app/runtime/desktopBackendTransport';

describe('desktopBackendTransport', () => {
  const originalIpc = window.ipc;

  afterEach(() => {
    window.ipc = originalIpc;
    jest.restoreAllMocks();
  });

  test('rejects sendQuery when main reports a query dispatch failure', async () => {
    const invoke = jest.fn(async () => ({
      ok: false,
      error: 'Failed to send query to backend',
    }));
    window.ipc = {
      send: jest.fn(),
      invoke,
      on: jest.fn(),
      once: jest.fn(),
    };

    const transport = createDesktopBackendTransport('/repo');

    await expect(transport.sendQuery({
      text: 'retry this',
      conversation_ref: 'conv-1',
    })).rejects.toThrow('Failed to send query to backend');
    expect(invoke).toHaveBeenCalledWith('windie:send', expect.objectContaining({
      text: 'retry this',
      conversation_ref: 'conv-1',
      workspace_path: '/repo',
    }));
  });

  test('resolves sendQuery when main accepts the query dispatch', async () => {
    const invoke = jest.fn(async () => ({
      ok: true,
      messageId: 'msg-1',
    }));
    window.ipc = {
      send: jest.fn(),
      invoke,
      on: jest.fn(),
      once: jest.fn(),
    };

    const transport = createDesktopBackendTransport(null);

    await expect(transport.sendQuery({
      text: 'hello',
      conversation_ref: 'conv-1',
    }, {
      messageId: 'turn-1',
    })).resolves.toBe('msg-1');
    expect(invoke).toHaveBeenCalledWith('windie:send', expect.objectContaining({
      text: 'hello',
      conversation_ref: 'conv-1',
      query_message_id: 'turn-1',
    }));
    expect(invoke.mock.calls[0][1]).not.toHaveProperty('turn_ref');
  });
});
