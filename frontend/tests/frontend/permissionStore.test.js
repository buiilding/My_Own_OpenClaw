/**
 * Covers permission store. behavior in the frontend test suite.
 */

const fs = require('fs');
const path = require('path');

jest.mock('../../src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: jest.fn(),
  },
  INVOKE_CHANNELS: {
    LIST_PERMISSIONS: 'list-permissions',
    RUN_PERMISSION_PROBE: 'run-permission-probe',
    REQUEST_PERMISSION: 'request-permission',
    CHECK_PERMISSIONS: 'check-permissions',
  },
}));

import { usePermissionStore } from '../../src/renderer/features/permissions/stores/permissionStore';
import { DesktopPermissionOnboardingStorageRuntime } from '../../src/renderer/app/runtime/desktopPermissionOnboardingStorageRuntime';
import { IpcBridge } from '../../src/renderer/infrastructure/ipc/bridge';

const {
  loadPermissionOnboardingState,
} = DesktopPermissionOnboardingStorageRuntime;

describe('permissionStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
    IpcBridge.invoke.mockReset();
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

  test('runPermissionProbe recomputes gate state from updated statuses', async () => {
    usePermissionStore.setState({
      manifestVersion: 'manifest-v4',
      permissions: [
        {
          permission_id: 'screen_capture',
          onboarding_required_now: true,
          required_now: true,
        },
      ],
      statusesByPermissionId: {
        screen_capture: {
          permission_id: 'screen_capture',
          status: 'denied',
          granted: false,
        },
      },
      requiredPermissionIds: ['screen_capture'],
      missingRequiredPermissions: ['screen_capture'],
      onboardingState: {
        manifest_version: 'manifest-v4',
        completed: true,
        completed_at: '2026-04-12T00:00:00.000Z',
      },
      completedForManifest: true,
      needsOnboarding: false,
    });
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

    await usePermissionStore.getState().runPermissionProbe('screen_capture');

    const nextState = usePermissionStore.getState();
    expect(nextState.statusesByPermissionId.screen_capture.granted).toBe(true);
    expect(nextState.requiredPermissionIds).toEqual(['screen_capture']);
    expect(nextState.missingRequiredPermissions).toEqual([]);
    expect(nextState.completedForManifest).toBe(true);
    expect(nextState.needsOnboarding).toBe(false);
  });

  test('routes permission IPC through the desktop permission runtime client', () => {
    const storeSource = fs.readFileSync(
      path.resolve(__dirname, '../../src/renderer/features/permissions/stores/permissionStore.js'),
      'utf8',
    );
    const clientSource = fs.readFileSync(
      path.resolve(__dirname, '../../src/renderer/app/runtime/desktopPermissionRuntimeClient.ts'),
      'utf8',
    );

    expect(storeSource).not.toContain('IpcBridge');
    expect(storeSource).not.toContain('INVOKE_CHANNELS');
    expect(storeSource).not.toContain('LIST_PERMISSIONS');
    expect(storeSource).not.toContain('RUN_PERMISSION_PROBE');
    expect(storeSource).not.toContain('REQUEST_PERMISSION');
    expect(storeSource).not.toContain('CHECK_PERMISSIONS');
    expect(storeSource).toContain('DesktopPermissionRuntimeClient.listPermissionManifest');
    expect(storeSource).toContain('DesktopPermissionRuntimeClient.runPermissionProbeStatus');
    expect(storeSource).toContain('DesktopPermissionRuntimeClient.requestPermissionStatus');
    expect(storeSource).toContain('DesktopPermissionRuntimeClient.checkPermissionStatuses');
    expect(storeSource).toContain('DesktopPermissionRuntimeClient.mapPermissionStatusesByPermissionId');
    expect(storeSource).not.toContain('mapPermissionStatusesByPermissionId,');
    expect(storeSource).not.toContain('status?.permission_id');
    expect(storeSource).not.toContain('status?.status');
    expect(storeSource).not.toContain('status?.granted');
    expect(storeSource).not.toContain('status?.reason');
    expect(storeSource).not.toContain('status?.checked_at');
    expect(storeSource).not.toContain('status?.details');
    expect(storeSource).not.toContain('result?.success');
    expect(storeSource).not.toContain('result.data');
    expect(storeSource).not.toContain('result?.data');
    expect(clientSource).toContain('INVOKE_CHANNELS.LIST_PERMISSIONS');
    expect(clientSource).toContain('INVOKE_CHANNELS.RUN_PERMISSION_PROBE');
    expect(clientSource).toContain('INVOKE_CHANNELS.REQUEST_PERMISSION');
    expect(clientSource).toContain('INVOKE_CHANNELS.CHECK_PERMISSIONS');
    expect(clientSource).toContain('function resolvePermissionManifestResult');
    expect(clientSource).not.toContain('export function resolvePermissionManifestResult');
    expect(clientSource).toContain('function resolvePermissionStatusResult');
    expect(clientSource).not.toContain('export function resolvePermissionStatusResult');
    expect(clientSource).toContain('function resolvePermissionStatusesResult');
    expect(clientSource).not.toContain('export function resolvePermissionStatusesResult');
    expect(clientSource).toContain('function normalizePermissionStatusValue');
    expect(clientSource).not.toContain('export function normalizePermissionStatusValue');
    expect(clientSource).toContain('function mapPermissionStatusesByPermissionId');
    expect(clientSource).not.toContain('export function mapPermissionStatusesByPermissionId');
    expect(clientSource).toContain('mapPermissionStatusesByPermissionId(statuses)');
  });
});
