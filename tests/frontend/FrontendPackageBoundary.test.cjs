const fs = require('fs');
const path = require('path');

const packageJsonPath = path.resolve(__dirname, '../../frontend/package.json');

describe('frontend package boundary', () => {
  test('keeps the Electron app package private instead of publishable', () => {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    expect(packageJson.private).toBe(true);
    expect(packageJson.main).toBe('src/main/index.cjs');
    expect(packageJson.devDependencies).toHaveProperty('electron');
    expect(packageJson.dependencies || {}).not.toHaveProperty('electron');
  });
});
