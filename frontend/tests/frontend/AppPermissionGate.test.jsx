/**
 * Covers app permission gate. behavior in the frontend test suite.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

const mockIpcInvoke = jest.fn(async () => ({ success: true }));
const mockWakewordController = jest.fn(() => null);

const mockPermissionState = {
  bootstrapped: true,
  needsOnboarding: true,
  onboardingState: {
    completed: false,
  },
};

jest.mock('../../src/renderer/app/runtime/desktopStartupRuntimeClient', () => ({
  DesktopStartupRuntimeClient: {
    isVmModeEnabled: () => false,
    selectStartupSurface: ({
      bootstrapped,
      needsOnboarding,
      onboardingCompleted,
    }) => {
      const shouldShowOnboarding = bootstrapped
        ? needsOnboarding
        : !onboardingCompleted;
      return shouldShowOnboarding ? 'onboarding' : 'dashboard';
    },
  },
}));

jest.mock('../../src/renderer/features/dashboard/components/DashboardShell', () => (props) => (
  <div data-testid="dashboard-shell-stub">
    vmModeEnabled:{String(Boolean(props.vmModeEnabled))}
  </div>
));

jest.mock('../../src/renderer/features/onboarding/components/DesktopOnboardingSlideshow', () => () => (
  <div data-testid="desktop-onboarding-stub">desktop onboarding</div>
));

jest.mock('../../src/renderer/features/permissions/stores/permissionStore', () => ({
  usePermissionStore: (selector) => selector(mockPermissionState),
}));

jest.mock('../../src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: (...args) => mockIpcInvoke(...args),
  },
  INVOKE_CHANNELS: {
    SHOW_MAIN_WINDOW: 'show-main-window',
    SHOW_CHATBOX: 'show-chatbox',
  },
}));

jest.mock('../../src/renderer/app/providers/AppProvider', () => ({
  AppProvider: ({ children }) => <>{children}</>,
}));

jest.mock('../../src/renderer/app/providers/ChatProvider', () => ({
  ChatProvider: ({ children }) => <>{children}</>,
}));

jest.mock('../../src/renderer/app/WakewordController', () => (...args) => mockWakewordController(...args));

jest.mock('../../src/renderer/app/providers/AppConfigContext', () => ({
  useAppConfigContext: () => ({
    config: {},
    availableModels: { local: [], online: [] },
    updateConfig: jest.fn(),
  }),
}));

import App from '../../src/renderer/app/App';

describe('App permission gate', () => {
  beforeEach(() => {
    mockIpcInvoke.mockReset();
    mockIpcInvoke.mockResolvedValue({ success: true });
    mockWakewordController.mockClear();
  });

  test('renders onboarding while required permissions are still missing', () => {
    mockPermissionState.bootstrapped = true;
    mockPermissionState.needsOnboarding = true;
    mockPermissionState.onboardingState = { completed: false };

    render(<App />);

    expect(screen.getByTestId('desktop-onboarding-stub')).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-shell-stub')).not.toBeInTheDocument();
    expect(mockWakewordController).not.toHaveBeenCalled();
    expect(mockIpcInvoke).toHaveBeenCalledWith('show-main-window', {
      focus: true,
      open: 'onboarding',
      reason: 'startup-onboarding',
    });
  });

  test('renders dashboard after permission onboarding completes', () => {
    mockPermissionState.bootstrapped = true;
    mockPermissionState.needsOnboarding = false;
    mockPermissionState.onboardingState = { completed: true };

    render(<App />);

    expect(screen.getByTestId('dashboard-shell-stub')).toHaveTextContent('vmModeEnabled:false');
    expect(screen.queryByTestId('desktop-onboarding-stub')).not.toBeInTheDocument();
    expect(mockWakewordController).toHaveBeenCalledTimes(1);
    expect(mockIpcInvoke).toHaveBeenCalledWith('show-chatbox', {
      focus: true,
      reason: 'startup',
    });
  });

  test('shows the dashboard on startup when durable user intent suppresses the chat pill', async () => {
    mockPermissionState.bootstrapped = true;
    mockPermissionState.needsOnboarding = false;
    mockPermissionState.onboardingState = { completed: true };
    mockIpcInvoke.mockResolvedValueOnce({
      success: true,
      suppressed: true,
      reason: 'chat-pill-user-hidden',
    });

    render(<App />);

    expect(screen.getByTestId('dashboard-shell-stub')).toHaveTextContent('vmModeEnabled:false');
    await waitFor(() => {
      expect(mockIpcInvoke).toHaveBeenCalledWith('show-main-window', {
        focus: true,
        reason: 'startup-chat-pill-hidden',
      });
    });
    expect(mockIpcInvoke).toHaveBeenNthCalledWith(1, 'show-chatbox', {
      focus: true,
      reason: 'startup',
    });
    expect(mockIpcInvoke).toHaveBeenNthCalledWith(2, 'show-main-window', {
      focus: true,
      reason: 'startup-chat-pill-hidden',
    });
  });

  test('does not flash onboarding before bootstrap when onboarding was already completed', () => {
    mockPermissionState.bootstrapped = false;
    mockPermissionState.needsOnboarding = true;
    mockPermissionState.onboardingState = { completed: true };

    render(<App />);

    expect(screen.getByTestId('dashboard-shell-stub')).toHaveTextContent('vmModeEnabled:false');
    expect(screen.queryByTestId('desktop-onboarding-stub')).not.toBeInTheDocument();
    expect(mockWakewordController).toHaveBeenCalledTimes(1);
    expect(mockIpcInvoke).toHaveBeenCalledWith('show-chatbox', {
      focus: true,
      reason: 'startup',
    });
  });

  test('switches from onboarding to the chat pill when onboarding completes', () => {
    mockPermissionState.bootstrapped = true;
    mockPermissionState.needsOnboarding = true;
    mockPermissionState.onboardingState = { completed: false };

    const { rerender } = render(<App />);

    expect(mockWakewordController).not.toHaveBeenCalled();
    expect(mockIpcInvoke).toHaveBeenCalledWith('show-main-window', {
      focus: true,
      open: 'onboarding',
      reason: 'startup-onboarding',
    });

    mockIpcInvoke.mockClear();
    mockPermissionState.needsOnboarding = false;
    mockPermissionState.onboardingState = { completed: true };

    rerender(<App />);

    expect(mockWakewordController).toHaveBeenCalledTimes(1);
    expect(mockIpcInvoke).toHaveBeenCalledWith('show-chatbox', {
      focus: true,
      reason: 'onboarding-complete',
    });
  });
});
