jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: jest.fn(),
  },
  INVOKE_CHANNELS: {
    RUN_PERMISSION_PROBE: 'run-permission-probe',
  },
}));

import { usePermissionStore } from '../../frontend/src/renderer/features/permissions/stores/permissionStore';
import { loadPermissionOnboardingState } from '../../frontend/src/renderer/features/permissions/utils/permissionStorage';
import { IpcBridge } from '../../frontend/src/renderer/infrastructure/ipc/bridge';

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

  test('runPermissionProbe returns the probed status so onboarding wait loops can react', async () => {
    IpcBridge.invoke.mockResolvedValueOnce({
      success: true,
      data: {
        status: {
          permission_id: 'screen_capture',
          status: 'granted',
          granted: true,
          reason: 'Screen recording access is granted.',
          checked_at: '2026-04-12T00:00:00.000Z',
          details: {},
        },
      },
    });

    const status = await usePermissionStore.getState().runPermissionProbe('screen_capture');

    expect(status).toMatchObject({
      permission_id: 'screen_capture',
      status: 'granted',
      granted: true,
    });
    expect(usePermissionStore.getState().statusesByPermissionId.screen_capture).toMatchObject({
      status: 'granted',
      granted: true,
    });
  });
});
