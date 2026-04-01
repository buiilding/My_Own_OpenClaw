import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import ModelsSection from '../../frontend/src/renderer/features/dashboard/components/sections/ModelsSection';
import { IpcBridge, INVOKE_CHANNELS, SEND_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';

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
    provider_oauth: {
      openai_codex: {
        connected: false,
        access_token: '',
        refresh_token: '',
        expires_at: null,
        profile_id: '',
      },
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

  test('oauth login updates provider_oauth config for openai codex', async () => {
    const onConfigChange = jest.fn();
    jest.spyOn(IpcBridge, 'invoke').mockResolvedValue({
      success: true,
      token: {
        access_token: 'codex-access',
        refresh_token: 'codex-refresh',
        expires_at: 12345,
        profile_id: 'openai-codex:default',
      },
    });

    render(
      <ModelsSection
        config={config}
        availableModels={availableModels}
        onConfigChange={onConfigChange}
        onClose={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'OAuth' }));
    fireEvent.click(screen.getByRole('button', { name: 'Login with Codex' }));

    await waitFor(() => {
      expect(IpcBridge.invoke).toHaveBeenCalledWith(INVOKE_CHANNELS.OPENAI_CODEX_OAUTH_LOGIN);
      expect(onConfigChange).toHaveBeenCalledWith(
        expect.objectContaining({
          provider_oauth: expect.objectContaining({
            openai_codex: expect.objectContaining({
              connected: true,
              access_token: 'codex-access',
            }),
          }),
        }),
      );
    });
  });

  test('requests a fresh model catalog when mounted with legacy model payloads', () => {
    window.ipc = {
      send: jest.fn(),
      invoke: jest.fn(),
      on: jest.fn(() => jest.fn()),
      once: jest.fn(),
    };
    jest.spyOn(IpcBridge, 'send').mockImplementation(() => undefined);

    render(
      <ModelsSection
        config={config}
        availableModels={availableModels}
        onConfigChange={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    expect(IpcBridge.send.mock.calls).toEqual([
      [SEND_CHANNELS.TO_BACKEND, { type: 'list-models' }],
    ]);
  });
});
