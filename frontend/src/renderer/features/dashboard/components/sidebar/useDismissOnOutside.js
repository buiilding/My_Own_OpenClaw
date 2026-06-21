/**
 * Provides the use dismiss on outside module for the renderer UI.
 */

import { useEffect } from 'react';
import { DesktopDismissOnOutsideRuntime } from '../../../../app/runtime/desktopDismissOnOutsideRuntime';

export function useDismissOnOutside({ isOpen, containerRef, onDismiss }) {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    return DesktopDismissOnOutsideRuntime.subscribeToDismissOnOutside({
      containerRef,
      onDismiss,
    });
  }, [containerRef, isOpen, onDismiss]);
}

