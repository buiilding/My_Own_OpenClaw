jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: jest.fn(),
  },
  INVOKE_CHANNELS: {},
}));

import { usePermissionStore } from '../../frontend/src/renderer/features/permissions/stores/permissionStore';
import { loadPermissionOnboardingState } from '../../frontend/src/renderer/features/permissions/utils/permissionStorage';

describe('permissionStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
    usePermissionStore.setState({
      manifestVersion: '',
      generatedAt: null,
      permissions: [],
      statusesByPermissionId: {},
      requiredPermissionIds: [],
      missingRequiredPermissions: [],
      needsOnboarding: true,
      completedForManifest: false,
      isLoading: false,
      bootstrapped: false,
      error: '',
      onboardingState: {
        manifest_version: '',
        completed: false,
        completed_at: null,
      },
    });
  });

  test('restartOnboarding clears persisted completion and reopens the onboarding gate', () => {
    usePermissionStore.setState({
      manifestVersion: 'manifest-v3',
      permissions: [
        {
          permission_id: 'screen_capture',
          onboarding_required_now: true,
          required_now: true,
        },
      ],
      statusesByPermissionId: {
        screen_capture: {
          granted: true,
        },
      },
      needsOnboarding: false,
      completedForManifest: true,
      onboardingState: {
        manifest_version: 'manifest-v3',
        completed: true,
        completed_at: '2026-03-31T00:00:00.000Z',
      },
    });

    usePermissionStore.getState().restartOnboarding();

    const nextState = usePermissionStore.getState();
    expect(nextState.onboardingState).toEqual({
      manifest_version: 'manifest-v3',
      completed: false,
      completed_at: null,
    });
    expect(nextState.needsOnboarding).toBe(true);
    expect(nextState.completedForManifest).toBe(false);
    expect(loadPermissionOnboardingState()).toEqual({
      manifest_version: 'manifest-v3',
      completed: false,
      completed_at: null,
    });
  });
});
