/**
 * Covers settings section. behavior in the frontend test suite.
 */

import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

import SettingsSection from '../../src/renderer/features/dashboard/components/sections/SettingsSection';

const mockInvoke = jest.fn();
const mockClearLocalMemory = jest.fn();
const mockClearChatHistory = jest.fn();
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

jest.mock('../../src/renderer/infrastructure/ipc/bridge', () => ({
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
    CHECK_PERMISSION: 'check-permission',
    REQUEST_PERMISSION: 'request-permission',
  },
  ON_CHANNELS: {
    WORKSPACE_ACCESS_UPDATED: 'workspace-access-updated',
  },
}));

jest.mock('../../src/renderer/app/runtime/desktopMemoryRuntimeClient', () => ({
  DesktopMemoryRuntimeClient: {
    clearLocalMemory: (...args) => mockClearLocalMemory(...args),
    clearChatHistory: (...args) => mockClearChatHistory(...args),
    resolveMemoryAdminUserId: (sessionInfo) => {
      const userId = typeof sessionInfo?.userId === 'string' ? sessionInfo.userId.trim() : '';
      return userId && userId !== 'default_user' ? userId : null;
    },
  },
}));

jest.mock('../../src/renderer/app/providers/AppConfigContext', () => ({
  useAppConfigContext: () => mockAppConfigContext,
}));

jest.mock('../../src/renderer/app/skin/desktopRuntimeSkin', () => {
  const desktopRuntimeSkin = {
    settings: {
      agent: {
        title: 'Agent',
        customInstructions: {
          label: 'System prompt',
          description: '',
        },
        extensions: {
          label: 'Extensions',
          description: '',
          emptyPlugins: 'No local tool plugins loaded',
        },
        localTools: {
          label: 'Local tools',
          description: 'These are included in the client tool manifest when enabled.',
          ids: ['mouse_control'],
        },
        remoteTools: {
          label: 'Cloud tools',
          description: '',
          unavailableFallback: 'Unavailable',
          ids: ['web_search'],
        },
        toolAcceptance: {
          pending: '',
          rejectedPrefix: 'Rejected',
          acceptedSummary: 'Accepted schema',
          argumentResolutionFallback: 'passthrough',
          executionTargetLabels: {
            backend: 'cloud runtime',
            local_runtime: 'local runtime',
          },
        },
      },
      general: {
        title: 'General',
        wakeword: {
          label: 'Wakeword Listening (Hey Jarvis)',
          description: 'Allow wakeword detection when the chat pill is hidden.',
          suppressedDescription: 'Listening is paused while the chatbox is visible.',
        },
        speechAfterWakeword: {
          label: 'Speech-To-Text After "Hey Jarvis"',
          description: 'After wakeword, open chat pill and transcribe speech into the input field.',
        },
        toolLogs: {
          label: 'View tool logs',
          description: 'Show raw tool-call and tool-output cards in chat.',
        },
        globalStopShortcut: {
          label: 'Global Stop Shortcut',
          descriptionPrefix: 'Ends the active agent loop from anywhere. Current binding:',
          fallbackPrefix: 'Requested shortcut unavailable on this system. Sample Desktop switched to',
          fallbackSuffix: 'and saved that binding locally.',
          registrationFailure: 'Global stop shortcut could not be registered. Choose another binding if you need stop-from-anywhere behavior.',
          focusedWindowHint: 'Focused chat and dashboard windows still support Esc for stop.',
        },
      },
      browser: {
        title: 'Browser',
        browserName: 'Sample Browser',
        description: 'Open the dedicated browser profile Sample Desktop uses for sign-in state, browsing, navigation, and web tasks.',
        actionLabel: 'Open Sample Browser',
        actionDescription: 'Reopen the persistent browser window Sample Desktop manages so you can sign in or verify the session it should reuse later.',
        openingLabel: 'Opening...',
        openErrorFallback: 'Unable to open Sample Browser.',
        openErrorPrefix: 'Unable to open Sample Browser:',
      },
      workspace: {
        title: 'Workspace',
        activeWorkspaceLabel: 'Active workspace',
        description: 'Sample Desktop uses the active workspace as the default folder for file reads, shell commands, and repo-aware tasks when a tool call does not provide its own directory.',
        emptyWorkspace: 'No workspace selected yet.',
        changeWorkspaceLabel: 'Change workspace',
        selectingWorkspaceLabel: 'Opening...',
        updatedFallback: 'Active workspace updated.',
        updateFailureFallback: 'Failed to change active workspace.',
      },
      memory: {
        title: 'Memory',
        deleteMemories: {
          label: 'Delete saved memories',
          description: 'Deletes saved episodic interaction memories and semantic memories. Chat transcripts remain.',
          actionLabel: 'Delete memories',
          pendingLabel: 'Deleting...',
          confirmMessage: 'Delete saved episodic interaction memories and semantic memories? Chat transcripts will be kept.',
          successMessage: 'Saved memories deleted.',
        },
        deleteChats: {
          label: 'Delete chat history',
          description: 'Deletes saved chat transcripts, revisions, and titles. Memories remain.',
          actionLabel: 'Delete chats',
          pendingLabel: 'Deleting...',
          confirmMessage: 'Delete saved chat transcripts, revisions, and titles? Memories will be kept.',
          successMessage: 'Chat history deleted.',
        },
        requireUserMessage: 'Connect Sample Desktop before deleting saved data.',
        destructiveFailureFallback: 'Failed to complete destructive action',
      },
    },
  };
  return {
    desktopRuntimeSkin,
    DesktopRuntimeSkin: {
      desktopRuntimeSkin,
      formatToolAcceptanceRuntimeSummary: (acceptedTool) => (
        `${acceptedTool.name || 'tool'} uses ${acceptedTool.argument_resolution || 'passthrough'}`
      ),
    },
  };
});

