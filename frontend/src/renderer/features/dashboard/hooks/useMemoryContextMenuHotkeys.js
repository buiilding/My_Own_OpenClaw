import { useEffect } from 'react';

export function useMemoryContextMenuHotkeys({
  menu,
  onClose,
  onDelete,
  deleteTarget,
}) {
  useEffect(() => {
    if (!menu) {
      return () => undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key === 'Delete' && deleteTarget) {
        onDelete(deleteTarget);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteTarget, menu, onClose, onDelete]);
}
