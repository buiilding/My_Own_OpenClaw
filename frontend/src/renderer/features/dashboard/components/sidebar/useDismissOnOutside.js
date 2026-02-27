import { useEffect } from 'react';

export function useDismissOnOutside({ isOpen, containerRef, onDismiss }) {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        onDismiss();
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onDismiss();
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [containerRef, isOpen, onDismiss]);
}

