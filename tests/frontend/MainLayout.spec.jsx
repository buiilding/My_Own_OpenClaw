import React from 'react';
import { render, screen } from '@testing-library/react';
import MainLayout from '@components/MainLayout';
import '@testing-library/jest-dom';

/**
 * Test suite for the MainLayout component.
 */
describe('MainLayout', () => {
  /**
   * Test case to ensure the component renders chat and settings props correctly.
   */
  test('renders chat and settings content', () => {
    const chatContent = 'Chat content';
    const settingsContent = 'Settings content';
    render(
      <MainLayout
        chat={<div>{chatContent}</div>}
        settings={<div>{settingsContent}</div>}
      />
    );

    // Check that the chat and settings content are rendered
    expect(screen.getByText(chatContent)).toBeInTheDocument();
    expect(screen.getByText(settingsContent)).toBeInTheDocument();
  });
});