jest.mock('../../src/renderer/app/runtime/desktopTranscriptSessionInfoRuntimeClient', () => ({
  DesktopTranscriptSessionInfoRuntimeClient: {
    useDesktopTranscriptSessionInfo: () => mockTranscriptSessionInfo,
  },
}));

jest.mock('../../src/renderer/features/permissions/stores/permissionStore', () => ({
  usePermissionStore: (selector) => selector(mockPermissionStoreState),
}));

describe('SettingsSection', () => {
  const defaultConfig = {
    wakeword_stt_enabled: false,
    show_tool_logs: false,
    global_agent_stop_shortcut: 'CommandOrControl+Alt+.',
    show_additional_models: true,
    appearance_mode: 'system',
    appearance_theme: {
      light: {
        accent: '#339CFF',
        background: '#FFFFFF',
        foreground: '#4C4C4C',
        user_message_background: '#339CFF',
        user_message_foreground: '#FFFFFF',
        ui_font: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        code_font: 'ui-monospace, "SFMono-Regular", monospace',
        translucent_sidebar: true,
        contrast: 45,
      },
      dark: {
        accent: '#339CFF',
        background: '#181818',
        foreground: '#FFFFFF',
        user_message_background: '#339CFF',
        user_message_foreground: '#FFFFFF',
        ui_font: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        code_font: 'ui-monospace, "SFMono-Regular", monospace',
        translucent_sidebar: true,
        contrast: 60,
      },
    },
  };

  function renderSettingsSection(overrides = {}) {
    const {
      config = defaultConfig,
      onConfigChange = jest.fn(),
      onClose = jest.fn(),
      onChatsCleared = jest.fn(),
      initialTab = 'general',
      memoryAdminUserId = null,
    } = overrides;
    return render(
      <SettingsSection
        config={config}
        onConfigChange={onConfigChange}
        onClose={onClose}
        onChatsCleared={onChatsCleared}
        initialTab={initialTab}
        memoryAdminUserId={memoryAdminUserId}
      />,
    );
  }

  beforeEach(() => {
    mockInvoke.mockReset();
    mockClearLocalMemory.mockReset();
    mockClearChatHistory.mockReset();
    mockClearLocalMemory.mockResolvedValue({});
    mockClearChatHistory.mockResolvedValue({});
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
          reason: 'Open the Sample Desktop browser and sign in with the profile Sample Desktop should use for browser help.',
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
      reason: 'Sample Desktop browser is ready. Sign in with the profile Sample Desktop should use for browser help.',
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

  test('renders only the left settings back button', () => {
    renderSettingsSection();
    expect(screen.getAllByLabelText('Back to dashboard')).toHaveLength(1);
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
      'Requested shortcut unavailable on this system. Sample Desktop switched to Ctrl + Shift + . and saved that binding locally.',
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

  test('renders a memory tab in the settings sidebar', () => {
    renderSettingsSection();

    expect(screen.getByTestId('settings-tab-memory')).toBeInTheDocument();
  });

  test('renders an appearance tab in the settings sidebar', () => {
    renderSettingsSection();

    expect(screen.getByTestId('settings-tab-appearance')).toBeInTheDocument();
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

  test('does not mount the removed data-controls compatibility branch', () => {
    renderSettingsSection({ initialTab: 'data-controls' });

    expect(screen.getByText('Settings for settings will appear here.')).toBeInTheDocument();
    expect(screen.queryByText('Permissions')).not.toBeInTheDocument();
    expect(mockBootstrapPermissions).not.toHaveBeenCalled();
  });

  test('browser tab reuses the browser permission flow and persists enabled state on success', async () => {
    renderSettingsSection({ initialTab: 'browser' });

    await waitFor(() => {
      expect(mockRunPermissionProbe).toHaveBeenCalledWith('browser_automation');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open Sample Browser' }));

    await waitFor(() => {
      expect(mockRequestPermission).toHaveBeenCalledWith('browser_automation');
      expect(mockAppConfigContext.updateConfig).toHaveBeenCalledWith({
        browser_automation_enabled: true,
      });
    });

    expect(screen.getByText('Sample Desktop browser is ready. Sign in with the profile Sample Desktop should use for browser help.')).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
  });

  test('browser tab shows returned failure reason and remediation inline', async () => {
    mockRequestPermission.mockResolvedValueOnce({
      permission_id: 'browser_automation',
      status: 'needs-action',
      granted: false,
      reason: 'Sample Desktop could not open the browser yet. Retry Open browser.',
      details: {
        remediation: 'Retry Open browser after checking that the Sample Desktop browser runtime is installed and available.',
      },
    });

    renderSettingsSection({ initialTab: 'browser' });

    fireEvent.click(screen.getByRole('button', { name: 'Open Sample Browser' }));

    expect(await screen.findByText('Sample Desktop could not open the browser yet. Retry Open browser.')).toBeInTheDocument();
    expect(screen.getByText('Retry Open browser after checking that the Sample Desktop browser runtime is installed and available.')).toBeInTheDocument();
    expect(mockAppConfigContext.updateConfig).not.toHaveBeenCalledWith({
      browser_automation_enabled: true,
    });
  });

  test('browser tab renders permission request rejections inline', async () => {
    mockRequestPermission.mockRejectedValueOnce(new Error('Browser permission IPC failed'));

    renderSettingsSection({ initialTab: 'browser' });

    fireEvent.click(screen.getByRole('button', { name: 'Open Sample Browser' }));

    expect(await screen.findByText(
      'Unable to open Sample Browser: Browser permission IPC failed',
    )).toBeInTheDocument();
    expect(mockAppConfigContext.updateConfig).not.toHaveBeenCalledWith({
      browser_automation_enabled: true,
    });
  });

  test('appearance tab updates theme controls through renderer config', () => {
    const onConfigChange = jest.fn();
    const onClose = jest.fn();
    const onChatsCleared = jest.fn();
    const lightConfig = {
      ...defaultConfig,
      appearance_mode: 'light',
    };
    const view = renderSettingsSection({
      initialTab: 'appearance',
      config: lightConfig,
      onConfigChange,
      onClose,
      onChatsCleared,
    });

    expect(view.container.querySelectorAll('.settings-surface-theme-card')).toHaveLength(1);
    expect(screen.getByText('Light theme')).toBeInTheDocument();
    expect(screen.queryByText('Dark theme')).not.toBeInTheDocument();
    expect(screen.getByText('Use light, dark, or match your system')).toBeInTheDocument();
    expect(screen.queryByText('Import')).not.toBeInTheDocument();
    expect(screen.queryByText('Copy theme')).not.toBeInTheDocument();
    expect(screen.queryByText('Codex')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Light theme user message background'), {
      target: { value: '#1D4ED8' },
    });

    expect(onConfigChange).toHaveBeenCalledWith({
      appearance_theme: {
        ...defaultConfig.appearance_theme,
        light: {
          ...defaultConfig.appearance_theme.light,
          user_message_background: '#1D4ED8',
        },
      },
    });

    fireEvent.change(screen.getByLabelText('Light theme user message text'), {
      target: { value: '#F8FAFC' },
    });

    expect(onConfigChange).toHaveBeenCalledWith({
      appearance_theme: {
        ...defaultConfig.appearance_theme,
        light: {
          ...defaultConfig.appearance_theme.light,
          user_message_foreground: '#F8FAFC',
        },
      },
    });

    view.rerender(
      <SettingsSection
        config={{
          ...defaultConfig,
          appearance_mode: 'dark',
        }}
        onConfigChange={onConfigChange}
        onClose={onClose}
        onChatsCleared={onChatsCleared}
        initialTab="appearance"
      />,
    );

    expect(view.container.querySelectorAll('.settings-surface-theme-card')).toHaveLength(1);
    expect(screen.getByText('Dark theme')).toBeInTheDocument();
    expect(screen.queryByText('Light theme')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Dark theme accent'), {
      target: { value: '#007AFF' },
    });

    expect(onConfigChange).toHaveBeenCalledWith({
      appearance_theme: {
        ...defaultConfig.appearance_theme,
        dark: {
          ...defaultConfig.appearance_theme.dark,
          accent: '#007AFF',
        },
      },
    });

    fireEvent.click(screen.getByRole('button', { name: /Dark/ }));
    expect(onConfigChange).toHaveBeenCalledWith({ appearance_mode: 'dark' });
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
                selected_paths: ['D:\\Assistants\\project-alpha'],
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
                selected_paths: ['D:\\Assistants\\project-alpha\\frontend'],
              },
            },
          },
        };
      }
      return { success: true };
    });

    renderSettingsSection({ initialTab: 'workspace' });

    expect(await screen.findByText('D:\\Assistants\\project-alpha')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Change workspace' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('request-permission', {
        permissionId: 'filesystem_workspace_access',
      });
    });
    expect(await screen.findByText('Active workspace set to frontend.')).toBeInTheDocument();
    expect(screen.getByText('D:\\Assistants\\project-alpha\\frontend')).toBeInTheDocument();
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

  test('delete memories invokes the memory runtime client without renderer user id', async () => {
    mockTranscriptSessionInfo = {
      conversationRef: null,
      userId: null,
    };
    renderSettingsSection({ initialTab: 'memory' });

    fireEvent.click(screen.getByTestId('settings-tab-memory'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete memories' }));

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalledWith(
        'Delete saved episodic interaction memories and semantic memories? Chat transcripts will be kept.',
      );
      expect(mockClearLocalMemory).toHaveBeenCalledWith();
      expect(screen.getByText('Saved memories deleted.')).toBeInTheDocument();
    });
  });

  test('delete chats invokes the memory runtime client and notifies the parent on success', async () => {
    const onChatsCleared = jest.fn();
    mockTranscriptSessionInfo = {
      conversationRef: 'conv-memory',
      userId: 'user-memory',
    };
    renderSettingsSection({
      initialTab: 'memory',
      onChatsCleared,
    });

    fireEvent.click(screen.getByTestId('settings-tab-memory'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete chats' }));

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalledWith(
        'Delete saved chat transcripts, revisions, and titles? Memories will be kept.',
      );
      expect(mockClearChatHistory).toHaveBeenCalledWith('user-memory');
      expect(onChatsCleared).toHaveBeenCalled();
      expect(screen.getByText('Chat history deleted.')).toBeInTheDocument();
    });
  });

  test('delete chats uses the dashboard effective user id before transcript session fallback', async () => {
    const onChatsCleared = jest.fn();
    mockTranscriptSessionInfo = {
      conversationRef: 'conv-memory',
      userId: 'default_user',
    };
    renderSettingsSection({
      initialTab: 'memory',
      memoryAdminUserId: 'user-dashboard',
      onChatsCleared,
    });

    fireEvent.click(screen.getByTestId('settings-tab-memory'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete chats' }));

    await waitFor(() => {
      expect(mockClearChatHistory).toHaveBeenCalledWith('user-dashboard');
      expect(onChatsCleared).toHaveBeenCalled();
      expect(screen.getByText('Chat history deleted.')).toBeInTheDocument();
    });
  });

  test('delete chats still reports delete success when parent refresh fails', async () => {
    const onChatsCleared = jest.fn(async () => {
      throw new Error('refresh failed');
    });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockTranscriptSessionInfo = {
      conversationRef: 'conv-memory',
      userId: 'user-memory',
    };
    renderSettingsSection({
      initialTab: 'memory',
      onChatsCleared,
    });

    fireEvent.click(screen.getByTestId('settings-tab-memory'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete chats' }));

    await waitFor(() => {
      expect(mockClearChatHistory).toHaveBeenCalledWith('user-memory');
      expect(onChatsCleared).toHaveBeenCalled();
      expect(screen.getByText('Chat history deleted.')).toBeInTheDocument();
    });
    expect(screen.queryByText('refresh failed')).not.toBeInTheDocument();
    expect(warnSpy).toHaveBeenCalledWith(
      'Destructive action succeeded, but refresh callback failed.',
      expect.any(Error),
    );
  });

  test('delete actions require an active user id before confirming', async () => {
    mockTranscriptSessionInfo = {
      conversationRef: null,
      userId: null,
    };
    renderSettingsSection({ initialTab: 'memory' });

    fireEvent.click(screen.getByTestId('settings-tab-memory'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete chats' }));

    expect(window.confirm).not.toHaveBeenCalled();
    expect(mockClearChatHistory).not.toHaveBeenCalled();
    expect(screen.getByText('Connect Sample Desktop before deleting saved data.')).toBeInTheDocument();
  });
});
