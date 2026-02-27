import { fireEvent, render, screen } from '@testing-library/react';

import ModelsSection from '../../frontend/src/renderer/features/dashboard/components/sections/ModelsSection';

describe('ModelsSection', () => {
  const config = {
    model_mode: 'online',
    selected_model_id: 'gpt-5.1',
    model_provider: 'openai',
    interaction_mode: 'agent',
    speech_mode_enabled: false,
    provider_api_keys: {
      openai: { enabled: false, api_key: '' },
      anthropic: { enabled: false, api_key: '' },
      kimi_coding: { enabled: false, api_key: '' },
      google: { enabled: false, api_key: '' },
      openrouter: { enabled: false, api_key: '' },
      mistral: { enabled: false, api_key: '' },
    },
  };

  const availableModels = {
    local: [],
    online: [
      { id: 'gpt-5.1', provider: 'openai' },
      { id: 'gpt-4.1', provider: 'openai' },
      { id: 'claude-3-7-sonnet', provider: 'anthropic' },
    ],
  };

  test('left close button calls onClose', () => {
    const onClose = jest.fn();
    render(
      <ModelsSection
        config={config}
        availableModels={availableModels}
        onConfigChange={jest.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close models' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('shows provider list first and opens provider-specific model list on click', () => {
    render(
      <ModelsSection
        config={config}
        availableModels={availableModels}
        onConfigChange={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Show openai models' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show anthropic models' })).toBeInTheDocument();
    expect(screen.queryByText('gpt-4.1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show openai models' }));

    expect(screen.getByRole('button', { name: /gpt-5\.1/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /gpt-4\.1/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /claude-3-7-sonnet/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to providers' })).toBeInTheDocument();
  });

  test('selecting provider model updates config with selected provider and model', () => {
    const onConfigChange = jest.fn();

    render(
      <ModelsSection
        config={config}
        availableModels={availableModels}
        onConfigChange={onConfigChange}
        onClose={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show anthropic models' }));
    onConfigChange.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /claude-3-7-sonnet/i }));

    expect(onConfigChange).toHaveBeenCalledWith({
      model_mode: 'online',
      selected_model_id: 'claude-3-7-sonnet',
      model_provider: 'anthropic',
      speech_mode_enabled: false,
      interaction_mode: 'agent',
    });
  });

  test('api keys section is collapsible and expands on click', () => {
    render(
      <ModelsSection
        config={config}
        availableModels={availableModels}
        onConfigChange={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'API Keys' })).toBeInTheDocument();
    expect(screen.queryByLabelText('OpenAI API Key')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'API Keys' }));
    expect(screen.getByLabelText('OpenAI API Key')).toBeInTheDocument();
    expect(screen.getByLabelText('Anthropic API Key')).toBeInTheDocument();
    expect(screen.getByLabelText('Kimi Code API Key')).toBeInTheDocument();
    expect(screen.getByLabelText('Google API Key')).toBeInTheDocument();
    expect(screen.getByLabelText('OpenRouter API Key')).toBeInTheDocument();
    expect(screen.getByLabelText('Mistral API Key')).toBeInTheDocument();
  });

  test('api key toggle and input update provider_api_keys config', () => {
    const onConfigChange = jest.fn();
    render(
      <ModelsSection
        config={config}
        availableModels={availableModels}
        onConfigChange={onConfigChange}
        onClose={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'API Keys' }));

    fireEvent.click(screen.getByLabelText('OpenAI API Key toggle'));

    expect(onConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({
        provider_api_keys: expect.objectContaining({
          openai: expect.objectContaining({
            enabled: true,
          }),
        }),
      }),
    );

    const openAiInput = screen.getByLabelText('OpenAI API Key');
    fireEvent.change(openAiInput, { target: { value: 'sk-test-openai' } });

    expect(onConfigChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        provider_api_keys: expect.objectContaining({
          openai: expect.objectContaining({
            api_key: 'sk-test-openai',
          }),
        }),
      }),
    );
  });
});
