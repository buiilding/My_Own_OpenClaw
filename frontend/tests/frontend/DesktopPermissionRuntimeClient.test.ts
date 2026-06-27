/**
 * Covers desktop permission runtime client behavior in the frontend test suite.
 */

const mockInvoke = jest.fn();

jest.mock('../../src/renderer/infrastructure/ipc/bridge', () => ({
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

import * as DesktopPermissionRuntimeModule from '../../src/renderer/app/runtime/desktopPermissionRuntimeClient';
import { DesktopPermissionRuntimeClient } from '../../src/renderer/app/runtime/desktopPermissionRuntimeClient';

describe('DesktopPermissionRuntimeClient', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  test('keeps raw permission command envelope helpers private to the runtime client', () => {
    expect(DesktopPermissionRuntimeModule).not.toHaveProperty('mapPermissionStatusesByPermissionId');
    expect(DesktopPermissionRuntimeModule).not.toHaveProperty('normalizePermissionStatusValue');
    expect(DesktopPermissionRuntimeModule).not.toHaveProperty('resolvePermissionManifestResult');
    expect(DesktopPermissionRuntimeModule).not.toHaveProperty('resolvePermissionStatusResult');
    expect(DesktopPermissionRuntimeModule).not.toHaveProperty('resolvePermissionStatusesResult');
  });

  test('normalizes permission status values and indexes them by permission id', () => {
    expect(DesktopPermissionRuntimeClient.mapPermissionStatusesByPermissionId([
      {
        permission_id: 'microphone',
        status: 'needs-action',
        granted: false,
        reason: 'Microphone access is missing.',
        checked_at: '2026-06-19T00:00:00.000Z',
        details: { source: 'system' },
      },
      { permission_id: 'browser_automation', details: 'unavailable' },
      { permission_id: '', granted: true },
      null,
    ])).toEqual({
      microphone: {
        permission_id: 'microphone',
        status: 'needs-action',
        granted: false,
        reason: 'Microphone access is missing.',
        checked_at: '2026-06-19T00:00:00.000Z',
        details: { source: 'system' },
      },
      browser_automation: {
        permission_id: 'browser_automation',
        status: 'unknown',
        granted: false,
        reason: '',
        checked_at: null,
        details: {},
      },
    });
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
      .resolves.toEqual({
        permission_id: 'browser_automation',
        status: 'granted',
        granted: true,
        reason: '',
        checked_at: null,
        details: {},
      });
    await expect(DesktopPermissionRuntimeClient.requestPermissionStatus('browser_automation'))
      .resolves.toEqual({
        permission_id: 'browser_automation',
        status: 'granted',
        granted: true,
        reason: '',
        checked_at: null,
        details: {},
      });
    await expect(DesktopPermissionRuntimeClient.checkPermissionStatuses(['browser_automation']))
      .resolves.toEqual([{
        permission_id: 'browser_automation',
        status: 'granted',
        granted: true,
        reason: '',
        checked_at: null,
        details: {},
      }]);

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

  test('value helpers throw normalized permission command errors', async () => {
    mockInvoke
      .mockResolvedValueOnce({
        success: false,
        error: ' Permission service unavailable. ',
      })
      .mockResolvedValueOnce({
        success: true,
        data: {},
      })
      .mockResolvedValueOnce({
        success: true,
        data: { statuses: null },
      });

    await expect(DesktopPermissionRuntimeClient.listPermissionManifest())
      .rejects.toThrow('Permission service unavailable.');
    await expect(DesktopPermissionRuntimeClient.runPermissionProbeStatus('browser_automation'))
      .rejects.toThrow('Failed to run permission probe.');
    await expect(DesktopPermissionRuntimeClient.checkPermissionStatuses(['browser_automation']))
      .rejects.toThrow('Failed to recheck permissions.');
  });
});
