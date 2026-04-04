import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('../../frontend/src/renderer/app/providers/AppContextHooks', () => ({
  useAppConfigContext: () => ({
    wakewordEnabled: true,
    wakewordSuppressed: false,
    setWakewordEnabled: jest.fn(),
    globalAgentStopShortcutStatus: null,
  }),
}));

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: jest.fn(),
  },
  INVOKE_CHANNELS: {
    SET_AGENT_SUDO_ACCESS: 'set-agent-sudo-access',
  },
}));

import GeneralSettingsTab from '../../frontend/src/renderer/features/dashboard/components/sections/settings/GeneralSettingsTab';

describe('GeneralSettingsTab', () => {
  test('does not render backend-owned speech provider controls', () => {
    const onConfigChange = jest.fn();

    render(
      <GeneralSettingsTab
        config={{
          wakeword_stt_enabled: false,
          agent_full_sudo_enabled: false,
          show_tool_logs: false,
          global_agent_stop_shortcut: 'CommandOrControl+Shift+Escape',
        }}
        onConfigChange={onConfigChange}
      />,
    );

    expect(screen.queryByText('Speech engine')).not.toBeInTheDocument();
    expect(screen.queryByText('Text-to-speech name')).not.toBeInTheDocument();
  });
});
