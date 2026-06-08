/** @jest-environment node */

const {
  createLocalBackendStdoutTransport,
  shouldOffloadJsonParse,
} = require('../../frontend/src/main/sidecar/local_backend_stdout_transport.cjs');

describe('local_backend_stdout_transport', () => {
  test('buffers stdout fragments and emits parsed JSON-RPC responses', () => {
    const handleResponse = jest.fn();
    const transport = createLocalBackendStdoutTransport({
      handleResponse,
      isActiveProcessReference: () => true,
    });
    const processRef = {};

    transport.handleData(processRef, Buffer.from('{"jsonrpc":"2.0"'));
    expect(handleResponse).not.toHaveBeenCalled();

    transport.handleData(processRef, Buffer.from(',"id":"1","result":{"ok":true}}\n'));

    expect(handleResponse).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: '1',
      result: { ok: true },
    });
  });

  test('ignores stdout from stale process references', () => {
    const handleResponse = jest.fn();
    const activeProcess = {};
    const staleProcess = {};
    const transport = createLocalBackendStdoutTransport({
      handleResponse,
      isActiveProcessReference: (candidate) => candidate === activeProcess,
    });

    transport.handleData(staleProcess, Buffer.from('{"id":"stale","result":{}}\n'));
    transport.handleData(activeProcess, Buffer.from('{"id":"active","result":{}}\n'));

    expect(handleResponse).toHaveBeenCalledTimes(1);
    expect(handleResponse).toHaveBeenCalledWith({
      id: 'active',
      result: {},
    });
  });

  test('resets buffered partial output between process generations', () => {
    const handleResponse = jest.fn();
    const logger = { error: jest.fn() };
    const transport = createLocalBackendStdoutTransport({
      handleResponse,
      isActiveProcessReference: () => true,
      logger,
    });
    const processRef = {};

    transport.handleData(processRef, Buffer.from('{"id":"old"'));
    transport.reset();
    transport.handleData(processRef, Buffer.from('{"id":"new","result":{}}\n'));

    expect(logger.error).not.toHaveBeenCalled();
    expect(handleResponse).toHaveBeenCalledWith({
      id: 'new',
      result: {},
    });
  });

  test('uses byte length threshold for large JSON parse offload decisions', () => {
    expect(shouldOffloadJsonParse('abc', 3)).toBe(true);
    expect(shouldOffloadJsonParse('ab', 3)).toBe(false);
  });
});
