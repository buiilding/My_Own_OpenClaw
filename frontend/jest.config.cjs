/**
 * Defines jest.config configuration for the frontend.
 */

const path = require('path');

const babelConfig = path.join(__dirname, 'babel.config.cjs');
const rootDir = path.resolve(__dirname, '..').replace(/\\/g, '/');

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
  modulePathIgnorePatterns: [
    '<rootDir>/frontend/python-runtime',
    '<rootDir>/frontend/release',
  ],
  moduleDirectories: ['node_modules', '<rootDir>/frontend/node_modules'],
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'cjs', 'json'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '\\.(css|less|scss|sass)$': '<rootDir>/tests/frontend/__mocks__/styleMock.js',
  },
  setupFilesAfterEnv: ['<rootDir>/frontend/jest.setup.js'],
};
