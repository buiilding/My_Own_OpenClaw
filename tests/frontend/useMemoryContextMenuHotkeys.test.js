import { act, renderHook } from '@testing-library/react';

import { useMemoryContextMenuHotkeys } from '../../frontend/src/renderer/features/dashboard/hooks/useMemoryContextMenuHotkeys';

describe('useMemoryContextMenuHotkeys', () => {
  test('Escape calls onClose when menu exists', () => {
    const onClose = jest.fn();
    const onDelete = jest.fn();

    renderHook(() => useMemoryContextMenuHotkeys({
      menu: { x: 1, y: 1 },
      onClose,
      onDelete,
      deleteTarget: null,
    }));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
  });

  test('Delete calls onDelete with target when menu and target exist', () => {
    const onClose = jest.fn();
    const onDelete = jest.fn();
    const target = { id: 'memory-1' };

    renderHook(() => useMemoryContextMenuHotkeys({
      menu: { x: 2, y: 2 },
      onClose,
      onDelete,
      deleteTarget: target,
    }));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    });

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(target);
    expect(onClose).not.toHaveBeenCalled();
  });

  test('does nothing when menu is missing', () => {
    const onClose = jest.fn();
    const onDelete = jest.fn();

    renderHook(() => useMemoryContextMenuHotkeys({
      menu: null,
      onClose,
      onDelete,
      deleteTarget: { id: 'memory-2' },
    }));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });
});
