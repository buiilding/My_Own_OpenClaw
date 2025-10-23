import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import SettingsPanel from '@components/SettingsPanel';

describe('SettingsPanel', () => {
  const mockConfig = {
    active_provider: 'openai',
    preferences: {
      user_name: 'Tester',
    },
    llm_providers: {}, // Not used by the panel directly, but part of the shape
  };

  it('should render a loading state when config is null', () => {
    render(<SettingsPanel config={null} onSave={() => {}} />);
    expect(screen.getByText('Loading settings...')).toBeInTheDocument();
  });

  it('should render the form with initial values from config', () => {
    render(<SettingsPanel config={mockConfig} onSave={() => {}} />);

    // Check if the select and input fields have the correct initial values
    expect(screen.getByLabelText('Active LLM Provider')).toHaveValue('openai');
    expect(screen.getByLabelText('User Name')).toHaveValue('Tester');
  });

  it('should update form values when user interacts with them', () => {
    render(<SettingsPanel config={mockConfig} onSave={() => {}} />);

    const providerSelect = screen.getByLabelText('Active LLM Provider');
    const nameInput = screen.getByLabelText('User Name');

    // Simulate user changing the provider
    fireEvent.change(providerSelect, { target: { value: 'anthropic' } });
    expect(providerSelect).toHaveValue('anthropic');

    // Simulate user typing a new name
    fireEvent.change(nameInput, { target: { value: 'New Name' } });
    expect(nameInput).toHaveValue('New Name');
  });

  it('should call onSave with the updated config when the form is submitted', () => {
    const handleSave = jest.fn();
    render(<SettingsPanel config={mockConfig} onSave={handleSave} />);

    // Change some values
    fireEvent.change(screen.getByLabelText('Active LLM Provider'), {
      target: { value: 'ollama' },
    });
    fireEvent.change(screen.getByLabelText('User Name'), {
      target: { value: 'Updated Name' },
    });

    // Click the save button
    fireEvent.click(screen.getByText('Save Settings'));

    // Check if the onSave function was called
    expect(handleSave).toHaveBeenCalledTimes(1);

    // Check if onSave was called with the correct, updated data
    const expectedConfig = {
      ...mockConfig,
      active_provider: 'ollama',
      preferences: {
        ...mockConfig.preferences,
        user_name: 'Updated Name',
      },
    };
    expect(handleSave).toHaveBeenCalledWith(expectedConfig);
  });
});
