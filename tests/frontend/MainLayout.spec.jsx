import React from 'react';
import { render, screen } from '@testing-library/react';
import MainLayout from './MainLayout';
import '@testing-library/jest-dom';

/**
 * Test suite for the MainLayout component.
 */
describe('MainLayout', () => {
  /**
   * Test case to ensure the component renders its children correctly.
   */
  test('renders children inside the main content area', () => {
    const childText = 'This is the main content';
    render(
      <MainLayout>
        <div>{childText}</div>
      </MainLayout>
    );

    // Check that the sidebar header is present
    expect(screen.getByText('Assistant')).toBeInTheDocument();

    // Check that the child content is rendered
    const mainContentElement = screen.getByText(childText);
    expect(mainContentElement).toBeInTheDocument();
  });
});
