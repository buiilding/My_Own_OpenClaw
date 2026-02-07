const path = require('path');

const babelConfig = path.join(__dirname, 'babel.config.cjs');

module.exports = {
  rootDir: '..',
  testEnvironment: 'jsdom',
  testMatch: [
    '<rootDir>/tests/frontend/**/*.test.js',
    '<rootDir>/tests/frontend/**/*.test.jsx',
    '<rootDir>/tests/frontend/**/*.test.ts',
    '<rootDir>/tests/frontend/**/*.test.tsx',
    '<rootDir>/tests/frontend/**/*.test.cjs',
  ],
  transform: {
    '^.+\\.[jt]sx?$': ['babel-jest', { configFile: babelConfig }],
  },
  transformIgnorePatterns: ['/node_modules/(?!marked)'],
  moduleDirectories: ['node_modules', '<rootDir>/frontend/node_modules'],
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'cjs', 'json'],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': '<rootDir>/tests/frontend/__mocks__/styleMock.js',
  },
  setupFilesAfterEnv: ['<rootDir>/frontend/jest.setup.js'],
};
