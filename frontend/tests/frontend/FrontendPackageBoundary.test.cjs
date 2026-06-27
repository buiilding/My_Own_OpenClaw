/**
 * Covers frontend package boundary. behavior in the frontend test suite.
 */

const fs = require('fs');
const path = require('path');

const packageJsonPath = path.resolve(__dirname, '../../package.json');
const packageLockPath = path.resolve(__dirname, '../../package-lock.json');
const bundledPythonBuilderPath = path.resolve(
  __dirname,
  '../../electron-builder.bundled-python.yml',
);

describe('frontend package boundary', () => {
  test('keeps the Electron app package private instead of publishable', () => {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    expect(packageJson.private).toBe(true);
    expect(packageJson.main).toBe('src/main/index.cjs');
    expect(packageJson.devDependencies).toHaveProperty('electron');
    expect(packageJson.dependencies || {}).not.toHaveProperty('electron');
  });

  test('keeps Electron pinned to the macOS native menu warning fix', () => {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const packageLock = JSON.parse(fs.readFileSync(packageLockPath, 'utf8'));

    expect(packageJson.devDependencies.electron).toBe('41.2.0');
    expect(packageLock.packages[''].devDependencies.electron).toBe('41.2.0');
    expect(packageLock.packages['node_modules/electron'].version).toBe('41.2.0');
    expect(packageLock.packages['node_modules/electron'].engines.node).toBe('>= 12.20.55');
  });

  test('bundled package includes Electron main SDK runtime resources', () => {
    const builderConfig = fs.readFileSync(bundledPythonBuilderPath, 'utf8');

    expect(builderConfig).toContain('from: ../packages/windie-sdk-js/cjs');
    expect(builderConfig).toContain('to: packages/windie-sdk-js/cjs');
    expect(builderConfig).toContain('from: ../packages/windie-sdk-js/node_modules/ws');
    expect(builderConfig).toContain('to: node_modules/ws');
  });
});
