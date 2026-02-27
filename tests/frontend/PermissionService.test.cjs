/** @jest-environment node */

const {
  listPermissionsWithStatus,
  requestPermission,
  runPermissionProbe,
} = require('../../frontend/src/main/permission_service.cjs');

describe('permission_service', () => {
  test('returns manifest snapshot with per-permission status entries', () => {
    const result = listPermissionsWithStatus({ platform: 'linux' });

    expect(typeof result.manifest_version).toBe('string');
    expect(Array.isArray(result.permissions)).toBe(true);
    expect(Array.isArray(result.statuses)).toBe(true);
    expect(result.permissions.length).toBeGreaterThan(0);
    expect(result.statuses).toHaveLength(result.permissions.length);
  });

  test('screen capture probe on macOS requires action when screen access missing', () => {
    const status = runPermissionProbe('screen_capture', {
      platform: 'darwin',
      systemPreferences: {
        getMediaAccessStatus: jest.fn(() => 'denied'),
      },
    });

    expect(status.permission_id).toBe('screen_capture');
    expect(status.status).toBe('needs-action');
    expect(status.granted).toBe(false);
  });

  test('microphone request invokes askForMediaAccess then re-probes status', async () => {
    const askForMediaAccess = jest.fn(async () => true);
    const getMediaAccessStatus = jest.fn(() => 'granted');

    const status = await requestPermission('microphone', {
      platform: 'darwin',
      systemPreferences: {
        askForMediaAccess,
        getMediaAccessStatus,
      },
    });

    expect(askForMediaAccess).toHaveBeenCalledWith('microphone');
    expect(status.status).toBe('granted');
    expect(status.granted).toBe(true);
  });

  test('unknown permission id returns error status', () => {
    const status = runPermissionProbe('unknown_permission', { platform: 'linux' });
    expect(status.status).toBe('error');
    expect(status.granted).toBe(false);
  });
});
