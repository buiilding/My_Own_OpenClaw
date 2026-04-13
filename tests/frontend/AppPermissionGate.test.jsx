import React from 'react';
import { render, screen } from '@testing-library/react';

const mockIpcInvoke = jest.fn(async () => ({ success: true }));
const mockWakewordController = jest.fn(() => null);

const mockPermissionState = {
  bootstrapped: true,
  needsOnboarding: true,
  onboardingState: {
    completed: false,
  },
};

jest.mock('../../frontend/src/renderer/infrastructure/runtime/vmMode', () => ({
  isVmModeEnabled: () => false,
}));

jest.mock('../../frontend/src/renderer/features/dashboard/components/DashboardShell', () => (props) => (
  <div data-testid="dashboard-shell-stub">
    vmModeEnabled:{String(Boolean(props.vmModeEnabled))}
  </div>
));

jest.mock('../../frontend/src/renderer/features/onboarding/components/FrontendOnboardingSlideshow', () => () => (
  <div data-testid="frontend-onboarding-stub">frontend onboarding</div>
));

jest.mock('../../frontend/src/renderer/features/permissions/stores/permissionStore', () => ({
  usePermissionStore: (selector) => selector(mockPermissionState),
}));

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: (...args) => mockIpcInvoke(...args),
  },
  INVOKE_CHANNELS: {
    SHOW_MAIN_WINDOW: 'show-main-window',
    SHOW_CHATBOX: 'show-chatbox',
  },
}));

jest.mock('../../frontend/src/renderer/app/providers/AppProvider', () => ({
  AppProvider: ({ children }) => <>{children}</>,
}));

jest.mock('../../frontend/src/renderer/app/providers/ChatProvider', () => ({
  ChatProvider: ({ children }) => <>{children}</>,
}));

jest.mock('../../frontend/src/renderer/app/WakewordController', () => (...args) => mockWakewordController(...args));

jest.mock('../../frontend/src/renderer/app/providers/AppContextHooks', () => ({
  useAppConfigContext: () => ({
    config: {},
    availableModels: { local: [], online: [] },
    updateConfig: jest.fn(),
  }),
}));

import App from '../../frontend/src/renderer/app/App';

describe('App permission gate', () => {
  beforeEach(() => {
    mockIpcInvoke.mockClear();
    mockWakewordController.mockClear();
  });

  test('renders onboarding while required permissions are still missing', () => {
    mockPermissionState.bootstrapped = true;
    mockPermissionState.needsOnboarding = true;
    mockPermissionState.onboardingState = { completed: false };

    render(<App />);

    expect(screen.getByTestId('frontend-onboarding-stub')).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-shell-stub')).not.toBeInTheDocument();
    expect(mockWakewordController).not.toHaveBeenCalled();
    expect(mockIpcInvoke).toHaveBeenCalledWith('show-main-window', {
      focus: true,
      open: 'onboarding',
    });
  });

  test('renders dashboard after permission onboarding completes', () => {
    mockPermissionState.bootstrapped = true;
    mockPermissionState.needsOnboarding = false;
    mockPermissionState.onboardingState = { completed: true };

    render(<App />);

    expect(screen.getByTestId('dashboard-shell-stub')).toHaveTextContent('vmModeEnabled:false');
    expect(screen.queryByTestId('frontend-onboarding-stub')).not.toBeInTheDocument();
    expect(mockWakewordController).toHaveBeenCalledTimes(1);
    expect(mockIpcInvoke).toHaveBeenCalledWith('show-chatbox', { focus: true });
  });

  test('does not flash onboarding before bootstrap when onboarding was already completed', () => {
    mockPermissionState.bootstrapped = false;
    mockPermissionState.needsOnboarding = true;
    mockPermissionState.onboardingState = { completed: true };

    render(<App />);

    expect(screen.getByTestId('dashboard-shell-stub')).toHaveTextContent('vmModeEnabled:false');
    expect(screen.queryByTestId('frontend-onboarding-stub')).not.toBeInTheDocument();
    expect(mockWakewordController).toHaveBeenCalledTimes(1);
    expect(mockIpcInvoke).toHaveBeenCalledWith('show-chatbox', { focus: true });
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
    });

    mockIpcInvoke.mockClear();
    mockPermissionState.needsOnboarding = false;
    mockPermissionState.onboardingState = { completed: true };

    rerender(<App />);

    expect(mockWakewordController).toHaveBeenCalledTimes(1);
    expect(mockIpcInvoke).toHaveBeenCalledWith('show-chatbox', { focus: true });
  });
});
