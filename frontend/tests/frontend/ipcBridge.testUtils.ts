/**
 * Covers ipc bridge. utils behavior in the frontend test suite.
 */

type MockIpc = {
  send: jest.Mock;
  invoke: jest.Mock;
  on: jest.Mock;
  once: jest.Mock;
};

export function installMockIpc(invokeResult: unknown = 'ok'): MockIpc {
  const ipc: MockIpc = {
    send: jest.fn(),
    invoke: jest.fn().mockResolvedValue(invokeResult),
    on: jest.fn().mockReturnValue(() => undefined),
    once: jest.fn(),
  };
  (window as any).ipc = ipc;
  return ipc;
}

export function clearMockIpc() {
  delete (window as any).ipc;
}
