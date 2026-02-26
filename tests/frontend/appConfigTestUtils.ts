export type TestAppConfig = {
  selected_model_id: string;
  model_provider: string;
};

export type TestAvailableModel = {
  id: string;
  provider: string;
  supports_thinking?: boolean;
  supports_thinking_text_stream?: boolean;
};

export type TestAvailableModels = {
  local: TestAvailableModel[];
  online: TestAvailableModel[];
};

const DEFAULT_TEST_APP_CONFIG: TestAppConfig = {
  selected_model_id: 'test-model',
  model_provider: 'test-provider',
};

export function createDefaultTestAppConfig(): TestAppConfig {
  return { ...DEFAULT_TEST_APP_CONFIG };
}

function createDefaultAvailableModels(config: TestAppConfig): TestAvailableModels {
  const isGemini = config.model_provider === 'gemini' && config.selected_model_id.startsWith('gemini-');
  return {
    local: [],
    online: [
      {
        id: config.selected_model_id,
        provider: config.model_provider,
        supports_thinking: isGemini,
        supports_thinking_text_stream: !isGemini,
      },
    ],
  };
}

export function setMockAppConfigContextValue(
  mockUseAppConfigContext: jest.Mock,
  config: TestAppConfig,
  availableModels: TestAvailableModels = createDefaultAvailableModels(config),
) {
  mockUseAppConfigContext.mockReturnValue({ config, availableModels });
}
