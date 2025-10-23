// /project_root/frontend/jest.config.cjs
const path = require('path');

module.exports = {
  // Run Jest from inside 'frontend', but make paths relative to project_root
  rootDir: path.resolve(__dirname, '..'),

  // Tell Jest where to find tests
  testMatch: ['<rootDir>/tests/frontend/**/*.spec.jsx'],

  // Source files still come from frontend/src
  roots: ['<rootDir>/frontend/src', '<rootDir>/tests/frontend'],

  // Ensure React and other modules resolve from frontend/node_modules
  moduleDirectories: [path.resolve(__dirname, 'node_modules'), 'node_modules'],

  // Allow Jest to transform JSX using Babel from frontend config
  transform: {
    '^.+\\.[jt]sx?$': [
      'babel-jest',
      { configFile: path.resolve(__dirname, 'babel.config.cjs') },
    ],
  },

  // Optional: handle absolute imports like "@/components"
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/frontend/src/$1',
    // Handle component imports from tests with a specific alias
    '^@components/(.*)$': '<rootDir>/frontend/src/renderer/components/$1',
    // Mock CSS files
    '\\.css$': '<rootDir>/tests/frontend/__mocks__/styleMock.js',
  },

  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/frontend/jest.setup.js'],
};
