import { fireEvent, render, screen } from '@testing-library/react';
import MemoryContextMenu from '../../frontend/src/renderer/features/dashboard/components/shared/MemoryContextMenu';

describe('MemoryContextMenu', () => {
  test('renders menu actions and forwards handlers', () => {
    const onDelete = jest.fn();
    const onClose = jest.fn();
    const menu = { x: 100, y: 80, memory: { id: 'm-1' } };

    const { container } = render(
      <MemoryContextMenu
        menu={menu}
        isDeleting={false}
        onDelete={onDelete}
        onClose={onClose}
      />,
    );

    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Delete'));
    expect(onDelete).toHaveBeenCalledWith(menu);

    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();

    const backdrop = container.querySelector('div[aria-hidden="true"]');
    fireEvent.mouseDown(backdrop);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
