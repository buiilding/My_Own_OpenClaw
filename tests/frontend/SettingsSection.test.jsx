import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import SettingsSection from '../../frontend/src/renderer/features/dashboard/components/sections/SettingsSection';

const mockInvoke = jest.fn();

let mockAppConfigContext = {
  wakewordEnabled: true,
  wakewordSuppressed: false,
  setWakewordEnabled: jest.fn(),
};

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: (...args) => mockInvoke(...args),
  },
  INVOKE_CHANNELS: {
    SET_AGENT_SUDO_ACCESS: 'set-agent-sudo-access',
  },
}));

jest.mock('../../frontend/src/renderer/app/providers/AppContextHooks', () => ({
  useAppConfigContext: () => mockAppConfigContext,
}));

describe('SettingsSection', () => {
  const defaultConfig = {
    wakeword_stt_enabled: false,
    agent_full_sudo_enabled: false,
    show_additional_models: true,
  };

  function renderSettingsSection(overrides = {}) {
    const {
      config = defaultConfig,
      onConfigChange = jest.fn(),
      onClose = jest.fn(),
    } = overrides;
    return render(
      <SettingsSection
        config={config}
        onConfigChange={onConfigChange}
        onClose={onClose}
      />,
    );
  }

  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue({ success: true });
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    jest.spyOn(window, 'alert').mockImplementation(() => {});
    mockAppConfigContext = {
      wakewordEnabled: true,
      wakewordSuppressed: false,
      setWakewordEnabled: jest.fn(),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('wakeword toggle uses app-config wakeword setter', () => {
    renderSettingsSection();

    fireEvent.click(screen.getByLabelText('Wakeword Listening (Hey Jarvis)'));
    expect(mockAppConfigContext.setWakewordEnabled).toHaveBeenCalledWith(false);
  });

  test('renders only the left settings close button', () => {
    renderSettingsSection();
    expect(screen.getAllByLabelText('Close settings')).toHaveLength(1);
  });

  test('shows wakeword paused helper while chatbox is visible', () => {
    mockAppConfigContext = {
      wakewordEnabled: true,
      wakewordSuppressed: true,
      setWakewordEnabled: jest.fn(),
    };

    renderSettingsSection();

    expect(screen.getByText('Listening is paused while the chatbox is visible.')).toBeInTheDocument();
  });

  test('wakeword STT toggle emits config update payload', () => {
    const onConfigChange = jest.fn();
    renderSettingsSection({ onConfigChange });

    fireEvent.click(screen.getByLabelText('Speech-To-Text After "Hey Jarvis"'));
    expect(onConfigChange).toHaveBeenCalledWith({ wakeword_stt_enabled: true });
  });

  test('agent full sudo toggle confirms, invokes os auth, then persists on success', async () => {
    const onConfigChange = jest.fn();
    renderSettingsSection({ onConfigChange });

    fireEvent.click(screen.getByLabelText('Agent Full Sudo Access'));

    expect(window.confirm).toHaveBeenCalledWith(
      'Warning: This action will enable the agent to have sudo access without password prompts. Continue?',
    );
    expect(mockInvoke).toHaveBeenCalledWith('set-agent-sudo-access', { enabled: true });
    await Promise.resolve();
    expect(onConfigChange).toHaveBeenCalledWith({ agent_full_sudo_enabled: true });
  });

  test('agent full sudo toggle does not invoke when user cancels warning', () => {
    window.confirm.mockReturnValue(false);
    const onConfigChange = jest.fn();
    renderSettingsSection({ onConfigChange });

    fireEvent.click(screen.getByLabelText('Agent Full Sudo Access'));

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(onConfigChange).not.toHaveBeenCalledWith({ agent_full_sudo_enabled: true });
  });

  test('agent full sudo toggle alerts and does not persist on failed auth', async () => {
    mockInvoke.mockResolvedValueOnce({
      success: false,
      reason: 'User canceled or denied OS authentication while trying to enable passwordless sudo access.',
    });
    const onConfigChange = jest.fn();
    renderSettingsSection({ onConfigChange });

    fireEvent.click(screen.getByLabelText('Agent Full Sudo Access'));
    await Promise.resolve();

    expect(window.alert).toHaveBeenCalledWith(
      'User canceled or denied OS authentication while trying to enable passwordless sudo access.',
    );
    expect(onConfigChange).not.toHaveBeenCalledWith({ agent_full_sudo_enabled: true });
  });
});
