/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'jest-environment-jsdom',
  verbose: true,
  // A list of paths to directories that Jest should use to search for files in
  roots: [
    '<rootDir>/../tests/frontend',
  ],
  // The glob patterns Jest uses to detect test files
  testMatch: [
    '**/__tests__/**/*.?(m)js?(x)',
    '**/?(*.)+(spec|test).?(m)js?(x)',
  ],
};

export default config;
