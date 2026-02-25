import { fireEvent, render, screen } from '@testing-library/react';

import ModelsSection from '../../frontend/src/renderer/features/dashboard/components/sections/ModelsSection';

describe('ModelsSection', () => {
  test('left close button calls onClose', () => {
    const onClose = jest.fn();
    render(
      <ModelsSection
        config={{}}
        availableModels={{ local: [], online: [] }}
        onConfigChange={jest.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close models' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

