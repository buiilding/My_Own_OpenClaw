import React from 'react';
import { render, screen } from '@testing-library/react';

const mockBootstrapPermissions = jest.fn();

jest.mock('../../frontend/src/renderer/infrastructure/runtime/vmMode', () => ({
  isVmModeEnabled: () => true,
}));

jest.mock('../../frontend/src/renderer/features/dashboard/components/ChatGptDashboardShell', () => (props) => (
  <div data-testid="dashboard-shell-stub">
    vmModeEnabled:{String(Boolean(props.vmModeEnabled))}
  </div>
));

jest.mock('../../frontend/src/renderer/features/permissions/components/PermissionOnboardingWizard', () => () => (
  <div data-testid="permission-wizard-stub">permission wizard</div>
));

jest.mock('../../frontend/src/renderer/features/onboarding/components/FrontendOnboardingSlideshow', () => () => (
  <div data-testid="frontend-onboarding-stub">frontend onboarding</div>
));

jest.mock('../../frontend/src/renderer/features/permissions/stores/permissionStore', () => ({
  usePermissionStore: (selector) => selector({
    bootstrapped: false,
    isLoading: false,
    needsOnboarding: true,
    bootstrapPermissions: mockBootstrapPermissions,
  }),
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

describe('App VM mode', () => {
  beforeEach(() => {
    mockBootstrapPermissions.mockClear();
  });

  test('bypasses onboarding and renders dashboard shell in vm mode', () => {
    render(<App />);

    expect(screen.getByTestId('dashboard-shell-stub')).toHaveTextContent('vmModeEnabled:true');
    expect(screen.queryByTestId('permission-wizard-stub')).not.toBeInTheDocument();
    expect(screen.queryByTestId('frontend-onboarding-stub')).not.toBeInTheDocument();
  });
});
