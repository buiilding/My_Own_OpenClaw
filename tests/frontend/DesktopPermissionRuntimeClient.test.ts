/**
 * Covers desktop permission runtime client behavior in the frontend test suite.
 */

const mockInvoke = jest.fn();

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: (...args: unknown[]) => mockInvoke(...args),
  },
  INVOKE_CHANNELS: {
    LIST_PERMISSIONS: 'list-permissions',
    RUN_PERMISSION_PROBE: 'run-permission-probe',
    REQUEST_PERMISSION: 'request-permission',
    CHECK_PERMISSIONS: 'check-permissions',
  },
}));

import {
  DesktopPermissionRuntimeClient,
  resolvePermissionManifestResult,
  resolvePermissionStatusResult,
  resolvePermissionStatusesResult,
} from '../../frontend/src/renderer/app/runtime/desktopPermissionRuntimeClient';

describe('DesktopPermissionRuntimeClient', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  test('resolves permission command envelopes to value payloads', () => {
    const status = {
      permission_id: 'screen_capture',
      status: 'granted',
      granted: true,
    };

    expect(resolvePermissionManifestResult({
      success: true,
      data: {
        manifest_version: 'manifest-v1',
        permissions: [{ permission_id: 'screen_capture' }],
        statuses: [status],
      },
    })).toEqual({
      manifest_version: 'manifest-v1',
      permissions: [{ permission_id: 'screen_capture' }],
      statuses: [status],
    });

    expect(resolvePermissionStatusResult({
      success: true,
      data: { status },
    })).toBe(status);

    expect(resolvePermissionStatusesResult({
      success: true,
      data: { statuses: [status] },
    })).toEqual([status]);
  });

  test('throws normalized permission command errors', () => {
    expect(() => resolvePermissionManifestResult({
      success: false,
      error: ' Permission service unavailable. ',
    })).toThrow('Permission service unavailable.');

    expect(() => resolvePermissionStatusResult({
      success: true,
      data: {},
    }, 'Failed to run permission probe.')).toThrow('Failed to run permission probe.');

    expect(() => resolvePermissionStatusesResult({
      success: true,
      data: { statuses: null },
    })).toThrow('Failed to recheck permissions.');
  });

  test('value helpers call desktop permission channels and return values', async () => {
    const status = {
      permission_id: 'browser_automation',
      status: 'granted',
      granted: true,
    };

    mockInvoke
      .mockResolvedValueOnce({
        success: true,
        data: {
          manifest_version: 'manifest-v2',
          permissions: [{ permission_id: 'browser_automation' }],
          statuses: [status],
        },
      })
      .mockResolvedValueOnce({ success: true, data: { status } })
      .mockResolvedValueOnce({ success: true, data: { status } })
      .mockResolvedValueOnce({ success: true, data: { statuses: [status] } });

    await expect(DesktopPermissionRuntimeClient.listPermissionManifest()).resolves.toEqual({
      manifest_version: 'manifest-v2',
      permissions: [{ permission_id: 'browser_automation' }],
      statuses: [status],
    });
    await expect(DesktopPermissionRuntimeClient.runPermissionProbeStatus('browser_automation'))
      .resolves.toBe(status);
    await expect(DesktopPermissionRuntimeClient.requestPermissionStatus('browser_automation'))
      .resolves.toBe(status);
    await expect(DesktopPermissionRuntimeClient.checkPermissionStatuses(['browser_automation']))
      .resolves.toEqual([status]);

    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'list-permissions');
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'run-permission-probe', {
      permissionId: 'browser_automation',
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(3, 'request-permission', {
      permissionId: 'browser_automation',
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(4, 'check-permissions', {
      permissionIds: ['browser_automation'],
    });
  });
});
