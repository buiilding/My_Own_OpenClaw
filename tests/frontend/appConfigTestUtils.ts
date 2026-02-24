export type TestAppConfig = {
  selected_model_id: string;
  model_provider: string;
};

const DEFAULT_TEST_APP_CONFIG: TestAppConfig = {
  selected_model_id: 'test-model',
  model_provider: 'test-provider',
};

export function createDefaultTestAppConfig(): TestAppConfig {
  return { ...DEFAULT_TEST_APP_CONFIG };
}

export function setMockAppConfigContextValue(
  mockUseAppConfigContext: jest.Mock,
  config: TestAppConfig,
) {
  mockUseAppConfigContext.mockReturnValue({ config });
}
