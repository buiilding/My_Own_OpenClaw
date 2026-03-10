import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import FrontendOnboardingSlideshow from '../../frontend/src/renderer/features/onboarding/components/FrontendOnboardingSlideshow';

const mockBootstrapPermissions = jest.fn();
const mockRequestPermission = jest.fn();
const mockUpdateConfig = jest.fn();
const mockIpcInvoke = jest.fn(async () => ({ success: true }));

const mockPermissionState = {
  bootstrapped: true,
  isLoading: false,
  permissions: [
    {
      permission_id: 'screen_capture',
      label: 'Screen capture',
      description: 'Allow WindieOS to capture the current screen for screenshot context and visual grounding.',
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
      description: 'Enable browser session automation for navigation and data extraction tasks.',
      access_kind: 'app_capability',
      grant_action_label: 'Enable',
      required_now: false,
    },
  ],
  statusesByPermissionId: {
    screen_capture: {
      status: 'needs-action',
      granted: false,
      reason: 'Grant Screen Recording in System Settings > Privacy & Security.',
    },
    microphone: {
      status: 'granted',
      granted: true,
      reason: 'Microphone access is granted.',
    },
    browser_automation: {
      status: 'needs-action',
      granted: false,
      reason: 'Enable browser automation to expose browser-control tools.',
    },
  },
  error: '',
  bootstrapPermissions: mockBootstrapPermissions,
  requestPermission: mockRequestPermission,
  recheckAllPermissions: jest.fn(),
};

jest.mock('../../frontend/src/renderer/features/permissions/stores/permissionStore', () => ({
  usePermissionStore: (selector) => selector(mockPermissionState),
}));

jest.mock('../../frontend/src/renderer/app/providers/AppContextHooks', () => ({
  useAppConfigContext: () => ({
    updateConfig: (...args) => mockUpdateConfig(...args),
  }),
}));

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: (...args) => mockIpcInvoke(...args),
  },
  INVOKE_CHANNELS: {
    SHOW_MAIN_WINDOW: 'show-main-window',
    WINDOW_MINIMIZE: 'window-minimize',
    WINDOW_TOGGLE_MAXIMIZE: 'window-toggle-maximize',
    WINDOW_CLOSE: 'window-close',
  },
}));

describe('FrontendOnboardingSlideshow', () => {
  beforeEach(() => {
    mockBootstrapPermissions.mockReset();
    mockRequestPermission.mockReset().mockImplementation(async (permissionId) => {
      if (permissionId === 'browser_automation') {
        return {
          permission_id: 'browser_automation',
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
    mockIpcInvoke.mockClear();
  });

  test('renders slide progression and completes onboarding', async () => {
    const onComplete = jest.fn();
    render(<FrontendOnboardingSlideshow onComplete={onComplete} stopAgentShortcutLabel="Ctrl + Shift + Esc" />);

    expect(mockIpcInvoke).toHaveBeenCalledWith('show-main-window', {
      focus: true,
      maximize: true,
    });

    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Set up system access' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Screen capture' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Microphone' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Browser automation' })).toBeInTheDocument();
    expect(screen.getAllByText('OS Permission')).toHaveLength(2);
    expect(screen.getByText('App Capability')).toBeInTheDocument();
    expect(screen.getByText('Enable browser automation to expose browser-control tools.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Grant' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Enable' })).toBeInTheDocument();
    expect(screen.getAllByLabelText('Granted')).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'Planned system-access scope' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Minimize window' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toggle maximize window' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close window' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Grant' }));
    });
    expect(mockRequestPermission).toHaveBeenCalledWith('screen_capture');
    expect(mockUpdateConfig).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enable' }));
    });
    expect(mockRequestPermission).toHaveBeenCalledWith('browser_automation');
    expect(mockUpdateConfig).toHaveBeenCalledWith({ browser_automation_enabled: true });

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Step 2 of 2')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Stop the agent during loops' })).toBeInTheDocument();
    expect(screen.getByText('Use this anytime an agent loop needs to end right away.')).toBeInTheDocument();
    expect(screen.getByLabelText('Stop shortcut Ctrl + Shift + Esc')).toBeInTheDocument();
    expect(screen.getByText('Ctrl').tagName).toBe('KBD');
    expect(screen.getByText('Shift').tagName).toBe('KBD');
    expect(screen.getByText('Esc').tagName).toBe('KBD');
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start WindieOS' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Minimize window' }));
    fireEvent.click(screen.getByRole('button', { name: 'Toggle maximize window' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close window' }));
    expect(mockIpcInvoke).toHaveBeenNthCalledWith(2, 'window-minimize', undefined);
    expect(mockIpcInvoke).toHaveBeenNthCalledWith(3, 'window-toggle-maximize', undefined);
    expect(mockIpcInvoke).toHaveBeenNthCalledWith(4, 'window-close', undefined);

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start WindieOS' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test('keeps actions outside the scroll region on the permissions slide', () => {
    const onComplete = jest.fn();
    const { container } = render(
      <FrontendOnboardingSlideshow onComplete={onComplete} stopAgentShortcutLabel="Ctrl + Shift + Esc" />,
    );

    const dialog = screen.getByRole('dialog', { name: 'WindieOS onboarding' });
    const scrollRegion = container.querySelector('.frontend-onboarding-card-scroll-region');
    const actions = container.querySelector('.frontend-onboarding-actions');
    const nextButton = screen.getByRole('button', { name: 'Next' });

    expect(scrollRegion).not.toBeNull();
    expect(actions).not.toBeNull();
    expect(dialog).toContainElement(scrollRegion);
    expect(dialog).toContainElement(actions);
    expect(scrollRegion).not.toContain(actions);
    expect(scrollRegion).toContainElement(screen.getByRole('heading', { name: 'Set up system access' }));
    expect(actions).toContainElement(nextButton);
  });

  test('renders long macOS stop shortcuts as separate keycaps', () => {
    render(
      <FrontendOnboardingSlideshow
        onComplete={jest.fn()}
        stopAgentShortcutLabel="Command + Shift + Esc"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByLabelText('Stop shortcut Command + Shift + Esc')).toBeInTheDocument();
    expect(screen.getByText('Command').tagName).toBe('KBD');
    expect(screen.getByText('Shift').tagName).toBe('KBD');
    expect(screen.getByText('Esc').tagName).toBe('KBD');
  });
});
