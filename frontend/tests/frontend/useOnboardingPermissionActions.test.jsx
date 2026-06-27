/**
 * Covers use onboarding permission actions. behavior in the frontend test suite.
 */

const React = require('react');
const { act, fireEvent, render, screen } = require('@testing-library/react');
const { useOnboardingPermissionActions } = require('../../src/renderer/features/onboarding/hooks/useOnboardingPermissionActions');

const mockRequestPermission = jest.fn();
const mockRunPermissionProbe = jest.fn();
const mockUpdateConfig = jest.fn();

const mockPermissionState = {
  isLoading: false,
  requestPermission: mockRequestPermission,
  runPermissionProbe: mockRunPermissionProbe,
};

jest.mock('../../src/renderer/features/permissions/stores/permissionStore', () => ({
  usePermissionStore: (selector) => selector(mockPermissionState),
}));

jest.mock('../../src/renderer/app/providers/AppConfigContext', () => ({
  useAppConfigContext: () => ({
    updateConfig: (...args) => mockUpdateConfig(...args),
  }),
}));

function HookHarness({ permissionId = 'screen_capture' }) {
  const { handleGrantPermission, pendingPermissionId, waitingPermissionId } = useOnboardingPermissionActions();

  return React.createElement(
    'button',
    {
      type: 'button',
      onClick: () => {
        void handleGrantPermission(permissionId);
      },
    },
    pendingPermissionId || waitingPermissionId || 'grant',
  );
}

describe('useOnboardingPermissionActions', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockRequestPermission.mockReset();
    mockRunPermissionProbe.mockReset();
    mockUpdateConfig.mockReset();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('keeps probing screen capture after opening macOS settings until the grant lands', async () => {
    mockRequestPermission.mockResolvedValue({
      permission_id: 'screen_capture',
      status: 'needs-action',
      granted: false,
    });
    mockRunPermissionProbe
      .mockResolvedValueOnce({
        permission_id: 'screen_capture',
        status: 'needs-action',
        granted: false,
      })
      .mockResolvedValueOnce({
        permission_id: 'screen_capture',
        status: 'granted',
        granted: true,
      });

    render(React.createElement(HookHarness, { permissionId: 'screen_capture' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'grant' }));
      await Promise.resolve();
    });

    expect(mockRequestPermission).toHaveBeenCalledWith('screen_capture');
    expect(mockRunPermissionProbe).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'screen_capture' })).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(mockRunPermissionProbe).toHaveBeenCalledTimes(2);

    await act(async () => {
      jest.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    expect(mockRunPermissionProbe).toHaveBeenCalledTimes(2);
  });

  test('stops polling when the external grant probe returns status-only granted', async () => {
    mockRequestPermission.mockResolvedValue({
      permission_id: 'screen_capture',
      status: 'needs-action',
      granted: false,
    });
    mockRunPermissionProbe.mockResolvedValue({
      permission_id: 'screen_capture',
      status: 'granted',
    });

    render(React.createElement(HookHarness, { permissionId: 'screen_capture' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'grant' }));
      await Promise.resolve();
    });

    expect(mockRunPermissionProbe).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'grant' })).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    expect(mockRunPermissionProbe).toHaveBeenCalledTimes(1);
  });

  test('forces a permission recheck when the desktop app regains focus after opening macOS settings', async () => {
    mockRequestPermission.mockResolvedValue({
      permission_id: 'screen_capture',
      status: 'needs-action',
      granted: false,
    });
    mockRunPermissionProbe.mockResolvedValue({
      permission_id: 'screen_capture',
      status: 'needs-action',
      granted: false,
    });

    render(React.createElement(HookHarness, { permissionId: 'screen_capture' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'grant' }));
      await Promise.resolve();
    });

    expect(mockRunPermissionProbe).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
    });

    expect(mockRunPermissionProbe).toHaveBeenCalledTimes(2);
  });

  test('does not start the macOS settings watcher for non-settings permissions', async () => {
    mockRequestPermission.mockResolvedValue({
      permission_id: 'browser_automation',
      status: 'needs-action',
      granted: false,
    });

    render(React.createElement(HookHarness, { permissionId: 'browser_automation' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'grant' }));
      await Promise.resolve();
    });

    expect(mockRequestPermission).toHaveBeenCalledWith('browser_automation');
    expect(mockRunPermissionProbe).not.toHaveBeenCalled();
  });

  test('stops polling when the external grant watcher reaches its timeout', async () => {
    mockRequestPermission.mockResolvedValue({
      permission_id: 'screen_capture',
      status: 'needs-action',
      granted: false,
    });
    mockRunPermissionProbe.mockResolvedValue({
      permission_id: 'screen_capture',
      status: 'needs-action',
      granted: false,
    });

    render(React.createElement(HookHarness, { permissionId: 'screen_capture' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'grant' }));
      await Promise.resolve();
    });

    expect(screen.getByRole('button', { name: 'screen_capture' })).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(2 * 60 * 1000);
      await Promise.resolve();
    });

    expect(screen.getByRole('button', { name: 'grant' })).toBeInTheDocument();
    const callsAfterTimeout = mockRunPermissionProbe.mock.calls.length;

    await act(async () => {
      jest.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    expect(mockRunPermissionProbe).toHaveBeenCalledTimes(callsAfterTimeout);
  });

  test('cleans up the external grant watcher on unmount', async () => {
    mockRequestPermission.mockResolvedValue({
      permission_id: 'screen_capture',
      status: 'needs-action',
      granted: false,
    });
    mockRunPermissionProbe.mockResolvedValue({
      permission_id: 'screen_capture',
      status: 'needs-action',
      granted: false,
    });

    const { unmount } = render(React.createElement(HookHarness, { permissionId: 'screen_capture' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'grant' }));
      await Promise.resolve();
    });

    expect(mockRunPermissionProbe).toHaveBeenCalledTimes(1);
    unmount();

    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(mockRunPermissionProbe).toHaveBeenCalledTimes(1);
  });

});
