import { fireEvent, render, screen } from '@testing-library/react';

import UsageSection from '../../frontend/src/renderer/features/dashboard/components/sections/UsageSection';

describe('UsageSection', () => {
  test('left close button calls onClose', () => {
    const onClose = jest.fn();
    render(<UsageSection onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close usage' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

