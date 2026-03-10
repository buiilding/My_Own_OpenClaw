/** @jest-environment node */

const {
  getSupportedGlobalAgentStopShortcuts,
  initializeAgentStopShortcutRuntime,
  isAgentLoopStopShortcutPhase,
  normalizeGlobalAgentStopAccelerator,
  resolveGlobalAgentStopAccelerator,
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
      resolveGlobalAgentStopAccelerator(process.platform),
      expect.any(Function),
    );
    expect(runtime.isRegistered()).toBe(true);

    handlers[0].handler();
    expect(onStop).toHaveBeenCalledTimes(1);

    runtime.setEnabled(false);
    expect(globalShortcut.unregister).toHaveBeenCalledWith(
      resolveGlobalAgentStopAccelerator(process.platform),
    );
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
      `[Main] Failed to register global stop shortcut. Tried: ${getSupportedGlobalAgentStopShortcuts(process.platform).map((shortcut) => shortcut.accelerator).join(', ')}`,
    );
    expect(runtime.isRegistered()).toBe(false);
    expect(runtime.getStatus()).toEqual(expect.objectContaining({
      registrationFailed: true,
      resolvedAccelerator: resolveGlobalAgentStopAccelerator(process.platform),
    }));
  });

  test('updates the registered accelerator when the shortcut changes mid-run', () => {
    const handlers = [];
    const globalShortcut = {
      register: jest.fn((accelerator, handler) => {
        handlers.push({ accelerator, handler });
        return true;
      }),
      unregister: jest.fn(),
    };
    const runtime = initializeAgentStopShortcutRuntime({
      globalShortcut,
      platform: 'win32',
    });

    runtime.setEnabled(true);
    expect(runtime.getAccelerator()).toBe('CommandOrControl+Alt+.');

    runtime.setAccelerator('CommandOrControl+Shift+.');

    expect(globalShortcut.unregister).toHaveBeenCalledWith('CommandOrControl+Alt+.');
    expect(globalShortcut.register).toHaveBeenLastCalledWith(
      'CommandOrControl+Shift+.',
      expect.any(Function),
    );
    expect(runtime.getAccelerator()).toBe('CommandOrControl+Shift+.');

    handlers[1].handler();
  });

  test('falls back to the previous accelerator when an updated registration fails', () => {
    const warn = jest.fn();
    const globalShortcut = {
      register: jest.fn()
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true),
      unregister: jest.fn(),
    };
    const runtime = initializeAgentStopShortcutRuntime({
      globalShortcut,
      platform: 'win32',
      warn,
    });

    runtime.setEnabled(true);
    const resolvedAccelerator = runtime.setAccelerator('CommandOrControl+Alt+/');

    expect(resolvedAccelerator).toBe('CommandOrControl+Alt+.');
    expect(runtime.getAccelerator()).toBe('CommandOrControl+Alt+.');
    expect(globalShortcut.unregister).toHaveBeenCalledWith('CommandOrControl+Alt+.');
    expect(globalShortcut.register).toHaveBeenNthCalledWith(
      2,
      'CommandOrControl+Alt+/',
      expect.any(Function),
    );
    expect(globalShortcut.register).toHaveBeenNthCalledWith(
      3,
      'CommandOrControl+Alt+.',
      expect.any(Function),
    );
  });

  test('uses Ctrl+Alt+. as the Windows global stop accelerator', () => {
    expect(resolveGlobalAgentStopAccelerator('win32')).toBe('CommandOrControl+Alt+.');
  });

  test('falls back to the next supported Windows accelerator when Ctrl+Alt+. is unavailable', () => {
    const warn = jest.fn();
    const globalShortcut = {
      register: jest.fn()
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true),
      unregister: jest.fn(),
    };
    const runtime = initializeAgentStopShortcutRuntime({
      globalShortcut,
      platform: 'win32',
      warn,
    });

    runtime.setEnabled(true);

    expect(globalShortcut.register).toHaveBeenNthCalledWith(
      1,
      'CommandOrControl+Alt+.',
      expect.any(Function),
    );
    expect(globalShortcut.register).toHaveBeenNthCalledWith(
      2,
      'CommandOrControl+Shift+.',
      expect.any(Function),
    );
    expect(runtime.getAccelerator()).toBe('CommandOrControl+Shift+.');
    expect(runtime.getStatus()).toEqual(expect.objectContaining({
      usingFallback: true,
      registrationFailed: false,
      resolvedAccelerator: 'CommandOrControl+Shift+.',
      registeredAccelerator: 'CommandOrControl+Shift+.',
      requestedAccelerator: 'CommandOrControl+Alt+.',
    }));
    expect(warn).toHaveBeenCalledWith(
      '[Main] Requested global stop shortcut unavailable; using fallback: CommandOrControl+Shift+. (requested CommandOrControl+Alt+.)',
    );
  });

  test('keeps Shift+Escape as the non-Windows global stop accelerator', () => {
    expect(resolveGlobalAgentStopAccelerator('linux')).toBe('CommandOrControl+Shift+Escape');
    expect(resolveGlobalAgentStopAccelerator('darwin')).toBe('CommandOrControl+Shift+Escape');
  });

  test('normalizes unsupported accelerators back to the platform default', () => {
    expect(normalizeGlobalAgentStopAccelerator('CommandOrControl+Shift+Escape', 'win32'))
      .toBe('CommandOrControl+Alt+.');
  });

  test('exposes platform-specific supported shortcut options', () => {
    expect(getSupportedGlobalAgentStopShortcuts('darwin')).toEqual([
      { accelerator: 'CommandOrControl+Shift+Escape', label: 'Command + Shift + Esc' },
      { accelerator: 'CommandOrControl+Alt+.', label: 'Command + Option + .' },
      { accelerator: 'CommandOrControl+Shift+.', label: 'Command + Shift + .' },
    ]);
  });
});
