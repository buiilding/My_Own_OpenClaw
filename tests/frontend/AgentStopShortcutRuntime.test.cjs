/** @jest-environment node */

const {
  initializeAgentStopShortcutRuntime,
  isAgentLoopStopShortcutPhase,
} = require('../../frontend/src/main/agent_stop_shortcut_runtime.cjs');

describe('agent_stop_shortcut_runtime', () => {
  test('recognizes active loop phases that should enable the global stop shortcut', () => {
    expect(isAgentLoopStopShortcutPhase('awaiting-first-chunk')).toBe(true);
    expect(isAgentLoopStopShortcutPhase('streaming')).toBe(true);
    expect(isAgentLoopStopShortcutPhase('tool-call')).toBe(true);
    expect(isAgentLoopStopShortcutPhase('tool-output')).toBe(true);
    expect(isAgentLoopStopShortcutPhase('idle')).toBe(false);
    expect(isAgentLoopStopShortcutPhase('complete')).toBe(false);
    expect(isAgentLoopStopShortcutPhase('error')).toBe(false);
  });

  test('registers global stop accelerator only while enabled and unregisters when disabled', () => {
    const handlers = [];
    const globalShortcut = {
      register: jest.fn((accelerator, handler) => {
        handlers.push({ accelerator, handler });
        return true;
      }),
      unregister: jest.fn(),
    };
    const onStop = jest.fn();
    const runtime = initializeAgentStopShortcutRuntime({ globalShortcut, onStop });

    runtime.setEnabled(true);
    expect(globalShortcut.register).toHaveBeenCalledWith(
      'CommandOrControl+Shift+Escape',
      expect.any(Function),
    );
    expect(runtime.isRegistered()).toBe(true);

    handlers[0].handler();
    expect(onStop).toHaveBeenCalledTimes(1);

    runtime.setEnabled(false);
    expect(globalShortcut.unregister).toHaveBeenCalledWith('CommandOrControl+Shift+Escape');
    expect(runtime.isRegistered()).toBe(false);
  });

  test('does not duplicate registration across repeated enable calls', () => {
    const globalShortcut = {
      register: jest.fn(() => true),
      unregister: jest.fn(),
    };
    const runtime = initializeAgentStopShortcutRuntime({ globalShortcut });

    runtime.setEnabled(true);
    runtime.setEnabled(true);

    expect(globalShortcut.register).toHaveBeenCalledTimes(1);
  });

  test('warns when registration fails', () => {
    const warn = jest.fn();
    const globalShortcut = {
      register: jest.fn(() => false),
      unregister: jest.fn(),
    };
    const runtime = initializeAgentStopShortcutRuntime({ globalShortcut, warn });

    runtime.setEnabled(true);

    expect(warn).toHaveBeenCalledWith(
      '[Main] Failed to register global stop shortcut: CommandOrControl+Shift+Escape',
    );
    expect(runtime.isRegistered()).toBe(false);
  });
});
