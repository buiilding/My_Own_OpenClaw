import React from 'react';
import { render, screen } from '@testing-library/react';
import MainLayout from '@components/MainLayout';
import '@testing-library/jest-dom';

/**
 * Test suite for the MainLayout component.
 */
describe('MainLayout', () => {
  /**
   * Test case to ensure the component renders its children correctly.
   */
  test('renders children inside the main content area', () => {
    const chatContent = 'Chat content';
    const settingsContent = 'Settings content';
    render(
      <MainLayout
        chat={<div>{chatContent}</div>}
        settings={<div>{settingsContent}</div>}
      />
    );

    // Check that the child content is rendered
    expect(screen.getByText(chatContent)).toBeInTheDocument();
    expect(screen.getByText(settingsContent)).toBeInTheDocument();
  });
});
