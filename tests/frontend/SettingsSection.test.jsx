import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

import SettingsSection from '../../frontend/src/renderer/features/dashboard/components/sections/SettingsSection';

const mockInvoke = jest.fn();
const mockRestartOnboarding = jest.fn();
const mockRequestPermission = jest.fn();
const mockRunPermissionProbe = jest.fn();
const mockBootstrapPermissions = jest.fn();
const mockIpcListeners = new Map();

let mockAppConfigContext = {
  wakewordEnabled: true,
  wakewordSuppressed: false,
  setWakewordEnabled: jest.fn(),
  globalAgentStopShortcutStatus: null,
  updateConfig: jest.fn(),
};
let mockTranscriptSessionInfo = {
  conversationRef: null,
  userId: null,
};
let mockPermissionStoreState = {};

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: (...args) => mockInvoke(...args),
    on: (channel, listener) => {
      mockIpcListeners.set(channel, listener);
      return () => {
        mockIpcListeners.delete(channel);
      };
    },
  },
  INVOKE_CHANNELS: {
    SET_AGENT_SUDO_ACCESS: 'set-agent-sudo-access',
    CLEAR_LOCAL_MEMORY: 'clear-local-memory',
    CLEAR_CHAT_HISTORY: 'clear-chat-history',
    CHECK_PERMISSION: 'check-permission',
    REQUEST_PERMISSION: 'request-permission',
  },
  ON_CHANNELS: {
    WORKSPACE_ACCESS_UPDATED: 'workspace-access-updated',
  },
}));

jest.mock('../../frontend/src/renderer/app/providers/AppContextHooks', () => ({
  useAppConfigContext: () => mockAppConfigContext,
}));

jest.mock('../../frontend/src/renderer/features/dashboard/hooks/useTranscriptSessionInfo', () => ({
  useTranscriptSessionInfo: () => mockTranscriptSessionInfo,
}));

jest.mock('../../frontend/src/renderer/features/permissions/stores/permissionStore', () => ({
  usePermissionStore: (selector) => selector(mockPermissionStoreState),
}));

