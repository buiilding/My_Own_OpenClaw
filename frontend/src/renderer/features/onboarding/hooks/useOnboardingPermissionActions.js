import { useState } from 'react';
import { useAppConfigContext } from '../../../app/providers/AppContextHooks';
import { usePermissionStore } from '../../permissions/stores/permissionStore';
import { applyPermissionGrantEffects } from '../../permissions/utils/permissionGrantEffects';

export function useOnboardingPermissionActions() {
  const isLoading = usePermissionStore((state) => state.isLoading);
  const requestPermission = usePermissionStore((state) => state.requestPermission);
  const { updateConfig } = useAppConfigContext();
  const [pendingPermissionId, setPendingPermissionId] = useState('');

  async function handleGrantPermission(permissionId) {
    if (!permissionId) {
      return null;
    }

    setPendingPermissionId(permissionId);
    try {
      const status = await requestPermission(permissionId);
      applyPermissionGrantEffects({ permissionId, status, updateConfig });
      return status;
    } finally {
      setPendingPermissionId('');
    }
  }

  return {
    isLoading,
    pendingPermissionId,
    handleGrantPermission,
  };
}
