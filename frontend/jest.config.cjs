/**
 * Defines jest.config configuration for the frontend.
 */

const path = require('path');

const babelConfig = path.join(__dirname, 'babel.config.cjs');
const rootDir = __dirname.replace(/\\/g, '/');

module.exports = {
  rootDir,
  testEnvironment: 'jsdom',
  testMatch: [
    '**/tests/frontend/**/*.test.js',
    '**/tests/frontend/**/*.test.jsx',
    '**/tests/frontend/**/*.test.ts',
    '**/tests/frontend/**/*.test.tsx',
    '**/tests/frontend/**/*.test.cjs',
  ],
  transform: {
    '^.+\\.[jt]sx?$': ['babel-jest', { configFile: babelConfig }],
  },
  transformIgnorePatterns: ['/node_modules/(?!marked|marked-katex-extension)'],
  testPathIgnorePatterns: [
    '<rootDir>/tests/frontend/BackendSdkWebsocketContract.test.cjs',
    '<rootDir>/tests/frontend/ChatStore.test.ts',
    '<rootDir>/tests/frontend/ChatStreamThinkingStatus.metadata.test.tsx',
    '<rootDir>/tests/frontend/ChatStreamThinkingStatus.state.test.tsx',
    '<rootDir>/tests/frontend/ChatStreamThinkingStatus.transcript.test.tsx',
    '<rootDir>/tests/frontend/CommitterBodyFormat.test.cjs',
    '<rootDir>/tests/frontend/ConversationReplayDatabaseIntegration.test.tsx',
    '<rootDir>/tests/frontend/DesktopConversationRuntimeEventClient.test.ts',
    '<rootDir>/tests/frontend/DesktopMessageSourceTagRuntime.test.js',
    '<rootDir>/tests/frontend/ElectronLauncher.test.cjs',
    '<rootDir>/tests/frontend/ExtensionManifest.test.cjs',
    '<rootDir>/tests/frontend/IpcActiveQueryContext.test.cjs',
    '<rootDir>/tests/frontend/IpcBackendConnectionGateState.test.cjs',
    '<rootDir>/tests/frontend/IpcBackendSessionState.test.cjs',
    '<rootDir>/tests/frontend/IpcInstallAuthState.test.cjs',
    '<rootDir>/tests/frontend/IpcMainConversationRuntimeRegistry.test.cjs',
    '<rootDir>/tests/frontend/IpcMainSdkRuntimeBoundary.test.cjs',
    '<rootDir>/tests/frontend/LayerLogSink.test.cjs',
    '<rootDir>/tests/frontend/McpControl.test.cjs',
    '<rootDir>/tests/frontend/MessageSourceBadge.test.jsx',
    '<rootDir>/tests/frontend/WindieCli.test.cjs',
    '<rootDir>/tests/frontend/WindieCliCapabilityTrace.test.cjs',
    '<rootDir>/tests/frontend/WindieDocsIndex.test.cjs',
    '<rootDir>/tests/frontend/WindieRunLayerLog.test.cjs',
    '<rootDir>/tests/frontend/RendererAppRuntimeBoundary.test.ts',
    '<rootDir>/tests/frontend/RendererChatRuntimeBoundary.test.ts',
    '<rootDir>/tests/frontend/RendererSkinConfigBoundary.test.cjs',
    '<rootDir>/tests/frontend/RuntimePaths.test.cjs',
    '<rootDir>/tests/frontend/WakewordBridge.test.cjs',
    '<rootDir>/tests/frontend/ModularRefactorCompletionBoundary.test.ts',
  ],
  modulePathIgnorePatterns: [
    '<rootDir>/python-runtime',
    '<rootDir>/release',
  ],
  moduleDirectories: ['node_modules', '<rootDir>/node_modules'],
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'cjs', 'json'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '\\.(css|less|scss|sass)$': '<rootDir>/tests/frontend/__mocks__/styleMock.js',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
