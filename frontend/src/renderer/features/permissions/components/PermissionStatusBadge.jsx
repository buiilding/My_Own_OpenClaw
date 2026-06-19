/**
 * Provides the permission status badge module for the renderer UI.
 */

import { getPermissionPill } from '../../../app/runtime/desktopPermissionPresentationRuntime';

function PermissionStatusBadge({ status, permission }) {
  const pill = getPermissionPill(status, permission);
  return <span className={`permission-pill ${pill.className}`.trim()}>{pill.label}</span>;
}

export default PermissionStatusBadge;
