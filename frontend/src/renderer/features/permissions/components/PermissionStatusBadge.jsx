/**
 * Provides the permission status badge module for the renderer UI.
 */

import { DesktopPermissionPresentationRuntime } from '../../../app/runtime/desktopPermissionPresentationRuntime';

const {
  getPermissionPill,
} = DesktopPermissionPresentationRuntime;

function PermissionStatusBadge({ status, permission }) {
  const pill = getPermissionPill(status, permission);
  return <span className={`permission-pill ${pill.className}`.trim()}>{pill.label}</span>;
}

export default PermissionStatusBadge;
