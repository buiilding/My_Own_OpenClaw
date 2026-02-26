import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import PermissionOnboardingWizard from '../../frontend/src/renderer/features/permissions/components/PermissionOnboardingWizard';
import { usePermissionStore } from '../../frontend/src/renderer/features/permissions/stores/permissionStore';

describe('PermissionOnboardingWizard', () => {
  beforeEach(() => {
    usePermissionStore.setState({
      manifestVersion: '1.0.0',
      permissions: [
        {
          permission_id: 'screen_capture',
          label: 'Screen capture',
          description: 'Capture screen',
          required_now: true,
        },
      ],
      statusesByPermissionId: {
        screen_capture: {
          permission_id: 'screen_capture',
          status: 'needs-action',
          granted: false,
          reason: 'Grant in settings',
        },
      },
      missingRequiredPermissions: ['screen_capture'],
      onboardingState: {
        manifest_version: '',
        completed: false,
        planned_system_access_consent: false,
        completed_at: null,
      },
      error: '',
      isLoading: false,
      bootstrapped: true,
      requestPermission: jest.fn(),
      runPermissionProbe: jest.fn(),
      recheckAllPermissions: jest.fn(),
      setPlannedSystemAccessConsent: jest.fn((value) => {
        usePermissionStore.setState((state) => ({
          onboardingState: {
            ...state.onboardingState,
            planned_system_access_consent: value,
          },
        }));
      }),
      completeOnboarding: jest.fn(() => false),
    });
  });

  test('keeps continue button disabled until required permission and consent are satisfied', () => {
    render(<PermissionOnboardingWizard />);

    const continueButton = screen.getByRole('button', { name: 'Continue to WindieOS' });
    expect(continueButton).toBeDisabled();
  });

  test('enables continue when required permissions are granted and consent is checked', () => {
    usePermissionStore.setState({
      missingRequiredPermissions: [],
      statusesByPermissionId: {
        screen_capture: {
          permission_id: 'screen_capture',
          status: 'granted',
          granted: true,
          reason: 'Granted',
        },
      },
      onboardingState: {
        manifest_version: '',
        completed: false,
        planned_system_access_consent: false,
        completed_at: null,
      },
      setPlannedSystemAccessConsent: jest.fn((value) => {
        usePermissionStore.setState((state) => ({
          onboardingState: {
            ...state.onboardingState,
            planned_system_access_consent: value,
          },
        }));
      }),
    });

    render(<PermissionOnboardingWizard />);

    fireEvent.click(screen.getByRole('checkbox'));

    expect(screen.getByRole('button', { name: 'Continue to WindieOS' })).toBeEnabled();
  });
});
