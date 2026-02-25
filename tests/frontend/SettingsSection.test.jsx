import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import SettingsSection from '../../frontend/src/renderer/features/dashboard/components/sections/SettingsSection';

const mockInvoke = jest.fn(() => new Promise(() => {}));
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
    GET_DISPLAYS: 'get-displays',
  },
}));

jest.mock('../../frontend/src/renderer/app/providers/AppContextHooks', () => ({
  useAppConfigContext: () => mockAppConfigContext,
}));

describe('SettingsSection', () => {
  const defaultConfig = {
    voice_mode_enabled: false,
    speech_mode_enabled: false,
    include_query_screenshot: true,
  };

  function renderSettingsSection(overrides = {}) {
    const {
      config = defaultConfig,
      onConfigChange = jest.fn(),
    } = overrides;
    return render(
      <SettingsSection
        config={config}
        onConfigChange={onConfigChange}
      />,
    );
  }

  beforeEach(() => {
    mockInvoke.mockClear();
    localStorage.clear();
    mockAppConfigContext = {
      wakewordEnabled: true,
      wakewordSuppressed: false,
      setWakewordEnabled: jest.fn(),
    };
  });

  test('wakeword toggle uses app-config wakeword setter', () => {
    renderSettingsSection();

    fireEvent.click(screen.getByLabelText('Wakeword Listening (Hey Jarvis)'));
    expect(mockAppConfigContext.setWakewordEnabled).toHaveBeenCalledWith(false);
  });

  test('audio and screenshot toggles emit config updates', () => {
    const onConfigChange = jest.fn();
    renderSettingsSection({ onConfigChange });

    fireEvent.click(screen.getByLabelText('Voice Mode (Nova Gateway)'));
    fireEvent.click(screen.getByLabelText('Speech Replies (TTS)'));
    fireEvent.click(screen.getByLabelText('Attach Image To User Query'));

    expect(onConfigChange).toHaveBeenNthCalledWith(1, { voice_mode_enabled: true });
    expect(onConfigChange).toHaveBeenNthCalledWith(2, { speech_mode_enabled: true });
    expect(onConfigChange).toHaveBeenNthCalledWith(3, { include_query_screenshot: false });
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

  test('falls back to primary display when stored display id is stale', async () => {
    localStorage.setItem('desktop-assistant-display-id', '999');
    mockInvoke.mockResolvedValueOnce([
      { id: 1, label: 'Main Monitor', isPrimary: true, bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
      { id: 2, label: 'Side Monitor', isPrimary: false, bounds: { x: 1920, y: 0, width: 1920, height: 1080 } },
    ]);

    renderSettingsSection();

    const displaySelect = await screen.findByLabelText('Active Display');
    await waitFor(() => expect(displaySelect).toHaveValue('1'));
    expect(localStorage.getItem('desktop-assistant-display-id')).toBe('1');
  });
});
