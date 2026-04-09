import React from 'react';
import { render, screen } from '@testing-library/react';

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

jest.mock('../../frontend/src/renderer/app/providers/AppProvider', () => ({
  AppProvider: ({ children }) => <>{children}</>,
}));

jest.mock('../../frontend/src/renderer/app/providers/ChatProvider', () => ({
  ChatProvider: ({ children }) => <>{children}</>,
}));

jest.mock('../../frontend/src/renderer/app/WakewordController', () => () => null);

jest.mock('../../frontend/src/renderer/app/providers/AppContextHooks', () => ({
  useAppConfigContext: () => ({
    config: {},
    availableModels: { local: [], online: [] },
    updateConfig: jest.fn(),
  }),
}));

import App from '../../frontend/src/renderer/app/App';

describe('App permission gate', () => {
  test('renders onboarding while required permissions are still missing', () => {
    mockPermissionState.bootstrapped = true;
    mockPermissionState.needsOnboarding = true;
    mockPermissionState.onboardingState = { completed: false };

    render(<App />);

    expect(screen.getByTestId('frontend-onboarding-stub')).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-shell-stub')).not.toBeInTheDocument();
  });

  test('renders dashboard after permission onboarding completes', () => {
    mockPermissionState.bootstrapped = true;
    mockPermissionState.needsOnboarding = false;
    mockPermissionState.onboardingState = { completed: true };

    render(<App />);

    expect(screen.getByTestId('dashboard-shell-stub')).toHaveTextContent('vmModeEnabled:false');
    expect(screen.queryByTestId('frontend-onboarding-stub')).not.toBeInTheDocument();
  });

  test('does not flash onboarding before bootstrap when onboarding was already completed', () => {
    mockPermissionState.bootstrapped = false;
    mockPermissionState.needsOnboarding = true;
    mockPermissionState.onboardingState = { completed: true };

    render(<App />);

    expect(screen.getByTestId('dashboard-shell-stub')).toHaveTextContent('vmModeEnabled:false');
    expect(screen.queryByTestId('frontend-onboarding-stub')).not.toBeInTheDocument();
  });
});
