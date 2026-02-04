/** @jest-environment node */

const path = require('path');

jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

jest.mock('electron', () => ({
  ipcMain: {
    on: jest.fn(),
  },
}));

describe('wakeword_bridge', () => {
  let spawn;
  let ipcMain;
  let handlers;
  let stdoutHandler;
  let pythonProcess;

  const initBridge = () => {
    jest.resetModules();
    handlers = {};
    stdoutHandler = null;

    spawn = require('child_process').spawn;
    ipcMain = require('electron').ipcMain;

    pythonProcess = {
      stdin: { write: jest.fn() },
      stdout: {
        on: jest.fn((event, handler) => {
          if (event === 'data') {
            stdoutHandler = handler;
          }
        }),
      },
      stderr: { on: jest.fn() },
      on: jest.fn(),
      kill: jest.fn(),
    };

    spawn.mockReturnValue(pythonProcess);
    ipcMain.on.mockImplementation((channel, handler) => {
      handlers[channel] = handler;
    });

    const bridge = require(path.join(
      __dirname,
      '../../frontend/src/main/wakeword_bridge.cjs',
    ));

    const mainWindow = {
      webContents: {
        send: jest.fn(),
      },
    };
    const onWakewordDetected = jest.fn();

    bridge.initializeWakewordBridge(mainWindow, onWakewordDetected);

    return { mainWindow, onWakewordDetected };
  };

  const emitDetection = (payload) => {
    const jsonBuffer = Buffer.from(JSON.stringify(payload));
    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32LE(jsonBuffer.length, 0);
    stdoutHandler(Buffer.concat([lengthBuffer, jsonBuffer]));
  };

  test('fires wakeword callback and forwards detection', () => {
    const { mainWindow, onWakewordDetected } = initBridge();

    emitDetection({
      detected: true,
      model: 'hey_jarvis',
      confidence: 0.91,
      score: 0.91,
    });

    expect(onWakewordDetected).toHaveBeenCalledTimes(1);
    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      'wakeword-detected',
      expect.objectContaining({
        model: 'hey_jarvis',
        confidence: 0.91,
        score: 0.91,
      }),
    );
  });

  test('ignores detection when wakeword disabled', () => {
    const { mainWindow, onWakewordDetected } = initBridge();

    handlers['wakeword-disable']();

    emitDetection({
      detected: true,
      model: 'hey_jarvis',
      confidence: 0.99,
      score: 0.99,
    });

    expect(onWakewordDetected).not.toHaveBeenCalled();
    expect(mainWindow.webContents.send).not.toHaveBeenCalled();
  });
});
