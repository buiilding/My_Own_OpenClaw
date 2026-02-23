import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

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
  beforeEach(() => {
    mockInvoke.mockClear();
    mockAppConfigContext = {
      wakewordEnabled: true,
      wakewordSuppressed: false,
      setWakewordEnabled: jest.fn(),
    };
  });

  test('wakeword toggle uses app-config wakeword setter', () => {
    render(
      <SettingsSection
        config={{ voice_mode_enabled: false, speech_mode_enabled: false, include_query_screenshot: true }}
        onConfigChange={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText('Wakeword Listening (Hey Jarvis)'));
    expect(mockAppConfigContext.setWakewordEnabled).toHaveBeenCalledWith(false);
  });

  test('audio and screenshot toggles emit config updates', () => {
    const onConfigChange = jest.fn();
    render(
      <SettingsSection
        config={{ voice_mode_enabled: false, speech_mode_enabled: false, include_query_screenshot: true }}
        onConfigChange={onConfigChange}
      />,
    );

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

    render(
      <SettingsSection
        config={{ voice_mode_enabled: false, speech_mode_enabled: false, include_query_screenshot: true }}
        onConfigChange={jest.fn()}
      />,
    );

    expect(screen.getByText('Listening is paused while the chatbox is visible.')).toBeInTheDocument();
  });
});