describe('SettingsSection', () => {
  const defaultConfig = {
    wakeword_stt_enabled: false,
    agent_full_sudo_enabled: false,
    show_tool_logs: false,
    global_agent_stop_shortcut: 'CommandOrControl+Alt+.',
    show_additional_models: true,
  };

  function renderSettingsSection(overrides = {}) {
    const {
      config = defaultConfig,
      onConfigChange = jest.fn(),
      onClose = jest.fn(),
      onChatsCleared = jest.fn(),
      initialTab = 'general',
    } = overrides;
    return render(
      <SettingsSection
        config={config}
        onConfigChange={onConfigChange}
        onClose={onClose}
        onChatsCleared={onChatsCleared}
        initialTab={initialTab}
      />,
    );
  }

  beforeEach(() => {
    mockInvoke.mockReset();
    mockRestartOnboarding.mockReset();
    mockRequestPermission.mockReset();
    mockRunPermissionProbe.mockReset();
    mockBootstrapPermissions.mockReset();
    mockIpcListeners.clear();
    mockInvoke.mockImplementation(async (channel) => {
      if (channel === 'check-permission') {
        return {
          success: true,
          data: {
            status: {
              permission_id: 'filesystem_workspace_access',
              granted: false,
              details: {
                selected_paths: [],
              },
            },
          },
        };
      }
      return { success: true };
    });
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    jest.spyOn(window, 'alert').mockImplementation(() => {});
    mockAppConfigContext = {
      wakewordEnabled: true,
      wakewordSuppressed: false,
      setWakewordEnabled: jest.fn(),
      globalAgentStopShortcutStatus: null,
      updateConfig: jest.fn(),
    };
    mockTranscriptSessionInfo = {
      conversationRef: null,
      userId: null,
    };
    mockPermissionStoreState = {
      bootstrapped: true,
      isLoading: false,
      permissions: [
        {
          permission_id: 'browser_automation',
          label: 'Browser automation',
          access_kind: 'app_capability',
          grant_action_label: 'Open browser',
        },
      ],
      statusesByPermissionId: {
        browser_automation: {
          permission_id: 'browser_automation',
          status: 'needs-action',
          granted: false,
          reason: 'Open the WindieOS browser and sign in with the profile WindieOS should use for browser help.',
          details: {},
        },
      },
      error: '',
      restartOnboarding: (...args) => mockRestartOnboarding(...args),
      bootstrapPermissions: (...args) => mockBootstrapPermissions(...args),
      requestPermission: (...args) => mockRequestPermission(...args),
      runPermissionProbe: (...args) => mockRunPermissionProbe(...args),
    };
    mockRunPermissionProbe.mockResolvedValue(undefined);
    mockRequestPermission.mockResolvedValue({
      permission_id: 'browser_automation',
      status: 'granted',
      granted: true,
      reason: 'WindieOS browser is ready. Sign in with the profile WindieOS should use for browser help.',
      details: {},
    });
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
      globalAgentStopShortcutStatus: null,
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

  test('view tool logs toggle emits config update payload', () => {
    const onConfigChange = jest.fn();
    renderSettingsSection({ onConfigChange });

    fireEvent.click(screen.getByLabelText('View tool logs'));
    expect(onConfigChange).toHaveBeenCalledWith({ show_tool_logs: true });
  });

  test('shows the configured global stop shortcut label', () => {
    renderSettingsSection({
      config: {
        ...defaultConfig,
        global_agent_stop_shortcut: 'CommandOrControl+Shift+.',
      },
    });

    expect(screen.getByText(/Current binding:/)).toHaveTextContent('Ctrl + Shift + .');
  });

  test('global stop shortcut dropdown emits config update payload', () => {
    const onConfigChange = jest.fn();
    renderSettingsSection({ onConfigChange });

    fireEvent.change(screen.getByDisplayValue('Ctrl + Alt + .'), {
      target: { value: 'CommandOrControl+Shift+.' },
    });

    expect(onConfigChange).toHaveBeenCalledWith({
      global_agent_stop_shortcut: 'CommandOrControl+Shift+.',
    });
  });

  test('shows a fallback notice when the requested global stop shortcut is unavailable', () => {
    mockAppConfigContext = {
      wakewordEnabled: true,
      wakewordSuppressed: false,
      setWakewordEnabled: jest.fn(),
      globalAgentStopShortcutStatus: {
        requestedAccelerator: 'CommandOrControl+Alt+.',
        resolvedAccelerator: 'CommandOrControl+Shift+.',
        usingFallback: true,
        registrationFailed: false,
      },
    };

    renderSettingsSection();

    expect(screen.getByText(/Requested shortcut unavailable on this system/)).toHaveTextContent(
      'Requested shortcut unavailable on this system. WindieOS switched to Ctrl + Shift + . and saved that binding locally.',
    );
  });

  test('shows a registration failure notice when no global stop shortcut could be registered', () => {
    mockAppConfigContext = {
      wakewordEnabled: true,
      wakewordSuppressed: false,
      setWakewordEnabled: jest.fn(),
      globalAgentStopShortcutStatus: {
        requestedAccelerator: 'CommandOrControl+Alt+.',
        resolvedAccelerator: 'CommandOrControl+Alt+.',
        usingFallback: false,
        registrationFailed: true,
      },
    };

    renderSettingsSection();

    expect(screen.getByText(/Global stop shortcut could not be registered/)).toBeInTheDocument();
  });

  test('agent full sudo toggle confirms, invokes os auth, then persists on success', async () => {
    const onConfigChange = jest.fn();
    renderSettingsSection({ onConfigChange });

    const sudoToggle = screen.getByLabelText('Agent Full Sudo Access');
    fireEvent.click(sudoToggle);

    expect(window.confirm).toHaveBeenCalledWith(
      'Warning: This action will enable the agent to have sudo access without password prompts. Continue?',
    );
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('set-agent-sudo-access', { enabled: true });
      expect(onConfigChange).toHaveBeenCalledWith({ agent_full_sudo_enabled: true });
      expect(sudoToggle).not.toBeDisabled();
    });
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

    const sudoToggle = screen.getByLabelText('Agent Full Sudo Access');
    fireEvent.click(sudoToggle);
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(
        'User canceled or denied OS authentication while trying to enable passwordless sudo access.',
      );
      expect(onConfigChange).not.toHaveBeenCalledWith({ agent_full_sudo_enabled: true });
      expect(sudoToggle).not.toBeDisabled();
    });
  });

  test('renders a memory tab in the settings sidebar', () => {
    renderSettingsSection();

    expect(screen.getByTestId('settings-tab-memory')).toBeInTheDocument();
  });

  test('renders an onboarding tab in the settings sidebar', () => {
    renderSettingsSection();

    expect(screen.getByTestId('settings-tab-onboarding')).toBeInTheDocument();
  });

  test('renders a workspace tab in the settings sidebar', () => {
    renderSettingsSection();

    expect(screen.getByTestId('settings-tab-workspace')).toBeInTheDocument();
  });

  test('renders a browser tab in the settings sidebar', () => {
    renderSettingsSection();

    expect(screen.getByTestId('settings-tab-browser')).toBeInTheDocument();
  });

  test('browser tab reuses the browser permission flow and persists enabled state on success', async () => {
    renderSettingsSection({ initialTab: 'browser' });

    await waitFor(() => {
      expect(mockRunPermissionProbe).toHaveBeenCalledWith('browser_automation');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open Windie Browser' }));

    await waitFor(() => {
      expect(mockRequestPermission).toHaveBeenCalledWith('browser_automation');
      expect(mockAppConfigContext.updateConfig).toHaveBeenCalledWith({
        browser_automation_enabled: true,
      });
    });

    expect(screen.getByText('WindieOS browser is ready. Sign in with the profile WindieOS should use for browser help.')).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
  });

  test('browser tab shows returned failure reason and remediation inline', async () => {
    mockRequestPermission.mockResolvedValueOnce({
      permission_id: 'browser_automation',
      status: 'needs-action',
      granted: false,
      reason: 'WindieOS could not open the browser yet. Retry Open browser.',
      details: {
        remediation: 'Retry Open browser after checking that the WindieOS browser runtime is installed and available.',
      },
    });

    renderSettingsSection({ initialTab: 'browser' });

    fireEvent.click(screen.getByRole('button', { name: 'Open Windie Browser' }));

    expect(await screen.findByText('WindieOS could not open the browser yet. Retry Open browser.')).toBeInTheDocument();
    expect(screen.getByText('Retry Open browser after checking that the WindieOS browser runtime is installed and available.')).toBeInTheDocument();
    expect(mockAppConfigContext.updateConfig).not.toHaveBeenCalledWith({
      browser_automation_enabled: true,
    });
  });

  test('workspace tab shows the active workspace and can change it', async () => {
    mockInvoke.mockImplementation(async (channel) => {
      if (channel === 'check-permission') {
        return {
          success: true,
          data: {
            status: {
              permission_id: 'filesystem_workspace_access',
              granted: true,
              details: {
                selected_paths: ['D:\\Assistants\\WindieOS_workspace\\windieos'],
              },
            },
          },
        };
      }
      if (channel === 'request-permission') {
        return {
          success: true,
          data: {
            status: {
              permission_id: 'filesystem_workspace_access',
              granted: true,
              details: {
                selected_paths: ['D:\\Assistants\\WindieOS_workspace\\windieos\\frontend'],
              },
            },
          },
        };
      }
      return { success: true };
    });

    renderSettingsSection({ initialTab: 'workspace' });

    expect(await screen.findByText('D:\\Assistants\\WindieOS_workspace\\windieos')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Change workspace' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('request-permission', {
        permissionId: 'filesystem_workspace_access',
      });
    });
    expect(await screen.findByText('Active workspace set to frontend.')).toBeInTheDocument();
    expect(screen.getByText('D:\\Assistants\\WindieOS_workspace\\windieos\\frontend')).toBeInTheDocument();
  });

  test('workspace tab updates when the main process broadcasts a workspace change', async () => {
    renderSettingsSection({ initialTab: 'workspace' });

    await waitFor(() => {
      expect(mockIpcListeners.has('workspace-access-updated')).toBe(true);
    });

    act(() => {
      mockIpcListeners.get('workspace-access-updated')?.({
        granted: true,
        workspaceName: 'client-demo',
        workspacePath: 'D:\\Assistants\\client-demo',
      });
    });

    expect(await screen.findByText('D:\\Assistants\\client-demo')).toBeInTheDocument();
  });

  test('onboarding tab can send the user back to onboarding', () => {
    renderSettingsSection({ initialTab: 'onboarding' });

    fireEvent.click(screen.getByTestId('settings-tab-onboarding'));
    fireEvent.click(screen.getByRole('button', { name: 'Open onboarding' }));

    expect(mockRestartOnboarding).toHaveBeenCalledTimes(1);
  });

  test('nuke memory invokes clear-local-memory for the resolved user id', async () => {
    mockTranscriptSessionInfo = {
      conversationRef: 'conv-memory',
      userId: 'user-memory',
    };
    renderSettingsSection({ initialTab: 'memory' });

    fireEvent.click(screen.getByTestId('settings-tab-memory'));
    fireEvent.click(screen.getByRole('button', { name: 'Nuke memory' }));

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalledWith(
        'Delete all local episodic and semantic memory? Past chats will be kept.',
      );
      expect(mockInvoke).toHaveBeenCalledWith('clear-local-memory', { userId: 'user-memory' });
      expect(screen.getByText('Local episodic and semantic memory deleted.')).toBeInTheDocument();
    });
  });

  test('nuke chats invokes clear-chat-history and notifies the parent on success', async () => {
    const onChatsCleared = jest.fn();
    renderSettingsSection({
      initialTab: 'memory',
      onChatsCleared,
    });

    fireEvent.click(screen.getByTestId('settings-tab-memory'));
    fireEvent.click(screen.getByRole('button', { name: 'Nuke chats' }));

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalledWith(
        'Delete all past chats? Local episodic and semantic memory will be kept.',
      );
      expect(mockInvoke).toHaveBeenCalledWith('clear-chat-history', { userId: 'default_user' });
      expect(onChatsCleared).toHaveBeenCalled();
      expect(screen.getByText('Past chats deleted.')).toBeInTheDocument();
    });
  });
});
