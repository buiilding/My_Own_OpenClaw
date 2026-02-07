const setupIpc = () => {
  (window as any).ipc = {
    send: jest.fn(),
    invoke: jest.fn().mockResolvedValue('ok'),
    on: jest.fn().mockReturnValue(() => undefined),
    once: jest.fn(),
  };
};

describe('IpcBridge validation', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    delete (window as any).ipc;
  });

  test('throws on invalid channels in development', async () => {
    process.env.NODE_ENV = 'development';
    jest.resetModules();
    setupIpc();

    const { IpcBridge } = require('../../frontend/src/renderer/infrastructure/ipc/bridge');

    expect(() => IpcBridge.send('bad-channel' as any, {})).toThrow(
      'Invalid send channel',
    );
    await expect(IpcBridge.invoke('bad-channel' as any, {})).rejects.toThrow(
      'Invalid invoke channel',
    );
    expect(() => IpcBridge.on('bad-channel' as any, jest.fn())).toThrow(
      'Invalid on channel',
    );
    expect(() => IpcBridge.once('bad-channel' as any, jest.fn())).toThrow(
      'Invalid on channel',
    );
  });

  test('skips channel validation in production', async () => {
    process.env.NODE_ENV = 'production';
    jest.resetModules();
    setupIpc();

    const { IpcBridge } = require('../../frontend/src/renderer/infrastructure/ipc/bridge');

    expect(() => IpcBridge.send('bad-channel' as any, { ok: true })).not.toThrow();
    await expect(IpcBridge.invoke('bad-channel' as any, { ok: true })).resolves.toBe('ok');
    expect((window as any).ipc.send).toHaveBeenCalledWith('bad-channel', { ok: true });
    expect((window as any).ipc.invoke).toHaveBeenCalledWith('bad-channel', { ok: true });
  });
});
