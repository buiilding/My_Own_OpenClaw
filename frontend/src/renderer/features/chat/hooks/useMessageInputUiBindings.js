/**
 * Provides the use message input ui bindings module for the renderer UI.
 */

import { useEffect, useLayoutEffect } from 'react';
import { DesktopDismissOnOutsideRuntime } from '../../../app/runtime/desktopDismissOnOutsideRuntime';

export function useTextareaAutoResize(inputValue, resizeTextarea) {
  useLayoutEffect(() => {
    resizeTextarea();
  }, [inputValue, resizeTextarea]);
}

export function useDismissPlusMenu(plusMenuRef, setPlusMenuOpen) {
  useEffect(() => {
    return DesktopDismissOnOutsideRuntime.subscribeToDismissOnOutside({
      containerRef: plusMenuRef,
      dismissOnEscape: false,
      onDismiss: () => setPlusMenuOpen(false),
    });
  }, [plusMenuRef, setPlusMenuOpen]);
}

export function useClosePlusMenuOnLoopActive(isLoopActive, setPlusMenuOpen) {
  useEffect(() => {
    if (!isLoopActive) {
      return;
    }
    setPlusMenuOpen(false);
  }, [isLoopActive, setPlusMenuOpen]);
}

export function useComposerFocusRequest({
  focusRequestToken,
  handleFocusRequest,
}) {
  useEffect(() => {
    handleFocusRequest(focusRequestToken);
  }, [focusRequestToken, handleFocusRequest]);
}
