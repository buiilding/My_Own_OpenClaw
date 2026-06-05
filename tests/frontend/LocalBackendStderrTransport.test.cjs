/** @jest-environment node */

const {
  createLocalBackendStderrTransport,
} = require('../../frontend/src/main/local_backend_stderr_transport.cjs');

describe('local backend stderr transport', () => {
  function createProcessRef() {
    return {
      stderr: {
        on: jest.fn(),
      },
    };
  }

  test('forwards non-empty allowed stderr lines with local backend prefix', () => {
    const logger = { log: jest.fn() };
    const transport = createLocalBackendStderrTransport({
      isActiveProcessReference: () => true,
      shouldForwardStderrLine: (line) => line.includes('WARNING'),
      logger,
    });

    transport.handleData(
      createProcessRef(),
      Buffer.from('INFO quiet\nWARNING visible\n\nWARNING also-visible\n'),
    );

    expect(logger.log.mock.calls).toEqual([
      ['[LocalBackend Python] WARNING visible'],
      ['[LocalBackend Python] WARNING also-visible'],
    ]);
  });

  test('ignores stderr chunks from stale process refs', () => {
    const logger = { log: jest.fn() };
    const transport = createLocalBackendStderrTransport({
      isActiveProcessReference: () => false,
      shouldForwardStderrLine: () => true,
      logger,
    });

    transport.handleData(createProcessRef(), Buffer.from('WARNING stale\n'));

    expect(logger.log).not.toHaveBeenCalled();
  });

  test('attaches a data handler when stderr stream is available', () => {
    const processRef = createProcessRef();
    const transport = createLocalBackendStderrTransport({
      isActiveProcessReference: () => true,
      shouldForwardStderrLine: () => false,
      logger: { log: jest.fn() },
    });

    transport.attach(processRef);

    expect(processRef.stderr.on).toHaveBeenCalledWith('data', expect.any(Function));
  });
});
