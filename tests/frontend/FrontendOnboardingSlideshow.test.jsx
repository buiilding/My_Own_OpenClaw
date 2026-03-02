import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import FrontendOnboardingSlideshow from '../../frontend/src/renderer/features/onboarding/components/FrontendOnboardingSlideshow';

describe('FrontendOnboardingSlideshow', () => {
  test('renders slide progression and completes onboarding', () => {
    const onComplete = jest.fn();
    render(<FrontendOnboardingSlideshow onComplete={onComplete} stopAgentShortcutLabel="Ctrl + Alt + ." />);

    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Grant access to your computer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Step 2 of 2')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Stop the agent during loops' })).toBeInTheDocument();
    expect(screen.getByText('Ctrl + Alt + .')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start WindieOS' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start WindieOS' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
