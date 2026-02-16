import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import MainLayout from '../../frontend/src/renderer/components/MainLayout';

describe('MainLayout', () => {
  test('does not render an Active status pill for selected section', () => {
    render(
      <MainLayout
        sections={[
          { id: 'chat', label: 'Chat' },
          { id: 'settings', label: 'Settings' },
        ]}
        activeSection="chat"
        onSelectSection={jest.fn()}
        content={<div>content</div>}
      />,
    );

    expect(screen.queryByText('Active')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chat' }).closest('li')).toHaveClass('active');
  });

  test('still switches section when clicking nav buttons', () => {
    const onSelectSection = jest.fn();

    render(
      <MainLayout
        sections={[
          { id: 'chat', label: 'Chat' },
          { id: 'settings', label: 'Settings' },
        ]}
        activeSection="chat"
        onSelectSection={onSelectSection}
        content={<div>content</div>}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(onSelectSection).toHaveBeenCalledWith('settings');
  });
});
