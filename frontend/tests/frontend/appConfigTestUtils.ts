/**
 * Covers app config utils behavior in the frontend test suite.
 */

export type TestAppConfig = {
  selected_model_id: string;
  model_provider: string;
  show_tool_logs?: boolean;
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
  show_tool_logs: false,
};

export function createDefaultTestAppConfig(): TestAppConfig {
  return { ...DEFAULT_TEST_APP_CONFIG };
}

function createDefaultAvailableModels(config: TestAppConfig): TestAvailableModels {
  return {
    local: [],
    online: [
      {
        id: config.selected_model_id,
        provider: config.model_provider,
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
