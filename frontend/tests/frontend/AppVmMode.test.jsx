/**
 * Covers app vm mode. behavior in the frontend test suite.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

const mockBootstrapPermissions = jest.fn();
const mockIpcInvoke = jest.fn(async () => ({ success: true }));
const mockWakewordController = jest.fn(() => null);

jest.mock('../../src/renderer/app/runtime/desktopStartupRuntimeClient', () => ({
  DesktopStartupRuntimeClient: {
    isVmModeEnabled: () => true,
    selectStartupSurface: () => 'dashboard-vm',
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
  usePermissionStore: (selector) => selector({
    bootstrapped: false,
    isLoading: false,
    needsOnboarding: true,
    bootstrapPermissions: mockBootstrapPermissions,
  }),
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

describe('App VM mode', () => {
  beforeEach(() => {
    mockBootstrapPermissions.mockClear();
    mockIpcInvoke.mockClear();
    mockWakewordController.mockClear();
  });

  test('bypasses onboarding and renders dashboard shell in vm mode', () => {
    render(<App />);

    expect(screen.getByTestId('dashboard-shell-stub')).toHaveTextContent('vmModeEnabled:true');
    expect(screen.queryByTestId('desktop-onboarding-stub')).not.toBeInTheDocument();
    expect(mockWakewordController).toHaveBeenCalledTimes(1);
    expect(mockIpcInvoke).toHaveBeenCalledWith('show-main-window', {
      focus: true,
      reason: 'startup-vm',
    });
  });
});
