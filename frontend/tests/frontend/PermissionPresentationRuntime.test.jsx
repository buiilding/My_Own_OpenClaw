/**
 * Covers renderer permission presentation runtime behavior in the frontend test suite.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

import {
  DesktopPermissionPresentationRuntime,
} from '../../src/renderer/app/runtime/desktopPermissionPresentationRuntime';

const {
  getPermissionActionLabel,
  getPermissionGrantedLabel,
  getPermissionKindLabel,
  getPermissionManifestEntry,
  getPermissionPill,
  getPermissionStatusValue,
  getPermissionStatusDetailsPresentation,
  getPermissionStatusForId,
  isPermissionGrantedStatus,
} = DesktopPermissionPresentationRuntime;
import PermissionStatusBadge from '../../src/renderer/features/permissions/components/PermissionStatusBadge';

describe('desktopPermissionPresentationRuntime', () => {
  test('maps access kinds to permission kind, granted, and action labels', () => {
    expect(getPermissionKindLabel({ access_kind: 'os_permission' })).toBe('OS Permission');
    expect(getPermissionKindLabel({ access_kind: 'app_capability' })).toBe('App Capability');
    expect(getPermissionKindLabel({ access_kind: 'resource_access' })).toBe('Workspace Access');
    expect(getPermissionKindLabel({ access_kind: 'runtime_check' })).toBe('Runtime Check');
    expect(getPermissionKindLabel({ access_kind: 'unknown' })).toBe('Access Item');

    expect(getPermissionGrantedLabel({ access_kind: 'app_capability' })).toBe('Enabled');
    expect(getPermissionGrantedLabel({ access_kind: 'resource_access' })).toBe('Configured');
    expect(getPermissionGrantedLabel({ access_kind: 'runtime_check' })).toBe('Ready');
    expect(getPermissionGrantedLabel({ access_kind: 'unknown' })).toBe('Granted');

    expect(getPermissionActionLabel({ access_kind: 'resource_access' })).toBe('Choose folder');
    expect(getPermissionActionLabel({ access_kind: 'runtime_check' })).toBe('Verify');
    expect(getPermissionActionLabel({ access_kind: 'os_permission', grant_action_label: '  Open Settings  ' }))
      .toBe('Open Settings');
    expect(getPermissionActionLabel({ access_kind: 'unknown' })).toBe('Grant');
  });

  test('normalizes granted status shapes and badge pill mapping', () => {
    expect(isPermissionGrantedStatus({ granted: true })).toBe(true);
    expect(isPermissionGrantedStatus({ status: 'granted' })).toBe(true);
    expect(isPermissionGrantedStatus({ status: 'needs-action', granted: false })).toBe(false);

    expect(getPermissionPill('granted', { access_kind: 'app_capability' }))
      .toEqual({ label: 'Enabled', className: 'granted' });
    expect(getPermissionPill({ status: 'granted' }, { access_kind: 'runtime_check' }))
      .toEqual({ label: 'Ready', className: 'granted' });
    expect(getPermissionPill('needs-action', { access_kind: 'os_permission' }))
      .toEqual({ label: 'Needs action', className: 'warning' });
    expect(getPermissionPill('unsupported', { access_kind: 'runtime_check' }))
      .toEqual({ label: 'Unsupported', className: 'warning' });
    expect(getPermissionPill('unknown', { access_kind: 'runtime_check' }))
      .toEqual({ label: 'Not checked', className: '' });
    expect(getPermissionStatusValue({ status: '  needs-action  ' })).toBe('needs-action');
    expect(getPermissionStatusValue(null)).toBe('');
  });

  test('normalizes permission status detail presentation', () => {
    expect(getPermissionStatusDetailsPresentation({
      status: 'needs-action',
      reason: '  Open Settings to grant access.  ',
      details: {
        remediation: '  Restart the browser runtime.  ',
      },
    })).toEqual({
      reason: 'Open Settings to grant access.',
      statusClassName: 'status-needs-action',
      remediation: 'Restart the browser runtime.',
    });

    expect(getPermissionStatusDetailsPresentation({
      reason: '',
      status: '',
      details: { remediation: 123 },
    })).toEqual({
      reason: '',
      statusClassName: 'status-unknown',
      remediation: '',
    });
  });

  test('resolves permission manifest entries with fallback values', () => {
    expect(getPermissionManifestEntry([
      { permission_id: 'screen_capture', label: 'Screen capture' },
      { permission_id: '  browser_automation  ', label: 'Browser runtime' },
    ], 'browser_automation', {
      label: 'Browser automation',
      access_kind: 'app_capability',
    })).toEqual({
      permission_id: '  browser_automation  ',
      label: 'Browser runtime',
    });

    expect(getPermissionManifestEntry([], 'browser_automation', {
      label: 'Browser automation',
      access_kind: 'app_capability',
    })).toEqual({
      permission_id: 'browser_automation',
      label: 'Browser automation',
      access_kind: 'app_capability',
    });
  });

  test('resolves permission statuses by normalized id', () => {
    expect(getPermissionStatusForId({
      browser_automation: { status: 'granted' },
    }, '  browser_automation  ')).toEqual({ status: 'granted' });

    expect(getPermissionStatusForId({
      screen_capture: { status: 'needs-action' },
    }, 'browser_automation')).toBeNull();
    expect(getPermissionStatusForId([], 'browser_automation')).toBeNull();
    expect(getPermissionStatusForId(null, 'browser_automation')).toBeNull();
    expect(getPermissionStatusForId({
      browser_automation: { status: 'granted' },
    }, '')).toBeNull();
  });

  test('PermissionStatusBadge renders the runtime pill contract', () => {
    render(<PermissionStatusBadge status="granted" permission={{ access_kind: 'runtime_check' }} />);

    const pill = screen.getByText('Ready');
    expect(pill).toHaveClass('permission-pill');
    expect(pill).toHaveClass('granted');
  });
});
