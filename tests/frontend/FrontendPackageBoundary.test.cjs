const fs = require('fs');
const path = require('path');

const packageJsonPath = path.resolve(__dirname, '../../frontend/package.json');
const bundledPythonBuilderPath = path.resolve(
  __dirname,
  '../../frontend/electron-builder.bundled-python.yml',
);

describe('frontend package boundary', () => {
  test('keeps the Electron app package private instead of publishable', () => {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    expect(packageJson.private).toBe(true);
    expect(packageJson.main).toBe('src/main/index.cjs');
    expect(packageJson.devDependencies).toHaveProperty('electron');
    expect(packageJson.dependencies || {}).not.toHaveProperty('electron');
  });

  test('bundled package includes Electron main SDK runtime resources', () => {
    const builderConfig = fs.readFileSync(bundledPythonBuilderPath, 'utf8');

    expect(builderConfig).toContain('from: ../packages/windie-sdk-js/cjs');
    expect(builderConfig).toContain('to: packages/windie-sdk-js/cjs');
    expect(builderConfig).toContain('from: node_modules/ws');
    expect(builderConfig).toContain('to: node_modules/ws');
  });
});
