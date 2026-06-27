/**
 * Covers desktop onboarding slideshow. behavior in the frontend test suite.
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import DesktopOnboardingSlideshow from '../../src/renderer/features/onboarding/components/DesktopOnboardingSlideshow';

const mockBootstrapPermissions = jest.fn();
const mockRequestPermission = jest.fn();
const mockRunPermissionProbe = jest.fn();
const mockCompleteOnboarding = jest.fn();
const mockUpdateConfig = jest.fn();
const mockIpcInvoke = jest.fn(async () => ({ success: true }));

const mockPermissionState = {
  bootstrapped: true,
  isLoading: false,
  permissions: [
    {
      permission_id: 'screen_capture',
      label: 'Screen capture',
      description: 'Allow the agent host to capture the current screen for screenshot context and visual grounding.',
      access_kind: 'os_permission',
      grant_action_label: 'Grant',
      required_now: true,
    },
    {
      permission_id: 'system_events_automation',
      label: 'System Events automation',
      description: 'Allow the agent host to control macOS System Events so window focusing and other UI automation steps do not prompt mid-task.',
      access_kind: 'os_permission',
      grant_action_label: 'Grant',
      required_now: true,
    },
    {
      permission_id: 'microphone',
      label: 'Microphone',
      description: 'Allow voice mode and wakeword audio capture.',
      access_kind: 'os_permission',
      grant_action_label: 'Grant',
      required_now: false,
    },
    {
      permission_id: 'browser_automation',
      label: 'Browser automation',
      description: 'Open the dedicated browser so you can sign in with the profile the agent host should use for browsing, navigation, and web tasks.',
      access_kind: 'app_capability',
      grant_action_label: 'Open browser',
      required_now: false,
    },
  ],
  statusesByPermissionId: {
    screen_capture: {
      status: 'needs-action',
      granted: false,
      reason: 'Grant Screen Recording in System Settings > Privacy & Security.',
    },
    system_events_automation: {
      status: 'needs-action',
      granted: false,
      reason: 'Sample Desktop still needs permission to control System Events. Click Grant to show the macOS Automation prompt.',
    },
    microphone: {
      status: 'granted',
      granted: true,
      reason: 'Microphone access is granted.',
    },
    browser_automation: {
      status: 'needs-action',
      granted: false,
      reason: 'Open the Sample Desktop browser and sign in with the profile Sample Desktop should use for browser help.',
    },
  },
  missingRequiredPermissions: [],
  error: '',
  bootstrapPermissions: mockBootstrapPermissions,
  completeOnboarding: mockCompleteOnboarding,
  requestPermission: mockRequestPermission,
  runPermissionProbe: mockRunPermissionProbe,
  recheckAllPermissions: jest.fn(),
};

jest.mock('../../src/renderer/features/permissions/stores/permissionStore', () => ({
  usePermissionStore: (selector) => selector(mockPermissionState),
}));

jest.mock('../../src/renderer/app/providers/AppConfigContext', () => ({
  useAppConfigContext: () => ({
    updateConfig: (...args) => mockUpdateConfig(...args),
  }),
}));

jest.mock('../../src/renderer/app/skin/desktopRuntimeSkin', () => {
  const desktopRuntimeSkin = {
    onboarding: {
      dialogLabel: 'Sample Desktop onboarding',
      missingPermissionsMessage: 'Sample Desktop could not find any onboarding permissions for this platform.',
      loadingPermissionsMessage: 'Sample Desktop is still loading permission status. Wait a moment and try again.',
      missingRequiredPermissionsMessage: 'Some permissions are still missing. You can continue now and grant them later in Settings.',
      startLabel: 'Start Sample Desktop',
    },
  };
  return {
    desktopRuntimeSkin,
    DesktopRuntimeSkin: {
      desktopRuntimeSkin,
    },
  };
});

jest.mock('../../src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: (...args) => mockIpcInvoke(...args),
  },
  INVOKE_CHANNELS: {
    WINDOW_MINIMIZE: 'window-minimize',
    WINDOW_TOGGLE_MAXIMIZE: 'window-toggle-maximize',
    WINDOW_CLOSE: 'window-close',
  },
}));

describe('DesktopOnboardingSlideshow', () => {
  beforeEach(() => {
    mockBootstrapPermissions.mockReset();
    mockRunPermissionProbe.mockReset().mockResolvedValue({
      permission_id: 'screen_capture',
      status: 'needs-action',
      granted: false,
    });
    mockRequestPermission.mockReset().mockImplementation(async (permissionId) => {
      if (permissionId === 'browser_automation') {
        return {
          permission_id: permissionId,
          status: 'granted',
          granted: true,
        };
      }
      return {
        permission_id: permissionId,
        status: 'needs-action',
        granted: false,
      };
    });
    mockUpdateConfig.mockReset();
    mockCompleteOnboarding.mockReset().mockReturnValue(true);
    mockIpcInvoke.mockClear();
  });

  test('renders slide progression and completes onboarding', async () => {
    const onComplete = jest.fn();
    render(<DesktopOnboardingSlideshow onComplete={onComplete} stopAgentShortcutLabel="Ctrl + Shift + Esc" />);

    expect(screen.getByText('Step 1 of 5')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Set up system access' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Screen capture' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'System Events automation' })).not.toBeInTheDocument();
    expect(screen.getByText('Permission 1 of 4')).toBeInTheDocument();
    expect(screen.getByText('OS Permission')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grant' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open browser' })).not.toBeInTheDocument();
    expect(screen.queryAllByLabelText('Granted')).toHaveLength(0);
    expect(screen.queryByRole('heading', { name: 'Planned system-access scope' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Minimize window' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toggle maximize window' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close window' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Grant' })[0]);
    });
    expect(mockRequestPermission).toHaveBeenCalledWith('screen_capture');
    expect(mockUpdateConfig).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Step 2 of 5')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'System Events automation' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Step 3 of 5')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Microphone' })).toBeInTheDocument();
    expect(screen.getByLabelText('Granted')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Step 4 of 5')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Browser automation' })).toBeInTheDocument();
    expect(screen.getByText('App Capability')).toBeInTheDocument();
    expect(screen.getByText('Open the dedicated browser so you can sign in with the profile the agent host should use for browsing, navigation, and web tasks.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open browser' })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open browser' }));
    });
    expect(mockRequestPermission).toHaveBeenCalledWith('browser_automation');
    expect(mockUpdateConfig).toHaveBeenCalledWith({ browser_automation_enabled: true });

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Step 5 of 5')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Stop the agent during loops' })).toBeInTheDocument();
    expect(screen.getByText('Use this anytime an agent loop needs to end right away.')).toBeInTheDocument();
    expect(screen.getByLabelText('Stop shortcut Ctrl + Shift + Esc')).toBeInTheDocument();
    expect(screen.getByText('Ctrl').tagName).toBe('KBD');
    expect(screen.getByText('Shift').tagName).toBe('KBD');
    expect(screen.getByText('Esc').tagName).toBe('KBD');
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Sample Desktop' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Minimize window' }));
    fireEvent.click(screen.getByRole('button', { name: 'Toggle maximize window' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close window' }));
    expect(mockIpcInvoke.mock.calls[0]).toEqual(['window-minimize']);
    expect(mockIpcInvoke.mock.calls[1]).toEqual(['window-toggle-maximize']);
    expect(mockIpcInvoke.mock.calls[2]).toEqual(['window-close']);

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Step 4 of 5')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start Sample Desktop' }));
    expect(mockCompleteOnboarding).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test('shows Waiting... after a macOS settings-backed grant starts external polling', async () => {
    mockRequestPermission.mockResolvedValue({
      permission_id: 'screen_capture',
      status: 'needs-action',
      granted: false,
      reason: 'Waiting for Screen Recording access. Enable Sample Desktop in System Settings.',
    });
    mockRunPermissionProbe.mockResolvedValue({
      permission_id: 'screen_capture',
      status: 'needs-action',
      granted: false,
    });

    render(<DesktopOnboardingSlideshow onComplete={jest.fn()} stopAgentShortcutLabel="Ctrl + Shift + Esc" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Grant' }));
      await Promise.resolve();
    });

    expect(screen.getByRole('button', { name: 'Waiting...' })).toBeDisabled();
  });

  test('keeps actions outside the scroll region on the permissions slide', () => {
    const onComplete = jest.fn();
    const { container } = render(
      <DesktopOnboardingSlideshow onComplete={onComplete} stopAgentShortcutLabel="Ctrl + Shift + Esc" />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Sample Desktop onboarding' });
    const scrollRegion = container.querySelector('.desktop-onboarding-card-scroll-region');
    const actions = container.querySelector('.desktop-onboarding-actions');
    const nextButton = screen.getByRole('button', { name: 'Next' });

    expect(scrollRegion).not.toBeNull();
    expect(actions).not.toBeNull();
    expect(dialog).toContainElement(scrollRegion);
    expect(dialog).toContainElement(actions);
    expect(scrollRegion).not.toContain(actions);
    expect(scrollRegion).toContainElement(screen.getByRole('heading', { name: 'Set up system access' }));
    expect(actions).toContainElement(nextButton);
    expect(screen.getByText('Permission 1 of 4')).toBeInTheDocument();
  });

  test('can hide the maximize control for onboarding-specific main-window behavior', () => {
    render(
      <DesktopOnboardingSlideshow
        allowWindowMaximize={false}
        onComplete={jest.fn()}
        stopAgentShortcutLabel="Ctrl + Shift + Esc"
      />,
    );

    expect(screen.getByRole('button', { name: 'Minimize window' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Toggle maximize window' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close window' })).toBeInTheDocument();
  });

  test('renders long macOS stop shortcuts as separate keycaps', () => {
    render(
      <DesktopOnboardingSlideshow
        onComplete={jest.fn()}
        stopAgentShortcutLabel="Command + Shift + Esc"
      />,
    );

    for (let index = 0; index < 4; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    }

    expect(screen.getByLabelText('Stop shortcut Command + Shift + Esc')).toBeInTheDocument();
    expect(screen.getByText('Command').tagName).toBe('KBD');
    expect(screen.getByText('Shift').tagName).toBe('KBD');
    expect(screen.getByText('Esc').tagName).toBe('KBD');
  });

  test('allows Start Sample Desktop even when required permissions are still missing', () => {
    const previousMissingRequiredPermissions = mockPermissionState.missingRequiredPermissions;
    mockPermissionState.missingRequiredPermissions = ['screen_capture', 'system_events_automation'];

    try {
      render(
        <DesktopOnboardingSlideshow
          onComplete={jest.fn()}
          stopAgentShortcutLabel="Command + Shift + Esc"
        />,
      );

      for (let index = 0; index < 4; index += 1) {
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      }

      expect(screen.getByRole('button', { name: 'Start Sample Desktop' })).toBeEnabled();
      expect(
        screen.getByText('Some permissions are still missing. You can continue now and grant them later in Settings.'),
      ).toBeInTheDocument();
    } finally {
      mockPermissionState.missingRequiredPermissions = previousMissingRequiredPermissions;
    }
  });

  test('skips settings-only permissions in onboarding slide progression', () => {
    const previousPermissions = mockPermissionState.permissions;
    const previousStatuses = mockPermissionState.statusesByPermissionId;

    mockPermissionState.permissions = [
      {
        permission_id: 'screen_capture',
        label: 'Screen capture',
        description: 'Allow the agent host to capture the current screen for screenshot context and visual grounding.',
        access_kind: 'os_permission',
        grant_action_label: 'Grant',
        required_now: true,
        onboarding_required_now: false,
        show_in_onboarding: false,
        onboarding_visibility: 'settings',
      },
      {
        permission_id: 'filesystem_workspace_access',
        label: 'Workspace file access',
        description: 'Allow file read/replace operations in user-selected workspace locations.',
        access_kind: 'resource_access',
        grant_action_label: 'Choose folder',
        required_now: true,
        onboarding_required_now: true,
        show_in_onboarding: true,
        onboarding_visibility: 'required',
      },
      {
        permission_id: 'browser_automation',
        label: 'Browser automation',
        description: 'Open the dedicated browser so you can sign in with the profile the agent host should use for browsing, navigation, and web tasks.',
        access_kind: 'app_capability',
        grant_action_label: 'Open browser',
        required_now: false,
        onboarding_required_now: false,
        show_in_onboarding: true,
        onboarding_visibility: 'optional',
      },
    ];
    mockPermissionState.statusesByPermissionId = {
      screen_capture: {
        status: 'needs-action',
        granted: false,
        reason: 'Grant Screen Recording in Settings if desktop capture fails.',
      },
      filesystem_workspace_access: {
        status: 'needs-action',
        granted: false,
        reason: 'Choose a workspace folder to continue.',
      },
      browser_automation: {
        status: 'needs-action',
        granted: false,
        reason: 'Open the Sample Desktop browser and sign in with the profile Sample Desktop should use for browser help.',
      },
    };

    try {
      render(<DesktopOnboardingSlideshow onComplete={jest.fn()} stopAgentShortcutLabel="Ctrl + Shift + Esc" />);

      expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
      expect(screen.getByText('Permission 1 of 2')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Workspace file access' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Screen capture' })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Browser automation' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      expect(screen.getByText('Step 3 of 3')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Stop the agent during loops' })).toBeInTheDocument();
    } finally {
      mockPermissionState.permissions = previousPermissions;
      mockPermissionState.statusesByPermissionId = previousStatuses;
    }
  });
});
